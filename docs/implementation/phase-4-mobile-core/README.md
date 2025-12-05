# Phase 4: Mobile App Core Features

Implement the main user-facing features: project management, chat interface, file browser, and real-time updates.

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

## Priority Order

1. Routing structure refactor
2. Project detail view with tabs
3. Chat interface (core feature)
4. File browser
5. SSE streaming
6. Settings & deferred items

## Deliverables

- [ ] Proper SvelteKit routing (`/projects`, `/projects/[id]/chat`, etc.)
- [ ] Project list with status indicators
- [ ] Project detail with tabs (Chat, Files, Sync)
- [ ] Chat interface with real-time streaming
- [ ] File browser with Shiki syntax highlighting
- [ ] SSE event streaming from OpenCode
- [ ] Settings store and OAuth skeleton
- [ ] Additional shadcn components

## Technology Choices

| Feature | Choice | Reason |
|---------|--------|--------|
| Syntax Highlighting | **Shiki** | VS Code-quality, markdown integration |
| Markdown Rendering | **marked** | Lightweight, extensible |
| SSE Client | **reqwest + manual parsing** | No external crate, full control |
| Notifications | **sonner** | Svelte-compatible toasts |

## Success Criteria

1. Can navigate between projects, chat, files, settings via URLs
2. Can create a project from the app
3. Can send prompts and see streamed responses in real-time
4. Can browse files and view with syntax highlighting
5. SSE events update UI automatically
6. Settings are persisted and restorable

## Files in This Phase

- [tasks.md](./tasks.md) - Detailed task breakdown with priority order
- [technical-notes.md](./technical-notes.md) - Architecture decisions, component examples
- [opencode-api-reference.md](./opencode-api-reference.md) - OpenCode HTTP API documentation
