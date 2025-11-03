# Troubleshooting Guide - Speed Trap API

## Current Setup

- **Domain:** `speedtrap.ohfuckputitback.in`
- **Cloudflare DNS:** `144.6.111.54` (Proxied - Orange Cloud)
- **Caddy Server:** Should be running at `144.6.111.54`
- **Node.js Server:** Running at `192.168.1.64:3001`
- **Caddy Reverse Proxy:** `http://192.168.1.64:3001`

## Error 521: Web Server is Down

**Symptom:** Cloudflare shows Error 521 - "Web server is not returning a connection"

**Root Cause:** Caddy reverse proxy is not running or cannot reach the Node.js server.

### Quick Diagnosis

1. **Check Node.js Server Status:**
   ```powershell
   # On the Node.js server machine (192.168.1.64)
   Invoke-WebRequest -Uri http://127.0.0.1:3001 -UseBasicParsing
   # Should return: StatusCode: 200
   ```

2. **Check if Server is Listening:**
   ```powershell
   netstat -ano | findstr ":3001"
   # Should show: TCP    0.0.0.0:3001    LISTENING
   ```

3. **Test from Network:**
   ```powershell
   # From Caddy machine or any network device
   curl http://192.168.1.64:3001/api/detections
   # Should return JSON array
   ```

### Fix Steps

#### If Node.js Server is Down:

1. **Start the Server:**
   ```powershell
   cd E:\Projects\ubiquiti_speed
   npm start
   ```

2. **Or run with PM2/forever:**
   ```powershell
   pm2 start server.js --name speedtrap
   ```

#### If Node.js Server is Running but Caddy Shows 521:

**On the Caddy machine:**

1. **Check Caddy Status:**
   ```bash
   # Linux/Mac
   systemctl status caddy
   # Or
   caddy version
   ```

2. **Test Caddy Can Reach Node.js Server:**
   ```bash
   curl http://192.168.1.64:3001/api/detections
   # If this fails, check network connectivity
   ```

3. **Check Caddy Configuration:**
   ```bash
   caddy validate --config /path/to/Caddyfile
   ```

4. **Start/Restart Caddy:**
   ```bash
   # Systemd service
   sudo systemctl start caddy
   sudo systemctl restart caddy
   
   # Or run directly
   caddy run --config /path/to/Caddyfile
   ```

5. **Check Caddy Logs:**
   ```bash
   # Systemd logs
   sudo journalctl -u caddy -f
   
   # Or if running directly
   caddy logs
   ```

### Common Issues

#### 1. Firewall Blocking Port 3001

**On Node.js Server (Windows):**
```powershell
# Allow inbound connections on port 3001
New-NetFirewallRule -DisplayName "Speed Trap API" -Direction Inbound -LocalPort 3001 -Protocol TCP -Action Allow
```

#### 2. Caddy Can't Resolve or Reach 192.168.1.64

- Verify the IP address is correct: `ping 192.168.1.64`
- Check if Node.js server firewall allows connections from Caddy machine
- Verify both machines are on the same network or have routing configured

#### 3. Caddy Configuration Error

**Common Error: `unrecognized directive: request_body_max_size`**

This directive doesn't exist in Caddy v2. Remove it from your Caddyfile. Caddy v2 handles large request bodies automatically.

**Fix:**
```caddyfile
# Remove this line:
request_body_max_size 50MB

# Caddy v2 automatically handles large bodies, and your Node.js server
# already has bodyParser configured with 50mb limit
```

#### 3b. Redirect Loop (ERR_TOO_MANY_REDIRECTS)

**Symptom:** Browser shows "ERR_TOO_MANY_REDIRECTS" error

**Root Cause:** Caddy's automatic HTTP → HTTPS redirects conflict with Cloudflare's proxy (orange cloud), which already handles HTTPS termination, creating an infinite loop.

**Fix:**
```caddyfile
# Global option: Disable automatic HTTPS redirects
{
  auto_https disable_redirects
}

# Keep cloudflare_tls for SSL certificates, but don't redirect
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

**Check Configuration:**
- Domain: `speedtrap.ohfuckputitback.in`
- Backend: `http://192.168.1.64:3001`
- **Keep `import cloudflare_tls`** for SSL certificates from Cloudflare
- **Add global `auto_https disable_redirects`** to prevent redirect loops
- Remove unnecessary `header_up` directives (X-Forwarded-For, X-Forwarded-Proto, X-Forwarded-Host are set automatically)

#### 4. Node.js Server Crashed

Check server logs for errors:
```powershell
# If running with npm start, check console output
# Or check PM2 logs:
pm2 logs speedtrap
```

### Verification Checklist

- [ ] Node.js server responds on `http://127.0.0.1:3001`
- [ ] Node.js server responds on `http://192.168.1.64:3001` from network
- [ ] Port 3001 is not blocked by firewall
- [ ] Caddy service is running
- [ ] Caddy can reach `http://192.168.1.64:3001`
- [ ] Caddy configuration is valid
- [ ] DNS for `speedtrap.ohfuckputitback.in` points to Caddy machine
- [ ] Cloudflare proxy is enabled (orange cloud)

### Test Endpoints

**Local (Node.js Server):**
```bash
curl http://127.0.0.1:3001/api/detections
curl http://127.0.0.1:3001/
```

**Network (From Caddy Machine):**
```bash
curl http://192.168.1.64:3001/api/detections
curl http://192.168.1.64:3001/
```

**Public (Via Caddy):**
```bash
curl https://speedtrap.ohfuckputitback.in/api/detections
curl https://speedtrap.ohfuckputitback.in/
```

All three should return the same data if everything is working correctly.

