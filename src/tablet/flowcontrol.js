// Ported from FluidNC/src/FlowControl.cpp. See GCode.cpp's O-word dispatch:
// once an O-word is seen, the entire rest of the line belongs to flow
// control -- nothing else appears on the same line. There is no streaming
// JobSource here the way there is on the firmware -- simple-interpreter.js
// already has the whole program loaded as an array of lines -- so where
// FlowControl.cpp saves/restores a file position + line number to jump
// back to, this just saves/restores a line index into that array.
//
// FlowControl.cpp guards DO/WHILE/REPEAT/BREAK/CONTINUE with Job::active(),
// since on real hardware flow control is only meaningful while running a
// loaded file/macro, not from the interactive command line. The displayer
// only ever runs a loaded program, so that guard is always true here and
// is omitted.

const FlowOp = {
    NoOp: 0,
    If: 1,
    ElseIf: 2,
    Else: 3,
    EndIf: 4,
    Do: 5,
    Continue: 6,
    Break: 7,
    While: 8,
    EndWhile: 9,
    Repeat: 10,
    EndRepeat: 11,
    Return: 12,
    RaiseAlarm: 13,
    RaiseError: 14,
};

const flowCommands = {
    IF: FlowOp.If,
    ELSEIF: FlowOp.ElseIf,
    ELSE: FlowOp.Else,
    ENDIF: FlowOp.EndIf,
    DO: FlowOp.Do,
    CONTINUE: FlowOp.Continue,
    BREAK: FlowOp.Break,
    WHILE: FlowOp.While,
    ENDWHILE: FlowOp.EndWhile,
    REPEAT: FlowOp.Repeat,
    ENDREPEAT: FlowOp.EndRepeat,
    RETURN: FlowOp.Return,
    ALARM: FlowOp.RaiseAlarm,
    ERROR: FlowOp.RaiseError,
};

let flowContext = [];

// Call at the start of each simulation pass (see displayer.js), matching
// FlowControl.cpp's flowcontrol_init() being called at the start of a job.
const flowcontrol_init = () => {
    flowContext.length = 0;
};

const flowTop = () => flowContext[flowContext.length - 1];

const isSkipping = () => flowContext.length > 0 && flowTop().skip;

// Used by simple-interpreter.js around a $sd/run=/$localfs/run= call: any
// IF/WHILE/etc. a sub-file opened but left unclosed at EOF gets force-
// popped when it returns, the same way FlowControl.cpp's unwind_stack()
// discards a finished file's own stack entries without touching the
// caller's -- a malformed sub-file shouldn't be able to corrupt the
// caller's flow-control state.
const flowcontrol_depth = () => flowContext.length;
const flowcontrol_trim = (depth) => {
    flowContext.length = depth;
};

const flowPush = (oLabel, operation, skip) => {
    flowContext.push({
        oLabel,
        operation,
        skip,
        handled: false,
        brk: false,
        bodyStart: 0,
        repeats: 0,
        expr: '',
    });
};

const flowPop = () => {
    if (flowContext.length === 0) {
        return false;
    }
    flowContext.pop();
    return true;
};

// s.line is already uppercased and whitespace-free by this point (see
// simple-parser.js). Reads the keyword immediately after the O<label>.
const read_flow_command = (s) => {
    const start = s.pos;
    while (/[A-Z]/.test(s.line[s.pos] || '')) {
        s.pos++;
    }
    const key = s.line.slice(start, s.pos);
    return Object.prototype.hasOwnProperty.call(flowCommands, key) ? flowCommands[key] : null;
};

// oLabel: the O<number> label on this line.
// s: LinePos positioned right after the O<number>, at the keyword.
// lineIndex: index of this O-word line in the program's lines array.
// Returns the index of the next line to execute.
const flowcontrol = (oLabel, s, lineIndex) => {
    const skipping = isSkipping();
    const lastOp = flowContext.length > 0 ? flowTop().operation : FlowOp.NoOp;

    const operation = read_flow_command(s);
    if (operation === null) {
        flowcontrol_init();
        return lineIndex + 1;
    }

    let ok = true;

    switch (operation) {
        case FlowOp.If: {
            if (!skipping) {
                const value = expression(s);
                if (isNaN(value)) {
                    ok = false;
                    break;
                }
                flowPush(oLabel, operation, !value);
                flowTop().handled = !!value;
            }
            break;
        }

        case FlowOp.ElseIf: {
            if (lastOp === FlowOp.If || lastOp === FlowOp.ElseIf) {
                if (oLabel === flowTop().oLabel) {
                    flowTop().skip = flowTop().handled;
                    if (!flowTop().handled) {
                        const value = expression(s);
                        if (isNaN(value)) {
                            ok = false;
                            break;
                        }
                        flowTop().skip = !value;
                        if (!flowTop().skip) {
                            flowTop().operation = operation;
                            flowTop().handled = true;
                        }
                    }
                }
            } else if (!skipping) {
                ok = false;
            }
            break;
        }

        case FlowOp.Else: {
            if (lastOp === FlowOp.If || lastOp === FlowOp.ElseIf) {
                if (oLabel === flowTop().oLabel) {
                    flowTop().skip = flowTop().handled;
                    if (!flowTop().skip) {
                        flowTop().operation = operation;
                    }
                }
            } else if (!skipping) {
                ok = false;
            }
            break;
        }

        case FlowOp.EndIf: {
            if (lastOp === FlowOp.If || lastOp === FlowOp.ElseIf || lastOp === FlowOp.Else) {
                if (oLabel === flowTop().oLabel) {
                    flowPop();
                }
            } else if (!skipping) {
                ok = false;
            }
            break;
        }

        case FlowOp.Do: {
            if (!skipping) {
                flowPush(oLabel, operation, false);
                flowTop().bodyStart = lineIndex + 1;
            }
            break;
        }

        case FlowOp.While: {
            if (flowContext.length > 0 && flowTop().brk) {
                if (lastOp === FlowOp.Do && oLabel === flowTop().oLabel) {
                    flowPop();
                }
            } else if (!skipping) {
                const exprStart = s.pos;
                const value = expression(s);
                if (isNaN(value)) {
                    ok = false;
                    break;
                }
                if (lastOp === FlowOp.Do) {
                    // Tail of a DO ... WHILE [cond] (bottom-tested loop)
                    if (oLabel === flowTop().oLabel) {
                        if (value) {
                            return flowTop().bodyStart;
                        }
                        flowPop();
                    }
                } else {
                    // Head of a plain WHILE [cond] ... ENDWHILE (top-tested loop)
                    flowPush(oLabel, operation, !value);
                    flowTop().expr = s.line.slice(exprStart);
                    if (value) {
                        flowTop().bodyStart = lineIndex + 1;
                    }
                }
            }
            break;
        }

        case FlowOp.EndWhile: {
            if (lastOp === FlowOp.While) {
                if (!skipping && oLabel === flowTop().oLabel) {
                    if (!flowTop().skip) {
                        const es = new LinePos(flowTop().expr);
                        const value = expression(es);
                        if (isNaN(value)) {
                            ok = false;
                            break;
                        }
                        flowTop().skip = value === 0;
                        if (!flowTop().skip) {
                            return flowTop().bodyStart;
                        }
                    }
                    if (flowTop().skip) {
                        flowPop();
                    }
                } else if (skipping && oLabel === flowTop().oLabel) {
                    flowPop();
                }
            } else if (!skipping) {
                ok = false;
            }
            break;
        }

        case FlowOp.Repeat: {
            if (!skipping) {
                const value = expression(s);
                if (isNaN(value)) {
                    ok = false;
                    break;
                }
                flowPush(oLabel, operation, !value);
                if (value) {
                    flowTop().bodyStart = lineIndex + 1;
                    flowTop().repeats = Math.trunc(value);
                }
            }
            break;
        }

        case FlowOp.EndRepeat: {
            if (lastOp === FlowOp.Repeat) {
                if (oLabel === flowTop().oLabel) {
                    if (flowTop().repeats && --flowTop().repeats) {
                        return flowTop().bodyStart;
                    }
                    flowPop();
                }
            } else if (!skipping) {
                ok = false;
            }
            break;
        }

        case FlowOp.Break: {
            if (!skipping) {
                while (flowContext.length > 0 && oLabel !== flowTop().oLabel) {
                    flowPop();
                }
                const topOp = flowContext.length > 0 ? flowTop().operation : FlowOp.NoOp;
                if (topOp === FlowOp.Do || topOp === FlowOp.While || topOp === FlowOp.Repeat) {
                    if (oLabel === flowTop().oLabel) {
                        flowTop().repeats = 0;
                        flowTop().brk = flowTop().skip = flowTop().handled = true;
                    }
                } else {
                    ok = false;
                }
            }
            break;
        }

        case FlowOp.Continue: {
            if (!skipping) {
                while (flowContext.length > 0 && oLabel !== flowTop().oLabel) {
                    flowPop();
                }
                if (flowContext.length > 0 && oLabel === flowTop().oLabel) {
                    switch (flowTop().operation) {
                        case FlowOp.Repeat:
                            if (flowTop().repeats && --flowTop().repeats) {
                                return flowTop().bodyStart;
                            }
                            flowPop();
                            break;

                        case FlowOp.Do:
                            return flowTop().bodyStart;

                        case FlowOp.While: {
                            const es = new LinePos(flowTop().expr);
                            const value = expression(es);
                            if (isNaN(value)) {
                                ok = false;
                                break;
                            }
                            flowTop().skip = value === 0;
                            if (!flowTop().skip) {
                                return flowTop().bodyStart;
                            }
                            flowPop();
                            break;
                        }

                        default:
                            ok = false;
                    }
                } else {
                    ok = false;
                }
            }
            break;
        }

        case FlowOp.RaiseAlarm: {
            if (!skipping) {
                const value = expression(s);
                if (isNaN(value)) {
                    ok = false;
                    break;
                }
                console.warn('O' + oLabel + ' ALARM[' + value + ']');
            }
            break;
        }

        case FlowOp.RaiseError: {
            if (!skipping) {
                const value = expression(s);
                if (isNaN(value)) {
                    ok = false;
                    break;
                }
                console.warn('O' + oLabel + ' ERROR[' + value + ']');
            }
            break;
        }

        case FlowOp.Return:
            // Not implemented -- matches FlowControl.cpp's #if 0'd RETURN handling.
            break;

        default:
            ok = false;
    }

    if (!ok) {
        console.warn('Flow control syntax error at line ' + (lineIndex + 1) + ': ' + s.line);
        flowcontrol_init();
    }

    return lineIndex + 1;
};
