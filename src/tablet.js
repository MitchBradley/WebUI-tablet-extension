  // From utils.js
  function id(name) {
      return document.getElementById(name);
  }
  function getValue(name, val) {
      return id(name).value;
  }
  function setTextContent(name, val) {
      id(name).textContent = val;
  }
  function setHTML(name, val) {
      id(name).innerHTML = val;
  }
  function setText(name, val) {
      id(name).innerText = val;
  }
  function getText(name) {
      return id(name).innerText;
  }
  function setDisplay(name, val) {
      id(name).style.display = val;
  }
  function displayNone(name) {
      setDisplay(name, 'none');
  }
  function displayBlock(name) {
      setDisplay(name, 'block');
  }
  function selectDisabled(selector, value) {
      document.querySelectorAll(selector).forEach(
          function (element) {
              element.disabled = value;
          }
      )
  }
  // End utils.js

  // From grbl.js
  var interval_status = -1;
  var probe_progress_status = 0;
  var grbl_error_msg = '';
  var WCO = undefined;
  var OVR = { feed: undefined, rapid: undefined, spindle: undefined };
  var MPOS = [0, 0, 0, 0];
  var WPOS = [0, 0, 0, 0];
  var grblaxis = 3;
  var grblzerocmd = 'X0 Y0 Z0';
  var feedrate = [0, 0, 0, 0, 0, 0];
  var last_axis_letter = 'Z';

  var axisNames = ['x', 'y', 'z', 'a', 'b', 'c'];

  var modal = { modes: "", plane: 'G17', units: 'G21', wcs: 'G54', distance: 'G90' };

  function parseGrblStatus(response) {
      var grbl = {
          stateName: '',
          message: '',
          wco: undefined,
          mpos: undefined,
          wpos: undefined,
          feedrate: 0,
          spindle: undefined,
          spindleSpeed: undefined,
          ovr: undefined,
          lineNumber: undefined,
          flood: undefined,
          mist: undefined,
          pins: undefined
      };
      response = response.replace('<','').replace('>','');
      var fields = response.split('|');
      fields.forEach(function(field) {
          var tv = field.split(':');
          var tag = tv[0];
          var value = tv[1];
          switch(tag) {
          case "Door":
              grbl.stateName = tag;
              grbl.message = field;
              break;
          case "Hold":
              grbl.stateName = tag;
              grbl.message = field;
              break;
          case "Run":
          case "Jog":
          case "Idle":
          case "Home":
          case "Alarm":
          case "Check":
          case "Sleep":
              grbl.stateName = tag;
              break;

          case "Ln":
              grbl.lineNumber = parseInt(value);
              break;
          case "MPos":
              grbl.mpos = value.split(',').map( function(v) { return parseFloat(v); } );
              break;
          case "WPos":
              grbl.wpos = value.split(',').map( function(v) { return parseFloat(v); } );
              break;
          case "WCO":
              grbl.wco = value.split(',').map( function(v) { return parseFloat(v); } );
              break;
          case "FS":
              var rates = value.split(',');
              grbl.feedrate = parseFloat(rates[0]);
              grbl.spindleSpeed = parseInt(rates[1]);
              break;
          case "Ov":
              var rates = value.split(',');
              grbl.ovr = {
                  feed: parseInt(rates[0]),
                  rapid: parseInt(rates[1]),
                  spindle: parseInt(rates[2])
              }
              break;
          case "A":
              grbl.spindleDirection = 'M5';
              Array.from(value).forEach(
                  function(v) {
                      switch (v) {
                      case 'S':
                          grbl.spindleDirection = 'M3';
                          break;
                      case 'C':
                          grbl.spindleDirection = 'M4';
                          break;
                      case 'F':
                          grbl.flood = true;
                          break;
                      case 'M':
                          grbl.mist = true;
                          break;
                      }
                  }
              );
              break;
          case "SD":
              var sdinfo = value.split(',');
              grbl.sdPercent = parseFloat(sdinfo[0]);
              grbl.sdName = sdinfo[1];
              break;
          case "Pn":
              // pin status
              grbl.pins = value;
              break;
          default:
              // ignore other fields that might happen to be present
              break;
          }
      });
      return grbl;
  }

  function clickableFromStateName(state, hasSD) {
      var clickable = {
          resume: false,
          pause: false,
          reset: false
      }
      switch(state) {
      case 'Run':
          clickable.pause = true;
          clickable.reset = true;
          break;
      case 'Hold':
          clickable.resume = true;
          clickable.reset = true;
          break;
      case 'Alarm':
          if (hasSD) {
              //guess print is stopped because of alarm so no need to pause
              clickable.resume = true;
          }
          break;
      case 'Idle':
      case 'Jog':
      case 'Home':
      case 'Check':
      case 'Sleep':
          break;
      }
      return clickable;
  }

  function pauseGCode() {
      sendRealtimeCmd(0x21); // '!'
  }

  function resumeGCode() {
      sendRealtimeCmd(0x7e); // '~'
  }

  function stopGCode() {
      sendRealtimeCmd(0x18); // '~'
  }

  function grblProcessStatus(response) {
      var grbl = parseGrblStatus(response);

      // Record persistent values of data
      if (grbl.wco) {
          WCO = grbl.wco;
      }
      if (grbl.ovr) {
          OVR = grbl.ovr;
      }
      if (grbl.mpos) {
          MPOS = grbl.mpos;
          if (WCO) {
              WPOS = grbl.mpos.map( function(v,index) { return v - WCO[index]; } );
          }
      } else if (grbl.wpos) {
          WPOS = grbl.wpos;
          if (WCO) {
              MPOS = grbl.wpos.map( function(v,index) { return v + WCO[index]; } );
          }
      }

      tabletGrblState(grbl, response);
  }

  function grblGetProbeResult(response) {
      var tab1 = response.split(":");
      if (tab1.length > 2) {
          var status = tab1[2].replace("]", "");
          if (parseInt(status.trim()) == 1) {
              if (probe_progress_status != 0) {
                  var cmd = "$J=G90 G21 F1000 Z" + (parseFloat(getValue('probetouchplatethickness')) +                                                       parseFloat(getValue('proberetract')));
                  sendCommand(cmd)
              }
          } else {
              // probe_failed_notification();
          }
      }
  }

  var modalModes = [
      { name: 'motion', values: [ "G80",  "G0",  "G1",  "G2",  "G3",  "G38.1",  "G38.2",  "G38.3",  "G38.4"] },
      { name: 'wcs', values: [ "G54", "G55", "G56", "G57", "G58", "G59"] },
      { name: 'plane', values: [ "G17", "G18", "G19"] },
      { name: 'units', values: [ "G20", "G21"] },
      { name: 'distance', values: [ "G90", "G91"] },
      { name: 'arc_distance', values: [ "G90.1", "G91.1"] },
      { name: 'feed', values: [ "G93", "G94"] },
      { name: 'program', values: [ "M0", "M1", "M2", "M30"] },
      { name: 'spindle', values: [ "M3", "M4", "M5"] },
      { name: 'mist', values: [ "M7"] },  // Also M9, handled separately
      { name: 'flood', values: [ "M8"] }, // Also M9, handled separately
      { name: 'parking', values: [ "M56"] }
  ];

  function grblGetModal(msg) {
      modal.modes = msg.replace("[GC:", '').replace(']', '');
      var modes = modal.modes.split(' ');
      modal.parking = undefined;  // Otherwise there is no way to turn it off
      modal.program = '';  // Otherwise there is no way to turn it off
      modes.forEach(function(mode) {
          if (mode == 'M9') {
              modal.flood = mode;
              modal.mist = mode;
          } else {
              if (mode.charAt(0) === 'T') {
                  modal.tool = mode.substring(1);
              } else if (mode.charAt(0) === 'F') {
                  modal.feedrate = mode.substring(1);
              } else if (mode.charAt(0) === 'S') {
                  modal.spindle = mode.substring(1);
              } else {
                  modalModes.forEach(function(modeType) {
                      modeType.values.forEach(function(s) {
                          if (mode == s) {
                              modal[modeType.name] = mode;
                          }
                      });
                  });
              }
          }
      });
      tabletUpdateModal();
  }

  function grblHandleMessage(msg) {
      tabletShowMessage(msg);

      if (msg.startsWith('<')) {
          grblProcessStatus(msg);
          return;
      }
      if (msg.startsWith('[GC:')) {
          grblGetModal(msg);
          console.log(msg);
          return;
      }

      if (msg.startsWith('[MSG: Files changed]')) {
          files_refreshFiles(files_currentPath);
          return;
      }

      // Handlers for standard Grbl protocol messages

      if (msg.startsWith('ok')) {
          return;
      }
      if (msg.startsWith('[PRB:')) {
          grblGetProbeResult(msg);
          return;
      }
      if (msg.startsWith('[MSG:')) {
          return;
      }
      if (msg.startsWith('error:') || msg.startsWith('ALARM:') || msg.startsWith('Hold:') || msg.startsWith('Door:')) {
          if (probe_progress_status != 0) {
              // probe_failed_notification();
          }
          if (grbl_error_msg.length == 0) {
              grbl_error_msg = msg.trim()
          }
          return;
      }
      if (msg.startsWith('Grbl ')) {
          console.log('Reset detected');
          return;
      }
  }
  // End grbl.js


  var gCodeLoaded = false;
  var gCodeDisplayable = false;

  var snd = null;
  var sndok = true;

  // From toolpath stuff
  // var ToolpathDisplayer = function() { };
  // ToolpathDisplayer.prototype.clear = function() {   };
  // ToolpathDisplayer.prototype.showToolpath = function(gcode, modal, initialPosition) { }
  // ToolpathDisplayer.prototype.reDrawTool = function(modal, dpos) { }
  // ToolpathDisplayer.prototype.setXTravel = function(maxTravelX) { }
  // ToolpathDisplayer.prototype.setYTravel = function(maxTravelY) { }
  // ToolpathDisplayer.prototype.setXHome = function(xHomeInternal) { }
  // ToolpathDisplayer.prototype.setYHome = function(yHomeInternal) { }
  // ToolpathDisplayer.prototype.setXDir = function(xDir) { }
  // ToolpathDisplayer.prototype.setYDir = function(yDir) { }

  // End toolpath stuff
  // From simple-parser.js
// This file was derived from
//    https://github.com/cncjs/gcode-parser/blob/master/src/index.js
// by extracting just the parseLine() function and using Babel to
// translate that to older Javascript

// @param {string} line The G-code line
var parseLine = function () {
    // http://reprap.org/wiki/G-code#Special_fields
    // The checksum "cs" for a GCode string "cmd" (including its line number) is computed
    // by exor-ing the bytes in the string up to and not including the * character.
    var computeChecksum = function computeChecksum(s) {
        s = s || '';
        if (s.lastIndexOf('*') >= 0) {
            s = s.substr(0, s.lastIndexOf('*'));
        }

        var cs = 0;
        for (let i = 0; i < s.length; ++i) {
            const c = s[i].charCodeAt(0);
            cs ^= c;
        }
        return cs;
    };
    // http://linuxcnc.org/docs/html/gcode/overview.html#gcode:comments
    // Comments can be embedded in a line using parentheses () or for the remainder of a lineusing a semi-colon. The semi-colon is not treated as the start of a comment when enclosed in parentheses.
    var stripComments = function () {
        var re1 = new RegExp(/\s*\([^\)]*\)/g); // Remove anything inside the parentheses
        var re2 = new RegExp(/\s*;.*/g); // Remove anything after a semi-colon to the end of the line, including preceding spaces
        var re3 = new RegExp(/\s+/g);
        return function (line) {
            return line.replace(re1, '').replace(re2, '').replace(re3, '');
        };
    }();
    var re = /(%.*)|((?:\$\$)|(?:\$[a-zA-Z0-9#]*))|([a-zA-Z][0-9\+\-\.]*)|(\*[0-9]+)/igm;

    return function (line, options) {
        options = options || {};
        options.flatten = !!options.flatten;
        options.noParseLine = !!options.noParseLine;

        var result = {
            line: line
        };

        if (options.noParseLine) {
            return result;
        }

        result.words = [];

        var ln = void 0; // Line number
        var cs = void 0; // Checksum
        var words = stripComments(line).match(re) || [];

        for (let i = 0; i < words.length; ++i) {
            let word = words[i];
            const letter = word[0].toUpperCase();
            const argument = word.slice(1);

            // Parse % commands for bCNC and CNCjs
            // - %wait Wait until the planner queue is empty
            if (letter === '%') {
                result.cmds = (result.cmds || []).concat(line.trim());
                continue;
            }

            // Parse $ commands for Grbl
            // - $C Check gcode mode
            // - $H Run homing cycle
            if (letter === '$') {
                result.cmds = (result.cmds || []).concat('' + letter + argument);
                continue;
            }

            // N: Line number
            if (letter === 'N' && typeof ln === 'undefined') {
                // Line (block) number in program
                ln = Number(argument);
                continue;
            }

            // *: Checksum
            if (letter === '*' && typeof cs === 'undefined') {
                cs = Number(argument);
                continue;
            }

            var value = Number(argument);
            if (Number.isNaN(value)) {
                value = argument;
            }

            if (options.flatten) {
                result.words.push(letter + value);
            } else {
                result.words.push([letter, value]);
            }
        }

        // Line number
        typeof ln !== 'undefined' && (result.ln = ln);

        // Checksum
        typeof cs !== 'undefined' && (result.cs = cs);
        if (result.cs && computeChecksum(line) !== result.cs) {
            result.err = true; // checksum failed
        }

        return result;
    };
}();
  // End simple-parser.js
  // From simple-interpreter.js
/* eslint no-continue: 0 */
// This file was derived from
// https://github.com/cncjs/gcode-interpreter/blob/master/src/Interpreter.js
// as follows:
// a) Removed the import and export sections, and manually translated from
//    class syntax to prototype syntax, for compatibility with old browsers
// b) Removed all of the load* methods, replacing them with a single method
//    loadFromLinesSync().  Since we know that the interpreter will be called
//    twice, first to determine the bounding box (for sizing the canvas) and
//    then to render onto the canvas, the gcode string can be broken into an
//    array of lines once and that array reused for both passes.  This also
//    eliminates the need for a parseStringSync() function in simple-parser;
//    the only necessary function is parseLine().
// c) Replaced const with var
// d) Replaced arrow functions with real functions
// e) Replaced let with var

/**
 * Returns an object composed from arrays of property names and values.
 * @example
 *   fromPairs([['a', 1], ['b', 2]]);
 *   // => { 'a': 1, 'b': 2 }
 */
var fromPairs = function(pairs) {
    var index = -1;
    var length = (!pairs) ? 0 : pairs.length;
    var result = {};

    while (++index < length) {
        var pair = pairs[index];
        result[pair[0]] = pair[1];
    }

    return result;
};

var partitionWordsByGroup = function(words) {
    var groups = [];

    for (let i = 0; i < words.length; ++i) {
        let word = words[i];
        const letter = word[0];

        if ((letter === 'G') || (letter === 'M') || (letter === 'T')) {
            groups.push([word]);
            continue;
        }

        if (groups.length > 0) {
            groups[groups.length - 1].push(word);
        } else {
            groups.push([word]);
        }
    }

    return groups;
};

var interpret = function(self, data) {
    var groups = partitionWordsByGroup(data.words);

    for (let i = 0; i < groups.length; ++i) {
        let words = groups[i];
        let word = words[0] || [];
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
            var func = self.handlers[cmd];
            func(args);
        }

        if (typeof self[cmd] === 'function') {
            var func = self[cmd].bind(self);
            func(args);
        }
    }
};

function Interpreter(options) {
    this.motionMode = 'G0';
    this.handlers = {};

    options = options || {};
    options.handlers = options.handlers || {};

    this.handlers = options.handlers;
}

Interpreter.prototype.loadFromLinesSync = function(lines) {
    for (let i = 0; i < lines.length; ++i) {
        const line = lines[i].trim();
        if (line.length !== 0) {
	    interpret(this, parseLine(line, {}));
        }
    }
}
  // End simple-interpreter.js

  // From simple-toolpath.js
// This file was translated from
//   https://github.com/cncjs/gcode-toolpath/blob/master/src/Toolpath.js
// by Babel (http://babeljs.io/repl), with preset "stage-2"
// The import and export statements were first removed from Toolpath.js

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _extends = Object.assign || function (target) { for (let i = 1; i < arguments.length; i++) { const source = arguments[i]; for (let key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var _createClass = function () { function defineProperties(target, props) { for (let i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

// from in to mm
function in2mm(inches) {
    return inches * 25.4;
};

// noop
// var noop = function noop() {};

var Toolpath = function () {

    // @param {object} [options]
    // @param {object} [options.position]
    // @param {object} [options.modal]
    // @param {function} [options.addLine]
    // @param {function} [options.addArcCurve]
    function Toolpath(options) {
        var _this = this;

        _classCallCheck(this, Toolpath);

        this.g92offset = {
            x: 0,
            y: 0,
            z: 0
        };
        function offsetG92(pos) {
            return {
                x: pos.x + _this.g92offset.x,
                y: pos.y + _this.g92offset.y,
                z: pos.z + _this.g92offset.z,
            }
        }
        function offsetAddLine(start, end) {
            _this.fn.addLine(_this.modal, offsetG92(start), offsetG92(end));
        }
        function offsetAddArcCurve(start, end, center, extraRotations) {
            _this.fn.addArcCurve(_this.modal, offsetG92(start), offsetG92(end), offsetG92(center), extraRotations);
        }
        this.position = {
            x: 0,
            y: 0,
            z: 0
        };
        this.modal = {
            // Motion Mode
            // G0, G1, G2, G3, G38.2, G38.3, G38.4, G38.5, G80
            motion: 'G0',

            // Coordinate System Select
            // G54, G55, G56, G57, G58, G59
            wcs: 'G54',

            // Plane Select
            // G17: XY-plane, G18: ZX-plane, G19: YZ-plane
            plane: 'G17',

            // Units Mode
            // G20: Inches, G21: Millimeters
            units: 'G21',

            // Distance Mode
            // G90: Absolute, G91: Relative
            distance: 'G90',

            // Arc IJK distance mode
            arc: 'G91.1',

            // Feed Rate Mode
            // G93: Inverse time mode, G94: Units per minute mode, G95: Units per rev mode
            feedrate: 'G94',

            // Cutter Radius Compensation
            cutter: 'G40',

            // Tool Length Offset
            // G43.1, G49
            tlo: 'G49',

            // Program Mode
            // M0, M1, M2, M30
            program: 'M0',

            // Spingle State
            // M3, M4, M5
            spindle: 'M5',

            // Coolant State
            // M7, M8, M9
            coolant: 'M9', // 'M7', 'M8', 'M7,M8', or 'M9'

            // Tool Select
            tool: 0
        };
        this.handlers = {
            // G0: Rapid Linear Move
            'G0': function G0(params) {
                if (_this.modal.motion !== 'G0') {
                    _this.setModal({ motion: 'G0' });
                }

                var v1 = {
                    x: _this.position.x,
                    y: _this.position.y,
                    z: _this.position.z
                };
                var v2 = {
                    x: _this.translateX(params.X),
                    y: _this.translateY(params.Y),
                    z: _this.translateZ(params.Z)
                };
                var targetPosition = { x: v2.x, y: v2.y, z: v2.z };

                offsetAddLine(v1, v2);

                // Update position
                _this.setPosition(targetPosition.x, targetPosition.y, targetPosition.z);
            },
            // G1: Linear Move
            // Usage
            //   G1 Xnnn Ynnn Znnn Ennn Fnnn Snnn
            // Parameters
            //   Xnnn The position to move to on the X axis
            //   Ynnn The position to move to on the Y axis
            //   Znnn The position to move to on the Z axis
            //   Fnnn The feedrate per minute of the move between the starting point and ending point (if supplied)
            //   Snnn Flag to check if an endstop was hit (S1 to check, S0 to ignore, S2 see note, default is S0)
            // Examples
            //   G1 X12 (move to 12mm on the X axis)
            //   G1 F1500 (Set the feedrate to 1500mm/minute)
            //   G1 X90.6 Y13.8 E22.4 (Move to 90.6mm on the X axis and 13.8mm on the Y axis while extruding 22.4mm of material)
            //
            'G1': function G1(params) {
                if (_this.modal.motion !== 'G1') {
                    _this.setModal({ motion: 'G1' });
                }

                var v1 = {
                    x: _this.position.x,
                    y: _this.position.y,
                    z: _this.position.z
                };
                var v2 = {
                    x: _this.translateX(params.X),
                    y: _this.translateY(params.Y),
                    z: _this.translateZ(params.Z)
                };
                var targetPosition = { x: v2.x, y: v2.y, z: v2.z };

                offsetAddLine(v1, v2);

                // Update position
                _this.setPosition(targetPosition.x, targetPosition.y, targetPosition.z);
            },
            // G2 & G3: Controlled Arc Move
            // Usage
            //   G2 Xnnn Ynnn Innn Jnnn Ennn Fnnn (Clockwise Arc)
            //   G3 Xnnn Ynnn Innn Jnnn Ennn Fnnn (Counter-Clockwise Arc)
            // Parameters
            //   Xnnn The position to move to on the X axis
            //   Ynnn The position to move to on the Y axis
            //   Innn The point in X space from the current X position to maintain a constant distance from
            //   Jnnn The point in Y space from the current Y position to maintain a constant distance from
            //   Fnnn The feedrate per minute of the move between the starting point and ending point (if supplied)
            // Examples
            //   G2 X90.6 Y13.8 I5 J10 E22.4 (Move in a Clockwise arc from the current point to point (X=90.6,Y=13.8),
            //   with a center point at (X=current_X+5, Y=current_Y+10), extruding 22.4mm of material between starting and stopping)
            //   G3 X90.6 Y13.8 I5 J10 E22.4 (Move in a Counter-Clockwise arc from the current point to point (X=90.6,Y=13.8),
            //   with a center point at (X=current_X+5, Y=current_Y+10), extruding 22.4mm of material between starting and stopping)
            // Referring
            //   http://linuxcnc.org/docs/2.5/html/gcode/gcode.html#sec:G2-G3-Arc
            //   https://github.com/grbl/grbl/issues/236
            'G2': function G2(params) {
                if (_this.modal.motion !== 'G2') {
                    _this.setModal({ motion: 'G2' });
                }

                let v1 = _this.position;
                let v2 = {
                    x: _this.translateX(params.X),
                    y: _this.translateY(params.Y),
                    z: _this.translateZ(params.Z)
                };
                let v0 = { // fixed point
                    x: _this.translateI(params.I),
                    y: _this.translateJ(params.J),
                    z: _this.translateK(params.K)
                };
                const isClockwise = true;
                const targetPosition = { x: v2.x, y: v2.y, z: v2.z };

                if (_this.isXYPlane()) {
                    const _ref1 = [v1.x, v1.y, v1.z]; // XY-plane
                    v1.x = _ref1[0];
                    v1.y = _ref1[1];
                    v1.z = _ref1[2];
                    const _ref2 = [v2.x, v2.y, v2.z];
                    v2.x = _ref2[0];
                    v2.y = _ref2[1];
                    v2.z = _ref2[2];
                    const _ref0 = [v0.x, v0.y, v0.z];
                    v0.x = _ref0[0];
                    v0.y = _ref0[1];
                    v0.z = _ref0[2];
                } else if (_this.isZXPlane()) {
                    const _ref1 = [v1.z, v1.x, v1.y]; // ZX-plane
                    v1.x = _ref1[0];
                    v1.y = _ref1[1];
                    v1.z = _ref1[2];
                    const _ref2 = [v2.z, v2.x, v2.y];
                    v2.x = _ref2[0];
                    v2.y = _ref2[1];
                    v2.z = _ref2[2];
                    const _ref0 = [v0.z, v0.x, v0.y];
                    v0.x = _ref0[0];
                    v0.y = _ref0[1];
                    v0.z = _ref0[2];
                } else if (_this.isYZPlane()) {
                    const _ref1 = [v1.y, v1.z, v1.x]; // YZ-plane
                    v1.x = _ref1[0];
                    v1.y = _ref1[1];
                    v1.z = _ref1[2];
                    const _ref2 = [v2.y, v2.z, v2.x];
                    v2.x = _ref2[0];
                    v2.y = _ref2[1];
                    v2.z = _ref2[2];
                    const _ref0 = [v0.y, v0.z, v0.x];
                    v0.x = _ref0[0];
                    v0.y = _ref0[1];
                    v0.z = _ref0[2];
                } else {
                    console.error('The plane mode is invalid', _this.modal.plane);
                    return;
                }

                if (params.R) {
                    const radius = _this.translateR(Number(params.R) || 0);
                    const x = v2.x - v1.x;
                    const y = v2.y - v1.y;
                    const distance = Math.hypot(x, y);
                    let height = Math.sqrt(4 * radius * radius - x * x - y * y) / 2;

                    if (isClockwise) {
                        height = -height;
                    }
                    if (radius < 0) {
                        height = -height;
                    }

                    const offsetX = x / 2 - y / distance * height;
                    const offsetY = y / 2 + x / distance * height;

                    v0.x = v1.x + offsetX;
                    v0.y = v1.y + offsetY;
                }

                offsetAddArcCurve(v1, v2, v0, params.P ? params.P : 0);

                // Update position
                _this.setPosition(targetPosition.x, targetPosition.y, targetPosition.z);
            },
            'G3': function G3(params) {
                if (_this.modal.motion !== 'G3') {
                    _this.setModal({ motion: 'G3' });
                }

                const v1 = _this.position;
                const v2 = {
                    x: _this.translateX(params.X),
                    y: _this.translateY(params.Y),
                    z: _this.translateZ(params.Z)
                };
                const v0 = { // fixed point
                    x: _this.translateI(params.I),
                    y: _this.translateJ(params.J),
                    z: _this.translateK(params.K)
                };
                const isClockwise = false;
                const targetPosition = { x: v2.x, y: v2.y, z: v2.z };

                if (_this.isXYPlane()) {
                    const _ref1 = [v1.x, v1.y, v1.z]; // XY-plane

                    v1.x = _ref1[0];
                    v1.y = _ref1[1];
                    v1.z = _ref1[2];
                    const _ref2 = [v2.x, v2.y, v2.z];
                    v2.x = _ref2[0];
                    v2.y = _ref2[1];
                    v2.z = _ref2[2];
                    const _ref0 = [v0.x, v0.y, v0.z];
                    v0.x = _ref0[0];
                    v0.y = _ref0[1];
                    v0.z = _ref0[2];
                } else if (_this.isZXPlane()) {
                    const _ref1 = [v1.z, v1.x, v1.y]; // ZX-plane
                    v1.x = _ref1[0];
                    v1.y = _ref1[1];
                    v1.z = _ref1[2];
                    const _ref2 = [v2.z, v2.x, v2.y];
                    v2.x = _ref2[0];
                    v2.y = _ref2[1];
                    v2.z = _ref2[2];
                    const _ref0 = [v0.z, v0.x, v0.y];
                    v0.x = _ref0[0];
                    v0.y = _ref0[1];
                    v0.z = _ref0[2];
                } else if (_this.isYZPlane()) {
                    const _ref1 = [v1.y, v1.z, v1.x]; // YZ-plane
                    v1.x = _ref1[0];
                    v1.y = _ref1[1];
                    v1.z = _ref1[2];
                    const _ref2 = [v2.y, v2.z, v2.x];
                    v2.x = _ref2[0];
                    v2.y = _ref2[1];
                    v2.z = _ref2[2];
                    const _ref0 = [v0.y, v0.z, v0.x];
                    v0.x = _ref0[0];
                    v0.y = _ref0[1];
                    v0.z = _ref0[2];
                } else {
                    console.error('The plane mode is invalid', _this.modal.plane);
                    return;
                }

                if (params.R) {
                    const radius = _this.translateR(Number(params.R) || 0);
                    const x = v2.x - v1.x;
                    const y = v2.y - v1.y;
                    const distance = Math.hypot(x, y);
                    let height = Math.sqrt(4 * radius * radius - x * x - y * y) / 2;

                    if (isClockwise) {
                        height = -height;
                    }
                    if (radius < 0) {
                        height = -height;
                    }

                    const offsetX = x / 2 - y / distance * height;
                    const offsetY = y / 2 + x / distance * height;

                    v0.x = v1.x + offsetX;
                    v0.y = v1.y + offsetY;
                }

                offsetAddArcCurve(v1, v2, v0, params.P ? params.P : 0);

                // Update position
                _this.setPosition(targetPosition.x, targetPosition.y, targetPosition.z);
            },
            // G4: Dwell
            // Parameters
            //   Pnnn Time to wait, in milliseconds
            // Example
            //   G4 P200
            'G4': function G4(params) {},
            // G10: Coordinate System Data Tool and Work Offset Tables
            'G10': function G10(params) {},
            // G17..19: Plane Selection
            // G17: XY (default)
            'G17': function G17(params) {
                if (_this.modal.plane !== 'G17') {
                    _this.setModal({ plane: 'G17' });
                }
            },
            // G18: XZ
            'G18': function G18(params) {
                if (_this.modal.plane !== 'G18') {
                    _this.setModal({ plane: 'G18' });
                }
            },
            // G19: YZ
            'G19': function G19(params) {
                if (_this.modal.plane !== 'G19') {
                    _this.setModal({ plane: 'G19' });
                }
            },
            // G20: Use inches for length units
            'G20': function G20(params) {
                if (_this.modal.units !== 'G20') {
                    _this.setModal({ units: 'G20' });
                }
            },
            // G21: Use millimeters for length units
            'G21': function G21(params) {
                if (_this.modal.units !== 'G21') {
                    _this.setModal({ units: 'G21' });
                }
            },
            // G38.x: Straight Probe
            // G38.2: Probe toward workpiece, stop on contact, signal error if failure
            'G38.2': function G382(params) {
                if (_this.modal.motion !== 'G38.2') {
                    _this.setModal({ motion: 'G38.2' });
                }
            },
            // G38.3: Probe toward workpiece, stop on contact
            'G38.3': function G383(params) {
                if (_this.modal.motion !== 'G38.3') {
                    _this.setModal({ motion: 'G38.3' });
                }
            },
            // G38.4: Probe away from workpiece, stop on loss of contact, signal error if failure
            'G38.4': function G384(params) {
                if (_this.modal.motion !== 'G38.4') {
                    _this.setModal({ motion: 'G38.4' });
                }
            },
            // G38.5: Probe away from workpiece, stop on loss of contact
            'G38.5': function G385(params) {
                if (_this.modal.motion !== 'G38.5') {
                    _this.setModal({ motion: 'G38.5' });
                }
            },
            // G43.1: Tool Length Offset
            'G43.1': function G431(params) {
                if (_this.modal.tlo !== 'G43.1') {
                    _this.setModal({ tlo: 'G43.1' });
                }
            },
            // G49: No Tool Length Offset
            'G49': function G49() {
                if (_this.modal.tlo !== 'G49') {
                    _this.setModal({ tlo: 'G49' });
                }
            },
            // G54..59: Coordinate System Select
            'G54': function G54() {
                if (_this.modal.wcs !== 'G54') {
                    _this.setModal({ wcs: 'G54' });
                }
            },
            'G55': function G55() {
                if (_this.modal.wcs !== 'G55') {
                    _this.setModal({ wcs: 'G55' });
                }
            },
            'G56': function G56() {
                if (_this.modal.wcs !== 'G56') {
                    _this.setModal({ wcs: 'G56' });
                }
            },
            'G57': function G57() {
                if (_this.modal.wcs !== 'G57') {
                    _this.setModal({ wcs: 'G57' });
                }
            },
            'G58': function G58() {
                if (_this.modal.wcs !== 'G58') {
                    _this.setModal({ wcs: 'G58' });
                }
            },
            'G59': function G59() {
                if (_this.modal.wcs !== 'G59') {
                    _this.setModal({ wcs: 'G59' });
                }
            },
            // G80: Cancel Canned Cycle
            'G80': function G80() {
                if (_this.modal.motion !== 'G80') {
                    _this.setModal({ motion: 'G80' });
                }
            },
            // G90: Set to Absolute Positioning
            // Example
            //   G90
            // All coordinates from now on are absolute relative to the origin of the machine.
            'G90': function G90() {
                if (_this.modal.distance !== 'G90') {
                    _this.setModal({ distance: 'G90' });
                }
            },
            // G91: Set to Relative Positioning
            // Example
            //   G91
            // All coordinates from now on are relative to the last position.
            'G91': function G91() {
                if (_this.modal.distance !== 'G91') {
                    _this.setModal({ distance: 'G91' });
                }
            },
            // G92: Set Position
            // Parameters
            //   This command can be used without any additional parameters.
            //   Xnnn new X axis position
            //   Ynnn new Y axis position
            //   Znnn new Z axis position
            // Example
            //   G92 X10
            // Allows programming of absolute zero point, by reseting the current position to the params specified.
            // This would set the machine's X coordinate to 10. No physical motion will occur.
            // A G92 without coordinates will reset all axes to zero.
            'G92': function G92(params) {
                // A G92 without coordinates will reset all axes to zero.
                if (params.X === undefined && params.Y === undefined && params.Z === undefined) {
                    _this.position.x += _this.g92offset.x;
                    _this.g92offset.x = 0;
                    _this.position.y += _this.g92offset.y;
                    _this.g92offset.y = 0;
                    _this.position.z += _this.g92offset.z;
                    _this.g92offset.z = 0;
                } else {
		    // The calls to translateX/Y/Z() below are necessary for inch/mm conversion
		    // params.X/Y/Z must be interpreted as absolute positions, hence the "false"
                    if (params.X != undefined) {
			var xmm = _this.translateX(params.X, false);
                        _this.g92offset.x += _this.position.x - xmm;
                        _this.position.x = xmm;
                    }
                    if (params.Y != undefined) {
			var ymm = _this.translateY(params.Y, false);
                        _this.g92offset.y += _this.position.y - ymm;
                        _this.position.y = ymm;
                    }
                    if (params.Z != undefined) {
			var zmm = _this.translateX(params.Z, false);
                        _this.g92offset.z += _this.position.z - zmm;
                        _this.position.z = zmm;
                    }
                }
            },
            // G92.1: Cancel G92 offsets
            // Parameters
            //   none
            'G92.1': function G921(params) {
                    _this.position.x += _this.g92offset.x;
                    _this.g92offset.x = 0;
                    _this.position.y += _this.g92offset.y;
                    _this.g92offset.y = 0;
                    _this.position.z += _this.g92offset.z;
                    _this.g92offset.z = 0;
            },
            // G93: Inverse Time Mode
            // In inverse time feed rate mode, an F word means the move should be completed in
            // [one divided by the F number] minutes.
            // For example, if the F number is 2.0, the move should be completed in half a minute.
            'G93': function G93() {
                if (_this.modal.feedmode !== 'G93') {
                    _this.setModal({ feedmode: 'G93' });
                }
            },
            // G94: Units per Minute Mode
            // In units per minute feed rate mode, an F word on the line is interpreted to mean the
            // controlled point should move at a certain number of inches per minute,
            // millimeters per minute or degrees per minute, depending upon what length units
            // are being used and which axis or axes are moving.
            'G94': function G94() {
                if (_this.modal.feedmode !== 'G94') {
                    _this.setModal({ feedmode: 'G94' });
                }
            },
            // G94: Units per Revolution Mode
            // In units per rev feed rate mode, an F word on the line is interpreted to mean the
            // controlled point should move at a certain number of inches per spindle revolution,
            // millimeters per spindle revolution or degrees per spindle revolution, depending upon
            // what length units are being used and which axis or axes are moving.
            'G95': function G95() {
                if (_this.modal.feedmode !== 'G95') {
                    _this.setModal({ feedmode: 'G95' });
                }
            },
            // M0: Program Pause
            'M0': function M0() {
                if (_this.modal.program !== 'M0') {
                    _this.setModal({ program: 'M0' });
                }
            },
            // M1: Program Pause
            'M1': function M1() {
                if (_this.modal.program !== 'M1') {
                    _this.setModal({ program: 'M1' });
                }
            },
            // M2: Program End
            'M2': function M2() {
                if (_this.modal.program !== 'M2') {
                    _this.setModal({ program: 'M2' });
                }
            },
            // M30: Program End
            'M30': function M30() {
                if (_this.modal.program !== 'M30') {
                    _this.setModal({ program: 'M30' });
                }
            },
            // Spindle Control
            // M3: Start the spindle turning clockwise at the currently programmed speed
            'M3': function M3(params) {
                if (_this.modal.spindle !== 'M3') {
                    _this.setModal({ spindle: 'M3' });
                }
            },
            // M4: Start the spindle turning counterclockwise at the currently programmed speed
            'M4': function M4(params) {
                if (_this.modal.spindle !== 'M4') {
                    _this.setModal({ spindle: 'M4' });
                }
            },
            // M5: Stop the spindle from turning
            'M5': function M5() {
                if (_this.modal.spindle !== 'M5') {
                    _this.setModal({ spindle: 'M5' });
                }
            },
            // M6: Tool Change
            'M6': function M6(params) {
                if (params && params.T !== undefined) {
                    _this.setModal({ tool: params.T });
                }
            },
            // Coolant Control
            // M7: Turn mist coolant on
            'M7': function M7() {
                var coolants = _this.modal.coolant.split(',');
                if (coolants.indexOf('M7') >= 0) {
                    return;
                }

                _this.setModal({
                    coolant: coolants.indexOf('M8') >= 0 ? 'M7,M8' : 'M7'
                });
            },
            // M8: Turn flood coolant on
            'M8': function M8() {
                var coolants = _this.modal.coolant.split(',');
                if (coolants.indexOf('M8') >= 0) {
                    return;
                }

                _this.setModal({
                    coolant: coolants.indexOf('M7') >= 0 ? 'M7,M8' : 'M8'
                });
            },
            // M9: Turn all coolant off
            'M9': function M9() {
                if (_this.modal.coolant !== 'M9') {
                    _this.setModal({ coolant: 'M9' });
                }
            },
            'T': function T(tool) {
                if (tool !== undefined) {
                    _this.setModal({ tool: tool });
                }
            }
        };

        var _options = _extends({}, options),
            position = _options.position,
            modal = _options.modal,
            _options$addLine = _options.addLine,
            addLine = _options$addLine === undefined ? null : _options$addLine,
            _options$addArcCurve = _options.addArcCurve,
            addArcCurve = _options$addArcCurve === undefined ? null : _options$addArcCurve;

        // Position


        if (position) {
            var _position = _extends({}, position),
                x = _position.x,
                y = _position.y,
                z = _position.z;

            this.setPosition(x, y, z);
        }
        this.g92offset.x = this.g92offset.y = this.g92offset.z = 0;

        // Modal
        var nextModal = {};
        Object.keys(_extends({}, modal)).forEach(function (key) {
            if (!Object.prototype.hasOwnProperty.call(_this.modal, key)) {
                return;
            }
            nextModal[key] = modal[key];
        });
        this.setModal(nextModal);

        this.fn = { addLine: addLine, addArcCurve: addArcCurve };

        var toolpath = new Interpreter({ handlers: this.handlers });
        toolpath.getPosition = function () {
            return _extends({}, _this.position);
        };
        toolpath.getModal = function () {
            return _extends({}, _this.modal);
        };
        toolpath.setPosition = function () {
            return _this.setPosition.apply(_this, arguments);
        };
        toolpath.setModal = function (modal) {
            return _this.setModal(modal);
        };

        return toolpath;
    }

    _createClass(Toolpath, [{
        key: 'setModal',
        value: function setModal(modal) {
            this.modal = _extends({}, this.modal, modal);
            return this.modal;
        }
    }, {
        key: 'isMetricUnits',
        value: function isMetricUnits() {
            // mm
            return this.modal.units === 'G21';
        }
    }, {
        key: 'isImperialUnits',
        value: function isImperialUnits() {
            // inches
            return this.modal.units === 'G20';
        }
    }, {
        key: 'isAbsoluteDistance',
        value: function isAbsoluteDistance() {
            return this.modal.distance === 'G90';
        }
    }, {
        key: 'isRelativeDistance',
        value: function isRelativeDistance() {
            return this.modal.distance === 'G91';
        }
    }, {
        key: 'isXYPlane',
        value: function isXYPlane() {
            return this.modal.plane === 'G17';
        }
    }, {
        key: 'isZXPlane',
        value: function isZXPlane() {
            return this.modal.plane === 'G18';
        }
    }, {
        key: 'isYZPlane',
        value: function isYZPlane() {
            return this.modal.plane === 'G19';
        }
    }, {
        key: 'setPosition',
        value: function setPosition() {
            const _len = arguments.length
            let pos = Array(_len)
            for (let _key = 0; _key < _len; _key++) {
                pos[_key] = arguments[_key];
            }

            if (_typeof(pos[0]) === 'object') {
                var _pos$ = _extends({}, pos[0]),
                    x = _pos$.x,
                    y = _pos$.y,
                    z = _pos$.z;

                this.position.x = typeof x === 'number' ? x : this.position.x;
                this.position.y = typeof y === 'number' ? y : this.position.y;
                this.position.z = typeof z === 'number' ? z : this.position.z;
            } else {
                var _x = pos[0],
                    _y = pos[1],
                    _z = pos[2];

                this.position.x = typeof _x === 'number' ? _x : this.position.x;
                this.position.y = typeof _y === 'number' ? _y : this.position.y;
                this.position.z = typeof _z === 'number' ? _z : this.position.z;
            }
        }
    }, {
        key: 'translatePosition',
        value: function translatePosition(position, newPosition, relative) {
            if (newPosition == undefined) {
                return position;
            }
            newPosition = this.isImperialUnits() ? in2mm(newPosition) : newPosition;
            newPosition = Number(newPosition);
            if (Number.isNaN(newPosition)) {
                return position;
            }
            return (!!relative) ? position + newPosition : newPosition;
        }
    }, {
        key: 'translateX',
        value: function translateX(x, relative) {
            return this.translatePosition(this.position.x, x, relative);
        }
    }, {
        key: 'translateY',
        value: function translateY(y, relative) {
            return this.translatePosition(this.position.y, y, relative);
        }
    }, {
        key: 'translateZ',
        value: function translateZ(z, relative) {
            return this.translatePosition(this.position.z, z, relative);
        }
    }, {
        key: 'translateI',
        value: function translateI(i) {
            return this.translateX(i, true);
        }
    }, {
        key: 'translateJ',
        value: function translateJ(j) {
            return this.translateY(j, true);
        }
    }, {
        key: 'translateK',
        value: function translateK(k) {
            return this.translateZ(k, true);
        }
    }, {
        key: 'translateR',
        value: function translateR(r) {
            r = Number(r);
            if (Number.isNaN(r)) {
                return 0;
            }
            return this.isImperialUnits() ? in2mm(r) : r;
        }
    }]);

    return Toolpath;
}();
  // End simple-toolpath.js
  // From toolpath-displayer.js
// Display the XY-plane projection of a GCode toolpath on a 2D canvas

var root = window;

var tp
var canvas
  function initDisplayer() {
      canvas = id("toolpath");
      canvas.addEventListener("mouseup", updateGcodeViewerAngle); 

      tp = canvas.getContext("2d", { willReadFrequently: true });
      tp.lineWidth = 0.1;
      tp.lineCap = 'round';
      tp.strokeStyle = 'blue';
  }

var cameraAngle = 0;

var xMaxTravel = 1000;
var yMaxTravel = 1000;

var xHomePos = 0;
var yHomePos = 0;

var xHomeDir = 1;
var yHomeDir = 1;

var tpUnits = 'G21';

var tpBbox = {
    min: {
        x: Infinity,
        y: Infinity
    },
    max: {
        x: -Infinity,
        y: -Infinity
    }
};
var bboxIsSet = false;

var resetBbox = function() {
    tpBbox.min.x = Infinity;
    tpBbox.min.y = Infinity;
    tpBbox.max.x = -Infinity;
    tpBbox.max.y = -Infinity;
    bboxIsSet = false;
}

// Project the 3D toolpath onto the 2D Canvas
// The coefficients determine the type of projection
// Matrix multiplication written out
var xx = 0.707;
var xy = 0.707;
var xz = 0.0;
var yx = -0.707/2;
var yy = 0.707/2;
var yz = 1.0;
var isoView = function() {
    xx = 0.707;
    xy = 0.707;
    xz = 0.0;
    yx = -0.707;
    yy = 0.707;
    yz = 1.0;
}
var obliqueView = function() {
    xx = 0.707;
    xy = 0.707;
    xz = 0.0;
    yx = -0.707/2;
    yy = 0.707/2;
    yz = 1.0;
}
var topView = function() {
    xx = 1.0;
    xy = 0.0;
    xz = 0.0;
    yx = 0.0;
    yy = 1.0;
    yz = 0.0;
}
var projection = function(wpos) {
    return { x: wpos.x * xx + wpos.y * xy + wpos.z * xz,
             y: wpos.x * yx + wpos.y * yy + wpos.z * yz
           }
}

var formatLimit = function(mm) {
    return (tpUnits == 'G20') ? (mm/25.4).toFixed(3)+'"' : mm.toFixed(2)+'mm';
}

var toolX = null;
var toolY = null;
var toolSave = null;
var toolRadius = 6;
var toolRectWH = toolRadius*2 + 4;  // Slop to encompass the entire image area

var drawTool = function(dpos) {
    const pp = projection(dpos)
    toolX = xToPixel(pp.x)-toolRadius-2;
    toolY = yToPixel(pp.y)-toolRadius-2;
    toolSave = tp.getImageData(toolX, toolY, toolRectWH, toolRectWH);

    tp.beginPath();
    tp.strokeStyle = 'magenta';
    tp.fillStyle = 'magenta';
    tp.arc(pp.x, pp.y, toolRadius/scaler, 0, Math.PI*2, true);
    tp.fill();
    tp.stroke();
}

var drawOrigin = function(radius) {
    const po = projection({x: 0.0, y:0.0, z:0.0})
    tp.beginPath();
    tp.strokeStyle = 'red';
    tp.arc(po.x, po.y, radius, 0, Math.PI*2, false);
    tp.moveTo(-radius*1.5, 0);
    tp.lineTo(radius*1.5, 0);
    tp.moveTo(0,-radius*1.5);
    tp.lineTo(0, radius*1.5);
    tp.stroke();
}

var drawMachineBounds = function() {

    const wcoX = MPOS[0] - WPOS[0];
    const wcoY = MPOS[1] - WPOS[1];

    let xMin = 0;
    let yMin = 0;

    if(xHomeDir == 1){
        xMin = xHomePos - xMaxTravel;
    }
    else{
        xMin = xHomePos;
    }

    if(yHomeDir == 1){
        yMin = yHomePos - yMaxTravel;
    }
    else{
        yMin = yHomePos;
    }


    const xMax = xMin + xMaxTravel;
    const yMax = yMin + yMaxTravel;


    const p0 = projection({x: xMin - wcoX, y: yMin - wcoY, z: 0});
    const p1 = projection({x: xMin - wcoX, y: yMax - wcoY, z: 0});
    const p2 = projection({x: xMax - wcoX, y: yMax - wcoY, z: 0});
    const p3 = projection({x: xMax - wcoX, y: yMin - wcoY, z: 0});

    tpBbox.min.x = Math.min(tpBbox.min.x, p0.x);
    tpBbox.min.y = Math.min(tpBbox.min.y, p0.y);
    tpBbox.max.x = Math.max(tpBbox.max.x, p2.x);
    tpBbox.max.y = Math.max(tpBbox.max.y, p2.y);
    bboxIsSet = true;

    tp.beginPath();
    tp.moveTo(p0.x, p0.y);
    tp.lineTo(p0.x, p0.y);
    tp.lineTo(p1.x, p1.y);
    tp.lineTo(p2.x, p2.y);
    tp.lineTo(p3.x, p3.y);
    tp.lineTo(p0.x, p0.y);
    tp.strokeStyle = "green";
    tp.stroke();

}

var xOffset = 0;
var yOffset = 0;
var scaler = 1;
var xToPixel = function(x) { return scaler * x + xOffset; }
var yToPixel = function(y) { return -scaler * y + yOffset; }

var clearCanvas = function() {
    // Reset the transform and clear the canvas
    tp.setTransform(1,0,0,1,0,0);

    var tpRect = canvas.parentNode.getBoundingClientRect();
    canvas.width = tpRect.width ? tpRect.width : 400;
    canvas.height = tpRect.height ? tpRect.height : 400;

    tp.fillStyle = "white";
    tp.fillRect(0, 0, canvas.width, canvas.height);
}

var transformCanvas = function() {
    toolSave = null;

    clearCanvas();

    var inset;
    if (!bboxIsSet) {
        inset = 0;
        scaler = 1;
        xOffset = 0;
        yOffset = 0;
        return;
    }

    var imageWidth = tpBbox.max.x - tpBbox.min.x;
    var imageHeight = tpBbox.max.y - tpBbox.min.y;
    if (imageWidth == 0) {
        imageWidth = 1;
    }
    if (imageHeight == 0) {
        imageHeight = 1;
    }
    var shrink = 0.90;
    inset = 30;
    var scaleX = (canvas.width - inset*2) / imageWidth;
    var scaleY = (canvas.height - inset*2) / imageHeight;
    var minScale = Math.min(scaleX, scaleY);

    scaler = minScale * shrink;
    if (scaler < 0) {
        scaler = -scaler;
    }
    xOffset = inset - tpBbox.min.x * scaler;
    yOffset = (canvas.height-inset) - tpBbox.min.y * (-scaler);

    // Canvas coordinates of image bounding box top and right
    var imageTop = scaler * imageHeight;
    var imageRight = scaler * imageWidth;

    // Show the X and Y limit coordinates of the GCode program.
    // We do this before scaling because after we invert the Y coordinate,
    // text would be displayed upside-down.
    // tp.fillStyle = "black";
    // tp.font = "14px Ariel";
    // tp.textAlign = "center";
    // tp.textBaseline = "bottom";
    // tp.fillText(formatLimit(tpBbox.min.y), imageRight/2, canvas.height-inset);
    // tp.textBaseline = "top";
    // tp.fillText(formatLimit(tpBbox.max.y), imageRight/2, canvas.height-inset - imageTop);
    // tp.textAlign = "left";
    // tp.textBaseline = "center";
    // tp.fillText(formatLimit(tpBbox.min.x), inset, canvas.height-inset - imageTop/2);
    // tp.textAlign = "right";
    // tp.textBaseline = "center";
    // tp.fillText(formatLimit(tpBbox.max.x), inset+imageRight, canvas.height-inset - imageTop/2);
    // Transform the path coordinate system so the image fills the canvas
    // with a small inset, and +Y goes upward.
    // The net transform from image space (x,y) to pixel space (x',y') is:
    //   x' =  scaler*x + xOffset
    //   y' = -scaler*y + yOffset
    // We use setTransform() instead of a sequence of scale() and translate() calls
    // because we need to perform the transform manually for getImageData(), which
    // uses pixel coordinates, and there is no standard way to read back the current
    // transform matrix.

    tp.setTransform(scaler, 0, 0, -scaler, xOffset, yOffset);

    tp.lineWidth = 0.5 / scaler;

    drawOrigin(imageWidth * 0.04);
}
var wrappedDegrees = function(radians) {
    var degrees = radians * 180 / Math.PI;
    return degrees >= 0 ? degrees : degrees + 360;
}

var bboxHandlers = {
    addLine: function(modal, start, end) {
	// Update tpUnits in case it changed in a previous line
        tpUnits = modal.units;

        const ps = projection(start);
        const pe = projection(end);

        tpBbox.min.x = Math.min(tpBbox.min.x, ps.x, pe.x);
        tpBbox.min.y = Math.min(tpBbox.min.y, ps.y, pe.y);
        tpBbox.max.x = Math.max(tpBbox.max.x, ps.x, pe.x);
        tpBbox.max.y = Math.max(tpBbox.max.y, ps.y, pe.y);
        bboxIsSet = true;
    },
    addArcCurve: function(modal, start, end, center, extraRotations) {
        // To determine the precise bounding box of a circular arc we
	// must account for the possibility that the arc crosses one or
	// more axes.  If so, the bounding box includes the "bulges" of
	// the arc across those axes.

	// Update units in case it changed in a previous line
        tpUnits = modal.units;

        if (modal.motion == 'G2') {  // clockwise
            var tmp = start;
            start = end;
            end = tmp;
        }

        const ps = projection(start);
        const pc = projection(center);
        const pe = projection(end);

	// Coordinates relative to the center of the arc
	const sx = ps.x - pc.x;
	const sy = ps.y - pc.y;
	const ex = pe.x - pc.x;
	const ey = pe.y - pc.y;

        const radius = Math.hypot(sx, sy);

	// Axis crossings - plus and minus x and y
	let px = false;
	let py = false;
	let mx = false;
	let my = false;

	// There are ways to express this decision tree in fewer lines
	// of code by converting to alternate representations like angles,
	// but this way is probably the most computationally efficient.
	// It avoids any use of transcendental functions.  Every path
	// through this decision tree is either 4 or 5 simple comparisons.
	if (ey >= 0) {              // End in upper half plane
	    if (ex > 0) {             // End in quadrant 0 - X+ Y+
		if (sy >= 0) {          // Start in upper half plane
		    if (sx > 0) {         // Start in quadrant 0 - X+ Y+
			if (sx <= ex) {     // wraparound
			    px = py = mx = my = true;
			}
		    } else {              // Start in quadrant 1 - X- Y+
			mx = my = px = true;
		    }
		} else {                // Start in lower half plane
		    if (sx > 0) {         // Start in quadrant 3 - X+ Y-
			px = true;
		    } else {              // Start in quadrant 2 - X- Y-
			my = px = true;
		    }
		}
	    } else {                  // End in quadrant 1 - X- Y+
		if (sy >= 0) {          // Start in upper half plane
		    if (sx > 0) {         // Start in quadrant 0 - X+ Y+
			py = true;
		    } else {              // Start in quadrant 1 - X- Y+
			if (sx <= ex) {     // wraparound
			    px = py = mx = my = true;
			}
		    }
		} else {                // Start in lower half plane
		    if (sx > 0) {         // Start in quadrant 3 - X+ Y-
			px = py = true;
		    } else {              // Start in quadrant 2 - X- Y-
			my = px = py = true;
		    }
		}
	    }
	} else {                    // ey < 0 - end in lower half plane
	    if (ex > 0) {             // End in quadrant 3 - X+ Y+
		if (sy >= 0) {          // Start in upper half plane
		    if (sx > 0) {         // Start in quadrant 0 - X+ Y+
			py = mx = my = true;
		    } else {              // Start in quadrant 1 - X- Y+
			mx = my = true;
		    }
		} else {                // Start in lower half plane
		    if (sx > 0) {         // Start in quadrant 3 - X+ Y-
			if (sx >= ex) {      // wraparound
			    px = py = mx = my = true;
			}
		    } else {              // Start in quadrant 2 - X- Y-
			my = true;
		    }
		}
	    } else {                  // End in quadrant 2 - X- Y+
		if (sy >= 0) {          // Start in upper half plane
		    if (sx > 0) {         // Start in quadrant 0 - X+ Y+
			py = mx = true;
		    } else {              // Start in quadrant 1 - X- Y+
			mx = true;
		    }
		} else {                // Start in lower half plane
		    if (sx > 0) {         // Start in quadrant 3 - X+ Y-
			px = py = mx = true;
		    } else {              // Start in quadrant 2 - X- Y-
			if (sx >= ex) {      // wraparound
			    px = py = mx = my = true;
			}
		    }
		}
	    }
	}
	const maxX = px ? pc.x + radius : Math.max(ps.x, pe.x);
	const maxY = py ? pc.y + radius : Math.max(ps.y, pe.y);
	const minX = mx ? pc.x - radius : Math.min(ps.x, pe.x);
	const minY = my ? pc.y - radius : Math.min(ps.y, pe.y);

	const minZ = Math.min(start.z, end.z);
	const maxZ = Math.max(start.z, end.z);

        const p0 = projection({x: minX, y: minY, z: minZ});
        const p1 = projection({x: minX, y: maxY, z: minZ});
        const p2 = projection({x: maxX, y: maxY, z: minZ});
        const p3 = projection({x: maxX, y: minY, z: minZ});
        const p4 = projection({x: minX, y: minY, z: maxZ});
        const p5 = projection({x: minX, y: maxY, z: maxZ});
        const p6 = projection({x: maxX, y: maxY, z: maxZ});
        const p7 = projection({x: maxX, y: minY, z: maxZ});

	tpBbox.min.x = Math.min(tpBbox.min.x, p0.x, p1.x, p2.x, p3.x, p4.x, p5.x, p6.x, p7.x);
	tpBbox.min.y = Math.min(tpBbox.min.y, p0.y, p1.y, p2.y, p3.y, p4.y, p5.y, p6.y, p7.y);
	tpBbox.max.x = Math.max(tpBbox.max.x, p0.x, p1.x, p2.x, p3.x, p4.x, p5.x, p6.x, p7.x);
	tpBbox.max.y = Math.max(tpBbox.max.y, p0.y, p1.y, p2.y, p3.y, p4.y, p5.y, p6.y, p7.y);
        bboxIsSet = true;
    }
};
var initialMoves = true;
var displayHandlers = {
    addLine: function(modal, start, end) {
        var motion = modal.motion;
        if (motion == 'G0') {
            tp.strokeStyle = initialMoves ? 'red' : 'green';
        } else {
            tp.strokeStyle = 'blue';
            // Don't cancel initialMoves on no-motion G1 (e.g. G1 F30)
            // or on Z-only moves
            if (start.x != end.x || start.y != end.y) {
                initialMoves = false;
            }
        }

        const ps = projection(start);
        const pe = projection(end);
        tp.beginPath();
        // tp.moveTo(start.x, start.y);
        // tp.lineTo(end.x, end.y);
        tp.moveTo(ps.x, ps.y);
        tp.lineTo(pe.x, pe.y);
        tp.stroke();
    },
    addArcCurve: function(modal, start, end, center, extraRotations) {
        var motion = modal.motion;

        var deltaX1 = start.x - center.x;
        var deltaY1 = start.y - center.y;
        var radius = Math.hypot(deltaX1, deltaY1);
        var deltaX2 = end.x - center.x;
        var deltaY2 = end.y - center.y;
        var theta1 = Math.atan2(deltaY1, deltaX1);
        var theta2 = Math.atan2(deltaY2, deltaX2);
        var cw = modal.motion == "G2";
        if (!cw && theta2 < theta1) {
            theta2 += Math.PI * 2;
        } else if (cw && theta2 > theta1) {
            theta2 -= Math.PI * 2;
        }
	if (theta1 == theta2) {
	    theta2 += Math.PI * ((cw) ? -2 : 2);
	}
        if (extraRotations > 1) {
            theta2 += (extraRotations-1) * Math.PI * ((cw) ? -2 : 2);;
        }

        initialMoves = false;

        tp.beginPath();
        tp.strokeStyle = 'blue';
        const deltaTheta = theta2 - theta1;
        const n = 10 * Math.ceil(Math.abs(deltaTheta) / Math.PI);
        const dt = (deltaTheta) / n;
        const dz = (end.z - start.z) / n;
        const ps = projection(start);
        tp.moveTo(ps.x, ps.y);
        let next = {};
        let theta = theta1;
        next.z = start.z;
        for (let i = 0; i < n; i++) {
            theta += dt;
            next.x = center.x + radius * Math.cos(theta);
            next.y = center.y + radius * Math.sin(theta);
            next.z += dz;
            const pe = projection(next)
            tp.lineTo(pe.x, pe.y);
        }
        tp.stroke();
    },
};

var ToolpathDisplayer = function() {
};

// var offset;

ToolpathDisplayer.prototype.clear = function() {
    clearCanvas();
}

ToolpathDisplayer.prototype.showToolpath = function(gcode, modal, initialPosition) {
    var drawBounds = false;
    switch (cameraAngle) {
      case 0:
        obliqueView();
        break;
      case 1:
        obliqueView();
        drawBounds = true;
        break;
      case 2:
        topView();
        break;
      case 3:
        topView();
        drawBounds = true;
        break;
      default:
        obliqueView();
    }

    resetBbox();
    bboxHandlers.position = initialPosition;
    bboxHandlers.modal = modal;

    if(drawBounds){
        drawMachineBounds(); //Adds the machine bounds to the bounding box
    }

    var gcodeLines = gcode.split('\n');
    new Toolpath(bboxHandlers).loadFromLinesSync(gcodeLines);
    transformCanvas();
    if (!bboxIsSet) {
        return;
    }
    initialMoves = true;
    displayHandlers.position = initialPosition;
    displayHandlers.modal = modal;
    new Toolpath(displayHandlers).loadFromLinesSync(gcodeLines);

    drawTool(initialPosition);
    if(drawBounds){
        drawMachineBounds();
    }
};

ToolpathDisplayer.prototype.reDrawTool = function(modal, dpos) {
    if (toolSave != null) {
        tp.putImageData(toolSave, toolX, toolY);
        drawTool(dpos);
    }
}

ToolpathDisplayer.prototype.setXTravel = function(maxTravelX) {
    xMaxTravel = maxTravelX;
}
ToolpathDisplayer.prototype.setYTravel = function(maxTravelY) {
    yMaxTravel = maxTravelY;
}

ToolpathDisplayer.prototype.setXHome = function(xHomeInternal) {
    xHomePos = xHomeInternal;
}
ToolpathDisplayer.prototype.setYHome = function(yHomeInternal) {
    yHomePos = yHomeInternal;
}

ToolpathDisplayer.prototype.setXDir = function(xDir) {
    xHomeDir = (xDir == "true") ? 1 : -1;
}
ToolpathDisplayer.prototype.setYDir = function(yDir) {
    yHomeDir =  (yDir == "true") ? 1 : -1;
}

ToolpathDisplayer.prototype.cycleCameraAngle = function(gcode, modal, position) {
    cameraAngle = cameraAngle + 1;
    if(cameraAngle > 3){
        cameraAngle = 0;
    }

    displayer.showToolpath(gcode, modal, position);
}
  function updateGcodeViewerAngle()  {
      const gcode = id('gcode').value;
      displayer.cycleCameraAngle(gcode, modal, arrayToXYZ(WPOS));
  }

  // End toolpath-displayer.js
  var displayer = new ToolpathDisplayer();

  var files_file_list = [] 
  var files_currentPath = '/'

  function sendMessage(msg){ 
      window.parent.postMessage(msg, '*')
  }

  function sendCommand(cmd) {
      console.log(cmd)
      sendMessage({type:'cmd', target:'webui', id:'command', content:cmd})
  }
  function sendRealtimeCmd(code) {
      var cmd = String.fromCharCode(code)
      sendCommand(cmd)
  }


  // XXX this needs to get a setting value from WebUI
  // when there is a way to do that
  function JogFeedrate(axisAndDistance) {
      return axisAndDistance.startsWith('Z') ? 100 : 1000;
  }


  function beep(vol, hz, ms) {
      //      useUiContextFn.haptic()
  }

  function tabletClick() {
      if (window.navigator && window.navigator.vibrate) {
          window.navigator.vibrate(200);
      }
      beep(3, 400, 10);
  }

  function moveTo(location) {
      // Always force G90 mode because synchronization of modal reports is unreliable
      var feedrate = 1000;
      var cmd;
      // For controllers that permit it, specifying mode and move in one block is safer
      cmd = 'G90 G0 ' + location;
      sendCommand(cmd);
  }

  function MDIcmd(value) {
      tabletClick();
      sendCommand(value);
  }

  function MDI(field) {
      MDIcmd(id(field).value);
  }

  function doMDI(event) {
      MDI(event.target.value)  // value refers to the adjacent text entry box
  }

  function inputFocused () {
      isInputFocused = true;
  }

  function inputBlurred () {
      isInputFocused = false;
  }

  function zeroAxis (event) {
      tabletClick();
      setAxisByValue(event.target.value, 0);
  }

  function toggleUnits () {
      tabletClick();
      sendCommand(modal.units == 'G21' ? 'G20' : 'G21');
      // The button label will be fixed by the response to $G
      sendCommand('$G');
  }

  function btnSetDistance (event) {
      tabletClick();
      var distance = event.target.innerText;
      id('jog-distance').value = distance;
  }

  function setDistance (distance) {
      tabletClick();
      id('jog-distance').value = distance;
  }


  function jogTo (axisAndDistance) {
      // Always force G90 mode because synchronization of modal reports is unreliable
      var feedrate = JogFeedrate(axisAndDistance);
      if (modal.units == "G20") {
          feedrate /= 25.4;
          feedrate = feedrate.toFixed(2);
      }

      var cmd;
      cmd = '$J=G91F' + feedrate + axisAndDistance + '\n';
      // tabletShowMessage("JogTo " + cmd);
      sendCommand(cmd);
  }

  function goAxisByValue (axis, coordinate) {
      tabletClick();
      moveTo(axis + coordinate);
  }
  function goto0(event) {
      goAxisByValue(event.target.value, 0)
  }

  function setAxisByValue (axis, coordinate) {
      tabletClick();
      var cmd = 'G10 L20 P0 ' + axis + coordinate;
      sendCommand(cmd);
  }

  function setAxis (axis, field) {
      tabletClick();
      const coordinate = id(field).value;
      const cmd = 'G10 L20 P1 ' + axis + coordinate;
      sendCommand(cmd);
  }
  var timeout_id = 0,
      hold_time = 1000;

  var longone = false;
  function long_jog(target) {
      longone = true;
      var distance = 1000;
      var axisAndDirection = target.value
      var feedrate = JogFeedrate(axisAndDirection);
      if (modal.units == "G20") {
          distance /= 25.4;
          distance = distance.toFixed(3);
          feedrate /= 25.4;
          feedrate = feedrate.toFixed(2);
      }
      const cmd = '$J=G91F' + feedrate + axisAndDirection + distance + '\n';
      // tabletShowMessage("Long Jog " + cmd);
      sendCommand(cmd);
  }

  function sendMove (cmd) {
      tabletClick();
      var jog = function(params) {
          params = params || {};
          var s = '';
          for (let key in params) {
              s += key + params[key]
          }
          jogTo(s);
      };
      var move = function(params) {
          params = params || {};
          var s = '';
          for (let key in params) {
              s += key + params[key];
          }
          moveTo(s);
      };

      var distance = Number(id('jog-distance').value) || 0;

      var fn = {
          'G28': function() {
              sendCommand('G28');
          },
          'G30': function() {
              sendCommand('G30');
          },
          'X0Y0Z0': function() {
              move({ X: 0, Y: 0, Z: 0 })
          },
          'X0': function() {
              move({ X: 0 });
          },
          'Y0': function() {
              move({ Y: 0 });
          },
          'Z0': function() {
              move({ Z: 0 });
          },
          'X-Y+': function() {
              jog({ X: -distance, Y: distance });
          },
          'X+Y+': function() {
              jog({ X: distance, Y: distance });
          },
          'X-Y-': function() {
              jog({ X: -distance, Y: -distance });
          },
          'X+Y-': function() {
              jog({ X: distance, Y: -distance });
          },
          'X-': function() {
              jog({ X: -distance });
          },
          'X+': function() {
              jog({ X: distance });
          },
          'Y-': function() {
              jog({ Y: -distance });
          },
          'Y+': function() {
              jog({ Y: distance });
          },
          'Z-': function() {
              jog({ Z: -distance });
          },
          'Z+': function() {
              jog({ Z: distance });
          }
      }[cmd];

      fn && fn();
  };
  function getItemValue(msg, name) {
      if (msg.startsWith(name)) {
          return msg.substring(name.length, msg.length);
      }
      return '';
  }
  function getAxisValueSuccess(msg) {
      let value = '';
      if (value = getItemValue(msg, '$/axes/x/max_travel_mm=')) {
          displayer.setXTravel(parseFloat(value));
          return;
      }
      if (value = getItemValue(msg, '$/axes/y/max_travel_mm=')) {
          displayer.setYTravel(parseFloat(value));
          return;
      }

      if (value = getItemValue(msg, '$/axes/x/homing/mpos_mm=')) {
          displayer.setXHome(parseFloat(value));
          return;
      }
      if (value = getItemValue(msg, '$/axes/y/homing/mpos_mm=')) {
          displayer.setYHome(parseFloat(value));
          return;
      }

      if (value = getItemValue(msg, '$/axes/x/homing/positive_direction=')) {
          displayer.setXDir(value);
          return;
      }
      if (value = getItemValue(msg, '$/axes/y/homing/positive_direction=')) {
          displayer.setYDir(value);
          return;
      }

  }

  function getAxisValueFailure() {
      console.log("Failed to get axis data");
  }

  function tabletShowMessage(msg) {
      console.log(msg)
      if (msg ==  '' || msg.startsWith('<') || msg.startsWith('ok') || msg.startsWith('\n') || msg.startsWith('\r')) {
          return;
      }
      if (msg.startsWith('error:')) {
          msg = '<span style="color:red;">' + msg + '</span>';
      }
      var messages = id('messages');
      messages.innerHTML += "<br>" + msg;
      messages.scrollTop = messages.scrollHeight;

      getAxisValueSuccess(msg);
  }

  function tabletShowResponse(response) {
      var messages = id('messages');
      messages.value = response;
  }

  function setJogSelector(units) {
      var buttonDistances = [];
      var menuDistances = [];
      var selected = 0;
      if (units == 'G20') {
          // Inches
          buttonDistances = [0.001, 0.01, 0.1, 1, 0.003, 0.03, 0.3, 3, 0.005, 0.05, 0.5, 5];
          menuDistances = [0.00025, 0.0005, 0.001, 0.003, 0.005, 0.01, 0.03, 0.05, 0.1, 0.3, 0.5, 1, 3, 5, 10, 30];
          selected = '1';
      } else  {
          // millimeters
          buttonDistances = [0.1, 1, 10, 100, 0.3, 3, 30, 300, 0.5, 5, 50, 500];
          menuDistances = [0.005, 0.01, 0.03, 0.05, 0.1, 0.3, 0.5, 1, 3, 5, 10, 30, 50, 100, 300, 500, 1000];
          selected = '10';
      }
      var buttonNames = ['jog00', 'jog01', 'jog02', 'jog03', 'jog10', 'jog11', 'jog12', 'jog13', 'jog20', 'jog21', 'jog22', 'jog23'];
      buttonNames.forEach( function(n, i) { id(n).innerHTML = buttonDistances[i]; } );

      var selector = id('jog-distance');
      selector.length = 0;
      selector.innerText = null;
      menuDistances.forEach(function(v) {
          var option = document.createElement("option");
          option.textContent=v;
          option.selected = (v == selected);
          selector.appendChild(option);
      });
  }
  function removeJogDistance(option, oldIndex) {
      var selector = id('jog-distance');
      selector.removeChild(option);
      selector.selectedIndex = oldIndex;
  }
  function addJogDistance(distance) {
      var selector = id('jog-distance');
      var option = document.createElement("option");
      option.textContent=distance;
      option.selected = true;
      return selector.appendChild(option);
  }

  var runTime = 0;

  function setButton(name, isEnabled, color, text) {
      var button = id(name);
      button.disabled = !isEnabled;
      button.style.backgroundColor = color;
      button.innerText = text;
  }

  var leftButtonHandler;
  function setLeftButton(isEnabled, color, text, click) {
      setButton('btn-start', isEnabled, color, text);
      leftButtonHandler = click;
  }
  function doLeftButton(event) {
      if (leftButtonHandler) {
          leftButtonHandler();
      }
  }

  var rightButtonHandler;
  function setRightButton(isEnabled, color, text, click) {
      setButton('btn-pause', isEnabled, color, text);
      rightButtonHandler = click;
  }
  function doRightButton(event) {
      if (rightButtonHandler) {
          rightButtonHandler();
      }
  }

  var green = '#86f686';
  var red = '#f64646';
  var gray = '#f6f6f6';

  function setRunControls() {
      if (gCodeLoaded) {
          // A GCode file is ready to go
          setLeftButton(true, green, 'Start', runGCode);
          setRightButton(false, gray, 'Pause', null);
      } else {
          // Can't start because no GCode to run
          setLeftButton(false, gray, 'Start', null);
          setRightButton(false, gray, 'Pause', null);
      }
  }

  var grblReportingUnits = 0;
  var startTime = 0;

  var spindleDirection = ''
  var spindleSpeed = ''

  function stopAndRecover() {
      stopGCode();
      // To stop GRBL you send a reset character, which causes some modes
      // be reset to their default values.  In particular, it sets G21 mode,
      // which affects the coordinate display and the jog distances.
      requestModes();
  }

  var oldCannotClick = null;

  function tabletUpdateModal() {
      var newUnits = modal.units == 'G21' ? 'mm' : 'Inch';
      if (getText('units') != newUnits) {
          setText('units', newUnits);
          setJogSelector(modal.units);
      }
      setHTML('gcode-states', modal.modes || "GCode State");
      setText('wpos-label', modal.wcs);
      var distanceText = modal.distance == 'G90'
	  ? modal.distance
	  : "<div style='color:red'>" + modal.distance + "</div>";
      setHTML('distance', distanceText);

      var modeText = modal.distance + " " +
          modal.wcs + " " +
          modal.units + " " +
          "T" + modal.tool + " " +
          "F" + modal.feedrate + " " +
          "S" + modal.spindle + " ";

      setHTML('gcode-states', modal.modes || "GCode State");

  }

  function tabletGrblState(grbl, response) {
      // tabletShowResponse(response)
      var stateName = grbl.stateName;

      // Unit conversion factor - depends on both $13 setting and parser units
      var factor = 1.0;

      //  spindleSpeed = grbl.spindleSpeed;
      //  spindleDirection = grbl.spindle;
      //
      //  feedOverride = OVR.feed/100.0;
      //  rapidOverride = OVR.rapid/100.0;
      //  spindleOverride = OVR.spindle/100.0;

      var mmPerInch = 25.4;
      switch (modal.units) {
      case 'G20':
          factor = grblReportingUnits === 0 ? 1/mmPerInch : 1.0 ;
          break;
      case 'G21':
          factor = grblReportingUnits === 0 ? 1.0 : mmPerInch;
          break;
      }

      var cannotClick = stateName == 'Run' || stateName == 'Hold';
      // Recompute the layout only when the state changes
      if (oldCannotClick != cannotClick) {
          selectDisabled('.control-pad .form-control', cannotClick);
          selectDisabled('.control-pad .btn', cannotClick);
          selectDisabled('.dropdown-toggle', cannotClick);
          selectDisabled('.axis-position .position', cannotClick);
          selectDisabled('.axis-position .form-control', cannotClick);
          selectDisabled('.axis-position .btn', cannotClick);
          selectDisabled('.axis-position .position', cannotClick);
          if (!cannotClick) {
              contractVisualizer();
          }
      }
      oldCannotClick = cannotClick;

      tabletUpdateModal();

      switch (stateName) {
      case 'Sleep':
      case 'Alarm':
          setLeftButton(true, gray, 'Start', null);
          setRightButton(false, gray, 'Pause', null);
          break;
      case 'Idle':
          setRunControls();
          break;
      case 'Hold':
          setLeftButton(true, green, 'Resume', resumeGCode);
          setRightButton(true, red, 'Stop', stopAndRecover);
          break;
      case 'Jog':
      case 'Home':
      case 'Run':
          setLeftButton(false, gray, 'Start', null);
          setRightButton(true, red, 'Pause', pauseGCode);
          break;
      case 'Check':
          setLeftButton(true, gray, 'Start', null);
          setRightButton(true, red, 'Stop', stopAndRecover);
          break;
      }

      if (grbl.spindleDirection) {
          switch (grbl.spindleDirection) {
          case 'M3': spindleDirection = 'CW'; break;
          case 'M4': spindleDirection = 'CCW'; break;
          case 'M5': spindleDirection = 'Off'; break;
          default: spindleDirection = '';  break;
          }
      }
      setText('spindle-direction', spindleDirection);

      spindleSpeed = grbl.spindleSpeed ? Number(grbl.spindleSpeed) : '';
      setText('spindle-speed', spindleSpeed);

      var now = new Date();
      setText('time-of-day', now.getHours() + ':' + String(now.getMinutes()).padStart(2, '0'));
      if (stateName == 'Run') {
	  var elapsed = now.getTime() - startTime;
	  if (elapsed < 0)
	      elapsed = 0;
	  var seconds = Math.floor(elapsed / 1000);
	  var minutes = Math.floor(seconds / 60);
	  seconds = seconds % 60;
	  if (seconds < 10)
	      seconds = '0' + seconds;
	  runTime = minutes + ':' + seconds;
      } else {
          startTime = now.getTime();
      }

      setText('runtime', runTime);

      var stateText = "";
      if (stateName == 'Run') {
          var rateNumber = modal.units == 'G21'
	      ? Number(grbl.feedrate).toFixed(0)
	      : Number(grbl.feedrate/25.4).toFixed(2);

	  var rateText = rateNumber +
              (modal.units == 'G21' ? ' mm/min' : ' in/min');

          stateText = rateText + " " + spindleSpeed + " " + spindleDirection;
      } else {
          // var stateText = errorText == 'Error' ? "Error: " + errorMessage : stateName;
          stateText = stateName;
      }
      setText('active-state', stateText);

      if (grbl.lineNumber && (stateName == 'Run' || stateName == 'Hold' || stateName == 'Stop')) {
          setText('line', grbl.lineNumber);
          if (gCodeDisplayable) {
              scrollToLine(grbl.lineNumber);
          }
      }
      if (gCodeDisplayable) {
          displayer.reDrawTool(modal, arrayToXYZ(WPOS));
      }

      var digits = modal.units == 'G20' ? 4 : 2;

      if (WPOS) {
          WPOS.forEach( function(pos, index) {
              setTextContent('wpos-'+axisNames[index], Number(pos*factor).toFixed(index > 2 ? 2 : digits));
          });
      }

      MPOS.forEach( function(pos, index) {
          setTextContent('mpos-'+axisNames[index], Number(pos*factor).toFixed(index > 2 ? 2 : digits));
      });
  }

  function addOption(selector, name, value, isDisabled, isSelected) {
      var opt = document.createElement('option');
      opt.appendChild(document.createTextNode(name));
      opt.disabled = isDisabled;
      opt.selected = isSelected;
      opt.value = value;
      selector.appendChild(opt);
  }

  function toggleVisualizer(event) {
      if (id('mdifiles').hidden) {
          contractVisualizer();
      } else {
          expandVisualizer();
      }
  }

  function contractVisualizer() {
      id('mdifiles').hidden = false;
      id('setAxis').hidden = false;
      id('control-pad').hidden = false;
      setBottomHeight();
  }

  function expandVisualizer() {
      id('mdifiles').hidden = true;
      id('setAxis').hidden = true;
      id('control-pad').hidden = true;
      setBottomHeight();
  }

  var gCodeFilename = '';

  function clearTabletFileSelector(message) {
      var selector = id('filelist');
      selector.length = 0;
      selector.selectedIndex = 0;
      if (message) {
          addOption(selector, message, -3, true, true);
      }
  }

  function populateTabletFileSelector(files, path) {
      var selector = id('filelist');

      var selectedFile = gCodeFilename.split('/').slice(-1)[0];

      clearTabletFileSelector();

      files_file_list = []
      if (!files.length) {
          addOption(selector, "No files found", -3, true, selectedFile == '');
          return;
      }
      var inRoot = path === '/';
      var legend = 'Load GCode File from /SD' + path;
      addOption(selector, legend, -2, true, true);  // A different one might be selected later

      if (!inRoot) {
          addOption(selector, '..', -1, false, false);
      }
      var gCodeFileFound = false;
      files.forEach(function(file, index) {
          if (/*file.isprintable*/1) {
              files_file_list.push(file)
              var found = file.name == selectedFile;
              if (found) {
                  gCodeFileFound = true;
              }
              addOption(selector, file.name, index, false, found);
          }
      });
      if (!gCodeFileFound) {
          gCodeFilename = '';
          gCodeDisplayable = false;
          setHTML('filename', '');
          showGCode('');
      }

      files.forEach(function(file, index) {
          if (file.isdir) {
              addOption(selector, file.name + "/", index, false, false);
          }
      });
  }

  function tabletInit() {
      initDisplayer()
      refreshFiles()
      requestModes();
  }

  function arrayToXYZ(a) {
      return {
          x: a[0],
          y: a[1],
          z: a[2]
      }
  }

  function showGCode(gcode) {
      gCodeLoaded = gcode != '';
      if (!gCodeLoaded) {
          id('gcode').value = "(No GCode loaded)";
          displayer.clear();
      } else {
          id('gcode').value = gcode;
          var initialPosition = {
              x: WPOS[0],
              y: WPOS[1],
              z: WPOS[2]
          };

          if (gCodeDisplayable) {
              displayer.showToolpath(gcode, modal, arrayToXYZ(WPOS));
          }
      }

      // XXX this needs to take into account error states
      setRunControls();
  }

  var machineBboxAsked = false;

  function getAxisValue(name) {
      var url = "/command?plain=" + encodeURIComponent(name);
      sendCommand(name)
  }

  function askMachineBbox() {
      if (machineBboxAsked) {
          return;
      }
      machineBboxAsked = true;
      getAxisValue("$/axes/x/max_travel_mm");
      getAxisValue("$/axes/x/homing/mpos_mm");
      getAxisValue("$/axes/x/homing/positive_direction");

      getAxisValue("$/axes/y/max_travel_mm");
      getAxisValue("$/axes/y/homing/mpos_mm");
      getAxisValue("$/axes/y/homing/positive_direction");
  }

  function nthLineEnd(str, n){
      if (n <= 0)
          return 0;
      var L= str.length, i= -1;
      while(n-- && i++<L){
          i= str.indexOf("\n", i);
          if (i < 0) break;
      }
      return i;
  }

  function scrollToLine(lineNumber) {
      var gCodeLines = id('gcode');
      var lineHeight = parseFloat(getComputedStyle(gCodeLines).getPropertyValue('line-height'));
      var gCodeText = gCodeLines.value;

      gCodeLines.scrollTop = (lineNumber) * lineHeight;

      var start;
      var end;
      if (lineNumber <= 0) {
          start = 0;
          end = 1;
      } else {
          start = (lineNumber == 1) ? 0 : start = nthLineEnd(gCodeText, lineNumber) + 1;
          end = gCodeText.indexOf("\n", start);
      }

      gCodeLines.select();
      gCodeLines.setSelectionRange(start, end);
  }

  function runGCode() {
      gCodeFilename && sendCommand('$sd/run=' + gCodeFilename);
      expandVisualizer();
  }

  function tabletSelectGCodeFile(filename) {
      var selector = id('filelist');
      var options = Array.from(selector.options);
      var option = options.find(item => item.text == filename);
      option.selected = true;
  }
  function tabletLoadGCodeFile(path, size) {
      gCodeFilename = path;
      if ((isNaN(size) && (size.endsWith("MB") || size.endsWith("GB"))) || size > 1000000) {
          setHTML('filename', gCodeFilename + " (too large to show)");
          showGCode("GCode file too large to display (> 1MB)");
          gCodeDisplayable = false;
          displayer.clear();
      } else {
          gCodeDisplayable = true;
          setHTML('filename', gCodeFilename);
          //        files_downloadFile(encodeURIComponent('SD' + gCodeFilename))
          files_downloadFile(gCodeFilename)
      }
  }

  function selectFile(event) {
      tabletClick();
      var filelist = id('filelist');
      var index = Number(filelist.options[filelist.selectedIndex].value);
      if (index === -3) {
          // No files
          return;
      }
      if (index === -2) {
          // Blank entry selected
          return;
      }
      if (index === -1) {
          // Go up
          gCodeFilename = '';
          files_go_levelup();
          return;
      }
      var file = files_file_list[index];
      var filename = file.name;
      if (file.isdir) {
          gCodeFilename = '';
          files_enter_dir(filename);
      } else {
          tabletLoadGCodeFile(files_currentPath + filename, file.size);
      }
  }

  function hideMenu() {
      //  displayNone('tablet-dropdown-menu') 
  }
  function menuReset() { stopAndRecover(); hideMenu(); }
  function menuUnlock() { sendCommand('$X'); hideMenu(); }
  function menuHomeAll() { sendCommand('$H'); hideMenu(); }
  function menuHomeA() { sendCommand('$HA'); hideMenu(); }
  function menuSpindleOff() { sendCommand('M5'); hideMenu(); }

  function requestModes() { sendCommand('$G'); }

  function cycleDistance (up) {
      var sel = id('jog-distance');
      var newIndex = sel.selectedIndex + (up ? 1 : -1);
      if (newIndex >= 0 && newIndex < sel.length) {
          tabletClick();
          sel.selectedIndex = newIndex;
      }
  }
  function clickon (name) {
      //    $('[data-route="workspace"] .btn').removeClass('active');
      var button = id(name);
      button.click();
  }
  var ctrlDown = false;
  var oldIndex = null;;
  var newChild = null;

  function shiftUp() {
      if (!newChild) {
          return;
      }
      removeJogDistance(newChild, oldIndex);
      newChild = null;
  }
  function altUp() {
      if (!newChild) {
          return;
      }
      removeJogDistance(newChild, oldIndex);
      newChild = null;
  }

  function shiftDown() {
      if (newChild) {
          return;
      }
      var sel = id('jog-distance');
      var distance = sel.value;
      oldIndex = sel.selectedIndex;
      newChild = addJogDistance(distance * 10);
  }
  function altDown() {
      if (newChild) {
          return;
      }
      var sel = id('jog-distance');
      var distance = sel.value;
      oldIndex = sel.selectedIndex;
      newChild = addJogDistance(distance / 10);
  }

  function jogClick(name) {
      clickon(name);
  }

  // Reports whether a text input box has focus - see the next comment
  var isInputFocused = false;
  function tabletIsActive() {
      return id('tablettab').style.display !== 'none';
  }
  function handleKeyDown(event) {
      // When we are in a modal input field like the MDI text boxes
      // or the numeric entry boxes, disable keyboard jogging so those
      // keys can be used for text editing.
      if (!tabletIsActive()) {
          return;
      }
      if (isInputFocused) {
          return;
      }
      switch(event.key) {
      case "ArrowRight":
	  jogClick('jog-x-plus');
          event.preventDefault();
	  break;
      case "ArrowLeft":
	  jogClick('jog-x-minus');
          event.preventDefault();
	  break;
      case "ArrowUp":
	  jogClick('jog-y-plus');
          event.preventDefault();
	  break;
      case "ArrowDown":
	  jogClick('jog-y-minus');
          event.preventDefault();
	  break;
      case "PageUp":
	  jogClick('jog-z-plus');
          event.preventDefault();
	  break;
      case "PageDown":
	  jogClick('jog-z-minus');
          event.preventDefault();
	  break;
      case "Escape":
      case "Pause":
	  clickon('btn-pause');
	  break;
      case "Shift":
          shiftDown();
	  break;
      case "Control":
	  ctrlDown = true;
	  break;
      case "Alt":
	  altDown();
	  break;
      case "=": // = is unshifted + on US keyboards
      case "+":
	  cycleDistance(true);
          event.preventDefault();
	  break;
      case '-':
	  cycleDistance(false);
          event.preventDefault();
	  break;
      case 'keydown':
      case 'keyup':
          break
      default:
	  // console.log(event);
          break
      }
  }
  function handleKeyUp(event) {
      if (!tabletIsActive()) {
          return;
      }
      if (isInputFocused) {
          return;
      }
      switch(event.key) {
      case "Shift":
	  shiftUp();
	  break;
      case "Control":
	  ctrlDown = false;
	  break;
      case "Alt":
	  altUp();
	  break;
      }
  }

  function mdiEnterKey(event) {
      if (event.key === 'Enter') {
          MDIcmd(event.target.value);
          event.target.blur();
      }
  }

  // setMessageHeight(), with these helper functions, adjusts the size of the message
  // window to fill the height of the screen.  It would be nice if we could do that
  // solely with CSS, but I did not find a way to do that.  Everything I tried either
  // a) required setting a fixed message window height, or
  // b) the message window would extend past the screen bottom when messages were added
  function height(element) {
      return element.getBoundingClientRect().height;
  }
  function heightId(eid) {
      return height(id(eid))
  }
  function bodyHeight() { return height(document.body); }
  function controlHeight() {
      return heightId('nav-panel') + heightId('axis-position') + heightId('setAxis') + heightId('control-pad');
  }
  function navbarHeight() {
      //return heightId('navbar')
      return 64;
  }
  function setBottomHeight() {
      if (!tabletIsActive()) {
          return;
      }
      var residue = bodyHeight() - navbarHeight() - controlHeight();
      // console.log("Height " + bodyHeight() + " " + navbarHeight() + " " + controlHeight())

      var tStyle = getComputedStyle(id('tablettab'))
      var tPad = parseFloat(tStyle.paddingTop) + parseFloat(tStyle.paddingBottom); 
      tPad += 20;
      var msgElement = id('status');
      msgElement.style.height = (residue - tPad) + 'px';
  }

  function files_go_levelup() {
      var tlist = files_currentPath.split("/");
      var path = "/";
      var nb = 1;
      while (nb < (tlist.length - 2)) {
          path += tlist[nb] + "/";
          nb++;
      }
      files_refreshFiles(path, true);
  }

  function files_enter_dir(name) {
      files_refreshFiles(files_currentPath + name + "/", true);
  }

  function files_downloadFile(name) {
      name = '/SD' + name
      sendMessage({type:'download', target:'webui', id:'tablet', url:name});
  }

  function files_refreshFiles(dir) {
      sendMessage({type:'query', target:'webui', id:'tablet', url:'sdfiles', args:{action:'list', path:dir}});
  }

  function processMessage(eventMsg){
      // console.log(eventMsg)
      if (eventMsg.data.type  && (!eventMsg.data.id||eventMsg.data.id=="tablet")){
          switch (eventMsg.data.type) {
          case "query":
              const con = eventMsg.data.content
              if (con.status=="success"){
                  const fileslist = JSON.parse(con.response);
                  populateTabletFileSelector(fileslist.files, files_currentPath);
              } else {
                  //TBD
              }
              break
          case "stream":
              // console.log("stream " + eventMsg.data.content);
              grblHandleMessage(eventMsg.data.content)
              // tabletShowMessage(eventMsg.data.content);
              break
          case "download":
              const content = eventMsg.data.content
              if (content.status=="success"){
                  var reader = new FileReader();
                  reader.onload = function() {
                      showGCode(reader.result)
                  }
                  reader.readAsText(content.response);
              } else {
              }
              break
          }
      }
  }

  function dro_click(event) {
      console.log("DRO " + event.target.value)
  }

  function refreshFiles(event) {
      files_refreshFiles(files_currentPath)
  }

//  function uploadFile() { }
  function internalUploadFile(){
      const files = id("uploadBtn").files
      if (files.length>0){
          const reader = new FileReader();
          reader.onload = function (e) {
              const pathname = files[0].name;
              sendMessage({type:'upload', target:"webui", id:'tablet', url:"sdfiles", content:e.target.result,size:e.target.result.byteLength, path:"/", filename:pathname});
              id("uploadBtn").value="";
              refreshFiles()
          }
          reader.readAsArrayBuffer(files[0]);
      }
  };
  function uploadFile() {
      id('uploadBtn').click()
  }

  function injectCSS(css) {
      let el = document.createElement('style');
      el.textContent = css;
      document.head.appendChild(el);
      return el;
  };


  function appendContent(el, content) {
      switch (typeof(content)) {
      case 'string':
          el.innerHTML = content;
          break;
      case 'undefined':
          break;
      case 'object':
          if (content.constructor === Array) {
              content.forEach((item) => appendContent(el, item));
          } else {
              el.appendChild(content)
          }
          break;
      default:
          console.log(el)
          break;
      }
  }
  function element(type, id, cssclass, content) {
      var el = document.createElement(type);
      if (id) {
          el.id = id;
      }
      if (cssclass) {
          el.className = cssclass;
      }
      appendContent(el, content)
      return el;
  }
  function input(id, cssclass, inptype, placeholder, onchange, content) {
      var el = element('input', id, cssclass, content)
      el.type = inptype
      if (typeof placeholder != 'undefined') {
          el.placeholder = placeholder
      }      
      if (typeof onchange != 'undefined') {
          el.onchange = onchange
      }      
      // el.focus = inputFocused
      // el.blur = inputBlurred
      return el
  }
  function select(id, cssclass, onchange, content) {
      var el = element('select', id, cssclass, content)
      if (typeof onchange != 'undefined') {
          el.onchange = onchange
      }
      return el
  }
  function option(content) {
      return element('option', '', '', content);
  }
  function div(id, cssclass, content) {
      return element('div', id, cssclass, content)
  }
  function columns(id, extracssclass, content) {
      return div(id, 'cols-tablet ' + extracssclass, content)
  }
  function textarea(id, cssclass, placeholder, content) {
      var el = element('textarea', id, cssclass, content)
      el.placeholder = placeholder
      el.spellcheck = false
      el.readonly = ''
      return el
  }
  
  function button(id, cssclass, content, title, click, value) {
      var el = element('button', id, cssclass, content)
      el.type = 'button'
      if (typeof title != 'undefined') {
          el.title = title
      }
      if (typeof value != 'undefined') {
          el.value = value
      }
      if (typeof click != 'undefined') {
          el.onclick = click
      }
      return el
  }
  function menubutton(id, cssclass, content) {
      var el = button(id, cssclass, content)
      el.tabindex = 0
      return el
  }
  
  function col(width, content) {
      return div('', `col-tablet col-${width}`, content)
  }
  
  const axis_names = ['X', 'Y', 'Z', 'A', 'B', 'C', 'U', 'V', 'W']
  function makeDRO(axis) {
      return col(3,
                 columns(`${axis}-dro`, '', [
                     col(1, div('', 'axis-label', axis.toUpperCase())),
                     //div('', 'col-tablet col-1 axis-label', axis),
                     col(6, button(`wpos-${axis}`, 'btn-tablet position', '0.00', `Modify ${axis} position`, dro_click, axis)),
                     div(`mpos-${axis}`, 'col-tablet col-4 mposition', '0.00')
                 ])
                )       
  }
  function axis_labels(naxes) {
      var elements = []
      for (let i = 0; i < naxes; i++) {
          elements.push(makeDRO(axisNames[i]))
      }
      return columns('axis-position', 'area axis-position', [
          div('wpos-label', 'col-tablet col-1 pos-name', 'WPos'),
          col(11, columns('', '', elements))
      ])
  }
  
  function axis_zero(axis) {
      axis = axis.toUpperCase()

      return col(3,
                 columns('', '', [
                     col(4, button('', 'btn-tablet btn-zero', `${axis}=0`, `Set ${axis} to 0`, zeroAxis, axis)),
                     col(1, " "),
                     col(4, button('', 'btn-tablet btn-goto', `→${axis}0`, `Goto 0 in ${axis}`, goto0, axis))
                 ])
                )
  }
  function axis_zeroing(naxes) {
      var elements = []
      for (let i = 0; i < naxes; i++) {
          elements.push(axis_zero(axisNames[i]))
      }
      return div('setAxis', 'area2 axis-position',
                 columns('', '', [
                     col(1, button('units', 'btn-tablet btn-units', 'mm', toggleUnits)),
                     col(11, columns('', '', elements))
                 ])
                )
  }
  function jog_distance(name, amount) {
      return div('', 'col-tablet col-1',
                 button(name, 'btn-tablet set-distance', amount, `Jog by ${amount}`, btnSetDistance, amount)
                )
  }
  
  function jog_control(name, label) {
      return col(2, button(name, 'btn-tablet jog', label, `Move ${label}`, null, label))
  }
  
  function mi(text, theclick) {
      // var anchor = element('div', '', '', text)
      // anchor.href = 'javascript:void(0)'
      var anchor = element('div', '', '', text)
      anchor.onclick = theclick
      anchor.role = 'menuitem'
      return element('li', '', '', anchor)
  }                   

  function loadApp() {
//      injectCSS('.cols-tablet { width: 100%; display:flex; flex-wrap: nowrap; }')
//      injectCSS('[class~=col-], .col-tablet { width: 100%; padding-left: 0.2rem; }')
//      injectCSS('.disabled { cursor: not-allowed; }')
//      injectCSS('.btn-tablet:hover { background: #e0e0e0 }')
//      injectCSS('.btn-tablet:active { background: #d0f0d0 }')
//      injectCSS('.btn-tablet:disabled { background: #f0f0f0; color: black; }')
//      injectCSS('.btn-tablet { width: 100%; margin: 0.1rem; background: white; border: 0.05rem solid #5755d9; border-radius: 0.3rem; cursor: pointer; display:inline-block; font-size:1.3rem; height: 2.4rem; line-height: 1.2rem; outline: none; padding: 0.25rem 0.4rem; text-align: center; }')
//      injectCSS('#tablettab { height: 100%; padding: 5px; font-size: 1.1rem; text-align: center; vertical-align: middle; }')
//      // injectCSS('.tablettab { height: 100%;padding-top: 5px;padding-left: 5px;padding-bottom: 5px; }')
//      injectCSS('.messages { width: 100%; height: 45%; max-height: 100%; overflow-x: auto; overflow-y: scroll; padding: 2px; border-style: solid; border-width: 1px; border-radius: 5px; border-color: rgb(118, 118, 118); text-align:left; font-size: 1.0rem; }')
//      injectCSS('#messages { background-color: lightyellow;}')
//      injectCSS('#gcode-states { background-color: azure;height: fit-content; overflow-x: auto; overflow-y: hidden; text-align:left; }')
//      injectCSS('#gcode { background-color: lavenderblush;width: 100%;}')
//      injectCSS('.axis-label { font-size: 1.6rem; }')
//      injectCSS('#axis-position { background-color: azure; overflow: hidden; text-align: center; }')
//      injectCSS('.area { padding-top: 12px;  padding-bottom: 8px; padding-right: 8px; }')
//      injectCSS('.area2 { padding-bottom: 8px; padding-right: 8px; }')
//      injectCSS('#mdifiles { background-color: lavenderblush; }')
//      injectCSS('#setAxis { background-color: azure;  }')
//      injectCSS('#control-pad { background-color: lightyellow; }')
//      injectCSS('.mdi-entry { width:100%; height:100%; border-radius: 0.4rem; border-width: 1px; }')
//      injectCSS('.mposition { padding-top: 0.2rem; font-size: 1.4rem; color: #606060; }')
//      injectCSS('.info-button { padding-top: 0.1rem; font-size: 1.4rem; }')
//      injectCSS('.pos-name { font-size: 1.7rem; }')
//      injectCSS('#jog-distance { padding-top: 0; }')
//      injectCSS('.btn-lg { width:100%; border-width: 1px; border-radius: 5px; }')
//      injectCSS('#nav-panel { padding-top: 0.2rem; font-size: 1.6rem; }')
//      injectCSS('#expand-button {  position:absolute;  top:0;  right:0;  z-index:1;  width:2rem;  height:2rem;  margin: 5px;}')
//
//      injectCSS('#messagepane { height: 100%; }')
//      injectCSS('#previewpane { position: relative; }')
//      injectCSS('#toolpath { height:100%; width:100%; z-index:0; border: 0.05rem solid #5755d9; border-radius: 0.3rem; }')
      // injectCSS('#filename { position:absolute; top:0; left:0; z-index:1; height:4rem; margin: 5px; }')

      const app =
            div('tablettab', 'tabcontent tablettab', [
                div('nav-panel', 'container nav-panel',
                    columns('', '', [
                        div('time-of-day', 'col-tablet col-1 info-button', "4:30"),
                        div('active-state', 'col-tablet col-4 active-state', "Idle"),
                        col(2, button('btn-start', 'btn-success btn-lg', 'Start', 'Start or Resume Program', doLeftButton, null)),
                        col(2, button('btn-pause', 'btn-error btn-lg', 'Pause', 'Pause or Stop Program', doRightButton, null)),
                        div('line', 'col-tablet col-1 info-button', "0"),
                        div('runtime', 'col-tablet col-1 info-button', "12:23"),
                        div('dropdown', 'dropdown  dropdown-right', [
                            menubutton('btn-dropdown', 'btn-tablet dropdown-toggle', "Menu"), // {"attributes":{"tabindex":"0"}}
                            element('ul', 'tablet-dropdown-menu', 'menu', [
                                mi("Homing", menuHomeAll),
                                mi("Home A", menuHomeA),
                                mi("Spindle Off", menuSpindleOff),
                                mi("Unlock", menuUnlock),
                                mi("Reset", menuReset)
                            ]),
                        ])
                    ])
                   ),
                axis_labels(4),
                axis_zeroing(4),
                div('control-pad', 'area control-pad', [
                    div('jog-controls', 'middle-block jog-controls', [
                        columns('', 'jog-row', [
                            div('distance', 'col-tablet col-2 info-button', ""),
                            jog_control('jog-y-plus', 'Y+'),
                            col(2, " "),
                            jog_control('jog-z-plus', 'Z+'),
                            
                            jog_distance('jog00', '0.001'),
                            jog_distance('jog01', '0.01'),
                            jog_distance('jog02', '0.1'),
                            jog_distance('jog03', '1')
                        ]),

                        columns('', 'jog-row', [
                            jog_control('jog-x-minus', 'X-'),
                            col(2, [
                                div('spindle-speed', 'col-tablet col-8 info-button spindle'),
                                div('spindle-direction', 'col-tablet col-4 info-button spindle')
                            ]),
                            jog_control('jog-x-plus', 'X+'),
                            col(2, [
                                select('jog-distance', 'btn-tablet form-control jog-selector', null, [
                                    option("0.00025"),
                                    option("0.0005"),
                                    option("0.001"),
                                    option("0.003"),
                                    option("0.005"),
                                    option("0.01"),
                                    option("0.03"),
                                    option("0.05"),
                                    option("0.1"),
                                    option("0.3"),
                                    option("0.5"),
                                    option("1"),
                                    option("3"),
                                    option("5"),
                                    option("10"),
                                    option("30")
                                ]),
                            ]),

                            jog_distance('jog10', '0.003'),
                            jog_distance('jog11', '0.03'),
                            jog_distance('jog12', '0.3'),
                            jog_distance('jog13', '3')

                        ]),

                        columns('', 'jog-row', [
                            div('emptyLLHC', 'col-tablet col-2 info-button', ""),
                            jog_control('jog-y-minus', 'Y-'),
                            div('emptyLRHC', 'col-tablet col-2 info-button', ""),
                            jog_control('jog-z-minus', 'Z-'),
                            
                            jog_distance('jog20', '0.005'),
                            jog_distance('jog21', '0.05'),
                            jog_distance('jog22', '0.5'),
                            jog_distance('jog23', '5')
                        ]),
                    ]),
                ]),

                columns('mdifiles', 'area mdifiles', [
                    col(2, input('mditext0', 'mdi-entry', 'text', "GCode Command", null, "")),
                    col(1, button('mdi0', 'btn-tablet mdi-go', 'MDI', 'Submit GCode Command', doMDI, 'mditext0')),
                    col(2, input('mditext1', 'mdi-entry', 'text', "GCode Command", null, "")),
                    col(1, button('mdi1', 'btn-tablet mdi-go', "MDI", "Submit GCode Command", doMDI, 'mditext1')),
                    col(3,
                        select('filelist', 'mdi-entry', selectFile, [
                            option("Load GCode File"),
                        ]),
                       ),
                    col(1, button('', 'btn-tablet refresh', "Upld", "Upload New File", uploadFile, '')),
                    col(1, button('', 'btn-tablet load',    "Load", "Reload File",     selectFile, '')),
                    col(1, button('', 'btn-tablet refresh', "Refr", "Refresh Files",   refreshFiles, ''))
                ]),

                columns('status', 'status', [
                    div('messagepane', 'col-tablet col-5', [
                        div('gcode-states', 'd-block', 'G0'),
                        div('messages', 'messages d-block', 'Serial Messages'),
                        textarea('gcode', 'messages d-block', 'GCode File Display', '')
                    ]),
                    div('previewpane', 'col-tablet col-7', [
                        element('canvas', 'toolpath', 'previewer', ''),
                        element('span', 'filename', ''),
                        button('expand-button', 'btn-tablet', '[]', 'Expand Visualizer', toggleVisualizer, null)
                    ]),
                ]),
                input('uploadBtn', 'd-none', 'file', null, internalUploadFile, ""),
                
            ])

      document.body.appendChild(app)
  }
  function addListeners() {
      window.addEventListener("message", processMessage, false);

      let joggers = id('jog-controls');
      joggers.addEventListener('pointerdown', function(event) {
          var target = event.target;
          if (target.classList.contains('jog')) {
              timeout_id = setTimeout(long_jog, hold_time, target);
          }
      });

      joggers.addEventListener('click', function(event) {
          clearTimeout(timeout_id);
          var target = event.target;
          if (target.classList.contains('jog')) {
              sendMove(target.value);
          }
      });
      joggers.addEventListener('pointerup', function(event) {
          clearTimeout(timeout_id);
          var target = event.target;
          if (target.classList.contains('jog')) {
              if (longone) {
                  longone = false;
                  sendRealtimeCmd(0x85);
              } else {
                  sendMove(target.value);
              }
          }
      })

      joggers.addEventListener('pointerout', function(event) {
          clearTimeout(timeout_id);
          var target = event.target;
          if (target.classList.contains('jog')) {
              if (longone) {
                  longone = false;
                  sendRealtimeCmd(0x85);
              }
          }
      })

      setJogSelector('mm')

      id('mditext0').addEventListener('keyup', mdiEnterKey)
      id('mditext1').addEventListener('keyup', mdiEnterKey)

      // The listener could be added to the tablettab element by setting tablettabs
      // contentEditable property.  The problem is that it is too easy for tablettab
      // to lose focus, in which case it does not receive keys.  The solution is to
      // delegate the event to window and then have the handler check to see if the
      // tablet is active.

      window.addEventListener('keydown', handleKeyDown)
      window.addEventListener('keyup', handleKeyUp)
      window.onresize = setBottomHeight;
  }

  window.onload = (event) => {
      // This adds an event at the end of the queue so setBottomHeight
      // runs after everything has finished rendering
      setTimeout(setBottomHeight, 0)
      tabletInit()
  }

  document.onreadystatechange = event => { 
      // When HTML/DOM elements are ready:
      switch(event.target.readyState) {
      case "loading":
          break
      case "interactive":
          console.log("Loading App")
          loadApp()
          break
      case "complete":
          console.log("Adding Listeners")
          addListeners()
          break
      }
  }
