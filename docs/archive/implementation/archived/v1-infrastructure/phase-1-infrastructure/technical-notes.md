# Phase 1: Technical Notes

## Tailscale

### Installation Commands
```bash
# Install Tailscale
curl -fsSL https://tailscale.com/install.sh | sh

# Start and authenticate
sudo tailscale up

# Check status
tailscale status

# Get IP
tailscale ip -4
```

### Actual Configuration
- **VPS Tailscale IP:** `100.85.212.42`
- **Device Name:** `coolify-ubuntu-16gb-nbg1-1`

### Useful Tailscale Commands
```bash
# Check connection to another device
tailscale ping coolify-ubuntu-16gb-nbg1-1

# List all devices in tailnet
tailscale status

# Disconnect
tailscale down

# Reconnect
tailscale up
```

---

## Forgejo

### Actual Deployment

- **URL:** https://forgejo.superchotu.com
- **User:** rakeshgangwar
- **Deployed via:** Coolify One-Click Service

### Coolify Deployment Notes

When deploying Forgejo via Coolify:

1. **Storage**: Ensure persistent volume is configured for `/data`
2. **Port**: Default is 3000 (HTTP) and 22 (SSH for git)
3. **Domain**: Configure via Coolify's domain settings (SSL auto-provisioned)

### API Reference

Base URL: `https://forgejo.superchotu.com/api/v1`

**Authentication**: Bearer token in header
```
Authorization: token YOUR_TOKEN
```

**Common Endpoints:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /user | Get authenticated user |
| GET | /repos/{owner}/{repo} | Get repository |
| POST | /user/repos | Create repository |
| DELETE | /repos/{owner}/{repo} | Delete repository |
| GET | /repos/{owner}/{repo}/contents/{path} | Get file contents |

**Example API Calls:**
```bash
# Get user info
curl -H "Authorization: token YOUR_TOKEN" \
  https://forgejo.superchotu.com/api/v1/user

# Create repository
curl -X POST \
  -H "Authorization: token YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "my-repo", "private": false}' \
  https://forgejo.superchotu.com/api/v1/user/repos
```

### Creating API Token

1. Log into Forgejo web UI
2. Go to Settings → Applications
3. Enter token name
4. Select scopes (recommend: `repo`, `user`)
5. Generate and copy token immediately (shown only once)

---

## OpenCode Docker Image

### Actual Deployment

- **URL:** https://opencode.superchotu.com
- **Deployed via:** Coolify Dockerfile build from Forgejo repo
- **Source:** `docker/opencode/` directory in CodeOpen repo

### Deployment Approach

Instead of publishing to an external registry, we used Coolify's Dockerfile build feature:

1. Push code to Forgejo repository
2. Configure Coolify to build from Forgejo repo
3. Set Base Directory to `docker/opencode`
4. Coolify builds and deploys automatically

### Dockerfile Location
`docker/opencode/Dockerfile` - See actual file in repository

### Build and Test Commands (Local)
```bash
# Build image locally
cd docker/opencode
docker build -t opencode-server .

# Run locally for testing
docker run -d \
  -p 4096:4096 \
  -e ANTHROPIC_API_KEY="your-key" \
  -v $(pwd)/test-workspace:/workspace \
  opencode-server

# Test API
curl http://localhost:4096/app
curl http://localhost:4096/session
curl -X POST http://localhost:4096/session
```

### Coolify Configuration

When deploying via Coolify:

1. **Source:** Public Repository
2. **Repository URL:** `https://forgejo.superchotu.com/rakeshgangwar/CodeOpen.git`
3. **Branch:** `main`
4. **Build Pack:** Dockerfile
5. **Base Directory:** `docker/opencode`
6. **Dockerfile Location:** `Dockerfile`
7. **Port Exposes:** `4096`

### Environment Variables
```
ANTHROPIC_API_KEY=your-api-key
OPENCODE_PORT=4096
OPENCODE_HOST=0.0.0.0
GIT_USER_EMAIL=opencode@superchotu.com
GIT_USER_NAME=OpenCode
```

---

## Coolify

### Actual Configuration

- **Dashboard URL:** https://admin.superchotu.com
- **VPS Public IP:** 162.55.48.175

### API Authentication
```bash
# Get API token from Coolify UI: Keys & Tokens → API tokens
# Use in requests:
Authorization: Bearer YOUR_COOLIFY_TOKEN
```

### API Base URL
```
https://admin.superchotu.com/api/v1
```

### Useful API Endpoints
```bash
# List servers
curl -H "Authorization: Bearer $TOKEN" \
  https://admin.superchotu.com/api/v1/servers

# List applications
curl -H "Authorization: Bearer $TOKEN" \
  https://admin.superchotu.com/api/v1/applications
```

---

## OpenCode API

### Base URL
```
https://opencode.superchotu.com
```

### API Endpoints
```bash
# Get web UI
curl https://opencode.superchotu.com/app

# List sessions
curl https://opencode.superchotu.com/session

# Create session
curl -X POST https://opencode.superchotu.com/session

# Send message to session
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"parts": [{"type": "text", "text": "Your prompt here"}]}' \
  https://opencode.superchotu.com/session/SESSION_ID/message
```

---

## Troubleshooting

### Tailscale Connection Issues
- Ensure firewall allows UDP 41641
- Check `tailscale status` for connection state
- Try `tailscale down && tailscale up` to reconnect

### Forgejo Won't Start
- Check logs in Coolify dashboard
- Verify domain DNS is configured
- Check SSL certificate provisioning

### OpenCode Container Issues
- **"no available server"**: Check port mapping in Coolify (should be 4096)
- **SSL errors**: Wait for Let's Encrypt certificate provisioning
- Check container logs in Coolify dashboard for startup errors
- Verify ANTHROPIC_API_KEY environment variable is set

### Coolify API 401 Errors
- Verify token has correct permissions (need `*` for full access)
- Check token hasn't expired
- Ensure using `Bearer` prefix in Authorization header

---

## Credentials Reference

| Credential | Value | Notes |
|------------|-------|-------|
| Tailscale VPS IP | 100.85.212.42 | Internal Tailnet access |
| VPS Public IP | 162.55.48.175 | External access |
| Forgejo URL | https://forgejo.superchotu.com | Git hosting |
| Forgejo User | rakeshgangwar | Admin account |
| Forgejo API Token | Stored in `.env` | For API access |
| Coolify URL | https://admin.superchotu.com | Dashboard |
| OpenCode URL | https://opencode.superchotu.com | AI coding agent |
| OpenCode Port | 4096 | Internal container port |
