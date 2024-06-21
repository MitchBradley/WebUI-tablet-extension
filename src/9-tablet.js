

var files_file_list = []
var files_currentPath = '/'

function sendMessage(msg){
    window.parent.postMessage(msg, '*')
}

function askCapabilities() {
    sendMessage({type:'capabilities', target:'webui', id:'tablet'})
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

function updateModal() {
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

function updateDRO() {
}

function showGrblState() {
    if (!grblstate) {
        return;
    }
    updateModal()
    var stateName = grblstate.stateName;

    // Unit conversion factor - depends on both $13 setting and parser units
    var factor = 1.0;

    //  spindleSpeed = grblstate.spindleSpeed;
    //  spindleDirection = grblstate.spindle;
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
	               ? Number(grblstate.feedrate).toFixed(0)
	               : Number(grblstate.feedrate/25.4).toFixed(2);

	var rateText = rateNumber +
               (modal.units == 'G21' ? ' mm/min' : ' in/min');

        stateText = rateText + " " + spindleSpeed + " " + spindleDirection;
    } else {
        // var stateText = errorText == 'Error' ? "Error: " + errorMessage : stateName;
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
    files.sort((a, b) => {
        const nameA = a.name.toUpperCase(); // ignore upper and lowercase
        const nameB = b.name.toUpperCase(); // ignore upper and lowercase
        if (nameA < nameB) {
            return -1;
        }
        if (nameA > nameB) {
             return 1;
        }
        // names must be equal
        return 0;
    });
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
    requestModes()
    askCapabilities()
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

var fwname

function files_url() {
    return fwname === 'FluidNC' ? 'upload': 'sdfiles';
}

function setupFluidNC() {
    sendCommand('$Report/Interval=300')
    // Get bounding box
}

function files_refreshFiles(dir) {
    sendMessage({type:'query', target:'webui', id:'tablet', url:files_url(), args:{action:'list', path:dir}});
}

function processMessage(eventMsg){
    if (eventMsg.data.type  && (!eventMsg.data.id||eventMsg.data.id=="tablet")){
        switch (eventMsg.data.type) {
            case "capabilities":
                fwname = eventMsg.data.content.response.FWTarget;
                refreshFiles()
                if (fwname == 'FluidNC') {
                    setupFluidNC()
                }
                break
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
            sendMessage({type:'upload', target:"webui", id:'tablet', url:files_url(), content:e.target.result,size:e.target.result.byteLength, path:"/", filename:pathname});
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
    el.onfocus = inputFocused
    el.onblur = inputBlurred
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

function makeDRO(axis) {
    return col(3,
               columns(`${axis}-dro`, '', [
                   col(1, div('', 'axis-label', axis.toUpperCase())),
                   //div('', 'col-tablet col-1 axis-label', axis),
                   col(6, button(`wpos-${axis}`, 'btn-tablet position', '0.00', `Modify ${axis} position`, null, axis)),
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
                   col(1, button('units', 'btn-tablet btn-units', 'mm', 'Switch between mm and Inch modes', toggleUnits)),
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
//                sendMove(target.value);
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
