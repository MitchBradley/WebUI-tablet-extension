const uploadFile = () => {
    id('uploadBtn').click()
}

const injectCSS = (css) => {
    let el = document.createElement('style');
    el.textContent = css;
    document.head.appendChild(el);
    return el;
};

const appendContent = (el, content) => {
    switch (typeof(content)) {
        case 'string':
            el.innerHTML = content;
            break;
        case 'undefined':
            break;
        case 'object':
            if (content.constructor === Array) {
                content.forEach((item) => appendContent(el, item));
            } else {
                el.appendChild(content)
            }
            break;
        default:
            console.log(el)
            break;
    }
}
const element = (type, id, cssclass, content) => {
    const el = document.createElement(type);
    if (id) {
        el.id = id;
    }
    if (cssclass) {
        el.className = cssclass;
    }
    appendContent(el, content)
    return el;
}
const input = (id, cssclass, inptype, placeholder, onchange, content) => {
    const el = element('input', id, cssclass, content)
    el.type = inptype
    if (typeof placeholder != 'undefined') {
        el.placeholder = placeholder
    }
    if (typeof onchange != 'undefined') {
        el.onchange = onchange
    }
    el.onfocus = inputFocused
    el.onblur = inputBlurred
    return el
}
const select = (id, cssclass, onchange, content) => {
    const el = element('select', id, cssclass, content)
    if (typeof onchange != 'undefined') {
        el.onchange = onchange
    }
    return el
}
const option = (content) => {
    return element('option', '', '', content);
}
const div = (id, cssclass, content) => {
    return element('div', id, cssclass, content)
}
const columns = (id, extracssclass, content) => {
    return div(id, 'cols-tablet ' + extracssclass, content)
}
const textarea = (id, cssclass, placeholder, content) => {
    const el = element('textarea', id, cssclass, content)
    el.placeholder = placeholder
    el.spellcheck = false
    el.readonly = ''
    return el
}

const button = (id, cssclass, content, title, click, value) => {
    const el = element('button', id, cssclass, content)
    el.type = 'button'
    if (typeof title != 'undefined') {
        el.title = title
    }
    if (typeof value != 'undefined') {
        el.value = value
    }
    if (typeof click != 'undefined') {
        el.onclick = click
    }
    return el
}
const menubutton = (id, cssclass, content) => {
    const el = button(id, cssclass, content)
    el.tabindex = 0
    el.onclick = hideMenu;
    return el
}

const col = (width, content) => {
    return div('', `col-tablet col-${width}`, content)
}

const makeDRO = (axis) => {
    return col(3,
               columns(`${axis}-dro`, '', [
                   col(1, div('', 'axis-label', axis.toUpperCase())),
                   //div('', 'col-tablet col-1 axis-label', axis),
                   col(6, button(`wpos-${axis}`, 'btn-tablet position', '0.00', `Modify ${axis} position`, null, axis)),
                   div(`mpos-${axis}`, 'col-tablet col-4 mposition', '0.00')
               ])
    )
}
const axis_labels = (naxes) => {
    const elements = []
    for (let i = 0; i < naxes; i++) {
        elements.push(makeDRO(axisNames[i]))
    }
    return columns('axis-position', 'area axis-position', [
        div('wpos-label', 'col-tablet col-1 pos-name', 'WPos'),
        col(11, columns('', '', elements))
    ])
}

const axis_zero = (axis) => {
    axis = axis.toUpperCase()

    return col(3,
               columns('', '', [
                   col(4, button('', 'btn-tablet btn-zero', `${axis}=0`, `Set ${axis} to 0`, btnZeroAxis, axis)),
                   col(1, " "),
                   col(4, button('', 'btn-tablet btn-goto', `>${axis}0`, `Goto 0 in ${axis}`, btnGoto0, axis))
               ])
    )
}
const axis_zeroing = (naxes) => {
    const elements = []
    for (let i = 0; i < naxes; i++) {
        elements.push(axis_zero(axisNames[i]))
    }
    return div('setAxis', 'area2 axis-position',
               columns('', '', [
                   col(1, button('units', 'btn-tablet btn-units', 'mm', 'Switch between mm and Inch modes', toggleUnits)),
                   col(11, columns('', '', elements))
               ])
    )
}
const jog_distance = (name, amount) => {
    return div('', 'col-tablet col-1',
               button(name, 'btn-tablet set-distance', amount, `Jog by ${amount}`, btnSetDistance, amount)
    )
}

const jog_control = (name, label) => {
    return col(2, button(name, 'btn-tablet jog', label, `Move ${label}`, null, label))
}

const override = (label, value, help) => {
    return col(1, button('', 'btn-tablet feed-ovr', label, help, btnOverride, value))
}

const mi = (text, theclick) => {
    const anchor = element('div', '', 'tablet-menu-item', text)
    anchor.onclick = theclick
    // anchor.role = 'menuitem'
    return anchor;
}

const attachApp = (container) => {
    const app =
        div('tablettab', 'tabcontent tablettab', [
            div('nav-panel', 'nav-panel',
                columns('', '', [
                    div('time-of-day', 'col-tablet col-1 info-button', "4:30"),
                    div('active-state', 'col-tablet col-4 active-state', "Idle"),
                    col(2, button('btn-start', 'btn-go', 'Start', 'Start or Resume Program', doLeftButton, null)),
                    col(2, button('btn-pause', 'btn-go', 'Pause', 'Pause or Stop Program', doRightButton, null)),
                    div('line', 'col-tablet col-1 info-button', "0"),
                    div('runtime', 'col-tablet col-1 info-button', "12:23"),
                    div('dropdown', 'dropdown  dropdown-right', [
                        menubutton('btn-dropdown', 'btn-tablet dropdown-toggle', "Menu"), // {"attributes":{"tabindex":"0"}}
                        element('div', 'tablet-dropdown-menu', 'menu', [
                            mi("Homing", menuHomeAll),
                            mi("Home A", menuHomeA),
                            mi("Spindle Off", menuSpindleOff),
                            mi("Unlock", menuUnlock),
                            mi("Reset", menuReset),
                        ]),
                    ])
                ])
            ),
            axis_labels(n_axes),
            axis_zeroing(n_axes),
            div('control-pad', 'area control-pad', [
                div('jog-controls', 'middle-block jog-controls', [
                    columns('', 'jog-row', [
                        div('distance', 'col-tablet col-2 info-button', ""),
                        jog_control('jog-y-plus', 'Y+'),
                        col(2, ""),
                        jog_control('jog-z-plus', 'Z+'),
                        jog_distance('jog00', '0.001'),
                        jog_distance('jog01', '0.01'),
                        jog_distance('jog02', '0.1'),
                        jog_distance('jog03', '1')
                    ]),

                    columns('', 'jog-row', [
                        jog_control('jog-x-minus', 'X-'),
                        col(2, ''),
                        jog_control('jog-x-plus', 'X+'),
                        div('jog-distance-container', 'col-tablet col-2', [
                            select('jog-distance', 'btn-tablet jog-selector', null, [
                                option("0.00025"),
                                option("0.0005"),
                                option("0.001"),
                                option("0.003"),
                                option("0.005"),
                                option("0.01"),
                                option("0.03"),
                                option("0.05"),
                                option("0.1"),
                                option("0.3"),
                                option("0.5"),
                                option("1"),
                                option("3"),
                                option("5"),
                                option("10"),
                                option("30")
                            ]),
                        ]),

                        jog_distance('jog10', '0.003'),
                        jog_distance('jog11', '0.03'),
                        jog_distance('jog12', '0.3'),
                        jog_distance('jog13', '3')

                    ]),

                    columns('', 'jog-row', [
                        div('emptyLLHC', 'col-tablet col-2 info-button', ""),
                        jog_control('jog-y-minus', 'Y-'),
                        div('emptyLRHC', 'col-tablet col-2 info-button', ""),
                        jog_control('jog-z-minus', 'Z-'),
                        jog_distance('jog20', '0.005'),
                        jog_distance('jog21', '0.05'),
                        jog_distance('jog22', '0.5'),
                        jog_distance('jog23', '5')
                    ]),
                ]),
                div('overrides', '', [
                    columns('ovr-controls', 'ovr-row', [
                        columns('', '', [
                            div('', 'col-tablet col-2 axis-label', 'Feed'),
                            div('feed', 'col-tablet col-2 info-button', "1000"),
                            override('--', '\x92', 'Decrease feedrate by 10%'),
                            override('-', '\x94', 'Decrease feedrate by 1%'),
                            col(2, button('feed-ovr', 'btn-tablet info-button', '100%', 'Cancel feed override', btnFeedOvrCancel, '')),
                            override('+', '\x93', 'Increase feedrate by 1%'),
                            override('++', '\x91', 'Increase feedrate by 10%')
                        ]),
                        columns('', '', [
                            div('', 'col-tablet col-3 axis-label', 'Spindle'),
                            div('spindle-direction', 'col-tablet col-1 axis-label', ''),
                            div('spindle-speed', 'col-tablet col-2 info-button', "3000"),
                            override('--', '\x9b', 'Decrease spindle speed by 10%'),
                            override('-', '\x9d', 'Decrease spindle speed by 1%'),
                            col(2, button('spindle-ovr', 'btn-tablet info-button', '100%', 'Cancel spindle override', btnSpindleOvrCancel, '')),
                            override('++', '\x9c', 'Increase spindle speed by 1%'),
                            override('++', '\x9a', 'Increase spindle speed by 10%')
                        ])
                    ]),
                ]),
            ]),
            columns('mdifiles', 'area mdifiles', [
                col(2, input('mditext0', 'mdi-entry', 'text', "GCode", null, "")),
                col(1, button('mdi0', 'btn-tablet mdi-go', 'MDI', 'Submit GCode Command', btnMDI, 'mditext0')),
                col(2, input('mditext1', 'mdi-entry', 'text', "GCode", null, "")),
                col(1, button('mdi1', 'btn-tablet mdi-go', "MDI", "Submit GCode Command", btnMDI, 'mditext1')),
                col(3,
                    select('filelist', 'mdi-entry', selectFile, [
                        option("Load GCode File"),
                    ]),
                ),
                col(1, button('', 'btn-tablet refresh', "Upld", "Upload New File", uploadFile, '')),
                col(1, button('', 'btn-tablet load',    "Load", "Reload File",     selectFile, '')),
                col(1, button('', 'btn-tablet refresh', "Refr", "Refresh Files",   refreshFiles, ''))
            ]),

            columns('status', 'status', [
                div('messagepane', 'col-5', [
                    div('gcode-states', 'msg', 'G0'),
                    div('messages', 'msg', "(Tablet UI " + getVersion() + ')'),
                    textarea('gcode', 'msg', 'GCode File Display', '')
                ]),
                div('previewpane', 'col-tablet col-7', [
                    element('canvas', 'toolpath', 'previewer', ''),
                    element('span', 'filename', ''),
                    button('expand-button', 'btn-tablet', '[]', 'Expand Visualizer', toggleVisualizer, null)
                ]),
            ]),
            input('uploadBtn', 'hidden', 'file', null, internalUploadFile, ""),
        ])

    container.appendChild(app)
    id('ovr-controls').hidden = true;
}
