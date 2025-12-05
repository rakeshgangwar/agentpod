# Phase 1: Tasks

## 1. Tailscale Setup

### 1.1 Install Tailscale on VPS
- [ ] SSH into Hetzner VPS
- [ ] Install Tailscale: `curl -fsSL https://tailscale.com/install.sh | sh`
- [ ] Authenticate: `tailscale up`
- [ ] Note the Tailscale IP (100.x.x.x)
- [ ] Verify connectivity from local machine

### 1.2 Configure Tailscale
- [ ] Enable MagicDNS (optional but recommended)
- [ ] Set up ACLs if needed for security
- [ ] Test connection from mobile device (if Tailscale app installed)

**Verification:**
```bash
# From local machine (with Tailscale)
ping 100.x.x.x
ssh user@100.x.x.x
```

---

## 2. Forgejo Deployment

### 2.1 Deploy via Coolify
- [ ] Log into Coolify dashboard
- [ ] Go to Services → One-Click Services
- [ ] Select "Forgejo" (or Gitea if Forgejo not available)
- [ ] Configure:
  - Port: 3000
  - Domain: (optional, can use IP)
  - Storage: Persistent volume for repos
- [ ] Deploy and wait for startup

### 2.2 Initial Forgejo Configuration
- [ ] Access Forgejo at `http://100.x.x.x:3000`
- [ ] Complete initial setup wizard
- [ ] Create admin account
- [ ] Generate API token: Settings → Applications → Generate Token
- [ ] Store token securely (will be used by Management API)

### 2.3 Test Forgejo API
- [ ] Test API connectivity:
```bash
curl -H "Authorization: token YOUR_TOKEN" \
  http://100.x.x.x:3000/api/v1/user
```
- [ ] Create test repository via API:
```bash
curl -X POST \
  -H "Authorization: token YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "test-repo", "private": false}' \
  http://100.x.x.x:3000/api/v1/user/repos
```

**Verification:**
- Forgejo UI accessible
- Can create/delete repos via API
- Can clone repos via git

---

## 3. OpenCode Docker Image

### 3.1 Create Dockerfile
- [x] Create `docker/opencode/Dockerfile`
- [x] Create `docker/opencode/entrypoint.sh`
- [ ] Test build locally: `docker build -t opencode-server .`

### 3.2 Test Image Locally
- [ ] Run container:
```bash
docker run -d \
  -p 4096:4096 \
  -e ANTHROPIC_API_KEY=test \
  -v $(pwd)/test-project:/workspace \
  opencode-server
```
- [ ] Verify OpenCode responds: `curl http://localhost:4096/app`
- [ ] Test with actual API key and prompt

### 3.3 Publish to Registry
- [ ] Choose registry (Docker Hub or Coolify's built-in)
- [ ] Tag image: `docker tag opencode-server your-registry/opencode-server:latest`
- [ ] Push image: `docker push your-registry/opencode-server:latest`
- [ ] Verify image is accessible from VPS

**Verification:**
- Image builds successfully
- Container starts and OpenCode server runs
- API endpoints respond correctly

---

## 4. Test Deployment via Coolify

### 4.1 Create Test Project in Coolify
- [ ] Create new Project: "OpenCode Containers"
- [ ] Create new Environment: "test"

### 4.2 Deploy Test Container
- [ ] Create new Application → Docker Image
- [ ] Configure:
  - Image: `your-registry/opencode-server:latest`
  - Port: 4096
  - Environment variables:
    - `FORGEJO_REPO_URL=http://forgejo:3000/admin/test-repo.git`
    - `OPENCODE_PORT=4096`
    - `OPENCODE_HOST=0.0.0.0`
    - `ANTHROPIC_API_KEY=your-key` (or other provider)
- [ ] Deploy

### 4.3 Verify End-to-End
- [ ] Container starts successfully
- [ ] OpenCode API responds: `curl http://100.x.x.x:4096/app`
- [ ] Create a session and send a test prompt
- [ ] Verify changes are made to the workspace

**Verification:**
```bash
# Check app info
curl http://100.x.x.x:4096/app

# Create session
curl -X POST http://100.x.x.x:4096/session

# Send prompt (replace SESSION_ID)
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"parts": [{"type": "text", "text": "Create a hello.txt file with Hello World"}]}' \
  http://100.x.x.x:4096/session/SESSION_ID/message
```

---

## 5. Documentation & Cleanup

- [ ] Document all IPs, ports, and URLs
- [ ] Store credentials securely
- [ ] Delete test resources (test-repo, test container)
- [ ] Update phase status in implementation README

---

## Notes

- Keep Coolify API token handy for Phase 2
- Keep Forgejo API token handy for Phase 2
- Note any issues encountered for technical-notes.md
