# Phase 3: Tasks

## Development Approach

**Desktop-first, responsive design** - We develop on Linux desktop for fast iteration, building a responsive UI that works on all screen sizes. Mobile builds (iOS/Android) are deferred to a later phase.

---

## 1. Project Setup

### 1.1 Rust Dependencies
- [x] Update `Cargo.toml` with required dependencies:
  ```toml
  [dependencies]
  tauri = { version = "2", features = [] }
  tauri-plugin-opener = "2"
  serde = { version = "1", features = ["derive"] }
  serde_json = "1"
  tokio = { version = "1", features = ["full"] }
  reqwest = { version = "0.12", features = ["json", "rustls-tls"], default-features = false }
  keyring = "3"
  thiserror = "2"
  ```

### 1.2 Frontend Dependencies
- [x] Install Tailwind CSS v4: `pnpm add -D @tailwindcss/vite tailwindcss`
- [x] Initialize shadcn-svelte: `pnpm dlx shadcn-svelte@next init`
- [x] Install core shadcn components: button, card, input, label, badge, skeleton

### 1.3 Project Structure (Rust)
- [x] Create directory structure:
  ```
  src-tauri/src/
  ├── lib.rs              # Main library, command exports
  ├── main.rs             # Entry point
  ├── commands/           # Tauri commands
  │   ├── mod.rs
  │   ├── connection.rs   # Connection/auth commands
  │   └── projects.rs     # Project CRUD commands
  ├── services/           # Business logic
  │   ├── mod.rs
  │   ├── api.rs          # HTTP client for Management API
  │   └── storage.rs      # Secure credential storage
  └── models/             # Data types
      ├── mod.rs
      └── error.rs
  ```

### 1.4 Project Structure (Svelte)
- [x] Create directory structure:
  ```
  src/
  ├── routes/
  │   ├── +layout.svelte      # App shell with initialization
  │   ├── +layout.ts          # SSR disabled
  │   └── +page.svelte        # Main page (setup/projects/settings)
  ├── lib/
  │   ├── components/         # App-specific components
  │   │   └── ui/             # shadcn-svelte components
  │   ├── stores/             # Svelte stores (runes)
  │   │   ├── connection.svelte.ts
  │   │   └── projects.svelte.ts
  │   ├── api/                # Tauri API wrappers
  │   │   └── tauri.ts
  │   └── utils.ts            # Utilities (cn, etc.)
  └── app.css                 # Global styles + Tailwind
  ```

---

## 2. Rust Backend Core

### 2.1 API Client Service
- [x] Create `src/services/api.rs`
- [x] Implement `ApiClient` struct with:
  - Base URL configuration
  - Bearer token authentication
  - GET, POST, DELETE methods
  - Error handling with `thiserror`
  - Request timeout configuration

### 2.2 Secure Storage Service
- [x] Create `src/services/storage.rs`
- [x] Implement primary storage using file-based config:
  - `save_config(config)` - Save to ~/.config/agentpod/config.json
  - `load_config()` - Retrieve from config file
  - `clear_config()` - Remove config
- [x] Implement keyring as optional enhancement (not fallback):
  - Uses `keyring` crate when available
  - Falls back gracefully if keyring unavailable
- [x] Keys stored:
  - `api_url` - Management API URL
  - `api_key` - Authentication token

### 2.3 App State Management
- [x] Commands operate statelessly (no AppState struct needed)
- [x] State restored from storage on app startup via frontend

---

## 3. Tauri Commands

### 3.1 Connection Commands
- [x] Create `src/commands/connection.rs`
- [x] Implement commands:
  - `connect(api_url, api_key)` - Store credentials and validate connection
  - `disconnect()` - Clear stored credentials
  - `get_connection_status()` - Return connected state and endpoint
  - `test_connection()` - Ping Management API /health endpoint
  - `restore_connection()` - Called on startup to restore saved credentials

### 3.2 Project Commands
- [x] Create `src/commands/projects.rs`
- [x] Implement commands (call Management API):
  - `list_projects()` - GET /api/projects
  - `get_project(id)` - GET /api/projects/:id
  - `create_project(name, description, github_url, llm_provider_id)` - POST /api/projects
  - `delete_project(id, delete_repo)` - DELETE /api/projects/:id
  - `start_project(id)` - POST /api/projects/:id/start
  - `stop_project(id)` - POST /api/projects/:id/stop
  - `restart_project(id)` - POST /api/projects/:id/restart

### 3.3 Settings Commands
- [ ] Create `src/commands/settings.rs` - DEFERRED to Phase 4
- [ ] Implement commands (when needed):
  - `get_settings()` - Get app settings
  - `save_settings(settings)` - Save settings
  - `get_providers()` - List LLM providers from API

### 3.4 Register Commands
- [x] Update `lib.rs` to export all command modules
- [x] Register all commands in Tauri builder
- [x] Configure permissions in `capabilities/default.json`

---

## 4. OAuth Integration (Skeleton)

### 4.1 Setup tauri-plugin-oauth
- [ ] Add plugin to Tauri builder - DEFERRED to Phase 4
- [ ] Configure permissions for oauth:allow-start, oauth:allow-cancel
- [ ] Create `src/services/oauth.rs`

### 4.2 OAuth Commands
- [ ] `initiate_oauth(provider)` - Start OAuth server, return port
- [ ] `complete_oauth(provider, auth_url)` - Handle callback URL, extract token
- [ ] Store tokens via secure storage service

### 4.3 Provider Skeletons
- [x] UI placeholders for GitHub integration (disabled button)
- [x] UI placeholders for LLM Provider configuration (disabled button)

---

## 5. Svelte Frontend Foundation

### 5.1 Tailwind + shadcn-svelte Setup
- [x] Configure Tailwind CSS v4 in vite.config.js
- [x] Set up app.css with theme variables (light/dark)
- [x] Configure shadcn-svelte with default theme
- [x] Install required components via CLI

### 5.2 Tauri API Wrapper
- [x] Create `src/lib/api/tauri.ts`
- [x] Type-safe wrappers for all Tauri commands:
  ```typescript
  export const api = {
    // Connection
    connect(apiUrl: string, apiKey?: string): Promise<void>,
    disconnect(): Promise<void>,
    getConnectionStatus(): Promise<ConnectionStatus>,
    testConnection(): Promise<boolean>,
    restoreConnection(): Promise<ConnectionConfig | null>,
    
    // Projects
    listProjects(): Promise<Project[]>,
    getProject(id: string): Promise<Project>,
    createProject(input: CreateProjectInput): Promise<Project>,
    deleteProject(id: string, deleteRepo?: boolean): Promise<void>,
    startProject(id: string): Promise<void>,
    stopProject(id: string): Promise<void>,
    restartProject(id: string): Promise<void>,
  };
  ```

### 5.3 State Management (Svelte 5 Runes)
- [x] Create `src/lib/stores/connection.svelte.ts`:
  - `connection` - reactive state using $state (isConnected, apiUrl, error)
  - `connect()`, `disconnect()`, `testConnection()`, `restoreConnection()` functions
  
- [x] Create `src/lib/stores/projects.svelte.ts`:
  - `projects` - reactive state (list, isLoading, error, count, running, stopped, errored)
  - `fetchProjects()`, `createProject()`, `deleteProject()` functions
  - `startProject()`, `stopProject()`, `restartProject()` functions

- [ ] Create `src/lib/stores/settings.svelte.ts` - DEFERRED to Phase 4

### 5.4 Routing & Guards
- [x] Configure SvelteKit for SPA mode
- [x] Implement initialization in `+layout.svelte`:
  - On mount, check for saved credentials and restore connection
  - Conditional rendering based on connection state

---

## 6. UI Components & Layout

### 6.1 App Shell (Responsive)
- [x] Create `+page.svelte` with:
  - Setup screen when not connected
  - Projects view when connected
  - Settings view accessible via button
  - Responsive header with navigation

### 6.2 Required shadcn Components
- [x] Button (default, secondary, destructive, ghost, outline)
- [x] Card (Root, Header, Title, Description, Content, Footer)
- [x] Input (text inputs)
- [x] Label (form labels)
- [x] Badge (status indicators)
- [x] Skeleton (loading states)
- [ ] Dialog (desktop modals) - not yet needed
- [ ] Drawer (mobile modals) - not yet needed
- [ ] Sidebar (navigation) - not yet needed
- [ ] Sonner/Toast (notifications) - not yet needed

### 6.3 App-Specific Components
- [x] Connection status indicator (green dot + "Connected")
- [x] Project cards with status badges
- [x] StatusBadge via Badge component with color variants
- [x] Empty state for no projects

---

## 7. Screens

### 7.1 Setup Screen (when not connected)
- [x] Welcome message ("Welcome to CodeOpen")
- [x] Form fields:
  - Management API URL
  - API Key
- [x] "Connect" button with loading state
- [x] Error display
- [x] Automatic redirect to projects view on success

### 7.2 Projects View (when connected)
- [x] Header with "New Project" button and "Settings" button
- [x] Create project form (expandable)
- [x] Responsive grid of project cards:
  - 1 column on mobile
  - 2 columns on sm (640px+)
  - 3 columns on lg (1024px+)
- [x] Each card shows: name, slug, status badge, description
- [x] Action buttons: Start, Stop, Delete
- [x] Empty state when no projects
- [x] Loading skeletons while fetching

### 7.3 Project Detail
- [ ] Separate project detail page - DEFERRED
- [x] Actions available in project card footer instead

### 7.4 Settings View
- [x] Connection info (API URL, connected status)
- [x] "Test Connection" button
- [x] "Disconnect" button
- [x] About section (app name, version, description)
- [x] Statistics overview (total projects, running, stopped, errors)
- [x] Integrations placeholders (GitHub, LLM Providers - disabled)
- [ ] LLM Provider configuration - DEFERRED to Phase 4

---

## 8. Testing

### 8.1 Rust Tests
- [ ] Unit tests for API client (mock responses) - DEFERRED
- [ ] Unit tests for storage service (mock keyring) - DEFERRED
- [ ] Integration tests for commands - DEFERRED

### 8.2 Manual Testing
- [x] Test on Linux desktop
- [x] Test responsive breakpoints (resize window)
- [x] Test connection to live Management API (https://api.superchotu.com)
- [x] Test project CRUD operations (create, start, stop, delete)
- [ ] Test dark mode toggle - basic support via Tailwind dark: classes

---

## 9. Mobile Builds (Deferred)

These tasks are deferred to a later phase:

- [ ] Install Xcode / Android Studio
- [ ] Add iOS/Android targets: `cargo tauri ios init` / `cargo tauri android init`
- [ ] Configure signing
- [ ] Build and test on simulators/devices
- [ ] Handle Tailscale connectivity on mobile

---

## Phase 3 Completion Summary

### Completed
- Full Rust backend with API client, storage service, and Tauri commands
- Svelte frontend with connection and projects stores using Svelte 5 runes
- shadcn-svelte UI components: button, card, input, label, badge, skeleton
- Setup screen for initial connection
- Projects view with CRUD operations
- Settings view with connection info, test, disconnect, and statistics
- Responsive design working across screen sizes
- Desktop builds (.deb, .rpm, .AppImage)

### Deferred to Phase 4
- OAuth integration (GitHub, LLM providers)
- Settings store and commands
- Additional shadcn components (dialog, drawer, sidebar, toast)
- Separate project detail page
- Rust unit/integration tests
- Mobile builds (iOS/Android)

---

## Notes

- Focus on desktop-first development for fast iteration
- Use responsive design patterns from shadcn-svelte
- Keep OAuth as skeleton - full implementation in Phase 4
- Empty project creation only - GitHub sync in Phase 4
- Test with live Management API throughout development
