// Configuration
const LINE_DISTANCE_METERS = 10; // Distance between the two lines in meters

/**
 * Calculate speed from two line crossing triggers
 * @param {Array} triggers - Array of trigger objects with timestamps
 * @returns {Object|null} Object with speed (km/h) and timeDiff (seconds), or null if invalid
 */
function calculateSpeed(triggers) {
  try {
    // Validate triggers array
    if (!Array.isArray(triggers) || triggers.length < 2) {
      console.error('Invalid triggers: Need at least 2 triggers');
      return null;
    }

    // Filter to only line_crossed events
    const lineCrossings = triggers.filter(
      trigger => trigger.key === 'line_crossed' && trigger.timestamp
    );

    if (lineCrossings.length < 2) {
      console.error('Invalid triggers: Need at least 2 line_crossed events');
      return null;
    }

    // Sort by timestamp (ascending)
    lineCrossings.sort((a, b) => a.timestamp - b.timestamp);

    const firstTrigger = lineCrossings[0];
    const secondTrigger = lineCrossings[1];

    // Validate timestamps
    if (!firstTrigger.timestamp || !secondTrigger.timestamp) {
      console.error('Invalid triggers: Missing timestamps');
      return null;
    }

    // Calculate time difference in milliseconds
    const timeDiffMs = secondTrigger.timestamp - firstTrigger.timestamp;
    
    if (timeDiffMs <= 0) {
      console.error('Invalid triggers: Time difference must be positive');
      return null;
    }

    // Convert to seconds
    const timeDiffSeconds = timeDiffMs / 1000;

    // Calculate speed in m/s
    const speedMs = LINE_DISTANCE_METERS / timeDiffSeconds;

    // Convert to km/h
    const speedKmh = speedMs * 3.6;

    // Sanity check: reasonable speed range (0-300 km/h)
    if (speedKmh < 0 || speedKmh > 300) {
      console.warn(`Calculated speed ${speedKmh.toFixed(2)} km/h seems unreasonable`);
    }

    return {
      speed: parseFloat(speedKmh.toFixed(2)),
      speedMs: parseFloat(speedMs.toFixed(2)),
      timeDiff: parseFloat(timeDiffSeconds.toFixed(3)),
      timeDiffMs: timeDiffMs,
      lineDistance: LINE_DISTANCE_METERS,
      firstTrigger: {
        device: firstTrigger.device,
        line: firstTrigger.zones?.line?.[0],
        timestamp: firstTrigger.timestamp,
        eventId: firstTrigger.eventId
      },
      secondTrigger: {
        device: secondTrigger.device,
        line: secondTrigger.zones?.line?.[0],
        timestamp: secondTrigger.timestamp,
        eventId: secondTrigger.eventId
      }
    };
  } catch (error) {
    console.error('Error calculating speed:', error);
    return null;
  }
}

/**
 * Get the line distance configuration
 * @returns {number} Distance between lines in meters
 */
function getLineDistance() {
  return LINE_DISTANCE_METERS;
}

module.exports = {
  calculateSpeed,
  getLineDistance
};

