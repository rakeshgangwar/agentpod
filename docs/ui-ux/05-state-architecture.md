# State Architecture

**Application:** CodeOpen  
**Date:** December 2024

Complete state management architecture analysis.

---

## Overview

The CodeOpen project uses a hybrid state management approach:

- **Svelte 5 Runes** for global application state (Svelte stores)
- **React Context + Hooks** for chat component state (embedded React within Svelte)
- **Local component state** for page-specific UI concerns
- **Rust backend** for persistence and API communication via Tauri

---

## 1. Svelte Global Stores

### 1.1 Connection Store (`src/lib/stores/connection.svelte.ts`)

| State Variable | Type | Persisted | Purpose |
|---------------|------|-----------|---------|
| `connectionStatus` | `ConnectionStatus` | Yes (Rust/Storage) | API connection state |
| `isLoading` | `boolean` | No | Loading indicator |
| `isInitialized` | `boolean` | No | Init guard flag |

**Derived State (via getters):**
- `isConnected`: Whether API connection is active
- `apiUrl`: Current API endpoint
- `error`: Connection error message

**Actions:**
- `initConnection()` - Initialize from storage, test if needed
- `connect(apiUrl, apiKey)` - Establish new connection
- `disconnect()` - Clear connection
- `testConnection()` - Verify connection health

**Persistence:** State is persisted via Rust backend (Tauri commands store to local storage/config file)

---

### 1.2 Projects Store (`src/lib/stores/projects.svelte.ts`)

| State Variable | Type | Persisted | Purpose |
|---------------|------|-----------|---------|
| `projectsList` | `Project[]` | No (fetched) | All projects |
| `selectedProject` | `Project \| null` | No | Currently viewed project |
| `isLoading` | `boolean` | No | Loading state |
| `error` | `string \| null` | No | Error message |

**Derived State:**
- `list`, `selected`, `count` - Direct accessors
- `running`, `stopped`, `creating`, `errored` - Filtered project arrays

**Actions:**
- `fetchProjects()` - Fetch all from API
- `fetchProject(id)` - Fetch single + update list
- `createProject(input)` - Create + add to list
- `deleteProject(id)` - Delete + remove from list
- `startProject(id)`, `stopProject(id)`, `restartProject(id)` - Container control
- `selectProject(project)` - Set current selection
- `clearError()` - Reset error state

**Persistence:** No local persistence - all data fetched from Management API

---

### 1.3 Settings Store (`src/lib/stores/settings.svelte.ts`)

| State Variable | Type | Persisted | Purpose |
|---------------|------|-----------|---------|
| `currentSettings` | `AppSettings` | Yes | App preferences |
| `providers` | `Provider[]` | No (fetched) | LLM providers |
| `isLoading` | `boolean` | No | Loading state |
| `isInitialized` | `boolean` | No | Init guard |
| `error` | `string \| null` | No | Error message |

**AppSettings Structure:**
```typescript
{
  theme: "light" | "dark" | "system",
  defaultProviderId: string | null,
  autoRefreshInterval: number,
  inAppNotifications: boolean,
  systemNotifications: boolean
}
```

**Actions:**
- `initSettings()` - Load from storage + apply theme
- `loadProviders()` - Fetch LLM providers
- `updateSettings(partial)` - Save to storage
- `setTheme(theme)`, `setDefaultProvider(id)`, etc. - Convenience wrappers
- `exportSettingsJson()`, `importSettingsJson(json)` - Backup/restore
- `resetSettings()` - Reset to defaults

**Persistence:** Settings persisted via Rust backend to local storage

---

## 2. React Context (Chat Components)

### 2.1 RuntimeProvider (`src/lib/chat/RuntimeProvider.tsx`)

**Purpose:** Wraps assistant-ui's `AssistantRuntimeProvider` with OpenCode integration

| State Variable | Type | Persisted | Purpose |
|---------------|------|-----------|---------|
| `internalMessages` | `InternalMessage[]` | No | Mutable message store |
| `isRunning` | `boolean` | No | Processing indicator |
| `isLoading` | `boolean` | No | Initial load state |
| `error` | `string \| null` | No | Error message |
| `sessionId` | `string \| null` | No | Current session ID |
| `streamRef` | `OpenCodeStream \| null` | No | SSE connection reference |

**Key Operations:**
- SSE stream connection management
- Message conversion (OpenCode format → assistant-ui format)
- Tool call tracking with status
- Optimistic message updates
- Session auto-creation

**Props Flow:**
```
RuntimeProvider
  ├── projectId (from route params)
  ├── sessionId (optional, from parent)
  ├── selectedModel (from chat page state)
  └── onSessionModelDetected (callback to parent)
```

---

### 2.2 PermissionContext (`src/lib/chat/PermissionContext.tsx`)

**Purpose:** Manages human-in-the-loop permission requests queue

| State Variable | Type | Persisted | Purpose |
|---------------|------|-----------|---------|
| `pendingPermissions` | `PendingPermission[]` | No | Permission request queue |

**Context Value:**
```typescript
{
  pendingPermissions: PendingPermission[],
  addPermission: (request) => void,
  removePermission: (id) => void,
  respondToPermission: (id, response) => Promise<void>,
  clearPermissions: () => void,
  hasPendingPermissions: boolean,
  currentPermission: PendingPermission | null
}
```

**State Flow:**
1. SSE `permission.updated` event triggers `addPermission()`
2. PermissionBar renders `currentPermission`
3. User clicks Allow/Reject → `respondToPermission()`
4. SSE `permission.replied` event or success removes from queue

---

## 3. Local Component State

### 3.1 Chat Page (`/projects/[id]/chat/+page.svelte`)

| State | Type | Purpose |
|-------|------|---------|
| `sessions` | `Session[]` | Session list |
| `selectedSessionId` | `string \| null` | Current session |
| `isLoading`, `isCreating` | `boolean` | Loading states |
| `error` | `string \| null` | Error display |
| `selectedModel` | `ModelSelection \| undefined` | LLM model selection |
| `modelLoadedForSession` | `string \| null` | Model detection tracking |
| `filePickerOpen` | `boolean` | Modal visibility |
| `pendingFilePath` | `string \| null` | File to insert |

**Cross-Component Communication:**
- `selectedModel` binds to `ModelSelector` component
- `selectedModel` passes to `RuntimeProvider`
- `onSessionModelDetected` callback updates `selectedModel` from session history

---

### 3.2 Projects Layout (`/projects/[id]/+layout.svelte`)

| State | Type | Purpose |
|-------|------|---------|
| `isDeploying` | `boolean` | Deploy action state |
| `deployError` | `string \| null` | Deploy error |
| `showDeployDialog` | `boolean` | Dialog visibility |

---

### 3.3 Settings Page (`/settings/+page.svelte`)

| State | Type | Purpose |
|-------|------|---------|
| `isTesting` | `boolean` | Connection test state |
| `testResult` | `{success, message}` | Test result |
| `permissionSettings` | `PermissionSettings` | OpenCode permissions |
| `agentsMd` | `string` | AGENTS.md content |
| `configFiles` | `UserOpencodeFile[]` | Custom config files |
| `selectedFile` | `UserOpencodeFile \| null` | File being edited |
| `editingFileContent` | `string` | Current edit buffer |
| Various dialog states | `boolean` | Modal visibility |

---

### 3.4 Setup Page (`/setup/+page.svelte`)

| State | Type | Purpose |
|-------|------|---------|
| `apiUrl` | `string` | Form input |
| `apiKey` | `string` | Form input |
| `isConnecting` | `boolean` | Submit state |
| `connectionError` | `string \| null` | Form error |

---

### 3.5 Chat Component Local State

**ChatThread.tsx - Composer:**

| State | Type | Purpose |
|-------|------|---------|
| `inputValue` | `string` | Message input text |
| `showCommandPicker` | `boolean` | Slash command picker visibility |
| `showFilePicker` | `boolean` | File picker visibility |
| `commandQuery`, `fileQuery` | `string` | Picker filter queries |
| `cursorPosition` | `number` | Cursor tracking for @ detection |
| `pickerPosition` | `{top, left}` | Dropdown positioning |

**CommandPicker.tsx:**

| State | Type | Purpose |
|-------|------|---------|
| `selectedIndex` | `number` | Keyboard navigation index |

**FilePicker.tsx:**

| State | Type | Purpose |
|-------|------|---------|
| `files` | `string[]` | Search results |
| `isLoading` | `boolean` | Search state |
| `selectedIndex` | `number` | Keyboard navigation |

**ModelSelector.svelte:**

| State | Type | Purpose |
|-------|------|---------|
| `providers` | `OpenCodeProvider[]` | Available providers |
| `loading` | `boolean` | Load state |
| `error` | `string \| null` | Error state |

---

## 4. State Flow Diagrams

### 4.1 Application Initialization Flow

```
+layout.svelte (onMount)
    │
    ├─► initSettings() ─► Rust: get_settings ─► Apply theme
    │                                          ├─► Local storage
    │                                          └─► DOM class toggle
    │
    └─► initConnection() ─► Rust: get_connection_status
                                    │
                                    ├─► If connected: test_connection
                                    │       └─► API health check
                                    │
                                    └─► Update connectionStatus state
```

### 4.2 Project Data Flow

```
/projects/+page.svelte
    │
    ├─► $effect: check connection.isConnected
    │       └─► If not: goto("/setup")
    │
    └─► $effect: if connected ─► fetchProjects()
            │
            └─► Rust: list_projects ─► Management API
                    │
                    └─► Update projectsList state
                            │
                            └─► Reactive UI update
```

### 4.3 Chat Message Flow

```
User types message
    │
    └─► Composer.handleSubmit()
            │
            └─► composerRuntime.send()
                    │
                    └─► RuntimeProvider.onNew(message)
                            │
                            ├─► Optimistic update: add user message to internalMessages
                            │
                            └─► opencodeSendMessage() ─► Rust ─► OpenCode API
                                    │
                                    └─► SSE stream receives events
                                            │
                                            ├─► message.updated
                                            │       └─► Update internalMessages
                                            │
                                            ├─► message.part.updated
                                            │       └─► Append text/tool calls
                                            │
                                            ├─► permission.updated
                                            │       └─► addPermission()
                                            │               └─► PermissionBar renders
                                            │
                                            └─► session.idle
                                                    └─► setIsRunning(false)
```

### 4.4 Permission Approval Flow

```
SSE: permission.updated
    │
    └─► addPermission(request)
            │
            └─► PermissionContext state update
                    │
                    └─► PermissionBar re-renders
                            │
                            └─► User clicks "Allow Once"
                                    │
                                    └─► respondToPermission(id, "once")
                                            │
                                            └─► Rust: opencode_respond_permission
                                                    │
                                                    └─► OpenCode API
                                                            │
                                                            └─► Tool executes
                                                                    │
                                                                    └─► SSE: message.part.updated (result)
```

---

## 5. Data Persistence Map

| Data Category | Storage Location | Mechanism |
|--------------|------------------|-----------|
| Connection URL/Key | Rust local storage | Tauri store plugin |
| App Settings | Rust local storage | Tauri store plugin |
| Projects | Management API | REST API (no local cache) |
| Sessions | OpenCode containers | OpenCode API |
| Messages | OpenCode containers | OpenCode API |
| User OpenCode Config | Management API | REST API |

---

## 6. Cross-Component Communication Patterns

### 6.1 Store-Based Communication
- All pages import stores directly (`connection`, `projects`, `settings`)
- Stores expose reactive state via getters
- Actions are exported functions that mutate internal state

### 6.2 Props/Callbacks Pattern
- React components use props drilling + callbacks
- Svelte components use `$bindable` for two-way binding
- `sveltify` bridges React components into Svelte

### 6.3 Navigation-Based Communication
- URL params pass project/session IDs (`/projects/[id]/chat`)
- Query params pass context (`?file=path/to/file`)
- Route protection via `$effect` + `goto()`

### 6.4 Event-Based Communication
- SSE events via Tauri event system
- `OpenCodeStream` class manages subscriptions
- Events dispatched via `listen()` from `@tauri-apps/api/event`

---

## 7. Recommendations for Improvement

### 7.1 Add Caching for Projects

**Problem:** Projects data is fetched repeatedly across pages with no cache.

**Recommendation:** Add a TTL-based cache:
```typescript
let lastFetchTime = $state<number | null>(null);
const CACHE_TTL = 30000; // 30 seconds

async function fetchProjects(force = false) {
  if (!force && lastFetchTime && Date.now() - lastFetchTime < CACHE_TTL) {
    return; // Use cached data
  }
  // ... fetch
  lastFetchTime = Date.now();
}
```

### 7.2 Broader Optimistic Updates

**Current:** Only chat messages use optimistic updates.

**Recommendation:** Extend to project actions (start/stop).

### 7.3 Granular Loading States

**Problem:** Single `isLoading` flag for multiple operations.

**Recommendation:** Use operation-specific loading states.

### 7.4 Session Persistence

**Problem:** Selected session ID is not persisted, resets on page reload.

**Recommendation:** Store last selected session per project.

### 7.5 Background Refresh

**Problem:** `autoRefreshInterval` setting exists but not implemented for projects.

**Recommendation:** Add background polling.

### 7.6 Model Selection Persistence

**Problem:** Model selection resets when changing sessions.

**Recommendation:** Remember model preference per project.

### 7.7 Offline Handling

**Problem:** No offline detection or graceful degradation.

**Recommendation:** Add connection status monitoring.

---

## 8. Summary

**Strengths:**
- Clear separation of global state (Svelte stores) and local state
- Proper use of Svelte 5 runes for reactivity
- Good React/Svelte interop via sveltify
- SSE streaming for real-time updates
- Layered persistence (local storage + API)

**Areas for Improvement:**
- Add caching/memoization for API responses
- Implement broader optimistic updates
- Add granular loading states
- Persist more user preferences (sessions, models)
- Add offline handling
- Consider state history for undo support

---

*Document generated: December 2024*
