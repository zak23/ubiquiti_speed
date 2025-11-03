const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const WEBHOOKS_FILE = path.join(DATA_DIR, 'webhooks.jsonl'); // JSONL format (one JSON per line)
const MAX_LOG_BYTES = 50 * 1024 * 1024; // 50MB rotate threshold

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * Append a webhook payload to the webhooks log file
 * Uses JSONL format (one JSON object per line) for easy appending
 * @param {Object} payload - The webhook payload
 * @returns {boolean} Success status
 */
function rotateIfNeeded() {
  try {
    if (!fs.existsSync(WEBHOOKS_FILE)) return;
    const { size } = fs.statSync(WEBHOOKS_FILE);
    if (size >= MAX_LOG_BYTES) {
      const ts = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
      const rotated = path.join(DATA_DIR, `webhooks-${ts}.jsonl`);
      fs.renameSync(WEBHOOKS_FILE, rotated);
      console.log(`Rotated webhook log to ${rotated}`);
    }
  } catch (error) {
    console.error('Error rotating webhook log:', error);
  }
}

/**
 * Append a webhook entry to the webhooks log file
 * Accepts any object; recommended fields: receivedAt, remoteIp, headers, rawBody, parsed
 */
function logWebhook(entry) {
  try {
    rotateIfNeeded();
    const timestamp = new Date().toISOString();
    const logEntry = Object.assign({ receivedAt: timestamp }, entry || {});
    // Append as JSONL (JSON Lines) format - one JSON object per line
    const line = JSON.stringify(logEntry) + '\n';
    
    fs.appendFileSync(WEBHOOKS_FILE, line, 'utf8');
    
    console.log(`Webhook logged to ${WEBHOOKS_FILE}`);
    return true;
  } catch (error) {
    console.error('Error logging webhook:', error);
    return false;
  }
}

/**
 * Read all webhooks from the log file
 * @returns {Array} Array of webhook log entries
 */
function readWebhooks() {
  try {
    if (!fs.existsSync(WEBHOOKS_FILE)) {
      return [];
    }
    
    const content = fs.readFileSync(WEBHOOKS_FILE, 'utf8');
    const lines = content.trim().split('\n').filter(line => line.trim());
    
    return lines.map(line => {
      try {
        const obj = JSON.parse(line);
        // Add a small preview for UI convenience if rawBody present
        if (obj && typeof obj.rawBody === 'string') {
          obj.rawPreview = obj.rawBody.slice(0, 200);
        }
        return obj;
      } catch (error) {
        console.error('Error parsing webhook line:', error, line);
        return null;
      }
    }).filter(entry => entry !== null);
  } catch (error) {
    console.error('Error reading webhooks file:', error);
    return [];
  }
}

/**
 * Get the path to the webhooks file
 * @returns {string} File path
 */
function getWebhooksFilePath() {
  return WEBHOOKS_FILE;
}

module.exports = {
  logWebhook,
  readWebhooks,
  getWebhooksFilePath
};

