// This file was derived from
//    https://github.com/cncjs/gcode-parser/blob/master/src/index.js
// by extracting just the parseLine() function and using Babel to
// translate that to older Javascript

// http://linuxcnc.org/docs/html/gcode/overview.html#gcode:comments
// Comments can be embedded in a line using parentheses () or for the remainder of a line
// using a semi-colon. The semi-colon is not treated as the start of a comment when enclosed
// in parentheses. Module-scope (not just parseLine's) so subfile.js can apply the same
// normalization when scanning for $sd/run=/$localfs/run= lines.
const stripComments = (line) => {
    const re1 = new RegExp(/\s*\([^\)]*\)/g); // Remove anything inside the parentheses
    const re2 = new RegExp(/\s*;.*/g); // Remove anything after a semi-colon to the end of the line, including preceding spaces
    const re3 = new RegExp(/\s+/g);
    return line.replace(re1, '').replace(re2, '').replace(re3, '');
};

// @param {string} line The G-code line
const parseLine = (() => {
    // http://reprap.org/wiki/G-code#Special_fields
    // The checksum "cs" for a GCode string "cmd" (including its line number) is computed
    // by exor-ing the bytes in the string up to and not including the * character.
    const computeChecksum = (s) => {
        s = s || '';
        if (s.lastIndexOf('*') >= 0) {
            s = s.substr(0, s.lastIndexOf('*'));
        }

        let cs = 0;
        for (let i = 0; i < s.length; ++i) {
            const c = s[i].charCodeAt(0);
            cs ^= c;
        }
        return cs;
    };

    const get_gcode_number = (argument) => {
        return Number(argument);
    }

    return (line, options) => {
        options = options || {};
        options.flatten = !!options.flatten;
        options.noParseLine = !!options.noParseLine;

        const result = {
            line: line,
            words: []
        };

        if (options.noParseLine) {
            return result;
        }

        let ln; // Line number
        let cs; // Checksum
        line = stripComments(line);
        const s = new LinePos(line);

        if (s.line.length && s.line[0] == '$') {
            return result;
        }

        // Canonical casing, matching GCode.cpp's "Step 0 - remove whitespace
        // and comments and convert to upper case" (whitespace/comments are
        // already gone via stripComments() above). Done after the '$' check
        // so command paths like $sd/run=name.nc keep their original,
        // filesystem-significant casing.
        s.line = s.line.toUpperCase();

        // O-word flow control line: the whole line is O<label>KEYWORD[expr],
        // nothing else -- see FluidNC/src/GCode.cpp's O-word dispatch and
        // FlowControl.cpp/flowcontrol.js.
        if (s.line[0] === 'O') {
            s.pos = 1;
            const oLabel = read_float(s);
            if (isNaN(oLabel)) {
                result.err = true;
                return result;
            }
            result.jump = flowcontrol(oLabel, s, options.lineIndex);
            return result;
        }

        if (isSkipping()) {
            // skip_blocks: suppress both '#' assignments and ordinary words,
            // same as GCode.cpp's skip_blocks checks.
            return result;
        }

        // GCode
        for (s.pos = 0; s.pos < s.line.length;) {
            const letter = s.line[s.pos++].toUpperCase();

            if (letter === '#') {
                const status = assign_param(s);
                continue;
            }

            const value = read_number(s, false);
            if (isNaN(value)) {
                console.log("Bad number");
                continue;
            }

            // N: Line number
            if (letter === 'N' && typeof ln === 'undefined') {
                ln = value;
                continue;
            }

            // *: Checksum
            if (letter === '*' && typeof cs === 'undefined') {
                cs = value;
                continue;
            }

            if (options.flatten) {
                result.words.push(letter + value);
            } else {
                result.words.push([letter, value]);
            }
        }

        // Line number
        if (typeof ln !== 'undefined') result.ln = ln;

        // Checksum
        if (typeof cs !== 'undefined') result.cs = cs;
        if (result.cs && computeChecksum(line) !== result.cs) {
            result.err = true; // checksum failed
        }
        perform_assignments();

        return result;
    };
})();
