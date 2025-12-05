# Phase 3: Tasks

## Development Approach

**Desktop-first, responsive design** - We develop on Linux desktop for fast iteration, building a responsive UI that works on all screen sizes. Mobile builds (iOS/Android) are deferred to a later phase.

---

## 1. Project Setup

### 1.1 Rust Dependencies
- [ ] Update `Cargo.toml` with required dependencies:
  ```toml
  [dependencies]
  tauri = { version = "2", features = [] }
  tauri-plugin-opener = "2"
  tauri-plugin-oauth = "2"
  serde = { version = "1", features = ["derive"] }
  serde_json = "1"
  tokio = { version = "1", features = ["full"] }
  reqwest = { version = "0.12", features = ["json", "rustls-tls"], default-features = false }
  keyring = "3"
  thiserror = "2"
  ```

### 1.2 Frontend Dependencies
- [ ] Install Tailwind CSS v4: `pnpm add -D @tailwindcss/vite tailwindcss`
- [ ] Initialize shadcn-svelte: `pnpm dlx shadcn-svelte@next init`
- [ ] Install core shadcn components: button, card, input, dialog, drawer, sidebar, toast

### 1.3 Project Structure (Rust)
- [ ] Create directory structure:
  ```
  src-tauri/src/
  ├── lib.rs              # Main library, command exports
  ├── main.rs             # Entry point
  ├── commands/           # Tauri commands
  │   ├── mod.rs
  │   ├── auth.rs         # Connection/auth commands
  │   ├── projects.rs     # Project CRUD commands
  │   └── settings.rs     # Settings commands
  ├── services/           # Business logic
  │   ├── mod.rs
  │   ├── api.rs          # HTTP client for Management API
  │   ├── storage.rs      # Secure credential storage
  │   └── oauth.rs        # OAuth flow handling
  └── models/             # Data types
      └── mod.rs
  ```

### 1.4 Project Structure (Svelte)
- [ ] Create directory structure:
  ```
  src/
  ├── routes/
  │   ├── +layout.svelte      # App shell with responsive sidebar
  │   ├── +layout.ts          # SSR disabled
  │   ├── +page.svelte        # Home (redirects based on connection)
  │   ├── setup/
  │   │   └── +page.svelte    # First-time setup
  │   ├── projects/
  │   │   ├── +page.svelte    # Project list
  │   │   └── [id]/
  │   │       └── +page.svelte # Project detail
  │   └── settings/
  │       └── +page.svelte    # Settings
  ├── lib/
  │   ├── components/         # App-specific components
  │   │   └── ui/             # shadcn-svelte components
  │   ├── stores/             # Svelte stores (runes)
  │   │   ├── connection.svelte.ts
  │   │   ├── projects.svelte.ts
  │   │   └── settings.svelte.ts
  │   ├── api/                # Tauri API wrappers
  │   │   └── tauri.ts
  │   └── utils/              # Utilities (cn, etc.)
  └── app.css                 # Global styles + Tailwind
  ```

---

## 2. Rust Backend Core

### 2.1 API Client Service
- [ ] Create `src/services/api.rs`
- [ ] Implement `ApiClient` struct with:
  - Base URL configuration
  - Bearer token authentication
  - GET, POST, DELETE methods
  - Error handling with `thiserror`
  - Request timeout configuration

### 2.2 Secure Storage Service
- [ ] Create `src/services/storage.rs`
- [ ] Implement primary storage using `keyring` crate:
  - `store_credential(key, value)` - Save to system keychain
  - `get_credential(key)` - Retrieve from keychain
  - `delete_credential(key)` - Remove credential
- [ ] Implement fallback for systems without keychain:
  - Encrypt credentials using app-derived key
  - Store in Tauri app data directory
- [ ] Keys to store:
  - `api_endpoint` - Management API URL
  - `api_token` - Authentication token

### 2.3 App State Management
- [ ] Create `AppState` struct with:
  - `api_client: Mutex<Option<ApiClient>>`
- [ ] Register state in Tauri builder
- [ ] Handle state restoration on app startup

---

## 3. Tauri Commands

### 3.1 Auth Commands
- [ ] Create `src/commands/auth.rs`
- [ ] Implement commands:
  - `connect(endpoint, token)` - Store credentials and validate connection
  - `disconnect()` - Clear stored credentials
  - `get_connection_status()` - Return connected state and endpoint
  - `test_connection()` - Ping Management API health endpoint
  - `restore_connection()` - Called on startup to restore saved credentials

### 3.2 Project Commands
- [ ] Create `src/commands/projects.rs`
- [ ] Implement commands (call Management API):
  - `list_projects()` - GET /api/projects
  - `get_project(id)` - GET /api/projects/:id
  - `create_project(name, description)` - POST /api/projects (empty project only)
  - `delete_project(id)` - DELETE /api/projects/:id
  - `start_project(id)` - POST /api/projects/:id/start
  - `stop_project(id)` - POST /api/projects/:id/stop

### 3.3 Settings Commands
- [ ] Create `src/commands/settings.rs`
- [ ] Implement commands:
  - `get_settings()` - Get app settings
  - `save_settings(settings)` - Save settings
  - `get_providers()` - List LLM providers from API

### 3.4 Register Commands
- [ ] Update `lib.rs` to export all command modules
- [ ] Register all commands in Tauri builder
- [ ] Configure permissions in `capabilities/default.json`

---

## 4. OAuth Integration (Skeleton)

### 4.1 Setup tauri-plugin-oauth
- [ ] Add plugin to Tauri builder
- [ ] Configure permissions for oauth:allow-start, oauth:allow-cancel
- [ ] Create `src/services/oauth.rs`

### 4.2 OAuth Commands
- [ ] `initiate_oauth(provider)` - Start OAuth server, return port
- [ ] `complete_oauth(provider, auth_url)` - Handle callback URL, extract token
- [ ] Store tokens via secure storage service

### 4.3 Provider Skeletons
- [ ] GitHub Copilot (device flow) - skeleton only
- [ ] Anthropic (redirect flow) - skeleton only

---

## 5. Svelte Frontend Foundation

### 5.1 Tailwind + shadcn-svelte Setup
- [ ] Configure Tailwind CSS v4 in vite.config.js
- [ ] Set up app.css with theme variables (light/dark)
- [ ] Configure shadcn-svelte with default theme
- [ ] Install required components via CLI

### 5.2 Tauri API Wrapper
- [ ] Create `src/lib/api/tauri.ts`
- [ ] Type-safe wrappers for all Tauri commands:
  ```typescript
  export const api = {
    // Auth
    connect(endpoint: string, token: string): Promise<void>,
    disconnect(): Promise<void>,
    getConnectionStatus(): Promise<ConnectionStatus>,
    testConnection(): Promise<boolean>,
    
    // Projects
    listProjects(): Promise<Project[]>,
    getProject(id: string): Promise<Project>,
    createProject(name: string, description?: string): Promise<Project>,
    deleteProject(id: string): Promise<void>,
    startProject(id: string): Promise<void>,
    stopProject(id: string): Promise<void>,
  };
  ```

### 5.3 State Management (Svelte 5 Runes)
- [ ] Create `src/lib/stores/connection.svelte.ts`:
  - `connectionState` - reactive state using $state
  - `isConnected` - derived from connectionState
  - `connect()`, `disconnect()`, `checkConnection()` functions
  
- [ ] Create `src/lib/stores/projects.svelte.ts`:
  - `projects` - list of projects
  - `loading`, `error` states
  - `loadProjects()`, `createProject()`, `deleteProject()` functions

- [ ] Create `src/lib/stores/settings.svelte.ts`:
  - App settings state
  - Provider configurations

### 5.4 Routing & Guards
- [ ] Configure SvelteKit for SPA mode (already done)
- [ ] Implement route guard in `+layout.svelte`:
  - On mount, check connection status
  - If not connected, redirect to /setup
  - Show loading state while checking

---

## 6. UI Components & Layout

### 6.1 App Shell (Responsive)
- [ ] Create `+layout.svelte` with:
  - Sidebar for desktop (≥768px) using shadcn Sidebar
  - Drawer/hamburger menu for mobile (<768px)
  - Header with connection status indicator
  - Main content area

### 6.2 Required shadcn Components
- [ ] Button (primary, secondary, destructive, ghost)
- [ ] Card (for project cards)
- [ ] Input (text inputs)
- [ ] Label (form labels)
- [ ] Dialog (desktop modals)
- [ ] Drawer (mobile modals, bottom sheets)
- [ ] Sidebar (navigation)
- [ ] Sonner/Toast (notifications)
- [ ] Badge (status indicators)
- [ ] Skeleton (loading states)

### 6.3 App-Specific Components
- [ ] `ConnectionStatus.svelte` - Shows connected/disconnected state
- [ ] `ProjectCard.svelte` - Project summary card
- [ ] `StatusBadge.svelte` - Running/stopped/error badges
- [ ] `EmptyState.svelte` - No projects placeholder

---

## 7. Screens

### 7.1 Setup Screen (`/setup`)
- [ ] Welcome message
- [ ] Form fields:
  - Management API URL (e.g., http://100.x.x.x:3001)
  - API Token
- [ ] "Test Connection" button
- [ ] "Connect" button
- [ ] Error display
- [ ] Redirect to /projects on success

### 7.2 Projects List (`/projects`)
- [ ] Header with "New Project" button
- [ ] Responsive grid of ProjectCards:
  - 1 column on mobile
  - 2 columns on tablet
  - 3 columns on desktop
- [ ] Each card shows: name, status, description
- [ ] Click card → navigate to detail
- [ ] Empty state when no projects

### 7.3 Project Detail (`/projects/[id]`)
- [ ] Project name and description
- [ ] Status badge (running/stopped)
- [ ] Action buttons:
  - Start (if stopped)
  - Stop (if running)
  - Delete (with confirmation)
- [ ] OpenCode URL (when running)
- [ ] Back navigation

### 7.4 Settings (`/settings`)
- [ ] Connection info (endpoint, connected status)
- [ ] "Disconnect" button
- [ ] LLM Provider configuration (list from API)
- [ ] App version info

---

## 8. Testing

### 8.1 Rust Tests
- [ ] Unit tests for API client (mock responses)
- [ ] Unit tests for storage service (mock keyring)
- [ ] Integration tests for commands

### 8.2 Manual Testing
- [ ] Test on Linux desktop
- [ ] Test responsive breakpoints (resize window)
- [ ] Test connection to live Management API
- [ ] Test project CRUD operations
- [ ] Test dark mode toggle

---

## 9. Mobile Builds (Deferred)

These tasks are deferred to a later phase:

- [ ] Install Xcode / Android Studio
- [ ] Add iOS/Android targets: `cargo tauri ios init` / `cargo tauri android init`
- [ ] Configure signing
- [ ] Build and test on simulators/devices
- [ ] Handle Tailscale connectivity on mobile

---

## Notes

- Focus on desktop-first development for fast iteration
- Use responsive design patterns from shadcn-svelte
- Keep OAuth as skeleton - full implementation in Phase 4
- Empty project creation only - GitHub sync in Phase 4
- Test with live Management API throughout development
