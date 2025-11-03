/**
 * Trigger Accumulator Service
 * 
 * Accumulates line crossing triggers from webhooks that may arrive separately.
 * Matches triggers when we have 2 from the same detection event (same sources/devices).
 */

// In-memory storage for pending triggers
const pendingTriggers = new Map();

// Configuration
const MATCH_WINDOW_MS = 30000; // 30 seconds to match triggers
const CLEANUP_INTERVAL_MS = 60000; // Clean up old triggers every minute

/**
 * Clean up old triggers that haven't been matched
 */
function cleanupOldTriggers() {
  const now = Date.now();
  const toDelete = [];
  
  for (const [key, trigger] of pendingTriggers.entries()) {
    const age = now - trigger.receivedAt;
    if (age > MATCH_WINDOW_MS) {
      toDelete.push(key);
    }
  }
  
  toDelete.forEach(key => {
    console.log(`Cleaning up unmatched trigger: ${key} (age: ${Math.round((now - pendingTriggers.get(key).receivedAt) / 1000)}s)`);
    pendingTriggers.delete(key);
  });
  
  if (toDelete.length > 0) {
    console.log(`Cleaned up ${toDelete.length} old unmatched triggers. Remaining: ${pendingTriggers.size}`);
  }
}

// Run cleanup periodically
setInterval(cleanupOldTriggers, CLEANUP_INTERVAL_MS);

/**
 * Generate a key for grouping triggers from the same vehicle detection
 * Uses alarm sources/devices to group triggers from the same vehicle
 */
function generateGroupKey(alarm) {
  // Use alarm name and sources to group triggers
  const alarmName = alarm.name || 'Unknown';
  const sources = (alarm.sources || []).map(s => s.device || '').sort().join(',');
  return `${alarmName}:${sources}`;
}

/**
 * Generate a unique key for a trigger
 */
function generateTriggerKey(trigger) {
  return `${trigger.device}:${trigger.eventId}:${trigger.timestamp}`;
}

/**
 * Process a trigger and try to match it with a pending trigger
 * @param {Object} trigger - Trigger object from webhook
 * @param {Object} alarm - Alarm object containing metadata
 * @returns {Object|null} Matched triggers array (2 triggers) if matched, null if waiting
 */
function processTrigger(trigger, alarm) {
  try {
    // Validate trigger
    if (!trigger || trigger.key !== 'line_crossed' || !trigger.timestamp) {
      console.log('Invalid trigger - not a line_crossed event or missing timestamp');
      return null;
    }

    const groupKey = generateGroupKey(alarm);
    const triggerKey = generateTriggerKey(trigger);
    
    // Store full trigger info
    const triggerInfo = {
      trigger: trigger,
      alarm: alarm,
      receivedAt: Date.now(),
      groupKey: groupKey,
      triggerKey: triggerKey
    };

    console.log(`Processing trigger: ${triggerKey}, Group: ${groupKey}, Line: ${trigger.zones?.line?.[0]}`);

    // Check if we have a pending trigger from the same group
    const pendingInGroup = Array.from(pendingTriggers.values())
      .filter(t => t.groupKey === groupKey && t.triggerKey !== triggerKey);

    if (pendingInGroup.length === 0) {
      // No pending trigger, store this one and wait
      pendingTriggers.set(triggerKey, triggerInfo);
      console.log(`Stored trigger ${triggerKey}, waiting for matching trigger. Pending: ${pendingTriggers.size}`);
      return null;
    }

    // Find the best matching trigger (from different line)
    let matchedTrigger = null;
    const currentLine = trigger.zones?.line?.[0];
    
    for (const pending of pendingInGroup) {
      const pendingLine = pending.trigger.zones?.line?.[0];
      
      // Match triggers from different lines
      if (pendingLine !== currentLine) {
        matchedTrigger = pending;
        break;
      }
    }

    if (matchedTrigger) {
      // We have a match! Remove the matched trigger and return both
      const matchedKey = matchedTrigger.triggerKey;
      pendingTriggers.delete(matchedKey);
      console.log(`Matched trigger ${triggerKey} with ${matchedKey}`);

      // Sort by timestamp
      const triggers = [matchedTrigger.trigger, trigger];
      triggers.sort((a, b) => a.timestamp - b.timestamp);

      return triggers;
    } else {
      // Same line or couldn't match, store this one
      pendingTriggers.set(triggerKey, triggerInfo);
      console.log(`Stored trigger ${triggerKey} (couldn't match with existing). Pending: ${pendingTriggers.size}`);
      return null;
    }

  } catch (error) {
    console.error('Error processing trigger:', error);
    return null;
  }
}

/**
 * Process triggers from a webhook payload
 * Handles both cases: single trigger or multiple triggers in one webhook
 * @param {Object} payload - Full webhook payload
 * @returns {Array|null} Array of 2 triggers if matched, null if waiting
 */
function processWebhook(payload) {
  try {
    if (!payload || !payload.alarm) {
      return null;
    }

    const { alarm } = payload;
    const triggers = alarm.triggers || [];

    if (triggers.length === 0) {
      return null;
    }

    // If we already have 2+ triggers in the webhook, process directly
    if (triggers.length >= 2) {
      const lineCrossings = triggers.filter(
        t => t.key === 'line_crossed' && t.timestamp
      );

      if (lineCrossings.length >= 2) {
        // Sort by timestamp
        lineCrossings.sort((a, b) => a.timestamp - b.timestamp);
        console.log(`Webhook contains ${lineCrossings.length} line crossings, processing directly`);
        return lineCrossings.slice(0, 2);
      }
    }

    // Single trigger - try to match with pending
    if (triggers.length === 1) {
      const trigger = triggers[0];
      return processTrigger(trigger, alarm);
    }

    // Multiple triggers but less than 2 line_crossed - process individually
    const lineCrossings = triggers.filter(
      t => t.key === 'line_crossed' && t.timestamp
    );

    if (lineCrossings.length === 1) {
      return processTrigger(lineCrossings[0], alarm);
    }

    return null;

  } catch (error) {
    console.error('Error processing webhook:', error);
    return null;
  }
}

/**
 * Get statistics about pending triggers
 */
function getStats() {
  return {
    pendingCount: pendingTriggers.size,
    groups: Array.from(pendingTriggers.values())
      .reduce((acc, t) => {
        acc[t.groupKey] = (acc[t.groupKey] || 0) + 1;
        return acc;
      }, {})
  };
}

module.exports = {
  processWebhook,
  processTrigger,
  getStats,
  cleanupOldTriggers
};

