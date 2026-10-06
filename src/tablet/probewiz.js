// Probe Wizard, ported from the P4 tablet UI (FluidNC TabletGui's Probe
// pane).  A modal overlay, opened from the menu, that builds and sends a
// G38.2 probe sequence for one axis:
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
// The preview shows exactly the commands Send will issue.  If the sequence
// changes the distance mode, it saves #<_incremental> first and restores
// G90/G91 from it at the end, so the controller itself records the mode
// in effect when the sequence runs - whether from Send or from a saved
// file.
// Values are typed with the GCode keyboard's value mode, and are not
// remembered across page loads.
const probewiz = {
    hwrap: null,
    mode: 'Relative',   // 'Machine', 'Relative', or 'Absolute'
    axis: 'X',
    slow: false,
    values: {
        feed: '100', dist: '25', retract: '2', thickness: '0',
        feed2: '50', dist2: '5', retract2: '2', thickness2: '0',
    },
    inputs: {},          // the value fields, by the same keys as values
    hmodes: {},
    haxes: {},
    hslow: null,
    hdistHeader: null,
    hpreview: null,
    hsend: null,
    hindicator: null,
    hresult: null,

    // Probe results still expected from the last Send - one per G38.2
    pending: 0,
    probedAxis: '',

    modes: [['Machine', 'G53 mpos'], ['Relative', 'G91 rel'], ['Absolute', 'G90 abs']],
    axes: ['X', 'Y', 'Z'],

    num: (key) => {
        const v = parseFloat(probewiz.values[key]);
        return isNaN(v) ? 0 : v;
    },

    // Returns the command list Send would issue, or an empty list if the
    // values do not make sense yet.
    buildCommands: () => {
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

        // Restore the distance mode in effect when the sequence starts
        if (cmds.some((cmd) => /\bG9[01]\b/.test(cmd))) {
            cmds.unshift('#<saved_incremental>=#<_incremental>');
            cmds.push('G[90+#<saved_incremental>]');
        }
        return cmds;
    },

    update: () => {
        if (!probewiz.hwrap) {
            return;  // Not built yet - modal reports can arrive first
        }
        const relative = probewiz.mode === 'Relative';
        probewiz.modes.forEach(([mode]) => probewiz.hmodes[mode].classList.toggle('pw-sel', mode === probewiz.mode));
        probewiz.axes.forEach((axis) => probewiz.haxes[axis].classList.toggle('pw-sel', axis === probewiz.axis));
        probewiz.hdistHeader.textContent = relative ? 'Distance' : 'Target';
        probewiz.hslow.classList.toggle('pw-sel', probewiz.slow);
        ['feed2', 'dist2', 'retract2', 'thickness2'].forEach((key) => {
            probewiz.inputs[key].disabled = !probewiz.slow;
        });
        // The fast thickness is not used when the slow probe runs; its
        // value is kept for when the slow probe is turned off again
        probewiz.inputs.thickness.disabled = probewiz.slow;

        const cmds = probewiz.buildCommands();
        probewiz.hsend.disabled = cmds.length === 0;
        if (cmds.length) {
            probewiz.hpreview.textContent = cmds.join('\n');
        } else if (probewiz.slow && Math.abs(probewiz.num('retract')) <= 0.001) {
            probewiz.hpreview.textContent = 'Error: Retract is necessary between probing cycles';
        } else {
            probewiz.hpreview.textContent = '(enter a valid feed rate/distance)';
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
        probewiz.probedAxis = probewiz.axis;
        probewiz.pending = cmds.filter((cmd) => cmd.includes('G38.2')).length;
        probewiz.setResult('gray', `Probing ${probewiz.axis}...`);
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
        probewiz.pending--;
        const value = mpos[probewiz.axes.indexOf(probewiz.probedAxis)];
        const where = value === undefined ? '' : `\n${probewiz.probedAxis}: ${value.toFixed(3)}`;
        if (probewiz.pending > 0) {
            probewiz.setResult('gray', `Fast probe touched${where}`);
        } else {
            probewiz.setResult('green', `SUCCESS${where}`);
        }
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

    valueField: (parent, key) => {
        const input = probewiz.el('input', 'pw-value');
        input.type = 'text';
        input.readOnly = true;
        input.value = probewiz.values[key];
        input.addEventListener('click', () => {
            gcodekbd.openValue(input, () => {
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
        const modes = el('div', 'pw-group');
        probewiz.modes.forEach(([mode, label]) => {
            probewiz.hmodes[mode] = probewiz.button(modes, 'pw-btn', label, () => {
                probewiz.mode = mode;
                probewiz.update();
            });
        });
        selectors.appendChild(modes);
        const axes = el('div', 'pw-group');
        probewiz.axes.forEach((axis) => {
            probewiz.haxes[axis] = probewiz.button(axes, 'pw-btn pw-axis', axis, () => {
                probewiz.axis = axis;
                probewiz.update();
            });
        });
        selectors.appendChild(axes);
        pad.appendChild(selectors);

        const grid = el('div', 'pw-grid');
        grid.appendChild(el('div'));
        grid.appendChild(el('div', 'pw-header', 'Rate'));
        probewiz.hdistHeader = el('div', 'pw-header', 'Distance');
        grid.appendChild(probewiz.hdistHeader);
        grid.appendChild(el('div', 'pw-header', 'Retract'));
        grid.appendChild(el('div', 'pw-header', 'Thickness'));
        grid.appendChild(el('div', 'pw-rowlabel', 'Fast'));
        ['feed', 'dist', 'retract', 'thickness'].forEach((key) => probewiz.valueField(grid, key));
        probewiz.hslow = probewiz.button(grid, 'pw-btn pw-slow', 'Slow', () => {
            probewiz.slow = !probewiz.slow;
            probewiz.update();
        });
        ['feed2', 'dist2', 'retract2', 'thickness2'].forEach((key) => probewiz.valueField(grid, key));
        pad.appendChild(grid);

        const action = el('div', 'pw-action');
        probewiz.hpreview = el('pre', 'pw-preview');
        action.appendChild(probewiz.hpreview);
        probewiz.hsend = probewiz.button(action, 'pw-send', 'Send', probewiz.send);
        pad.appendChild(action);

        const resultHead = el('div', 'pw-result-head');
        probewiz.hindicator = el('span', 'pw-indicator');
        resultHead.appendChild(probewiz.hindicator);
        resultHead.appendChild(el('span', '', 'PROBE RESULT'));
        pad.appendChild(resultHead);
        probewiz.hresult = el('pre', 'pw-result', 'No probe data');
        pad.appendChild(probewiz.hresult);

        document.body.appendChild(wrap);
        probewiz.hwrap = wrap;
        probewiz.update();
    },

    show: () => {
        probewiz.update();
        probewiz.hwrap.classList.add('open');
    },

    hide: () => {
        probewiz.hwrap.classList.remove('open');
    },
};
