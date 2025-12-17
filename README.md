# AgentPod

A cross-platform application for running AI coding agents in isolated sandbox environments. Create, manage, and interact with containerized development workspaces powered by [OpenCode](https://opencode.ai).

## Vision

**"Portable Command Center"** — Your personal AI-powered development environment:

- **Sandboxed Workspaces**: Each project runs in an isolated Docker container with its own tools, dependencies, and AI agent
- **Multi-Platform**: Desktop app (macOS, Windows, Linux) with mobile support (iOS, Android) via Tauri v2
- **Self-Hosted**: Run locally or deploy to your own server — no vendor lock-in
- **AI-Native**: Built around OpenCode, supporting 75+ LLM providers (Claude, GPT, GitHub Copilot, Ollama, etc.)

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           AGENTPOD ARCHITECTURE                             │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                        CLIENT LAYER                                     ││
│  │   ┌───────────────┐    ┌───────────────┐    ┌───────────────┐          ││
│  │   │   Desktop     │    │    Mobile     │    │     Web       │          ││
│  │   │   (Tauri)     │    │  (Tauri v2)   │    │   (Future)    │          ││
│  │   │ macOS/Win/Lin │    │   iOS/Android │    │               │          ││
│  │   └───────────────┘    └───────────────┘    └───────────────┘          ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                     INFRASTRUCTURE LAYER                                ││
│  │   ┌───────────────┐  ┌───────────────┐  ┌───────────────┐              ││
│  │   │    Traefik    │  │  PostgreSQL   │  │  Better Auth  │              ││
│  │   │ (Reverse Proxy│  │  (+ pgvector) │  │ (Session Auth)│              ││
│  │   │  + Auto SSL)  │  │               │  │               │              ││
│  │   └───────────────┘  └───────────────┘  └───────────────┘              ││
│  │              │               │                   │                      ││
│  │              └───────────────┴───────────────────┘                      ││
│  │                              │                                          ││
│  │                   ┌──────────┴──────────┐                               ││
│  │                   │   Management API    │                               ││
│  │                   │    (Bun + Hono)     │                               ││
│  │                   │  Direct Docker API  │                               ││
│  │                   └─────────────────────┘                               ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                        SANDBOX LAYER                                    ││
│  │   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                    ││
│  │   │  Sandbox A  │  │  Sandbox B  │  │  Sandbox C  │                    ││
│  │   │ ┌─────────┐ │  │ ┌─────────┐ │  │ ┌─────────┐ │                    ││
│  │   │ │OpenCode │ │  │ │OpenCode │ │  │ │OpenCode │ │                    ││
│  │   │ │ Server  │ │  │ │ Server  │ │  │ │ Server  │ │                    ││
│  │   │ └─────────┘ │  │ └─────────┘ │  │ └─────────┘ │                    ││
│  │   │ + Workspace │  │ + Workspace │  │ + Workspace │                    ││
│  │   │ + Terminal  │  │ + Terminal  │  │ + Terminal  │                    ││
│  │   └─────────────┘  └─────────────┘  └─────────────┘                    ││
│  │              │               │               │                          ││
│  │   ┌──────────┴───────────────┴───────────────┴──────────┐              ││
│  │   │              Docker Network (agentpod-net)           │              ││
│  │   └──────────────────────────────────────────────────────┘              ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

## Features

### Core
- **Project Management**: Create sandboxes from scratch, clone from GitHub, or import existing repos
- **AI Chat Interface**: Real-time streaming chat with OpenCode via SSE
- **File Browser**: Navigate project files with syntax highlighting (Shiki)
- **Interactive Terminal**: Full terminal access to sandbox containers (xterm.js)
- **Session Management**: Multiple chat sessions per sandbox with history

### Configuration
- **LLM Providers**: Configure API keys or OAuth (GitHub Copilot, Claude, OpenAI, Anthropic, etc.)
- **Theme System**: 20+ built-in themes with modular color schemes and font pairings
- **Keyboard Shortcuts**: Agent cycling (Cmd+,/.), model cycling (Alt+,/.)
- **Human-in-the-Loop**: Permission system for AI actions requiring approval

### Container Flavors
| Flavor | Languages | Size |
|--------|-----------|------|
| `codeopen-js` | JavaScript, TypeScript, Deno | ~800MB |
| `codeopen-python` | Python 3.12, Jupyter, ML tools | ~1.2GB |
| `codeopen-go` | Go 1.22 | ~900MB |
| `codeopen-rust` | Rust stable | ~1.1GB |
| `codeopen-fullstack` | JavaScript + Python (default) | ~1.8GB |
| `codeopen-polyglot` | All languages | ~3GB |

### Production Ready
- **Observability**: Loki + Fluent Bit + Grafana for logging and monitoring
- **CI/CD**: GitHub Actions + Forgejo Actions pipelines
- **HTTPS**: Automatic SSL via Let's Encrypt + Traefik
- **Backup**: Automated PostgreSQL backups with retention policies

## Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Desktop/Mobile** | Tauri v2 + SvelteKit | Cross-platform native app |
| **UI Components** | shadcn-svelte + Tailwind | Design system |
| **Chat UI** | assistant-ui (React) | AI conversation interface |
| **API** | Bun + Hono | Fast, lightweight backend |
| **Database** | PostgreSQL + pgvector | Data persistence + embeddings |
| **Auth** | Better Auth | Session-based authentication |
| **Containers** | Docker + Traefik | Sandbox orchestration |
| **AI Agent** | OpenCode | 75+ LLM provider support |
| **Build** | Turborepo + pnpm | Monorepo management |

## Project Structure

```
agentpod/
├── apps/
│   ├── frontend/                # Tauri desktop app (@agentpod/frontend)
│   │   ├── src/                 # SvelteKit frontend
│   │   │   ├── lib/
│   │   │   │   ├── chat/        # React chat components (assistant-ui)
│   │   │   │   ├── components/  # Svelte components
│   │   │   │   ├── stores/      # Svelte 5 rune-based state
│   │   │   │   └── themes/      # Theme system
│   │   │   └── routes/          # SvelteKit pages
│   │   └── src-tauri/           # Rust backend
│   │       └── src/
│   │           ├── commands/    # Tauri IPC commands
│   │           └── services/    # Business logic
│   │
│   └── api/                     # Management API (@agentpod/api)
│       ├── src/
│       │   ├── auth/            # Better Auth configuration
│       │   ├── db/              # Drizzle ORM + PostgreSQL
│       │   ├── routes/          # Hono API routes
│       │   └── services/        # Business logic
│       │       ├── orchestrator/  # Docker management
│       │       ├── git/           # Git operations
│       │       └── config/        # agentpod.toml parsing
│       └── tests/               # 411 tests (unit + integration + e2e)
│
├── packages/
│   ├── types/                   # Shared TypeScript types (@agentpod/types)
│   ├── ui/                      # Shared UI components (@agentpod/ui)
│   ├── tsconfig/                # Shared TypeScript configs
│   └── eslint-config/           # Shared ESLint configs
│
├── docker/
│   ├── base/                    # Base container image
│   │   ├── Dockerfile
│   │   ├── entrypoint.sh
│   │   ├── acp-gateway/         # Agent Communication Protocol
│   │   └── homepage/            # Container dashboard
│   ├── flavors/                 # Language-specific images
│   │   ├── js/
│   │   ├── python/
│   │   ├── go/
│   │   ├── rust/
│   │   ├── fullstack/
│   │   └── polyglot/
│   └── scripts/                 # Build scripts
│
├── config/                      # Infrastructure configs
│   ├── grafana/                 # Dashboards and provisioning
│   ├── loki/                    # Log aggregation
│   └── fluent-bit/              # Log collection
│
├── docs/                        # Documentation
│   ├── architecture/            # System design
│   ├── implementation/          # Phase guides
│   ├── ui-ux/                   # Design system
│   ├── onboarding-system/       # Knowledge base
│   └── production-readiness/    # Deployment guides
│
├── docker-compose.yml           # Local development
├── docker-compose.prod.yml      # Production overrides
├── turbo.json                   # Turborepo config
└── pnpm-workspace.yaml          # Workspace definition
```

## Quick Start

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) (for sandboxes)
- [Node.js 22+](https://nodejs.org/) or [Bun](https://bun.sh/)
- [pnpm](https://pnpm.io/) (`npm install -g pnpm`)
- [Rust](https://rustup.rs/) (for Tauri)
- [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)

### Development

```bash
# Clone the repository
git clone https://github.com/rakeshgangwar/codeopen.git
cd codeopen

# Install dependencies
pnpm install

# Copy environment files
cp .env.example .env
cp apps/api/.env.example apps/api/.env

# Start infrastructure (PostgreSQL, Traefik)
docker compose up -d postgres traefik

# Start development servers
pnpm dev

# Or run full Tauri app
pnpm tauri dev
```

### Build

```bash
# Build all packages
pnpm build

# Build desktop app
pnpm tauri build

# Build container images
cd docker && ./scripts/build.sh
```

### Testing

```bash
# Run all tests
pnpm test

# Type checking
pnpm check

# API tests only
cd apps/api && bun test

# Rust tests
cd apps/frontend/src-tauri && cargo test
```

## Configuration

### Environment Variables

See [`.env.example`](./.env.example) for all options.

Key variables:
```bash
# Database
DATABASE_URL=postgres://agentpod:password@localhost:5432/agentpod

# Auth
BETTER_AUTH_SECRET=your-secret-key
GITHUB_CLIENT_ID=your-github-oauth-client-id
GITHUB_CLIENT_SECRET=your-github-oauth-client-secret

# Domain
BASE_DOMAIN=localhost  # or your-domain.com for production
```

### agentpod.toml

Projects can include an `agentpod.toml` for sandbox configuration:

```toml
[project]
name = "my-project"
description = "My awesome project"

[environment]
base = "fullstack"  # js, python, go, rust, fullstack, polyglot

[environment.languages]
node = "22"
python = "3.12"

[resources]
tier = "builder"  # starter, builder, creator, power

[lifecycle]
setup = "npm install"
dev = "npm run dev"
```

## Commands Reference

```bash
# Development
pnpm dev                    # Start all apps
pnpm dev:frontend           # Frontend only
pnpm dev:api               # API only
pnpm tauri dev             # Full Tauri app

# Building
pnpm build                 # Build all packages
pnpm tauri build           # Desktop/mobile app

# Testing
pnpm check                 # Type checking
pnpm test                  # All tests

# Docker
docker compose up -d       # Start infrastructure
docker compose logs -f api # Follow API logs

# Container images
./docker/scripts/build.sh          # All images
./docker/scripts/build-base.sh     # Base only
./docker/scripts/build-flavor.sh js # Specific flavor
```

## Documentation

- [Technical Architecture](./docs/technical-architecture.md)
- [Implementation Guide](./docs/implementation/)
- [UI/UX Documentation](./docs/ui-ux/)
- [Production Readiness](./docs/production-readiness/)
- [Testing Guide](./docs/testing/)

## Implementation Status

| Phase | Name | Status |
|-------|------|--------|
| 1 | Infrastructure Setup | ✅ Complete |
| 2 | Management API | ✅ Complete |
| 3 | Desktop App Foundation | ✅ Complete |
| 4 | Core Features (Chat, Files, Terminal) | ✅ Complete |
| 5 | Advanced (Themes, Onboarding, Agents) | ✅ Complete |
| 6 | Production Readiness | ✅ Complete |

## Resources

- [OpenCode Documentation](https://opencode.ai/docs)
- [Tauri v2](https://v2.tauri.app/)
- [SvelteKit](https://kit.svelte.dev/)
- [Hono](https://hono.dev/)
- [Better Auth](https://better-auth.com/)

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup and guidelines.

## License

MIT

---

*Built with Tauri v2 + SvelteKit + Bun + Docker*
