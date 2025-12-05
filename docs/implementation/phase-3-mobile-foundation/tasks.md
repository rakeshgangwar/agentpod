# Phase 3: Tasks

## 1. Tauri Mobile Setup

### 1.1 Prerequisites
- [ ] Install Rust: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- [ ] Install Tauri CLI: `cargo install tauri-cli`
- [ ] For iOS: Install Xcode, Xcode Command Line Tools
- [ ] For Android: Install Android Studio, NDK, SDK

### 1.2 Configure Mobile Targets
- [ ] Add iOS target: `rustup target add aarch64-apple-ios`
- [ ] Add Android targets:
  ```bash
  rustup target add aarch64-linux-android
  rustup target add armv7-linux-androideabi
  rustup target add i686-linux-android
  rustup target add x86_64-linux-android
  ```
- [ ] Initialize Tauri mobile: `cargo tauri android init` / `cargo tauri ios init`

### 1.3 Test Build
- [ ] Build for iOS simulator: `cargo tauri ios dev`
- [ ] Build for Android emulator: `cargo tauri android dev`
- [ ] Verify app launches with default template

---

## 2. Rust Backend Foundation

### 2.1 Project Structure
- [ ] Organize `src-tauri/src/`:
  ```
  src-tauri/src/
  ├── lib.rs          # Main library, command exports
  ├── main.rs         # Entry point
  ├── commands/       # Tauri commands
  │   ├── mod.rs
  │   ├── projects.rs
  │   ├── auth.rs
  │   └── settings.rs
  ├── services/       # Business logic
  │   ├── mod.rs
  │   ├── api.rs      # HTTP client
  │   ├── oauth.rs    # OAuth proxy
  │   └── storage.rs  # Secure storage
  └── models/         # Data types
      └── mod.rs
  ```

### 2.2 Dependencies
- [ ] Update `Cargo.toml`:
  ```toml
  [dependencies]
  tauri = { version = "2", features = ["macos-private-api"] }
  serde = { version = "1", features = ["derive"] }
  serde_json = "1"
  reqwest = { version = "0.11", features = ["json"] }
  tokio = { version = "1", features = ["full"] }
  keyring = "2"  # For secure credential storage
  ```

### 2.3 API Client
- [ ] Create `src/services/api.rs`
- [ ] Implement base HTTP client with:
  - Base URL configuration
  - Bearer token authentication
  - Error handling
  - Request/response logging (debug)

### 2.4 Secure Storage
- [ ] Create `src/services/storage.rs`
- [ ] Implement functions:
  - `store_credential(key, value)` - Save to Keychain/Keystore
  - `get_credential(key)` - Retrieve from Keychain/Keystore
  - `delete_credential(key)` - Remove credential
- [ ] Keys to store:
  - `api_endpoint` - Management API URL
  - `api_token` - Authentication token

---

## 3. Tauri Commands

### 3.1 Connection Commands
- [ ] Create `src/commands/auth.rs`
- [ ] Commands:
  - `connect(endpoint, token)` - Store and validate connection
  - `disconnect()` - Clear stored credentials
  - `get_connection_status()` - Check if connected
  - `test_connection()` - Ping Management API

### 3.2 Project Commands (Skeleton)
- [ ] Create `src/commands/projects.rs`
- [ ] Commands (call Management API):
  - `list_projects()` - Get all projects
  - `get_project(id)` - Get project details
  - `create_project(options)` - Create new project
  - `delete_project(id)` - Delete project
  - `start_project(id)` - Start container
  - `stop_project(id)` - Stop container

### 3.3 Settings Commands
- [ ] Create `src/commands/settings.rs`
- [ ] Commands:
  - `get_settings()` - Get app settings
  - `save_settings(settings)` - Save settings
  - `get_providers()` - List LLM providers
  - `configure_provider(id, config)` - Set provider credentials

### 3.4 Register Commands
- [ ] Update `lib.rs` to export all commands
- [ ] Register in Tauri builder

---

## 4. OAuth Proxy (Skeleton)

### 4.1 GitHub Copilot OAuth
- [ ] Create `src/services/oauth.rs`
- [ ] Implement device flow:
  - `github_copilot_initiate()` - Get device code
  - `github_copilot_poll(device_code)` - Poll for token
- [ ] Store token via secure storage

### 4.2 Anthropic OAuth
- [ ] Implement redirect flow:
  - `anthropic_initiate()` - Get auth URL
  - `anthropic_exchange(code)` - Exchange code for token
- [ ] Handle deep link callback

### 4.3 Tauri Commands for OAuth
- [ ] `initiate_oauth(provider)` - Start OAuth flow
- [ ] `poll_oauth(provider, device_code)` - Poll for token (device flow)
- [ ] `complete_oauth(provider, code)` - Complete OAuth (redirect flow)

---

## 5. Svelte Frontend Foundation

### 5.1 Project Structure
- [ ] Organize `src/`:
  ```
  src/
  ├── routes/
  │   ├── +layout.svelte      # App shell
  │   ├── +page.svelte        # Home (redirects)
  │   ├── setup/
  │   │   └── +page.svelte    # First-time setup
  │   ├── projects/
  │   │   ├── +page.svelte    # Project list
  │   │   └── [id]/
  │   │       └── +page.svelte # Project detail
  │   └── settings/
  │       └── +page.svelte    # Settings
  ├── lib/
  │   ├── components/         # Reusable components
  │   ├── stores/             # Svelte stores
  │   ├── api/                # API client wrappers
  │   └── utils/              # Utilities
  └── app.html
  ```

### 5.2 Tauri API Integration
- [ ] Create `src/lib/api/tauri.ts`
- [ ] Wrap Tauri invoke calls:
  ```typescript
  import { invoke } from '@tauri-apps/api/core';
  
  export const api = {
    async connect(endpoint: string, token: string) {
      return invoke('connect', { endpoint, token });
    },
    async listProjects() {
      return invoke('list_projects');
    },
    // ... more methods
  };
  ```

### 5.3 State Management
- [ ] Create `src/lib/stores/connection.ts`:
  ```typescript
  import { writable } from 'svelte/store';
  
  export const connectionStatus = writable<'disconnected' | 'connecting' | 'connected'>('disconnected');
  export const endpoint = writable<string | null>(null);
  ```
- [ ] Create `src/lib/stores/projects.ts`
- [ ] Create `src/lib/stores/settings.ts`

### 5.4 Routing Setup
- [ ] Configure SvelteKit for SPA mode (static adapter)
- [ ] Implement route guards for authenticated routes
- [ ] Set up navigation helpers

---

## 6. UI Components (Basic)

### 6.1 Layout Components
- [ ] `AppShell.svelte` - Main layout with navigation
- [ ] `Header.svelte` - Top bar with title, back button
- [ ] `BottomNav.svelte` - Bottom navigation tabs

### 6.2 Common Components
- [ ] `Button.svelte` - Primary, secondary, danger variants
- [ ] `Input.svelte` - Text input with label, error state
- [ ] `Card.svelte` - Content card
- [ ] `Loading.svelte` - Loading spinner/skeleton
- [ ] `Toast.svelte` - Notification toasts

### 6.3 Styling
- [ ] Set up CSS variables for theming
- [ ] Create base styles (typography, colors, spacing)
- [ ] Mobile-first responsive design

---

## 7. First-Time Setup Flow

### 7.1 Setup Screen
- [ ] Create `src/routes/setup/+page.svelte`
- [ ] Steps:
  1. Welcome message
  2. Enter Management API URL
  3. Enter API token
  4. Test connection
  5. Success → redirect to projects

### 7.2 Connection Logic
- [ ] On app start, check for stored credentials
- [ ] If none → redirect to setup
- [ ] If found → test connection → show projects or setup

---

## 8. Testing

### 8.1 Rust Tests
- [ ] Unit tests for API client
- [ ] Unit tests for secure storage (mock)
- [ ] Integration test for commands

### 8.2 Frontend Tests
- [ ] Test Tauri API wrappers
- [ ] Test stores

### 8.3 Manual Testing
- [ ] Test on iOS simulator
- [ ] Test on Android emulator
- [ ] Test connection to real Management API

---

## 9. Build & Package

### 9.1 iOS
- [ ] Configure signing (development)
- [ ] Build debug IPA
- [ ] Test on physical device (optional)

### 9.2 Android
- [ ] Configure signing (debug keystore)
- [ ] Build debug APK
- [ ] Test on physical device (optional)

---

## Notes

- Focus on iOS or Android first, then add the other
- Tailscale must be running on mobile device for testing
- Keep UI minimal in this phase - focus on foundation
