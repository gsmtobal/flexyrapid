const fs = require('fs');
let code = fs.readFileSync('ui_script.js', 'utf8');

const wrapper = `
let ipcRenderer = null;
try {
    ipcRenderer = require('electron').ipcRenderer;
} catch (e) {
    console.warn('Running in Web Browser mode (No Electron IPC). Falling back to HTTP APIs.');
    // Mock ipcRenderer.on to prevent crashes in web mode
    ipcRenderer = {
        on: (channel, callback) => {
            console.log('Registered mock listener for:', channel);
        }
    };
}

async function apiCall(channel, data) {
    if (ipcRenderer && ipcRenderer.invoke) {
        return await ipcRenderer.invoke(channel, data);
    } else {
        const token = localStorage.getItem('admin_token') || 'SUPERM123';
        const port = window.location.port ? window.location.port : 3005;
        const res = await fetch(\`http://\${window.location.hostname}:3005/api/ipc/\${channel}\`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': token },
            body: JSON.stringify({ data })
        });
        if (!res.ok) throw new Error('API request failed: ' + res.statusText);
        return await res.json();
    }
}
`;

code = code.replace(/const\s+\{\s*ipcRenderer\s*\}\s*=\s*require\('electron'\);/g, wrapper);
code = code.replace(/ipcRenderer\.invoke/g, 'apiCall');

fs.writeFileSync('ui_script.js', code);
console.log('Successfully rewrote ui_script.js');
