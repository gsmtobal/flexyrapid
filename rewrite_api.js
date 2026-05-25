const fs = require('fs');
let code = fs.readFileSync('api_server.js', 'utf8');

// Change export signature
code = code.replace(
    /module\.exports = function startApiServer\(db, modemService\) \{/,
    'module.exports = function startApiServer(db, modemService, ipcHandlers) {'
);

// Add the IPC proxy endpoint before the start server block
const proxyEndpoint = `
    // --- IPC Proxy for Web Interface ---
    app.post('/api/ipc/:channel', authMiddleware, async (req, res) => {
        const channel = req.params.channel;
        if (!ipcHandlers || !ipcHandlers[channel]) {
            return res.status(404).json({ success: false, message: 'IPC Handler not found: ' + channel });
        }
        try {
            // Provide a mock event object and pass the data
            const result = await ipcHandlers[channel]({}, req.body.data || req.body);
            res.json(result);
        } catch (e) {
            console.error('[API IPC Error]', channel, e.message);
            res.status(500).json({ success: false, message: e.message });
        }
    });

    // Start Server
`;

code = code.replace(/\/\/ Start Server/, proxyEndpoint);

fs.writeFileSync('api_server.js', code);
console.log('Successfully rewrote api_server.js');
