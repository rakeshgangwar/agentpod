# Modular Container Architecture

This document describes the modular container architecture for CodeOpen, enabling flexible, composable development environments through a combination of resource tiers, language flavors, and optional add-ons.

## Overview

The modular container system replaces the previous monolithic container approach with a layered, composable architecture:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER SELECTION                                  │
│                                                                             │
│   Resource Tier: [starter] [builder] [creator] [power]                      │
│   Flavor:        [js] [python] [go] [rust] [fullstack] [polyglot]          │
│   Add-ons:       [☐ gui] [☐ code-server] [☐ gpu] [☐ databases] [☐ cloud]   │
│                                                                             │
│   → Final Image: codeopen-{flavor}[-addon1][-addon2]:version               │
│   → Resources: tier.cpu + addons.cpu, tier.memory + addons.memory          │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Architecture

### Layer Model

```
┌─────────────────────────────────────────────────────────────────────┐
│                          ADD-ONS (Optional)                         │
│  [gui] [code-server] [gpu] [databases] [cloud]                     │
│  Composable features that extend any flavor                         │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         FLAVORS (Stack-specific)                    │
│  [js] [python] [go] [rust] [fullstack] [polyglot]                  │
│  Language runtimes, frameworks, and development tools               │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    BASE (Always included, ~500MB)                   │
│  Ubuntu 24.04 + Node.js + Bun + OpenCode + ACP Gateway + Core CLI  │
│  Foundation layer with AI agent orchestration                       │
└─────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Layer | Purpose | Examples |
|-------|---------|----------|
| **Base** | AI agent runtime, core tools | OpenCode, ACP Gateway, git, curl, ripgrep |
| **Flavor** | Language-specific development | Python 3.12, Go 1.22, Rust toolchain |
| **Add-on** | Optional capabilities | Desktop GUI, GPU support, Code Server |

## Resource Tiers

Resource tiers define the CPU, memory, and storage allocation for containers.

| Tier ID | Name | CPU | Memory | Storage | Price/Month | Use Case |
|---------|------|-----|--------|---------|-------------|----------|
| `starter` | Starter | 1 | 2Gi | 20GB | Free | Learning, scripts, small projects |
| `builder` | Builder | 2 | 4Gi | 30GB | $10 | Web development, typical projects |
| `creator` | Creator | 4 | 8Gi | 50GB | $25 | Full-stack, multiple services |
| `power` | Power | 8 | 16Gi | 100GB | $50 | Complex workloads, large codebases |

### Resource Calculation

When add-ons are selected, their resource requirements are added to the tier:

```
Total CPU = tier.cpu + sum(addon.extra_cpu)
Total Memory = tier.memory + sum(addon.extra_memory)
```

Example: `builder` tier + `gui` add-on = 4 CPU, 8Gi memory

## Container Flavors

Flavors provide language-specific development environments.

### JavaScript (`codeopen-js`)

**Size:** ~800MB | **Languages:** JavaScript, TypeScript

| Component | Details |
|-----------|---------|
| Runtime | Node.js 22 LTS |
| Package Managers | pnpm, yarn, npm |
| Build Tools | esbuild, vite, tsx, turbo |
| Frameworks | React, Vue, Next.js, Express, Fastify, Hono |

### Python (`codeopen-python`)

**Size:** ~1.2GB | **Languages:** Python

| Component | Details |
|-----------|---------|
| Runtime | Python 3.12 |
| Package Managers | pip, uv, poetry |
| Tools | ruff, jupyter, ipython |
| Frameworks | Django, Flask, FastAPI, PyTorch, TensorFlow, LangChain |

### Go (`codeopen-go`)

**Size:** ~900MB | **Languages:** Go

| Component | Details |
|-----------|---------|
| Runtime | Go 1.22 |
| Tools | gopls, golangci-lint, air, delve |
| Frameworks | Gin, Echo, Fiber, Chi |

### Rust (`codeopen-rust`)

**Size:** ~1.1GB | **Languages:** Rust

| Component | Details |
|-----------|---------|
| Runtime | Rust (latest stable via rustup) |
| Tools | cargo, clippy, rustfmt, rust-analyzer, cargo-watch |
| Frameworks | Actix-web, Axum, Tokio, Rocket |

### Full-Stack (`codeopen-fullstack`)

**Size:** ~1.8GB | **Languages:** JavaScript, TypeScript, Python

| Component | Details |
|-----------|---------|
| Runtimes | Node.js 22, Python 3.12 |
| Package Managers | pnpm, pip, uv |
| Frameworks | React, Next.js, FastAPI, Django |

**Default flavor for new projects.**

### Polyglot (`codeopen-polyglot`)

**Size:** ~3GB | **Languages:** JavaScript, TypeScript, Python, Go, Rust

| Component | Details |
|-----------|---------|
| Runtimes | Node.js 22, Python 3.12, Go 1.22, Rust |
| Tools | Comprehensive tooling for all languages |
| Use Case | Maximum flexibility, multi-language projects |

## Add-ons

Add-ons are optional features that can be composed with any flavor.

### Desktop GUI (`-gui`)

Browser-based visual desktop environment using KasmVNC.

| Property | Value |
|----------|-------|
| Image Suffix | `-gui` |
| Extra CPU | +2 |
| Extra Memory | +4Gi |
| Extra Ports | 6080 (VNC web interface) |
| Price | +$10/month |

**Includes:**
- KasmVNC (web-based VNC with integrated X server)
- Openbox window manager
- tint2 taskbar
- PCManFM file manager
- gedit text editor
- xterm terminal

### Code Server (`-code`)

VS Code in the browser for visual code editing.

| Property | Value |
|----------|-------|
| Image Suffix | `-code` |
| Extra CPU | +1 |
| Extra Memory | +2Gi |
| Extra Ports | 8080 |
| Price | +$5/month |

### GPU/CUDA (`-gpu`)

NVIDIA GPU support for machine learning workloads.

| Property | Value |
|----------|-------|
| Image Suffix | `-gpu` |
| Extra CPU | 0 |
| Extra Memory | 0 |
| Requires | `creator` tier or higher |
| Price | +$30/month |

**Notes:**
- Requires NVIDIA GPU on host
- Uses nvidia-container-toolkit
- Best paired with `python` flavor for ML

### Database Tools (`-db`)

Database clients and management tools.

| Property | Value |
|----------|-------|
| Image Suffix | `-db` |
| Extra CPU | 0 |
| Extra Memory | +1Gi |
| Price | +$5/month |

**Includes:**
- PostgreSQL client (psql)
- Redis client (redis-cli)
- MongoDB client (mongosh)
- Database GUI tools

### Cloud CLIs (`-cloud`)

Cloud provider command-line tools.

| Property | Value |
|----------|-------|
| Image Suffix | `-cloud` |
| Extra CPU | 0 |
| Extra Memory | +512Mi |
| Price | Free |

**Includes:**
- AWS CLI v2
- Google Cloud SDK (gcloud)
- Azure CLI (az)
- Terraform
- kubectl

## Image Naming Convention

Images follow this naming pattern:

```
{registry}/{owner}/codeopen-{flavor}[-addon1][-addon2]:{version}
```

### Examples

| Configuration | Image Name |
|--------------|------------|
| JavaScript only | `codeopen-js:0.0.2` |
| Python with GUI | `codeopen-python-gui:0.0.2` |
| Full-stack with Code Server | `codeopen-fullstack-code:0.0.2` |
| Polyglot with GUI and databases | `codeopen-polyglot-db-gui:0.0.2` |
| Python with GPU | `codeopen-python-gpu:0.0.2` |

**Note:** Add-on suffixes are sorted alphabetically for consistent naming.

## Directory Structure

```
docker/
├── codeopen-base/                    # Foundation layer
│   ├── acp-gateway/                  # ACP Gateway source
│   │   ├── src/
│   │   ├── tests/
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── scripts/
│   │   ├── common-setup.sh           # Shared entrypoint functions
│   │   └── start-services.sh         # OpenCode + ACP Gateway startup
│   ├── Dockerfile
│   ├── entrypoint.sh
│   └── README.md
│
├── flavors/                          # Language-specific images
│   ├── js/
│   │   ├── Dockerfile
│   │   └── README.md
│   ├── python/
│   │   └── ...
│   ├── go/
│   │   └── ...
│   ├── rust/
│   │   └── ...
│   ├── fullstack/
│   │   └── ...
│   └── polyglot/
│       └── ...
│
├── addons/                           # Composable add-ons
│   ├── gui/
│   │   ├── config/
│   │   │   ├── openbox/
│   │   │   ├── tint2/
│   │   │   ├── kasmvnc.yaml
│   │   │   └── supervisord.conf
│   │   ├── Dockerfile
│   │   └── README.md
│   ├── code-server/
│   │   └── ...
│   ├── gpu/
│   │   └── ...
│   ├── databases/
│   │   └── ...
│   └── cloud/
│       └── ...
│
├── scripts/                          # Build automation
│   ├── build.sh                      # Main build orchestrator
│   ├── build-base.sh
│   ├── build-flavor.sh
│   ├── build-addon.sh
│   ├── build-on-demand.sh
│   ├── push.sh
│   └── config.sh
│
├── README.md
└── VERSION
```

## Build System

### Build Order

1. **Base image** (must be built first)
2. **Flavor images** (can be built in parallel, depend on base)
3. **Add-on combinations** (built on-demand, depend on flavor)

```
codeopen-base
    │
    ├── codeopen-js
    │   ├── codeopen-js-code
    │   ├── codeopen-js-gui
    │   └── codeopen-js-code-gui
    │
    ├── codeopen-python
    │   ├── codeopen-python-code
    │   ├── codeopen-python-gpu
    │   ├── codeopen-python-gui
    │   └── ...
    │
    └── ... (other flavors)
```

### On-Demand Building

Images are built on-demand when first requested:

1. User selects `python` flavor + `gui` add-on
2. System checks if `codeopen-python-gui` exists in registry
3. If not, triggers build workflow
4. Returns image reference once available

### Build Commands

```bash
# Build base image
./docker/scripts/build-base.sh

# Build a specific flavor
./docker/scripts/build-flavor.sh python

# Build a flavor with add-ons
./docker/scripts/build-addon.sh python gui
./docker/scripts/build-addon.sh python gui,code-server

# Build specific combination on-demand
./docker/scripts/build-on-demand.sh --flavor=python --addons=gui,gpu
```

## Database Schema

### Tables

#### `resource_tiers`

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | Tier ID (starter, builder, creator, power) |
| name | TEXT | Display name |
| description | TEXT | User-facing description |
| cpu_limit | TEXT | Docker CPU limit |
| memory_limit | TEXT | Docker memory limit |
| memory_reservation | TEXT | Docker memory reservation |
| storage_gb | INTEGER | Storage allocation |
| monthly_price_cents | INTEGER | Price in cents |
| is_default | INTEGER | Default tier flag |
| sort_order | INTEGER | Display order |

#### `container_flavors`

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | Flavor ID (js, python, go, etc.) |
| name | TEXT | Display name |
| description | TEXT | User-facing description |
| base_image | TEXT | Image name (codeopen-js) |
| languages | TEXT | JSON array of languages |
| frameworks | TEXT | JSON array of frameworks |
| tools | TEXT | JSON array of tools |
| estimated_size_mb | INTEGER | Approximate image size |
| is_default | INTEGER | Default flavor flag |
| sort_order | INTEGER | Display order |

#### `container_addons`

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | Add-on ID (gui, gpu, etc.) |
| name | TEXT | Display name |
| description | TEXT | User-facing description |
| image_suffix | TEXT | Suffix for image name (-gui) |
| extra_cpu | TEXT | Additional CPU required |
| extra_memory | TEXT | Additional memory required |
| extra_ports | TEXT | JSON array of ports |
| extra_env | TEXT | JSON object of env vars |
| requires_tier | TEXT | Minimum tier ID required |
| incompatible_with | TEXT | JSON array of incompatible add-ons |
| monthly_price_cents | INTEGER | Price in cents |
| sort_order | INTEGER | Display order |

### Project Fields

Projects store their container configuration:

```sql
ALTER TABLE projects ADD COLUMN resource_tier_id TEXT DEFAULT 'starter';
ALTER TABLE projects ADD COLUMN flavor_id TEXT DEFAULT 'fullstack';
ALTER TABLE projects ADD COLUMN addon_ids TEXT DEFAULT '[]';  -- JSON array
```

## API Endpoints

### Resource Tiers

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/resource-tiers` | List all resource tiers |
| GET | `/api/resource-tiers/:id` | Get tier by ID |

### Container Flavors

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/flavors` | List all flavors |
| GET | `/api/flavors/:id` | Get flavor by ID |

### Container Add-ons

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/addons` | List all add-ons |
| GET | `/api/addons/:id` | Get add-on by ID |
| GET | `/api/addons/:id/compatibility` | Check compatibility |

### Project Configuration

```typescript
// Create project with container config
POST /api/projects
{
  "name": "my-ml-project",
  "resourceTierId": "creator",
  "flavorId": "python",
  "addonIds": ["gpu", "code-server"]
}

// Update container config
PATCH /api/projects/:id
{
  "resourceTierId": "power",
  "addonIds": ["gpu", "gui", "code-server"]
}
```

## Port Mapping

All containers expose these ports:

| Port | Service | Always/Optional |
|------|---------|-----------------|
| 4096 | OpenCode Server | Always |
| 4097 | ACP Gateway | Always |
| 6080 | KasmVNC (GUI) | With `gui` add-on |
| 8080 | Code Server | With `code-server` add-on |

## Environment Variables

### Base Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENCODE_PORT` | 4096 | OpenCode server port |
| `ACP_GATEWAY_PORT` | 4097 | ACP Gateway port |
| `OPENCODE_HOST` | 0.0.0.0 | Bind address |
| `WORKSPACE` | /home/developer/workspace | Project workspace |

### GUI Add-on

| Variable | Default | Description |
|----------|---------|-------------|
| `DISPLAY` | :1 | X display number |
| `KASMVNC_PORT` | 6080 | VNC web interface port |
| `WIDTH` | 1280 | Screen width |
| `HEIGHT` | 800 | Screen height |

### Code Server Add-on

| Variable | Default | Description |
|----------|---------|-------------|
| `CODE_SERVER_PORT` | 8080 | Code Server port |
| `CODE_SERVER_AUTH` | none | Authentication mode |

### GPU Add-on

| Variable | Default | Description |
|----------|---------|-------------|
| `NVIDIA_VISIBLE_DEVICES` | all | GPU visibility |
| `NVIDIA_DRIVER_CAPABILITIES` | compute,utility | Driver capabilities |

## Migration from Legacy Containers

### Mapping Old Tiers to New System

| Old Tier | New Configuration |
|----------|-------------------|
| `lite` | `starter` + `polyglot` |
| `standard` | `builder` + `polyglot` |
| `pro` | `creator` + `polyglot` |
| `desktop` | `power` + `polyglot` + `['gui']` |

### Migration SQL

```sql
UPDATE projects SET 
  resource_tier_id = CASE container_tier_id
    WHEN 'lite' THEN 'starter'
    WHEN 'standard' THEN 'builder'
    WHEN 'pro' THEN 'creator'
    WHEN 'desktop' THEN 'power'
    ELSE 'starter'
  END,
  flavor_id = 'polyglot',
  addon_ids = CASE 
    WHEN container_tier_id = 'desktop' THEN '["gui"]'
    ELSE '[]'
  END
WHERE container_tier_id IS NOT NULL;
```

## Future Considerations

### Planned Add-ons

- **Mobile Development** (`-mobile`): Android SDK, Flutter
- **Java/JVM** (`-jvm`): JDK 21, Maven, Gradle
- **Security Tools** (`-security`): SAST/DAST tools

### Multi-Architecture Support

Currently targeting `amd64`. Future support planned for:
- `arm64` (Apple Silicon, AWS Graviton)

### Image Caching

Consider implementing:
- Layer caching in CI/CD
- Pre-built popular combinations
- Image warm-up on node pools

## Related Documents

- [Architecture](./architecture.md) - Overall system architecture
- [ACP Protocol](./acp-protocol.md) - Agent Client Protocol details
- [Session Persistence](./session-persistence.md) - Session storage
