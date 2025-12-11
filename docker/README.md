# CodeOpen Modular Container System

This directory contains the modular container system for CodeOpen development environments. The system consists of a base image, language-specific flavors, and optional add-ons.

## Architecture

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

## Image Naming Convention

```
codeopen-{flavor}[-addon1][-addon2]:{version}

Examples:
  codeopen-fullstack:latest              # Default full-stack
  codeopen-python-gpu:latest             # Python with GPU
  codeopen-fullstack-gui-databases:latest # Full-stack + Desktop + Databases
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

## Registry

Images are hosted on Forgejo Container Registry:
```
forgejo.superchotu.com/rakeshgangwar/codeopen-{image}:latest
```

## Ports

| Port | Service | Description |
|------|---------|-------------|
| 4096 | OpenCode | OpenCode server API |
| 4097 | ACP Gateway | Multi-agent orchestration |
| 8080 | Code Server | VS Code in browser |
| 6080 | KasmVNC | Desktop GUI (web) |
| 5432 | PostgreSQL | Database (databases addon) |
| 6379 | Redis | Cache (databases addon) |

## What's Included

### Base Image (codeopen-base)

- **OS**: Ubuntu 24.04 LTS
- **Node.js**: 22 LTS with pnpm
- **Bun**: Fast JavaScript runtime
- **OpenCode CLI**: AI coding assistant
- **ACP Gateway**: Multi-agent orchestration service
- **CLI Tools**: git, ripgrep, fd, bat, fzf, jq, yq

### ACP Gateway

The ACP Gateway runs on port 4097 and provides:
- Multi-agent support (OpenCode, Claude Code, Gemini CLI, etc.)
- HTTP API for agent management
- SSE event streaming
- File system operations

## Building Images

### Prerequisites

- Docker with Buildx
- Access to Forgejo registry (for push)

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

## Environment Variables

### Container Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENCODE_PORT` | `4096` | OpenCode server port |
| `ACP_GATEWAY_PORT` | `4097` | ACP Gateway port |
| `WORKSPACE` | `/home/developer/workspace` | Project workspace |

### Runtime Configuration

| Variable | Description |
|----------|-------------|
| `MANAGEMENT_API_URL` | URL of AgentPod Management API |
| `AUTH_TOKEN` | Bearer token for API authentication |
| `USER_ID` | User identifier for config fetching |
| `PROJECT_SLUG` | Project slug for workspace |
| `FORGEJO_REPO_URL` | Git repository to clone |
| `FORGEJO_USER` | Git authentication username |
| `FORGEJO_TOKEN` | Git authentication token |
| `OPENCODE_AUTH_JSON` | LLM provider credentials (JSON) |
| `OPENCODE_CONFIG_JSON` | OpenCode configuration (JSON) |

## Directory Structure

```
docker/
├── base/                          # Base image
│   ├── Dockerfile
│   ├── entrypoint.sh
│   ├── README.md
│   ├── scripts/
│   │   └── common-setup.sh
│   └── acp-gateway/               # ACP Gateway service
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts
│           ├── types.ts
│           ├── acp-client.ts
│           ├── agent-manager.ts
│           ├── agent-registry.ts
│           ├── auth-handler.ts
│           ├── event-emitter.ts
│           ├── file-handler.ts
│           └── session-manager.ts
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

## CI/CD Pipeline

### Forgejo Actions Workflow

Located at: `.forgejo/workflows/build-containers.yml`

**Triggers:**
- Push to `main` branch (changes in `docker/` directory)
- Tag push (`v*`)
- Manual dispatch with target selection

**Build Matrix:**
- Base image first
- All flavors in parallel
- Add-ons per flavor combination

### Versioning

Version is read from `docker/VERSION` file.

To release a new version:
```bash
echo "0.1.0" > docker/VERSION
git add docker/VERSION
git commit -m "chore: bump container version to 0.1.0"
git push
```

## Migration from Legacy Containers

### Mapping Old Tiers to New System

| Old Tier | New Configuration |
|----------|-------------------|
| `lite` | `starter` + `fullstack` + `code-server` |
| `standard` | `builder` + `fullstack` + `code-server` |
| `pro` | `creator` + `fullstack` + `code-server` |
| `desktop` | `creator` + `fullstack` + `gui` + `code-server` |

### Breaking Changes

1. **Image names changed**: `opencode-cli` → `codeopen-fullstack-code-server`
2. **Port changes**: ACP Gateway now on 4097
3. **New environment variables**: See configuration section

## Troubleshooting

### Build Fails on ARM64 (Mac M1/M2)

Use `--platform linux/amd64` or build via CI:
```bash
BUILD_PLATFORM=linux/amd64 ./scripts/build-base.sh
```

### ACP Gateway Not Starting

Check if port 4097 is available and Bun is installed:
```bash
curl http://localhost:4097/health
```

### Container Size Too Large

- Use specific flavor instead of polyglot
- Avoid GPU addon unless needed
- Clean Docker build cache: `docker builder prune`
