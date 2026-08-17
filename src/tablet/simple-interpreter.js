/* eslint no-continue: 0 */
// This file was derived from
// https://github.com/cncjs/gcode-interpreter/blob/master/src/Interpreter.js
// as follows:
// * Removed all of the load* methods, replacing them with a single method
//   loadFromLinesSync().  Since we know that the interpreter will be called
//   twice, first to determine the bounding box (for sizing the canvas) and
//   then to render onto the canvas, the gcode string can be broken into an
//   array of lines once and that array reused for both passes.  This also
//   eliminates the need for a parseStringSync() function in simple-parser;
//   the only necessary function is parseLine().

/**
 * Returns an object composed from arrays of property names and values.
 * @example
 *   fromPairs([['a', 1], ['b', 2]]);
 *   // => { 'a': 1, 'b': 2 }
 */
const fromPairs = (pairs) => {
    let index = -1;
    const length = (!pairs) ? 0 : pairs.length;
    const result = {};

    while (++index < length) {
        const pair = pairs[index];
        result[pair[0]] = pair[1];
    }

    return result;
};

// G/M-codes whose toolpath.js handler actually reads its params (motion
// words, plus G92 and the tool-change M6). Everything else that shows up
// mid-line -- G91, G20, G54, etc. -- is a modal-only setter that takes no
// arguments of its own: a line like "G38.2 G91 F#<fast_rate> Z#<probe_limit>"
// (real syntax -- see FluidNC/src/GCode.cpp, one code per modal group is
// allowed per line, order doesn't matter) must still attach F/Z to G38.2,
// not to G91.
const STARTS_NEW_ARG_GROUP = new Set(['G0', 'G1', 'G2', 'G3', 'G38.2', 'G38.3', 'G38.4', 'G38.5', 'G92']);

const partitionWordsByGroup = (words = []) => {
    const groups = [];
    // Index into `groups` that trailing value-words (X/Y/Z/F/...) attach to.
    // Stays put across a modal-only word so it doesn't steal a motion
    // word's arguments; only a word in STARTS_NEW_ARG_GROUP (or T, which
    // always takes its value directly) moves it.
    let argGroupIndex = -1;

    for (let i = 0; i < words.length; ++i) {
        const word = words[i];
        const letter = word[0];

        if ((letter === 'G') || (letter === 'M') || (letter === 'T')) {
            groups.push([word]);
            if (letter === 'T' || STARTS_NEW_ARG_GROUP.has(letter + word[1])) {
                argGroupIndex = groups.length - 1;
            }
            continue;
        }

        if (argGroupIndex >= 0) {
            groups[argGroupIndex].push(word);
        } else if (groups.length > 0) {
            groups[groups.length - 1].push(word);
        } else {
            groups.push([word]);
        }
    }

    return groups;
};

const interpret = (self, data) => {
    const groups = partitionWordsByGroup(data.words);

    for (let i = 0; i < groups.length; ++i) {
        const words = groups[i];
        const word = words[0] || [];
        const letter = word[0];
        const code = word[1];
        let cmd = '';
        let args = {};

        if (letter === 'G') {
            cmd = (letter + code);
            args = fromPairs(words.slice(1));

            // Motion Mode
            if (code === 0 || code === 1 || code === 2 || code === 3 || code === 38.2 || code === 38.3 || code === 38.4 || code === 38.5) {
                self.motionMode = cmd;
            } else if (code === 80) {
                self.motionMode = '';
            }
        } else if (letter === 'M') {
            cmd = (letter + code);
            args = fromPairs(words.slice(1));
        } else if (letter === 'T') { // T1 ; w/o M6
            cmd = letter;
            args = code;
        } else if (letter === 'F') { // F750 ; w/o motion command
            cmd = letter;
            args = code;
        } else if (letter === 'X' || letter === 'Y' || letter === 'Z' || letter === 'A' || letter === 'B' || letter === 'C' || letter === 'I' || letter === 'J' || letter === 'K' || letter === 'P') {
            // Use previous motion command if the line does not start with G-code or M-code.
            // @example
            //   G0 Z0.25
            //   X-0.5 Y0.
            //   Z0.1
            //   G01 Z0. F5.
            //   G2 X0.5 Y0. I0. J-0.5
            //   X0. Y-0.5 I-0.5 J0.
            //   X-0.5 Y0. I0. J0.5
            // @example
            //   G01
            //   M03 S0
            //   X5.2 Y0.2 M03 S0
            //   X5.3 Y0.1 M03 S1000
            //   X5.4 Y0 M03 S0
            //   X5.5 Y0 M03 S0
            cmd = self.motionMode;
            args = fromPairs(words);
        }

        if (!cmd) {
            continue;
        }

        if (typeof self.handlers[cmd] === 'function') {
            const func = self.handlers[cmd];
            func(args);
        } else if (typeof self.defaultHandler === 'function') {
            self.defaultHandler(cmd, args);
        }

        if (typeof self[cmd] === 'function') {
            const func = self[cmd].bind(self);
            func(args);
        }
    }
};

class Interpreter {
    motionMode = 'G0';
    handlers = {};

    constructor(options) {
        options = options || {};
        this.handlers = options.handlers || {};
        this.defaultHandler = options.defaultHandler;
    }

    loadFromLinesSync = (lines) => {
        // Fresh flow-control stack and parameter state for this pass --
        // displayer.js runs the whole program twice (once to size the
        // canvas, once to draw), each in a brand-new Toolpath/Interpreter,
        // and both need to start from the same clean state as a real job
        // would (see FlowControl.cpp's flowcontrol_init()).
        flowcontrol_init();
        params_init();

        // Depth of flowContext at each PUSH_JOB_SCOPE, so POP_JOB_SCOPE can
        // force-close anything a sub-file left open -- see
        // flowcontrol.js's flowcontrol_depth()/flowcontrol_trim().
        const flowDepthAtPush = [];

        let i = 0;
        while (i < lines.length) {
            const entry = lines[i];
            if (entry === PUSH_JOB_SCOPE) {
                flowDepthAtPush.push(flowcontrol_depth());
                params_push_job_scope();
                i++;
                continue;
            }
            if (entry === POP_JOB_SCOPE) {
                flowcontrol_trim(flowDepthAtPush.pop());
                params_pop_job_scope();
                i++;
                continue;
            }
            const line = entry.trim();
            let next = i + 1;
            if (line.length !== 0) {
                const result = parseLine(line, { lineIndex: i });
                if (typeof result.jump === 'number') {
                    next = result.jump;
                } else {
                    interpret(this, result);
                }
            }
            i = next;
        }
    }
}
