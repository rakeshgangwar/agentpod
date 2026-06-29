# Agentpod Monorepo Structure

This document describes the monorepo structure for **Agentpod** - a platform for running CLI-based AI coding agents in isolated sandbox environments.

## Overview

Agentpod uses a modern monorepo architecture with:
- **Turborepo** for task orchestration, caching, and parallel builds
- **pnpm workspaces** for dependency management
- **apps/** + **packages/** convention (industry standard)

## Directory Structure

```
agentpod/
├── apps/
│   ├── frontend/                      # Tauri desktop app (@agentpod/frontend)
│   │   ├── src/                       # SvelteKit frontend
│   │   │   ├── lib/
│   │   │   │   ├── api/
│   │   │   │   │   └── tauri.ts       # Tauri invoke wrappers
│   │   │   │   ├── chat/              # React components (assistant-ui)
│   │   │   │   │   ├── ChatThread.tsx
│   │   │   │   │   ├── CommandPicker.tsx
│   │   │   │   │   ├── FilePicker.tsx
│   │   │   │   │   ├── PermissionBar.tsx
│   │   │   │   │   ├── PermissionContext.tsx
│   │   │   │   │   ├── RuntimeProvider.tsx
│   │   │   │   │   └── adapter.ts
│   │   │   │   ├── components/        # Custom Svelte components
│   │   │   │   ├── stores/            # Svelte 5 rune-based stores
│   │   │   │   └── utils/
│   │   │   ├── routes/                # SvelteKit routes
│   │   │   ├── app.css
│   │   │   └── app.html
│   │   ├── src-tauri/                 # Rust backend
│   │   │   ├── src/
│   │   │   │   ├── commands/          # Tauri IPC commands
│   │   │   │   ├── models/            # Rust data types
│   │   │   │   └── services/          # Business logic
│   │   │   ├── capabilities/
│   │   │   ├── icons/
│   │   │   ├── Cargo.toml
│   │   │   └── tauri.conf.json
│   │   ├── static/
│   │   ├── package.json
│   │   ├── svelte.config.js
│   │   ├── vite.config.js
│   │   ├── tsconfig.json
│   │   ├── components.json
│   │   └── .env.example
│   │
│   └── api/                           # Management API (@agentpod/api)
│       ├── src/
│       │   ├── db/                    # SQLite database
│       │   ├── models/                # API-specific models
│       │   ├── routes/                # Hono API routes
│       │   ├── services/              # Business logic
│       │   ├── utils/
│       │   ├── config.ts
│       │   └── index.ts
│       ├── tests/
│       │   ├── integration/
│       │   └── unit/
│       ├── package.json
│       ├── Dockerfile
│       ├── tsconfig.json
│       └── .env.example
│
├── packages/
│   ├── types/                         # Shared TypeScript types (@agentpod/types)
│   │   ├── src/
│   │   │   ├── project.ts             # Project, ProjectStatus, SyncDirection
│   │   │   ├── container.ts           # ContainerTier, TierResources, TierFeatures
│   │   │   ├── provider.ts            # Provider, ModelInfo, etc.
│   │   │   ├── settings.ts            # Theme, AppSettings, etc.
│   │   │   ├── opencode.ts            # Re-exports from @opencode-ai/sdk
│   │   │   ├── api.ts                 # API response wrappers
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── ui/                            # Shared UI components (@agentpod/ui)
│   │   ├── src/
│   │   │   ├── components/            # shadcn-svelte components
│   │   │   │   ├── avatar/
│   │   │   │   ├── badge/
│   │   │   │   ├── button/
│   │   │   │   ├── card/
│   │   │   │   ├── dialog/
│   │   │   │   ├── dropdown-menu/
│   │   │   │   ├── input/
│   │   │   │   ├── label/
│   │   │   │   ├── scroll-area/
│   │   │   │   ├── select/
│   │   │   │   ├── separator/
│   │   │   │   ├── skeleton/
│   │   │   │   ├── sonner/
│   │   │   │   ├── switch/
│   │   │   │   └── tabs/
│   │   │   ├── styles/
│   │   │   │   └── tokens.css
│   │   │   ├── utils/
│   │   │   │   └── cn.ts
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── eslint-config/                 # Shared ESLint config (@agentpod/eslint-config)
│   │   ├── base.js
│   │   ├── svelte.js
│   │   ├── react.js
│   │   └── package.json
│   │
│   └── tsconfig/                      # Shared TypeScript configs (@agentpod/tsconfig)
│       ├── base.json
│       ├── svelte.json
│       ├── node.json
│       └── package.json
│
├── docker/                            # Docker configurations
│   ├── containers/
│   │   ├── cli/                       # Agent CLI container
│   │   │   ├── Dockerfile
│   │   │   ├── entrypoint.sh
│   │   │   └── scripts/
│   │   └── desktop/                   # Agent desktop container (VNC)
│   │       ├── Dockerfile
│   │       ├── entrypoint.sh
│   │       └── config/
│   ├── compose/
│   │   ├── docker-compose.yml
│   │   ├── docker-compose.dev.yml
│   │   └── .env.example
│   ├── scripts/
│   │   ├── build.sh
│   │   ├── push.sh
│   │   └── config.sh
│   ├── VERSION
│   └── README.md
│
├── docs/                              # Documentation
│   ├── implementation/
│   ├── ui-ux/
│   ├── architecture/
│   └── README.md
│
├── scripts/                           # Root utility scripts
│   ├── setup.sh
│   └── dev.sh
│
├── .forgejo/                          # CI/CD workflows
│   └── workflows/
│
├── Cargo.toml                         # Rust workspace
├── turbo.json                         # Turborepo configuration
├── pnpm-workspace.yaml                # pnpm workspace config
├── package.json                       # Root package.json
├── tsconfig.json                      # Base TypeScript config
├── .env.example
├── .gitignore
├── AGENTS.md
├── CONTRIBUTING.md
└── README.md
```

## Package Dependencies

```
@agentpod/frontend
├── @agentpod/types (shared types)
├── @agentpod/ui (UI components)
├── @agentpod/tsconfig (TypeScript config)
└── @agentpod/eslint-config (ESLint config)

@agentpod/api
├── @agentpod/types (shared types)
├── @agentpod/tsconfig (TypeScript config)
└── @agentpod/eslint-config (ESLint config)

@agentpod/ui
├── @agentpod/tsconfig (TypeScript config)
└── bits-ui, tailwind-merge, clsx, etc.

@agentpod/types
├── @opencode-ai/sdk (re-exports SDK types)
└── @agentpod/tsconfig (TypeScript config)
```

## Turborepo Task Pipeline

```
turbo.json tasks:
├── build          # Builds all packages (depends on ^build)
├── dev            # Development mode (persistent, no cache)
├── check          # Svelte/TypeScript checking
├── lint           # ESLint
├── test           # All tests
├── test:unit      # Unit tests only
├── test:integration # Integration tests
├── typecheck      # TypeScript type checking
└── clean          # Clean build artifacts
```

## Key Commands

```bash
# Development
pnpm dev                    # Start all apps in dev mode
pnpm dev:frontend           # Start only frontend
pnpm dev:api                # Start only API
pnpm tauri dev              # Start Tauri desktop app

# Building
pnpm build                  # Build all packages
pnpm build --filter=@agentpod/frontend  # Build only frontend

# Testing
pnpm test                   # Run all tests
pnpm test:unit              # Run unit tests
pnpm test:integration       # Run integration tests

# Code Quality
pnpm check                  # TypeScript/Svelte checking
pnpm lint                   # ESLint
pnpm typecheck              # TypeScript only

# Utilities
pnpm clean                  # Clean all build artifacts
```

## Type Sharing Strategy

### Types in @agentpod/types (custom)

| Module | Types |
|--------|-------|
| `project.ts` | `ProjectStatus`, `SyncDirection`, `Project`, `CreateProjectInput` |
| `container.ts` | `ContainerTier`, `TierResources`, `TierFeatures` |
| `provider.ts` | `Provider`, `ProviderWithModels`, `ModelInfo`, `ModelCapabilities` |
| `settings.ts` | `Theme`, `AppSettings`, `ConnectionStatus`, `PermissionSettings` |
| `api.ts` | `ApiResponse<T>`, `PaginatedResponse<T>`, `ErrorResponse` |

### Types re-exported from @opencode-ai/sdk

| SDK Type | Usage |
|----------|-------|
| `Session` | OpenCode session info |
| `Message`, `UserMessage`, `AssistantMessage` | Chat messages |
| `Part`, `TextPart`, `FilePart`, `ToolPart` | Message parts |
| `ToolState` variants | Tool execution states |
| `Permission` | Permission requests |

**Important**: Do NOT manually redefine SDK types. Import and re-export them from `@agentpod/types/opencode`.

## Migration Notes

This structure was migrated from the original flat layout:
- `src/` → `apps/frontend/src/`
- `src-tauri/` → `apps/frontend/src-tauri/`
- `management-api/` → `apps/api/`
- `src/lib/components/ui/` → `packages/ui/src/components/`
- Shared types extracted to `packages/types/`
- Docker configs consolidated under `docker/`
