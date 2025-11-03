const API_URL = '/api/detections';
const WEBHOOKS_URL = '/api/webhooks';
const REFRESH_INTERVAL = 3000; // Refresh every 3 seconds

let refreshInterval = null;
let currentTab = 'webhooks';

/**
 * Get speed category based on speed value
 * @param {number} speed - Speed in km/h
 * @returns {string} Speed category class
 */
function getSpeedCategory(speed) {
  if (typeof speed !== 'number' || !isFinite(speed)) return 'speed-pending';
  if (speed < 40) return 'speed-low';
  if (speed < 80) return 'speed-medium';
  return 'speed-high';
}

/**
 * Format timestamp to readable date/time
 * @param {string} timestamp - ISO timestamp string
 * @returns {string} Formatted date/time string
 */
function formatTimestamp(timestamp) {
  try {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);

    // Show relative time if less than an hour ago
    if (diffMinutes < 1) {
      return 'Just now';
    } else if (diffMinutes < 60) {
      return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`;
    } else if (diffHours < 24) {
      return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    }

    // Show full date/time if older
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (error) {
    console.error('Error formatting timestamp:', error);
    return timestamp;
  }
}

/**
 * Create HTML for a detection card
 * @param {Object} detection - Detection object
 * @returns {string} HTML string
 */
function createDetectionCard(detection) {
  const speedCategory = getSpeedCategory(detection.speed);
  const formattedTime = formatTimestamp(detection.timestamp);
  const imageSrc = detection.image || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMWExZjNhIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxOCIgZmlsbD0iI2IwYjVjNCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPk5vIEltYWdlPC90ZXh0Pjwvc3ZnPg==';

  return `
    <div class="detection-card ${speedCategory}">
      <img src="${imageSrc}" alt="Detection" class="card-image" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMWExZjNhIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxOCIgZmlsbD0iI2IwYjVjNCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkltYWdlIEVycm9yPC90ZXh0Pjwvc3ZnPg=='">
      <div class="card-header">
        <div>
          <div class="speed-display ${speedCategory}">
            ${typeof detection.speed === 'number' && isFinite(detection.speed) ? `${detection.speed.toFixed(1)}<span class="speed-unit">km/h</span>` : `Pending`}
          </div>
        </div>
        <div class="timestamp">${formattedTime}</div>
      </div>
      <div class="card-details">
        ${typeof detection.timeDiff === 'number' ? `<div class="card-details-item">Time difference: ${detection.timeDiff.toFixed(3)}s</div>` : ''}
        ${typeof detection.lineDistance === 'number' ? `<div class="card-details-item">Distance: ${detection.lineDistance}m</div>` : ''}
        ${detection.alarmName ? `<div class="card-details-item">Alarm: ${detection.alarmName}</div>` : ''}
        ${detection.status === 'waiting' ? `<div class="card-details-item">Status: Waiting for second trigger (${detection.triggersReceived || 1} trigger${(detection.triggersReceived||1) > 1 ? 's' : ''} received)</div>` : ''}
      </div>
    </div>
  `;
}

/**
 * Fetch detections from API
 * @returns {Promise<Array>} Array of detections
 */
async function fetchDetections() {
  try {
    console.log('Fetching detections from:', API_URL);
    const response = await fetch(API_URL);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('API Response:', data);
    
    if (data.success && Array.isArray(data.detections)) {
      console.log(`Received ${data.detections.length} detections`);
      return data.detections;
    }
    
    console.log('Invalid API response format:', data);
    return [];
  } catch (error) {
    console.error('Error fetching detections:', error);
    updateStatus('Error loading detections', false);
    return [];
  }
}

/**
 * Render detections to the page
 * @param {Array} detections - Array of detection objects
 */
function renderDetections(detections) {
  const container = document.getElementById('detections-container');
  
  if (!container) {
    console.error('Detections container not found');
    return;
  }

  if (detections.length === 0) {
    container.innerHTML = `
      <div class="no-detections">
        <p>No detections yet. Waiting for webhook events...</p>
      </div>
    `;
    return;
  }

  container.innerHTML = detections.map(detection => 
    createDetectionCard(detection)
  ).join('');
}

/**
 * Update status indicator
 * @param {string} text - Status text
 * @param {boolean} active - Whether status is active/healthy
 */
function updateStatus(text, active = true) {
  const statusText = document.getElementById('status-text');
  const statusIndicator = document.getElementById('status-indicator');
  
  if (statusText) {
    statusText.textContent = text;
  }
  
  if (statusIndicator) {
    if (active) {
      statusIndicator.classList.add('active');
    } else {
      statusIndicator.classList.remove('active');
    }
  }
}

/**
 * Load and render detections
 */
async function loadDetections() {
  updateStatus('Loading...', false);
  
  const detections = await fetchDetections();
  console.log('Detections to render:', detections);
  
  renderDetections(detections);
  
  if (detections.length > 0) {
    updateStatus(`Live - ${detections.length} detection${detections.length > 1 ? 's' : ''}`, true);
  } else {
    updateStatus('Waiting for detections...', true);
  }
}

/**
 * Fetch webhooks from API
 * @returns {Promise<Array>} Array of webhooks
 */
async function fetchWebhooks() {
  try {
    const response = await fetch(WEBHOOKS_URL + '?limit=50');
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.success && Array.isArray(data.webhooks)) {
      return data.webhooks;
    }
    
    return [];
  } catch (error) {
    console.error('Error fetching webhooks:', error);
    return [];
  }
}

/**
 * Format webhook payload for display
 * @param {Object} webhook - Webhook entry
 * @returns {string} HTML string
 */
function createWebhookCard(webhook) {
  const receivedAt = formatTimestamp(webhook.receivedAt || webhook.timestamp);
  // Our logger stores the parsed payload under `parsed`
  const body = webhook.parsed || {};
  const alarm = body.alarm || {};
  const triggers = alarm.triggers || [];
  const hasTriggers = triggers.length > 0;
  const triggerCount = triggers.length;
  
  const triggerDetails = hasTriggers ? triggers.map(t => ({
    key: t.key,
    device: t.device,
    line: t.zones?.line?.[0],
    timestamp: new Date(t.timestamp).toISOString()
  })) : [];
  
  // Optional thumbnail
  const thumbnail = alarm.thumbnail || null;

  return `
    <div class="webhook-card">
      <div class="webhook-header">
        <div>
          <span class="webhook-badge ${hasTriggers ? 'has-triggers' : 'no-triggers'}">
            ${hasTriggers ? `${triggerCount} Trigger${triggerCount > 1 ? 's' : ''}` : 'No Triggers'}
          </span>
        </div>
        <div class="webhook-timestamp">${receivedAt}</div>
      </div>
      
      <div class="webhook-summary">
        ${alarm.name ? `<strong>Alarm:</strong> ${alarm.name}<br>` : ''}
        ${body.eventId ? `<div style="font-family: monospace; font-size: 0.85rem;">eventId: ${body.eventId}</div>` : ''}
        ${thumbnail ? `<div style="margin-top: 0.5rem;"><img src="${thumbnail}" alt="thumbnail" style="max-width: 280px; border-radius: 6px; border: 1px solid var(--border);"/></div>` : ''}
        ${triggerDetails.length > 0 ? `
          <div style="margin-top: 0.5rem;">
            ${triggerDetails.map(t => `
              <div style="margin: 0.25rem 0; font-family: monospace; font-size: 0.85rem;">
                • ${t.key || 'unknown'} | Device: ${t.device || 'unknown'} | Line: ${t.line || 'N/A'}
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
      
      <details class="webhook-details">
        <summary>View Full Payload</summary>
        <pre>${JSON.stringify(webhook, null, 2)}</pre>
      </details>
    </div>
  `;
}

/**
 * Render webhooks to the page
 * @param {Array} webhooks - Array of webhook objects
 */
function renderWebhooks(webhooks) {
  const container = document.getElementById('webhooks-container');
  
  if (!container) {
    console.error('Webhooks container not found');
    return;
  }

  if (webhooks.length === 0) {
    container.innerHTML = `
      <div class="no-webhooks">
        <p>No webhooks logged yet. Waiting for webhook events...</p>
      </div>
    `;
    return;
  }

  container.innerHTML = webhooks.map(webhook => 
    createWebhookCard(webhook)
  ).join('');
}

/**
 * Load and render webhooks
 */
async function loadWebhooks() {
  const webhooks = await fetchWebhooks();
  renderWebhooks(webhooks);
}

/**
 * Switch between tabs
 */
function switchTab(tabName) {
  currentTab = tabName;
  
  // Update tab buttons
  document.querySelectorAll('.tab-button').forEach(btn => {
    if (btn.dataset.tab === tabName) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  
  // Update tab content
  document.querySelectorAll('.tab-content').forEach(content => {
    if (content.id === `${tabName}-container`) {
      content.classList.add('active');
    } else {
      content.classList.remove('active');
    }
  });
  
  // Load appropriate data
  if (tabName === 'detections') {
    loadDetections();
  } else if (tabName === 'webhooks') {
    loadWebhooks();
  }
}

/**
 * Initialize the application
 */
function init() {
  // Set up tab switching
  document.querySelectorAll('.tab-button').forEach(btn => {
    btn.addEventListener('click', () => {
      switchTab(btn.dataset.tab);
    });
  });
  
  // Load initial data
  if (currentTab === 'detections') {
    loadDetections();
  } else {
    loadWebhooks();
  }
  
  // Set up auto-refresh
  refreshInterval = setInterval(() => {
    if (currentTab === 'detections') {
      loadDetections();
    } else {
      loadWebhooks();
    }
  }, REFRESH_INTERVAL);
  
  // Handle page visibility to pause/resume when tab is hidden/visible
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
      }
    } else {
      if (!refreshInterval) {
        if (currentTab === 'detections') {
          loadDetections();
        } else {
          loadWebhooks();
        }
        refreshInterval = setInterval(() => {
          if (currentTab === 'detections') {
            loadDetections();
          } else {
            loadWebhooks();
          }
        }, REFRESH_INTERVAL);
      }
    }
  });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

