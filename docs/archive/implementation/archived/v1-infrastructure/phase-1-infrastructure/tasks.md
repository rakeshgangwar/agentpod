# Phase 1: Tasks

## 1. Tailscale Setup

### 1.1 Install Tailscale on VPS
- [x] SSH into Hetzner VPS
- [x] Install Tailscale: `curl -fsSL https://tailscale.com/install.sh | sh`
- [x] Authenticate: `tailscale up`
- [x] Note the Tailscale IP: **100.85.212.42** (coolify-ubuntu-16gb-nbg1-1)
- [x] Verify connectivity from local machine

### 1.2 Configure Tailscale
- [x] Enable MagicDNS (optional but recommended)
- [ ] Set up ACLs if needed for security
- [ ] Test connection from mobile device (if Tailscale app installed)

**Verification:**
```bash
# From local machine (with Tailscale)
ping 100.85.212.42
ssh user@100.85.212.42
```

---

## 2. Forgejo Deployment

### 2.1 Deploy via Coolify
- [x] Log into Coolify dashboard
- [x] Go to Services → One-Click Services
- [x] Select "Forgejo" (or Gitea if Forgejo not available)
- [x] Configure:
  - Port: 3000
  - Domain: (optional, can use IP)
  - Storage: Persistent volume for repos
- [x] Deploy and wait for startup

### 2.2 Initial Forgejo Configuration
- [x] Access Forgejo at `https://forgejo.superchotu.com`
- [x] Complete initial setup wizard
- [x] Create admin account
- [x] Generate API token: Settings → Applications → Generate Token
- [x] Store token securely in `docker/opencode/.env`

### 2.3 Test Forgejo API
- [x] Test API connectivity:
```bash
curl -H "Authorization: token YOUR_TOKEN" \
  https://forgejo.superchotu.com/api/v1/user
```
- [x] Create test repository via API:
```bash
curl -X POST \
  -H "Authorization: token YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "test-repo", "private": false}' \
  https://forgejo.superchotu.com/api/v1/user/repos
```

**Verification:**
- [x] Forgejo UI accessible
- [x] Can create/delete repos via API
- [ ] Can clone repos via git

---

## 3. OpenCode Docker Image

### 3.1 Create Dockerfile
- [x] Create `docker/opencode/Dockerfile`
- [x] Create `docker/opencode/entrypoint.sh`
- [x] Test build locally: `docker build -t opencode-server .`

### 3.2 Test Image Locally
- [x] Run container:
```bash
docker run -d \
  -p 4096:4096 \
  -v $(pwd)/test-workspace:/workspace \
  opencode-server
```
- [x] Verify OpenCode responds: `curl http://localhost:4096/app`
- [x] Verify session API: `curl http://localhost:4096/session`
- [x] Create session: `curl -X POST http://localhost:4096/session`
- [x] Test with actual API key and prompt (created hello.txt successfully)

### 3.3 Publish to Registry
- [x] Used Coolify's Dockerfile build from Forgejo repo (no external registry needed)
- [x] Repository pushed to Forgejo: `https://forgejo.superchotu.com/rakeshgangwar/CodeOpen`
- [x] Coolify builds image directly from source

**Verification:**
- [x] Image builds successfully
- [x] Container starts and OpenCode server runs
- [x] API endpoints respond correctly

---

## 4. Test Deployment via Coolify

### 4.1 Create Test Project in Coolify
- [x] Create new Project: "OpenCode Containers"
- [x] Create new Environment: "production"

### 4.2 Deploy Test Container
- [x] Create new Application → Dockerfile (from Forgejo repo)
- [x] Configure:
  - Repository: `https://forgejo.superchotu.com/rakeshgangwar/CodeOpen.git`
  - Base Directory: `docker/opencode`
  - Port: 4096
  - Environment variables: ANTHROPIC_API_KEY, OPENCODE_PORT, OPENCODE_HOST
- [x] Deploy to `https://opencode.superchotu.com`

### 4.3 Verify End-to-End
- [x] Container starts successfully
- [x] OpenCode API responds: `curl https://opencode.superchotu.com/app`
- [x] Create a session and send a test prompt
- [x] Verify file created in workspace (test.txt with "Hello from Coolify!")

**Verification:**
```bash
# Check app info
curl https://opencode.superchotu.com/app

# Create session
curl -X POST https://opencode.superchotu.com/session

# Send prompt (replace SESSION_ID)
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"parts": [{"type": "text", "text": "Create a hello.txt file with Hello World"}]}' \
  https://opencode.superchotu.com/session/SESSION_ID/message
```

---

## 5. Documentation & Cleanup

- [x] Document all IPs, ports, and URLs (see below)
- [x] Store credentials securely (in local .env)
- [ ] Delete test resources (test-repo) - optional, can keep for testing
- [ ] Update phase status in implementation README

### Infrastructure URLs
| Service | URL |
|---------|-----|
| Coolify | https://admin.superchotu.com |
| Forgejo | https://forgejo.superchotu.com |
| OpenCode | https://opencode.superchotu.com |
| VPS Tailscale IP | 100.85.212.42 |

---

## Notes

- Keep Coolify API token handy for Phase 2
- Keep Forgejo API token handy for Phase 2
- Note any issues encountered for technical-notes.md
