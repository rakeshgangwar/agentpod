# Phase 5: Tasks

## Implementation Status: ~95% Complete

Last updated: December 2024

---

## 0. Deferred from Phase 4 (Settings & Project Enhancements)

### 0.1 Settings Store & Commands
- [x] Create `src/lib/stores/settings.svelte.ts`
- [x] Create `src-tauri/src/commands/settings.rs`
- [x] Implement commands:
  - `get_settings()` - Get app settings
  - `save_settings(settings)` - Save settings
  - `get_providers()` - List LLM providers from API
  - `list_providers_with_models()` - Uses Models.dev API
- [x] Persist settings to local storage
- [x] Export/Import settings as JSON

### 0.2 Settings UI Enhancements
- [x] Update `src/routes/settings/+page.svelte`
- [x] Sections:
  - Connection (endpoint, status, reconnect)
  - LLM Providers (list, configure, set default)
  - Theme preference (light/dark/system)
  - Auto-refresh interval
  - In-app notifications toggle
  - System notifications toggle
  - OpenCode permissions (bash, write, edit, webfetch, mcp)
  - AGENTS.md editor
  - Custom agents/commands/tools/plugins
  - Export/Import settings
- [x] Disconnect button
- [x] Test connection button

### 0.3 Project Creation Enhancements
- [x] LLM provider selector in project creation form (`LlmProviderSelector` component)
- [x] Container tier selector (`TierSelector` component)
- [x] Sync options in GitHub import:
  - Enable sync toggle
  - Sync direction display

### 0.4 Project List Enhancements
- [ ] Pull-to-refresh functionality (NOT IMPLEMENTED)
- [x] Quick start/stop toggle on project cards
- [ ] Auto-refresh container status periodically (setting exists but not wired up)

### 0.5 File Browser Enhancements
- [ ] Copy path button in file viewer
- [ ] "Use in Chat" button to reference file

### 0.6 Chat Enhancements
- [ ] File reference picker (@mentions)
- [ ] Create `src/lib/components/FileReferencePicker.svelte`
- [ ] Trigger on @ in chat input
- [ ] Search/filter files
- [ ] Insert reference on select

---

## 1. OAuth Implementation

### 1.1 GitHub Copilot (Device Flow)
- [x] Implement OAuth commands in Rust (`init_oauth_flow`, `poll_oauth_flow`, `cancel_oauth_flow`)
- [x] Create device code display UI (`provider-config-modal.svelte`)
- [x] Handle polling and token receipt
- [x] Store token securely
- [x] Management API OAuth service (`management-api/src/services/oauth/github-copilot.ts`)
- [x] OAuth state persistence in database

### 1.2 Anthropic Claude Pro/Max (Redirect Flow)
- [ ] Implement `anthropic_initiate()` in Rust
- [ ] Configure deep link handling (Tauri)
- [ ] Implement `anthropic_exchange()` for code exchange
- [ ] Create browser redirect flow
- [ ] Handle callback and token storage
- [ ] Test end-to-end flow

### 1.3 Token Management
- [x] Store tokens in secure storage (Management API)
- [x] Send tokens to Management API for container injection
- [ ] Handle token refresh (if applicable)
- [ ] Handle token revocation

---

## 2. Provider Configuration UI

### 2.1 Providers List Screen
- [x] Provider configuration in Settings page
- [x] List all available providers with Models.dev integration
- [x] Show configured status
- [x] Indicate default provider

### 2.2 Provider Configuration Screen
- [x] Provider config modal (`provider-config-modal.svelte`)
- [x] API key input (for simple providers)
- [x] OAuth button (for OAuth providers)
- [x] Test connection (via API)
- [x] Set as default toggle

### 2.3 Per-Project Provider Override
- [x] Add provider selector to project creation
- [x] "Use default" option (null = use default)
- [x] Override with specific provider
- [x] Credentials injected to container via OPENCODE_AUTH_JSON

---

## 3. GitHub Sync

### 3.1 Sync Status UI
- [ ] Create sync tab in project detail
- [ ] Show last sync time
- [ ] Show commits ahead/behind
- [ ] Sync direction indicator

### 3.2 Push to GitHub
- [ ] Implement push via Management API
- [ ] Show push progress
- [ ] Handle success/failure
- [ ] Show pushed commits

### 3.3 Pull from GitHub
- [ ] Implement pull via Management API
- [ ] Show pull progress
- [ ] Handle merge conflicts (show error, suggest resolution)
- [ ] Show pulled commits

### 3.4 Conflict Handling
- [ ] Detect conflicts
- [ ] Show conflict UI
- [ ] Options: force push, pull and merge, cancel
- [ ] Guide user through resolution

---

## 4. Push Notifications

### 4.1 iOS Push Setup
- [ ] Configure APNs in Xcode
- [ ] Generate APNs key
- [ ] Set up push certificate/key on server

### 4.2 Android Push Setup
- [ ] Configure Firebase Cloud Messaging
- [ ] Add google-services.json
- [ ] Set up FCM on server

### 4.3 Tauri Notification Plugin
- [x] Install `tauri-plugin-notification`
- [x] Configure notification permissions
- [x] Implement local notification handling

### 4.4 Server-Side Push
- [ ] Create webhook endpoint in Management API
- [ ] OpenCode plugin to call webhook on `session.idle`
- [ ] Management API sends push notification
- [ ] Include deep link to session

### 4.5 Notification Handling
- [ ] Handle notification tap → open relevant session
- [ ] Badge count management
- [x] Notification preferences (enable/disable in settings)

---

## 5. Offline Support

### 5.1 Project Caching
- [ ] Cache project list locally
- [ ] Show cached data when offline
- [ ] Indicate stale data
- [ ] Sync when back online

### 5.2 Session Caching
- [ ] Cache recent sessions
- [ ] Show cached messages offline
- [ ] Queue prompts for send when online

### 5.3 Offline Detection
- [ ] Detect network state
- [ ] Show offline banner
- [ ] Disable actions that require network
- [ ] Auto-retry when online

### 5.4 Local Storage
- [ ] Use SQLite or AsyncStorage
- [ ] Define cache schema
- [ ] Implement cache invalidation
- [ ] Manage storage limits

---

## 6. Settings Enhancements (Extended)

### 6.1 Notification Settings
- [x] Enable/disable in-app notifications
- [x] Enable/disable system notifications
- [ ] Notification sound toggle
- [ ] Quiet hours (future)

### 6.2 Connection Settings
- [x] Show current endpoint
- [x] Connection status indicator
- [x] Reconnect to different server
- [x] Test connection button

---

## 7. Activity Feed

### 7.1 Activity Tab
- [ ] Create `src/routes/activity/+page.svelte`
- [ ] List recent sessions across all projects
- [ ] Show status (running, complete, error)
- [ ] Tap to open session

### 7.2 Activity Indicators
- [ ] Badge on tab for active sessions
- [ ] Real-time updates via SSE
- [ ] Clear indicators when viewed

---

## 8. Error Handling & Recovery

### 8.1 Global Error Handler
- [x] Catch unhandled errors (via Tauri error types)
- [x] Show user-friendly error messages
- [x] Offer retry options

### 8.2 Connection Recovery
- [x] Auto-reconnect on connection loss (SSE reconnection logic)
- [x] Exponential backoff
- [x] Manual reconnect option

### 8.3 Session Recovery
- [x] Resume SSE stream after disconnect
- [x] Fetch missed messages
- [ ] Handle stale state

---

## 9. Testing

- [ ] Test OAuth flows on real device
- [ ] Test push notifications end-to-end
- [ ] Test offline mode
- [ ] Test GitHub sync
- [ ] Test error scenarios
- [x] Test settings persistence

---

## 10. Additional Components (Deferred from Phase 4)

### 10.1 Install Remaining shadcn Components
- [x] Dialog - for modals and confirmations
- [x] DropdownMenu - session selection, actions
- [x] Toast/Sonner - notifications

### 10.2 Container Management UI
- [x] Start button (when stopped)
- [x] Stop button (when running)
- [x] Deploy button with confirmation dialog
- [x] Force deploy option
- [x] Loading state during operation
- [x] Show error state if container crashed
- [ ] "Restart" button in UI (function exists in store)

---

## 11. Container Tiers (NEW - Implemented)

### 11.1 Database & Models
- [x] Create `container_tiers` table in schema.sql
- [x] Seed 4 tiers: lite, standard, pro, desktop
- [x] Create `management-api/src/models/container-tier.ts`
- [x] Define `ContainerTier` interface
- [x] Implement CRUD operations

### 11.2 API Routes
- [x] Create `management-api/src/routes/container-tiers.ts`
- [x] GET /api/container-tiers - List all tiers
- [x] GET /api/container-tiers/:id - Get tier by ID
- [x] GET /api/container-tiers/default - Get default tier

### 11.3 Resource Limits
- [x] CPU limit per tier (1, 2, 4, 8 cores)
- [x] Memory limit per tier (2g, 4g, 8g, 16g)
- [x] Memory reservation per tier
- [x] Storage allocation per tier (20, 30, 50, 75 GB)
- [x] `getResourceLimitsForTier()` helper function
- [x] Apply limits via Coolify API on project creation

### 11.4 Desktop Tier with VNC
- [x] `has_desktop_access` flag on tier
- [x] `image_type` field: 'cli' or 'desktop'
- [x] `getImageNameForTier()` helper function
- [x] `getExposedPortsForTier()` - returns "4096,6080" for desktop
- [x] Separate VNC domain generation (`vnc-{slug}.domain.com`)
- [x] `vnc_url` column in projects table
- [x] `vncUrl` field in Project interface and API response
- [x] Configure Coolify with both domains mapped to their ports

### 11.5 Mobile App Integration
- [x] Create `TierSelector` component (`src/lib/components/tier-selector.svelte`)
- [x] Integrate tier selector in project creation form
- [x] Display tier info (resources, features)
- [x] Pass `containerTierId` to API on project creation

---

## Summary

| Category | Completed | Total | Percentage |
|----------|-----------|-------|------------|
| Settings Store & UI | 18 | 18 | 100% |
| Project Creation | 4 | 4 | 100% |
| Project List | 1 | 3 | 33% |
| File Browser | 0 | 2 | 0% |
| Chat Enhancements | 0 | 5 | 0% |
| OAuth | 7 | 12 | 58% |
| Provider UI | 8 | 8 | 100% |
| GitHub Sync | 0 | 12 | 0% |
| Push Notifications | 3 | 12 | 25% |
| Offline Support | 0 | 12 | 0% |
| Container Management | 7 | 8 | 88% |
| Container Tiers | 17 | 17 | 100% |
| Error Handling | 6 | 8 | 75% |

**Overall: ~60% of all Phase 5 tasks complete**

### Priority for Next Session:
1. Pull-to-refresh on project list
2. Auto-refresh container status using configured interval
3. Restart button in project detail UI
4. File reference picker for chat
5. Copy path button in file viewer

---

## Notes

- OAuth is implemented for GitHub Copilot device flow; Anthropic redirect flow pending
- Push notification setup varies by platform - local notifications work, remote push pending
- Offline support can be progressive - start simple
- Container tiers fully working with resource limits and VNC support for desktop tier
