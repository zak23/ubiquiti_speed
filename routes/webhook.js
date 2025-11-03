const express = require('express');
const router = express.Router();
const { logWebhook } = require('../services/webhookLogger');

/**
 * POST /api/webhook
 * Capture-only: store raw and parsed payloads with headers; return 200
 */
router.post('/webhook', (req, res) => {
  try {
    const remoteIp = (req.ip || (req.connection && req.connection.remoteAddress)) || 'unknown';
    const entry = {
      remoteIp,
      method: req.method,
      path: req.originalUrl || req.path,
      headers: req.headers,
      query: req.query || {},
      rawBody: typeof req._rawBody === 'string' ? req._rawBody : (req.body ? JSON.stringify(req.body) : ''),
      parsed: req.body || null
    };
    const ok = logWebhook(entry);
    if (!ok) {
      return res.status(500).json({ success: false, error: 'Failed to persist webhook' });
    }
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('ERROR storing webhook:', error);
    return res.status(500).json({ success: false, error: 'Internal error' });
  }
});

module.exports = router;

