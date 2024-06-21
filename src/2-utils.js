// From utils.js
function id(name) {
    return document.getElementById(name);
}
function getValue(name, val) {
    return id(name).value;
}
function setTextContent(name, val) {
    id(name).textContent = val;
}
function setHTML(name, val) {
    id(name).innerHTML = val;
}
function setText(name, val) {
    id(name).innerText = val;
}
function getText(name) {
    return id(name).innerText;
}
function setDisplay(name, val) {
    id(name).style.display = val;
}
function displayNone(name) {
    setDisplay(name, 'none');
}
function displayBlock(name) {
    setDisplay(name, 'block');
}
function selectDisabled(selector, value) {
    document.querySelectorAll(selector).forEach(
        function (element) {
            element.disabled = value;
        }
    )
}
// End utils.js
