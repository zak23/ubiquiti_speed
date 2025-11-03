const express = require('express');
const router = express.Router();
const { getDetections } = require('../services/storage');
const { readWebhooks, getWebhooksFilePath } = require('../services/webhookLogger');
const { getStats } = require('../services/triggerAccumulator');
const fs = require('fs');

/**
 * GET /api/detections
 * Returns array of all detections, optionally limited
 * Query params: ?limit=50
 */
router.get('/detections', (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : null;
    
    const detections = getDetections(limit);
    
    res.status(200).json({
      success: true,
      count: detections.length,
      detections: detections
    });
  } catch (error) {
    console.error('Error fetching detections:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch detections',
      message: error.message
    });
  }
});

/**
 * GET /api/webhooks
 * Returns array of all logged webhooks, optionally limited
 * Query params: ?limit=50
 */
router.get('/webhooks', (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : null;
    
    let webhooks = readWebhooks();
    
    // Reverse to show most recent first
    webhooks.reverse();
    
    if (limit && limit > 0) {
      webhooks = webhooks.slice(0, limit);
    }
    
    // Get trigger accumulator stats and file size
    const triggerStats = getStats();
    let sizeBytes = null;
    try {
      const stat = fs.statSync(getWebhooksFilePath());
      sizeBytes = stat.size;
    } catch (_) {}
    
    res.status(200).json({
      success: true,
      count: webhooks.length,
      filePath: getWebhooksFilePath(),
      sizeBytes: sizeBytes,
      triggerStats: triggerStats,
      webhooks: webhooks
    });
  } catch (error) {
    console.error('Error fetching webhooks:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch webhooks',
      message: error.message
    });
  }
});

/**
 * GET /api/webhooks/raw
 * Returns the last N raw JSONL lines (default 100)
 */
router.get('/webhooks/raw', (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 100;
    const filePath = getWebhooksFilePath();
    if (!fs.existsSync(filePath)) {
      return res.status(200).json({ success: true, filePath, lines: [] });
    }
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.trim().split('\n');
    const slice = lines.slice(-limit);
    res.status(200).json({ success: true, filePath, lines: slice });
  } catch (error) {
    console.error('Error fetching raw webhooks:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch raw webhooks', message: error.message });
  }
});

/**
 * GET /api/stats
 * Returns statistics about the system
 */
router.get('/stats', (req, res) => {
  try {
    const detections = getDetections();
    const triggerStats = getStats();
    const webhooks = readWebhooks();
    
    res.status(200).json({
      success: true,
      detections: {
        total: detections.length,
        latest: detections.length > 0 ? detections[0].timestamp : null
      },
      triggers: triggerStats,
      webhooks: {
        total: webhooks.length,
        latest: webhooks.length > 0 ? (webhooks[webhooks.length - 1].receivedAt || webhooks[webhooks.length - 1].timestamp) : null,
        recent: webhooks.slice(-5).reverse() // Last 5 webhooks
      }
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch stats',
      message: error.message
    });
  }
});

module.exports = router;

