# Current Features

> **Last Updated:** January 4, 2026  
> **Status:** ~95% Feature Complete  
> **Version:** 0.0.4

This document provides a comprehensive inventory of all implemented features in AgentPod.

---

## Quick Summary

| Category | Status | Count |
|----------|--------|-------|
| API Routes | Complete | 23 endpoint groups |
| Database Tables | Complete | 17 schema modules |
| Backend Services | Complete | 20+ services |
| Frontend Pages | Complete | 25 pages |
| Svelte Stores | Complete | 15 stores |
| Tauri Commands | Complete | 9 modules |
| Container Flavors | Complete | 7 flavors |

---

## Backend API

### Route Modules (23 endpoint groups)

| Route | Endpoints | Description |
|-------|-----------|-------------|
| **sandboxes.ts** | CRUD, start/stop/restart, logs, stats, exec | Sandbox lifecycle management |
| **chat.ts** | Sessions CRUD, message history | Chat persistence API |
| **workflows.ts** | CRUD, execute, executions | Workflow builder API |
| **agents.ts** | Task orchestration, routing, metrics | Multi-agent management |
| **admin.ts** | User management, limits, audit | Admin dashboard API |
| **providers.ts** | List, configure, OAuth | LLM provider config |
| **terminal.ts** | WebSocket upgrade | Interactive terminal |
| **preview.ts** | Port detection, preview URLs | Web app preview |
| **onboarding.ts** | Sessions, progress | Onboarding system |
| **activity.ts** | Logs, export | Activity tracking |
| **knowledge.ts** | Search, categories | Knowledge base |
| **repos.ts** | Create, import | Git repository management |
| **flavors.ts** | List flavors | Container flavors |
| **resource-tiers.ts** | List tiers | Resource tier definitions |
| **addons.ts** | List addons | Container addons |
| **preferences.ts** | Get/set preferences | User preferences sync |
| **account.ts** | Account info, export | User account management |
| **docker.ts** | Health, prune | Docker system management |
| **acp.ts** | Multi-agent protocol | ACP Gateway integration |
| **cloudflare-webhook.ts** | Sandbox events | Cloudflare integration |
| **users.ts** | OpenCode config | User configuration |
| **health.ts** | Liveness/readiness | Health checks |
| **mcp-knowledge.ts** | MCP protocol | Knowledge base MCP |

### Database Schema (17 modules)

| Schema | Tables | Purpose |
|--------|--------|---------|
| **sandboxes.ts** | `sandboxes`, `sandboxPermissions` | Sandbox metadata and HITL permissions |
| **chat.ts** | `chatSessions`, `chatMessages` | Chat persistence |
| **workflows.ts** | `workflows`, `workflowExecutions`, `workflowSteps` | Workflow system |
| **agents.ts** | `agentSessions`, `agentRoutingLogs`, `agentMetrics` | Agent orchestration |
| **admin.ts** | `adminUsers`, `userResourceLimits`, `adminAuditLog` | Admin system |
| **auth.ts** | Better Auth tables | Authentication |
| **providers.ts** | `providers`, `providerCredentials`, `models` | LLM providers |
| **containers.ts** | `containerFlavors`, `containerAddons`, `resourceTiers` | Container config |
| **settings.ts** | `systemSettings`, `userSettings` | Settings storage |
| **activity.ts** | `activityLogs` | Activity tracking |
| **knowledge.ts** | `knowledgeEntries`, `knowledgeCategories` | Knowledge base |
| **onboarding.ts** | `onboardingSessions`, `onboardingProgress` | Onboarding flow |
| **preview-ports.ts** | `previewPorts` | Web preview ports |
| **cloudflare.ts** | `cloudflareSandboxes` | Cloudflare sandbox data |
| **agent-catalog.ts** | `agentCatalog`, `agentMarketplace` | Agent marketplace |
| **quick-tasks.ts** | `quickTaskTemplates` | Quick task templates |

### Services (20+)

| Service | Capability |
|---------|-----------|
| **sandbox-manager.ts** | Docker container lifecycle |
| **opencode-v2.ts** | OpenCode streaming client |
| **acp-gateway.ts** | Multi-agent orchestration |
| **agent-catalog-service.ts** | Agent discovery and marketplace |
| **orchestrator-service.ts** | Agent routing and selection |
| **git/index.ts** | Git operations (diff, log, commit) |
| **config/parser.ts** | agentpod.toml parsing |
| **docker-provider.ts** | Docker API provider |
| **cloudflare-provider.ts** | Cloudflare Workers provider |
| **preview/detector.ts** | Port detection |
| **knowledge-service.ts** | Knowledge base search |
| **opencode-sync.ts** | Background chat sync |
| **activity-archival.ts** | Activity log archival |
| **onboarding-service.ts** | Onboarding orchestration |
| **model-selection-service.ts** | Smart model selection |
| **image-resolver.ts** | Container image resolution |
| **github-copilot.ts** | GitHub Copilot OAuth |

---

## Frontend

### Pages/Routes (25)

| Route | Description |
|-------|-------------|
| `/` | Dashboard home |
| `/projects` | Sandbox list |
| `/projects/new` | Create sandbox |
| `/projects/[id]` | Sandbox overview |
| `/projects/[id]/chat` | Chat interface (React + assistant-ui) |
| `/projects/[id]/terminal` | Interactive terminal (xterm.js) |
| `/projects/[id]/files` | File browser with syntax highlighting |
| `/projects/[id]/preview` | Web app preview |
| `/projects/[id]/sync` | Git sync interface |
| `/projects/[id]/logs` | Container logs |
| `/projects/[id]/settings` | Sandbox settings |
| `/workflows` | Workflow list |
| `/workflows/new` | Create workflow |
| `/workflows/[id]` | Workflow editor |
| `/settings` | Global settings |
| `/admin` | Admin dashboard |
| `/admin/users` | User management |
| `/admin/agents` | Agent management |
| `/login` | Authentication |
| `/setup` | Initial setup |

### Svelte 5 Stores (15)

| Store | Purpose |
|-------|---------|
| **auth.svelte.ts** | Authentication state, Better Auth client |
| **sandboxes.svelte.ts** | Sandbox list, CRUD, filtering |
| **workflows.svelte.ts** | Workflow list, editor state |
| **settings.svelte.ts** | App theme, provider config |
| **connection.svelte.ts** | API connection status |
| **session-activity.svelte.ts** | Chat activity tracking |
| **terminals.svelte.ts** | Terminal session state |
| **git.svelte.ts** | Git status, operations |
| **onboarding.svelte.ts** | Onboarding progress |
| **preview.svelte.ts** | Web preview state |
| **quick-task.svelte.ts** | Quick task execution |
| **app-state.svelte.ts** | Global UI state |
| **session-status.svelte.ts** | Sandbox connection status |
| **unseen-completions.svelte.ts** | Notification tracking |
| **project-icons.svelte.ts** | Project icon state |

### Chat System

| Component | Purpose |
|-----------|---------|
| **adapter.ts** | Assistant-ui adapter for OpenCode |
| **message-converter.ts** | Message format conversion |
| **thread-converter.ts** | Thread data conversion |
| **sse-event-handler.ts** | Server-Sent Events streaming |
| **message-events.ts** | Message event processing |
| **useStreamingText.ts** | Streaming text rendering hook |

### Key Components

| Component | Purpose |
|-----------|---------|
| **WorkflowEditor.svelte** | Visual workflow builder |
| **Terminal.svelte** | xterm.js terminal |
| **PreviewFrame.svelte** | Web app preview iframe |
| **DiffViewer.svelte** | Git diff visualization |
| **agent-selector.svelte** | Agent selection UI |
| **provider-selector.svelte** | LLM provider selection |
| **model-selector.svelte** | Model selection |
| **flavor-selector.svelte** | Container flavor picker |
| **resource-tier-selector.svelte** | Resource tier selector |
| **theme-picker.svelte** | Theme selection |

---

## Tauri Backend

### Commands (9 modules)

| Module | Commands |
|--------|----------|
| **auth.rs** | login, logout, check_session, get_token |
| **sandboxes.rs** | list, get, create, delete, start, stop, restart, exec, logs, stats |
| **terminal.rs** | open_session, close_session, send_input, resize |
| **settings.rs** | get_settings, save_settings, list_providers, list_models |
| **connection.rs** | connect, disconnect, check_status, get_api_url |
| **docker.rs** | health_check, docker_health, system_info |
| **onboarding.rs** | get_session, create_session, start, skip |
| **voice.rs** | start_recording, stop_recording, get_transcript |

### Services

| Service | Capability |
|---------|-----------|
| **api.rs** | HTTP client wrapper |
| **auth.rs** | Credential storage, token refresh |
| **settings.rs** | Settings persistence |
| **storage.rs** | File storage abstraction |
| **voice/recorder.rs** | Audio capture |
| **voice/whisper.rs** | Speech-to-text |

---

## Container System

### Base Image

- **Ubuntu 24.04** base
- **Node.js 22** + **Bun** runtime
- **OpenCode CLI** pre-installed
- **ACP Gateway** for multi-agent support
- **Homepage** dashboard on port 80

### Language Flavors (7)

| Flavor | Languages | Size |
|--------|-----------|------|
| **bare** | Minimal (CLI tools only) | ~400MB |
| **js** | Node.js 22, Bun, Deno | ~800MB |
| **python** | Python 3.12, pip, uv, Jupyter | ~1.2GB |
| **go** | Go 1.22, gopls | ~900MB |
| **rust** | Rust stable, rustfmt, clippy | ~1.1GB |
| **fullstack** | Node.js + Python | ~1.8GB |
| **polyglot** | All languages | ~3GB |

---

## Feature Categories

### Project/Sandbox Management
- Create from scratch, GitHub import, or existing repos
- Container lifecycle (start/stop/restart)
- Resource tiers (starter/builder/creator/power)
- Container flavors (7 language options)
- Addon management
- Human-in-the-loop permissions

### AI/Chat Capabilities
- Real-time streaming chat with OpenCode
- Chat history persistence
- Multi-agent orchestration (ACP Gateway)
- Agent routing and selection
- 75+ LLM provider support
- Quick task execution
- Voice recording and transcription

### Development Tools
- Interactive terminal (full shell)
- File browser with syntax highlighting
- Git integration (diff, log, commit, push)
- Web app preview with port detection
- Console log capture
- Container logs viewer

### Workflow Automation
- Visual workflow builder
- Execution tracking
- Triggers: manual, webhook, schedule, event
- Nodes: trigger, action, condition, agent, switch
- Template marketplace
- Public sharing and forking

### Admin Features
- User management
- Role-based access (user, admin)
- Resource limits per user
- Audit logging
- System statistics
- Data export

### Theming
- 20+ built-in themes
- Modular color schemes
- Font pairings
- Persistent selection

### Production
- PostgreSQL backups
- Activity archival
- Chat history sync
- CI/CD integration
- Docker image building
- HTTPS with auto SSL

---

## Related Documents

- [Pending Work](./pending-work.md) - What remains to be done
- [Restructuring Plan](./00-restructuring-plan.md) - Documentation reorganization
