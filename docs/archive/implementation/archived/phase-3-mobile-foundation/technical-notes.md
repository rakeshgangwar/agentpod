# Phase 3: Technical Notes

## Development Approach

We use a **desktop-first, responsive design** approach:
- Develop and test on Linux desktop for fast iteration
- Build responsive UI using Tailwind CSS breakpoints
- Use shadcn-svelte's responsive patterns (Dialog on desktop, Drawer on mobile)
- Defer mobile builds (iOS/Android) to later phase

---

## Project Setup Commands

### Install Frontend Dependencies

```bash
# From project root
pnpm install

# Add Tailwind CSS v4
pnpm add -D @tailwindcss/vite tailwindcss

# Initialize shadcn-svelte (choose: Default style, slate color, src/lib/components/ui)
pnpm dlx shadcn-svelte@next init

# Add required components
pnpm dlx shadcn-svelte@next add button card input label dialog drawer sidebar sonner badge skeleton
```

### Rust Dependencies

Update `src-tauri/Cargo.toml`:

```toml
[package]
name = "agentpod"
version = "0.1.0"
description = "Portable Command Center for OpenCode"
authors = ["you"]
edition = "2021"

[lib]
name = "agentpod_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

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

---

## Rust Project Structure

### lib.rs

```rust
// src-tauri/src/lib.rs

mod commands;
mod services;
mod models;

use commands::auth::AppState;
use std::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_oauth::init())
        .manage(AppState {
            api_client: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            // Auth commands
            commands::auth::connect,
            commands::auth::disconnect,
            commands::auth::get_connection_status,
            commands::auth::test_connection,
            commands::auth::restore_connection,
            
            // Project commands
            commands::projects::list_projects,
            commands::projects::get_project,
            commands::projects::create_project,
            commands::projects::delete_project,
            commands::projects::start_project,
            commands::projects::stop_project,
            
            // Settings commands
            commands::settings::get_settings,
            commands::settings::save_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

---

## API Client

```rust
// src-tauri/src/services/api.rs

use reqwest::Client;
use serde::{de::DeserializeOwned, Serialize};
use std::time::Duration;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum ApiError {
    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("API error: {status} - {message}")]
    Api { status: u16, message: String },
    #[error("Not connected")]
    NotConnected,
}

// Make ApiError serializable for Tauri
impl serde::Serialize for ApiError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

#[derive(Clone)]
pub struct ApiClient {
    client: Client,
    base_url: String,
    token: String,
}

impl ApiClient {
    pub fn new(base_url: String, token: String) -> Result<Self, ApiError> {
        let client = Client::builder()
            .timeout(Duration::from_secs(30))
            .build()?;
            
        Ok(Self {
            client,
            base_url: base_url.trim_end_matches('/').to_string(),
            token,
        })
    }
    
    pub fn base_url(&self) -> &str {
        &self.base_url
    }
    
    pub async fn get<T: DeserializeOwned>(&self, path: &str) -> Result<T, ApiError> {
        let response = self.client
            .get(format!("{}{}", self.base_url, path))
            .header("Authorization", format!("Bearer {}", self.token))
            .send()
            .await?;
        
        if !response.status().is_success() {
            let status = response.status().as_u16();
            let message = response.text().await.unwrap_or_default();
            return Err(ApiError::Api { status, message });
        }
        
        Ok(response.json().await?)
    }
    
    pub async fn post<T: DeserializeOwned, B: Serialize>(
        &self,
        path: &str,
        body: &B,
    ) -> Result<T, ApiError> {
        let response = self.client
            .post(format!("{}{}", self.base_url, path))
            .header("Authorization", format!("Bearer {}", self.token))
            .json(body)
            .send()
            .await?;
        
        if !response.status().is_success() {
            let status = response.status().as_u16();
            let message = response.text().await.unwrap_or_default();
            return Err(ApiError::Api { status, message });
        }
        
        Ok(response.json().await?)
    }
    
    pub async fn post_empty(&self, path: &str) -> Result<(), ApiError> {
        let response = self.client
            .post(format!("{}{}", self.base_url, path))
            .header("Authorization", format!("Bearer {}", self.token))
            .send()
            .await?;
        
        if !response.status().is_success() {
            let status = response.status().as_u16();
            let message = response.text().await.unwrap_or_default();
            return Err(ApiError::Api { status, message });
        }
        
        Ok(())
    }
    
    pub async fn delete(&self, path: &str) -> Result<(), ApiError> {
        let response = self.client
            .delete(format!("{}{}", self.base_url, path))
            .header("Authorization", format!("Bearer {}", self.token))
            .send()
            .await?;
        
        if !response.status().is_success() {
            let status = response.status().as_u16();
            let message = response.text().await.unwrap_or_default();
            return Err(ApiError::Api { status, message });
        }
        
        Ok(())
    }
}
```

---

## Secure Storage

```rust
// src-tauri/src/services/storage.rs

use keyring::Entry;
use thiserror::Error;

const SERVICE_NAME: &str = "agentpod";

#[derive(Error, Debug)]
pub enum StorageError {
    #[error("Keyring error: {0}")]
    Keyring(#[from] keyring::Error),
    #[error("Credential not found")]
    NotFound,
}

impl serde::Serialize for StorageError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub fn store_credential(key: &str, value: &str) -> Result<(), StorageError> {
    let entry = Entry::new(SERVICE_NAME, key)?;
    entry.set_password(value)?;
    Ok(())
}

pub fn get_credential(key: &str) -> Result<Option<String>, StorageError> {
    let entry = Entry::new(SERVICE_NAME, key)?;
    match entry.get_password() {
        Ok(password) => Ok(Some(password)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

pub fn delete_credential(key: &str) -> Result<(), StorageError> {
    let entry = Entry::new(SERVICE_NAME, key)?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()), // Already deleted
        Err(e) => Err(e.into()),
    }
}

// Credential keys
pub const KEY_API_ENDPOINT: &str = "api_endpoint";
pub const KEY_API_TOKEN: &str = "api_token";
```

---

## Auth Commands

```rust
// src-tauri/src/commands/auth.rs

use crate::services::{api::ApiClient, storage};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::State;

pub struct AppState {
    pub api_client: Mutex<Option<ApiClient>>,
}

#[derive(Serialize, Deserialize)]
pub struct ConnectionStatus {
    pub connected: bool,
    pub endpoint: Option<String>,
}

#[derive(Deserialize)]
struct HealthResponse {
    status: String,
}

#[tauri::command]
pub async fn connect(
    state: State<'_, AppState>,
    endpoint: String,
    token: String,
) -> Result<(), String> {
    // Create client and test connection
    let client = ApiClient::new(endpoint.clone(), token.clone())
        .map_err(|e| format!("Failed to create client: {}", e))?;
    
    // Test connection by hitting health endpoint
    client.get::<HealthResponse>("/health")
        .await
        .map_err(|e| format!("Connection failed: {}", e))?;
    
    // Store credentials
    storage::store_credential(storage::KEY_API_ENDPOINT, &endpoint)
        .map_err(|e| format!("Failed to store endpoint: {}", e))?;
    storage::store_credential(storage::KEY_API_TOKEN, &token)
        .map_err(|e| format!("Failed to store token: {}", e))?;
    
    // Update state
    *state.api_client.lock().unwrap() = Some(client);
    
    Ok(())
}

#[tauri::command]
pub async fn disconnect(state: State<'_, AppState>) -> Result<(), String> {
    storage::delete_credential(storage::KEY_API_ENDPOINT)
        .map_err(|e| format!("Failed to delete endpoint: {}", e))?;
    storage::delete_credential(storage::KEY_API_TOKEN)
        .map_err(|e| format!("Failed to delete token: {}", e))?;
    
    *state.api_client.lock().unwrap() = None;
    
    Ok(())
}

#[tauri::command]
pub async fn get_connection_status(
    state: State<'_, AppState>,
) -> Result<ConnectionStatus, String> {
    let client = state.api_client.lock().unwrap();
    let endpoint = client.as_ref().map(|c| c.base_url().to_string());
    
    Ok(ConnectionStatus {
        connected: client.is_some(),
        endpoint,
    })
}

#[tauri::command]
pub async fn test_connection(state: State<'_, AppState>) -> Result<bool, String> {
    let client = state.api_client.lock().unwrap();
    match &*client {
        Some(api) => {
            match api.get::<HealthResponse>("/health").await {
                Ok(_) => Ok(true),
                Err(e) => Err(format!("Connection test failed: {}", e)),
            }
        }
        None => Ok(false),
    }
}

#[tauri::command]
pub async fn restore_connection(state: State<'_, AppState>) -> Result<bool, String> {
    // Try to restore connection from stored credentials
    let endpoint = storage::get_credential(storage::KEY_API_ENDPOINT)
        .map_err(|e| format!("Failed to get endpoint: {}", e))?;
    let token = storage::get_credential(storage::KEY_API_TOKEN)
        .map_err(|e| format!("Failed to get token: {}", e))?;
    
    match (endpoint, token) {
        (Some(endpoint), Some(token)) => {
            let client = ApiClient::new(endpoint, token)
                .map_err(|e| format!("Failed to create client: {}", e))?;
            
            // Test if connection still works
            match client.get::<HealthResponse>("/health").await {
                Ok(_) => {
                    *state.api_client.lock().unwrap() = Some(client);
                    Ok(true)
                }
                Err(_) => {
                    // Connection failed, clear stored credentials
                    let _ = storage::delete_credential(storage::KEY_API_ENDPOINT);
                    let _ = storage::delete_credential(storage::KEY_API_TOKEN);
                    Ok(false)
                }
            }
        }
        _ => Ok(false),
    }
}
```

---

## Project Commands

```rust
// src-tauri/src/commands/projects.rs

use crate::commands::auth::AppState;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Serialize, Deserialize, Clone)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
    pub status: String,
    pub container_port: Option<i32>,
    pub opencode_url: Option<String>,
}

#[derive(Serialize, Deserialize)]
pub struct ProjectListResponse {
    pub projects: Vec<Project>,
}

#[derive(Serialize)]
struct CreateProjectRequest {
    name: String,
    description: Option<String>,
    source: ProjectSource,
}

#[derive(Serialize)]
struct ProjectSource {
    r#type: String,
}

fn get_client(state: &State<'_, AppState>) -> Result<crate::services::api::ApiClient, String> {
    let guard = state.api_client.lock().unwrap();
    guard.clone().ok_or_else(|| "Not connected".to_string())
}

#[tauri::command]
pub async fn list_projects(state: State<'_, AppState>) -> Result<Vec<Project>, String> {
    let client = get_client(&state)?;
    let response: ProjectListResponse = client.get("/api/projects")
        .await
        .map_err(|e| format!("Failed to list projects: {}", e))?;
    Ok(response.projects)
}

#[tauri::command]
pub async fn get_project(state: State<'_, AppState>, id: String) -> Result<Project, String> {
    let client = get_client(&state)?;
    client.get(&format!("/api/projects/{}", id))
        .await
        .map_err(|e| format!("Failed to get project: {}", e))
}

#[tauri::command]
pub async fn create_project(
    state: State<'_, AppState>,
    name: String,
    description: Option<String>,
) -> Result<Project, String> {
    let client = get_client(&state)?;
    let request = CreateProjectRequest {
        name,
        description,
        source: ProjectSource {
            r#type: "empty".to_string(),
        },
    };
    client.post("/api/projects", &request)
        .await
        .map_err(|e| format!("Failed to create project: {}", e))
}

#[tauri::command]
pub async fn delete_project(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let client = get_client(&state)?;
    client.delete(&format!("/api/projects/{}", id))
        .await
        .map_err(|e| format!("Failed to delete project: {}", e))
}

#[tauri::command]
pub async fn start_project(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let client = get_client(&state)?;
    client.post_empty(&format!("/api/projects/{}/start", id))
        .await
        .map_err(|e| format!("Failed to start project: {}", e))
}

#[tauri::command]
pub async fn stop_project(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let client = get_client(&state)?;
    client.post_empty(&format!("/api/projects/{}/stop", id))
        .await
        .map_err(|e| format!("Failed to stop project: {}", e))
}
```

---

## Svelte API Wrapper

```typescript
// src/lib/api/tauri.ts

import { invoke } from '@tauri-apps/api/core';

export interface Project {
  id: string;
  name: string;
  slug: string;
  description?: string;
  status: string;
  container_port?: number;
  opencode_url?: string;
}

export interface ConnectionStatus {
  connected: boolean;
  endpoint?: string;
}

export const api = {
  // Auth
  async connect(endpoint: string, token: string): Promise<void> {
    return invoke('connect', { endpoint, token });
  },
  
  async disconnect(): Promise<void> {
    return invoke('disconnect');
  },
  
  async getConnectionStatus(): Promise<ConnectionStatus> {
    return invoke('get_connection_status');
  },
  
  async testConnection(): Promise<boolean> {
    return invoke('test_connection');
  },
  
  async restoreConnection(): Promise<boolean> {
    return invoke('restore_connection');
  },
  
  // Projects
  async listProjects(): Promise<Project[]> {
    return invoke('list_projects');
  },
  
  async getProject(id: string): Promise<Project> {
    return invoke('get_project', { id });
  },
  
  async createProject(name: string, description?: string): Promise<Project> {
    return invoke('create_project', { name, description });
  },
  
  async deleteProject(id: string): Promise<void> {
    return invoke('delete_project', { id });
  },
  
  async startProject(id: string): Promise<void> {
    return invoke('start_project', { id });
  },
  
  async stopProject(id: string): Promise<void> {
    return invoke('stop_project', { id });
  },
};
```

---

## Svelte Stores (Svelte 5 Runes)

```typescript
// src/lib/stores/connection.svelte.ts

import { api, type ConnectionStatus } from '$lib/api/tauri';

class ConnectionStore {
  status = $state<ConnectionStatus>({ connected: false });
  loading = $state(false);
  error = $state<string | null>(null);
  
  get isConnected() {
    return this.status.connected;
  }
  
  get endpoint() {
    return this.status.endpoint;
  }
  
  async checkConnection() {
    this.loading = true;
    this.error = null;
    
    try {
      // Try to restore from stored credentials
      const restored = await api.restoreConnection();
      if (restored) {
        this.status = await api.getConnectionStatus();
      } else {
        this.status = { connected: false };
      }
      return this.status.connected;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      this.status = { connected: false };
      return false;
    } finally {
      this.loading = false;
    }
  }
  
  async connect(endpoint: string, token: string) {
    this.loading = true;
    this.error = null;
    
    try {
      await api.connect(endpoint, token);
      this.status = { connected: true, endpoint };
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      this.loading = false;
    }
  }
  
  async disconnect() {
    this.loading = true;
    this.error = null;
    
    try {
      await api.disconnect();
      this.status = { connected: false };
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      this.loading = false;
    }
  }
}

export const connectionStore = new ConnectionStore();
```

```typescript
// src/lib/stores/projects.svelte.ts

import { api, type Project } from '$lib/api/tauri';

class ProjectsStore {
  projects = $state<Project[]>([]);
  loading = $state(false);
  error = $state<string | null>(null);
  
  async loadProjects() {
    this.loading = true;
    this.error = null;
    
    try {
      this.projects = await api.listProjects();
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      this.loading = false;
    }
  }
  
  async createProject(name: string, description?: string) {
    this.loading = true;
    this.error = null;
    
    try {
      const project = await api.createProject(name, description);
      this.projects = [...this.projects, project];
      return project;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      this.loading = false;
    }
  }
  
  async deleteProject(id: string) {
    try {
      await api.deleteProject(id);
      this.projects = this.projects.filter(p => p.id !== id);
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      throw e;
    }
  }
  
  async startProject(id: string) {
    try {
      await api.startProject(id);
      await this.loadProjects(); // Refresh to get updated status
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      throw e;
    }
  }
  
  async stopProject(id: string) {
    try {
      await api.stopProject(id);
      await this.loadProjects(); // Refresh to get updated status
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      throw e;
    }
  }
}

export const projectsStore = new ProjectsStore();
```

---

## Responsive Layout Pattern

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { connectionStore } from '$lib/stores/connection.svelte';
  import { MediaQuery } from 'svelte/reactivity';
  import * as Sidebar from '$lib/components/ui/sidebar';
  import * as Drawer from '$lib/components/ui/drawer';
  
  let { children } = $props();
  
  const isDesktop = new MediaQuery('(min-width: 768px)');
  let drawerOpen = $state(false);
  let initialized = $state(false);
  
  onMount(async () => {
    const connected = await connectionStore.checkConnection();
    initialized = true;
    
    // Redirect to setup if not connected (except if already on setup page)
    if (!connected && !$page.url.pathname.startsWith('/setup')) {
      goto('/setup');
    }
  });
</script>

{#if !initialized}
  <div class="flex h-screen items-center justify-center">
    <p>Loading...</p>
  </div>
{:else if isDesktop.current}
  <!-- Desktop: Sidebar layout -->
  <Sidebar.Provider>
    <Sidebar.Root>
      <Sidebar.Content>
        <!-- Navigation items -->
      </Sidebar.Content>
    </Sidebar.Root>
    <main class="flex-1">
      {@render children()}
    </main>
  </Sidebar.Provider>
{:else}
  <!-- Mobile: Drawer layout -->
  <div class="flex flex-col h-screen">
    <header class="flex items-center p-4 border-b">
      <button onclick={() => drawerOpen = true}>
        Menu
      </button>
    </header>
    <main class="flex-1 overflow-auto">
      {@render children()}
    </main>
    <Drawer.Root bind:open={drawerOpen}>
      <Drawer.Content>
        <!-- Navigation items -->
      </Drawer.Content>
    </Drawer.Root>
  </div>
{/if}
```

---

## Tailwind CSS v4 Configuration

```css
/* src/app.css */
@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

:root {
  --radius: 0.625rem;
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.97 0 0);
  --secondary-foreground: oklch(0.205 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --accent: oklch(0.97 0 0);
  --accent-foreground: oklch(0.205 0 0);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.922 0 0);
  --input: oklch(0.922 0 0);
  --ring: oklch(0.708 0 0);
  --sidebar: oklch(0.985 0 0);
  --sidebar-foreground: oklch(0.145 0 0);
  --sidebar-primary: oklch(0.205 0 0);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.97 0 0);
  --sidebar-accent-foreground: oklch(0.205 0 0);
  --sidebar-border: oklch(0.922 0 0);
  --sidebar-ring: oklch(0.708 0 0);
}

.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.205 0 0);
  --card-foreground: oklch(0.985 0 0);
  --popover: oklch(0.269 0 0);
  --popover-foreground: oklch(0.985 0 0);
  --primary: oklch(0.922 0 0);
  --primary-foreground: oklch(0.205 0 0);
  --secondary: oklch(0.269 0 0);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.269 0 0);
  --muted-foreground: oklch(0.708 0 0);
  --accent: oklch(0.371 0 0);
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.704 0.191 22.216);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 15%);
  --ring: oklch(0.556 0 0);
  --sidebar: oklch(0.205 0 0);
  --sidebar-foreground: oklch(0.985 0 0);
  --sidebar-primary: oklch(0.488 0.243 264.376);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.269 0 0);
  --sidebar-accent-foreground: oklch(0.985 0 0);
  --sidebar-border: oklch(1 0 0 / 10%);
  --sidebar-ring: oklch(0.439 0 0);
}

@theme inline {
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
  }
}
```

---

## Permissions Configuration

Update `src-tauri/capabilities/default.json`:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Default capability for the app",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "opener:default",
    "oauth:allow-start",
    "oauth:allow-cancel"
  ]
}
```

---

## Development Commands

```bash
# Start development (desktop)
pnpm tauri dev

# Build for production
pnpm tauri build

# Run Rust tests
cd src-tauri && cargo test

# Type check frontend
pnpm check
```
