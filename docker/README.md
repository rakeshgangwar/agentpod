# AgentPod Container System

This directory contains the modular container system for AgentPod development environments. The system consists of a base image, language-specific flavors, and optional add-ons.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      AgentPod Architecture                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐  │
│  │   Mobile     │    │   Desktop    │    │   Browser        │  │
│  │   App        │    │   App        │    │   (code-server)  │  │
│  └──────┬───────┘    └──────┬───────┘    └────────┬─────────┘  │
│         │                   │                      │            │
│         └───────────────────┼──────────────────────┘            │
│                             │                                    │
│                             ▼                                    │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    Traefik Proxy                          │   │
│  │              (*.localhost / *.your-domain.com)            │   │
│  └──────────────────────────┬───────────────────────────────┘   │
│                             │                                    │
│         ┌───────────────────┼───────────────────┐               │
│         ▼                   ▼                   ▼               │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐        │
│  │ Management  │    │  Sandbox 1  │    │  Sandbox 2  │        │
│  │    API      │    │ (container) │    │ (container) │        │
│  │  (Better    │    │             │    │             │        │
│  │   Auth)     │    │ - OpenCode  │    │ - OpenCode  │        │
│  └──────┬──────┘    │ - Homepage  │    │ - Homepage  │        │
│         │           │ - ACP GW    │    │ - ACP GW    │        │
│         │           └──────┬──────┘    └─────────────┘        │
│         │                  │                                    │
│         ▼                  ▼                                    │
│  ┌─────────────┐    ┌─────────────┐                            │
│  │  SQLite DB  │    │  Workspace  │  (mounted volume)          │
│  │  (auth,     │    │  /workspace │                            │
│  │   config)   │    │             │                            │
│  └─────────────┘    └─────────────┘                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Key Changes (v0.4.0)

The new architecture removes external dependencies:

| Old (v0.3.x) | New (v0.4.0) | Reason |
|--------------|--------------|--------|
| Coolify | Direct Docker API | Simpler, faster, more control |
| Forgejo | Filesystem Git | Workspaces mounted as volumes |
| Keycloak | Better Auth | Lighter, easier to configure |

## Image Hierarchy

```
codeopen-base
    │
    ├── codeopen-js (JavaScript/TypeScript)
    ├── codeopen-python (Python + ML/AI)
    ├── codeopen-go (Go)
    ├── codeopen-rust (Rust)
    ├── codeopen-fullstack (JS + Python) ← default
    └── codeopen-polyglot (All languages)
             │
             ├── + gui (Desktop via KasmVNC)
             ├── + code-server (VS Code in browser)
             ├── + databases (PostgreSQL, Redis, DuckDB)
             ├── + cloud (AWS, GCP, Azure, Terraform)
             └── + gpu (NVIDIA CUDA)
```

## Quick Start (Local Development)

```bash
# 1. Clone the repository
git clone https://github.com/agentpod/codeopen.git
cd codeopen

# 2. Copy environment files
cp .env.example .env

# 3. Start the infrastructure
docker compose up -d

# 4. Check status
docker compose ps
docker compose logs -f api

# 5. Access the services
# - API: http://api.localhost
# - Traefik Dashboard: http://localhost:8080
```

## Available Images

### Base Image

| Image | Description | Size |
|-------|-------------|------|
| `codeopen-base` | Foundation with Node.js 22, Bun, OpenCode CLI, ACP Gateway | ~500MB |

### Flavors (Language Environments)

| Flavor | Languages | Size (approx) |
|--------|-----------|---------------|
| `codeopen-js` | JavaScript, TypeScript, Deno | ~800MB |
| `codeopen-python` | Python 3.12, Jupyter, ML tools | ~1.2GB |
| `codeopen-go` | Go 1.22, common Go tools | ~900MB |
| `codeopen-rust` | Rust stable, cargo tools | ~1.1GB |
| `codeopen-fullstack` | JavaScript + Python (default) | ~1.8GB |
| `codeopen-polyglot` | All languages | ~3GB |

### Add-ons

| Add-on | Description | Port | Size |
|--------|-------------|------|------|
| `gui` | Desktop environment via KasmVNC | 6080 | ~800MB |
| `code-server` | VS Code in browser | 8080 | ~300MB |
| `databases` | PostgreSQL, Redis, DuckDB | 5432, 6379 | ~400MB |
| `cloud` | AWS, GCP, Azure CLI, Terraform, kubectl | - | ~600MB |
| `gpu` | NVIDIA CUDA 12.6, PyTorch | - | ~500MB |

## Ports

| Port | Service | Description |
|------|---------|-------------|
| 80 | nginx | Main entry point (reverse proxy) |
| 4096 | OpenCode | OpenCode server API |
| 4097 | ACP Gateway | Multi-agent orchestration |
| 3000 | Homepage | Project homepage/dashboard |
| 8080 | Code Server | VS Code in browser |
| 6080 | KasmVNC | Desktop GUI (web) |
| 5432 | PostgreSQL | Database (databases addon) |
| 6379 | Redis | Cache (databases addon) |

## Environment Variables

### Container Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `SANDBOX_ID` | - | Unique sandbox identifier |
| `PROJECT_NAME` | `AgentPod Project` | Project display name |
| `PROJECT_SLUG` | `project` | URL slug for the project |
| `USER_ID` | - | User identifier for config |
| `OPENCODE_PORT` | `4096` | OpenCode server port |
| `ACP_GATEWAY_PORT` | `4097` | ACP Gateway port |
| `HOMEPAGE_PORT` | `3000` | Homepage service port |
| `WILDCARD_DOMAIN` | `localhost` | Domain for URL generation |

### Workspace Configuration

| Variable | Description |
|----------|-------------|
| `GIT_REPO_URL` | Git repository URL to clone (optional) |
| `GIT_USERNAME` | Git authentication username |
| `GIT_TOKEN` | Git authentication token |
| `GIT_BRANCH` | Branch to checkout (default: main) |
| `GIT_USER_NAME` | Git commit author name |
| `GIT_USER_EMAIL` | Git commit author email |

### OpenCode Configuration

| Variable | Description |
|----------|-------------|
| `OPENCODE_AUTH_JSON` | LLM provider credentials (JSON) |
| `OPENCODE_CONFIG_JSON` | OpenCode configuration (JSON) |

### Legacy Variables (Deprecated)

These are still supported for backward compatibility:

| Variable | Replacement |
|----------|-------------|
| `FORGEJO_REPO_URL` | `GIT_REPO_URL` |
| `FORGEJO_USER` | `GIT_USERNAME` |
| `FORGEJO_TOKEN` | `GIT_TOKEN` |

## Workspace Modes

### Mode 1: Pre-mounted Workspace (Recommended)

The workspace is mounted as a Docker volume. No cloning needed.

```yaml
# docker-compose.yml
services:
  sandbox:
    image: codeopen-fullstack:latest
    volumes:
      - ./my-project:/home/developer/workspace
```

### Mode 2: Clone from Remote

Clone a repository on container startup.

```yaml
# docker-compose.yml
services:
  sandbox:
    image: codeopen-fullstack:latest
    environment:
      - GIT_REPO_URL=https://github.com/user/repo.git
      - GIT_USERNAME=myuser
      - GIT_TOKEN=ghp_xxxxx
```

## Building Images

### Prerequisites

- Docker with Buildx
- Access to container registry (for push)

### Build Commands

```bash
cd docker

# Build everything
./scripts/build.sh

# Build specific components
./scripts/build-base.sh
./scripts/build-flavor.sh fullstack
./scripts/build-addon.sh gui --base codeopen-fullstack:latest

# Build with options
./scripts/build.sh --no-cache --push
./scripts/build-flavor.sh python --push
```

### Build Order

1. Base image (always first)
2. Flavors (depend on base)
3. Add-ons (depend on flavors)

## Directory Structure

```
docker/
├── base/                          # Base image
│   ├── Dockerfile
│   ├── entrypoint.sh
│   ├── README.md
│   ├── scripts/
│   │   └── common-setup.sh
│   ├── nginx/
│   │   └── nginx.conf
│   ├── acp-gateway/               # ACP Gateway service
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   └── homepage/                  # Homepage service
│       ├── package.json
│       └── src/
├── flavors/                       # Language environments
│   ├── js/
│   ├── python/
│   ├── go/
│   ├── rust/
│   ├── fullstack/
│   └── polyglot/
├── addons/                        # Optional features
│   ├── gui/
│   ├── code-server/
│   ├── databases/
│   ├── cloud/
│   └── gpu/
├── scripts/                       # Build scripts
│   ├── config.sh
│   ├── build.sh
│   ├── build-base.sh
│   ├── build-flavor.sh
│   ├── build-addon.sh
│   ├── push.sh
│   └── login.sh
├── README.md
└── VERSION
```

## agentpod.toml Configuration

Projects can include an `agentpod.toml` file to configure their sandbox:

```toml
[project]
name = "my-project"
description = "A cool project"

[environment]
base = "fullstack"  # js, python, go, rust, fullstack, polyglot

[environment.languages]
node = "22"
python = "3.12"

[resources]
tier = "builder"  # starter, builder, creator, power

[addons]
code-server = true
gui = false

[lifecycle]
setup = "npm install"
dev = "npm run dev"
build = "npm run build"
test = "npm test"

[ports]
3000 = { label = "Dev Server", public = true }
5432 = { label = "PostgreSQL", public = false }
```

## Troubleshooting

### Container Won't Start

1. Check logs: `docker compose logs sandbox`
2. Verify Docker socket is accessible
3. Check if ports are already in use

### Workspace Not Mounted

1. Ensure the host path exists
2. Check Docker volume permissions
3. Verify SELinux/AppArmor settings (Linux)

### Code Server Not Accessible

1. Check if addon is enabled: `ADDON_IDS=code-server`
2. Verify port 8080 is exposed
3. Check Traefik routing labels

### Build Fails on ARM64 (Mac M1/M2)

Use `--platform linux/amd64` or build via CI:

```bash
BUILD_PLATFORM=linux/amd64 ./scripts/build-base.sh
```

## Migration from v0.3.x

### Breaking Changes

1. **No more Forgejo**: Workspaces are now mounted volumes
2. **No more Coolify**: Direct Docker API management
3. **No more Keycloak**: Better Auth handles authentication
4. **Environment variables renamed**: `FORGEJO_*` → `GIT_*`

### Migration Steps

1. Update environment variables (see Legacy Variables section)
2. Mount workspaces as volumes instead of cloning
3. Configure Better Auth (GitHub OAuth optional)
4. Remove Coolify/Forgejo/Keycloak from docker-compose
