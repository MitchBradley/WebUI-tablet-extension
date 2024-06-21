const n_axes = 4

var gCodeLoaded = false;
var gCodeDisplayable = false;

var snd = null;
var sndok = true;

function getVersion() {
    var version = id('version').innerText
    return version
}

