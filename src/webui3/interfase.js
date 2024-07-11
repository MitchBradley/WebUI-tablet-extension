let files_file_list = []
let files_currentPath = '/'

const bodyHeight = () => height(document.body);

const navbarHeight = () => {
    // The navbar is outside the parent element
    return 0;
}

const sendMessage = (msg) => {
    window.parent.postMessage(msg, '*')
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

let gCodeFileExtensions = 'nc;gcode';
const processPreferences = (preferences) => {
    gCodeFileExtensions = JSON.parse(preferences).settings.filesfilter;
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
