const tablet_n_axes = 4;

const tabletClick = () => {
    if (window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(200);
    }
    beep(3, 400, 10);
}

const moveTo = (location) => {
    // Always force G90 mode because synchronization of modal reports is unreliable
    // For controllers that permit it, specifying mode and move in one block is safer
    const cmd = 'G90 G0 ' + location;
    sendCommand(cmd);
}

const MDIcmd = (value) => {
    tabletClick();
    sendCommand(value);
}

const MDI = (field) => {
    MDIcmd(id(field).value);
}

const btnMDI = (event) => {
    MDI(event.target.value)  // value refers to the adjacent text entry box
}

// Reports whether a text input box has focus - see the next comment
let isInputFocused = false;

const inputFocused = () => {
    isInputFocused = true;
}

const inputBlurred = () => {
    isInputFocused = false;
}

const setAxisByValue = (axis, coordinate) => {
    tabletClick();
    const cmd = 'G10 L20 P0 ' + axis + coordinate;
    sendCommand(cmd);
}

const zeroAxis = (axis) => {
    setAxisByValue(axis, 0);
}

const btnZeroAxis = (event) => {
    zeroAxis(event.target.value);
}

const toggleUnits = () => {
    tabletClick();
    sendCommand(modal.units == 'G21' ? 'G20' : 'G21');
    // The button label will be fixed by the response to $G
    sendCommand('$G');
}

const setDistance = (distance) => {
    tabletClick();
    id('jog-distance').value = distance;
}

const btnSetDistance = (event) => {
    setDistance(event.target.innerText);
}

const jogTo = (axisAndDistance) => {
    // Always force G90 mode because synchronization of modal reports is unreliable
    let feedrate = JogFeedrate(axisAndDistance);
    if (modal.units == "G20") {
        feedrate /= 25.4;
        feedrate = feedrate.toFixed(2);
    }

    const cmd = '$J=G91F' + feedrate + axisAndDistance + '\n';
    sendCommand(cmd);
}

const goAxisByValue = (axis, coordinate) => {
    tabletClick();
    moveTo(axis + coordinate);
}

const goto0 = (axis) => {
    goAxisByValue(axis, 0)
}

const btnOverride = (event) => { tabletClick(); sendRealtimeCmd(event.target.value); };
const btnFeedOvrCancel = (event) => { tabletClick(); sendRealtimeCmd('\x90') };
const btnSpindleOvrCancel = (event) =>  { tabletClick(); sendRealtimeCmd('\x99') };

const btnGoto0 = (event) => {
    goto0(event.target.value)
}

const setAxis = (axis, field) => {
    tabletClick();
    const coordinate = id(field).value;
    const cmd = 'G10 L20 P1 ' + axis + coordinate;
    sendCommand(cmd);
}
let timeout_id = 0;
let hold_time = 1000;

let longone = false;
const long_jog = (target) => {
    longone = true;
    let distance = 1000;
    const axisAndDirection = target.value
    let feedrate = JogFeedrate(axisAndDirection);
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

const sendMove = (cmd) => {
    tabletClick();
    const jog = (params) => {
        params = params || {};
        let s = '';
        for (const key in params) {
            s += key + params[key];
        }
        jogTo(s);
    };
    const move = (params) => {
        params = params || {};
        let s = '';
        for (const key in params) {
            s += key + params[key];
        }
        moveTo(s);
    };

    const distance = Number(id('jog-distance').value) || 0;

    const fn = {
        'G28': () => {
            sendCommand('G28');
        },
        'G30': () => {
            sendCommand('G30');
        },
        'X0Y0Z0': () => {
            move({ X: 0, Y: 0, Z: 0 })
        },
        'X0': () => {
            move({ X: 0 });
        },
        'Y0': () => {
            move({ Y: 0 });
        },
        'Z0': () => {
            move({ Z: 0 });
        },
        'X-Y+': () => {
            jog({ X: -distance, Y: distance });
        },
        'X+Y+': () => {
            jog({ X: distance, Y: distance });
        },
        'X-Y-': () => {
            jog({ X: -distance, Y: -distance });
        },
        'X+Y-': () => {
            jog({ X: distance, Y: -distance });
        },
        'X-': () => {
            jog({ X: -distance });
        },
        'X+': () => {
            jog({ X: distance });
        },
        'Y-': () => {
            jog({ Y: -distance });
        },
        'Y+': () => {
            jog({ Y: distance });
        },
        'Z-': () => {
            jog({ Z: -distance });
        },
        'Z+': () => {
            jog({ Z: distance });
        }
    }[cmd];

    fn && fn();
};

const getDollarResult = (result) => {
    [name, value] = result.split('=');
    if (!value) {
        return;
    }
    switch (name) {
    case '$/axes/x/max_travel_mm':
        displayer.setXTravel(parseFloat(value));
        return;
    case '$/axes/y/max_travel_mm':
        displayer.setYTravel(parseFloat(value));
        return;
    case '$/axes/x/homing/mpos_mm':
        displayer.setXHome(parseFloat(value));
        return;
    case '$/axes/y/homing/mpos_mm':
        displayer.setYHome(parseFloat(value));
        return;
    case '$/axes/x/homing/positive_direction':
        displayer.setXDir(value);
        return;
    case '$/axes/y/homing/positive_direction':
        displayer.setYDir(value);
        return;
    }
}

const tabletScrollMessage = (msg) => {
    const messages = id('messages');
    messages.innerHTML += "<br>" + msg;
    messages.scrollTop = messages.scrollHeight;
}

const tabletShowMessage = (msg) => {
    if (msg.startsWith('ok')) {
        // success
        return;
    }
    if (msg == '' || msg.startsWith('<') || msg.startsWith('\n') || msg.startsWith('\r')) {
        return;
    }
    if (msg.startsWith('error:')) {
        msg = '<span style="color:red;">' + msg + '</span>';
    }
    tabletScrollMessage(msg);
    if (msg.startsWith('$')) {
        getDollarResult(msg);
    }
}

const tabletShowResponse = (response) => {
    const messages = id('messages');
    messages.value = response;
}

const setJogSelector = (units) => {
    let buttonDistances = [];
    let menuDistances = [];
    let selected = 0;
    if (units == 'G20') {
        // Inches
        buttonDistances = [0.001, 0.01, 0.1, 1, 0.003, 0.03, 0.3, 3, 0.005, 0.05, 0.5, 5];
        menuDistances = [0.00025, 0.0005, 0.001, 0.003, 0.005, 0.01, 0.03, 0.05, 0.1, 0.3, 0.5, 1, 3, 5, 10, 30];
        selected = '1';
    } else {
        // millimeters
        buttonDistances = [0.1, 1, 10, 100, 0.3, 3, 30, 300, 0.5, 5, 50, 500];
        menuDistances = [0.005, 0.01, 0.03, 0.05, 0.1, 0.3, 0.5, 1, 3, 5, 10, 30, 50, 100, 300, 500, 1000];
        selected = '10';
    }
    const buttonNames = ['jog00', 'jog01', 'jog02', 'jog03', 'jog10', 'jog11', 'jog12', 'jog13', 'jog20', 'jog21', 'jog22', 'jog23'];
    buttonNames.forEach((n, i) => { id(n).innerHTML = buttonDistances[i]; });

    const selector = id('jog-distance');
    selector.length = 0;
    selector.innerText = null;
    menuDistances.forEach((v) => {
        const option = document.createElement("option");
        option.textContent = v;
        option.selected = (v == selected);
        selector.appendChild(option);
    });
};

const removeJogDistance = (option, oldIndex) => {
    const selector = id('jog-distance');
    selector.removeChild(option);
    selector.selectedIndex = oldIndex;
};

const addJogDistance = (distance) => {
    const selector = id('jog-distance');
    const option = document.createElement("option");
    option.textContent = distance;
    option.selected = true;
    return selector.appendChild(option);
};

const setButton = (name, isEnabled, color, text) => {
    const button = id(name);
    button.disabled = !isEnabled;
    button.style.backgroundColor = color;
    button.innerText = text;
};

let leftButtonHandler;
const setLeftButton = (isEnabled, color, text, click) => {
    setButton('btn-start', isEnabled, color, text);
    leftButtonHandler = click;
};

const doLeftButton = (event) => {
    if (leftButtonHandler) {
        leftButtonHandler();
    }
};

let rightButtonHandler;
const setRightButton = (isEnabled, color, text, click) => {
    setButton('btn-pause', isEnabled, color, text);
    rightButtonHandler = click;
};

const doRightButton = (event) => {
    if (rightButtonHandler) {
        rightButtonHandler();
    }
};

const green = '#86f686';
const red = '#f64646';
const gray = '#f6f6f6';
const yellow = '#ffffa8';

let gCodeLoaded = false;
const setRunControls = () => {
    if (gCodeLoaded) {
        // A GCode file is ready to go
        setLeftButton(true, green, 'Start', runGCode);
        setRightButton(false, gray, 'Pause', null);
    } else {
        // Can't start because no GCode to run
        setLeftButton(false, gray, 'Start', null);
        setRightButton(false, gray, 'Pause', null);
    }
};

let startTime = 0;

let spindleDirection = '';
let spindleSpeed = '';

const stopAndRecover = () => {
    stopGCode();
    // To stop GRBL you send a reset character, which causes some modes
    // be reset to their default values.  In particular, it sets G21 mode,
    // which affects the coordinate display and the jog distances.
    requestModes();
};

const unlock = () => {
    sendCommand('$X');
}

let runTime = 0;
const updateModal = () => {
    const newUnits = modal.units == 'G21' ? 'mm' : 'Inch';
    if (getText('units') != newUnits) {
        setText('units', newUnits);
        setJogSelector(modal.units);
    }
    setHTML('gcode-states', modal.modes || "GCode State");
    commitWcs(modal.wcs);
    const distanceText = modal.distance == 'G90'
        ? modal.distance
        : "<div style='color:red'>" + modal.distance + "</div>";
    setHTML('distance', distanceText);

    const modeText = modal.distance + " " +
        modal.wcs + " " +
        modal.units + " " +
        "T" + modal.tool + " " +
        "F" + modal.feedrate + " " +
        "S" + modal.spindle + " ";

    setHTML('gcode-states', modal.modes || "GCode State");
}

let grblReportingUnits = 0;  // Should be set from $10
let oldCannotClick = null;
let gCodeDisplayable = false;

// Single-block (step) mode.  singleBlockEnabled reflects the controller's own
// state -- whether the Pn: field in the latest status report contains 'Q',
// FluidNC's letter for Control::_singleBlockPin -- not what we last clicked;
// see updateSingleBlockState(), called from tabletGrblState() on every status
// report. setSingleBlock() (grbl.js) does the actual controller communication
// and works even while a job is actively running, not just while Idle.
// stepPending tracks whether the current Hold was caused by single-block mode
// pausing before the next line, as opposed to a manual feed hold, so the
// left button can say "Step" instead of "Resume".
let singleBlockEnabled = false;
let stepPending = false;

const toggleSingleBlock = () => {
    // Just ask the controller to flip it; singleBlockEnabled, the button color,
    // and highlight clearing all follow from the next status report, once the
    // controller confirms the change, via updateSingleBlockState().
    setSingleBlock(!singleBlockEnabled);
};

// Called from tabletGrblState() with each status report's parsed Pn: field
// (grbl.pins, undefined if Pn: was absent -- i.e. no control pin is active).
const updateSingleBlockState = (pins) => {
    const enabled = !!(pins && pins.includes('Q'));
    if (enabled === singleBlockEnabled) {
        return;
    }
    singleBlockEnabled = enabled;
    const btn = id('btn-singleblock');
    if (btn) {
        btn.style.backgroundColor = singleBlockEnabled ? green : gray;
    }
    if (!singleBlockEnabled) {
        stepPending = false;
        markGCodeLine(0, null);
        // Single-block execution may have left the viewer showing a nested
        // $sd/run=/$localfs/run= file (showStepLine, below) -- switch back
        // to the top-level job file. gCodeFilename's own cache entry was
        // populated on the original load (showGCode), so this is normally
        // just a cache hit, not a re-fetch.
        const topLevelPath = gCodeFilename ? qualifySDPath(gCodeFilename) : '';
        if (topLevelPath && topLevelPath !== gcodeDisplayedPath) {
            loadStepFile(topLevelPath, () => {});
        }
    }
};

// The path of the file currently shown in the gcode viewer -- the top-level
// job file normally, but temporarily a nested $sd/run=/$localfs/run= file's
// path while single-block execution is paused inside it. Kept in sync with
// gCodeFilename (the top-level file) in tabletLoadGCodeFile()/showGCode().
// Always fully-qualified (e.g. "/sd/foo.gcode"), matching what FluidNC's
// Step message reports (Job::nest()'s in_channel->name(), which is now
// FluidPath::canonPath()'s fully-qualified output -- see FileStream.cpp) --
// fileRead() (filetransport.js) expects the same, resolving the volume from
// the path itself rather than needing it split out beforehand.
let gcodeDisplayedPath = '';

// Job files are always run via $sd/run= (runGCode(), below), so the
// top-level file's path is always SD-relative; qualify it the same way
// interface.js's files_downloadFile() now does.
const qualifySDPath = (name) => '/sd' + (name.startsWith('/') ? name : '/' + name);

// Splits a fully-qualified path's leading volume component ("/sd/...",
// "/littlefs/...", also accepting the "/localfs/"/"/spiffs/" aliases
// FluidPath::canonPath() itself recognizes) into subFileCache's own terms
// (subfile.js): { volume: FILE_VOLUME_SD/FILE_VOLUME_FLASH, tail: the rest
// of the path, unqualified }. Only used for that cache's key scheme -- a
// purely client-side bookkeeping detail, unrelated to how file reads are
// actually issued (those pass the fully-qualified path straight through).
// Returns null if path doesn't start with a recognized volume component.
const splitGCodeVolumePath = (path) => {
    const m = /^\/(sd|littlefs|localfs|spiffs)(\/.*)$/i.exec(path);
    if (!m) {
        return null;
    }
    const volume = m[1].toLowerCase() === 'sd' ? FILE_VOLUME_SD : FILE_VOLUME_FLASH;
    return { volume: volume, tail: m[2] };
};

const subFileCacheKey = (path) => {
    const split = splitGCodeVolumePath(path);
    return split && (split.volume + ':' + split.tail);
};

// Switches the gcode viewer to show path's content, calling then() once
// done (whether or not the switch succeeded). Checks subFileCache
// (subfile.js) first -- populated whenever the visualizer expands a
// $sd/run=/$localfs/run= line for toolpath preview, or by an earlier call
// here -- before falling back to a fresh read.
const loadStepFile = (path, then) => {
    const cacheKey = subFileCacheKey(path);
    const cached = cacheKey && subFileCache.get(cacheKey);
    if (cached) {
        setGCodeViewerFile(path, cached.join('\n'));
        then();
        return;
    }
    if (typeof fileRead !== 'function') {
        then();  // Can't fetch in this WebUI; leave whatever was displayed.
        return;
    }
    // path is already fully-qualified -- fileRead() passes it straight to
    // the server, which resolves the volume itself; the volume argument
    // here is unused (see filetransport.js).
    fileRead(FILE_VOLUME_SD, path,
        (content) => {
            if (cacheKey) {
                subFileCache.set(cacheKey, content.split('\n'));
            }
            setGCodeViewerFile(path, content);
            then();
        },
        () => then());  // Fetch failed; leave whatever was displayed.
};

const setGCodeViewerFile = (path, gcode) => {
    gcodeDisplayedPath = path;
    setGCodeText(gcode);
    gcodeRenderRows();
    setHTML('filename', path);
};

// Called from grbl.js's detectStep() when a single-block pause is reported,
// with the path and line number it paused before. The path can name a
// nested $sd/run=/$localfs/run= file, not just the top-level job file.
const showStepLine = (path, lineNumber) => {
    stepPending = true;
    setText('line', lineNumber);
    if (path !== gcodeDisplayedPath) {
        loadStepFile(path, () => showStepLineInCurrentFile(lineNumber));
        return;
    }
    showStepLineInCurrentFile(lineNumber);
};

const showStepLineInCurrentFile = (lineNumber) => {
    if (gCodeDisplayable) {
        scrollToLine(lineNumber);
    }
    markGCodeLine(lineNumber, 'waiting');
    setLeftButton(true, green, 'Step', resumeGCode);
};

const tabletGrblState = (grbl) => {
    updateModal();
    updateSingleBlockState(grbl.pins);
    const stateName = grbl.stateName;

    // Unit conversion factor - depends on both $13 setting and parser units
    let factor = 1.0;

    //  spindleSpeed = grbl.spindleSpeed;
    //  spindleDirection = grbl.spindle;
    //
    //  feedOverride = OVR.feed/100.0;
    //  rapidOverride = OVR.rapid/100.0;
    //  spindleOverride = OVR.spindle/100.0;

    const mmPerInch = 25.4;
    switch (modal.units) {
        case 'G20':
            factor = grblReportingUnits === 0 ? 1 / mmPerInch : 1.0;
            break;
        case 'G21':
            factor = grblReportingUnits === 0 ? 1.0 : mmPerInch;
            break;
    }

    const cannotClick = stateName == 'Run' || stateName == 'Hold';
    // Recompute the layout only when the state changes
    if (oldCannotClick != cannotClick) {
        selectDisabled('.jog-controls .form-control', cannotClick);
        selectDisabled('.jog-controls .btn', cannotClick);
        selectDisabled('.dropdown-toggle', cannotClick);
        selectDisabled('.axis-position .btn-tablet', cannotClick);
        if (cannotClick) {
            expandVisualizer();
        } else {
            contractVisualizer();
        }
    }
    oldCannotClick = cannotClick;

    // stepPending only means anything during a Hold.
    if (stateName != 'Hold' && stateName != 'Door0') {
        stepPending = false;
    }

    updateModal();

    switch (stateName) {
        case 'Sleep':
            setLeftButton(false, gray, 'Unlock', null);
            setRightButton(true, red, 'Reset', stopAndRecover);
            break;
        case 'Alarm':
            setLeftButton(true, yellow, 'Unlock', unlock);
            setRightButton(true, red, 'Reset', stopAndRecover);
            break;
        case 'Idle':
            setRunControls();
            break;
        case 'Door1':
            setLeftButton(ffalse, gray, 'Resume', resumeGCode);
            setRightButton(true, red, 'Stop', stopAndRecover);
            break;
        case 'Door0':
        case 'Hold':
            setLeftButton(true, green, stepPending ? 'Step' : 'Resume', resumeGCode);
            setRightButton(true, red, 'Stop', stopAndRecover);
            break;
        case 'Jog':
        case 'Home':
        case 'Run':
            setLeftButton(false, gray, singleBlockEnabled ? 'Step' : 'Start', null);
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
        }
    }
    setText('spindle-direction', spindleDirection);

    spindleSpeed = grbl.spindleSpeed ? Number(grbl.spindleSpeed) : '';

    const now = new Date();
    setText('time-of-day', now.getHours() + ':' + String(now.getMinutes()).padStart(2, '0'));
    if (stateName == 'Run') {
        let elapsed = now.getTime() - startTime;
        if (elapsed < 0)
            elapsed = 0;
        let seconds = Math.floor(elapsed / 1000);
        const minutes = Math.floor(seconds / 60);
        seconds = seconds % 60;
        if (seconds < 10)
            seconds = '0' + seconds;
        runTime = minutes + ':' + seconds;
    } else {
        startTime = now.getTime();
    }

    setText('runtime', runTime);

    let stateText = "";
    if (stateName == 'Run') {
        const rateNumber = modal.units == 'G21'
            ? Number(grbl.feedrate).toFixed(0)
            : Number(grbl.feedrate / 25.4).toFixed(2);

        const rateText = rateNumber +
            (modal.units == 'G21' ? ' mmpm' : ' ipm');

        setText('feed', rateNumber);
        setText('spindle-speed', spindleSpeed);
        if (OVRchanged) {
            OVRchanged = false;
            setText('feed-ovr', OVR.feed + '%');
            setText('spindle-ovr', OVR.spindle + '%');
        }

        stateText = rateText + " " + spindleSpeed /* + " " + spindleDirection */;
    } else {
        // const stateText = errorText == 'Error' ? "Error: " + errorMessage : stateName;
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

    const digits = modal.units == 'G20' ? 4 : 2;

    if (WPOS) {
        WPOS.forEach( (pos, index) => {
            if (index < tablet_n_axes) {
                setTextContent('wpos-' + axisNames[index], Number(pos * factor).toFixed(index > 2 ? 2 : digits));
            }
        });
    }

    MPOS.forEach( (pos, index) => {
        if (index < tablet_n_axes) {
            setTextContent('mpos-' + axisNames[index], Number(pos * factor).toFixed(index > 2 ? 2 : digits));
        }
    });
}

const addOption = (selector, name, value, isDisabled, isSelected) => {
    const opt = document.createElement('option');
    opt.appendChild(document.createTextNode(name));
    opt.disabled = isDisabled;
    opt.selected = isSelected;
    opt.value = value;
    selector.appendChild(opt);
}

const toggleVisualizer = (event) => {
    if (id('mdifiles').hidden) {
        contractVisualizer();
    } else {
        expandVisualizer();
    }
}

const contractVisualizer = () => {
    id('mdifiles').hidden = false;
    id('setAxis').hidden = false;
    id('jog-controls').hidden = false;
    id('ovr-controls').hidden = true;
    setBottomHeight();
}

const expandVisualizer = () => {
    id('mdifiles').hidden = true;
    id('setAxis').hidden = true;
    id('jog-controls').hidden = true;
    id('ovr-controls').hidden = false;
    setBottomHeight();
}

let gCodeFilename = '';

const clearTabletFileSelector = (message) => {
    const selector = id('filelist');
    selector.length = 0;
    selector.selectedIndex = 0;
    if (message) {
        addOption(selector, message, -3, true, true);
    }
}

const populateTabletFileSelector = (files, path, status) => {
    const selector = id('filelist');

    const selectedFile = gCodeFilename.split('/').slice(-1)[0];

    if (!files) {
        clearTabletFileSelector();
        addOption(selector, status, -3, true, selectedFile == '');
        return;
    }

    // Normalize path
    if(!path.startsWith('/')) {
        path = '/' + path;
    }
    if(!path.endsWith('/')) {
        path += '/';
    }

    files_currentPath = path;

    clearTabletFileSelector();

    // Filter out files that are not directories or gcode files
    files = filterFiles(files);
    files_file_list = files;

    const inRoot = path === '/';
    if (!files.length) {
        addOption(selector, "No files found in /SD" + path, -3, true, selectedFile == '');

        // Handle no valid files in folder
        if (!inRoot) {
            addOption(selector, '..', -1, false, false);
        }
        return;
    }
    
    const legend = 'Load GCode File from /SD' + path;
    addOption(selector, legend, -2, true, true);  // A different one might be selected later

    if (!inRoot) {
        addOption(selector, '..', -1, false, false);
    }
    let gCodeFileFound = false;
    files.forEach((file, index) => {
        if (file.size == -1) { // Directory
            addOption(selector, file.name + "/", index, false, false);
        } else {
            const found = file.name == selectedFile;
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
}

const arrayToXYZ = (a) => {
    return {
        x: a[0],
        y: a[1],
        z: a[2]
    }
}

// ---- Virtualized gcode line viewer ----
// The full file is kept as one string (gcodeText); gcodeLineOffsets is a
// lazily-extended index of per-line start offsets (Uint32Array), grown
// forward on demand rather than built eagerly for the whole file up front --
// typical access (stepping forward through a job, occasionally jumping back
// to an already-visited line for a loop) only ever needs a small,
// incrementally-growing prefix of it; only a jump into never-before-visited
// territory (e.g. dragging the scrollbar straight to a distant, unvisited
// part of a huge file) costs a scan proportional to the jump distance, same
// as any other approach would.
//
// Only a handful of <div> rows are ever created -- recycled and
// repositioned/relabeled as the view scrolls -- rather than one per file
// line or one string per file line, which is what keeps memory bounded
// regardless of file size.
const GCODE_ROW_BUFFER = 2;

let gcodeText = '';
let gcodeLineOffsets = null;  // Uint32Array; offsets[i] = start of line i+1
let gcodeKnownUpTo = 0;       // highest line number with a known offset
let gcodeLineCount = 0;
let gcodeLineHeight = 0;
let gcodeMarkedLine = 0;      // 0 = no line marked
let gcodeMarkedState = null;  // 'waiting' | 'executing' | null
let gcodeRowPool = [];
let gcodeScrollSyncWired = false;

const ensureGCodeLineHeight = () => {
    if (gcodeLineHeight) {
        return;
    }
    const scroller = id('gcode-scroller');
    if (!scroller) {
        return;
    }
    gcodeLineHeight = parseFloat(getComputedStyle(scroller).getPropertyValue('line-height')) || 0;
};

const setGCodeText = (text) => {
    gcodeText = text || '';
    gcodeLineCount = gcodeText ? gcodeText.split('\n').length : 0;
    if (gcodeLineCount > 0) {
        gcodeLineOffsets = new Uint32Array(gcodeLineCount);
        gcodeLineOffsets[0] = 0;
        gcodeKnownUpTo = 1;
    } else {
        gcodeLineOffsets = null;
        gcodeKnownUpTo = 0;
    }
    gcodeMarkedLine = 0;
    gcodeMarkedState = null;

    const scroller = id('gcode-scroller');
    if (!scroller) {
        return;
    }
    ensureGCodeLineHeight();
    // Deferred to here, rather than run at script-load time, because the
    // scroller doesn't exist yet when this file is first parsed; showGCode()
    // (below), which calls this, only ever runs after the DOM is built.
    if (!gcodeScrollSyncWired) {
        scroller.onscroll = () => gcodeRenderRows();
        gcodeScrollSyncWired = true;
    }
    scroller.scrollTop = 0;
    const spacer = id('gcode-spacer');
    if (spacer) {
        spacer.style.height = (gcodeLineCount * gcodeLineHeight) + 'px';
    }
};

// Extends gcodeLineOffsets, if needed, to know at least targetLine's start
// offset, scanning forward from the end of what's already known.
const extendGCodeIndex = (targetLine) => {
    if (!gcodeLineOffsets || targetLine <= gcodeKnownUpTo) {
        return;
    }
    let searchFrom = gcodeLineOffsets[gcodeKnownUpTo - 1];
    while (gcodeKnownUpTo < targetLine && gcodeKnownUpTo < gcodeLineCount) {
        const nl = gcodeText.indexOf('\n', searchFrom);
        if (nl < 0) {
            break;
        }
        gcodeLineOffsets[gcodeKnownUpTo] = nl + 1;
        gcodeKnownUpTo++;
        searchFrom = nl + 1;
    }
};

const gcodeLineText = (lineNumber) => {
    if (!gcodeLineOffsets || lineNumber < 1 || lineNumber > gcodeLineCount) {
        return '';
    }
    extendGCodeIndex(Math.min(lineNumber + 1, gcodeLineCount));
    const start = gcodeLineOffsets[lineNumber - 1];
    const end = (lineNumber < gcodeLineCount) ? gcodeLineOffsets[lineNumber] - 1 : gcodeText.length;
    return gcodeText.slice(start, end);
};

const gcodeCreateRow = () => {
    const numCell = element('div', '', 'gcode-line-num', '');
    const textCell = element('div', '', 'gcode-line-text', '');
    const row = element('div', '', 'gcode-line', [numCell, textCell]);
    row.numCell = numCell;
    row.textCell = textCell;
    id('gcode-scroller').appendChild(row);
    return row;
};

const gcodeRenderRows = () => {
    const scroller = id('gcode-scroller');
    if (!scroller) {
        return;
    }
    ensureGCodeLineHeight();
    const emptyMsg = id('gcode-empty-msg');
    if (!gcodeLineCount) {
        if (emptyMsg) {
            emptyMsg.style.display = '';
        }
        gcodeRowPool.forEach((row) => { row.style.display = 'none'; });
        return;
    }
    if (emptyMsg) {
        emptyMsg.style.display = 'none';
    }
    if (!gcodeLineHeight) {
        return;  // Can't position rows without it; a later render will retry.
    }
    const topLine = Math.max(1, Math.floor(scroller.scrollTop / gcodeLineHeight) + 1);
    const visibleCount = Math.max(1, Math.ceil(scroller.clientHeight / gcodeLineHeight) + GCODE_ROW_BUFFER);
    while (gcodeRowPool.length < visibleCount) {
        gcodeRowPool.push(gcodeCreateRow());
    }
    for (let i = 0; i < gcodeRowPool.length; i++) {
        const row = gcodeRowPool[i];
        const lineNumber = topLine + i;
        if (lineNumber > gcodeLineCount) {
            row.style.display = 'none';
            continue;
        }
        row.style.display = '';
        row.style.top = ((lineNumber - 1) * gcodeLineHeight) + 'px';
        row.numCell.textContent = String(lineNumber);
        row.textCell.textContent = gcodeLineText(lineNumber);
        const marked = lineNumber === gcodeMarkedLine;
        row.classList.toggle('line-waiting', marked && gcodeMarkedState === 'waiting');
        row.classList.toggle('line-executing', marked && gcodeMarkedState === 'executing');
    }
};

// Marks lineNumber with the given state ('waiting'/'executing'), or clears
// any mark if lineNumber is 0. Called from showStepLine() (below) and
// resumeGCode() (grbl.js), and from updateSingleBlockState()'s off-path.
const markGCodeLine = (lineNumber, state) => {
    gcodeMarkedLine = lineNumber;
    gcodeMarkedState = state;
    gcodeRenderRows();
};

const showGCode = (gcode) => {
    gCodeLoaded = gcode != '';
    setGCodeText(gCodeLoaded ? gcode : '');
    gcodeRenderRows();
    if (!gCodeLoaded) {
        displayer.clear();
    } else {
        // gCodeDisplayable is only true here for a real top-level file load
        // (tabletLoadGCodeFile sets it false, and passes a placeholder
        // message instead of real content, for the "too large to show"
        // case) -- gcodeDisplayedPath was set alongside it, in that same
        // branch. Caching it means returning to the top-level file after
        // single-block execution has visited a nested one (showStepLine,
        // above) doesn't need a redundant re-fetch.
        if (gCodeDisplayable && gcodeDisplayedPath) {
            const cacheKey = subFileCacheKey(gcodeDisplayedPath);
            if (cacheKey) {
                subFileCache.set(cacheKey, gcode.split('\n'));
            }
        }
        const initialPosition = {
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

let machineBboxAsked = false;

const askMachineBbox = () => {
    if (machineBboxAsked) {
        return;
    }
    askAxis("$/axes/x/homing/mpos_mm");
    askAxis("$/axes/x/homing/positive_direction");
    askAxis("$/axes/x/max_travel_mm");

    askAxis("$/axes/y/homing/mpos_mm");
    askAxis("$/axes/y/homing/positive_direction");
    askAxis("$/axes/y/max_travel_mm");

    machineBboxAsked = true;
}

const scrollToLine = (lineNumber) => {
    const scroller = id('gcode-scroller');
    if (!scroller) {
        return;
    }
    ensureGCodeLineHeight();
    if (gcodeLineHeight) {
        // Only reframe when the target line is not already fully visible, so
        // stepping to the next line does not jump the view around unnecessarily.
        if (lineNumber > 0) {
            const lineTop = (lineNumber - 1) * gcodeLineHeight;
            const lineBottom = lineTop + gcodeLineHeight;
            const viewTop = scroller.scrollTop;
            const viewBottom = viewTop + scroller.clientHeight;
            if (lineTop < viewTop) {
                scroller.scrollTop = lineTop;
            } else if (lineBottom > viewBottom) {
                const lineCenter = lineTop + gcodeLineHeight / 2;
                scroller.scrollTop = Math.max(0, lineCenter - scroller.clientHeight / 2);
            }
        } else {
            scroller.scrollTop = 0;
        }
    }
    gcodeRenderRows();
};

const runGCode = () => {
    gCodeFilename && sendCommand('$sd/run=' + gCodeFilename);
};

const tabletSelectGCodeFile = (filename) => {
    const selector = id('filelist');
    const options = Array.from(selector.options);
    const option = options.find(item => item.text == filename);
    option.selected = true;
};

const tabletLoadGCodeFile = (path, size) => {
    gCodeFilename = path;
    if ((isNaN(size) && (size.endsWith("MB") || size.endsWith("GB"))) || size > 1000000) {
        setHTML('filename', gCodeFilename + " (too large to show)");
        showGCode("GCode file too large to display (> 1MB)");
        gCodeDisplayable = false;
        displayer.clear();
    } else {
        gCodeDisplayable = true;
        setHTML('filename', gCodeFilename);
        // files_downloadFile() (interface.js, webui2 core) always calls back
        // into showGCode() with the fetched content -- set the path it'll
        // apply to here, since that callback isn't ours to change. Must
        // match the fully-qualified path files_downloadFile() itself now
        // reads (interface.js), so this stays in sync with what a Step
        // message reports for the same file.
        gcodeDisplayedPath = qualifySDPath(gCodeFilename);
        files_downloadFile(gCodeFilename)
    }
};

let last_selected_index = 0;

const findOptionIndexByValue = (value) => {
    const s = id('wcs');
    for (let i = 0; i < s.options.length; i++) {
        if (s.options[i].value === value) {
            return i;
        }
    }
    return null;
}

const commitWcs = (wcs) => {
    last_selected_index = findOptionIndexByValue(wcs);
    id('wcs').selectedIndex = last_selected_index;
};

const selectWcs = (event) => {
    tabletClick();
    sendCommand(id('wcs').value);
    sendCommand('$G');             // Ask for report of new state
    // Don't change the control until the report comes back
    id('wcs').selectedIndex = last_selected_index;
};

const selectFile = (event) => {
    tabletClick();
    const filelist = id('filelist');
    const index = Number(filelist.options[filelist.selectedIndex].value);
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
    const file = files_file_list[index];
    const filename = file.name;
    if (file.isdir) { // Directory
        gCodeFilename = '';
        files_enter_dir(filename);
    } else {
        tabletLoadGCodeFile(files_currentPath + filename, file.size);
    }
};

const hideMenu = () => { toggleDropdown(); }
const menuReset = () => { stopAndRecover(); hideMenu(); }
const menuUnlock = () => { sendCommand('$X'); hideMenu(); }
const menuHomeAll = () => { sendCommand('$H'); hideMenu(); }
const menuHomeA = () => { sendCommand('$HA'); hideMenu(); }
const menuSpindleOff = () => { sendCommand('M5'); hideMenu(); }
const menuFullscreen = () => { toggleFullscreen(); hideMenu(); }

const requestModes = () => { sendCommand('$G'); }

const cycleDistance = (up) => {
    const sel = id('jog-distance');
    const newIndex = sel.selectedIndex + (up ? 1 : -1);
    if (newIndex >= 0 && newIndex < sel.length) {
        tabletClick();
        sel.selectedIndex = newIndex;
    }
};

const downEvent = new PointerEvent('pointerdown');
const upEvent = new PointerEvent('pointerup');
const jogClick = (name) => {
    const button = id(name);
    button.dispatchEvent(downEvent);
    button.dispatchEvent(upEvent);
}
const clickon = (name) => {
    const button = id(name);
    button.click();
}

let ctrlDown = false;
let oldIndex = null;;
let newChild = null;

const shiftUp = () => {
    if (!newChild) {
        return;
    }
    removeJogDistance(newChild, oldIndex);
    newChild = null;
}
const altUp = () => {
    if (!newChild) {
        return;
    }
    removeJogDistance(newChild, oldIndex);
    newChild = null;
}

const shiftDown = () => {
    if (newChild) {
        return;
    }
    const sel = id('jog-distance');
    const distance = sel.value;
    oldIndex = sel.selectedIndex;
    newChild = addJogDistance(distance * 10);
}
const altDown = () => {
    if (newChild) {
        return;
    }
    const sel = id('jog-distance');
    const distance = sel.value;
    oldIndex = sel.selectedIndex;
    newChild = addJogDistance(distance / 10);
}

const tabletIsActive = () => {
    return id('tablettab').style.display !== 'none';
}
const handleKeyDown = (event) => {
    // When we are in a modal input field like the MDI text boxes
    // or the numeric entry boxes, disable keyboard jogging so those
    // keys can be used for text editing.
    if (!tabletIsActive()) {
        return;
    }
    if (isInputFocused) {
        return;
    }
    switch (event.key) {
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
            break;
        default:
            // console.log(event);
            break;
    }
}
const handleKeyUp = (event) => {
    if (!tabletIsActive()) {
        return;
    }
    if (isInputFocused) {
        return;
    }
    switch (event.key) {
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

const mdiEnterKey = (event) => {
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
const height = (element) => {
    return element.getBoundingClientRect().height;
}
const heightId = (eid) => {
    return height(id(eid));
}
const controlHeight = () => {
    return heightId('nav-panel') + heightId('axis-position') + heightId('setAxis') + heightId('control-pad') + heightId('mdifiles');
}
const setBottomHeight = () => {
    if (!tabletIsActive()) {
        return;
    }
    const residue = bodyHeight() - navbarHeight() - controlHeight();

    const tStyle = getComputedStyle(id('tablettab'))
    const tPad = parseFloat(tStyle.paddingTop) + parseFloat(tStyle.paddingBottom);
    const msgElement = id('status');
    msgElement.style.height = (residue - tPad - 10) + 'px';
}

const handleDown = (event) => {
    const target = event.target;
    if (target.classList.contains('jog')) {
        timeout_id = setTimeout(long_jog, hold_time, target);
    }
}
const handleUp = (event) => {
    clearTimeout(timeout_id);
    const target = event.target;
    if (target.classList.contains('jog')) {
        if (longone) {
            longone = false;
            sendRealtimeCmd('\x85');
        } else {
            sendMove(target.value);
        }
    }
}
const handleOut = (event) => {
    clearTimeout(timeout_id);
    const target = event.target;
    if (target.classList.contains('jog')) {
        if (longone) {
            longone = false;
            sendRealtimeCmd('\x85');
        }
    }
}

const addListeners = () => {
    addInterfaceListeners();

    // We use up/down/out events so long presses will do continuous jogging
    // Click events are unnecessary (they are equivalent to up+down with a
    // short interval) and harmful because they can cause double-triggering
    // of a jog action due to interaction with click and pointerup.
    const joggers = id('jog-controls');
    for (j of document.getElementsByClassName('jog')) {
        j.addEventListener('pointerdown', handleDown);
        j.addEventListener('pointerup', handleUp);
        j.addEventListener('pointerout', handleOut);
    }

    id('mditext0').addEventListener('keyup', mdiEnterKey);
    id('mditext1').addEventListener('keyup', mdiEnterKey);

    numpad.init();
    for (let i = 0; i < tablet_n_axes; i++) {
        const axis = axisNames[i]
        numpad.attach({target: `wpos-${axis}`, axis: axis})
    }

    // The listener could be added to the tablettab element by setting tablettabs
    // contentEditable property.  The problem is that it is too easy for tablettab
    // to lose focus, in which case it does not receive keys.  The solution is to
    // delegate the event to window and then have the handler check to see if the
    // tablet is active.

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.onresize = setBottomHeight;
};

macros = [];
const tabletClearMacros = () => {
    parent = id('tablet-dropdown-menu');
    macros.forEach((item) => {
        parent.removeChild(item);
    });
    macros.length = 0;
}

const runMacro = (event) => {
    data = event.srcElement.dataset;
    macro_command(data.type, data.action);
    hideMenu();
}

const tabletAddMacro = (name, classlist, icon, type, action) => {
    if (name == '') {
        return;
    }
    parent = id('tablet-dropdown-menu');
    item = document.createElement('div');

    let content = '';
    if (icon) {
        content += '<span>' + icon + '</span>';
    }
    content += name;
    item.innerHTML = content;
    item.setAttribute('class', 'tablet-menu-item');
    item.setAttribute('data-action', action);
    item.setAttribute('data-type', type);
    if (classlist) {
        classlist.split(' ').forEach( (cls) => { if (cls != 'btn') item.classList.add(cls); } );
    }
    item.addEventListener('click', runMacro);
    parent.appendChild(item);
    macros.push(item);
}
