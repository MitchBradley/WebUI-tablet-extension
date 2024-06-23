// From utils.js
const id = (name) =>  document.getElementById(name);
const getValue = (name, val) => id(name).value;
const setTextContent = (name, val) => {
    id(name).textContent = val;
}
const setHTML = (name, val) => {
    id(name).innerHTML = val;
}
const setText = (name, val) => {
    id(name).innerText = val;
}
const getText = (name) =>  id(name).innerText;
const setDisplay = (name, val) => {
    id(name).style.display = val;
}
const displayNone = (name) => {
    setDisplay(name, 'none');
}
const displayBlock = (name) => {
    setDisplay(name, 'block');
}
const selectDisabled = (selector, value) => {
    document.querySelectorAll(selector).forEach(
        (element) => {
            element.disabled = value;
        }
    )
}
// End utils.js
