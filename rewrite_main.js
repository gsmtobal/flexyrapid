const fs = require('fs');
let code = fs.readFileSync('main.js', 'utf8');

// Replace all ipcMain.handle with registerIpc
code = code.replace(/ipcMain\.handle/g, 'registerIpc');

const injection = `
const ipcHandlers = {};
function registerIpc(channel, handler) {
    ipcHandlers[channel] = handler;
    ipcMain.handle(channel, handler);
}

`;

code = code.replace("const db = require('./database');", injection + "const db = require('./database');");
code = code.replace(/require\('\.\/api_server'\)\(db, modemService\);/, `require('./api_server')(db, modemService, ipcHandlers);`);

fs.writeFileSync('main.js', code);
console.log('Successfully rewrote main.js');
