let files_file_list = []
let files_currentPath = '/'

const sendMessage = (msg) => {
    window.parent.postMessage(msg, '*')
}

const askCapabilities = () => {
    sendMessage({type:'capabilities', target:'webui', id:'tablet'})
}

const downloadPreferences = () => {
    sendMessage({type:'download', target:'webui', id:'tablet', url:'preferences.json'});
}

const processPreferences = (preferences) => {
    gCodeFileExtensions = JSON.parse(preferences).settings.filesfilter;
}

const sendCommand = (cmd) => {
    sendMessage({type:'cmd', target:'webui', id:'command', content:cmd, noDispatch:true})
}
const sendRealtimeCmd = (code) => {
    const cmd = String.fromCharCode(code)
    sendCommand(cmd)
}


// XXX this needs to get a setting value from WebUI
// when there is a way to do that
const JogFeedrate = (axisAndDistance) => {
    return axisAndDistance.startsWith('Z') ? 100 : 1000;
}


const beep = (vol, hz, ms) => {
    //      useUiContextFn.haptic()
}

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

const doMDI = (event) => {
    MDI(event.target.value)  // value refers to the adjacent text entry box
}

const inputFocused  = () => {
    isInputFocused = true;
}

const inputBlurred  = () => {
    isInputFocused = false;
}

const zeroAxis  = (event) => {
    tabletClick();
    setAxisByValue(event.target.value, 0);
}

const toggleUnits  = () => {
    tabletClick();
    sendCommand(modal.units == 'G21' ? 'G20' : 'G21');
    // The button label will be fixed by the response to $G
    sendCommand('$G');
}

const btnSetDistance  = (event) => {
    tabletClick();
    id('jog-distance').value = event.target.innerText;;
}

const setDistance  = (distance) => {
    tabletClick();
    id('jog-distance').value = distance;
}


const jogTo  = (axisAndDistance) => {
    // Always force G90 mode because synchronization of modal reports is unreliable
    let feedrate = JogFeedrate(axisAndDistance);
    if (modal.units == "G20") {
        feedrate /= 25.4;
        feedrate = feedrate.toFixed(2);
    }

    const cmd = '$J=G91F' + feedrate + axisAndDistance + '\n';
    // tabletShowMessage("JogTo " + cmd);
    sendCommand(cmd);
}

const goAxisByValue  = (axis, coordinate) => {
    tabletClick();
    moveTo(axis + coordinate);
}
const goto0 = (event) => {
    goAxisByValue(event.target.value, 0)
}

const setAxisByValue  = (axis, coordinate) => {
    tabletClick();
    const cmd = 'G10 L20 P0 ' + axis + coordinate;
    sendCommand(cmd);
}

const setAxis  = (axis, field) => {
    tabletClick();
    const coordinate = id(field).value;
    const cmd = 'G10 L20 P1 ' + axis + coordinate;
    sendCommand(cmd);
}
let timeout_id = 0,
    hold_time = 1000;

let longone = false;
const long_jog = (target) => {
    longone = true;
    let distance = 1000;
    const axisAndDirection = target.value
    const feedrate = JogFeedrate(axisAndDirection);
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

const sendMove  = (cmd) => {
    tabletClick();
    const jog = (params) => {
        params = params || {};
        let s = '';
        for (let key in params) {
            s += key + params[key]
        }
        jogTo(s);
    };
    const move = (params) => {
        params = params || {};
        let s = '';
        for (let key in params) {
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
const getItemValue = (msg, name) => {
    if (msg.startsWith(name)) {
        return msg.substring(name.length, msg.length);
    }
    return '';
}
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
    if (msg ==  '' || msg.startsWith('<') || msg.startsWith('\n') || msg.startsWith('\r')) {
        return;
    }
    if (msg.startsWith('ok')) {
        // success
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
    buttonNames.forEach( (n, i) => { id(n).innerHTML = buttonDistances[i]; } );

    const selector = id('jog-distance');
    selector.length = 0;
    selector.innerText = null;
    menuDistances.forEach((v) => {
        const option = document.createElement("option");
        option.textContent=v;
        option.selected = (v == selected);
        selector.appendChild(option);
    });
}
const removeJogDistance = (option, oldIndex) => {
    const selector = id('jog-distance');
    selector.removeChild(option);
    selector.selectedIndex = oldIndex;
}
const addJogDistance = (distance) => {
    const selector = id('jog-distance');
    const option = document.createElement("option");
    option.textContent=distance;
    option.selected = true;
    return selector.appendChild(option);
}

let runTime = 0;

const setButton = (name, isEnabled, color, text) => {
    const button = id(name);
    button.disabled = !isEnabled;
    button.style.backgroundColor = color;
    button.innerText = text;
}

let leftButtonHandler;
const setLeftButton = (isEnabled, color, text, click) => {
    setButton('btn-start', isEnabled, color, text);
    leftButtonHandler = click;
}
const doLeftButton = (event) => {
    if (leftButtonHandler) {
        leftButtonHandler();
    }
}

let rightButtonHandler;
const setRightButton = (isEnabled, color, text, click) => {
    setButton('btn-pause', isEnabled, color, text);
    rightButtonHandler = click;
}
const doRightButton = (event) => {
    if (rightButtonHandler) {
        rightButtonHandler();
    }
}

let green = '#86f686';
let red = '#f64646';
let gray = '#f6f6f6';

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
}

let grblReportingUnits = 0;
let startTime = 0;

let spindleDirection = ''
let spindleSpeed = ''

const stopAndRecover = () => {
    stopGCode();
    // To stop GRBL you send a reset character, which causes some modes
    // be reset to their default values.  In particular, it sets G21 mode,
    // which affects the coordinate display and the jog distances.
    requestModes();
}

let oldCannotClick = null;

const updateModal = () => {
    const newUnits = modal.units == 'G21' ? 'mm' : 'Inch';
    if (getText('units') != newUnits) {
        setText('units', newUnits);
        setJogSelector(modal.units);
    }
    setHTML('gcode-states', modal.modes || "GCode State");
    setText('wpos-label', modal.wcs);
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

const updateDRO = () => {
}

const showGrblState = () => {
    if (!grblstate) {
        return;
    }
    updateModal()
    const stateName = grblstate.stateName;

    // Unit conversion factor - depends on both $13 setting and parser units
    let factor = 1.0;

    //  spindleSpeed = grblstate.spindleSpeed;
    //  spindleDirection = grblstate.spindle;
    //
    //  feedOverride = OVR.feed/100.0;
    //  rapidOverride = OVR.rapid/100.0;
    //  spindleOverride = OVR.spindle/100.0;

    const mmPerInch = 25.4;
    switch (modal.units) {
        case 'G20':
            factor = grblReportingUnits === 0 ? 1/mmPerInch : 1.0 ;
            break;
        case 'G21':
            factor = grblReportingUnits === 0 ? 1.0 : mmPerInch;
            break;
    }

    const cannotClick = stateName == 'Run' || stateName == 'Hold';
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

    if (grblstate.spindleDirection) {
        switch (grblstate.spindleDirection) {
            case 'M3': spindleDirection = 'CW'; break;
            case 'M4': spindleDirection = 'CCW'; break;
            case 'M5': spindleDirection = 'Off'; break;
            default: spindleDirection = '';  break;
        }
    }
    setText('spindle-direction', spindleDirection);

    spindleSpeed = grblstate.spindleSpeed ? Number(grblstate.spindleSpeed) : '';
    setText('spindle-speed', spindleSpeed);

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
	               ? Number(grblstate.feedrate).toFixed(0)
	               : Number(grblstate.feedrate/25.4).toFixed(2);

	const rateText = rateNumber +
               (modal.units == 'G21' ? ' mm/min' : ' in/min');

        stateText = rateText + " " + spindleSpeed + " " + spindleDirection;
    } else {
        // const stateText = errorText == 'Error' ? "Error: " + errorMessage : stateName;
        stateText = stateName;
    }
    setText('active-state', stateText);

    if (grblstate.lineNumber && (stateName == 'Run' || stateName == 'Hold' || stateName == 'Stop')) {
        setText('line', grblstate.lineNumber);
        if (gCodeDisplayable) {
            scrollToLine(grblstate.lineNumber);
        }
    }
    if (gCodeDisplayable) {
        displayer.reDrawTool(modal, arrayToXYZ(WPOS));
    }

    const digits = modal.units == 'G20' ? 4 : 2;

    if (WPOS) {
        WPOS.forEach( (pos, index) => {
            setTextContent('wpos-'+axisNames[index], Number(pos*factor).toFixed(index > 2 ? 2 : digits));
        });
    }

    MPOS.forEach( (pos, index) => {
        setTextContent('mpos-'+axisNames[index], Number(pos*factor).toFixed(index > 2 ? 2 : digits));
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
    id('control-pad').hidden = false;
    setBottomHeight();
}

const expandVisualizer = () => {
    id('mdifiles').hidden = true;
    id('setAxis').hidden = true;
    id('control-pad').hidden = true;
    setBottomHeight();
}

let gCodeFilename = '';
let gCodeFileExtensions = '';

const clearTabletFileSelector = (message) => {
    const selector = id('filelist');
    selector.length = 0;
    selector.selectedIndex = 0;
    if (message) {
        addOption(selector, message, -3, true, true);
    }
}

const populateTabletFileSelector = (files, path) => {
    const selector = id('filelist');

    const selectedFile = gCodeFilename.split('/').slice(-1)[0];

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
    const extList = gCodeFileExtensions.split(';');
    files = files.filter(file => extList.includes(file.name.split('.').pop()) || file.size == -1);

    // Sort files by name
    files = files.sort((a, b) => {
        return a.name.localeCompare(b.name);
    });

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

const tabletInit = () => {
    initDisplayer()
    requestModes()
    askCapabilities()
    downloadPreferences()
}

const arrayToXYZ = (a) => {
    return {
        x: a[0],
        y: a[1],
        z: a[2]
    }
}

const showGCode = (gcode) => {
    gCodeLoaded = gcode != '';
    if (!gCodeLoaded) {
        id('gcode').value = "(No GCode loaded)";
        displayer.clear();
    } else {
        id('gcode').value = gcode;
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

const axisResult = (content) => {
    let query = content.initiator.content;
    if (content.status == 'success') {
        getDollarResult(content.response);
    } else {
        displayer.disableBoundary();
        // Suppress further Bbox queries as they are moot
        machineBboxAsked = true;
    }
}

const askAxis = (name) => {
    sendMessage({type:'cmd', target:'webui', id:'axis', content:name, noToast:true})
}

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

const nthLineEnd = (str, n) => {
    if (n <= 0)
        return 0;
    const L = str.length;
    let i = -1;
    while(n-- && i++<L){
        i= str.indexOf("\n", i);
        if (i < 0) break;
    }
    return i;
}

const scrollToLine = (lineNumber) => {
    const gCodeLines = id('gcode');
    const lineHeight = parseFloat(getComputedStyle(gCodeLines).getPropertyValue('line-height'));
    const gCodeText = gCodeLines.value;

    gCodeLines.scrollTop = (lineNumber) * lineHeight;

    let start;
    let end;
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

const runGCode = () => {
    gCodeFilename && sendCommand('$sd/run=' + gCodeFilename);
    expandVisualizer();
}

const tabletSelectGCodeFile = (filename) => {
    const selector = id('filelist');
    const options = Array.from(selector.options);
    const option = options.find(item => item.text == filename);
    option.selected = true;
}
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
        //        files_downloadFile(encodeURIComponent('SD' + gCodeFilename))
        files_downloadFile(gCodeFilename)
    }
}

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
    if (file.size == -1) { // Directory
        gCodeFilename = '';
        files_enter_dir(filename);
    } else {
        tabletLoadGCodeFile(files_currentPath + filename, file.size);
    }
}

const toggleMenu = () => {
    id('tablet-dropdown-menu').classList.toggle("hidden");
}

const menuReset = () => { stopAndRecover(); toggleMenu(); }
const menuUnlock = () => { sendCommand('$X'); toggleMenu(); }
const menuHomeAll = () => { sendCommand('$H'); toggleMenu(); }
const menuHomeA = () => { sendCommand('$HA'); toggleMenu(); }
const menuSpindleOff = () => { sendCommand('M5'); toggleMenu(); }
const menuFullScreen = () => {
    if(document.fullscreenElement) {
        document.exitFullscreen();
    } else {
        document.querySelector("body").requestFullscreen(); 
    }
    toggleMenu();
}

const requestModes = () => { sendCommand('$G'); }

const cycleDistance  = (up) => {
    const sel = id('jog-distance');
    const newIndex = sel.selectedIndex + (up ? 1 : -1);
    if (newIndex >= 0 && newIndex < sel.length) {
        tabletClick();
        sel.selectedIndex = newIndex;
    }
}
const clickon  = (name) => {
    //    $('[data-route="workspace"] .btn').removeClass('active');
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

const jogClick = (name) => {
    clickon(name);
}

// Reports whether a text input box has focus - see the next comment
let isInputFocused = false;
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
const handleKeyUp = (event) => {
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

const mdiEnterKey = (event) => {
    if (event.key === 'Enter') {
        MDIcmd(event.target.value);
        event.target.blur();
    }
}

// setMessageHeight(), with these helper consts, adjusts the size of the message
// window to fill the height of the screen.  It would be nice if we could do that
// solely with CSS, but I did not find a way to do that.  Everything I tried either
// a) required setting a fixed message window height, or
// b) the message window would extend past the screen bottom when messages were added
const height = (element) => {
    return element.getBoundingClientRect().height;
}
const heightId = (eid) => {
    return height(id(eid))
}
const bodyHeight = () => { return height(document.body); }
const controlHeight = () => {
    return heightId('nav-panel') + heightId('axis-position') + heightId('setAxis') + heightId('control-pad');
}
const navbarHeight = () => {
    //return heightId('navbar')
    return 64;
}
const setBottomHeight = () => {
    if (!tabletIsActive()) {
        return;
    }
    const residue = bodyHeight() - navbarHeight() - controlHeight();

    const tStyle = getComputedStyle(id('tablettab'))
    const tPad = parseFloat(tStyle.paddingTop) + parseFloat(tStyle.paddingBottom) + 20;
    const msgElement = id('status');
    msgElement.style.height = (residue - tPad) + 'px';
}

const files_go_levelup = () => {
    const tlist = files_currentPath.split("/");
    const path = "/";
    let nb = 1;
    while (nb < (tlist.length - 2)) {
        path += tlist[nb] + "/";
        nb++;
    }
    files_refreshFiles(path, true);
}

const files_enter_dir = (name) => {
    files_refreshFiles(files_currentPath + name + "/", true);
}

const files_downloadFile = (name) => {
    name = '/SD' + name
    sendMessage({type:'download', target:'webui', id:'tablet', url:name});
}

let fwname

const files_url = () => {
    return fwname === 'FluidNC' ? 'upload': 'sdfiles';
}

const setupFluidNC = () => {
    sendCommand('$Report/Interval=300')
    // Get bounding box
}

const files_refreshFiles = (dir) => {
    sendMessage({type:'query', target:'webui', id:'tablet', url:files_url(), args:{action:'list', path:dir}});
}

const processMessage = (eventMsg) => {
    if (eventMsg.data.type  && (!eventMsg.data.id||eventMsg.data.id=='tablet'||eventMsg.data.id=='command'||eventMsg.data.id=='axis')) {
        switch (eventMsg.data.type) {
            case 'cmd':
                if (eventMsg.data.id == 'axis') {
                    axisResult(eventMsg.data.content);
                } else {
                    console.log('cmd',eventMsg.data.content);
                }
                break;
            case 'capabilities':
                fwname = eventMsg.data.content.response.FWTarget;
                refreshFiles()
                if (fwname == 'FluidNC') {
                    setupFluidNC()
                }
                break
            case 'query':
                const con = eventMsg.data.content
                if (con.status=='success'){
                    const fileslist = JSON.parse(con.response);
                    populateTabletFileSelector(fileslist.files, fileslist.path);
                } else {
                    console.log('query fail',con);
                    //TBD
                }
                break
            case 'stream':
                grblHandleMessage(eventMsg.data.content)
                // tabletShowMessage(eventMsg.data.content);
                break
            case 'download':
                const content = eventMsg.data.content
                if (content.status=='success'){
                    const reader = new FileReader();
                    reader.onload = () => {
                        if(content.initiator.url === 'preferences.json') {
                            processPreferences(reader.result)
                        } else {
                            showGCode(reader.result)
                        }
                    }
                    reader.readAsText(content.response);
                } else {
                }
                break
        }
    }
}

const refreshFiles = (event) => {
    files_refreshFiles(files_currentPath)
}

//  const uploadFile = () => { }
const internalUploadFile = () => {
    const files = id("uploadBtn").files
    if (files.length>0){
        const reader = new FileReader();
        reader.onload = (e) => {
            const pathname = files[0].name;
            sendMessage({type:'upload', target:"webui", id:'tablet', url:files_url(), content:e.target.result,size:e.target.result.byteLength, path:"/", filename:pathname});
            id("uploadBtn").value="";
            refreshFiles()
        }
        reader.readAsArrayBuffer(files[0]);
    }
};
const uploadFile = () => {
    id('uploadBtn').click()
}

const injectCSS = (css) => {
    let el = document.createElement('style');
    el.textContent = css;
    document.head.appendChild(el);
    return el;
};


const appendContent = (el, content) => {
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
const element = (type, id, cssclass, content) => {
    const el = document.createElement(type);
    if (id) {
        el.id = id;
    }
    if (cssclass) {
        el.className = cssclass;
    }
    appendContent(el, content)
    return el;
}
const input = (id, cssclass, inptype, placeholder, onchange, content) => {
    const el = element('input', id, cssclass, content)
    el.type = inptype
    if (typeof placeholder != 'undefined') {
        el.placeholder = placeholder
    }
    if (typeof onchange != 'undefined') {
        el.onchange = onchange
    }
    el.onfocus = inputFocused
    el.onblur = inputBlurred
    return el
}
const select = (id, cssclass, onchange, content) => {
    const el = element('select', id, cssclass, content)
    if (typeof onchange != 'undefined') {
        el.onchange = onchange
    }
    return el
}
const option = (content) => {
    return element('option', '', '', content);
}
const div = (id, cssclass, content) => {
    return element('div', id, cssclass, content)
}
const columns = (id, extracssclass, content) => {
    return div(id, 'cols-tablet ' + extracssclass, content)
}
const textarea = (id, cssclass, placeholder, content) => {
    const el = element('textarea', id, cssclass, content)
    el.placeholder = placeholder
    el.spellcheck = false
    el.readonly = ''
    return el
}

const button = (id, cssclass, content, title, click, value) => {
    const el = element('button', id, cssclass, content)
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
const menubutton = (id, cssclass, content) => {
    const el = button(id, cssclass, content)
    el.tabindex = 0
    el.onclick = toggleMenu;
    return el
}

const col = (width, content) => {
    return div('', `col-tablet col-${width}`, content)
}

const makeDRO = (axis) => {
    return col(3,
               columns(`${axis}-dro`, '', [
                   col(1, div('', 'axis-label', axis.toUpperCase())),
                   //div('', 'col-tablet col-1 axis-label', axis),
                   col(6, button(`wpos-${axis}`, 'btn-tablet position', '0.00', `Modify ${axis} position`, null, axis)),
                   div(`mpos-${axis}`, 'col-tablet col-4 mposition', '0.00')
               ])
    )
}
const axis_labels = (naxes) => {
    const elements = []
    for (let i = 0; i < naxes; i++) {
        elements.push(makeDRO(axisNames[i]))
    }
    return columns('axis-position', 'area axis-position', [
        div('wpos-label', 'col-tablet col-1 pos-name', 'WPos'),
        col(11, columns('', '', elements))
    ])
}

const axis_zero = (axis) => {
    axis = axis.toUpperCase()

    return col(3,
               columns('', '', [
                   col(4, button('', 'btn-tablet btn-zero', `${axis}=0`, `Set ${axis} to 0`, zeroAxis, axis)),
                   col(1, " "),
                   col(4, button('', 'btn-tablet btn-goto', `→${axis}0`, `Goto 0 in ${axis}`, goto0, axis))
               ])
    )
}
const axis_zeroing = (naxes) => {
    const elements = []
    for (let i = 0; i < naxes; i++) {
        elements.push(axis_zero(axisNames[i]))
    }
    return div('setAxis', 'area2 axis-position',
               columns('', '', [
                   col(1, button('units', 'btn-tablet btn-units', 'mm', 'Switch between mm and Inch modes', toggleUnits)),
                   col(11, columns('', '', elements))
               ])
    )
}
const jog_distance = (name, amount) => {
    return div('', 'col-tablet col-1',
               button(name, 'btn-tablet set-distance', amount, `Jog by ${amount}`, btnSetDistance, amount)
    )
}

const jog_control = (name, label) => {
    return col(2, button(name, 'btn-tablet jog', label, `Move ${label}`, null, label))
}

const mi = (text, theclick) => {
    // const anchor = element('div', '', '', text)
    // anchor.href = 'javascript:void(0)'
    const anchor = element('div', '', '', text)
    anchor.onclick = theclick
    anchor.role = 'menuitem'
    return element('li', '', '', anchor)
}

const loadApp = () => {
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
                            mi("Full Screen", menuFullScreen),
                            mi("Homing", menuHomeAll),
                            mi("Home A", menuHomeA),
                            mi("Spindle Off", menuSpindleOff),
                            mi("Unlock", menuUnlock),
                            mi("Reset", menuReset),
                        ]),
                    ])
                ])
            ),
            axis_labels(n_axes),
            axis_zeroing(n_axes),
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
                    div('messages', 'messages d-block', "(Tablet UI " + getVersion() + ')'),
                    textarea('gcode', 'messages d-block', 'GCode File Display', '')
                ]),
                div('previewpane', 'col-tablet col-7', [
                    element('canvas', 'toolpath', 'previewer', ''),
                    element('span', 'filename', ''),
                    button('expand-button', 'btn-tablet', '[]', 'Expand Visualizer', toggleVisualizer, null)
                ]),
            ]),
            input('uploadBtn', 'd-none', 'file', null, internalUploadFile, ""),
            button('fsBtn', 'btn-tablet d-none', "[ ]" , "Full Screen",  menuFullScreen, '')
        ])

    document.body.appendChild(app)
}
const addListeners = () => {
    window.addEventListener("message", processMessage, false);

    let joggers = id('jog-controls');
    joggers.addEventListener('pointerdown', (event) => {
        const target = event.target;
        if (target.classList.contains('jog')) {
            timeout_id = setTimeout(long_jog, hold_time, target);
        }
    });

    joggers.addEventListener('click', (event) => {
        clearTimeout(timeout_id);
        const target = event.target;
        if (target.classList.contains('jog')) {
            sendMove(target.value);
        }
    });
    joggers.addEventListener('pointerup', (event) => {
        clearTimeout(timeout_id);
        const target = event.target;
        if (target.classList.contains('jog')) {
            if (longone) {
                longone = false;
                sendRealtimeCmd(0x85);
            } else {
//                sendMove(target.value);
            }
        }
    })

    joggers.addEventListener('pointerout', (event) => {
        clearTimeout(timeout_id);
        const target = event.target;
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

    for (let i = 0; i < n_axes; i++) {
        const axis = axisNames[i]
        numpad.attach({target: `wpos-${axis}`, axis: axis})
    }

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
    numpad.init()
    tabletInit()
    askMachineBbox();
}

document.onreadystatechange = event => {
    // When HTML/DOM elements are ready:
    switch(event.target.readyState) {
        case "loading":
            break
        case "interactive":
            loadApp()
            break
        case "complete":
            addListeners()
            break
    }
}
