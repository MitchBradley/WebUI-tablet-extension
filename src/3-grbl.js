let interval_status = -1;
let WCO = undefined;
let OVR = { feed: undefined, rapid: undefined, spindle: undefined };
let OVRchanged = false;
let MPOS = [0, 0, 0, 0];
let WPOS = [0, 0, 0, 0];
let grblaxis = 3;
let grblzerocmd = 'X0 Y0 Z0';
let feedrate = [0, 0, 0, 0, 0, 0];
let last_axis_letter = 'Z';

const axisNames = ['x', 'y', 'z', 'a', 'b', 'c'];

const modal = { modes: "", plane: 'G17', units: 'G21', wcs: 'G54', distance: 'G90' };

const parseGrblStatus = (response) => {
    const grbl = {
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
    const fields = response.split('|');
    fields.forEach((field) => {
        const tv = field.split(':');
        const tag = tv[0];
        const value = tv[1];
        switch(tag) {
            case "Door":
                grbl.stateName = "Door"+value;
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
                grbl.mpos = value.split(',').map( (v) => parseFloat(v) );
                break;
            case "WPos":
                grbl.wpos = value.split(',').map( (v) => parseFloat(v) );
                break;
            case "WCO":
                grbl.wco = value.split(',').map( (v) => parseFloat(v) );
                break;
            case "FS":
                const fsrates = value.split(',');
                grbl.feedrate = parseFloat(fsrates[0]);
                grbl.spindleSpeed = parseInt(fsrates[1]);
                break;
            case "Ov":
                const ovrates = value.split(',');
                grbl.ovr = {
                    feed: parseInt(ovrates[0]),
                    rapid: parseInt(ovrates[1]),
                    spindle: parseInt(ovrates[2])
                }
                if ((!OVR) || grbl.ovr.feed != OVR.feed || grbl.ovr.rapid != OVR.rapid || grbl.ovr.spindle != OVR.spindle) {
                    OVR = grbl.ovr;
                    OVRchanged = true;
                }
                break;
            case "A":
                grbl.spindleDirection = 'M5';
                Array.from(value).forEach(
                    (v) => {
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
                const sdinfo = value.split(',');
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

const clickableFromStateName = (state, hasSD) => {
    const clickable = {
        resume: false,
        pause: false,
        reset: false
    }
    switch(state) {
        case 'Run':
            clickable.pause = true;
            clickable.reset = true;
            break;
        case 'Door1':
            clickable.reset = true;
            break;
        case 'Door0':
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

const pauseGCode = () => {
    sendRealtimeCmd('\x21'); // '!'
}

const resumeGCode = () => {
    sendRealtimeCmd('\x7e'); // '~'
}

const grblReset = () => {
    if (probe_progress_status != 0) {
        probe_failed_notification();
    }
    sendRealtimeCmd('\x18');
}

const stopGCode = () => {
    grblReset();
}

let grblstate
const showGrblState = () => {
    if (!grblstate) {
        return;
    }
    mainGrblState(grblstate);
    tabletGrblState(grblstate);
};

const grblProcessStatus = (response) => {
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
            WPOS = grblstate.mpos.map( (v,index) => v - WCO[index] );
        }
    } else if (grblstate.wpos) {
        WPOS = grblstate.wpos;
        if (WCO) {
            MPOS = grblstate.wpos.map( (v,index) => v + WCO[index] );
        }
    }

    showGrblState();
}

const grblGetProbeResult = (response) => {
    const tab1 = response.split(":");
    if (tab1.length > 2) {
        const status = tab1[2].replace("]", "");
        if (parseInt(status.trim()) == 1) {
            if (probe_progress_status != 0) {
                sendProbeCommand();
                finalize_probing();
            }
        } else {
            probe_failed_notification();
        }
    }
}

const modalModes = [
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

const grblGetModal = (msg) => {
    modal.modes = msg.replace("[GC:", '').replace(']', '');
    const modes = modal.modes.split(' ');
    modal.parking = undefined;  // Otherwise there is no way to turn it off
    modal.program = '';  // Otherwise there is no way to turn it off
    modes.forEach((mode) => {
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
                modalModes.forEach((modeType) => {
                    modeType.values.forEach((s) => {
                        if (mode == s) {
                            modal[modeType.name] = mode;
                        }
                    });
                });
            }
        }
    });
    showGrblState();
}

const grblHandleReset = (msg) => {
    console.log('Reset detected');
    setupFluidNC();
}

const grblHandleMessage = (msg) => {
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
        grblHandleOk();
        return;
    }
    if (msg.startsWith('[PRB:')) {
        grblGetProbeResult(msg);
        return;
    }
    if (msg.startsWith('[MSG:')) {
        return;
    }
    if (msg.startsWith('error:')) {
        grblHandleError(msg);
    }
    if (msg.startsWith('ALARM:') || msg.startsWith('Hold:') || msg.startsWith('Door:')) {
        if (probe_progress_status != 0) {
            probe_failed_notification();
        }
        return;
    }
    if (msg.startsWith('Grbl ')) {
        grblHandleReset();
        return;
    }
}
