# Pending Work

> **Last Updated:** January 4, 2026  
> **Total Items:** 106+ tasks  
> **Source:** Consolidated from v1/v2 documentation

This document consolidates all pending, incomplete, and deferred tasks extracted from the v1 and v2 implementation documentation.

---

## Priority Levels

| Priority | Description | Count |
|----------|-------------|-------|
| **P1** | Critical - Required for core functionality | 8 |
| **P2** | Important - Significantly improves UX | 54 |
| **P3** | Nice-to-have - Polish and enhancements | 44+ |

---

## P1: Critical Tasks

### Anthropic OAuth Integration

Source: `docs/v2/deferred-v1-tasks/README.md`

- [ ] **P1** `anthropic_initiate()` command in Rust
- [ ] **P1** Deep link handling in Tauri
- [ ] **P1** `anthropic_exchange()` for code exchange
- [ ] **P1** Browser redirect flow implementation
- [ ] **P1** Callback handling and token storage

---

## P2: Important Tasks

### ACP Frontend Integration (Phase 3)

Source: `docs/v2/phase-3-frontend/tasks.md`

#### API Client Functions
- [ ] **P2** `listAgents(projectId)` function
- [ ] **P2** `getAgentStatus(projectId, agentId)` function
- [ ] **P2** `spawnAgent(projectId, agentId)` function
- [ ] **P2** `stopAgent(projectId, agentId)` function
- [ ] **P2** `startAuth(projectId, agentId)` function
- [ ] **P2** `getAuthStatus(projectId, agentId)` function
- [ ] **P2** `createSession(projectId, agentId)` function
- [ ] **P2** `sendPrompt(projectId, sessionId, text)` function
- [ ] **P2** `cancelSession(projectId, sessionId)` function
- [ ] **P2** `respondToPermission(projectId, permissionId, response)` function

#### Type Definitions
- [ ] **P2** Define `Agent` interface
- [ ] **P2** Define `AgentStatus` type
- [ ] **P2** Define `AcpSession` interface
- [ ] **P2** Define `SessionUpdate` interface
- [ ] **P2** Define `PermissionRequest` interface

#### Agents Store
- [ ] **P2** Create `agents.svelte.ts` store with Svelte 5 runes
- [ ] **P2** Implement `fetchAgents(projectId)` function
- [ ] **P2** Implement `selectAgent(agentId)` function
- [ ] **P2** Implement `getAuthStatus(agentId)` function
- [ ] **P2** Implement `authenticate(agentId)` function
- [ ] **P2** Track ACP session IDs in chat store

#### Agent Selector Component
- [ ] **P2** Create `agent-selector.svelte` component (enhanced)
- [ ] **P2** Display agents in dropdown/grid with icons
- [ ] **P2** Show authentication status indicators
- [ ] **P2** Emit change events on selection

#### Auth & Permission Modals
- [ ] **P2** Create `agent-auth-modal.svelte` component
- [ ] **P2** Support device flow (code + URL display)
- [ ] **P2** Support OAuth redirect (browser opening)
- [ ] **P2** Show QR code for mobile
- [ ] **P2** Create `permission-modal.svelte` component
- [ ] **P2** Handle Once/Always/Deny permission buttons

#### ACP Chat Adapter
- [ ] **P2** Implement `AcpChatAdapter` class
- [ ] **P2** Create `createSession()` method
- [ ] **P2** Create `sendMessage(text)` method
- [ ] **P2** Create `cancel()` method
- [ ] **P2** Subscribe to SSE events and emit callbacks
- [ ] **P2** Create adapter factory for agent selection

#### Tauri ACP Commands
- [ ] **P2** Create `src-tauri/src/commands/acp.rs` module
- [ ] **P2** Implement `acp_list_agents(project_id)` command
- [ ] **P2** Implement `acp_get_agent_status()` command
- [ ] **P2** Implement `acp_spawn_agent()` command
- [ ] **P2** Implement `acp_stop_agent()` command
- [ ] **P2** Implement `acp_start_auth()` command
- [ ] **P2** Implement `acp_create_session()` command
- [ ] **P2** Implement `acp_send_prompt()` command
- [ ] **P2** Implement `acp_subscribe_events()` with SSE parsing
- [ ] **P2** Implement `acp_respond_permission()` command

#### UI Updates
- [ ] **P2** Add Agent Selector to project creation form
- [ ] **P2** Add Agent Selector to project settings
- [ ] **P2** Add Agent Selector to chat header
- [ ] **P2** Show agent icon per session in session list
- [ ] **P2** Implement agent switching with session confirmation

---

### Migration from OpenCode SDK to ACP (Phase 4)

Source: `docs/v2/phase-4-migration/README.md`

- [ ] **P2** Document current OpenCode SDK behavior
- [ ] **P2** Create comprehensive test suite for both paths
- [ ] **P2** Set up performance benchmarks
- [ ] **P2** Add feature flag infrastructure
- [ ] **P2** Update adapter factory with `useAcpForOpencode` flag
- [ ] **P2** Add metrics/logging for behavior comparison
- [ ] **P2** Create migration scripts for existing sessions
- [ ] **P2** Gradual feature flag rollout

---

### GitHub Sync

Source: `docs/v2/deferred-v1-tasks/README.md`

- [ ] **P2** `POST /api/projects/:id/sync` - Sync with GitHub
- [ ] **P2** `GET /api/projects/:id/sync/status` - Get sync status
- [ ] **P2** `POST /api/projects/:id/sync/config` - Configure sync settings
- [ ] **P2** Sync status UI in project detail
- [ ] **P2** Push to GitHub implementation
- [ ] **P2** Pull from GitHub implementation
- [ ] **P2** Conflict detection and handling UI

---

### Push Notifications

Source: `docs/v2/deferred-v1-tasks/README.md`

- [ ] **P2** iOS APNs setup
- [ ] **P2** Android FCM setup
- [ ] **P2** Server-side push (webhook in Management API)
- [ ] **P2** Token refresh handling
- [ ] **P2** Token revocation handling

---

### Offline Support

Source: `docs/v2/deferred-v1-tasks/README.md`

- [ ] **P2** Project list caching
- [ ] **P2** Session/message caching
- [ ] **P2** Offline detection and banner

---

### UI/UX Improvements

Source: `docs/v2/deferred-v1-tasks/README.md`

- [ ] **P2** File reference picker (@mentions in chat)
- [ ] **P2** Auto-refresh container status periodically
- [ ] **P2** Container management UI (Start/Stop/Restart buttons)
- [ ] **P2** Bottom navigation component
- [ ] **P2** Loading skeletons for lists
- [ ] **P2** Virtualize long lists (chat messages, file tree)

---

### Accessibility

Source: `docs/v2/deferred-v1-tasks/README.md`

- [ ] **P2** ARIA labels on interactive elements
- [ ] **P2** Keyboard navigation support

---

### Testing

Source: `docs/v2/deferred-v1-tasks/README.md`

- [ ] **P2** Unit tests for utility functions
- [ ] **P2** E2E tests for critical paths

---

### Documentation

Source: `docs/v2/deferred-v1-tasks/README.md`

- [ ] **P2** Code documentation (JSDoc/RustDoc)
- [ ] **P2** User documentation

---

## P3: Nice-to-Have Tasks

### Infrastructure

- [ ] **P3** Set up Tailscale ACLs for security
- [ ] **P3** Test connection from mobile device with Tailscale app
- [ ] **P3** Delete test resources (test-repo)
- [ ] **P3** Unit tests for service clients (with mocks)

---

### Mobile Foundation

- [ ] **P3** Dark mode toggle with proper persistence
- [ ] **P3** Rust unit/integration tests
- [ ] **P3** Mobile builds (iOS/Android)

---

### UI Components

- [ ] **P3** Pull-to-refresh on project list
- [ ] **P3** Copy path button in file viewer
- [ ] **P3** "Use in Chat" button to reference file
- [ ] **P3** Page transitions
- [ ] **P3** Component animations

---

### Push Notifications (Extended)

- [ ] **P3** Notification tap handling (deep links)
- [ ] **P3** Badge count management

---

### Offline Support (Extended)

- [ ] **P3** Queue prompts for send when online
- [ ] **P3** Cache invalidation strategy

---

### Activity Feed

- [ ] **P3** Activity tab (`/activity` route)
- [ ] **P3** List recent sessions across projects
- [ ] **P3** Real-time updates via SSE
- [ ] **P3** Badge indicators

---

### Container Management

- [ ] **P3** "View Logs" option in project detail

---

### Performance

- [ ] **P3** Bundle size analysis and optimization
- [ ] **P3** Request deduplication
- [ ] **P3** Memory profiling

---

### Accessibility (Extended)

- [ ] **P3** Motion preference respect
- [ ] **P3** Touch target sizing (44x44pt)

---

### Onboarding

- [ ] **P3** Welcome screen with feature highlights
- [ ] **P3** Contextual tooltips
- [ ] **P3** In-app help section

---

### Testing (Extended)

- [ ] **P3** Performance testing on low-end devices

---

### Documentation (Extended)

- [ ] **P3** Architecture overview

---

### App Store Preparation

- [ ] **P3** App icons (all sizes)
- [ ] **P3** Screenshots
- [ ] **P3** App description
- [ ] **P3** Privacy policy

---

## Implementation Roadmap

### Recommended Priority Order

**Phase A: ACP Integration (4-6 weeks)**
1. Phase 3 Frontend ACP Support (1-2 weeks)
2. Phase 4 Migration (1 week)
3. Anthropic OAuth (1 week)

**Phase B: Core Features (2-3 weeks)**
1. GitHub Sync (1 week)
2. Push Notifications Infrastructure (1 week)
3. Container Management UI polish (3 days)

**Phase C: Polish & Enhancement (2-4 weeks)**
1. Offline Support (1 week)
2. Activity Feed (1 week)
3. UI Polish (virtualization, skeletons, transitions) (1-2 weeks)
4. Accessibility improvements (1 week)

**Phase D: App Store Preparation (1 week)**
1. Mobile builds (iOS/Android)
2. App store assets
3. Privacy policy & legal

---

## Dependencies

- **Phase 3 (Frontend)** blocks Phase 4 (Migration)
- **Anthropic OAuth** should be done with or before Phase 3
- **GitHub Sync** is independent - can start anytime
- **Offline Support** depends on Phase 4 completion

---

## Risk Areas

1. **ACP Integration** - First v2 frontend work; needs extensive testing
2. **Migration** - Must be gradual with feature flags
3. **Mobile Builds** - iOS/Android require certificates not yet set up
4. **Performance** - Long list virtualization is complex

---

## Related Documents

- [Current Features](./current-features.md) - What's already implemented
- [Restructuring Plan](./00-restructuring-plan.md) - Documentation reorganization
