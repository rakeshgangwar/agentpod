# Phase 5: Tasks

## 0. Deferred from Phase 4 (Settings & Project Enhancements)

### 0.1 Settings Store & Commands
- [ ] Create `src/lib/stores/settings.svelte.ts`
- [ ] Create `src-tauri/src/commands/settings.rs`
- [ ] Implement commands:
  - `get_settings()` - Get app settings
  - `save_settings(settings)` - Save settings
  - `get_providers()` - List LLM providers from API
- [ ] Persist settings to local storage

### 0.2 Settings UI Enhancements
- [ ] Update `src/routes/settings/+page.svelte`
- [ ] Sections:
  - Connection (endpoint, reconnect)
  - LLM Providers (list, configure)
  - Theme preference (light/dark/system)
  - About (version, links)
- [ ] Disconnect button
- [ ] Test connection button

### 0.3 Project Creation Enhancements
- [ ] LLM provider selector in project creation form
- [ ] Sync options in GitHub import:
  - Enable sync toggle
  - Sync direction selector (push/pull/bidirectional)

### 0.4 Project List Enhancements
- [ ] Pull-to-refresh functionality
- [ ] Quick start/stop toggle on project cards
- [ ] Auto-refresh container status periodically

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
- [ ] Implement `github_copilot_initiate()` in Rust
- [ ] Implement `github_copilot_poll()` in Rust
- [ ] Create device code display UI
- [ ] Handle polling and token receipt
- [ ] Store token securely
- [ ] Test end-to-end flow

### 1.2 Anthropic Claude Pro/Max (Redirect Flow)
- [ ] Implement `anthropic_initiate()` in Rust
- [ ] Configure deep link handling (Tauri)
- [ ] Implement `anthropic_exchange()` for code exchange
- [ ] Create browser redirect flow
- [ ] Handle callback and token storage
- [ ] Test end-to-end flow

### 1.3 Token Management
- [ ] Store tokens in secure storage
- [ ] Send tokens to Management API for container injection
- [ ] Handle token refresh (if applicable)
- [ ] Handle token revocation

---

## 2. Provider Configuration UI

### 2.1 Providers List Screen
- [ ] Create `src/routes/settings/providers/+page.svelte`
- [ ] List all available providers
- [ ] Show configured status
- [ ] Indicate default provider

### 2.2 Provider Configuration Screen
- [ ] Create individual provider config UI
- [ ] API key input (for simple providers)
- [ ] OAuth button (for OAuth providers)
- [ ] Test connection button
- [ ] Set as default toggle

### 2.3 Per-Project Provider Override
- [ ] Add provider selector to project settings
- [ ] "Use default" option
- [ ] Override with specific provider
- [ ] Update container env vars on change

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
- [ ] Install `tauri-plugin-notification`
- [ ] Configure notification permissions
- [ ] Implement notification handling

### 4.4 Server-Side Push
- [ ] Create webhook endpoint in Management API
- [ ] OpenCode plugin to call webhook on `session.idle`
- [ ] Management API sends push notification
- [ ] Include deep link to session

### 4.5 Notification Handling
- [ ] Handle notification tap → open relevant session
- [ ] Badge count management
- [ ] Notification preferences (enable/disable)

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
- [ ] Enable/disable push notifications
- [ ] Notification sound toggle
- [ ] Quiet hours (future)

### 6.2 Connection Settings
- [ ] Show current endpoint
- [ ] Connection status indicator
- [ ] Reconnect to different server

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
- [ ] Catch unhandled errors
- [ ] Show user-friendly error messages
- [ ] Offer retry options

### 8.2 Connection Recovery
- [ ] Auto-reconnect on connection loss
- [ ] Exponential backoff
- [ ] Manual reconnect option

### 8.3 Session Recovery
- [ ] Resume SSE stream after disconnect
- [ ] Fetch missed messages
- [ ] Handle stale state

---

## 9. Testing

- [ ] Test OAuth flows on real device
- [ ] Test push notifications end-to-end
- [ ] Test offline mode
- [ ] Test GitHub sync
- [ ] Test error scenarios
- [ ] Test settings persistence

---

## 10. Additional Components (Deferred from Phase 4)

### 10.1 Install Remaining shadcn Components
- [ ] Dialog - for modals and confirmations
- [ ] DropdownMenu - session selection, actions
- [ ] Toast/Sonner - notifications (`pnpm add sonner`)

### 10.2 Container Management UI
- [ ] Start button (when stopped)
- [ ] Stop button (when running)
- [ ] Confirmation dialog for stop
- [ ] Loading state during operation
- [ ] Show error state if container crashed
- [ ] "Restart" option

---

## Notes

- Push notification setup varies by platform
- Consider using a service like OneSignal for simpler push setup
- Offline support can be progressive - start simple
