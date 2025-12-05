# Phase 3: Technical Notes

## Tauri v2 Mobile Setup

### Prerequisites Installation

```bash
# macOS
xcode-select --install
brew install cocoapods

# Rust targets for iOS
rustup target add aarch64-apple-ios
rustup target add aarch64-apple-ios-sim  # For Apple Silicon simulators
rustup target add x86_64-apple-ios       # For Intel simulators

# Rust targets for Android
rustup target add aarch64-linux-android
rustup target add armv7-linux-androideabi
rustup target add i686-linux-android
rustup target add x86_64-linux-android
```

### Initialize Mobile

```bash
# From project root
cd src-tauri

# Initialize iOS
cargo tauri ios init

# Initialize Android
cargo tauri android init
```

### Development Commands

```bash
# iOS development
cargo tauri ios dev

# Android development
cargo tauri android dev

# Build for release
cargo tauri ios build
cargo tauri android build
```

---

## Rust Project Structure

### Cargo.toml

```toml
[package]
name = "portable-command-center"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-shell = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
reqwest = { version = "0.11", features = ["json", "rustls-tls"], default-features = false }
keyring = "2"
thiserror = "1"
```

### lib.rs

```rust
// src-tauri/src/lib.rs

mod commands;
mod services;
mod models;

use commands::{auth, projects, settings};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            // Auth commands
            auth::connect,
            auth::disconnect,
            auth::get_connection_status,
            auth::test_connection,
            
            // Project commands
            projects::list_projects,
            projects::get_project,
            projects::create_project,
            projects::delete_project,
            projects::start_project,
            projects::stop_project,
            
            // Settings commands
            settings::get_settings,
            settings::save_settings,
            settings::get_providers,
            settings::configure_provider,
            
            // OAuth commands
            auth::initiate_oauth,
            auth::poll_oauth,
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

pub struct ApiClient {
    client: Client,
    base_url: String,
    token: String,
}

impl ApiClient {
    pub fn new(base_url: String, token: String) -> Self {
        Self {
            client: Client::new(),
            base_url,
            token,
        }
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

const SERVICE_NAME: &str = "portable-command-center";

#[derive(Error, Debug)]
pub enum StorageError {
    #[error("Keyring error: {0}")]
    Keyring(#[from] keyring::Error),
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

#[derive(Serialize)]
pub struct ConnectionStatus {
    pub connected: bool,
    pub endpoint: Option<String>,
}

#[tauri::command]
pub async fn connect(
    state: State<'_, AppState>,
    endpoint: String,
    token: String,
) -> Result<(), String> {
    // Test connection first
    let client = ApiClient::new(endpoint.clone(), token.clone());
    client.get::<serde_json::Value>("/health")
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
    let endpoint = storage::get_credential(storage::KEY_API_ENDPOINT)
        .map_err(|e| format!("Failed to get endpoint: {}", e))?;
    
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
            api.get::<serde_json::Value>("/health")
                .await
                .map(|_| true)
                .map_err(|e| format!("Connection test failed: {}", e))
        }
        None => Ok(false),
    }
}
```

---

## Project Commands

```rust
// src-tauri/src/commands/projects.rs

use crate::services::api::ApiClient;
use crate::commands::auth::AppState;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Serialize, Deserialize)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
    pub status: String,
    pub container_port: i32,
}

#[derive(Serialize, Deserialize)]
pub struct ProjectList {
    pub projects: Vec<Project>,
}

#[derive(Deserialize)]
pub struct CreateProjectOptions {
    pub name: String,
    pub description: Option<String>,
    pub source: ProjectSource,
    pub llm_provider: Option<String>,
}

#[derive(Deserialize)]
pub struct ProjectSource {
    pub r#type: String,  // "empty" or "github"
    pub github_url: Option<String>,
    pub sync_enabled: Option<bool>,
    pub sync_direction: Option<String>,
}

fn get_client(state: &State<'_, AppState>) -> Result<ApiClient, String> {
    let guard = state.api_client.lock().unwrap();
    guard.clone().ok_or_else(|| "Not connected".to_string())
}

#[tauri::command]
pub async fn list_projects(state: State<'_, AppState>) -> Result<ProjectList, String> {
    let client = get_client(&state)?;
    client.get("/api/projects")
        .await
        .map_err(|e| format!("Failed to list projects: {}", e))
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
    options: CreateProjectOptions,
) -> Result<Project, String> {
    let client = get_client(&state)?;
    client.post("/api/projects", &options)
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
    client.post::<serde_json::Value, _>(&format!("/api/projects/{}/start", id), &())
        .await
        .map(|_| ())
        .map_err(|e| format!("Failed to start project: {}", e))
}

#[tauri::command]
pub async fn stop_project(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let client = get_client(&state)?;
    client.post::<serde_json::Value, _>(&format!("/api/projects/{}/stop", id), &())
        .await
        .map(|_| ())
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
  container_port: number;
}

export interface ConnectionStatus {
  connected: boolean;
  endpoint?: string;
}

export interface CreateProjectOptions {
  name: string;
  description?: string;
  source: {
    type: 'empty' | 'github';
    github_url?: string;
    sync_enabled?: boolean;
    sync_direction?: string;
  };
  llm_provider?: string;
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
  
  // Projects
  async listProjects(): Promise<{ projects: Project[] }> {
    return invoke('list_projects');
  },
  
  async getProject(id: string): Promise<Project> {
    return invoke('get_project', { id });
  },
  
  async createProject(options: CreateProjectOptions): Promise<Project> {
    return invoke('create_project', { options });
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

## Svelte Stores

```typescript
// src/lib/stores/connection.ts

import { writable, derived } from 'svelte/store';
import { api, type ConnectionStatus } from '$lib/api/tauri';

export const connectionStatus = writable<ConnectionStatus>({
  connected: false,
  endpoint: undefined,
});

export const isConnected = derived(
  connectionStatus,
  ($status) => $status.connected
);

export async function checkConnection() {
  try {
    const status = await api.getConnectionStatus();
    connectionStatus.set(status);
    return status.connected;
  } catch (e) {
    connectionStatus.set({ connected: false });
    return false;
  }
}

export async function connect(endpoint: string, token: string) {
  await api.connect(endpoint, token);
  connectionStatus.set({ connected: true, endpoint });
}

export async function disconnect() {
  await api.disconnect();
  connectionStatus.set({ connected: false, endpoint: undefined });
}
```

```typescript
// src/lib/stores/projects.ts

import { writable } from 'svelte/store';
import { api, type Project, type CreateProjectOptions } from '$lib/api/tauri';

export const projects = writable<Project[]>([]);
export const loading = writable(false);
export const error = writable<string | null>(null);

export async function loadProjects() {
  loading.set(true);
  error.set(null);
  
  try {
    const result = await api.listProjects();
    projects.set(result.projects);
  } catch (e) {
    error.set(e instanceof Error ? e.message : 'Failed to load projects');
  } finally {
    loading.set(false);
  }
}

export async function createProject(options: CreateProjectOptions) {
  const project = await api.createProject(options);
  projects.update((p) => [...p, project]);
  return project;
}

export async function deleteProject(id: string) {
  await api.deleteProject(id);
  projects.update((p) => p.filter((proj) => proj.id !== id));
}
```

---

## Setup Page

```svelte
<!-- src/routes/setup/+page.svelte -->
<script lang="ts">
  import { goto } from '$app/navigation';
  import { connect } from '$lib/stores/connection';
  
  let endpoint = '';
  let token = '';
  let error = '';
  let loading = false;
  
  async function handleConnect() {
    if (!endpoint || !token) {
      error = 'Please enter both endpoint and token';
      return;
    }
    
    loading = true;
    error = '';
    
    try {
      await connect(endpoint, token);
      goto('/projects');
    } catch (e) {
      error = e instanceof Error ? e.message : 'Connection failed';
    } finally {
      loading = false;
    }
  }
</script>

<div class="setup">
  <h1>Connect to Server</h1>
  
  <form on:submit|preventDefault={handleConnect}>
    <label>
      Management API URL
      <input
        type="url"
        bind:value={endpoint}
        placeholder="http://100.x.x.x:3001"
      />
    </label>
    
    <label>
      API Token
      <input
        type="password"
        bind:value={token}
        placeholder="your-api-token"
      />
    </label>
    
    {#if error}
      <p class="error">{error}</p>
    {/if}
    
    <button type="submit" disabled={loading}>
      {loading ? 'Connecting...' : 'Connect'}
    </button>
  </form>
</div>

<style>
  .setup {
    padding: 2rem;
    max-width: 400px;
    margin: 0 auto;
  }
  
  form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  
  label {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  
  input {
    padding: 0.75rem;
    border: 1px solid #ccc;
    border-radius: 8px;
    font-size: 1rem;
  }
  
  button {
    padding: 0.75rem;
    background: #007aff;
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 1rem;
    cursor: pointer;
  }
  
  button:disabled {
    opacity: 0.5;
  }
  
  .error {
    color: red;
  }
</style>
```

---

## App Layout

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { checkConnection, isConnected } from '$lib/stores/connection';
  
  onMount(async () => {
    const connected = await checkConnection();
    
    // Redirect to setup if not connected (except if already on setup page)
    if (!connected && !$page.url.pathname.startsWith('/setup')) {
      goto('/setup');
    }
  });
</script>

<slot />
```
