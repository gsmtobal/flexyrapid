const express = require('express');
const path = require('path');
const app = express();

// Serve the cloud portal UI
app.use(express.static(path.join(__dirname, 'Cloud_Portal_Ready')));

// Catch-all route to serve index.html for SPA (Single Page Application)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'Cloud_Portal_Ready', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Cloud Portal UI running on port ${PORT}`);
});
