const fs = require('fs');
const path = require('path');

const indexHtmlPath = path.join(__dirname, 'Cloud_Portal_Ready', 'index.html');
let indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');

// Fix RACINE_PATH for localhost testing
let target = "const RACINE_PATH = location.pathname.match(/\\/\\w+/g)[0]";
let replacement = "const RACINE_PATH = location.pathname.match(/\\/\\w+/g) ? location.pathname.match(/\\/\\w+/g)[0] : ''";

indexHtml = indexHtml.split(target).join(replacement);

fs.writeFileSync(indexHtmlPath, indexHtml, 'utf8');
console.log("Fixed RACINE_PATH in index.html");
