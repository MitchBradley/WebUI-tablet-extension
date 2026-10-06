// Probe Wizard, ported from the P4 tablet UI (FluidNC TabletGui's Probe
// pane).  A modal overlay, opened from the menu, that builds and sends a
// G38.2 probe sequence.  The Edge operation probes one axis:
//
// - Coordinate mode: G53 machine target, G91 relative distance, or G90
//   absolute target.  In relative mode, the sign of Distance is the probe
//   direction.
// - Axis: X, Y, or Z.
// - Fast row: feed rate, distance/target, retract, and touch plate
//   thickness (sent as P).
// - Optional Slow row: after the fast probe and its retract, probe again
//   slowly for a more accurate touch.  The fast retract is what backs off
//   the surface first, so it must be nonzero.  The thickness then applies
//   to the slow probe only.
//
// The Bore operation finds the center of a hole or pocket in X, Y, or X then
// Y, starting from somewhere inside it at probing depth.  For each axis it
// probes the - wall, returns to the start, probes the + wall, and moves to
// the midpoint, all in G-code using #5061/#5062 (the last probe position, in
// machine coordinates), so a saved Bore probe runs on its own.  The midpoint
// of any chord is the center in that axis, so starting off-center is fine,
// and Y is then probed through the true center.  With the Slow row on, each
// wall is re-probed slowly after backing off by Retract.  Zero WCS sets the
// current work coordinate system's origin at the center.  Tip Dia is used
// only to report the hole's size.
//
// The preview shows exactly the commands Send will issue.  If the sequence
// changes the distance mode, it saves #<_incremental> first and restores
// G90/G91 from it at the end, so the controller itself records the mode
// in effect when the sequence runs - whether from Send or from a saved
// file.
// Values are typed with the GCode keyboard's value mode.
//
// Save writes the sequence as a runnable G-code file in /localfs/probe or
// /sd/probe, whose first line is a "(probewiz key=value ...)" comment
// holding the wizard's settings.  Anything that can run a file can run a
// saved probe; Load reads the comment back into the wizard.  Save and Load
// need the WebUI v2 file transport (filetransport.js), so they are hidden
// in hosts without it.
const probewiz = {
    hwrap: null,
    op: 'Edge',         // 'Edge' or 'Bore'
    mode: 'Relative',   // Edge: 'Machine', 'Relative', or 'Absolute'
    axis: 'X',          // Edge: 'X', 'Y', or 'Z'
    boreAxes: 'XY',     // Bore: 'X', 'Y', or 'XY'
    zeroWcs: false,     // Bore: zero the current WCS at the center
    slow: false,
    values: {
        feed: '100', dist: '25', retract: '2', thickness: '0',
        feed2: '50', dist2: '5', retract2: '2', thickness2: '0',
        search: '10', tip: '0',   // Bore
    },
    inputs: {},          // the value fields, by the same keys as values
    hops: {},
    hmodes: {},
    hmodeGroup: null,
    haxes: {},
    haxisGroup: null,
    hboreAxes: {},
    hboreGroup: null,
    hzero: null,
    hthicknessHeader: null,
    hslow: null,
    hdistHeader: null,
    hpreview: null,
    hsend: null,
    hsave: null,
    hloadDlg: null,
    hloadList: null,
    hloadStatus: null,

    // filetransport.js volume names
    volumes: [['flash', 'Flash', '/localfs'], ['sd', 'SD', '/sd']],
    // The edit target for the Save filename, so the keyboard remembers the
    // last name saved or loaded
    saveTarget: { value: '' },
    // Set when Save found an existing file of this name; pressing the
    // button again (relabeled Overwrite) replaces it
    overwriteName: '',
    hindicator: null,
    hresult: null,
    hfileMsg: null,      // "Saved/Loaded <file>", cleared by any change

    // Probe results still expected from the last Send - one per G38.2
    pending: 0,
    probedAxis: '',
    // Bore: the wall each G38.2 of the last Send probes, e.g. 'X-', in
    // order, and the latest machine position reported for each wall
    touchTags: [],
    touches: {},

    ops: ['Edge', 'Bore'],
    modes: [['Machine', 'G53 mpos'], ['Relative', 'G91 rel'], ['Absolute', 'G90 abs']],
    axes: ['X', 'Y', 'Z'],
    boreAxisChoices: ['X', 'Y', 'XY'],

    num: (key) => {
        const v = parseFloat(probewiz.values[key]);
        return isNaN(v) ? 0 : v;
    },

    // Bounds every value, so generated and saved lines stay well under
    // FluidNC's line length limit.  Matches the P4 UI's 5-6 digit fields.
    maxValue: 999999,
    outOfRange: () => Object.keys(probewiz.values).some((key) => Math.abs(probewiz.num(key)) > probewiz.maxValue),

    // Returns the command list Send would issue, or an empty list if the
    // values do not make sense yet.
    buildCommands: () => {
        if (probewiz.outOfRange()) {
            return [];
        }
        const cmds = probewiz.op === 'Bore' ? probewiz.buildBore() : probewiz.buildEdge();
        // Restore the distance mode in effect when the sequence starts
        if (cmds.some((cmd) => /\bG9[01]\b/.test(cmd))) {
            cmds.unshift('#<saved_incremental>=#<_incremental>');
            cmds.push('G[90+#<saved_incremental>]');
        }
        return cmds;
    },

    buildEdge: () => {
        const cmds = [];
        const mode = probewiz.mode;
        const relative = mode === 'Relative';
        const axis = probewiz.axis;
        const feed = probewiz.num('feed');
        const dist = probewiz.num('dist');
        // Only the magnitude says whether a retract is in use
        const retract = Math.abs(probewiz.num('retract'));

        // In relative mode dist is a signed delta, so only zero is invalid.
        // An absolute or machine target of 0 is a legitimate coordinate.
        if (feed <= 0 || (relative && dist === 0)) {
            return cmds;
        }
        // The slow probe needs the fast retract to back off the surface,
        // or it would trigger immediately
        if (probewiz.slow && retract <= 0.001) {
            return cmds;
        }

        const g53 = mode === 'Machine' ? 'G53 ' : '';
        const probeMove = (target, moveFeed, thickness, prefix) => {
            let cmd = `${prefix}${g53}G38.2 ${axis}${target.toFixed(3)} F${moveFeed.toFixed(0)}`;
            if (thickness > 0.001) {
                cmd += ` P${thickness.toFixed(2)}`;
            }
            cmds.push(cmd);
        };

        // Returns true if the caller must put G90 back on the next motion
        // line - only between the fast retract and the slow probe in
        // absolute mode.
        const retractMove = (target, moveRetract, moreMotionFollows) => {
            const magnitude = Math.abs(moveRetract);
            if (magnitude <= 0.001) {
                return false;
            }
            if (relative) {
                // Already in G91.  Back off opposite to the approach; the
                // sign typed for Retract is ignored.
                const signed = target < 0 ? magnitude : -magnitude;
                cmds.push(`G0 ${axis}${signed.toFixed(2)}`);
                return false;
            }
            // target is a coordinate, not a direction, so Retract's own
            // sign says which way to back off.  The retract is always
            // relative to where the probe stopped.
            cmds.push(`G91 G0 ${axis}${moveRetract.toFixed(2)}`);
            return moreMotionFollows && mode === 'Absolute';
        };

        const initialPrefix = relative ? 'G91 ' : mode === 'Absolute' ? 'G90 ' : '';
        const twoPhase = probewiz.slow && retract > 0.001;
        // Thickness applies to the probe whose result is used
        probeMove(dist, feed, twoPhase ? 0 : probewiz.num('thickness'), initialPrefix);

        // Pass Retract signed: outside relative mode its sign is the
        // retract direction
        if (twoPhase) {
            const needsG90 = retractMove(dist, probewiz.num('retract'), true);
            const feed2 = probewiz.num('feed2');
            const dist2 = probewiz.num('dist2');
            if (feed2 > 0 && (!relative || dist2 !== 0)) {
                probeMove(dist2, feed2, probewiz.num('thickness2'), needsG90 ? 'G90 ' : '');
                retractMove(dist2, probewiz.num('retract2'), false);
            }
        } else {
            retractMove(dist, probewiz.num('retract'), false);
        }
        return cmds;
    },

    // Bore distances are magnitudes; the wall being probed gives the sign
    buildBore: () => {
        const cmds = [];
        const feed = probewiz.num('feed');
        const search = Math.abs(probewiz.num('search'));
        const retract = Math.abs(probewiz.num('retract'));
        const feed2 = probewiz.num('feed2');
        const search2 = Math.abs(probewiz.num('dist2'));
        if (feed <= 0 || search <= 0.001) {
            return cmds;
        }
        if (probewiz.slow && (retract <= 0.001 || feed2 <= 0 || search2 <= 0.001)) {
            return cmds;
        }
        const fmt = (v) => v.toFixed(3);

        // Probes the wall in direction dir (-1 or 1), re-probing slowly if
        // the Slow row is on
        const touch = (axis, dir) => {
            cmds.push(`G91 G38.2 ${axis}${fmt(dir * search)} F${feed.toFixed(0)}`);
            if (probewiz.slow) {
                cmds.push(`G91 G0 ${axis}${fmt(-dir * retract)}`);
                cmds.push(`G91 G38.2 ${axis}${fmt(dir * search2)} F${feed2.toFixed(0)}`);
            }
        };

        const axes = probewiz.boreAxes.split('');
        axes.forEach((axis) => {
            const a = axis.toLowerCase();
            const probeParam = axis === 'X' ? '#5061' : '#5062';
            const start = `#<bore_${a}0>`;
            const minus = `#<bore_${a}m>`;
            const plus = `#<bore_${a}p>`;
            // Machine positions, so the G53 moves need no offset arithmetic
            cmds.push(`${start}=#<_abs_${a}>`);
            touch(axis, -1);
            cmds.push(`${minus}=${probeParam}`);
            cmds.push(`G53 G0 ${axis}${start}`);
            touch(axis, 1);
            cmds.push(`${plus}=${probeParam}`);
            cmds.push(`G53 G0 ${axis}[[${minus}+${plus}]/2]`);
        });
        if (probewiz.zeroWcs) {
            cmds.push(`G10 L20 P0 ${axes.map((axis) => axis + '0').join(' ')}`);
        }
        return cmds;
    },

    update: () => {
        if (!probewiz.hwrap) {
            return;  // Not built yet - modal reports can arrive first
        }
        // Every change to the settings comes through here
        probewiz.setFileMsg('');
        const bore = probewiz.op === 'Bore';
        const relative = probewiz.mode === 'Relative';
        const show = (elem, visible) => { elem.style.display = visible ? '' : 'none'; };
        probewiz.ops.forEach((op) => probewiz.hops[op].classList.toggle('pw-sel', op === probewiz.op));
        probewiz.modes.forEach(([mode]) => probewiz.hmodes[mode].classList.toggle('pw-sel', mode === probewiz.mode));
        probewiz.axes.forEach((axis) => probewiz.haxes[axis].classList.toggle('pw-sel', axis === probewiz.axis));
        probewiz.boreAxisChoices.forEach((axes) => probewiz.hboreAxes[axes].classList.toggle('pw-sel', axes === probewiz.boreAxes));
        probewiz.hzero.classList.toggle('pw-sel', probewiz.zeroWcs);
        show(probewiz.hmodeGroup, !bore);
        show(probewiz.haxisGroup, !bore);
        show(probewiz.hboreGroup, bore);
        probewiz.hdistHeader.textContent = bore ? 'Search' : relative ? 'Distance' : 'Target';
        probewiz.hthicknessHeader.textContent = bore ? 'Tip Dia' : 'Thickness';
        show(probewiz.inputs.dist, !bore);
        show(probewiz.inputs.search, bore);
        show(probewiz.inputs.thickness, !bore);
        show(probewiz.inputs.tip, bore);
        probewiz.hslow.classList.toggle('pw-sel', probewiz.slow);
        ['feed2', 'dist2', 'retract2', 'thickness2'].forEach((key) => {
            probewiz.inputs[key].disabled = !probewiz.slow;
        });
        // The fast thickness is not used when the slow probe runs; its
        // value is kept for when the slow probe is turned off again
        probewiz.inputs.thickness.disabled = probewiz.slow;
        if (bore) {
            // Retract only backs off before a slow re-probe, and the slow
            // probe is followed by a G53 move rather than a retract
            probewiz.inputs.retract.disabled = !probewiz.slow;
            probewiz.inputs.retract2.disabled = true;
            probewiz.inputs.thickness2.disabled = true;
        } else {
            probewiz.inputs.retract.disabled = false;
        }

        const cmds = probewiz.buildCommands();
        probewiz.hsend.disabled = cmds.length === 0;
        if (probewiz.hsave) {
            probewiz.hsave.disabled = cmds.length === 0;
        }
        if (cmds.length) {
            probewiz.hpreview.textContent = cmds.join('\n');
        } else if (probewiz.outOfRange()) {
            probewiz.hpreview.textContent = `Error: values must be between -${probewiz.maxValue} and ${probewiz.maxValue}`;
        } else if (probewiz.slow && Math.abs(probewiz.num('retract')) <= 0.001) {
            probewiz.hpreview.textContent = 'Error: Retract is necessary between probing cycles';
        } else if (bore) {
            probewiz.hpreview.textContent = '(enter a valid feed rate/search distance)';
        } else {
            probewiz.hpreview.textContent = '(enter a valid feed rate/distance)';
        }
    },

    setFileMsg: (text) => {
        if (probewiz.hfileMsg) {
            probewiz.hfileMsg.textContent = text;
        }
    },

    setResult: (color, text) => {
        probewiz.hindicator.style.background = color;
        probewiz.hresult.textContent = text;
    },

    send: () => {
        const cmds = probewiz.buildCommands();
        if (!cmds.length) {
            return;
        }
        tabletClick();
        probewiz.setFileMsg('');
        probewiz.probedAxis = probewiz.op === 'Bore' ? '' : probewiz.axis;
        const probes = cmds.filter((cmd) => cmd.includes('G38.2'));
        probewiz.pending = probes.length;
        // e.g. "G91 G38.2 X-10.000 F100" -> 'X-'
        probewiz.touchTags = probes.map((cmd) => {
            const m = cmd.match(/G38\.2 ([XYZ])(-?)/);
            return m ? m[1] + (m[2] || '+') : '';
        });
        probewiz.touches = {};
        probewiz.setResult('gray', probewiz.op === 'Bore' ? `Probing bore ${probewiz.boreAxes}...` : `Probing ${probewiz.axis}...`);
        cmds.forEach((cmd) => sendCommand(cmd));
    },

    // Called from grbl.js for a [PRB:...] report while probes are pending.
    // mpos is the machine position for every axis; success is the report's
    // final flag.
    probeResult: (mpos, success) => {
        if (!success) {
            probewiz.probeFailed('Probe did not trigger');
            return;
        }
        if (!probewiz.probedAxis) {
            probewiz.boreResult(mpos);
            return;
        }
        probewiz.pending--;
        const value = mpos[probewiz.axes.indexOf(probewiz.probedAxis)];
        const where = value === undefined ? '' : `\n${probewiz.probedAxis}: ${value.toFixed(3)}`;
        if (probewiz.pending > 0) {
            probewiz.setResult('gray', `Fast probe touched${where}`);
        } else {
            probewiz.setResult('green', `SUCCESS${where}`);
        }
    },

    // Records a Bore touch.  Later touches of the same wall (the slow
    // re-probe) replace earlier ones.  After the last, shows the center and
    // size per axis, in machine coordinates.
    boreResult: (mpos) => {
        const tag = probewiz.touchTags[probewiz.touchTags.length - probewiz.pending];
        probewiz.pending--;
        if (tag) {
            probewiz.touches[tag] = mpos[probewiz.axes.indexOf(tag[0])];
        }
        if (probewiz.pending > 0) {
            const total = probewiz.touchTags.length;
            probewiz.setResult('gray', `Probing bore ${probewiz.boreAxes}... ${total - probewiz.pending} of ${total} touches`);
            return;
        }
        const tip = Math.abs(probewiz.num('tip'));
        const centers = [];
        const sizes = [];
        probewiz.boreAxes.split('').forEach((axis) => {
            const m = probewiz.touches[axis + '-'];
            const p = probewiz.touches[axis + '+'];
            if (m !== undefined && p !== undefined) {
                centers.push(`${axis} ${((m + p) / 2).toFixed(3)}`);
                sizes.push(`${axis} ${(p - m + tip).toFixed(3)}`);
            }
        });
        probewiz.setResult('green', `SUCCESS\nCenter (mpos) ${centers.join('  ')}\nSize ${sizes.join('  ')}`);
    },

    // Called from grbl.js on a failed probe, alarm, or reset while probes
    // are pending
    probeFailed: (msg) => {
        probewiz.pending = 0;
        probewiz.setResult('red', `FAILED\n${msg}`);
    },

    el: (type, cssclass, text) => {
        const e = document.createElement(type);
        if (cssclass) {
            e.className = cssclass;
        }
        if (text !== undefined) {
            e.textContent = text;
        }
        return e;
    },

    button: (parent, cssclass, text, fn) => {
        const b = probewiz.el('button', cssclass, text);
        b.type = 'button';
        b.addEventListener('click', fn);
        parent.appendChild(b);
        return b;
    },

    // e.g. "Fast Rate" or "Slow Target" - the row and the column header
    fieldLabel: (key) => {
        const row = key.endsWith('2') ? 'Slow' : 'Fast';
        const bore = probewiz.op === 'Bore';
        const column = {
            feed: 'Rate',
            dist: bore ? 'Search' : probewiz.mode === 'Relative' ? 'Distance' : 'Target',
            search: 'Search',
            retract: 'Retract',
            thickness: 'Thickness',
            tip: 'Tip Dia',
        }[key.replace(/2$/, '')];
        return `${row} ${column}`;
    },

    valueField: (parent, key) => {
        const input = probewiz.el('input', 'pw-value');
        input.type = 'text';
        input.readOnly = true;
        input.value = probewiz.values[key];
        input.addEventListener('click', () => {
            gcodekbd.openValue(input, probewiz.fieldLabel(key), () => {
                probewiz.values[key] = input.value.trim();
                probewiz.update();
            });
        });
        parent.appendChild(input);
        probewiz.inputs[key] = input;
    },

    init: () => {
        const el = probewiz.el;
        const wrap = el('div');
        wrap.id = 'pwWrap';
        const pad = el('div');
        pad.id = 'pwPad';
        wrap.appendChild(pad);

        const title = el('div', 'pw-title');
        title.appendChild(el('span', '', 'Probe Wizard'));
        probewiz.button(title, 'pw-close', '✕', probewiz.hide);
        pad.appendChild(title);

        const selectors = el('div', 'pw-selectors');
        const ops = el('div', 'pw-group');
        ops.appendChild(el('span', 'pw-group-label', 'Probe'));
        probewiz.ops.forEach((op) => {
            probewiz.hops[op] = probewiz.button(ops, 'pw-btn', op, () => {
                probewiz.op = op;
                probewiz.update();
            });
        });
        selectors.appendChild(ops);
        const modes = el('div', 'pw-group');
        probewiz.hmodeGroup = modes;
        modes.appendChild(el('span', 'pw-group-label', 'Mode'));
        probewiz.modes.forEach(([mode, label]) => {
            probewiz.hmodes[mode] = probewiz.button(modes, 'pw-btn', label, () => {
                probewiz.mode = mode;
                probewiz.update();
            });
        });
        selectors.appendChild(modes);
        const axes = el('div', 'pw-group');
        probewiz.haxisGroup = axes;
        axes.appendChild(el('span', 'pw-group-label', 'Axis'));
        probewiz.axes.forEach((axis) => {
            probewiz.haxes[axis] = probewiz.button(axes, 'pw-btn pw-axis', axis, () => {
                probewiz.axis = axis;
                probewiz.update();
            });
        });
        selectors.appendChild(axes);
        const boreGroup = el('div', 'pw-group');
        probewiz.hboreGroup = boreGroup;
        boreGroup.appendChild(el('span', 'pw-group-label', 'Axis'));
        probewiz.boreAxisChoices.forEach((choice) => {
            probewiz.hboreAxes[choice] = probewiz.button(boreGroup, 'pw-btn pw-axis', choice, () => {
                probewiz.boreAxes = choice;
                probewiz.update();
            });
        });
        probewiz.hzero = probewiz.button(boreGroup, 'pw-btn pw-zero', 'Zero WCS', () => {
            probewiz.zeroWcs = !probewiz.zeroWcs;
            probewiz.update();
        });
        selectors.appendChild(boreGroup);
        pad.appendChild(selectors);

        const grid = el('div', 'pw-grid');
        grid.appendChild(el('div'));
        grid.appendChild(el('div', 'pw-header', 'Rate'));
        probewiz.hdistHeader = el('div', 'pw-header', 'Distance');
        grid.appendChild(probewiz.hdistHeader);
        grid.appendChild(el('div', 'pw-header', 'Retract'));
        probewiz.hthicknessHeader = el('div', 'pw-header', 'Thickness');
        grid.appendChild(probewiz.hthicknessHeader);
        grid.appendChild(el('div', 'pw-rowlabel', 'Fast'));
        // Bore's search and tip fields share the dist and thickness cells;
        // update() shows one of each pair
        ['feed', 'dist', 'search', 'retract', 'thickness', 'tip'].forEach((key) => probewiz.valueField(grid, key));
        probewiz.hslow = probewiz.button(grid, 'pw-btn pw-slow', 'Slow', () => {
            probewiz.slow = !probewiz.slow;
            probewiz.update();
        });
        ['feed2', 'dist2', 'retract2', 'thickness2'].forEach((key) => probewiz.valueField(grid, key));
        pad.appendChild(grid);

        const action = el('div', 'pw-action');
        probewiz.hpreview = el('pre', 'pw-preview');
        action.appendChild(probewiz.hpreview);
        const actionButtons = el('div', 'pw-action-buttons');
        probewiz.hsend = probewiz.button(actionButtons, 'pw-send', 'Send', probewiz.send);
        if (probewiz.canSave()) {
            probewiz.hsave = probewiz.button(actionButtons, 'pw-btn', 'Save', probewiz.showSave);
            probewiz.button(actionButtons, 'pw-btn', 'Load', probewiz.showLoad);
        }
        action.appendChild(actionButtons);
        pad.appendChild(action);

        const resultHead = el('div', 'pw-result-head');
        probewiz.hindicator = el('span', 'pw-indicator');
        resultHead.appendChild(probewiz.hindicator);
        resultHead.appendChild(el('span', '', 'PROBE RESULT'));
        // Under Load, at the right
        probewiz.hfileMsg = el('span', 'pw-file-msg');
        resultHead.appendChild(probewiz.hfileMsg);
        pad.appendChild(resultHead);
        probewiz.hresult = el('pre', 'pw-result', 'No probe data');
        pad.appendChild(probewiz.hresult);

        if (probewiz.canSave()) {
            probewiz.buildLoadDialog(pad);
        }

        document.body.appendChild(wrap);
        probewiz.hwrap = wrap;
        probewiz.update();
    },

    show: () => {
        probewiz.update();
        probewiz.hwrap.classList.add('open');
    },

    hide: () => {
        probewiz.hideDialogs();
        probewiz.hwrap.classList.remove('open');
    },

    // ---- Save and Load ----

    canSave: () => typeof fileUpload === 'function' && typeof fileList === 'function' &&
        typeof fileRead === 'function' && typeof fileCreateDir === 'function',

    // The settings comment, one line per group so that no line approaches
    // FluidNC's line length limit.  Values are saved as parsed numbers,
    // limited by maxValue and to 4 decimal places, so nothing typed in a
    // field (e.g. a parenthesis) can break the comment or lengthen it.
    headerLines: [
        ['mode', 'axis', 'slow'],
        ['feed', 'dist', 'retract', 'thickness'],
        ['feed2', 'dist2', 'retract2', 'thickness2'],
        ['op', 'bore', 'zero', 'search', 'tip'],
    ],

    makeHeader: () => probewiz.headerLines.map((keys) => {
        const pairs = keys.map((key) => {
            if (key === 'mode') return `mode=${probewiz.mode}`;
            if (key === 'axis') return `axis=${probewiz.axis}`;
            if (key === 'slow') return `slow=${probewiz.slow ? 1 : 0}`;
            if (key === 'op') return `op=${probewiz.op}`;
            if (key === 'bore') return `bore=${probewiz.boreAxes}`;
            if (key === 'zero') return `zero=${probewiz.zeroWcs ? 1 : 0}`;
            return `${key}=${parseFloat(probewiz.num(key).toFixed(4))}`;
        });
        return `(probewiz ${pairs.join(' ')})`;
    }),

    // Loads settings from a saved file's text, from the settings comment
    // lines at its start.  Returns false if it has none.
    applyHeader: (text) => {
        const pairs = [];
        for (const line of text.split('\n')) {
            const m = line.match(/^\(probewiz ([^)]*)\)\s*$/);
            if (!m) {
                break;
            }
            pairs.push(...m[1].trim().split(/\s+/));
        }
        if (!pairs.length) {
            return false;
        }
        // Files saved before Bore existed have no op
        probewiz.op = 'Edge';
        pairs.forEach((pair) => {
            const [key, value] = pair.split('=');
            if (key === 'mode') {
                if (probewiz.modes.some(([mode]) => mode === value)) {
                    probewiz.mode = value;
                }
            } else if (key === 'axis') {
                if (probewiz.axes.includes(value)) {
                    probewiz.axis = value;
                }
            } else if (key === 'slow') {
                probewiz.slow = value === '1';
            } else if (key === 'op') {
                if (probewiz.ops.includes(value)) {
                    probewiz.op = value;
                }
            } else if (key === 'bore') {
                if (probewiz.boreAxisChoices.includes(value)) {
                    probewiz.boreAxes = value;
                }
            } else if (key === 'zero') {
                probewiz.zeroWcs = value === '1';
            } else if (key in probewiz.values && !isNaN(parseFloat(value))) {
                probewiz.values[key] = value;
                probewiz.inputs[key].value = value;
            }
        });
        probewiz.update();
        return true;
    },

    dialog: (pad, titleText) => {
        const dlg = probewiz.el('div', 'pw-dialog');
        dlg.appendChild(probewiz.el('div', 'pw-dialog-title', titleText));
        pad.appendChild(dlg);
        return dlg;
    },

    hideDialogs: () => {
        if (probewiz.hloadDlg) {
            probewiz.hloadDlg.classList.remove('open');
        }
    },

    // Save uses the GCode keyboard as its dialog: text mode for the name,
    // with Save Flash and Save SD buttons
    showSave: () => {
        probewiz.hideDialogs();
        if (!probewiz.buildCommands().length) {
            return;
        }
        probewiz.overwriteName = '';
        gcodekbd.openValue(probewiz.saveTarget, 'Filename', null, 'text', {
            actions: probewiz.volumes.map(([volume, label]) => ({
                label: `Save ${label}`,
                fn: (name, button) => probewiz.saveFile(volume, label, name, button),
            })),
            onEdit: probewiz.resetOverwrite,
        });
    },

    // Called when the name changes, so a pending Overwrite confirmation
    // does not carry over to a different file
    resetOverwrite: () => {
        probewiz.overwriteName = '';
        gcodekbd.resetActionLabels();
        gcodekbd.setStatus('');
    },

    volumeRoot: (volume) => probewiz.volumes.find(([v]) => v === volume)[2],

    // Names of the files in a listing response, or [] if it is not one
    listedFiles: (response) => {
        try {
            const listing = JSON.parse(response);
            return (listing.files || []).filter((f) => String(f.size) !== '-1').map((f) => f.name);
        } catch (e) {
            return [];
        }
    },

    // button is the Save Flash/Save SD key that was pressed; it becomes
    // "Overwrite ..." if the file exists, and pressing it again replaces it
    saveFile: (volume, volumeLabel, rawName, button) => {
        const status = gcodekbd.setStatus;
        const name = rawName.trim().replace(/\.nc$/i, '');
        if (!/^[A-Za-z0-9_-]+$/.test(name)) {
            status('Name may contain only letters, digits, _ and -');
            return;
        }
        const cmds = probewiz.buildCommands();
        if (!cmds.length) {
            status('Nothing to save - the settings are not valid yet');
            return;
        }
        const filename = name + '.nc';
        const fullName = `${probewiz.volumeRoot(volume)}/probe/${filename}`;
        const content = [...probewiz.makeHeader(), ...cmds].join('\n') + '\n';
        const failed = (code) => {
            status(`Could not save ${fullName} (error ${code})`);
        };
        const upload = () => {
            const file = new File([content], filename, { type: 'text/plain' });
            fileUpload(volume, '/probe/', [file], null, () => {
                gcodekbd.close();  // Also remembers the name for next time
                probewiz.setFileMsg(`Saved ${fullName}`);
            }, failed);
        };
        if (probewiz.overwriteName === fullName) {
            upload();
            return;
        }
        probewiz.resetOverwrite();
        status('Saving...');
        // Create the probe directory if needed - an error here usually just
        // means it already exists - then check for an existing file
        const checkExisting = () => {
            fileList(volume, '/probe/', (response) => {
                if (probewiz.listedFiles(response).includes(filename)) {
                    probewiz.overwriteName = fullName;
                    button.textContent = `Overwrite ${volumeLabel}`;
                    status(`${fullName} already exists`);
                } else {
                    upload();
                }
            }, failed);
        };
        fileCreateDir(volume, '/', 'probe', checkExisting, checkExisting);
    },

    buildLoadDialog: (pad) => {
        const el = probewiz.el;
        const dlg = probewiz.dialog(pad, 'Load Probe');
        probewiz.hloadList = el('div', 'pw-load-list');
        dlg.appendChild(probewiz.hloadList);
        probewiz.hloadStatus = el('div', 'pw-dialog-status');
        dlg.appendChild(probewiz.hloadStatus);
        const buttons = el('div', 'pw-dialog-buttons');
        probewiz.button(buttons, 'pw-btn', 'Cancel', probewiz.hideDialogs);
        dlg.appendChild(buttons);
        probewiz.hloadDlg = dlg;
    },

    showLoad: () => {
        probewiz.hideDialogs();
        const list = probewiz.hloadList;
        const status = probewiz.hloadStatus;
        list.innerHTML = '';
        status.textContent = 'Reading saved probes...';
        probewiz.hloadDlg.classList.add('open');

        // List both locations, then show their files together.  A location
        // that cannot be listed - no SD card, or no probe directory yet -
        // just contributes nothing.
        const found = [];
        let remaining = probewiz.volumes.length;
        const done = () => {
            if (--remaining > 0) {
                return;
            }
            found.sort((a, b) => a.name.localeCompare(b.name));
            found.forEach(({ volume, name }) => {
                const fullName = `${probewiz.volumeRoot(volume)}/probe/${name}`;
                probewiz.button(list, 'pw-btn pw-load-item', fullName, () => {
                    status.textContent = `Reading ${fullName}...`;
                    fileRead(volume, fullName, (text) => {
                        if (probewiz.applyHeader(text)) {
                            probewiz.hideDialogs();
                            // After applyHeader(), whose update() clears it
                            probewiz.setFileMsg(`Loaded ${fullName}`);
                            // Offer the same name when saving
                            probewiz.saveTarget.value = name.replace(/\.nc$/i, '');
                        } else {
                            status.textContent = `${fullName} is not a Probe Wizard file`;
                        }
                    }, (code) => {
                        status.textContent = `Could not read ${fullName} (error ${code})`;
                    });
                });
            });
            status.textContent = found.length ? '' : 'No saved probes in /localfs/probe or /sd/probe';
        };
        probewiz.volumes.forEach(([volume]) => {
            fileList(volume, '/probe/', (response) => {
                probewiz.listedFiles(response)
                    .filter((name) => /\.nc$/i.test(name))
                    .forEach((name) => found.push({ volume, name }));
                done();
            }, done);
        });
    },
};
