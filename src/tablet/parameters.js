// Copyright (c) 2024 - Mitch Bradley
// Use of this source code is governed by a GPLv3 license that can be found in the LICENSE file.

const ngc_param_is_rw = (id) => {
    return true;
}

class ParamRef {
    constructor(name = '', id = 0) {
        this.name = name;  // If non-empty, the parameter is named
        this.id = id;      // Valid if name is empty
    }
}

class LinePos {
    constructor(line) {
        this.line = line;  // If non-empty, the parameter is named
        this.pos = 0;      // Valid if name is empty
    }
}

let assignments = [];

// Named params starting with '_' are global (see Parameters.cpp's
// global_named_params) -- shared across every nesting level regardless of
// $sd/run=/$localfs/run= calls.
let named_params = new Map();

// Named params NOT starting with '_' are local to the current file/job (see
// Job.h's JobSource::_local_params) -- a fresh, empty scope per $sd/run=/
// $localfs/run= invocation, discarded when that sub-file finishes, so two
// files (or a file and its caller) can both use e.g. #<row> as a private
// scratch variable without clobbering each other. jobParamStack[0] is the
// scope for the top-level program itself (running any file, including the
// one the user loaded, is "a job" on real hardware -- see Parameters.cpp's
// Job::active() gate). subfile.js pushes/pops on top of this for each
// $sd/run=/$localfs/run= call.
let jobParamStack = [new Map()];

const params_push_job_scope = () => {
    jobParamStack.push(new Map());
};
const params_pop_job_scope = () => {
    if (jobParamStack.length > 1) {
        jobParamStack.pop();
    }
};
const current_job_params = () => jobParamStack[jobParamStack.length - 1];

// We do not implement most predefined parameters because they exist in the
// context of the controller to which we do not have direct access.
// Our primary purpose is visualization of a GCode program and predefined
// parameters are usually not applicable to that.
// Unused system parameter code is in system_parameters.js
//
// The current position is the one exception: toolpath.js's Toolpath does
// track that itself, so #<_abs_x>/#<_abs_y>/#<_abs_z> (absolute machine
// position) and #<_x>/#<_y>/#<_z> (work position) are implemented. Toolpath
// calls set_current_position() every time it moves (see its setPosition()
// and its G92/G92.1 handlers). Toolpath's own `position` field is already
// the work-local (as-programmed) position -- g92offset is added only at
// draw time (see its offsetG92()) to get the absolute/plotted point -- so
// _x/_y/_z read `position` directly and _abs_x/_abs_y/_abs_z add the G92
// offset and the active work coordinate system's offset back in. Toolpath
// now models per-WCS G10 L2/L20 offsets (see toolpath.js's wcsOffsets and
// its 'G10' handler), reported here as wcsx/wcsy/wcsz, so both G92 and a
// non-G54 WCS can shift the absolute position.
let currentPosition = { x: 0, y: 0, z: 0, g92x: 0, g92y: 0, g92z: 0, wcsx: 0, wcsy: 0, wcsz: 0 };
const set_current_position = (pos) => {
    currentPosition = pos;
};
const abs_position_axis = { _abs_x: 'x', _abs_y: 'y', _abs_z: 'z' };
const work_position_axis = { _x: 'x', _y: 'y', _z: 'z' };

const get_system_param = (name) => {
    const key = name.toLowerCase();
    if (key in abs_position_axis) {
        const axis = abs_position_axis[key];
        return currentPosition[axis]
            + currentPosition['g92' + axis]
            + (currentPosition['wcs' + axis] || 0);
    }
    if (key in work_position_axis) {
        const axis = work_position_axis[key];
        return currentPosition[axis];
    }
    return NaN;
};

let user_params = new Map();

// Displayer runs the whole program twice per redraw (bbox-sizing pass, then
// draw pass), each in a fresh Interpreter -- see simple-interpreter.js. Call
// at the start of each pass so #-params (loop counters especially) start
// from a clean slate both times, instead of the draw pass inheriting
// whatever the bbox pass left behind.
const params_init = () => {
    assignments = [];
    named_params.clear();
    user_params.clear();
    jobParamStack = [new Map()];
};

// 5061-5069: last probe position, one param per axis (X=5061, Y=5062,
// Z=5063, ...). 5070: probe_succeeded. Real predefined-parameter ranges
// otherwise stay unimplemented (see the comment above) since they reflect
// controller state we don't have -- but the probe range is different: we
// generate that value ourselves (see toolpath.js's probeMove()), so it's
// ours to provide.
const is_numbered_param_id = (id) => (id >= 1 && id <= 5000) || (id >= 5061 && id <= 5070);

const set_numbered_param = (id, value) => {
    if (is_numbered_param_id(id)) {
        return user_params.set(id, value);
    }
    return false;
}
const get_numbered_param = (id) => {
    if (is_numbered_param_id(id)) {
        let value = user_params.get(id)
        return (value == undefined) ? NaN : value;
    }
    return NaN;
}

const get_config_item = (name) => NaN;
const set_config_item = (name, value) => {}

// Backs EXISTS[...] in expressions (see expression.js's read_unary()).
// LinuxCNC's EXISTS syntax is EXISTS[#<_foo>]; we also accept a bare name
// (EXISTS[_foo]). The argument arrives upper-cased, matching how named
// params are stored (see get_param_ref()). Scoping mirrors get_param():
// '_'-prefixed names are system-or-global, everything else is local to
// the current job/sub-file. Config items (leading '/') aren't modelled
// here, so they never "exist".
const named_param_exists = (name) => {
    let search = name;
    if (search.length > 3 && search.startsWith('#<') && search.endsWith('>')) {
        search = search.slice(2, -1);
    }
    if (search.length === 0) {
        return false;
    }
    if (search.startsWith('/')) {
        return false;
    }
    if (search.startsWith('_')) {
        return !isNaN(get_system_param(search)) || named_params.has(search);
    }
    return current_job_params().has(search);
}

const isAlpha = (c) => {
  return c.toLowerCase() != c.toUpperCase();
}
const get_param = (param_ref) => {
    if (param_ref.name.length) {
        if (param_ref.name.startsWith('/')) {
            return get_config_item(param_ref.name);
        }
        if (param_ref.name.startsWith('_')) {
            const result  = get_system_param(param_ref.name);
            if (!isNaN(result)) {
               return result;
            }
            return named_params.get(param_ref.name);
        }
        return current_job_params().get(param_ref.name);
    }
    return get_numbered_param(param_ref.id);
}

const read_float = (s) => {
    const re = /[+-]?[\d\.]*/
    const tail = s.line.substr(s.pos)
    const num = tail.match(re)[0]
    s.pos += num.length
    return Number(num)
}

const get_param_ref = (s, param_ref) => {
    // Entry condition - the previous character was #
    let c = s.line[s.pos];

    // c is the first character and *pos still points to it
    switch (c) {
        case '#':
            // Indirection resulting in param number
            let next_param_ref = new ParamRef()
            s.pos++;
            if (!get_param_ref(s, next_param_ref)) {
                return false;
            }
            param_ref.id = get_param(next_param_ref)
            return !isNaN(param_ref.id)
        case '<':
            // Named parameter
            s.pos++;
            while ((c = s.line[s.pos]) && c != '>') {
                s.pos++;
                if (!/\s/.test(c)) {
                    param_ref.name += c.toUpperCase();
                }
            }
            if (!c) {
                return false;
            }
            s.pos++;
            return true;
        case '[':
            // Expression evaluating to param number
            param_ref.id = expression(s)
            return !isNaN(param_ref.id)
        default:
            // Param number
            param_ref.id = read_float(s)
            return !isNaN(param_ref.id)
    }
}

const set_param = (param_ref, value) => {
    if (param_ref.name.length) {
        if (param_ref.name.startsWith('/')) {
            set_config_item(param_ref.name, value);
            return;
        }
        if (param_ref.name.startsWith('_')) {
            named_params.set(param_ref.name, value);
        } else {
            current_job_params().set(param_ref.name, value);
        }
        return;
    }

    if (ngc_param_is_rw(param_ref.id)) {
        set_numbered_param(param_ref.id, value);
    }
}

// Gets a numeric value, either a literal number or a #-prefixed parameter value
// Return NaN on error
const read_number = (s, in_expression) => {
    let c = s.line[s.pos];
    if (c == '#') {
        s.pos++;
        let param_ref = new ParamRef();
        if (!get_param_ref(s, param_ref)) {
            return NaN;
        }
        return get_param(param_ref);
    }
    if (c == '[') {
        return expression(s);
    }
    if (in_expression) {
        if (isAlpha(c)) {
            return read_unary(s)
        }
        if (c == '-') {
            s.pos++;
            return -read_number(s, in_expression);
        }
        if (c == '+') {
            s.pos++;
            return read_number(s, in_expression);
        }
    }
    return read_float(s);
}

// Process a #PREF=value assignment, with the initial # already consumed.
// A '#' token not followed by '=' is a bare parameter reference used as a
// value rather than an assignment target -- e.g. "G43 #[400+#<_i>]", where
// the tool-length-offset argument is read this way instead of via a letter
// word. get_param_ref() already consumed it, so there's nothing further to
// do; this isn't an error.
const assign_param = (s) => {
    let param_ref = new ParamRef();

    if (!get_param_ref(s, param_ref)) {
        return false;
    }
    if (s.line[s.pos] != '=') {
        return true;
    }
    s.pos++;

    let value = read_number(s)
    if (isNaN(value)) {
        console.debug('Missing value');
        return false;
    }
    assignments.push([param_ref, value]);

    return true;
}

const perform_assignments = () => {
    for (const [ref, value] of assignments) {
        set_param(ref, value);
    }
    assignments = [];
}
