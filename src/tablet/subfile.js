// Handles $sd/run=NAME and $localfs/run=NAME lines. On real hardware these
// map to FileCommands.cpp's runSDFile()/runLocalFile() -> runFile(), which
// opens the named file and Job::nest()s it: the rest of the calling file's
// current line is left pending, the nested file runs to completion line by
// line, and only then does execution resume where the caller left off --
// exactly like a subroutine call. See Job.h's JobSource::_local_params for
// why the nested file gets its own local-parameter scope, matching
// parameters.js's params_push_job_scope()/params_pop_job_scope().
//
// The displayer has no streaming file source -- simple-interpreter.js
// already runs the whole program as one flat array of lines -- so rather
// than teaching the interpreter to swap between multiple line sources, this
// expands the whole program up front: each $.../run= line is replaced by
// its target file's own (recursively expanded) lines, bracketed by
// PUSH_JOB_SCOPE/POP_JOB_SCOPE markers for simple-interpreter.js to act on.
// A WHILE/REPEAT loop whose body contains a $.../run= call naturally re-
// runs the spliced-in content on every iteration, since the loop is just
// re-walking fixed array indices -- so this only needs to expand once, not
// once per iteration.
//
// File content is fetched once per unique name and kept in subFileCache for
// the lifetime of the page -- repeated references (including from inside a
// loop, or across the displayer's bbox-then-draw passes) reuse the cached
// lines instead of re-fetching. Only the local-parameter *scope* is fresh
// on every call, never the file content.

let subFileCache = new Map();

const PUSH_JOB_SCOPE = { pushJobScope: true };
const POP_JOB_SCOPE = { popJobScope: true };

// fileRead()/FILE_VOLUME_SD/FILE_VOLUME_FLASH are host-provided globals
// (see www/js/filetransport.js) -- established elsewhere in this app for
// the same purpose (e.g. interface.js's files_downloadFile()), but only in
// the webui2 (ESP3D-WEBUI) integration today. webui3's interfase.js has no
// equivalent yet, so $.../run= is a no-op there for now (logged, not
// thrown) rather than a hard dependency.
const fileReadAsync = (volume, path) => new Promise((resolve, reject) => {
    if (typeof fileRead !== 'function') {
        reject(new Error('fileRead is not available in this WebUI'));
        return;
    }
    fileRead(volume, path, resolve, (code, message) => reject(new Error(message || ('fileRead failed with code ' + code))));
});

const subFileVolume = (name) => {
    if (name === 'SD') {
        return typeof FILE_VOLUME_SD !== 'undefined' ? FILE_VOLUME_SD : 'sd';
    }
    return typeof FILE_VOLUME_FLASH !== 'undefined' ? FILE_VOLUME_FLASH : 'flash';
};

// Matches a stripComments()'d line against $sd/run=NAME or
// $localfs/run=NAME, case-insensitively on the command but preserving
// NAME's original case (filenames are case-sensitive).
const matchSubFileRun = (strippedLine) => {
    const m = /^\$(SD|LOCALFS)\/RUN=(.+)$/i.exec(strippedLine);
    if (!m) {
        return null;
    }
    return { volume: subFileVolume(m[1].toUpperCase()), name: m[2] };
};

const fetchSubFileLines = async (volume, name) => {
    const path = name.startsWith('/') ? name : '/' + name;
    const cacheKey = volume + ':' + path;
    if (subFileCache.has(cacheKey)) {
        return subFileCache.get(cacheKey);
    }
    let lines;
    try {
        const content = await fileReadAsync(volume, path);
        lines = content.split('\n');
    } catch (e) {
        console.warn('$.../run=' + name + ' could not be loaded: ' + e.message);
        lines = [];
    }
    subFileCache.set(cacheKey, lines);
    return lines;
};

// Recursively expands $sd/run=/$localfs/run= lines in place, returning a
// flat array mixing plain line strings with PUSH_JOB_SCOPE/POP_JOB_SCOPE
// sentinel objects. Every other line passes through unchanged.
const expandProgram = async (lines) => {
    const out = [];
    for (const rawLine of lines) {
        const stripped = stripComments(rawLine);
        const ref = stripped.length ? matchSubFileRun(stripped) : null;
        if (!ref) {
            out.push(rawLine);
            continue;
        }
        const subLines = await fetchSubFileLines(ref.volume, ref.name);
        const expandedSub = await expandProgram(subLines);
        out.push(PUSH_JOB_SCOPE);
        for (const l of expandedSub) {
            out.push(l);
        }
        out.push(POP_JOB_SCOPE);
    }
    return out;
};
