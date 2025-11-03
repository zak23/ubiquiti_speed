# Ubiquiti Speed Trap API - Developer Guide

https://webhook.site/#!/view/e1c63953-0b29-4b1e-b2a8-1d60a1216f8c/f4faaaa4-e4bc-42a6-8df2-9361b67abba0/1

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture](#architecture)
3. [How It Works](#how-it-works)
4. [File Structure](#file-structure)
5. [Configuration](#configuration)
6. [API Endpoints](#api-endpoints)
7. [Frontend Application](#frontend-application)
8. [Data Storage](#data-storage)
9. [Deployment Setup](#deployment-setup)
10. [Extension Points](#extension-points)
11. [Troubleshooting](#troubleshooting)

---

## System Overview

### What This System Does

The **Ubiquiti Speed Trap API** is a Node.js application that receives webhook events from Ubiquiti Protect cameras when vehicles cross two virtual lines placed 10 meters apart. The system:

1. **Captures webhook payloads** from Ubiquiti Protect cameras in real-time
2. **Processes trigger events** to match line crossings from the same vehicle detection
3. **Calculates vehicle speed** using the time difference between two line crossings
4. **Stores detection records** with speed, timestamp, and thumbnail images
5. **Displays results** via a web interface showing recent detections and raw webhook data

### Key Features

- **Capture-Only Mode**: Currently stores all webhook payloads verbatim to `data/webhooks.jsonl` for analysis
- **Trigger Accumulation**: Handles webhooks that arrive separately (one trigger per webhook or multiple triggers in one webhook)
- **Speed Calculation**: Calculates speed in km/h from two line crossing events 10 meters apart
- **JSONL Logging**: Append-only JSON Lines format for efficient webhook storage with automatic rotation at 50MB
- **Web Interface**: Real-time display of detections and webhook logs with tabbed interface
- **REST API**: JSON endpoints for programmatic access to detections and webhook data

---

## Architecture

### High-Level Flow

```
Ubiquiti Protect Camera
    ↓
    | (HTTP POST)
    ↓
Caddy Reverse Proxy (HTTPS termination, Cloudflare)
    ↓
    | (HTTP)
    ↓
Node.js Express Server (Port 3001)
    ↓
    ├─→ Webhook Route → Webhook Logger → data/webhooks.jsonl
    │
    ├─→ Trigger Accumulator → Speed Calculator
    │                              ↓
    │                       Detection Storage → data/detections.json
    │
    └─→ API Routes → Frontend/API Clients
```

### Component Architecture

1. **Express Server** (`server.js`)
   - Main application entry point
   - Middleware setup (CORS, body parsing, static files)
   - Route registration
   - Error handling

2. **Webhook Handler** (`routes/webhook.js`)
   - Receives POST requests from Ubiquiti Protect
   - Captures raw and parsed payloads
   - Logs to JSONL file without validation/transformation

3. **Trigger Accumulator** (`services/triggerAccumulator.js`)
   - In-memory storage for pending triggers
   - Matches triggers from same vehicle (same alarm name + sources)
   - Handles both single-trigger and multi-trigger webhooks
   - Automatic cleanup of unmatched triggers after 30 seconds

4. **Speed Calculator** (`services/speedCalculator.js`)
   - Extracts two line_crossed triggers
   - Validates timestamps and trigger data
   - Calculates speed: `speed = (distance / timeDiff) * 3.6` km/h
   - Distance: 10 meters (configurable)

5. **Storage Service** (`services/storage.js`)
   - JSON file-based storage for detections
   - Automatic limit enforcement (max 1000 detections)
   - Prepared for MongoDB migration (abstract interface)

6. **Webhook Logger** (`services/webhookLogger.js`)
   - JSONL (JSON Lines) format logging
   - Automatic file rotation at 50MB
   - Preserves raw body, parsed JSON, and headers

7. **API Routes** (`routes/api.js`)
   - `GET /api/detections` - Retrieve detection records
   - `GET /api/webhooks` - Retrieve parsed webhook logs
   - `GET /api/webhooks/raw` - Retrieve raw JSONL lines
   - `GET /api/stats` - System statistics

8. **Frontend** (`public/`)
   - Single-page application with tabbed interface
   - Real-time auto-refresh (every 3 seconds)
   - Detection cards with speed color coding
   - Webhook viewer with expandable details

---

## How It Works

### Webhook Reception Flow

1. **Ubiquiti Protect sends webhook** to `https://speedtrap.ohfuckputitback.in/api/webhook`
2. **Caddy reverse proxy** forwards request to `http://192.168.1.64:3001/api/webhook`
3. **Express middleware** captures raw body using body-parser verify hooks
4. **Webhook route** extracts:
   - Remote IP address
   - HTTP headers
   - Query parameters
   - Raw body (string)
   - Parsed body (JSON)
5. **Webhook logger** appends entry to `data/webhooks.jsonl`:
   ```json
   {
     "receivedAt": "2024-01-15T10:30:45.123Z",
     "remoteIp": "192.168.1.100",
     "method": "POST",
     "path": "/api/webhook",
     "headers": {...},
     "rawBody": "{...}",
     "parsed": {...}
   }
   ```
6. **Response**: Returns `200 OK` with `{"success": true}`

### Trigger Processing Flow

**Current State**: System is in **capture-only mode**. The trigger accumulator and speed calculator services exist but are not actively called from the webhook route.

**Intended Flow** (for future implementation):

1. **Webhook payload parsed** → Extract `alarm.triggers[]`
2. **Trigger accumulator** (`processWebhook()`):
   - If webhook contains 2+ `line_crossed` triggers → Process directly
   - If webhook contains 1 trigger → Store in memory, wait for matching trigger
   - Matching logic:
     - Same `alarm.name`
     - Same `alarm.sources[]` (device IDs)
     - Different `zones.line[]` values (different line numbers)
3. **When 2 triggers matched**:
   - **Speed calculator** (`calculateSpeed()`):
     - Sort triggers by timestamp (ascending)
     - Validate both have `key: "line_crossed"` and valid timestamps
     - Calculate time difference: `timeDiffMs = timestamp2 - timestamp1`
     - Convert to seconds: `timeDiffSeconds = timeDiffMs / 1000`
     - Calculate speed: `speed = (10 / timeDiffSeconds) * 3.6` km/h
     - Validate speed is reasonable (0-300 km/h)
   - **Storage service** (`addDetection()`):
     - Create detection record:
       ```json
       {
         "id": "timestamp-randomstring",
         "timestamp": "2024-01-15T10:30:45.123Z",
         "speed": 65.43,
         "speedMs": 18.18,
         "timeDiff": 0.550,
         "timeDiffMs": 550,
         "lineDistance": 10,
         "alarmName": "Speed Test 1",
         "image": "data:image/jpeg;base64,...",
         "firstTrigger": {...},
         "secondTrigger": {...}
       }
       ```
     - Add to `data/detections.json` (most recent first)
     - Trim to max 1000 detections

### Data Flow Diagram

```
Webhook Payload
    ↓
┌─────────────────────────┐
│ Webhook Logger          │ → data/webhooks.jsonl
│ (Capture-only)          │
└─────────────────────────┘
    ↓
┌─────────────────────────┐
│ Trigger Accumulator     │ → In-memory Map
│ (Matching logic)        │   - pendingTriggers
└─────────────────────────┘   - Cleanup after 30s
    ↓ (when matched)
┌─────────────────────────┐
│ Speed Calculator        │ → Speed + metadata
│ (10m / timeDiff * 3.6)  │
└─────────────────────────┘
    ↓
┌─────────────────────────┐
│ Storage Service         │ → data/detections.json
│ (JSON file storage)     │   - Max 1000 records
└─────────────────────────┘
```

---

## File Structure

```
/
├── server.js                      # Main Express server entry point
├── package.json                   # Dependencies and scripts
│
├── routes/
│   ├── webhook.js                 # POST /api/webhook endpoint (capture-only)
│   └── api.js                     # GET /api/* endpoints (detections, webhooks, stats)
│
├── services/
│   ├── speedCalculator.js         # Speed calculation logic
│   ├── storage.js                 # Detection storage (JSON file)
│   ├── triggerAccumulator.js      # Trigger matching service
│   └── webhookLogger.js           # JSONL webhook logging
│
├── public/                        # Static files served at /
│   ├── index.html                 # Main HTML page
│   ├── app.js                     # Frontend JavaScript
│   └── style.css                  # CSS styling
│
├── data/                          # Runtime data (git-ignored)
│   ├── detections.json            # Detection records (JSON array)
│   └── webhooks.jsonl             # Webhook log (JSON Lines, rotates at 50MB)
│
├── README.md                      # Quick start guide
├── DEVELOPER_GUIDE.md            # This file
├── TROUBLESHOOTING.md             # Common issues and fixes
├── Caddyfile.snippet              # Caddy reverse proxy configuration
└── example_payload.json           # Example webhook payload for testing
```

### File Responsibilities

#### `server.js`
- Express app initialization
- Middleware configuration:
  - CORS enabled
  - Body parser (JSON and URL-encoded) with 50MB limit
  - Raw body capture via verify hooks
  - Request logging middleware
  - Static file serving (`/public`)
- Route registration:
  - `/api` → webhook and API routes
  - `/` → Serves `index.html`
- Error handling (500, 404)
- Server binding to `0.0.0.0:3001` (network accessible)

#### `routes/webhook.js`
- `POST /api/webhook` endpoint
- **Capture-only mode**: No validation or processing
- Extracts request metadata (IP, headers, query, rawBody, parsed)
- Calls `webhookLogger.logWebhook()` to persist
- Returns `200 OK` or `500` on failure

#### `routes/api.js`
- `GET /api/detections?limit=N` - Returns detection records
- `GET /api/webhooks?limit=N` - Returns parsed webhook entries (most recent first)
- `GET /api/webhooks/raw?limit=N` - Returns raw JSONL lines (last N lines)
- `GET /api/stats` - Returns system statistics

#### `services/speedCalculator.js`
- `calculateSpeed(triggers)` - Main calculation function
  - Validates triggers array has at least 2 items
  - Filters for `line_crossed` events
  - Sorts by timestamp
  - Calculates: `speed = (LINE_DISTANCE_METERS / timeDiffSeconds) * 3.6`
  - Returns object with speed, timeDiff, trigger details, or `null` on error
- `getLineDistance()` - Returns configured line distance (10m)

#### `services/storage.js`
- `readDetections()` - Reads `data/detections.json`
- `writeDetections(detections)` - Writes to file
- `addDetection(detection)` - Adds detection, trims to 1000 max
- `getDetections(limit)` - Returns detections (optionally limited)

#### `services/triggerAccumulator.js`
- `processWebhook(payload)` - Processes webhook payload
  - If 2+ triggers: returns matched triggers immediately
  - If 1 trigger: stores in memory, returns `null` (waiting)
- `processTrigger(trigger, alarm)` - Individual trigger processing
  - Generates group key from `alarm.name` + `alarm.sources`
  - Matches with pending triggers from same group
  - Returns 2 matched triggers or `null`
- `cleanupOldTriggers()` - Removes triggers older than 30 seconds
- `getStats()` - Returns pending trigger statistics

#### `services/webhookLogger.js`
- `logWebhook(entry)` - Appends entry to `data/webhooks.jsonl`
  - Adds `receivedAt` timestamp
  - Checks for file rotation (50MB)
- `readWebhooks()` - Reads and parses JSONL file
- `getWebhooksFilePath()` - Returns file path
- `rotateIfNeeded()` - Rotates file when >50MB
  - Renames to `webhooks-YYYYMMDDHHMMSS.jsonl`

#### `public/index.html`
- HTML structure with:
  - Header with status indicator
  - Tab navigation (Detections, Webhooks)
  - Container divs for each tab
  - Footer

#### `public/app.js`
- Tab switching logic
- Auto-refresh every 3 seconds
- Detection fetching and rendering:
  - `fetchDetections()` - Calls `/api/detections`
  - `renderDetections()` - Creates detection cards
  - Speed color coding (green/yellow/red)
- Webhook fetching and rendering:
  - `fetchWebhooks()` - Calls `/api/webhooks?limit=50`
  - `renderWebhooks()` - Creates webhook cards
- Status indicator updates
- Visibility API integration (pauses refresh when tab hidden)

#### `public/style.css`
- CSS variables for theming (dark theme)
- Responsive grid layout for detections
- Card styling with hover effects
- Speed-based color coding
- Tab navigation styling
- Mobile-responsive design

---

## Configuration

### Environment Variables

- `PORT` - Server port (default: `3001`)
  - Note: Port 3000 is reserved for MCP tools

### Code Configuration

#### `services/speedCalculator.js`
```javascript
const LINE_DISTANCE_METERS = 10; // Distance between lines in meters
```

#### `services/storage.js`
```javascript
const MAX_DETECTIONS = 1000; // Maximum detections to store
```

#### `services/webhookLogger.js`
```javascript
const MAX_LOG_BYTES = 50 * 1024 * 1024; // 50MB rotation threshold
```

#### `services/triggerAccumulator.js`
```javascript
const MATCH_WINDOW_MS = 30000; // 30 seconds to match triggers
const CLEANUP_INTERVAL_MS = 60000; // Cleanup every minute
```

#### `public/app.js`
```javascript
const REFRESH_INTERVAL = 3000; // Refresh every 3 seconds
```

### Server Binding

The server binds to `0.0.0.0:3001` (not `127.0.0.1`) to allow access from:
- Caddy reverse proxy on a different machine
- Network clients
- Local clients

---

## API Endpoints

### Webhook Endpoint

**`POST /api/webhook`**

Receives webhook payloads from Ubiquiti Protect.

**Request:**
- Method: `POST`
- Content-Type: `application/json`
- Body: Ubiquiti Protect webhook payload

**Response:**
```json
{
  "success": true
}
```

**Status Codes:**
- `200` - Successfully logged
- `500` - Failed to persist webhook

**Current Behavior (Capture-Only Mode):**
- No validation
- No speed calculation
- No detection creation
- Stores raw and parsed payload to `data/webhooks.jsonl`

### Detection Endpoints

**`GET /api/detections?limit=N`**

Returns detection records.

**Query Parameters:**
- `limit` (optional) - Maximum number of detections to return

**Response:**
```json
{
  "success": true,
  "count": 5,
  "detections": [
    {
      "id": "1234567890-abc123",
      "timestamp": "2024-01-15T10:30:45.123Z",
      "speed": 65.43,
      "speedMs": 18.18,
      "timeDiff": 0.550,
      "timeDiffMs": 550,
      "lineDistance": 10,
      "alarmName": "Speed Test 1",
      "image": "data:image/jpeg;base64,...",
      "firstTrigger": {...},
      "secondTrigger": {...}
    }
  ]
}
```

**Status Codes:**
- `200` - Success
- `500` - Server error

### Webhook Log Endpoints

**`GET /api/webhooks?limit=N`**

Returns parsed webhook log entries.

**Query Parameters:**
- `limit` (optional) - Maximum number of webhooks to return

**Response:**
```json
{
  "success": true,
  "count": 10,
  "filePath": "data/webhooks.jsonl",
  "sizeBytes": 1234567,
  "triggerStats": {
    "pendingCount": 2,
    "groups": {...}
  },
  "webhooks": [
    {
      "receivedAt": "2024-01-15T10:30:45.123Z",
      "remoteIp": "192.168.1.100",
      "headers": {...},
      "rawBody": "{...}",
      "parsed": {...},
      "rawPreview": "..."
    }
  ]
}
```

**Note:** Webhooks are returned in reverse order (most recent first).

**`GET /api/webhooks/raw?limit=N`**

Returns raw JSONL lines from the log file.

**Query Parameters:**
- `limit` (optional, default: 100) - Number of lines to return

**Response:**
```json
{
  "success": true,
  "filePath": "data/webhooks.jsonl",
  "lines": [
    "{\"receivedAt\":\"...\",\"parsed\":{...}}",
    "{\"receivedAt\":\"...\",\"parsed\":{...}}"
  ]
}
```

### Statistics Endpoint

**`GET /api/stats`**

Returns system statistics.

**Response:**
```json
{
  "success": true,
  "detections": {
    "total": 42,
    "latest": "2024-01-15T10:30:45.123Z"
  },
  "triggers": {
    "pendingCount": 2,
    "groups": {...}
  },
  "webhooks": {
    "total": 150,
    "latest": "2024-01-15T10:30:45.123Z",
    "recent": [...]
  }
}
```

### Root Endpoint

**`GET /`**

Serves the web interface (`public/index.html`).

---

## Frontend Application

### Architecture

The frontend is a single-page application (SPA) that:
- Fetches data from the API
- Renders detection cards and webhook cards
- Auto-refreshes every 3 seconds
- Pauses refresh when the browser tab is hidden (Visibility API)

### Detection Display

**Detection Cards:**
- **Image**: Thumbnail from detection (or placeholder)
- **Speed**: Large display with color coding:
  - Green: < 40 km/h
  - Yellow: 40-80 km/h
  - Red: > 80 km/h
  - Gray: Pending (no speed calculated)
- **Timestamp**: Relative time ("2 minutes ago") or full date/time
- **Details**: Time difference, line distance, alarm name, status

**Grid Layout:**
- Responsive grid (min 350px per card)
- Mobile: Single column
- Desktop: Multiple columns

### Webhook Display

**Webhook Cards:**
- **Badge**: Shows trigger count (has-triggers / no-triggers)
- **Timestamp**: When webhook was received
- **Summary**: Alarm name, event ID, thumbnail, trigger details
- **Expandable Details**: Full JSON payload (click to expand)

**List Layout:**
- Vertical list (most recent first)
- Scrollable with expandable details

### Tab System

**Tabs:**
- **Detections**: Shows processed detection records
- **Webhooks**: Shows raw webhook log entries

**Behavior:**
- Only one tab active at a time
- Active tab determines which data is fetched
- Tab state persists during refresh

### Status Indicator

**Header Status:**
- **Dot**: Green (active) or Yellow (loading/error)
- **Text**: Current status message
- Updates based on API responses

---

## Data Storage

### Webhook Log (`data/webhooks.jsonl`)

**Format:** JSON Lines (one JSON object per line)

**Structure:**
```json
{"receivedAt":"2024-01-15T10:30:45.123Z","remoteIp":"192.168.1.100","method":"POST","path":"/api/webhook","headers":{},"rawBody":"{...}","parsed":{...}}
{"receivedAt":"2024-01-15T10:30:46.456Z","remoteIp":"192.168.1.100","method":"POST","path":"/api/webhook","headers":{},"rawBody":"{...}","parsed":{...}}
```

**Rotation:**
- File size checked before each append
- When >= 50MB, file renamed to `webhooks-YYYYMMDDHHMMSS.jsonl`
- New file created for subsequent entries

**Why JSONL:**
- Efficient append-only operations
- Easy to read line-by-line
- No need to parse entire file
- Can be processed with `tail`, `head`, or stream processing

### Detection Storage (`data/detections.json`)

**Format:** JSON array (pretty-printed)

**Structure:**
```json
[
  {
    "id": "1234567890-abc123",
    "timestamp": "2024-01-15T10:30:45.123Z",
    "speed": 65.43,
    ...
  },
  ...
]
```

**Order:**
- Most recent first (new detections added with `unshift()`)

**Limits:**
- Maximum 1000 detections
- Older detections removed when limit exceeded

**Storage Abstraction:**
- Functions: `readDetections()`, `writeDetections()`, `addDetection()`, `getDetections()`
- Prepared for MongoDB migration (can swap implementation)

---

## Deployment Setup

### Prerequisites

- Node.js 14+ (or latest LTS)
- npm or yarn
- Caddy v2 (for reverse proxy)
- Cloudflare account (for DNS and SSL)

### Installation

```bash
# Clone or navigate to project
cd ubiquiti_speed

# Install dependencies
npm install
```

### Local Development

```bash
# Start server
npm start

# Server runs on http://0.0.0.0:3001
```

### Production Deployment

#### 1. Node.js Server Setup

**On the Node.js server machine (192.168.1.64):**

```powershell
# Install dependencies
npm install

# Start with PM2 (recommended)
npm install -g pm2
pm2 start server.js --name speedtrap
pm2 save
pm2 startup

# Or use Windows Service, forever, or systemd
```

#### 2. Firewall Configuration

**Windows Firewall:**
```powershell
New-NetFirewallRule -DisplayName "Speed Trap API" -Direction Inbound -LocalPort 3001 -Protocol TCP -Action Allow
```

**Linux (iptables/ufw):**
```bash
sudo ufw allow 3001/tcp
```

#### 3. Caddy Reverse Proxy Setup

**On the Caddy server machine:**

Add to Caddyfile (see `Caddyfile.snippet`):

```caddyfile
{
  auto_https disable_redirects
}

speedtrap.ohfuckputitback.in {
  import cloudflare_tls

  reverse_proxy http://192.168.1.64:3001 {
    header_up Host {host}
    header_up X-Real-IP {remote_host}
    
    transport http {
      dial_timeout 10s
      response_header_timeout 10s
    }
  }
}
```

**Important Notes:**
- `auto_https disable_redirects` prevents redirect loops with Cloudflare
- Update `192.168.1.64` to your Node.js server IP
- `cloudflare_tls` module needed for Cloudflare SSL certificates

**Start Caddy:**
```bash
sudo systemctl start caddy
sudo systemctl enable caddy
```

#### 4. Cloudflare Configuration

1. **DNS Record:**
   - Type: `A`
   - Name: `speedtrap` (or your subdomain)
   - Content: `144.6.111.54` (your Caddy server IP)
   - Proxy: Enabled (orange cloud)

2. **SSL/TLS Settings:**
   - Mode: Full (strict)
   - Edge Certificates: Auto

#### 5. Ubiquiti Protect Configuration

**Webhook URL:**
```
https://speedtrap.ohfuckputitback.in/api/webhook
```

**Alarm Configuration:**
- Create alarm with two line zones (10m apart)
- Set condition: `line_crossed`
- Configure devices/sources
- Enable webhook notifications

### Testing

**Local Server:**
```bash
curl http://127.0.0.1:3001/api/detections
```

**Network:**
```bash
curl http://192.168.1.64:3001/api/detections
```

**Public:**
```bash
curl https://speedtrap.ohfuckputitback.in/api/detections
```

**Test Webhook:**
```bash
curl -X POST https://speedtrap.ohfuckputitback.in/api/webhook \
  -H "Content-Type: application/json" \
  -d @example_payload.json
```

---

## Extension Points

### Adding Speed Calculation Processing

**Current State:** System captures webhooks but doesn't process triggers for speed calculation.

**To Enable Processing:**

1. **Modify `routes/webhook.js`:**

```javascript
const { processWebhook } = require('../services/triggerAccumulator');
const { calculateSpeed } = require('../services/speedCalculator');
const { addDetection } = require('../services/storage');

router.post('/webhook', async (req, res) => {
  try {
    // ... existing logging code ...
    
    // Process triggers if payload has alarm.triggers
    const payload = req.body;
    if (payload && payload.alarm && payload.alarm.triggers) {
      const matchedTriggers = processWebhook(payload);
      
      if (matchedTriggers && matchedTriggers.length >= 2) {
        const speedResult = calculateSpeed(matchedTriggers);
        
        if (speedResult) {
          const detection = {
            timestamp: new Date().toISOString(),
            speed: speedResult.speed,
            speedMs: speedResult.speedMs,
            timeDiff: speedResult.timeDiff,
            timeDiffMs: speedResult.timeDiffMs,
            lineDistance: speedResult.lineDistance,
            alarmName: payload.alarm.name,
            image: payload.alarm.thumbnail,
            firstTrigger: speedResult.firstTrigger,
            secondTrigger: speedResult.secondTrigger
          };
          
          addDetection(detection);
        }
      }
    }
    
    return res.status(200).json({ success: true });
  } catch (error) {
    // ... error handling ...
  }
});
```

### Adding MongoDB Support

**Modify `services/storage.js`:**

```javascript
const { MongoClient } = require('mongodb');

let db = null;

async function connect() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  db = client.db('speedtrap');
}

async function addDetection(detection) {
  if (!db) await connect();
  
  await db.collection('detections').insertOne({
    ...detection,
    createdAt: new Date()
  });
  
  // Optionally: limit collection size
  const count = await db.collection('detections').countDocuments();
  if (count > 1000) {
    await db.collection('detections')
      .deleteMany({}, { sort: { createdAt: 1 }, limit: count - 1000 });
  }
}

async function getDetections(limit = null) {
  if (!db) await connect();
  
  let query = db.collection('detections')
    .find()
    .sort({ createdAt: -1 });
  
  if (limit) {
    query = query.limit(limit);
  }
  
  return await query.toArray();
}
```

### Adding Authentication

**Add to `server.js`:**

```javascript
const basicAuth = require('express-basic-auth');

app.use('/api', basicAuth({
  users: { 'admin': process.env.API_PASSWORD },
  challenge: true,
  realm: 'Speed Trap API'
}));
```

### Adding Webhook Validation

**Add to `routes/webhook.js`:**

```javascript
const crypto = require('crypto');

function verifyWebhookSignature(payload, signature, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(JSON.stringify(payload));
  const expected = hmac.digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}

router.post('/webhook', (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  const secret = process.env.WEBHOOK_SECRET;
  
  if (!verifyWebhookSignature(req.body, signature, secret)) {
    return res.status(401).json({ success: false, error: 'Invalid signature' });
  }
  
  // ... rest of handler ...
});
```

### Adding Real-Time Updates (WebSocket)

**Install Socket.io:**

```bash
npm install socket.io
```

**Modify `server.js`:**

```javascript
const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer(app);
const io = new Server(server);

// Emit detection when created
function notifyDetection(detection) {
  io.emit('newDetection', detection);
}

// In webhook route, after addDetection():
addDetection(detection);
notifyDetection(detection);

server.listen(PORT, '0.0.0.0', () => {
  // ...
});
```

**Frontend (`public/app.js`):**

```javascript
const socket = io();

socket.on('newDetection', (detection) => {
  loadDetections(); // Refresh on new detection
});
```

---

## Troubleshooting

### Common Issues

#### 1. Error 521: Web Server is Down

**Symptom:** Cloudflare shows Error 521.

**Causes:**
- Node.js server not running
- Caddy not running
- Firewall blocking port 3001
- Network connectivity issues

**Solutions:**
- Check Node.js server: `curl http://192.168.1.64:3001/api/detections`
- Check Caddy: `systemctl status caddy`
- Check firewall rules
- Verify network connectivity between Caddy and Node.js server

See `TROUBLESHOOTING.md` for detailed steps.

#### 2. Redirect Loop (ERR_TOO_MANY_REDIRECTS)

**Symptom:** Browser shows redirect loop error.

**Cause:** Caddy's automatic HTTPS redirect conflicts with Cloudflare proxy.

**Solution:** Add to Caddyfile:
```caddyfile
{
  auto_https disable_redirects
}
```

#### 3. Webhooks Not Being Received

**Checklist:**
- [ ] Ubiquiti Protect webhook URL is correct
- [ ] Caddy is running and forwarding requests
- [ ] Node.js server is running
- [ ] Check `data/webhooks.jsonl` for entries
- [ ] Check server logs for errors
- [ ] Verify Cloudflare proxy is not blocking requests

#### 4. No Detections Being Created

**Current State:** System is in capture-only mode. Detections are only created when trigger processing is enabled.

**To Enable:** See [Extension Points - Adding Speed Calculation Processing](#adding-speed-calculation-processing)

#### 5. Webhook Log File Growing Too Large

**Automatic Rotation:**
- File rotates automatically at 50MB
- Old files renamed with timestamp: `webhooks-YYYYMMDDHHMMSS.jsonl`
- Manual cleanup: Delete old rotated files periodically

#### 6. Port 3001 Already in Use

**Solution:**
```bash
# Find process using port 3001
netstat -ano | findstr ":3001"

# Kill process (Windows)
taskkill /PID <PID> /F

# Or change PORT environment variable
set PORT=3002
npm start
```

### Debugging Tips

**Enable Verbose Logging:**

Add to `server.js`:
```javascript
app.use((req, res, next) => {
  console.log('Request:', req.method, req.path);
  console.log('Headers:', req.headers);
  console.log('Body:', JSON.stringify(req.body, null, 2));
  next();
});
```

**Check Webhook Logs:**

```bash
# View last 10 webhooks
tail -n 10 data/webhooks.jsonl

# View specific webhook
cat data/webhooks.jsonl | grep "eventId" | head -1 | jq .
```

**Monitor Trigger Accumulator:**

Call `GET /api/stats` to see:
- Pending trigger count
- Group statistics
- Recent webhooks

**Test Webhook Manually:**

```bash
curl -X POST http://192.168.1.64:3001/api/webhook \
  -H "Content-Type: application/json" \
  -d @example_payload.json
```

---

## Additional Resources

- **README.md**: Quick start guide
- **TROUBLESHOOTING.md**: Common issues and solutions
- **Caddyfile.snippet**: Reverse proxy configuration
- **example_payload.json**: Example webhook payload structure

---

## Support and Contributions

For issues, questions, or contributions:
1. Check existing documentation (`README.md`, `TROUBLESHOOTING.md`)
2. Review code comments in source files
3. Check server logs for error messages
4. Test with `example_payload.json` to verify system behavior

---

**Last Updated:** 2024-01-15
**Version:** 1.0.0
**Author:** Development Team

