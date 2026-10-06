// On-screen keyboard tuned for entering GCode, replacing the device's
// built-in soft keyboard for the MDI boxes.  A general-purpose soft keyboard
// makes you keep switching between letter, number, and punctuation layers;
// this one has a single fixed layout with everything GCode needs - letters,
// digits, and the punctuation used by expressions and parameter references -
// all visible at once.  Letters are upper case, since case does not matter
// in GCode; the Shift key switches them to lower case (until it is pressed
// again) for comments and file names.
//
// Like the numpad, it is a modal overlay with its own edit line.  Tapping an
// attached text box copies its contents into the edit line; Close copies the
// edited text back, and Send also sends it as an MDI command.  A physical
// keyboard can type into the edit line too, with Enter to send and Escape to
// close.
//
// The Wizard key swaps the letter keyboard for a GCode wizard: dropdowns
// that insert modal-group and command words, rows of parameter-letter
// buttons showing just the letters the last-chosen command uses, and
// digit and punctuation rows for the values.  The ABC key swaps back.
const gcodekbd = {
    hwrap: null,     // dimmed full-screen wrapper
    hpad: null,      // the keyboard panel; class 'wizard' selects the wizard view
    hdisplay: null,  // edit line
    hlabel: null,    // label to the left of the edit line
    htoggle: null,   // the Wizard/ABC key
    target: null,    // the text box being edited
    onDone: null,    // value mode: called after Close writes the value back
    valueMode: null, // value mode: 'numeric' or 'text', also the pad's class
    hstatus: null,   // value mode: messages from action buttons
    hactions: null,  // value mode: holds the action buttons, in the bottom row
    hclose: null,
    actionButtons: [], // { button, label } for the current action buttons
    onEdit: null,    // value mode: called when the edit line changes

    letterRows: [
        ['.', '-', '+', '(', ')', '[', ']', '#', '=', '_', '<', '>'],
        ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
        ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
        ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
        ['Shift', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', 'Backspace'],
    ],

    // The letter keyboard's punctuation and digit rows, so they are in the
    // same place in both views
    numberRows: [
        ['.', '-', '+', '(', ')', '[', ']', '#', '=', '_', '<', '>'],
        ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'Backspace'],
    ],

    // Shared by both views
    bottomRow: ['Close', 'Toggle', 'Left', 'Space', 'Right', 'Send'],

    // Keys whose label or action differs from the character they type
    special: {
        Backspace: { label: '&#9003;', css: 'gk-del', fn: () => gcodekbd.backspace() },
        Shift:     { label: '&#8679;', css: 'gk-shift', fn: () => gcodekbd.setLowerCase(!gcodekbd.lowerCase) },
        Left:      { label: '&larr;',  css: 'gk-nav', fn: () => gcodekbd.moveCaret(-1) },
        Right:     { label: '&rarr;',  css: 'gk-nav', fn: () => gcodekbd.moveCaret(1) },
        Space:     { label: 'Space',   css: 'gk-space', fn: () => gcodekbd.insert(' ') },
        // Labeled Cancel in value mode, where it discards the edit
        Close:     { label: 'Close',   css: 'gk-close', fn: () => gcodekbd.valueMode ? gcodekbd.cancel() : gcodekbd.close() },
        Send:      { label: 'Send',    css: 'gk-send', fn: () => gcodekbd.send() },
        Toggle:    { label: 'Wizard',  css: 'gk-toggle', fn: () => gcodekbd.toggleWizard() },
    },

    // Wizard dropdowns.  Option text is "<code> - <description>"; choosing
    // one inserts the code followed by a space.  The command dropdowns also
    // choose which parameter-letter buttons are shown.
    modalSelects: [
        ['Units', ['G20 - Inch', 'G21 - mm']],
        // G90.1/G91.1 (arc IJK distance mode) live with G90/G91
        ['Distance', ['G90 - Absolute', 'G91 - Incremental', 'G90.1 - Absolute Arc', 'G91.1 - Incremental Arc']],
        ['Plane', ['G17 - XY', 'G18 - XZ', 'G19 - YZ']],
        ['Feed Mode', ['G93 - Inverse Time', 'G94 - Units/Min', 'G95 - Units/Rev']],
        // G53 is not modal, but in practice it is an alternative to G54-G59.3
        ['WCS', ['G53 - Machine', 'G54 - WCS 1', 'G55 - WCS 2', 'G56 - WCS 3', 'G57 - WCS 4', 'G58 - WCS 5',
                 'G59 - WCS 6', 'G59.1 - WCS 7', 'G59.2 - WCS 8', 'G59.3 - WCS 9']],
    ],
    commandSelects: [
        ['Motion', ['G0 - Rapid', 'G1 - Feed', 'G2 - CW Arc', 'G3 - CCW Arc']],
        ['Probing', ['G38.2 - Toward, Err', 'G38.3 - Toward', 'G38.4 - Away, Err', 'G38.5 - Away']],
        ['Position', ['G92 - Set Pos', 'G92.1 - Clear Offset', 'G28 - Go Home1', 'G28.1 - Set Home1',
                      'G30 - Go Home2', 'G30.1 - Set Home2', 'G10 L2 - Set WCS', 'G10 L20 - Set WCS Rel']],
        ['Program', ['G4 - Dwell', 'M0 - Stop', 'M1 - Opt Stop', 'M2 - End', 'M30 - End+Rewind']],
        ['Spindle', ['M3 - CW', 'M4 - CCW', 'M5 - Off', 'M6 - Tool Change', 'G43.1 - Tool Offset', 'G49 - Cancel Offset']],
        ['Coolant', ['M7 - Mist', 'M7.1 - Mist Alt', 'M8 - Flood', 'M8.1 - Flood Alt', 'M9 - Off']],
    ],

    // Parameter letters each command uses.  Commands not listed take none.
    // G2/G3's P (helical turns) is handled separately - see updateFields().
    fieldsFor: {
        'G0': 'XYZA', 'G1': 'XYZAF', 'G2': 'XYZAFIJKR', 'G3': 'XYZAFIJKR',
        // G38.n's P is an offset from the found surface
        'G38.2': 'XYZFP', 'G38.3': 'XYZFP', 'G38.4': 'XYZFP', 'G38.5': 'XYZFP',
        'M3': 'S', 'M4': 'S',
        // G43.1 sets a dynamic tool length offset from the given axis value(s)
        'G43.1': 'XYZA',
        'G4': 'P',
        'G92': 'XYZA',
        // P selects which WCS (1-6 for G54-G59)
        'G10 L2': 'XYZAP', 'G10 L20': 'XYZAP',
        'M6': 'T',
    },

    // Axis-letter rows.  Rows with no active letters are blanked rather
    // than removed, so the wizard's height does not change with the
    // command; within a row, inactive letters keep their column.
    axisRows: [
        { name: 'Target', letters: ['X', 'Y', 'Z', 'A'] },
        { name: 'Center', letters: ['I', 'J', 'K', 'R'] },
    ],
    haxisRows: [],   // { row, buttons[] } for each of axisRows

    // The remaining parameters are single letters, and no command uses more
    // than two of them - F plus G2/G3's helical turn count P, or F plus
    // G38.n's offset P - so they share one row of two label/button pairs.
    // That keeps the tallest layout (G2/G3) to three rows.
    hparamRow: null,
    hparamPairs: [], // { label, button } x 2

    lowerCase: false,
    hletters: [],    // the letter keys, relabeled by setLowerCase()
    hshift: null,

    // fn, if given, overrides the key's default action
    makeKey: (parent, key, fn) => {
        const spec = gcodekbd.special[key];
        const button = document.createElement('div');
        button.className = 'gk-key' + (spec ? ' ' + spec.css : '');
        button.innerHTML = spec ? spec.label : key;
        // Keep focus (and so the caret position) in the edit line when a
        // key is pressed.
        button.addEventListener('pointerdown', (event) => event.preventDefault());
        button.addEventListener('mousedown', (event) => event.preventDefault());
        if (!fn && !spec && /^[A-Z]$/.test(key)) {
            // A letter key types its current label, which Shift changes
            gcodekbd.hletters.push(button);
            fn = () => gcodekbd.insert(button.textContent);
        }
        if (key === 'Shift') {
            gcodekbd.hshift = button;
        }
        button.addEventListener('click', fn || (spec ? spec.fn : () => gcodekbd.insert(key)));
        parent.appendChild(button);
        return button;
    },

    setLowerCase: (lower) => {
        gcodekbd.lowerCase = lower;
        gcodekbd.hletters.forEach((button) => {
            button.textContent = lower ? button.textContent.toLowerCase() : button.textContent.toUpperCase();
        });
        gcodekbd.hshift.classList.toggle('gk-active', lower);
    },

    makeRows: (parent, rows) => {
        rows.forEach((row) => {
            const hrow = document.createElement('div');
            hrow.className = 'gk-row';
            row.forEach((key) => gcodekbd.makeKey(hrow, key));
            parent.appendChild(hrow);
        });
    },

    makeSelects: (parent, selects, isCommand) => {
        const strip = document.createElement('div');
        strip.className = 'gk-selects';
        selects.forEach(([title, options]) => {
            const sel = document.createElement('select');
            sel.className = 'gk-select';
            // The placeholder shows the category.  Resetting to it after
            // each choice means that choosing the same option again still
            // fires a change event.
            const placeholder = document.createElement('option');
            placeholder.textContent = title;
            placeholder.value = '';
            placeholder.disabled = true;
            placeholder.hidden = true;
            sel.appendChild(placeholder);
            options.forEach((text) => {
                const opt = document.createElement('option');
                opt.textContent = text;
                opt.value = text.split(' - ')[0];
                sel.appendChild(opt);
            });
            sel.selectedIndex = 0;
            sel.addEventListener('change', () => {
                const code = sel.value;
                sel.selectedIndex = 0;
                gcodekbd.insert(code + ' ');
                if (isCommand) {
                    gcodekbd.updateFields(code);
                }
            });
            strip.appendChild(sel);
        });
        parent.appendChild(strip);
    },

    makeFieldButton: (parent, letter) => {
        // Inserts its current text, since the param row's letters vary
        const button = gcodekbd.makeKey(parent, letter, () => gcodekbd.insert(button.textContent));
        button.classList.add('gk-field');
        return button;
    },

    makeFieldLabel: (parent, text) => {
        const label = document.createElement('div');
        label.className = 'gk-field-label';
        label.textContent = text;
        parent.appendChild(label);
        return label;
    },

    makeFieldRows: (parent) => {
        gcodekbd.axisRows.forEach((row) => {
            const hrow = document.createElement('div');
            hrow.className = 'gk-field-row';
            gcodekbd.makeFieldLabel(hrow, row.name);
            const buttons = row.letters.map((letter) => gcodekbd.makeFieldButton(hrow, letter));
            parent.appendChild(hrow);
            gcodekbd.haxisRows.push({ row: hrow, buttons: buttons });
        });

        // Same grid as the axis rows, so the buttons line up with theirs
        const hrow = document.createElement('div');
        hrow.className = 'gk-field-row';
        for (let i = 0; i < 2; i++) {
            const label = gcodekbd.makeFieldLabel(hrow, '');
            const button = gcodekbd.makeFieldButton(hrow, '');
            gcodekbd.hparamPairs.push({ label: label, button: button });
        }
        parent.appendChild(hrow);
        gcodekbd.hparamRow = hrow;

        gcodekbd.updateFields('');
    },

    updateFields: (code) => {
        const active = gcodekbd.fieldsFor[code] || '';
        const has = (letter) => active.includes(letter);

        gcodekbd.haxisRows.forEach((r) => {
            let any = false;
            r.buttons.forEach((button) => {
                const on = has(button.textContent);
                button.style.visibility = on ? 'visible' : 'hidden';
                any = any || on;
            });
            r.row.classList.toggle('gk-blank', !any);
        });

        // [label, letter] for each single-letter parameter, in display order
        const params = [];
        if (has('F')) {
            params.push(['Feedrate', 'F']);
        }
        if (code === 'G2' || code === 'G3') {
            // Not in fieldsFor, since this P means something different
            params.push(['Turns', 'P']);
        }
        if (has('P')) {
            params.push([code === 'G4' ? 'Dwell' : code.startsWith('G38') ? 'Offset' : 'WCS #', 'P']);
        } else if (has('S')) {
            params.push(['Speed', 'S']);
        } else if (has('T')) {
            params.push(['Tool', 'T']);
        }

        gcodekbd.hparamRow.classList.toggle('gk-blank', !params.length);
        gcodekbd.hparamPairs.forEach((pair, i) => {
            const [name, letter] = params[i] || ['', ''];
            pair.label.textContent = name;
            pair.button.textContent = letter;
            pair.button.style.visibility = letter ? 'visible' : 'hidden';
        });
    },

    init: () => {
        gcodekbd.hwrap = document.createElement('div');
        gcodekbd.hwrap.id = 'gkWrap';

        const pad = document.createElement('div');
        pad.id = 'gkPad';
        gcodekbd.hwrap.appendChild(pad);
        gcodekbd.hpad = pad;

        // inputmode=none keeps the device's soft keyboard from popping up
        // when the edit line has focus, while still showing the caret and
        // accepting input from a physical keyboard.
        const display = document.createElement('input');
        display.id = 'gkDisplay';
        display.type = 'text';
        display.inputMode = 'none';
        display.autocomplete = 'off';
        display.spellcheck = false;
        display.onfocus = inputFocused;
        display.onblur = inputBlurred;
        display.addEventListener('keydown', gcodekbd.keypr);
        display.addEventListener('input', () => gcodekbd.edited());
        const displayRow = document.createElement('div');
        displayRow.className = 'gk-display-row';
        gcodekbd.hlabel = document.createElement('span');
        gcodekbd.hlabel.className = 'gk-label';
        displayRow.appendChild(gcodekbd.hlabel);
        displayRow.appendChild(display);
        pad.appendChild(displayRow);
        gcodekbd.hdisplay = display;
        gcodekbd.hstatus = document.createElement('div');
        gcodekbd.hstatus.className = 'gk-status';
        pad.appendChild(gcodekbd.hstatus);

        const letters = document.createElement('div');
        letters.className = 'gk-letters';
        gcodekbd.makeRows(letters, gcodekbd.letterRows);
        pad.appendChild(letters);

        const wizard = document.createElement('div');
        wizard.className = 'gk-wizard';
        gcodekbd.makeSelects(wizard, gcodekbd.modalSelects, false);
        gcodekbd.makeSelects(wizard, gcodekbd.commandSelects, true);
        const fields = document.createElement('div');
        fields.className = 'gk-fields';
        gcodekbd.makeFieldRows(fields);
        wizard.appendChild(fields);
        gcodekbd.makeRows(wizard, gcodekbd.numberRows);
        pad.appendChild(wizard);

        // Value mode (see openValue()) shows just these rows
        const numeric = document.createElement('div');
        numeric.className = 'gk-numeric';
        gcodekbd.makeRows(numeric, gcodekbd.numberRows);
        pad.appendChild(numeric);

        const bottom = document.createElement('div');
        bottom.className = 'gk-row';
        gcodekbd.bottomRow.forEach((key) => {
            const button = gcodekbd.makeKey(bottom, key);
            if (key === 'Toggle') {
                gcodekbd.htoggle = button;
            }
            if (key === 'Close') {
                gcodekbd.hclose = button;
            }
        });
        gcodekbd.hactions = document.createElement('div');
        gcodekbd.hactions.className = 'gk-actions';
        bottom.appendChild(gcodekbd.hactions);
        pad.appendChild(bottom);

        document.body.appendChild(gcodekbd.hwrap);
    },

    toggleWizard: () => {
        const isWizard = gcodekbd.hpad.classList.toggle('wizard');
        gcodekbd.htoggle.innerHTML = isWizard ? 'ABC' : 'Wizard';
        gcodekbd.hdisplay.focus();
    },

    keypr: (event) => {
        switch (event.key) {
            case 'Enter':
                event.preventDefault();
                if (gcodekbd.actionButtons.length === 1) {
                    gcodekbd.actionButtons[0].button.click();
                } else if (gcodekbd.actionButtons.length) {
                    // Ambiguous with several actions; use the buttons
                } else {
                    gcodekbd.send();
                }
                break;
            case 'Escape':
                event.preventDefault();
                if (gcodekbd.valueMode) {
                    gcodekbd.cancel();
                } else {
                    gcodekbd.close();
                }
                break;
        }
    },

    insert: (text) => {
        const d = gcodekbd.hdisplay;
        d.setRangeText(text, d.selectionStart, d.selectionEnd, 'end');
        d.focus();
        gcodekbd.edited();
    },

    // setRangeText() does not fire input events, so on-screen keys call
    // this directly
    edited: () => {
        if (gcodekbd.onEdit) {
            gcodekbd.onEdit();
        }
    },

    setStatus: (text) => {
        gcodekbd.hstatus.textContent = text;
    },

    // Restores the action buttons' original labels, e.g. after a caller
    // relabeled one to ask for confirmation
    resetActionLabels: () => {
        gcodekbd.actionButtons.forEach(({ button, label }) => {
            button.textContent = label;
        });
    },

    backspace: () => {
        const d = gcodekbd.hdisplay;
        const start = d.selectionStart;
        const end = d.selectionEnd;
        if (start !== end) {
            d.setRangeText('', start, end, 'end');
        } else if (start > 0) {
            d.setRangeText('', start - 1, start, 'end');
        }
        d.focus();
        gcodekbd.edited();
    },

    moveCaret: (delta) => {
        const d = gcodekbd.hdisplay;
        const pos = Math.max(0, Math.min(d.value.length, d.selectionStart + delta));
        d.setSelectionRange(pos, pos);
        d.focus();
    },

    // Make the text box at id targetId open this keyboard when tapped,
    // instead of taking input directly.  label is shown left of the edit
    // line.
    attach: (targetId, label) => {
        const target = id(targetId);
        target.readOnly = true;
        target.addEventListener('click', () => gcodekbd.show(target, label));
    },

    show: (input, label) => {
        gcodekbd.setLowerCase(false);
        gcodekbd.target = input;
        gcodekbd.hlabel.textContent = label || '';
        const d = gcodekbd.hdisplay;
        d.value = input.value;
        gcodekbd.hwrap.classList.add('open');
        d.focus();
        d.setSelectionRange(d.value.length, d.value.length);
    },

    // Value mode: edit a field rather than an MDI command.  mode 'numeric'
    // shows just the punctuation and digit rows; 'text' shows the letter
    // keyboard.  Neither has the Wizard or Send keys, and Close becomes
    // Cancel, which discards the edit.  input only needs a value property.
    //
    // The bottom row ends with action buttons.  By default there is just Set
    // (also Enter), which writes the value back into input and then calls
    // onDone.  options.actions replaces that, so the keyboard can serve as
    // a complete dialog: each is { label, fn }, and fn(value, button) is
    // called when its button is pressed, typically ending with close() or
    // setStatus().  options.onEdit is called whenever the edit line changes.
    openValue: (input, label, onDone, mode = 'numeric', options = {}) => {
        gcodekbd.onDone = onDone;
        gcodekbd.valueMode = mode;
        gcodekbd.onEdit = options.onEdit || null;
        gcodekbd.hpad.classList.add(mode);
        gcodekbd.setStatus('');
        const actions = options.actions || [{ label: 'Set', fn: () => gcodekbd.close() }];
        gcodekbd.actionButtons = actions.map(({ label, fn }) => {
            const button = gcodekbd.makeKey(gcodekbd.hactions, label,
                                            () => fn(gcodekbd.hdisplay.value, button));
            button.classList.add('gk-action');
            return { button, label };
        });
        gcodekbd.hpad.classList.add('actions');
        gcodekbd.hclose.textContent = 'Cancel';
        gcodekbd.show(input, label);
    },

    // Writes the edit line back into the target and calls onDone
    close: () => {
        if (gcodekbd.target) {
            gcodekbd.target.value = gcodekbd.hdisplay.value;
        }
        const onDone = gcodekbd.onDone;
        gcodekbd.dismiss();
        if (onDone) {
            onDone();
        }
    },

    // Value mode's Cancel: closes without writing back or calling onDone
    cancel: () => {
        gcodekbd.dismiss();
    },

    dismiss: () => {
        gcodekbd.hdisplay.blur();
        gcodekbd.hwrap.classList.remove('open');
        if (gcodekbd.valueMode) {
            gcodekbd.hpad.classList.remove(gcodekbd.valueMode);
            gcodekbd.valueMode = null;
        }
        gcodekbd.hpad.classList.remove('actions');
        gcodekbd.hactions.innerHTML = '';
        gcodekbd.actionButtons = [];
        gcodekbd.hclose.textContent = 'Close';
        gcodekbd.onEdit = null;
        gcodekbd.setStatus('');
        gcodekbd.onDone = null;
        gcodekbd.target = null;
    },

    send: () => {
        const cmd = gcodekbd.hdisplay.value.trim();
        gcodekbd.close();
        if (cmd !== '') {
            MDIcmd(cmd);
        }
    },
};
