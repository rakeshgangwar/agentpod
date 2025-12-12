# Research: Configurable Sandbox Environments for AI Coding Agents

## Executive Summary

This document analyzes approaches used by leading platforms for providing configurable sandbox environments to AI coding agents. The goal is to identify patterns that work well for environments that need to support both local development and cloud/production deployment.

**Key Finding:** The devcontainer spec offers the best foundation for configuration format, but platforms are increasingly layering simpler abstractions on top (nixpacks, Modal's Image API). E2B's template + Dockerfile approach is closest to what AgentPod needs.

---

## Platform Analysis

### 1. GitHub Codespaces

**Architecture:**
- Uses devcontainer.json as the primary configuration format
- Containers run on Azure infrastructure
- Full VM isolation per workspace

**Configuration Approach:**
```
.devcontainer/
├── devcontainer.json      # Primary configuration
├── Dockerfile             # Optional custom image
└── docker-compose.yml     # Optional multi-container
```

**Key devcontainer.json Features:**
```json
{
  "name": "My Project",
  "image": "mcr.microsoft.com/devcontainers/base:ubuntu",
  "features": {
    "ghcr.io/devcontainers/features/node:1": { "version": "22" },
    "ghcr.io/devcontainers/features/python:1": { "version": "3.12" }
  },
  "forwardPorts": [3000, 5432],
  "postCreateCommand": "npm install",
  "customizations": {
    "vscode": {
      "extensions": ["ms-python.python"]
    }
  }
}
```

**Strengths:**
- Industry-standard specification (devcontainers.io)
- Extensive feature library (100+ composable features)
- Rich IDE integrations (VS Code, JetBrains)
- Reproducible across GitHub, local, and CI/CD

**Weaknesses:**
- Docker-centric (harder for local non-Docker)
- Complex for simple use cases
- Slow cold starts (full container builds)

**Persistence:**
- Git-based workspace persistence
- dotfiles sync
- Prebuilds for faster startup

---

### 2. Gitpod

**Architecture:**
- Uses `.gitpod.yml` as primary config (simpler than devcontainer)
- Workspace images built on Kubernetes
- Ephemeral by design

**Configuration Approach:**
```yaml
# .gitpod.yml
image: gitpod/workspace-full

tasks:
  - name: Setup
    before: yarn global add express
    init: yarn install
    command: yarn dev

ports:
  - port: 3000
    onOpen: open-preview
    name: Website

vscode:
  extensions:
    - ms-python.python
```

**Key Differences from Codespaces:**
- Task lifecycle: `before` → `init` → `command`
- Prebuilds run `before` + `init`; workspaces run `command`
- Simpler YAML syntax

**Strengths:**
- Fast ephemeral workspaces
- Prebuild system for fast startup
- GitHub/GitLab/Bitbucket integration

**Weaknesses:**
- Proprietary format (not devcontainer)
- Limited ecosystem compared to devcontainer features

---

### 3. Replit

**Architecture:**
- Uses Nix under the hood for package management
- `.replit` and `replit.nix` for configuration
- Proprietary runtime with collaboration features

**Configuration Approach:**
```toml
# .replit
run = "npm run dev"
entrypoint = "index.js"

[nix]
channel = "stable-24_05"

[languages]
[languages.nodejs]
pattern = "**/*.{js,jsx,ts,tsx}"

[deployment]
run = ["sh", "-c", "npm run start"]
```

```nix
# replit.nix
{ pkgs }: {
  deps = [
    pkgs.nodejs_22
    pkgs.python312
    pkgs.postgresql
  ];
}
```

**Strengths:**
- Nix provides reproducible, declarative environments
- Instant forking/remixing of environments
- Multi-language support via Nix packages

**Weaknesses:**
- Proprietary platform
- Nix learning curve for custom packages
- Limited portability to other environments

---

### 4. Railway

**Architecture:**
- Uses Nixpacks for auto-detection and builds
- Optional `railway.toml`/`railway.json` for config-as-code
- Deployed on Railway's infrastructure

**Configuration Approach:**
```toml
# railway.toml
[build]
builder = "nixpacks"
buildCommand = "npm run build"

[deploy]
preDeployCommand = ["npm run db:migrate"]
startCommand = "npm start"
healthcheckPath = "/"
healthcheckTimeout = 100
restartPolicyType = "never"
```

**Nixpacks Approach:**
```toml
# nixpacks.toml (optional, usually auto-detected)
providers = ["node"]

[phases.setup]
nixPkgs = ["nodejs_22", "postgresql"]

[phases.install]
cmds = ["npm ci"]

[phases.build]
cmds = ["npm run build"]

[start]
cmd = "npm start"
```

**How Nixpacks Works:**
1. **Plan Phase:** Analyze source, detect languages, generate build plan
2. **Build Phase:** Install Nix packages, run install/build commands
3. **Output:** OCI-compliant Docker image

**Strengths:**
- Zero-config for most projects (auto-detection)
- Nix packages for OS/language dependencies
- Deterministic builds
- Outputs standard Docker images

**Weaknesses:**
- Focus on deployment, not development environments
- Less interactive than Codespaces/Gitpod

---

### 5. Fly.io Machines

**Architecture:**
- Fast-launching VMs (subsecond start)
- REST API for full lifecycle control
- MicroVM technology (Firecracker-based)

**Configuration Approach:**
```bash
# flyctl commands
fly machine run --image myapp:latest --region ord

# Machine configuration via API
{
  "name": "my-machine",
  "region": "ord",
  "config": {
    "image": "myapp:latest",
    "env": { "NODE_ENV": "production" },
    "services": [{
      "ports": [{ "port": 443, "handlers": ["tls", "http"] }],
      "protocol": "tcp",
      "internal_port": 8080
    }],
    "guest": {
      "cpu_kind": "shared",
      "cpus": 1,
      "memory_mb": 256
    }
  }
}
```

**Machine Lifecycle:**
1. `created` → Image pulled, filesystem assembled
2. `started` → Running, fast to start
3. `stopped` → Paused, components ready
4. (deleted) → Resources freed

**Strengths:**
- Extremely fast start times (~100ms warm start)
- Low-level control when needed
- Scale to zero
- Global edge deployment

**Weaknesses:**
- Bring your own container image
- No built-in dev environment tooling
- Manual orchestration

---

### 6. Modal

**Architecture:**
- Serverless containers for AI/ML workloads
- Python-first SDK
- "Zero configuration" - everything is code

**Configuration Approach:**
```python
import modal

app = modal.App("my-app")

# Image definition (fluent API)
image = (
    modal.Image.debian_slim(python_version="3.13")
    .apt_install("git", "ffmpeg")
    .pip_install("torch", "transformers")
    .run_commands("git clone https://github.com/example/repo")
    .env({"CUDA_VISIBLE_DEVICES": "0"})
)

# Function with GPU
@app.function(gpu="h100", image=image, timeout=600)
def train_model():
    import torch
    # training code...
```

**Sandbox API (for untrusted code):**
```python
# Create sandbox with runtime configuration
sb = modal.Sandbox.create(
    app=app,
    image=modal.Image.debian_slim().pip_install("pandas"),
    volumes={"/data": modal.Volume.from_name("my-volume")},
    timeout=10*60,  # 10 minutes
    workdir="/repo"
)

# Execute commands
p = sb.exec("python", "-c", "print('hello')")
print(p.stdout.read())

# Pause/resume support
sb.terminate()
```

**Key Features:**
- Images defined programmatically
- Sandboxes for running untrusted AI-generated code
- File access API for sandboxes
- GPU support as first-class citizen
- Snapshots for instant restore

**Strengths:**
- Python-native, no YAML/JSON configs
- Extremely fast cold starts via snapshots
- Built for AI workloads
- Sandboxes designed for AI agents

**Weaknesses:**
- Python-centric
- Cloud-only (no local mode)
- Vendor lock-in

---

### 7. E2B (Most Relevant!)

**Architecture:**
- Purpose-built for AI coding agents
- Fast-launching sandboxed VMs (~150ms start)
- Template system for custom environments
- Firecracker-based microVMs

**Configuration Approach:**

**e2b.toml:**
```toml
template_id = "my-custom-template"
dockerfile = "e2b.Dockerfile"
```

**e2b.Dockerfile:**
```dockerfile
FROM ubuntu:22.04

RUN apt-get update && apt-get install -y \
    nodejs npm python3 python3-pip

WORKDIR /home/user

COPY requirements.txt .
RUN pip install -r requirements.txt
```

**SDK Usage (JavaScript):**
```typescript
import { Sandbox } from '@e2b/code-interpreter'

// Start sandbox from template
const sandbox = await Sandbox.create({
  template: 'my-custom-template',
  timeoutMs: 60_000,  // 60 seconds
  metadata: { userId: '123' }
})

// Execute code
const result = await sandbox.runCode('python', 'print("Hello")')

// File operations
await sandbox.filesystem.write('/home/user/test.py', 'print("test")')
const content = await sandbox.filesystem.read('/home/user/test.py')

// Run commands
const cmd = await sandbox.commands.run('npm install')

// Persistence (pause/resume)
await sandbox.betaPause()  // Saves filesystem + memory state
const resumed = await Sandbox.connect(sandbox.sandboxId)

// Cleanup
await sandbox.kill()
```

**Template System:**
- Build from Dockerfile
- Cache layers for fast rebuilds
- Private registries supported
- Start/Ready commands for initialization

**Persistence (Beta):**
- Pause sandbox: saves filesystem + memory state
- Resume: restores exact state
- Auto-pause after timeout
- 30-day retention

**Strengths:**
- Designed specifically for AI coding agents
- Extremely fast start times
- Pause/resume with full memory state
- Simple SDK for TypeScript/Python
- Open-source infrastructure

**Weaknesses:**
- Dockerfile-based (no higher-level abstraction)
- Cloud-only (no local development story)
- No devcontainer compatibility

---

## Configuration Format Comparison

| Platform | Config Format | Ecosystem | Local Dev | Portability |
|----------|--------------|-----------|-----------|-------------|
| Codespaces | devcontainer.json | Excellent | VS Code | High |
| Gitpod | .gitpod.yml | Good | Limited | Medium |
| Replit | .replit + Nix | Limited | None | Low |
| Railway | nixpacks.toml | Good | CLI | High |
| Fly.io | fly.toml + API | N/A | Limited | Medium |
| Modal | Python code | N/A | None | Low |
| E2B | e2b.toml + Dockerfile | N/A | None | Medium |

---

## Devcontainer Specification Deep Dive

The devcontainer spec (containers.dev) is the most comprehensive and portable option.

### Core Concepts

1. **Base Images**: Start from existing container images
2. **Features**: Composable, reusable environment additions
3. **Lifecycle Scripts**: `postCreate`, `postStart`, `postAttach`
4. **Customizations**: Tool-specific settings (VS Code, JetBrains)

### Feature System

Features are self-contained, shareable units of installation:
```json
{
  "features": {
    "ghcr.io/devcontainers/features/node:1": {
      "version": "22"
    },
    "ghcr.io/devcontainers/features/python:1": {
      "version": "3.12"
    },
    "ghcr.io/devcontainers/features/docker-in-docker:2": {},
    "ghcr.io/devcontainers/features/github-cli:1": {}
  }
}
```

**Available Official Features:**
- Languages: Node, Python, Go, Rust, Java, .NET, PHP, Ruby
- Tools: Docker, Kubernetes, Terraform, AWS CLI, Azure CLI
- Utilities: Git, SSH, common-utils

### Advantages for AgentPod

1. **Industry Standard**: Works with VS Code, JetBrains, CLI
2. **Feature Ecosystem**: 100+ features, can create custom
3. **Local Parity**: Same config works locally and in cloud
4. **Extensible**: Custom features for AgentPod-specific needs

### Limitations

1. **Docker Required**: Needs Docker runtime
2. **Build Time**: Feature installation adds startup time
3. **Complexity**: Full spec is verbose for simple cases

---

## Nix/Flakes Approach

### How It Works

Nix is a purely functional package manager:
- Packages are immutable, stored by hash
- No dependency conflicts
- Atomic upgrades and rollbacks
- Reproducible builds

**flake.nix Example:**
```nix
{
  description = "My development environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in {
        devShells.default = pkgs.mkShell {
          buildInputs = [
            pkgs.nodejs_22
            pkgs.python312
            pkgs.go_1_22
            pkgs.rustc
            pkgs.cargo
            pkgs.postgresql
          ];
          
          shellHook = ''
            echo "Development environment loaded"
          '';
        };
      });
}
```

### Advantages

1. **Perfect Reproducibility**: Hash-based dependencies
2. **Multi-Language**: All languages treated equally
3. **System Packages**: Not just language packages
4. **Composable**: Layers don't conflict

### Disadvantages

1. **Learning Curve**: Nix language is complex
2. **Build Times**: First build can be slow
3. **Docker Integration**: Not as native
4. **Community Size**: Smaller than Docker

---

## Recommended Architecture for AgentPod

### Hybrid Approach

Combine the best aspects of each platform:

```
┌─────────────────────────────────────────────────────────────────────┐
│                     AgentPod Environment System                      │
│                                                                      │
│  Configuration Formats (choose one per project):                     │
│                                                                      │
│  1. agentpod.toml              (Simple, AgentPod-native)            │
│  2. devcontainer.json          (Industry standard, full control)    │
│  3. Auto-detect via nixpacks   (Zero-config fallback)               │
│                                                                      │
│  All formats → Unified Build System → OCI Container Image           │
└─────────────────────────────────────────────────────────────────────┘
```

### Configuration Format: agentpod.toml

A simpler format that compiles to devcontainer.json internally:

```toml
# agentpod.toml - Simple configuration for most projects
[environment]
name = "my-project"
base = "fullstack"  # js, python, go, rust, fullstack, polyglot

# Language versions (optional, uses defaults if omitted)
[environment.languages]
node = "22"
python = "3.12"

# Additional system packages
[environment.packages]
apt = ["ffmpeg", "imagemagick"]
npm = ["typescript", "eslint"]
pip = ["pytest", "black"]

# Services (auto-started)
[services]
postgres = { version = "16", port = 5432 }
redis = { enabled = true }

# Ports to expose
[ports]
3000 = { label = "Frontend", public = true }
8000 = { label = "API" }

# Lifecycle commands
[lifecycle]
setup = "npm install && pip install -r requirements.txt"
dev = "npm run dev"
test = "npm test && pytest"

# Add-ons
[addons]
gui = false
code-server = true
```

### Mapping to Existing System

| agentpod.toml | Current Docker System |
|---------------|----------------------|
| `base = "fullstack"` | `codeopen-fullstack` image |
| `services.postgres` | `databases` addon |
| `addons.gui = true` | `gui` addon |
| `addons.code-server = true` | `code-server` addon |

### Devcontainer Compatibility

For users who need full control, support devcontainer.json directly:

```json
{
  "name": "Advanced Project",
  "image": "forgejo.superchotu.com/rakeshgangwar/codeopen-fullstack:latest",
  "features": {
    "ghcr.io/devcontainers/features/docker-in-docker:2": {},
    "ghcr.io/agentpod/features/mcp-servers:1": {}
  },
  "forwardPorts": [3000, 8000],
  "postCreateCommand": "npm install",
  "customizations": {
    "agentpod": {
      "agents": ["reviewer", "tester"],
      "permissions": {
        "bash": "ask",
        "write": "allow"
      }
    }
  }
}
```

### Auto-Detection (Nixpacks-style)

When no config exists, auto-detect and generate:

```
Detected: package.json, requirements.txt
→ Base: fullstack
→ Languages: Node.js 22, Python 3.12
→ Commands: npm install && pip install -r requirements.txt
→ Start: npm start (from package.json scripts)
```

---

## Persistence Strategy

### E2B-Inspired Approach

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Sandbox State Management                        │
│                                                                      │
│  States:                                                             │
│  - Running: Active sandbox, code executing                           │
│  - Paused: Filesystem + memory state saved                          │
│  - Stopped: Only persistent volumes remain                          │
│                                                                      │
│  Persistence Layers:                                                 │
│  1. Git Repository: Code changes (manual commit)                     │
│  2. Persistent Volumes: Databases, caches, build artifacts          │
│  3. Sandbox Snapshots: Full VM state (pause/resume)                 │
│                                                                      │
│  Timeout Behavior:                                                   │
│  - Default: 30 min idle → Pause                                     │
│  - Max: 24 hours active                                             │
│  - Resume: <1 second from paused state                              │
└─────────────────────────────────────────────────────────────────────┘
```

### Volume Management

```yaml
# Persistent across sandbox restarts
volumes:
  workspace: /home/developer/workspace  # Git repo
  npm-cache: /home/developer/.npm       # Package cache
  pip-cache: /home/developer/.cache/pip
  cargo: /home/developer/.cargo
  postgres-data: /var/lib/postgresql

# Ephemeral (recreated each time)
ephemeral:
  tmp: /tmp
  build: /home/developer/.build
```

---

## Local Development Story

### Option 1: Docker Compose

```yaml
# docker-compose.yml (generated from agentpod.toml)
version: '3.8'
services:
  dev:
    image: codeopen-fullstack:latest
    volumes:
      - .:/home/developer/workspace
      - npm-cache:/home/developer/.npm
    ports:
      - "3000:3000"
      - "8000:8000"
    environment:
      - OPENCODE_AUTH_JSON=${OPENCODE_AUTH_JSON}
```

### Option 2: Dev Container CLI

```bash
# Using devcontainer CLI (works with VS Code or standalone)
devcontainer up --workspace-folder .
devcontainer exec --workspace-folder . npm run dev
```

### Option 3: AgentPod CLI

```bash
# Native CLI that works locally and connects to cloud
agentpod dev                     # Start local environment
agentpod dev --sync              # Sync with cloud sandbox
agentpod exec "npm test"         # Run command
agentpod logs                    # Stream logs
```

---

## Security Model

### E2B/Modal-Inspired Isolation

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Security Layers                                 │
│                                                                      │
│  1. MicroVM Isolation (Firecracker/gVisor)                          │
│     - Separate kernel per sandbox                                    │
│     - Hardware-level isolation                                       │
│                                                                      │
│  2. Network Isolation                                                │
│     - Private network per sandbox                                    │
│     - Controlled egress (allowlist)                                  │
│     - No direct internet by default                                  │
│                                                                      │
│  3. Resource Limits                                                  │
│     - CPU/Memory cgroups                                             │
│     - Disk quotas                                                    │
│     - Network bandwidth limits                                       │
│                                                                      │
│  4. Permission System (OpenCode)                                     │
│     - bash: ask/allow/deny per command                              │
│     - write: file permission control                                 │
│     - mcp: tool access control                                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Recommendations

### Phase 1: Simplified Config Format

1. Define `agentpod.toml` schema
2. Build parser that maps to existing Docker images
3. Support basic fields: base, languages, packages, ports

### Phase 2: Devcontainer Compatibility

1. Accept `.devcontainer/devcontainer.json`
2. Map devcontainer features to AgentPod capabilities
3. Support custom Dockerfile

### Phase 3: Auto-Detection

1. Integrate nixpacks detection logic
2. Generate `agentpod.toml` from detected project
3. Support explicit overrides

### Phase 4: Local Development

1. Docker Compose generation
2. AgentPod CLI for local dev
3. Sync between local and cloud

### Phase 5: Pause/Resume

1. Implement sandbox snapshotting
2. Fast resume (<1s)
3. Auto-pause after idle timeout

---

## Comparison Matrix: What to Adopt

| Feature | Source | Priority | Notes |
|---------|--------|----------|-------|
| Feature system | Devcontainer | High | Composable language/tool additions |
| Simple TOML config | Railway/Gitpod | High | Lower barrier to entry |
| Auto-detection | Nixpacks | Medium | Zero-config for most projects |
| Pause/Resume | E2B | Medium | Cost savings, fast restart |
| Python SDK | Modal | Low | If expanding beyond TS/JS |
| Nix packages | Replit/Nixpacks | Medium | Reproducible system deps |

---

## Recommended Stack

```
┌─────────────────────────────────────────────────────────────────────┐
│                     AgentPod Environment Stack                       │
│                                                                      │
│  User-Facing Config:                                                 │
│  └── agentpod.toml (simple) OR devcontainer.json (advanced)        │
│                                                                      │
│  Build System:                                                       │
│  └── Docker multi-stage builds with feature composition             │
│                                                                      │
│  Base Images:                                                        │
│  └── Current codeopen-{flavor} images                               │
│                                                                      │
│  Runtime:                                                            │
│  └── Docker (local) OR Coolify/K8s (production)                     │
│                                                                      │
│  Persistence:                                                        │
│  └── Git (code) + Volumes (data) + Snapshots (state)                │
│                                                                      │
│  Orchestration:                                                      │
│  └── ACP Gateway (multi-agent) + Management API                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Next Steps

1. **Define agentpod.toml Schema**: Create JSON Schema for validation
2. **Build Config Parser**: TypeScript library to parse and transform
3. **Extend Entrypoint**: Load config and apply at container start
4. **CLI Development**: Local development command for agentpod
5. **Documentation**: User guide for config format

---

## References

- [Devcontainer Specification](https://containers.dev/implementors/json_reference/)
- [Devcontainer Features](https://containers.dev/features)
- [E2B Documentation](https://e2b.dev/docs)
- [Modal Documentation](https://modal.com/docs/guide)
- [Nixpacks](https://nixpacks.com/docs)
- [Gitpod Configuration](https://www.gitpod.io/docs/configure/workspaces)
- [Fly Machines](https://fly.io/docs/machines)
- [Railway Config as Code](https://docs.railway.com/guides/config-as-code)
- [Nix Flakes](https://nixos.wiki/wiki/Flakes)
