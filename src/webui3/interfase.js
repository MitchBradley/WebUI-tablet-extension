let files_file_list = []
let files_currentPath = '/'

const bodyHeight = () => height(document.body);

const navbarHeight = () => {
    // The navbar is outside the parent element
    return 0;
}

// window.parent can depend on the context from which we call sendMessage
// For example, window has a different value inside the dropdown menu.
// We want to use the value that is in effect on initial load, so we
// save that value in messageTarget and use the saved value in sendMessage
const messageTarget = window.parent;
const sendMessage = (msg) => {
    messageTarget.postMessage(msg, '*');
}

const askAxis = (name) => {
    sendMessage({type:'cmd', target:'webui', id:'axis', content:name, noToast:true})
}

const askCapabilities = () => {
    sendMessage({type:'capabilities', target:'webui', id:'connection'})
}

const downloadPreferences = () => {
    sendMessage({type:'download', target:'webui', id:'tablet', url:'preferences.json'});
}

// Pending download/query/upload requests made through sendRequest(), keyed
// by a request-specific id that comes back in the reply's initiator --
// generalizes what was originally two hardcoded, URL-string-matched
// consumers (downloadPreferences() above and files_downloadFile() below)
// into a shared mechanism any caller can use, the same way ESP3D-WEBUI's
// (webui2) filetransport.js functions are generic building blocks -- see
// subfile.js's $sd/run=/$localfs/run= support and the Probe Wizard's
// Save/Load, which need concurrent, arbitrary file operations rather than
// just "the one gcode file the user picked".
let pendingRequests = new Map();
let nextRequestId = 1;

const sendRequest = (msg, successFn, errorFn) => {
    const requestId = nextRequestId++;
    pendingRequests.set(requestId, { successFn, errorFn });
    sendMessage({ ...msg, target:'webui', id:'tablet', requestId });
}

// Calls the pending request's callbacks if the reply belongs to one.
// Returns false for replies to messages not sent through sendRequest().
// getResponse turns a successful reply's content into the success value.
const dispatchReply = (content, getResponse) => {
    const requestId = content.initiator && content.initiator.requestId;
    const pending = requestId !== undefined ? pendingRequests.get(requestId) : undefined;
    if (!pending) {
        return false;
    }
    if (content.status == 'progress') {
        return true;  // Upload progress; wait for the final reply
    }
    pendingRequests.delete(requestId);
    if (content.status == 'success') {
        getResponse(content, pending.successFn);
    } else if (pending.errorFn) {
        pending.errorFn(0, content.error);
    }
    return true;
}

// eventMsg.data.content.response comes back as a Blob over the WASM demo
// bridge (see FluidNC/wasm/demo's fs-response handling) but as a plain
// string from real WebUI-mm (see areas/index.tsx's processExtensionMessage
// -> createNewRequest, typed string|Blob) -- handle both rather than
// assuming one.
const readResponseAsText = (response, cb) => {
    if (typeof response === 'string') {
        cb(response);
        return;
    }
    const reader = new FileReader();
    reader.onload = () => cb(reader.result);
    reader.readAsText(response);
}

// path is POSIX-absolute ("/foo.nc"). Mirrors www/js/filetransport.js's
// fileRead()/fileDownloadUrl(): SD-mounted files are served under "SD/",
// LocalFS files at the plain path (FluidPath::canonPath() parses a leading
// "/SD/" out of the string itself and falls back to LocalFS otherwise).
// volume is webui2's FILE_VOLUME_SD ('sd') when that global exists (see
// subfile.js), else the literal string 'sd' -- anything else means LocalFS.
//
// path may also be fully qualified, as webui2's fileRead() requires and as
// subfile.js and the Probe Wizard pass it: a leading /sd/ selects SD, and
// a leading /localfs/, /littlefs/, /spiffs/ or /flash/ selects LocalFS,
// regardless of volume.
const fileRead = (volume, path, successFn, errorFn) => {
    const m = /^\/(sd|localfs|littlefs|spiffs|flash)(\/.*)$/i.exec(path);
    if (m) {
        volume = m[1].toLowerCase() === 'sd' ? 'sd' : 'flash';
        path = m[2];
    }
    const prefix = volume === 'sd' ? 'SD' : '';
    const url = (prefix + path).replace('//', '/');
    sendRequest({type:'download', url}, successFn, errorFn);
}

// Equivalents of webui2's filetransport.js fileList()/fileCreateDir()/
// fileUpload(), with the same arguments and callbacks, so callers like the
// Probe Wizard work in either host.  volume is 'sd' (FILE_VOLUME_SD) or
// anything else for LocalFS, whose endpoint is /files.  Success callbacks
// get the server's JSON listing text, as in webui2.
const volumeUrl = (volume) => volume === 'sd' ? files_url() : 'files';

const fileList = (volume, path, successFn, errorFn) => {
    sendRequest({type:'query', url:volumeUrl(volume), args:{action:'list', path}},
                successFn, errorFn);
}

const fileCreateDir = (volume, path, name, successFn, errorFn) => {
    sendRequest({type:'query', url:volumeUrl(volume), args:{action:'createdir', path, filename:name}},
                successFn, errorFn);
}

// files: an array or FileList of File objects, uploaded to directory path.
// progressFn is accepted for compatibility but not called.  successFn is
// called once all files are uploaded, with the last reply.
const fileUpload = (volume, path, files, progressFn, successFn, errorFn) => {
    const list = Array.from(files);
    const next = (index, lastResponse) => {
        if (index >= list.length) {
            if (successFn) successFn(lastResponse);
            return;
        }
        const file = list[index];
        file.arrayBuffer().then((content) => {
            sendRequest({type:'upload', url:volumeUrl(volume), content, size:content.byteLength,
                         path, filename:file.name},
                        (response) => next(index + 1, response), errorFn);
        }, (err) => {
            if (errorFn) errorFn(0, String(err));
        });
    };
    next(0);
}

let gCodeFileExtensions = 'nc;gcode';
const processPreferences = (preferences) => {
    settings = JSON.parse(preferences).settings;
    gCodeFileExtensions = settings.filesfilter;
    settings.macros.forEach((macro) => {
        //  const displayIcon = iconsList[element.icon] ? iconsList[element.icon] : "";
        tabletAddMacro(macro.name, 'macro-item', null, macro.type, macro.action);
    });
}

const sendCommand = (cmd) => {
    sendMessage({type:'cmd', target:'webui', id:'command', content:cmd, noDispatch:true})
}
const sendRealtimeCmd = (code) => {
    sendCommand(code);
}


// XXX this needs to get a setting value from WebUI
// when there is a way to do that
const JogFeedrate = (axisAndDistance) => {
    return axisAndDistance.startsWith('Z') ? 100 : 1000;
}

const beep = (vol, hz, ms) => {
    sendMessage({type:'sound', target:'webui', id:'sound', content:'seq', seq: [{ f:hz, d:ms }]});
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

const macro_command = (type, action) => {
    switch (type) {
    case "FS":
        //[ESP700] //ESP700 should send status to telnet / websocket
        //Todo: handle response from ESP700
        sendCommand("$LocalFs/Run=" + action)
        break
    case "SD":
        //get command accoring target FW
        sendCommand("$SD/Run="+action);
        break
//    case "URI":
//        //open new page or silent command
//        const uri = action.trim().replace("[SILENT]", "")
//        if (action.trim().startsWith("[SILENT]")) {
//            const uri = action.trim().replace("[SILENT]", "")
//            var myInit = {
//                method: "GET",
//                mode: "cors",
//                cache: "default",
//            }
//            fetch(uri, myInit)
//                .then(function (response) {
//                    if (response.ok) {
//                        console.log("Request succeeded")
//                    } else {
//                        console.log("Request failed")
//                    }
//                })
//                .catch(function (error) {
//                    console.log("Request failed: " + error.message)
//                })
//        } else {
//            window.open(action)
//        }
//        break
    case "CMD":
        //split by ; and show in terminal
        const commandsList = action.trim().split(";")
        commandsList.forEach((command) => {
            sendCommand(command)
        })
        break
    default:
        console.log("type:", type, " action:", action)
        break
    }
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

// Defining toggleFullscreen as something other than a function
// prevents the inclusion of a Fullscreen menu item.  With WebUI-3,
// it is tricky to implement fullscreen from inside the tablet panel
// or page, so we use the fullscreen control in the containing context.
const toggleFullscreen = false;

const processMessage = (eventMsg) => {
    if (eventMsg.data.type  && (!eventMsg.data.id||eventMsg.data.id=='tablet'||eventMsg.data.id=='command'||eventMsg.data.id=='axis'||eventMsg.data.id=='connection')) {
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
                if (dispatchReply(con, (c, fn) => fn(c.response))) {
                    break;
                }
                // Otherwise a files_refreshFiles() listing for the file selector
                if (con.status=='success'){
                    const fileslist = JSON.parse(con.response);
                    populateTabletFileSelector(fileslist.files, fileslist.path, fileslist.status);
                } else {
                    console.log('query fail',con);
                    //TBD
                }
                break
            case 'stream':
                grblHandleMessage(eventMsg.data.content)
                // tabletShowMessage(eventMsg.data.content);
                break
            case 'upload':
                // Replies to internalUploadFile(), which has no requestId,
                // need no handling
                dispatchReply(eventMsg.data.content, (c, fn) => fn(c.response));
                break;
            case 'download': {
                const content = eventMsg.data.content
                if (dispatchReply(content, (c, fn) => readResponseAsText(c.response, fn))) {
                    break;
                }
                // No matching pending fileRead() -- one of the two original,
                // hardcoded download callers (downloadPreferences()/
                // files_downloadFile()), which don't set requestId.
                if (content.status=='success'){
                    readResponseAsText(content.response, (text) => {
                        if(content.initiator.url === 'preferences.json') {
                            processPreferences(text)
                        } else {
                            showGCode(text)
                        }
                    });
                }
                break;
            }
        }
    }
}

const refreshFiles = (event) => {
    files_refreshFiles(files_currentPath)
}

const uploadButtonName = 'uploadBtn';

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
const getVersion = () => id('version').innerText;

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
            attachApp(document.body)
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
