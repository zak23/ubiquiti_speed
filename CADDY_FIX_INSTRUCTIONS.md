# Caddy Fix Instructions - Error 521 Resolution

## Problem
Caddy is failing to start with error: `unrecognized directive: request_body_max_size`

## Solution

### Step 1: Update Caddy Configuration

On the Caddy machine (`144.6.111.54`), edit the Caddyfile:

```bash
sudo nano /etc/caddy/Caddyfile
# or if using sites-enabled:
sudo nano /etc/caddy/sites-enabled/speedtrap.txt
```

### Step 2: Find and Remove Invalid Directive

Locate the line containing `request_body_max_size 50MB` and **remove it entirely**.

The directive doesn't exist in Caddy v2 and is causing the service to fail.

### Step 3: Clean Up Unnecessary Headers (Optional)

Caddy v2 warns about these unnecessary headers, but they won't prevent startup. You can optionally remove:
- `header_up X-Forwarded-For {remote_host}` - Set automatically
- `header_up X-Forwarded-Proto {scheme}` - Set automatically  
- `header_up X-Forwarded-Host {host}` - Set automatically

### Step 4: Corrected Configuration

Your Caddyfile block should look like this:

```caddyfile
# Speed Trap
speedtrap.ohfuckputitback.in {
  # Use HTTP only - Cloudflare handles HTTPS termination when proxy is enabled
  # This prevents redirect loops with Cloudflare's proxy (orange cloud)
  
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

### Step 5: Validate Configuration

Test the Caddyfile for syntax errors:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
```

### Step 6: Restart Caddy Service

After fixing the configuration:

```bash
sudo systemctl restart caddy
sudo systemctl status caddy
```

### Step 7: Verify

Check logs to ensure it started successfully:

```bash
sudo journalctl -u caddy -f
```

You should see:
```
{"level":"info","msg":"serving initial configuration"}
```

### Step 8: Test Public Endpoint

Once Caddy is running:

```bash
curl https://speedtrap.ohfuckputitback.in/api/detections
```

Should return JSON data from the Node.js server.

## Why This Happened

- `request_body_max_size` is not a valid directive in Caddy v2
- Caddy v2 handles request body sizes automatically (default is ~100MB)
- Your Node.js server already has `bodyParser` configured with `50mb` limit
- Caddy will pass through requests regardless of size to the backend

## Verification Checklist

- [ ] Removed `request_body_max_size 50MB` from Caddyfile
- [ ] Validated Caddyfile syntax: `sudo caddy validate`
- [ ] Restarted Caddy service: `sudo systemctl restart caddy`
- [ ] Verified Caddy is running: `sudo systemctl status caddy`
- [ ] Tested public endpoint: `curl https://speedtrap.ohfuckputitback.in/api/detections`
- [ ] No more Error 521 from Cloudflare

