// On-screen keyboard tuned for entering GCode, replacing the device's
// built-in soft keyboard for the MDI boxes.  A general-purpose soft keyboard
// makes you keep switching between letter, number, and punctuation layers;
// this one has a single fixed layout with everything GCode needs - letters,
// digits, and the punctuation used by expressions and parameter references -
// all visible at once.  Letters are upper case only, since case does not
// matter in GCode.
//
// Like the numpad, it is a modal overlay with its own edit line.  Tapping an
// attached text box copies its contents into the edit line; Close copies the
// edited text back, and Send also sends it as an MDI command.  A physical
// keyboard can type into the edit line too, with Enter to send and Escape to
// close.
const gcodekbd = {
    hwrap: null,     // dimmed full-screen wrapper
    hdisplay: null,  // edit line
    target: null,    // the text box being edited

    rows: [
        ['.', '-', '+', '(', ')', '[', ']', '#', '=', '_', '<', '>'],
        ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
        ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
        ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
        ['Z', 'X', 'C', 'V', 'B', 'N', 'M', 'Backspace'],
        ['Close', 'Left', 'Space', 'Right', 'Send'],
    ],

    // Keys whose label or action differs from the character they type
    special: {
        Backspace: { label: '&#9003;', css: 'gk-del', fn: () => gcodekbd.backspace() },
        Left:      { label: '&larr;',  css: 'gk-nav', fn: () => gcodekbd.moveCaret(-1) },
        Right:     { label: '&rarr;',  css: 'gk-nav', fn: () => gcodekbd.moveCaret(1) },
        Space:     { label: 'Space',   css: 'gk-space', fn: () => gcodekbd.insert(' ') },
        Close:     { label: 'Close',   css: 'gk-close', fn: () => gcodekbd.close() },
        Send:      { label: 'Send',    css: 'gk-send', fn: () => gcodekbd.send() },
    },

    init: () => {
        gcodekbd.hwrap = document.createElement('div');
        gcodekbd.hwrap.id = 'gkWrap';

        const pad = document.createElement('div');
        pad.id = 'gkPad';
        gcodekbd.hwrap.appendChild(pad);

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
        pad.appendChild(display);
        gcodekbd.hdisplay = display;

        gcodekbd.rows.forEach((row) => {
            const hrow = document.createElement('div');
            hrow.className = 'gk-row';
            row.forEach((key) => {
                const spec = gcodekbd.special[key];
                const button = document.createElement('div');
                button.className = 'gk-key' + (spec ? ' ' + spec.css : '');
                button.innerHTML = spec ? spec.label : key;
                // Keep focus (and so the caret position) in the edit line
                // when a key is pressed.
                button.addEventListener('pointerdown', (event) => event.preventDefault());
                button.addEventListener('mousedown', (event) => event.preventDefault());
                button.addEventListener('click', spec ? spec.fn : () => gcodekbd.insert(key));
                hrow.appendChild(button);
            });
            pad.appendChild(hrow);
        });

        document.body.appendChild(gcodekbd.hwrap);
    },

    keypr: (event) => {
        switch (event.key) {
            case 'Enter':
                event.preventDefault();
                gcodekbd.send();
                break;
            case 'Escape':
                event.preventDefault();
                gcodekbd.close();
                break;
        }
    },

    insert: (text) => {
        const d = gcodekbd.hdisplay;
        d.setRangeText(text, d.selectionStart, d.selectionEnd, 'end');
        d.focus();
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
    },

    moveCaret: (delta) => {
        const d = gcodekbd.hdisplay;
        const pos = Math.max(0, Math.min(d.value.length, d.selectionStart + delta));
        d.setSelectionRange(pos, pos);
        d.focus();
    },

    // Make the text box at id targetId open this keyboard when tapped,
    // instead of taking input directly.
    attach: (targetId) => {
        const target = id(targetId);
        target.readOnly = true;
        target.addEventListener('click', gcodekbd.show);
    },

    show: function () {
        gcodekbd.target = this;
        const d = gcodekbd.hdisplay;
        d.value = this.value;
        gcodekbd.hwrap.classList.add('open');
        d.focus();
        d.setSelectionRange(d.value.length, d.value.length);
    },

    close: () => {
        if (gcodekbd.target) {
            gcodekbd.target.value = gcodekbd.hdisplay.value;
        }
        gcodekbd.hdisplay.blur();
        gcodekbd.hwrap.classList.remove('open');
    },

    send: () => {
        const cmd = gcodekbd.hdisplay.value.trim();
        gcodekbd.close();
        if (cmd !== '') {
            MDIcmd(cmd);
        }
    },
};
