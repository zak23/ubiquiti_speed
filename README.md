# Ubiquiti Speed Trap API

Node.js API for receiving Ubiquiti Protect webhooks. Currently operating in capture-only mode: incoming payloads are stored verbatim (raw and parsed) to `data/webhooks.jsonl` for later analysis. No validation, matching, or speed calculation is performed in this mode.

## Features

- 📝 Raw webhook capture to `data/webhooks.jsonl` (JSON Lines)
- 🧾 Stores request headers, raw body, and parsed JSON without omission
- 📡 Simple, fast 200 OK response on receipt
- 🔎 Read back logs via `GET /api/webhooks` and `GET /api/webhooks/raw`

## Installation

```bash
npm install
```

## Configuration

- **Port**: 3001 (default, configurable via `PORT` environment variable)
- **Line Distance**: 10 meters (configurable in `services/speedCalculator.js`)
- **Max Detections**: 1000 (configurable in `services/storage.js`)

## Usage

### Start the Server

```bash
npm start
```

The server binds to `0.0.0.0:3001` (accessible from your network).

**Public endpoints (via Caddy):**
- Web interface: `https://speedtrap.ohfuckputitback.in/`
- API: `https://speedtrap.ohfuckputitback.in/api/detections`
- Webhook: `https://speedtrap.ohfuckputitback.in/api/webhook`

### Webhook Endpoint (Capture-Only)

Send POST requests to `/api/webhook`. The server will append the payload as-is to `data/webhooks.jsonl`.

Notes:
- No validation or speed calculation occurs in capture-only mode.
- The raw request body is preserved alongside the parsed JSON.

Examples:
```bash
# Direct to server IP (adjust 192.168.1.64 to your machine)
curl -X POST http://192.168.1.64:3001/api/webhook \
  -H "Content-Type: application/json" \
  -d @example_payload.json

# Via public endpoint (behind Caddy)
curl -X POST https://speedtrap.ohfuckputitback.in/api/webhook \
  -H "Content-Type: application/json" \
  -d @example_payload.json
```

### API Endpoints

- `POST /api/webhook` — Capture-only logging to `data/webhooks.jsonl`
- `GET /api/webhooks` — Parsed JSON entries (most recent last line has newest `receivedAt`)
- `GET /api/webhooks/raw` — Raw JSONL lines; `?limit=100` to control count
- `GET /api/detections` — Present but not populated in capture-only mode
- `GET /` — Web UI present; speed features will populate later

### Raw Webhook Storage

Webhooks are appended to `data/webhooks.jsonl` (one JSON per line). This file may grow; it rotates at ~50MB.

View recent entries (PowerShell):
```powershell
Get-Content .\data\webhooks.jsonl -Tail 5
```

View recent entries (bash):
```bash
tail -n 5 data/webhooks.jsonl
```

## Speed Calculation

Planned for later phases. Not active in capture-only mode.

## Storage

- Raw webhooks: `data/webhooks.jsonl` (append-only JSON Lines)
- Detections: `data/detections.json` (not used in capture-only mode)

## File Structure

```
/
├── server.js           # Main Express server
├── routes/
│   ├── webhook.js      # Webhook endpoint (capture-only logging)
│   └── api.js          # API routes for detections
├── services/
│   ├── speedCalculator.js  # Speed calculation logic (later phase)
│   └── storage.js      # JSON file storage abstraction
├── public/
│   ├── index.html      # Main display page
│   ├── style.css       # Styling
│   └── app.js          # Frontend JavaScript
├── data/
│   ├── detections.json # Detection storage (later)
│   └── webhooks.jsonl  # Raw webhook log (auto-created)
└── package.json        # Dependencies
```

## Development

### Testing

Test with the provided example payload:

```bash
# Start the server
npm start

# In another terminal, send test webhook to your server IP
curl -X POST http://192.168.1.64:3001/api/webhook \
  -H "Content-Type: application/json" \
  -d @example_payload.json
```

### Error Handling

- Webhook capture attempts to persist every request; failures return 500
- JSONL log rotates around 50MB to prevent unbounded growth

## Caddy Reverse Proxy Setup

The server is configured to bind to `0.0.0.0` to allow access from a Caddy reverse proxy running on a different machine.

### Caddyfile Configuration

Add this configuration to your Caddy server's Caddyfile (see `Caddyfile.snippet` for complete example):

```caddyfile
# Global option: Disable automatic HTTPS redirects when behind Cloudflare proxy
# This prevents redirect loops while keeping cloudflare_tls for SSL certificates
{
  auto_https disable_redirects
}

# Speed Trap
speedtrap.ohfuckputitback.in {
  import cloudflare_tls

  reverse_proxy http://192.168.1.64:3001 {
    header_up Host {host}
    header_up X-Real-IP {remote_host}
    
    # Timeout settings for large webhook payloads (base64 images)
    transport http {
      dial_timeout 10s
      response_header_timeout 10s
    }
  }
  
  # Note: Caddy v2 handles large request bodies automatically
  # The Node.js server already has bodyParser limit set to 50mb
}
```

**Note:** Update `192.168.1.64` to match your Node.js server's IP address.

### Unifi Protect Webhook Configuration

Configure your Unifi Protect webhook endpoint to:
```
https://speedtrap.ohfuckputitback.in/api/webhook
```

### Testing the Setup

1. Ensure the Node.js server is running on `192.168.1.64:3001`
2. Verify Caddy can reach the server from the Caddy machine:
   ```bash
   curl http://192.168.1.64:3001/api/detections
   ```
3. Test the public endpoint:
   ```bash
   curl https://speedtrap.ohfuckputitback.in/api/detections
   ```
4. Test webhook endpoint (replace with your actual payload):
   ```bash
   curl -X POST https://speedtrap.ohfuckputitback.in/api/webhook \
     -H "Content-Type: application/json" \
     -d @example_payload.json
   ```

## Notes

- Port 3000 is reserved for MCP tools (use 3001 or set `PORT`)
- Use IP addresses instead of localhost when configuring or testing
- Capture-only mode: No validation or processing, payloads stored verbatim
- Storage layer remains ready for later processing and MongoDB migration

## License

MIT

