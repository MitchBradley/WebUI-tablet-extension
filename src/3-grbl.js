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

var grblstate
function grblProcessStatus(response) {
    grblstate = parseGrblStatus(response);

    // Record persistent values of data
    if (grblstate.wco) {
        WCO = grblstate.wco;
    }
    if (grblstate.ovr) {
        OVR = grblstate.ovr;
    }
    if (grblstate.mpos) {
        MPOS = grblstate.mpos;
        if (WCO) {
            WPOS = grblstate.mpos.map( function(v,index) { return v - WCO[index]; } );
        }
    } else if (grblstate.wpos) {
        WPOS = grblstate.wpos;
        if (WCO) {
            MPOS = grblstate.wpos.map( function(v,index) { return v + WCO[index]; } );
        }
    }

    showGrblState();
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
    showGrblState()
}

function grblHandleMessage(msg) {
    tabletShowMessage(msg);

    if (msg.startsWith('<')) {
        grblProcessStatus(msg);
        return;
    }
    if (msg.startsWith('[GC:')) {
        grblGetModal(msg);
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
        return;
    }
}
// End grbl.js
