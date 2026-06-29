# AgentPod — Production Deployment Guide

This guide covers a full production deployment of all three AgentPod tiers (node-agent images, hub, console) on a Linux host running nginx + certbot. It supersedes the P3-only runbook at `deploy/README-deploy.md`.

> **Safety constraints (read first)**
> - All steps are **additive only**. On the reference box (`hub.agentpod.dev` / `app.agentpod.dev`) the existing `id.agentpod.dev` nginx vhost (Matrix/Synapse) must **never** be touched.
> - **`nginx -t` before every `systemctl reload nginx`**. A bad reload would take any co-hosted services offline.
> - Run steps one at a time; verify existing services stay up after each nginx reload.
> - Use `<HUB_HOST>` / `<your-domain>` placeholders below — substitute your actual hostname.

---

## Prerequisites

On the target box:

| Requirement | Notes |
|-------------|-------|
| **Docker** | Required for the Docker provisioner and image builds |
| **Postgres + pgvector** | Hub's database. See step 2. |
| **bun** | Runs the hub (`curl -fsSL https://bun.sh/install \| bash`) |
| **pnpm** | Builds the console (`corepack enable && corepack prepare pnpm@latest --activate`) |
| **Go** | Builds the node-agent binary (only if building locally; otherwise cross-compile) |
| **nginx + certbot** | Existing reverse proxy; certbot for TLS |

The hub repo is assumed checked out at `/opt/agentpod` on the box (adjust paths as needed).

---

## 1. DNS

Add two A-records pointing to your server's IP:

```
hub.<your-domain>   →  <server IP>
app.<your-domain>   →  <server IP>
```

Cloudflare: use DNS-only (grey cloud) so nginx terminates TLS and WebSocket connections are not subject to proxy timeout quirks.

Wait for propagation: `dig +short hub.<your-domain>` should return the IP.

---

## 2. Postgres

```bash
apt-get update && apt-get install -y postgresql postgresql-contrib postgresql-16-pgvector
sudo -u postgres psql -c "CREATE ROLE agentpod LOGIN PASSWORD '<STRONG_PASSWORD>';"
sudo -u postgres psql -c "CREATE DATABASE agentpod OWNER agentpod;"
sudo -u postgres psql -d agentpod -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

Tune for a shared box (optional): set `shared_buffers = 256MB` in `/etc/postgresql/16/main/postgresql.conf`, then `systemctl restart postgresql`.

---

## 3. Build the node-agent Docker images

Build both images on the Docker host from the repo root. The context path is `apps/node-agent`; the Dockerfiles live in `apps/node-agent/deploy/`.

```bash
cd /opt/agentpod

# Base node-agent image (no harness preloaded)
docker build \
  -t agentpod-node:local \
  -f apps/node-agent/deploy/Dockerfile \
  apps/node-agent

# OpenCode harness image (bun + opencode-ai@0.5.5 preloaded)
docker build \
  -t agentpod-node-opencode:local \
  -f apps/node-agent/deploy/Dockerfile.opencode \
  apps/node-agent
```

Verify: `docker images | grep agentpod-node`

---

## 4. Hub — environment file

Create `/etc/agentpod/hub.env` (mode `600`):

```bash
mkdir -p /etc/agentpod
chmod 700 /etc/agentpod
cat > /etc/agentpod/hub.env <<'EOF'
# ── Database ──────────────────────────────────────────────────────────────────
DATABASE_URL=postgres://agentpod:<STRONG_PASSWORD>@localhost:5432/agentpod

# ── Auth ──────────────────────────────────────────────────────────────────────
# BETTER_AUTH_SECRET: ≥32 chars, random. Better Auth auto-reads this env var.
BETTER_AUTH_SECRET=<run: openssl rand -hex 32>

# ENCRYPTION_KEY: exactly 32 bytes (AES-256-GCM for stored credentials).
ENCRYPTION_KEY=<run: openssl rand -hex 16>  # 16 hex-pairs = 32 bytes

# API_TOKEN: bearer token for server-to-server calls (enrollment, health probes).
API_TOKEN=<run: openssl rand -hex 24>

# ── Feature flags ─────────────────────────────────────────────────────────────
# Disable OpenCode sync (not needed for the fleet console).
ENABLE_OPENCODE_SYNC=false

# Disable MetaMCP integration (not part of fleet console).
METAMCP_ENABLED=false

# Activity archival: set false to disable background archival job (optional).
# ENABLE_ACTIVITY_ARCHIVAL=false

# ── Provisioning ──────────────────────────────────────────────────────────────
# Enable the Docker provisioner.
ENABLE_DOCKER_PROVISIONING=true

# Docker image tags built in step 3.
NODE_AGENT_IMAGE=agentpod-node:local
NODE_AGENT_OPENCODE_IMAGE=agentpod-node-opencode:local

# Hub URL reachable from inside provisioned containers (used for auto-enrollment).
# Must be the container-reachable public URL of the hub, not 127.0.0.1.
PROVISIONING_HUB_URL=https://hub.<your-domain>

# Cloudflare provisioner: leave off unless you have a verified CF Sandbox setup.
# ENABLE_CLOUDFLARE_SANDBOXES=false
EOF
chmod 600 /etc/agentpod/hub.env
```

> **Key constraints**
> - `BETTER_AUTH_SECRET`: ≥ 32 characters.
> - `ENCRYPTION_KEY`: **exactly** 32 bytes. Using `openssl rand -hex 16` produces 32 hex characters = 32 ASCII bytes.
> - Never commit this file to source control.

---

## 5. Hub — build + deploy

```bash
cd /opt/agentpod
git fetch && git checkout redesign/fleet-console && git pull
pnpm install --frozen-lockfile
```

Install the systemd unit (already in the repo):

```bash
cp /opt/agentpod/deploy/agentpod-hub.service /etc/systemd/system/
# Verify ExecStart bun path: `which bun` (default /root/.bun/bin/bun)
# Edit if different: ExecStart=/usr/local/bin/bun run src/index.ts
systemctl daemon-reload
systemctl enable --now agentpod-hub
```

The hub auto-runs Drizzle migrations on startup. Watch the log:

```bash
systemctl status agentpod-hub --no-pager
journalctl -u agentpod-hub -n 50 --no-pager
# Expected: "migrations completed" and "Provisioners registered: docker..."
```

Health check:

```bash
curl -s http://127.0.0.1:3001/health
# {"status":"ok",...}
```

> If you need to run migrations manually: `cd /opt/agentpod/apps/hub && bun run db:migrate`

---

## 6. Console — build

Build the static SPA pointed at your hub. If the box is low on RAM, build locally and rsync:

```bash
# On the box (or locally, then rsync):
cd /opt/agentpod
PUBLIC_HUB_URL=https://hub.<your-domain> pnpm --filter @agentpod/console build
# Output: apps/console/build/
```

The console is served by nginx (step 7) from `apps/console/build/`.

---

## 7. nginx vhosts

**7a. WebSocket upgrade map** (add once to the `http{}` context):

```bash
cat > /etc/nginx/conf.d/agentpod-upgrade.conf <<'EOF'
map $http_upgrade $connection_upgrade { default upgrade; '' close; }
EOF
```

**7b. Hub + console vhosts** (copy from the repo):

```bash
cp /opt/agentpod/deploy/nginx/hub.agentpod.dev.conf \
   /etc/nginx/sites-available/agentpod-hub
# If your domain is not agentpod.dev, edit the two server_name lines:
#   server_name hub.<your-domain>;
#   server_name app.<your-domain>;
ln -sf /etc/nginx/sites-available/agentpod-hub \
       /etc/nginx/sites-enabled/agentpod-hub
nginx -t   # MUST pass before reloading
systemctl reload nginx
```

The vhost config (`deploy/nginx/hub.agentpod.dev.conf`) sets:
- `proxy_pass http://127.0.0.1:3001` for the hub, with WS upgrade headers
- `proxy_read_timeout 3600s` / `proxy_send_timeout 3600s` for long-lived streams
- `client_max_body_size 64m` for large file uploads
- Static SPA root at `apps/console/build/` with `try_files $uri /index.html`

---

## 8. TLS (certbot)

```bash
apt-get install -y certbot python3-certbot-nginx
certbot --nginx -d hub.<your-domain> -d app.<your-domain>
nginx -t && systemctl reload nginx
```

Verify:

```bash
curl -s https://hub.<your-domain>/health      # {"status":"ok",...}
curl -sI https://app.<your-domain>            # 200, console HTML
```

On the co-hosted Matrix box, also confirm: `curl -sI https://id.agentpod.dev` should still 200/redirect (Synapse untouched).

---

## 9. Smoke test

1. Open `https://app.<your-domain>` in a browser; sign up (first user auto-becomes admin; signup closes immediately after).
2. Confirm the session cookie is `Domain=.<your-domain>; Secure; SameSite=Lax` in DevTools.
3. Navigate to **Settings → Nodes** and generate an enrollment token.
4. Enroll a real host (see [docs/OPERATING.md](./OPERATING.md)).
5. Check startup log for `"Provisioners registered: docker…"`.

---

## Rollback

```bash
systemctl disable --now agentpod-hub
rm /etc/nginx/sites-enabled/agentpod-hub \
   /etc/nginx/conf.d/agentpod-upgrade.conf
nginx -t && systemctl reload nginx
# Database: sudo -u postgres dropdb agentpod  (only if abandoning entirely)
```

Synapse / `id.agentpod.dev` are never modified, so rollback cannot affect Matrix.

---

## Re-deploy (upgrade)

```bash
cd /opt/agentpod && git pull
# Rebuild console if changed:
PUBLIC_HUB_URL=https://hub.<your-domain> pnpm --filter @agentpod/console build
# Restart hub (auto-migrates):
systemctl restart agentpod-hub
systemctl status agentpod-hub --no-pager
```

Node-agent upgrades: re-run `scripts/install-node-agent.sh` on each host (script is idempotent).
