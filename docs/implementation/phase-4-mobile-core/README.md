# Phase 4: Mobile App Core Features

Implement the main user-facing features: project management, chat interface, file browser, and real-time updates.

## Current Status: In Progress (90% Complete)

**Last Updated:** 2025-12-06

### Completed
- Routing structure with SvelteKit
- Project list and detail views
- OpenCode proxy endpoints in Management API (using official SDK)
- SSE streaming infrastructure (Rust backend + frontend adapter)
- Chat interface with assistant-ui React integration
- Rust integration tests for API client
- Session management (create, list, get)
- Message sending via SDK
- **File browser with lazy-loading** - Folders load contents on expand
- **Shiki syntax highlighting** - VS Code-quality highlighting for 30+ languages
- **Markdown rendering with marked** - Full GFM support with code block highlighting
- File viewer with Raw/Preview toggle for markdown files

### In Progress
- Chat UI message rendering (SSE events received but display issues)

### Remaining
- Settings store and commands
- OAuth integration skeleton

### Blockers
- Intermittent 502 Bad Gateway errors when proxying to OpenCode containers (less frequent)
- Chat adapter correctly parses SSE events but UI not rendering responses

## Architecture Overview

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│   Desktop App   │────▶│  Management API  │────▶│ OpenCode Container  │
│   (Tauri)       │     │  (Proxy Layer)   │     │ (Per Project)       │
└─────────────────┘     └──────────────────┘     └─────────────────────┘
```

All OpenCode communication is proxied through the Management API, enabling:
- Session metadata storage
- Unified authentication
- Container endpoint routing

**Key Change:** Management API now uses the official `@opencode-ai/sdk` instead of raw HTTP proxying.

## Objectives

1. **Routing refactor** - Proper SvelteKit routing structure
2. **Project management UI** - List, create, detail views
3. **OpenCode chat interface** - With streaming responses
4. **File browser** - Browse and view with syntax highlighting
5. **Real-time updates** - Via SSE streaming
6. **Deferred Phase 3 items** - Settings, OAuth skeleton, components

## Prerequisites

- Phase 2 complete (Management API running)
- Phase 3 complete (Desktop foundation working)

## Duration

**Estimated:** 5-7 days
**Actual:** In progress (started ~5 days ago)

## Priority Order

1. ~~Routing structure refactor~~ ✅
2. ~~Project detail view with tabs~~ ✅
3. Chat interface (core feature) - 80% complete
4. ~~File browser~~ ✅ (with lazy-loading, syntax highlighting, markdown preview)
5. ~~SSE streaming~~ ✅ (infrastructure complete)
6. Settings & deferred items - Partial

## Deliverables

- [x] Proper SvelteKit routing (`/projects`, `/projects/[id]/chat`, etc.)
- [x] Project list with status indicators
- [x] Project detail with tabs (Chat, Files, Sync)
- [ ] Chat interface with real-time streaming (UI rendering issues)
- [x] File browser with Shiki syntax highlighting
- [x] Markdown rendering with marked
- [x] SSE event streaming from OpenCode (backend complete)
- [ ] Settings store and OAuth skeleton
- [x] Additional shadcn components

## Technology Choices

| Feature | Choice | Reason |
|---------|--------|--------|
| Syntax Highlighting | **Shiki** | VS Code-quality, markdown integration |
| Markdown Rendering | **marked** | Lightweight, extensible |
| SSE Client | **reqwest + manual parsing** | No external crate, full control |
| Notifications | **sonner** | Svelte-compatible toasts |
| Chat UI | **assistant-ui** | React-based chat components with Svelte wrapper |
| OpenCode SDK | **@opencode-ai/sdk** | Official SDK for type-safe API calls |

## Success Criteria

1. ~~Can navigate between projects, chat, files, settings via URLs~~ ✅
2. ~~Can create a project from the app~~ ✅
3. Can send prompts and see streamed responses in real-time - Partially working
4. ~~Can browse files and view with syntax highlighting~~ ✅
5. ~~SSE events update UI automatically~~ ✅ (events flow, rendering issues)
6. Settings are persisted and restorable - Not started

## Known Issues

1. **Intermittent 502 Errors**: The Management API sometimes returns 502 Bad Gateway when proxying requests to OpenCode containers. This appears to be related to connection pooling or container readiness.

2. **Chat UI Not Rendering**: The SSE events are correctly parsed in the adapter but the assistant-ui components are not rendering the responses. Debug logging has been added.

## Files in This Phase

- [tasks.md](./tasks.md) - Detailed task breakdown with priority order
- [technical-notes.md](./technical-notes.md) - Architecture decisions, component examples
- [opencode-api-reference.md](./opencode-api-reference.md) - OpenCode HTTP API documentation
