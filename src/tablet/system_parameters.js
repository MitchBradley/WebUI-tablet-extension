// JavaScript version of the FluidNC C++ code for predefined parameters
/*
const bool_params = new Map([
    [5070, probe_succeeded],
    // [5399, m66okay],
]);

const axis_params = new Map([
    [5161, 'G28'],
    [5181, 'G30'],
    // [5211, 'G92'],  // Non-persisent, handled specially
    [5221, 'G54'],
    [5241, 'G55'],
    [5261, 'G56'],
    [5281, 'G57'],
    [5301, 'G58'],
    [5321, 'G59'],
    // [5341, 'G59_1'],  // Not implemented
    // [5361, 'G59_2'],  // Not implemented
    // [5381, 'G59_3'],  // Not implemented
    // [5401, 'TLO'],
]);

const work_positions = new Map([
    ['_x', 0],
    ['_y', 1],
    ['_z', 2],
    ['_a', 3],
    ['_b', 4],
    ['_c', 5],
    // { '_u', 0},
    // { '_v', 0},
    // { '_w', 0},
]);

const machine_positions = new Map([
    ['_abs_x', 0],
    ['_abs_y', 1],
    ['_abs_z', 2],
    ['_abs_a', 3],
    ['_abs_b', 4],
    ['_abs_c', 5],
    // { '_abs_u', 0},
    // { '_abs_v', 0},
    // { '_abs_w', 0},
]);

const unsupported_sys = [
    '_spindle_rpm_mode',
    '_spindle_css_mode',
    '_ijk_absolute_mode',
    '_lathe_diameter_mode',
    '_lathe_radius_mode',
    '_adaptive_feed'
];

const set_numbered_param = (id, value) => {
    for (const [key, coord_index] of axis_params.entries()) {
        if (key <= id && id < (key + MAX_N_AXIS)) {
            coords[coord_index].set(id - key, value);
            gc_ngc_changed(coord_index);
            return true;
        }
    }
    // Non-volatile G92
    if (id >= 5211 && id < (5211 + MAX_N_AXIS)) {
        gc_state.coord_offset[id - 5211] = value;
        gc_ngc_changed('G92');
        return true;
    }
    if (id == 5220) {
        gc_state.modal.coord_select = value;
        return true;
    }
    if (id == 5400) {
        gc_state.tool = value;
        return true;
    }
    if (id >= 31 && id <= 5000) {
        user_vars.set(id, value);
        return true;
    }
    console.info(`N ${id} is not found`);
    return false;
}

const get_numbered_param = (id) => {
    for (const [key, coord_index] of axis_params.entries()) {
        if (key <= id && id < (key + MAX_N_AXIS)) {
            return coords[coord_index].get(id - key);
        }
    }
    // Non-volatile G92
    if (id >= 5211 && id < (5211 + MAX_N_AXIS)) {
        return gc_state.coord_offset[id - 5211];
    }

    if (id == 5220) {
        return gc_state.modal.coord_select + 1;
    }
    if (id == 5400) {
        return gc_state.tool;
    }

    for (const [key, valuep] of bool_params.entries()) {
        if (key == id) {
            return valuep;
        }
    }
    if (id >= 31 && id <= 5000) {
        return user_vars.get(id);
    }

    return NaN;
}

const set_config_item = (name, value) => {
    try {
        const gci = new GCodeParam(name, value, false);
        config.group(gci);
    } catch (e) {}
}

const get_config_item = (name) => {
    try {
        const gci = new GCodeParam(name, 0, true);
        config.group(gci);

        if (gci.isHandled_) {
            return gci.value;
        }
        console.log(`${name} is missing`);
        return NaN;
    } catch (e) {
        return NaN;
    }
}

const coord_values = [540, 550, 560, 570, 580, 590, 591, 592, 593];

const get_system_param = (name) => {
    const sysn = name.toLowerCase();
    if (work_positions.has(sysn))
        return get_mpos()[work_positions.get(sysn)] - get_wco()[work_positions.get(sysn)];
    if (machine_positions.has(sysn))
        return get_mpos()[machine_positions.get(sysn)];
    if (unsupported_sys.includes(sysn))
        return 0.0;
    switch (sysn) {
    case '_spindle_on':       return gc_state.modal.spindle != 'Disable';
    case '_spindle_cw':       return gc_state.modal.spindle == 'Cw';
    case '_spindle_m':        return gc_state.modal.spindle;
    case '_mist':             return gc_state.modal.coolant.Mist;
    case '_flood':            return gc_state.modal.coolant.Flood;
    case '_speed_override':   return sys.spindle_speed_ovr != 100;
    case '_feed_override':    return sys.f_override != 100;
    case '_feed_hold':        return sys.state == 'Hold';
    case '_feed':             return gc_state.feed_rate;
    case '_rpm':              return gc_state.spindle_speed;
    case '_current_tool':
    case '_selected_tool':    return gc_state.tool;
    case '_vmajor':           return parseInt(grbl_version.split('.')[0]);
    case '_vminor':           return parseInt(grbl_version.split('.')[1]);
    case '_line':             return 0.0;
    case '_motion_mode':      return gc_state.modal.motion;
    case '_plane':            return gc_state.modal.plane_select;
    case '_coord_system':     return coord_values[gc_state.modal.coord_select];
    case '_metric':           return gc_state.modal.units == 'Mm';
    case '_imperial':         return gc_state.modal.units == 'Inches';
    case '_absolute':         return gc_state.modal.distance == 'Absolute';
    case '_incremental':      return gc_state.modal.distance == 'Incremental';
    case '_inverse_time':     return gc_state.modal.feed_rate == 'InverseTime';
    case '_units_per_minute': return gc_state.modal.feed_rate == 'UnitsPerMin';
    case '_units_per_rev':    return 0.0;
    default:                  return NaN;
    }
}

// The LinuxCNC doc says that the EXISTS syntax is like EXISTS[#<_foo>]
// For convenience, we also allow EXISTS[_foo]
const named_param_exists = (name) => {
    let search;
    if (name.length > 3 && name.startsWith('#<') && name.endsWith('>'))
        search = name.slice(2, -1);
    else
        search = name;
    if (search.length == 0)
        return false;
    if (search.startsWith('/'))
        return !isNaN(get_config_item(search))
    if (search.startsWith('_'))
        return !isNaN(get_system_param(search))
    return named_params.has(search);
}
*/
