# Phase 4: Mobile App Core Features

Implement the main user-facing features: project management, chat interface, file browser, and real-time updates.

## Current Status: In Progress (95% Complete)

**Last Updated:** 2025-12-06

### Completed
- Routing structure with SvelteKit
- Project list and detail views
- **Project creation flow** - Both "From Scratch" and "Import from GitHub" working
- OpenCode proxy endpoints in Management API (using official SDK)
- SSE streaming infrastructure (Rust backend + frontend adapter)
- Chat interface with assistant-ui React integration
- **Tool call display** - Shows during streaming with status indicators
- Rust integration tests for API client
- Session management (create, list, get)
- Message sending via SDK
- **File browser with lazy-loading** - Folders load contents on expand
- **Shiki syntax highlighting** - VS Code-quality highlighting for 30+ languages
- **Markdown rendering with marked** - Full GFM support with code block highlighting
- File viewer with Raw/Preview toggle for markdown files

### In Progress
- None - core features complete

### Remaining (Nice-to-haves / Polish)
- Settings store and commands
- OAuth integration skeleton
- Pull-to-refresh on project list
- Quick start/stop toggle on project cards
- File reference picker (@mentions in chat)
- Copy path button in file viewer
- Auto-refresh container status
- Bottom navigation component
- Page transitions and animations
- Skeleton loaders

### Blockers
- None currently

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
3. ~~Chat interface (core feature)~~ ✅ - with tool call streaming
4. ~~File browser~~ ✅ (with lazy-loading, syntax highlighting, markdown preview)
5. ~~SSE streaming~~ ✅ (infrastructure complete, tool calls display)
6. Settings & deferred items - Partial (deferred to Phase 5)

## Deliverables

- [x] Proper SvelteKit routing (`/projects`, `/projects/[id]/chat`, etc.)
- [x] Project list with status indicators
- [x] Project creation (from scratch and GitHub import)
- [x] Project detail with tabs (Chat, Files, Sync)
- [x] Chat interface with real-time streaming (tool calls and text)
- [x] File browser with Shiki syntax highlighting
- [x] Markdown rendering with marked
- [x] SSE event streaming from OpenCode
- [ ] Settings store and OAuth skeleton (deferred to Phase 5)
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
2. ~~Can create a project from the app (both scratch and GitHub import)~~ ✅
3. ~~Can send prompts and see streamed responses in real-time~~ ✅
4. ~~Can browse files and view with syntax highlighting~~ ✅
5. ~~SSE events update UI automatically~~ ✅
6. Settings are persisted and restorable - Deferred to Phase 5

## Known Issues

1. **Resolved**: Tool calls not showing during streaming - Fixed by handling OpenCode's `type: "tool"` format
2. **Resolved**: Chat UI not rendering - Fixed adapter to properly yield tool calls and text

## Files in This Phase

- [tasks.md](./tasks.md) - Detailed task breakdown with priority order
- [technical-notes.md](./technical-notes.md) - Architecture decisions, component examples
- [opencode-api-reference.md](./opencode-api-reference.md) - OpenCode HTTP API documentation
