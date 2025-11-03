# Fix Redirect Loop Error (ERR_TOO_MANY_REDIRECTS)

## Problem
`ERR_TOO_MANY_REDIRECTS` occurs when Caddy tries to redirect HTTP → HTTPS, but Cloudflare (with proxy enabled) already handles HTTPS termination, creating an infinite redirect loop.

## Root Cause
When Cloudflare proxy is enabled (orange cloud):
- Cloudflare handles HTTPS termination
- Cloudflare sends HTTP to your origin (Caddy)
- If Caddy tries to redirect HTTP → HTTPS, it creates a loop

## Solution

### Update Caddy Configuration

On the Caddy machine, edit the Caddyfile:

```bash
sudo nano /etc/caddy/Caddyfile
# or
sudo nano /etc/caddy/sites-enabled/speedtrap.txt
```

### Keep `import cloudflare_tls` but disable automatic redirects:

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
}
```

### Key Changes:
1. **Keep `import cloudflare_tls`** - This gets SSL certificates from Cloudflare
2. **Add global `auto_https disable_redirects`** - This prevents automatic HTTP → HTTPS redirects
3. **Caddy handles both HTTP and HTTPS** - Without forcing redirects

### Alternative: If You Need HTTPS on Caddy

If you want Caddy to also handle HTTPS (for direct access), use this instead:

```caddyfile
speedtrap.ohfuckputitback.in {
  # Handle HTTPS, but don't redirect HTTP → HTTPS
  # Cloudflare will handle the redirect for proxied requests
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

This lets Caddy accept both HTTP and HTTPS without forcing redirects.

### Validate and Restart

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl restart caddy
sudo systemctl status caddy
```

### Test

```bash
# Test from browser - should load without redirect loop
curl -I https://speedtrap.ohfuckputitback.in/api/detections

# Should return 200 OK, not 301/302 redirect
```

## Cloudflare SSL/TLS Settings

In Cloudflare dashboard, ensure:
- **SSL/TLS encryption mode:** Set to "Full" or "Full (strict)"
- **Always Use HTTPS:** Can be ON (Cloudflare handles the redirect)
- **Automatic HTTPS Rewrites:** ON

## Why This Works

- Cloudflare receives HTTPS requests and terminates SSL
- Cloudflare forwards HTTP to Caddy
- Caddy simply proxies to Node.js (no redirects)
- No redirect loop!

## Verification Checklist

- [ ] Removed `import cloudflare_tls` from Caddyfile
- [ ] Caddyfile uses HTTP-only reverse proxy
- [ ] Validated configuration: `sudo caddy validate`
- [ ] Restarted Caddy: `sudo systemctl restart caddy`
- [ ] Tested endpoint: `curl https://speedtrap.ohfuckputitback.in/api/detections`
- [ ] No more redirect loop errors

