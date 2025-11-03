const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const webhookRoutes = require('./routes/webhook');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3001; // Avoid port 3000 as per user requirements

// Trust proxy for correct handling of X-Forwarded-* headers from Caddy
app.set('trust proxy', true);

// Middleware
app.use(cors());

// Capture raw body via body-parser verify hooks (JSON and URL-encoded)
app.use(bodyParser.json({
  limit: '50mb',
  verify: (req, res, buf) => {
    try {
      req._rawBody = buf ? buf.toString('utf8') : '';
    } catch (_) {
      req._rawBody = '';
    }
  }
}));
app.use(bodyParser.urlencoded({
  extended: true,
  limit: '50mb',
  verify: (req, res, buf) => {
    try {
      req._rawBody = buf ? buf.toString('utf8') : '';
    } catch (_) {
      req._rawBody = '';
    }
  }
}));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  console.log('IP:', req.ip || req.connection.remoteAddress);
  next();
});

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api', webhookRoutes);
app.use('/api', apiRoutes);

// Root route - serve index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: err.message
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found'
  });
});

// Start server - bind to 0.0.0.0 to allow access from Caddy on different machine
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Speed Trap API server running on http://0.0.0.0:${PORT}`);
  console.log(`Public webhook endpoint: https://speedtrap.ohfuckputitback.in/api/webhook`);
  console.log(`Public detections API: https://speedtrap.ohfuckputitback.in/api/detections`);
  console.log(`Public web interface: https://speedtrap.ohfuckputitback.in/`);
  console.log(`Server accessible from network (Caddy reverse proxy ready)`);
});

module.exports = app;

