# Phase 5: Technical Notes

## OAuth Implementation

### GitHub Copilot Device Flow

```rust
// src-tauri/src/services/oauth.rs

use serde::{Deserialize, Serialize};

const GITHUB_DEVICE_CODE_URL: &str = "https://github.com/login/device/code";
const GITHUB_TOKEN_URL: &str = "https://github.com/login/oauth/access_token";
const GITHUB_COPILOT_CLIENT_ID: &str = "Iv1.b507a08c87ecfe98"; // Public client ID

#[derive(Serialize)]
struct DeviceCodeRequest {
    client_id: String,
    scope: String,
}

#[derive(Deserialize)]
pub struct DeviceCodeResponse {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub expires_in: u32,
    pub interval: u32,
}

#[derive(Deserialize)]
pub struct TokenResponse {
    pub access_token: Option<String>,
    pub token_type: Option<String>,
    pub error: Option<String>,
    pub error_description: Option<String>,
}

pub async fn github_copilot_initiate() -> Result<DeviceCodeResponse, String> {
    let client = reqwest::Client::new();
    
    let response = client
        .post(GITHUB_DEVICE_CODE_URL)
        .header("Accept", "application/json")
        .form(&DeviceCodeRequest {
            client_id: GITHUB_COPILOT_CLIENT_ID.to_string(),
            scope: "read:user".to_string(),
        })
        .send()
        .await
        .map_err(|e| e.to_string())?;
    
    response.json().await.map_err(|e| e.to_string())
}

pub async fn github_copilot_poll(device_code: &str) -> Result<Option<String>, String> {
    let client = reqwest::Client::new();
    
    #[derive(Serialize)]
    struct TokenRequest {
        client_id: String,
        device_code: String,
        grant_type: String,
    }
    
    let response = client
        .post(GITHUB_TOKEN_URL)
        .header("Accept", "application/json")
        .form(&TokenRequest {
            client_id: GITHUB_COPILOT_CLIENT_ID.to_string(),
            device_code: device_code.to_string(),
            grant_type: "urn:ietf:params:oauth:grant-type:device_code".to_string(),
        })
        .send()
        .await
        .map_err(|e| e.to_string())?;
    
    let token_response: TokenResponse = response.json().await.map_err(|e| e.to_string())?;
    
    if let Some(token) = token_response.access_token {
        return Ok(Some(token));
    }
    
    // Check for pending/slow_down errors (user hasn't completed auth yet)
    if let Some(error) = token_response.error {
        if error == "authorization_pending" || error == "slow_down" {
            return Ok(None); // Keep polling
        }
        return Err(token_response.error_description.unwrap_or(error));
    }
    
    Ok(None)
}
```

### OAuth Commands

```rust
// src-tauri/src/commands/auth.rs (additions)

#[derive(Serialize)]
pub struct OAuthChallenge {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub expires_in: u32,
    pub interval: u32,
}

#[tauri::command]
pub async fn initiate_oauth(provider: String) -> Result<OAuthChallenge, String> {
    match provider.as_str() {
        "github-copilot" => {
            let response = crate::services::oauth::github_copilot_initiate().await?;
            Ok(OAuthChallenge {
                device_code: response.device_code,
                user_code: response.user_code,
                verification_uri: response.verification_uri,
                expires_in: response.expires_in,
                interval: response.interval,
            })
        }
        _ => Err(format!("Unknown OAuth provider: {}", provider)),
    }
}

#[tauri::command]
pub async fn poll_oauth(provider: String, device_code: String) -> Result<Option<String>, String> {
    match provider.as_str() {
        "github-copilot" => {
            crate::services::oauth::github_copilot_poll(&device_code).await
        }
        _ => Err(format!("Unknown OAuth provider: {}", provider)),
    }
}
```

### OAuth UI Component

```svelte
<!-- src/lib/components/OAuthDeviceFlow.svelte -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { open } from '@tauri-apps/plugin-shell';
  
  export let provider: string;
  export let onSuccess: (token: string) => void;
  export let onCancel: () => void;
  
  let challenge: any = null;
  let error = '';
  let polling = false;
  let pollInterval: ReturnType<typeof setInterval>;
  
  onMount(async () => {
    try {
      challenge = await invoke('initiate_oauth', { provider });
      startPolling();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to initiate OAuth';
    }
  });
  
  onDestroy(() => {
    if (pollInterval) clearInterval(pollInterval);
  });
  
  function startPolling() {
    polling = true;
    pollInterval = setInterval(async () => {
      try {
        const token = await invoke('poll_oauth', {
          provider,
          deviceCode: challenge.device_code,
        });
        
        if (token) {
          clearInterval(pollInterval);
          polling = false;
          onSuccess(token as string);
        }
      } catch (e) {
        clearInterval(pollInterval);
        polling = false;
        error = e instanceof Error ? e.message : 'Authentication failed';
      }
    }, (challenge?.interval || 5) * 1000);
  }
  
  async function openBrowser() {
    await open(challenge.verification_uri);
  }
</script>

<div class="oauth-flow">
  {#if error}
    <div class="error">
      <p>{error}</p>
      <button on:click={onCancel}>Close</button>
    </div>
  {:else if challenge}
    <h2>Authenticate with GitHub</h2>
    
    <div class="code-display">
      <p>Enter this code:</p>
      <div class="code">{challenge.user_code}</div>
    </div>
    
    <button class="primary" on:click={openBrowser}>
      Open GitHub
    </button>
    
    <p class="hint">
      {#if polling}
        Waiting for authentication...
      {:else}
        Enter the code at {challenge.verification_uri}
      {/if}
    </p>
    
    <button class="secondary" on:click={onCancel}>Cancel</button>
  {:else}
    <p>Loading...</p>
  {/if}
</div>

<style>
  .oauth-flow {
    padding: 2rem;
    text-align: center;
  }
  
  .code-display {
    margin: 2rem 0;
  }
  
  .code {
    font-size: 2rem;
    font-family: monospace;
    font-weight: bold;
    letter-spacing: 0.2em;
    padding: 1rem;
    background: #f0f0f0;
    border-radius: 8px;
  }
  
  .primary {
    background: #007aff;
    color: white;
    border: none;
    padding: 1rem 2rem;
    border-radius: 8px;
    font-size: 1rem;
    cursor: pointer;
  }
  
  .secondary {
    background: none;
    border: none;
    color: #666;
    padding: 1rem;
    cursor: pointer;
  }
  
  .hint {
    margin-top: 1rem;
    color: #666;
    font-size: 0.9rem;
  }
</style>
```

---

## Push Notifications

### Tauri Notification Setup

```toml
# src-tauri/Cargo.toml
[dependencies]
tauri-plugin-notification = "2"
```

```rust
// src-tauri/src/lib.rs
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        // ... other plugins
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### Request Notification Permission

```typescript
// src/lib/services/notifications.ts
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';

export async function setupNotifications() {
  let permission = await isPermissionGranted();
  
  if (!permission) {
    const result = await requestPermission();
    permission = result === 'granted';
  }
  
  return permission;
}

export async function showNotification(title: string, body: string) {
  const permission = await isPermissionGranted();
  if (permission) {
    sendNotification({ title, body });
  }
}
```

### Server-Side Push (Management API)

```typescript
// management-api/src/services/push.ts

import admin from 'firebase-admin';

// Initialize Firebase Admin (for Android)
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

export async function sendPushNotification(
  deviceToken: string,
  title: string,
  body: string,
  data?: Record<string, string>
) {
  // For FCM (Android)
  const message = {
    notification: { title, body },
    data: data || {},
    token: deviceToken,
  };
  
  await admin.messaging().send(message);
}

// Webhook endpoint called by OpenCode plugin
export async function handleSessionComplete(projectId: string, sessionId: string) {
  // Get device tokens for project owner
  const tokens = await getDeviceTokensForProject(projectId);
  
  for (const token of tokens) {
    await sendPushNotification(
      token,
      'Task Complete',
      'Your OpenCode task has finished',
      {
        projectId,
        sessionId,
        action: 'open_session',
      }
    );
  }
}
```

---

## Offline Support

### Local Cache with SQLite

```typescript
// src/lib/services/cache.ts
import Database from '@tauri-apps/plugin-sql';

let db: Database;

export async function initCache() {
  db = await Database.load('sqlite:cache.db');
  
  await db.execute(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
  
  await db.execute(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      data TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
}

export async function cacheProject(project: Project) {
  await db.execute(
    'INSERT OR REPLACE INTO projects (id, data, updated_at) VALUES (?, ?, ?)',
    [project.id, JSON.stringify(project), Date.now()]
  );
}

export async function getCachedProjects(): Promise<Project[]> {
  const rows = await db.select<{ data: string }[]>(
    'SELECT data FROM projects ORDER BY updated_at DESC'
  );
  return rows.map((row) => JSON.parse(row.data));
}

export async function cacheSession(session: Session) {
  await db.execute(
    'INSERT OR REPLACE INTO sessions (id, project_id, data, updated_at) VALUES (?, ?, ?, ?)',
    [session.id, session.projectId, JSON.stringify(session), Date.now()]
  );
}

export async function getCachedSessions(projectId: string): Promise<Session[]> {
  const rows = await db.select<{ data: string }[]>(
    'SELECT data FROM sessions WHERE project_id = ? ORDER BY updated_at DESC',
    [projectId]
  );
  return rows.map((row) => JSON.parse(row.data));
}
```

### Network State Detection

```typescript
// src/lib/stores/network.ts
import { writable } from 'svelte/store';

export const isOnline = writable(true);

// In browser
if (typeof window !== 'undefined') {
  isOnline.set(navigator.onLine);
  
  window.addEventListener('online', () => isOnline.set(true));
  window.addEventListener('offline', () => isOnline.set(false));
}
```

### Offline-Aware Data Fetching

```typescript
// src/lib/stores/projects.ts (updated)

import { get } from 'svelte/store';
import { isOnline } from './network';
import { getCachedProjects, cacheProject } from '$lib/services/cache';

export async function loadProjects() {
  loading.set(true);
  error.set(null);
  
  // Try to load from network
  if (get(isOnline)) {
    try {
      const result = await api.listProjects();
      projects.set(result.projects);
      
      // Cache for offline use
      for (const project of result.projects) {
        await cacheProject(project);
      }
      
      return;
    } catch (e) {
      // Fall through to cache
    }
  }
  
  // Load from cache
  try {
    const cached = await getCachedProjects();
    projects.set(cached);
    
    if (!get(isOnline)) {
      error.set('Showing cached data - you are offline');
    }
  } catch (e) {
    error.set('Failed to load projects');
  } finally {
    loading.set(false);
  }
}
```

---

## Deep Linking

### Tauri Deep Link Setup

```json
// src-tauri/tauri.conf.json
{
  "app": {
    "identifier": "com.yourname.portable-command-center",
    "deepLink": {
      "protocol": "pcc"
    }
  }
}
```

### Handle Deep Links

```rust
// src-tauri/src/lib.rs

use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            #[cfg(any(target_os = "ios", target_os = "android"))]
            {
                let handle = app.handle().clone();
                app.listen_global("deep-link", move |event| {
                    if let Some(url) = event.payload() {
                        handle.emit_all("deep-link-received", url).unwrap();
                    }
                });
            }
            Ok(())
        })
        // ...
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

```typescript
// src/lib/services/deeplinks.ts
import { listen } from '@tauri-apps/api/event';
import { goto } from '$app/navigation';

export async function setupDeepLinks() {
  await listen('deep-link-received', (event) => {
    const url = event.payload as string;
    handleDeepLink(url);
  });
}

function handleDeepLink(url: string) {
  // pcc://projects/123/sessions/456
  const parsed = new URL(url);
  const path = parsed.pathname;
  
  // Navigate to appropriate screen
  goto(path);
}
```
