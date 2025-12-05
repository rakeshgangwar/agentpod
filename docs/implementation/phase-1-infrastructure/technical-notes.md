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

### Useful Tailscale Commands
```bash
# Check connection to another device
tailscale ping <device-name>

# List all devices in tailnet
tailscale status

# Disconnect
tailscale down

# Reconnect
tailscale up
```

---

## Forgejo

### Coolify Deployment Notes

When deploying Forgejo via Coolify:

1. **Storage**: Ensure persistent volume is configured for `/data`
2. **Port**: Default is 3000 (HTTP) and 22 (SSH for git)
3. **Environment Variables**:
   ```
   USER_UID=1000
   USER_GID=1000
   FORGEJO__server__ROOT_URL=http://100.x.x.x:3000/
   ```

### API Reference

Base URL: `http://100.x.x.x:3000/api/v1`

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

### Creating API Token

1. Log into Forgejo web UI
2. Go to Settings → Applications
3. Enter token name
4. Select scopes (recommend: `repo`, `user`)
5. Generate and copy token immediately (shown only once)

---

## OpenCode Docker Image

### Dockerfile
```dockerfile
FROM node:20-slim

# Install OpenCode and git
RUN npm install -g opencode-ai && \
    apt-get update && \
    apt-get install -y git && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

ENV OPENCODE_PORT=4096
ENV OPENCODE_HOST=0.0.0.0

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 4096

ENTRYPOINT ["/entrypoint.sh"]
```

### entrypoint.sh
```bash
#!/bin/bash
set -e

# Clone project if workspace is empty
if [ ! -d "/workspace/.git" ] && [ -n "$FORGEJO_REPO_URL" ]; then
    echo "Cloning repository from Forgejo..."
    git clone "$FORGEJO_REPO_URL" /workspace
fi

# Configure git
git config --global user.email "opencode@portable-command-center.local"
git config --global user.name "OpenCode"
git config --global --add safe.directory /workspace

# Start OpenCode server
cd /workspace
exec opencode serve --port "$OPENCODE_PORT" --hostname "$OPENCODE_HOST"
```

### Build and Test Commands
```bash
# Build image
docker build -t opencode-server ./docker/opencode

# Run locally for testing
docker run -it --rm \
  -p 4096:4096 \
  -e ANTHROPIC_API_KEY="your-key" \
  -v $(pwd)/test-workspace:/workspace \
  opencode-server

# Test API
curl http://localhost:4096/app
```

### Publishing to Docker Hub
```bash
# Login
docker login

# Tag
docker tag opencode-server yourusername/opencode-server:latest

# Push
docker push yourusername/opencode-server:latest
```

### Publishing to Private Registry (Coolify)

If using Coolify's built-in registry:
```bash
# Tag for Coolify registry
docker tag opencode-server 100.x.x.x:5000/opencode-server:latest

# Push (may need to configure insecure registry)
docker push 100.x.x.x:5000/opencode-server:latest
```

---

## Coolify API

### Authentication
```bash
# Get API token from Coolify UI: Keys & Tokens → API tokens
# Use in requests:
Authorization: Bearer YOUR_COOLIFY_TOKEN
```

### Base URL
```
http://100.x.x.x:8000/api/v1
```

### Useful Endpoints
```bash
# List servers
curl -H "Authorization: Bearer $TOKEN" \
  http://100.x.x.x:8000/api/v1/servers

# List applications
curl -H "Authorization: Bearer $TOKEN" \
  http://100.x.x.x:8000/api/v1/applications

# Create Docker image application
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "project_uuid": "xxx",
    "server_uuid": "xxx",
    "environment_name": "production",
    "docker_registry_image_name": "yourusername/opencode-server",
    "docker_registry_image_tag": "latest",
    "ports_exposes": "4096",
    "name": "opencode-test"
  }' \
  http://100.x.x.x:8000/api/v1/applications/dockerimage
```

---

## Troubleshooting

### Tailscale Connection Issues
- Ensure firewall allows UDP 41641
- Check `tailscale status` for connection state
- Try `tailscale down && tailscale up` to reconnect

### Forgejo Won't Start
- Check logs: `docker logs <container-id>`
- Ensure port 3000 is not in use
- Verify volume permissions

### OpenCode Container Issues
- Check if workspace has valid git repo
- Verify environment variables are set
- Check container logs for startup errors

### Coolify API 401 Errors
- Verify token has correct permissions (need `*` for full access)
- Check token hasn't expired
- Ensure using `Bearer` prefix in Authorization header

---

## Credentials to Save

After completing Phase 1, save these securely:

| Credential | Location | Notes |
|------------|----------|-------|
| Tailscale VPS IP | - | 100.x.x.x |
| Forgejo URL | - | http://100.x.x.x:3000 |
| Forgejo Admin User | - | Created during setup |
| Forgejo API Token | - | For Management API |
| Coolify URL | - | http://100.x.x.x:8000 |
| Coolify API Token | - | For Management API |
| Docker Registry | - | Where OpenCode image is stored |
