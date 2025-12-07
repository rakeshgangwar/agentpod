# OpenCode Container Images

This directory contains Docker images for OpenCode development environments, built and pushed automatically via Forgejo Actions.

## Container Images

| Image | Description | Size |
|-------|-------------|------|
| `opencode-cli` | CLI-based development environment with Code Server | ~1.5 GB |
| `opencode-desktop` | Desktop environment with VNC access and Code Server | ~1 GB |

### Registry

Images are hosted on Forgejo Container Registry:
```
forgejo.superchotu.com/rakeshgangwar/opencode-cli:latest
forgejo.superchotu.com/rakeshgangwar/opencode-desktop:latest
```

## Container Tiers

| Tier | CPU | RAM | Storage | Image | Ports |
|------|-----|-----|---------|-------|-------|
| Lite (default) | 1 | 2GB | 20GB | opencode-cli | 4096, 8080 |
| Standard | 2 | 4GB | 30GB | opencode-cli | 4096, 8080 |
| Pro | 4 | 8GB | 50GB | opencode-cli | 4096, 8080 |
| Desktop | 8 | 16GB | 75GB | opencode-desktop | 4096, 8080, 6080 |

## What's Included

### opencode-cli

- **OS**: Ubuntu 24.04 LTS
- **Node.js**: 22 LTS + pnpm
- **Python**: 3.12
- **Go**: 1.22.4
- **Rust**: Latest stable (via rustup)
- **CLI Tools**: ripgrep, fd, bat, fzf, yq, gh (GitHub CLI), httpie
- **OpenCode**: Pre-installed globally
- **Code Server**: VS Code in browser (port 8080)
- **Ports**:
  - 4096: OpenCode API
  - 8080: Code Server (VS Code)

### opencode-desktop

- **Base**: Same as CLI (without Go/Rust to reduce size)
- **Desktop**: Openbox window manager + tint2 panel
- **VNC**: x11vnc + noVNC (web-based access)
- **GUI Apps**: xterm, pcmanfm (file manager), gedit (text editor)
- **Code Server**: VS Code in browser (port 8080)
- **Ports**: 
  - 4096: OpenCode API
  - 8080: Code Server (VS Code)
  - 6080: noVNC (web desktop)
  - 5901: VNC direct access

## Code Server

Both container images include [code-server](https://github.com/coder/code-server), providing VS Code in your browser.

### Access

- **URL Pattern**: `https://code-{project-slug}.{wildcard-domain}`
- **Port**: 8080

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CODE_SERVER_PORT` | `8080` | Port for code-server |
| `CODE_SERVER_AUTH` | `none` | Authentication: `none` or `password` |
| `CODE_SERVER_PASSWORD` | - | Password when `CODE_SERVER_AUTH=password` |

### Authentication (Future)

Currently, code-server runs with `--auth none` for development convenience. To enable password authentication:

```bash
# Set environment variables when starting container
CODE_SERVER_AUTH=password
CODE_SERVER_PASSWORD=your-secure-password
```

### Extensions

Extensions can be installed directly in code-server. They are stored in `~/.local/share/code-server/extensions/`. Note that extensions are ephemeral - they will be lost when the container is recreated. Future versions will support persistent extension storage.

---

## CI/CD Pipeline

### Forgejo Actions Workflow

Located at: `.forgejo/workflows/build-containers.yml`

**Triggers:**
- Push to `main` branch (changes in `docker/` directory)
- Tag push (`v*`)
- Manual dispatch

**Jobs:**
- `build-cli`: Builds and pushes opencode-cli
- `build-desktop`: Builds and pushes opencode-desktop
- `summary`: Reports build status

### Versioning

Version is read from `docker/VERSION` file. Current: `0.0.1`

To release a new version:
```bash
echo "0.0.2" > docker/VERSION
git add docker/VERSION
git commit -m "chore: bump container version to 0.0.2"
git push forgejo main
```

## Local Development

### Build Locally

```bash
cd docker
./scripts/build.sh cli      # Build CLI only
./scripts/build.sh desktop  # Build Desktop only
./scripts/build.sh all      # Build both
```

Note: Building on ARM64 (Mac M1/M2) requires `--platform linux/amd64` which is slow. Prefer using CI.

### Push Manually

```bash
./scripts/login.sh          # Login to registry
./scripts/push.sh all       # Push images
```

---

# Setup Guide

## Forgejo Runner Setup

The Forgejo Runner executes CI jobs on the Coolify server.

### Installation

```bash
ssh root@162.55.48.175

# Create runner directory
mkdir -p /opt/forgejo-runner && cd /opt/forgejo-runner

# Download runner
curl -L -o forgejo-runner https://code.forgejo.org/forgejo/runner/releases/download/v3.5.1/forgejo-runner-3.5.1-linux-amd64
chmod +x forgejo-runner
```

### Registration

1. Get a registration token from: https://forgejo.superchotu.com/admin/actions/runners
2. Register the runner:

```bash
./forgejo-runner register \
  --instance https://forgejo.superchotu.com \
  --token <REGISTRATION_TOKEN> \
  --name coolify-runner \
  --labels ubuntu-latest:host \
  --no-interactive
```

**Important:** Use `ubuntu-latest:host` (not `docker://...`) to run jobs directly on the host where Docker is available.

### Running as a Service

```bash
cat > /etc/systemd/system/forgejo-runner.service << 'EOF'
[Unit]
Description=Forgejo Actions Runner
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/forgejo-runner
ExecStart=/opt/forgejo-runner/forgejo-runner daemon
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable forgejo-runner
systemctl start forgejo-runner
systemctl status forgejo-runner
```

## Repository Secrets

Configure in Forgejo: Repository Settings > Secrets and Variables > Actions

| Secret | Value |
|--------|-------|
| `REGISTRY_USERNAME` | `rakeshgangwar` |
| `REGISTRY_TOKEN` | Forgejo API token with `write:package` scope |

### Creating API Token with Package Access

1. Go to: https://forgejo.superchotu.com/user/settings/applications
2. Create new token with scopes: `write:package`, `read:package`
3. Add as `REGISTRY_TOKEN` secret

---

# Issues Encountered & Resolutions

## 1. Forgejo ROOT_URL Misconfiguration

**Problem:** `docker login forgejo.superchotu.com` failed - Docker tried to connect to port 3000.

**Cause:** Forgejo's `app.ini` had:
```ini
ROOT_URL = https://forgejo.superchotu.com:3000
```

**Resolution:**
```bash
docker exec forgejo-ukokcss4wwsoscsc8ggcss0s sed -i \
  's|ROOT_URL = https://forgejo.superchotu.com:3000|ROOT_URL = https://forgejo.superchotu.com|' \
  /data/gitea/conf/app.ini
docker restart forgejo-ukokcss4wwsoscsc8ggcss0s
```

## 2. Architecture Mismatch (ARM64 vs AMD64)

**Problem:** Building on Mac (ARM64) failed with:
```
package architecture (amd64) does not match system (arm64)
```

**Cause:** Dockerfile downloads amd64 `.deb` packages, but local Docker builds for host architecture.

**Resolution:** Use CI (Forgejo Actions) to build on amd64 server, or use `--platform linux/amd64` locally (slow due to QEMU emulation).

## 3. Workflow Not in Correct Location

**Problem:** Workflow created in `docker/.forgejo/workflows/` wasn't detected.

**Cause:** Forgejo expects workflows at repository root: `.forgejo/workflows/`

**Resolution:** Moved workflow to `/.forgejo/workflows/build-containers.yml`

## 4. Runner Label Mismatch

**Problem:** Jobs stuck in "Waiting" state.

**Cause:** Runner registered with `docker` label, but workflow used `runs-on: ubuntu-latest`.

**Resolution:** Re-registered runner with `--labels ubuntu-latest:host`

## 5. Node.js Not Found in Runner

**Problem:** `actions/checkout@v4` failed with:
```
Cannot find: node in PATH
```

**Cause:** GitHub Actions like `actions/checkout` require Node.js, which wasn't installed on the host.

**Resolution:** Rewrote workflow to use plain shell commands:
```yaml
- name: Checkout repository
  run: |
    git clone --depth 1 --branch ${{ github.ref_name }} https://forgejo.superchotu.com/${{ github.repository }}.git .
```

## 6. Registry Push Unauthorized

**Problem:** `docker push` failed with:
```
unauthorized: reqPackageAccess
```

**Cause:** API token didn't have `write:package` scope.

**Resolution:** Created new token with `read:package` and `write:package` scopes, updated `REGISTRY_TOKEN` secret.

## 7. pip Upgrade Fails on Ubuntu 24.04

**Problem:** Build failed with:
```
ERROR: Cannot uninstall pip 24.0, RECORD file not found. Hint: The package was installed by debian.
```

**Cause:** Ubuntu 24.04 manages pip via apt; can't upgrade system pip with pip itself.

**Resolution:** Removed `RUN python -m pip install --upgrade pip --break-system-packages` from Dockerfile. System pip 24.0 is sufficient.

## 8. Desktop Image Too Large (4GB+)

**Problem:** Push timed out after 7+ minutes.

**Cause:** Image included Rust (~1.5GB), Go (~500MB), Firefox (~300MB), extra fonts.

**Resolution:** Optimized Dockerfile:
- Removed Rust, Go, Firefox (users can install on-demand)
- Used `--no-install-recommends`
- Combined RUN statements
- Cleaned up in same layer
- Final size: ~1GB

---

# Pulling Images

On Coolify server (already authenticated):
```bash
docker pull forgejo.superchotu.com/rakeshgangwar/opencode-cli:latest
docker pull forgejo.superchotu.com/rakeshgangwar/opencode-desktop:latest
```

For new servers, authenticate first:
```bash
docker login forgejo.superchotu.com
# Username: rakeshgangwar
# Password: <API token with read:package scope>
```
