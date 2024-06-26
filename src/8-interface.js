let files_file_list = []
let files_currentPath = '/'

const navbarHeight = () => {
    //return heightId('navbar')
    return 64;
}

const sendMessage = (msg) => {
    window.parent.postMessage(msg, '*')
}

const askAxis = (name) => {
    sendMessage({type:'cmd', target:'webui', id:'axis', content:name, noToast:true})
}

const askCapabilities = () => {
    sendMessage({type:'capabilities', target:'webui', id:'tablet'})
}

const downloadPreferences = () => {
    sendMessage({type:'download', target:'webui', id:'tablet', url:'preferences.json'});
}

let gCodeFileExtensions = 'nc;gcode';
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

const enterFullscreen = () => {
    try {
        document.querySelector("body").requestFullscreen(); 
        // document.documentElement.requestFullscreen();
    } catch (exception) {
        try {
            document.documentElement.webkitRequestFullscreen();
        } catch (exception) {
            return;
        }
    }
    messages.rows = 4;
    messages.scrollTop = messages.scrollHeight;
}

const toggleDropdown = () => {
    id('tablet-dropdown-menu').classList.toggle("hidden");
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
    el.onclick = hideMenu;
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
                   col(4, button('', 'btn-tablet btn-zero', `${axis}=0`, `Set ${axis} to 0`, btnZeroAxis, axis)),
                   col(1, " "),
                   col(4, button('', 'btn-tablet btn-goto', `>${axis}0`, `Goto 0 in ${axis}`, btnGoto0, axis))
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

const getVersion = () => id('version').innerText;
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
                            mi("Full Screen", menuFullscreen),
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
                        div('jog-distance-container', 'col-tablet col-2', [
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
                col(1, button('mdi0', 'btn-tablet mdi-go', 'MDI', 'Submit GCode Command', btnMDI, 'mditext0')),
                col(2, input('mditext1', 'mdi-entry', 'text', "GCode Command", null, "")),
                col(1, button('mdi1', 'btn-tablet mdi-go', "MDI", "Submit GCode Command", btnMDI, 'mditext1')),
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
                div('messagepane', 'col-5', [
                    div('gcode-states', 'msg', 'G0'),
                    div('messages', 'msg', "(Tablet UI " + getVersion() + ')'),
                    textarea('gcode', 'msg', 'GCode File Display', '')
                ]),
                div('previewpane', 'col-tablet col-7', [
                    element('canvas', 'toolpath', 'previewer', ''),
                    element('span', 'filename', ''),
                    button('expand-button', 'btn-tablet', '[]', 'Expand Visualizer', toggleVisualizer, null)
                ]),
            ]),
            input('uploadBtn', 'd-none', 'file', null, internalUploadFile, ""),
            button('fsBtn', 'btn-tablet d-none', "[ ]" , "Full Screen",  menuFullscreen, '')
        ])

    document.body.appendChild(app)
}

const addInterfaceListeners = () => {
    window.addEventListener("message", processMessage, false);
};

window.onload = (event) => {
    // This adds an event at the end of the queue so setBottomHeight
    // runs after everything has finished rendering
    setTimeout(setBottomHeight, 0)
    tabletInit()
    askMachineBbox();
};

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
};
const initInterface = () => {
    askCapabilities();
    downloadPreferences();
};
const tabletInit = () => {
    initDisplayer();
    requestModes();
    initInterface();
};

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

const grblHandleOk = () => {};

const grblHandleError = (msg) => {};

const filterFiles = (files) => {
    // Keep gcode names
    const extList = gCodeFileExtensions.split(';');
    files = files.filter(file => extList.includes(file.name.split('.').pop()) || file.size == -1); 

    // Sort files by name
    return files.sort((a, b) => {
        return a.name.localeCompare(b.name);
    });
}

const mainGrblState = (state) => {};
