# Phase 5: Mobile App Advanced Features

Implement OAuth flows, GitHub sync, push notifications, offline capabilities, container tiers, and complete deferred items from Phase 4.

## Status: ~60% Complete

Last updated: December 2024

## Objectives

1. **Deferred from Phase 4**: Settings store, project enhancements, file reference picker
2. Complete OAuth proxy implementation (GitHub Copilot, Claude Pro/Max)
3. LLM provider configuration UI
4. GitHub sync functionality
5. Push notifications for task completion
6. Offline mode and session caching
7. Container management UI (start/stop/restart)
8. **NEW**: Container tiers with resource limits and desktop VNC support

## Prerequisites

- Phase 4 complete (Core features working)

## Duration

**Estimated:** 5-7 days

## Deliverables

### Completed

#### Settings & Configuration
- [x] Settings store with persistence (`settings.svelte.ts`, `settings.rs`)
- [x] Full settings UI with all sections
- [x] Theme preference (light/dark/system)
- [x] Connection management with test button
- [x] OpenCode permissions editor
- [x] AGENTS.md editor
- [x] Custom agents/commands/tools/plugins management
- [x] Export/Import settings as JSON

#### LLM Provider Management
- [x] LLM provider selector component
- [x] Provider configuration modal with API key input
- [x] OAuth device flow for GitHub Copilot
- [x] Set default provider
- [x] Provider selector in project creation
- [x] Models.dev integration for provider/model data

#### Container Tiers (NEW)
- [x] Four container tiers: Lite, Standard, Pro, Desktop
- [x] Resource limits per tier (CPU, memory, storage)
- [x] Desktop tier with VNC/noVNC support
- [x] Separate VNC domain for desktop containers
- [x] Tier selector in project creation
- [x] API routes for tier management

#### Container Management
- [x] Start/Stop buttons on project cards
- [x] Start/Stop/Deploy buttons in project detail
- [x] Deploy confirmation dialog with force option
- [x] Container status display

#### Error Handling
- [x] User-friendly error messages
- [x] Connection recovery with reconnection logic
- [x] SSE stream resumption

### In Progress / Partial

#### OAuth Implementation
- [x] GitHub Copilot device flow
- [ ] Anthropic Claude redirect flow
- [ ] Token refresh handling

#### Notifications
- [x] Local notifications via Tauri plugin
- [x] Notification preferences in settings
- [ ] Remote push notifications (iOS/Android)

### Not Started

#### Project List Enhancements
- [ ] Pull-to-refresh functionality
- [ ] Auto-refresh container status

#### File Browser & Chat
- [ ] Copy path button in file viewer
- [ ] "Use in Chat" file reference
- [ ] File reference picker (@mentions)

#### GitHub Sync
- [ ] Sync status UI
- [ ] Push to GitHub
- [ ] Pull from GitHub
- [ ] Conflict handling

#### Offline Support
- [ ] Project caching
- [ ] Session caching
- [ ] Offline detection
- [ ] Local storage with SQLite

#### Activity Feed
- [ ] Activity tab with recent sessions
- [ ] Real-time activity indicators

## Success Criteria

1. ✅ Settings persist across app restarts
2. ✅ Can authenticate with GitHub Copilot via device flow
3. ✅ Can start/stop containers from the app
4. ✅ Can select container tier on project creation
5. ✅ Desktop containers have VNC access via separate domain
6. [ ] Can sync project changes to/from GitHub
7. [ ] Receive push notification when background task completes
8. [ ] Can view cached projects/sessions offline

## Key Implementation Details

### Container Tiers

| Tier | CPU | Memory | Storage | Image | VNC |
|------|-----|--------|---------|-------|-----|
| Lite | 1 | 2GB | 20GB | CLI | No |
| Standard | 2 | 4GB | 30GB | CLI | No |
| Pro | 4 | 8GB | 50GB | CLI | No |
| Desktop | 8 | 16GB | 75GB | Desktop | Yes |

### Desktop Tier URLs

Desktop containers expose two services:
- **OpenCode API**: `https://opencode-{slug}.domain.com` (port 4096)
- **noVNC Desktop**: `https://vnc-{slug}.domain.com/vnc.html` (port 6080)

The `vncUrl` field is included in the project API response for mobile app integration.

## Files in This Phase

- [tasks.md](./tasks.md) - Detailed task breakdown with checkboxes
- [technical-notes.md](./technical-notes.md) - OAuth, push, offline, container tier implementation
- [coolify-api-reference.md](./coolify-api-reference.md) - Verified Coolify API endpoints
