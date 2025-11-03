const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DETECTIONS_FILE = path.join(DATA_DIR, 'detections.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * Read all detections from the JSON file
 * @returns {Array} Array of detection objects
 */
function readDetections() {
  try {
    if (!fs.existsSync(DETECTIONS_FILE)) {
      return [];
    }
    const data = fs.readFileSync(DETECTIONS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading detections file:', error);
    return [];
  }
}

/**
 * Write detections to the JSON file
 * @param {Array} detections - Array of detection objects
 * @returns {boolean} Success status
 */
function writeDetections(detections) {
  try {
    fs.writeFileSync(DETECTIONS_FILE, JSON.stringify(detections, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Error writing detections file:', error);
    return false;
  }
}

/**
 * Add a new detection to storage
 * @param {Object} detection - Detection object to add
 * @returns {boolean} Success status
 */
function addDetection(detection) {
  try {
    console.log('=== ADDING DETECTION ===');
    console.log('Detection:', {
      id: detection.id,
      speed: detection.speed,
      timestamp: detection.timestamp,
      alarmName: detection.alarmName
    });
    
    const detections = readDetections();
    console.log(`Current detections count: ${detections.length}`);
    
    // Add timestamp if not present
    if (!detection.id) {
      detection.id = Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9);
    }
    
    // Add to beginning of array (most recent first)
    detections.unshift(detection);
    console.log(`Detections count after add: ${detections.length}`);
    
    // Limit to last 1000 detections to prevent file from growing too large
    const MAX_DETECTIONS = 1000;
    if (detections.length > MAX_DETECTIONS) {
      detections.splice(MAX_DETECTIONS);
      console.log(`Trimmed to ${MAX_DETECTIONS} detections`);
    }
    
    const success = writeDetections(detections);
    console.log(`Detection save ${success ? 'SUCCESS' : 'FAILED'}`);
    console.log('=== DETECTION ADDED ===\n');
    
    return success;
  } catch (error) {
    console.error('Error adding detection:', error);
    return false;
  }
}

/**
 * Get all detections
 * @param {number} limit - Optional limit on number of detections to return
 * @returns {Array} Array of detection objects
 */
function getDetections(limit = null) {
  const detections = readDetections();
  if (limit && limit > 0) {
    return detections.slice(0, limit);
  }
  return detections;
}

module.exports = {
  readDetections,
  writeDetections,
  addDetection,
  getDetections
};

