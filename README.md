# CodeOpen - Portable Command Center

A mobile-first application that acts as a remote control for [OpenCode](https://opencode.ai) AI coding agents running on remote servers. Heavy processing stays on the server; your phone provides a fast, native-feeling interface.

## Vision

**"Virtual Office"** — a one-person company powered by AI agents:

- **The Brain is Remote**: AI processing runs on your Hetzner VPS with maximum resources
- **The Interface is Local**: Lightweight, high-performance mobile app connects via Tailscale
- **Native Experience**: Feels indistinguishable from a native mobile app — smooth animations, clean layout, intuitive touch controls
- **Full Version Control**: All files live in Forgejo (self-hosted Git) with GitHub/GitLab sync

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     TAILSCALE MESH VPN                          │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    HETZNER VPS                          │    │
│  │                                                         │    │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────────────────────┐  │    │
│  │  │ Coolify │  │ Forgejo │  │    OpenCode Containers  │  │    │
│  │  │   +     │  │  (Git)  │  │  ┌───┐  ┌───┐  ┌───┐    │  │    │
│  │  │ Traefik │  │         │  │  │ A │  │ B │  │ C │    │  │    │
│  │  └────┬────┘  └────┬────┘  │  └───┘  └───┘  └───┘    │  │    │
│  │       │            │       └─────────────────────────┘  │    │
│  │       └──────┬─────┘                                    │    │
│  │              │                                          │    │
│  │       ┌──────┴──────┐                                   │    │
│  │       │ Management  │                                   │    │
│  │       │    API      │                                   │    │
│  │       └─────────────┘                                   │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                     ┌────────┴────────┐                         │
│                     │   MOBILE APP    │                         │
│                     │  (Tauri+Svelte) │                         │
│                     └─────────────────┘                         │
└─────────────────────────────────────────────────────────────────┘
```

## Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Mobile Framework** | Tauri v2 + Svelte | Rust backend for OAuth, small binary, web UI |
| **Container Orchestration** | Coolify | Docker management, environment variables |
| **Git Forge** | Forgejo | Self-hosted Git with GitHub sync |
| **Network** | Tailscale | Zero-trust VPN mesh |
| **AI Agent** | OpenCode | 75+ LLM providers, agentic coding |
| **Backend API** | Bun + Hono | Project lifecycle, credential management |

## Project Structure

```
├── src/                    # Svelte frontend
│   ├── lib/
│   │   ├── components/    # UI components (shadcn/ui)
│   │   ├── stores/        # Svelte state stores
│   │   └── api/           # API clients
│   └── routes/            # SvelteKit pages
│
├── src-tauri/             # Tauri Rust backend
│   └── src/
│       ├── commands/      # IPC commands
│       ├── services/      # API, OAuth, storage
│       └── models/        # Data types
│
├── management-api/        # Backend API service
│   └── src/
│       ├── routes/        # API endpoints
│       ├── services/      # Coolify, Forgejo clients
│       └── models/        # Data models
│
├── docker/                # Docker configurations
│   ├── opencode/          # OpenCode container image
│   └── opencode-cli/      # CLI container variant
│
└── docs/                  # Project documentation
    ├── implementation/    # Phase-by-phase guide
    └── ui-ux/             # Design system & mockups
```

## Core Features

- **Project Management**: Create, import from GitHub, manage multiple projects
- **AI Chat Interface**: Real-time chat with OpenCode via SSE
- **File Browser**: View and navigate project files with syntax highlighting
- **LLM Providers**: Configure API keys or OAuth (GitHub Copilot, Claude Pro/Max)
- **GitHub Sync**: Bidirectional sync between Forgejo and GitHub
- **Container Control**: Start, stop, restart OpenCode containers
- **Secure Storage**: Credentials stored in OS keychain

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) (package manager)
- [Rust](https://rustup.rs/) (for Tauri)
- [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)

### Development

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Or run full Tauri app
pnpm tauri dev
```

### Build

```bash
# Build for production
pnpm build

# Build desktop/mobile app
pnpm tauri build
```

### Testing

```bash
# TypeScript/Svelte type checking
pnpm check

# Rust tests (in src-tauri/)
cargo test
```

## Infrastructure URLs

| Service | URL |
|---------|-----|
| Coolify Dashboard | https://admin.superchotu.com |
| Forgejo Git | https://forgejo.superchotu.com |
| Management API | https://api.superchotu.com |

## Implementation Status

| Phase | Name | Status |
|-------|------|--------|
| 1 | Infrastructure Setup | ✅ Complete |
| 2 | Management API | ✅ Complete |
| 3 | Mobile App Foundation | 🔲 In Progress |
| 4 | Mobile App Core Features | 🔲 Pending |
| 5 | Mobile App Advanced | 🔲 Pending |
| 6 | Polish & Optimization | 🔲 Pending |

## Documentation

- [Portable Command Center Overview](./docs/portable-command-center.md)
- [Technical Architecture](./docs/technical-architecture.md)
- [User Journey](./docs/user-journey.md)
- [Design Language](./docs/design-language.md)
- [Implementation Guide](./docs/implementation/)
- [UI/UX Documentation](./docs/ui-ux/)

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) + [Svelte](https://marketplace.visualstudio.com/items?itemName=svelte.svelte-vscode) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## Resources

- [OpenCode Documentation](https://opencode.ai/docs)
- [Tauri v2](https://v2.tauri.app/)
- [Coolify API](https://coolify.io/docs/api-reference)
- [Forgejo](https://forgejo.org/docs/)
- [Tailscale](https://tailscale.com/kb)

---

*Built with Tauri v2 + SvelteKit + TypeScript*
