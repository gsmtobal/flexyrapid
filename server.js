// server.js - Simple proxy server for Ooredoo Ahla API

console.log('[startup] server.js loading...');
console.log('[startup] Node.js version:', process.version);
console.log('[startup] PORT env:', process.env.PORT);

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path'); // added for static serving
const fs = require('fs');

console.log('[startup] Loading AhlaAPI client...');
const AhlaAPI = require('./ahla_api_client.js'); // reuse the client class
console.log('[startup] AhlaAPI client loaded.');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Serve static files only if the directory exists (it may not be present in all deployments)
const staticDir = path.join(__dirname, 'ahla_decoded', 'assets', 'www');
if (fs.existsSync(staticDir)) {
  console.log('[startup] Serving static files from:', staticDir);
  app.use(express.static(staticDir));
} else {
  console.log('[startup] Static directory not found, skipping static file serving:', staticDir);
}

const api = new AhlaAPI();

// Helper to wrap async route handlers
function asyncHandler(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Proxy endpoints – match the Ooredoo API paths
app.post('/api/login', asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  const result = await api.login(username, password);
  res.json(result);
}));

app.post('/api/gethome', asyncHandler(async (req, res) => {
  const result = await api.getHome();
  res.json(result);
}));

app.post('/api/nbservice', asyncHandler(async (req, res) => {
  const { service_code, msg, session_id, session_continue, cache_enable, app_id } = req.body;
  const result = await api.callNBService(service_code, msg, session_id, session_continue);
  res.json(result);
}));

app.get('/api/settings', asyncHandler(async (req, res) => {
  const result = await api.getSettings();
  res.json(result);
}));

app.post('/api/kpi', asyncHandler(async (req, res) => {
  const result = await api._request('POST', '/kpi/', req.body);
  res.json(result);
}));

app.post('/api/logout', asyncHandler(async (req, res) => {
  const result = await api.logout();
  res.json(result);
}));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server with fallback on port conflict
function startServer(port, attempts = 0) {
  if (attempts > 5) {
    console.error('Failed to bind to a free port after multiple attempts.');
    process.exit(1);
  }
  const server = app.listen(port, () => {
    console.log(`Ahla proxy server listening on port ${port}`);
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`Port ${port} in use, trying next port...`);
      startServer(port + 1, attempts + 1);
    } else {
      console.error('Server error:', err);
      process.exit(1);
    }
  });
}

const BASE_PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
startServer(BASE_PORT);
