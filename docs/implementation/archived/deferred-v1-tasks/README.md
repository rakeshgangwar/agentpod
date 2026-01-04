# Deferred Tasks from v1

This document consolidates all incomplete and deferred tasks from the v1 implementation phases. These tasks will be addressed alongside or after the v2 ACP integration.

## Priority Levels

| Priority | Description |
|----------|-------------|
| **P1** | Critical - Required for core functionality |
| **P2** | Important - Significantly improves UX |
| **P3** | Nice-to-have - Polish and enhancements |

---

## From Phase 1: Infrastructure

### Deferred
- [ ] **P3** Set up Tailscale ACLs for security
- [ ] **P3** Test connection from mobile device with Tailscale app
- [ ] **P3** Delete test resources (test-repo)

---

## From Phase 2: Management API

### Deferred
- [ ] **P2** Sync routes implementation:
  - `POST /api/projects/:id/sync` - Sync with GitHub
  - `GET /api/projects/:id/sync/status` - Get sync status
  - `POST /api/projects/:id/sync/config` - Configure sync settings
- [ ] **P3** Unit tests for service clients (with mocks)

---

## From Phase 3: Mobile Foundation

### Deferred
- [ ] **P2** Settings store and commands (`settings.svelte.ts`, `settings.rs`)
- [ ] **P2** OAuth integration skeleton (tauri-plugin-oauth)
- [ ] **P3** Dark mode toggle with proper persistence
- [ ] **P3** Rust unit/integration tests
- [ ] **P3** Mobile builds (iOS/Android)

---

## From Phase 4: Mobile Core

### Deferred
- [ ] **P2** Additional shadcn components:
  - Dialog
  - Tabs
  - ScrollArea
  - Separator
  - Avatar
  - DropdownMenu
  - Toast/Sonner
- [ ] **P2** File reference picker (@mentions in chat)
- [ ] **P2** Auto-refresh container status periodically
- [ ] **P2** Container management UI (Start/Stop/Restart buttons)
- [ ] **P3** Pull-to-refresh on project list
- [ ] **P3** Copy path button in file viewer
- [ ] **P3** "Use in Chat" button to reference file
- [ ] **P3** Bottom navigation component

---

## From Phase 5: Mobile Advanced

### Incomplete OAuth
- [ ] **P1** Anthropic Claude Pro/Max redirect flow:
  - `anthropic_initiate()` in Rust
  - Deep link handling (Tauri)
  - `anthropic_exchange()` for code exchange
  - Browser redirect flow
  - Callback and token storage
- [ ] **P2** Token refresh handling
- [ ] **P2** Token revocation handling

### GitHub Sync (Not Started)
- [ ] **P2** Sync status UI in project detail
- [ ] **P2** Push to GitHub implementation
- [ ] **P2** Pull from GitHub implementation
- [ ] **P2** Conflict detection and handling UI

### Push Notifications (Partial)
- [ ] **P2** iOS APNs setup
- [ ] **P2** Android FCM setup
- [ ] **P2** Server-side push (webhook in Management API)
- [ ] **P3** Notification tap handling (deep links)
- [ ] **P3** Badge count management

### Offline Support (Not Started)
- [ ] **P2** Project list caching
- [ ] **P2** Session/message caching
- [ ] **P2** Offline detection and banner
- [ ] **P3** Queue prompts for send when online
- [ ] **P3** Cache invalidation strategy

### Activity Feed (Not Started)
- [ ] **P3** Activity tab (`/activity` route)
- [ ] **P3** List recent sessions across projects
- [ ] **P3** Real-time updates via SSE
- [ ] **P3** Badge indicators

### Container Management
- [ ] **P2** Restart button in project detail UI
- [ ] **P3** "View Logs" option

---

## From Phase 6: Polish

### Navigation & Layout
- [ ] **P2** Bottom navigation component
- [ ] **P2** Loading skeletons for lists
- [ ] **P3** Page transitions
- [ ] **P3** Component animations

### Performance
- [ ] **P2** Virtualize long lists (chat messages, file tree)
- [ ] **P3** Bundle size analysis and optimization
- [ ] **P3** Request deduplication
- [ ] **P3** Memory profiling

### Accessibility
- [ ] **P2** ARIA labels on interactive elements
- [ ] **P2** Keyboard navigation support
- [ ] **P3** Motion preference respect
- [ ] **P3** Touch target sizing (44x44pt)

### Onboarding
- [ ] **P3** Welcome screen with feature highlights
- [ ] **P3** Contextual tooltips
- [ ] **P3** In-app help section

### Testing
- [ ] **P2** Unit tests for utility functions
- [ ] **P2** E2E tests for critical paths
- [ ] **P3** Performance testing on low-end devices

### Documentation
- [ ] **P2** Code documentation (JSDoc/RustDoc)
- [ ] **P2** User documentation
- [ ] **P3** Architecture overview

### App Store Preparation
- [ ] **P3** App icons (all sizes)
- [ ] **P3** Screenshots
- [ ] **P3** App description
- [ ] **P3** Privacy policy

---

## Summary by Priority

| Priority | Count | Notes |
|----------|-------|-------|
| P1 | 1 | Anthropic OAuth (can be done with ACP auth) |
| P2 | 25 | Core features and important UX |
| P3 | 25 | Polish, optimization, documentation |
| **Total** | **51** | |

---

## Recommendations

### Address with v2 ACP Integration

These tasks naturally fit into the ACP work:
- Anthropic OAuth → Part of ACP agent auth
- Token refresh/revocation → Part of ACP auth flow
- Container management UI → Needed for agent control

### Address in Parallel

These can be worked on alongside ACP:
- GitHub Sync → Independent feature
- Offline support → Independent feature
- Performance optimization → Ongoing

### Address After v2

These are polish items for later:
- Activity feed
- Onboarding
- App store preparation
- Full accessibility audit
