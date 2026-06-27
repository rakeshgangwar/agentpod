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

---

## Container Tiers Implementation

### Overview

Container tiers allow users to select different resource allocations for their OpenCode containers. Each tier has specific CPU, memory, and storage limits, and the Desktop tier includes VNC access for a full graphical environment.

### Database Schema

```sql
-- container_tiers table (seeded via migration 5)
CREATE TABLE IF NOT EXISTS container_tiers (
  id TEXT PRIMARY KEY,              -- 'lite', 'standard', 'pro', 'desktop'
  name TEXT NOT NULL,               -- Display name
  description TEXT,                 -- Tier description
  image_type TEXT NOT NULL,         -- 'cli' or 'desktop'
  cpu_limit TEXT NOT NULL,          -- Docker CPU limit: '1', '2', '4', '8'
  memory_limit TEXT NOT NULL,       -- Docker memory: '2g', '4g', '8g', '16g'
  memory_reservation TEXT,          -- Memory reservation
  storage_gb INTEGER NOT NULL,      -- Storage allocation
  has_desktop_access INTEGER DEFAULT 0,  -- VNC available
  is_default INTEGER DEFAULT 0,     -- Default tier for new projects
  sort_order INTEGER DEFAULT 0,     -- Display order
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Seeded tiers
INSERT INTO container_tiers VALUES
  ('lite', 'Lite', 'Basic tier...', 'cli', '1', '2g', '1g', 20, 0, 1, 1),
  ('standard', 'Standard', '...', 'cli', '2', '4g', '2g', 30, 0, 0, 2),
  ('pro', 'Pro', '...', 'cli', '4', '8g', '4g', 50, 0, 0, 3),
  ('desktop', 'Desktop', '...', 'desktop', '8', '16g', '8g', 75, 1, 0, 4);
```

### Container Tier Model

```typescript
// management-api/src/models/container-tier.ts

export interface ContainerTier {
  id: string;                    // 'lite', 'standard', 'pro', 'desktop'
  name: string;                  // Display name
  description: string | null;
  image_type: 'cli' | 'desktop';
  cpu_limit: string;             // e.g., '1', '2', '4'
  memory_limit: string;          // e.g., '2g', '4g'
  memory_reservation: string | null;
  storage_gb: number;
  has_desktop_access: boolean;
  is_default: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// Helper functions
export function getImageNameForTier(
  tier: ContainerTier, 
  registry: string, 
  owner: string
): string {
  const imageName = tier.image_type === 'desktop' ? 'opencode-desktop' : 'opencode-cli';
  return `${registry}/${owner}/${imageName}`;
}

export function getResourceLimitsForTier(tier: ContainerTier): {
  limits_memory: string;
  limits_memory_reservation: string;
  limits_cpus: string;
} {
  return {
    limits_memory: tier.memory_limit,
    limits_memory_reservation: tier.memory_reservation || tier.memory_limit,
    limits_cpus: tier.cpu_limit,
  };
}

export function getExposedPortsForTier(tier: ContainerTier): string {
  if (tier.has_desktop_access) {
    // OpenCode API + noVNC
    return '4096,6080';
  }
  return '4096';
}
```

### API Routes

```typescript
// management-api/src/routes/container-tiers.ts

// GET /api/container-tiers - List all tiers
// Returns enriched tier data with exposedPorts and imageName

// GET /api/container-tiers/:id - Get specific tier

// GET /api/container-tiers/default - Get default tier
```

### VNC Domain Generation

Desktop containers require two domains - one for OpenCode API and one for noVNC:

```typescript
// management-api/src/services/project-manager.ts

// Step 3: Generate FQDNs for the container
let fqdnUrl: string | null = null;
let vncUrl: string | null = null;
let domainsConfig: string | undefined;

if (config.opencode.wildcardDomain) {
  // Main OpenCode API domain
  fqdnUrl = `https://opencode-${slug}.${config.opencode.wildcardDomain}`;
  
  // For desktop tier, add separate VNC domain
  if (tier.has_desktop_access) {
    vncUrl = `https://vnc-${slug}.${config.opencode.wildcardDomain}`;
    // Coolify format: domain1:port1,domain2:port2
    domainsConfig = `${fqdnUrl}:4096,${vncUrl}:6080`;
  } else {
    domainsConfig = fqdnUrl;
  }
}
```

### Coolify Configuration

When creating a desktop container, Coolify is configured with:

```typescript
// ports_exposes: "4096,6080"
// domains: "https://opencode-myproject.domain.com:4096,https://vnc-myproject.domain.com:6080"

await coolify.updateApplication(coolifyApp.uuid, {
  ports_exposes: exposedPorts,  // "4096,6080" for desktop
  domains: domainsConfig,
  health_check_enabled: false,
  limits_memory: tier.memory_limit,      // "16g"
  limits_memory_reservation: tier.memory_reservation,  // "8g"
  limits_cpus: tier.cpu_limit,           // "8"
});
```

### Project Model with VNC URL

```typescript
// management-api/src/models/project.ts

export interface Project {
  // ... other fields
  fqdnUrl: string | null;   // OpenCode API URL
  vncUrl: string | null;    // VNC/Desktop URL (desktop tier only)
  containerTierId: string;  // 'lite', 'standard', 'pro', 'desktop'
}

// CreateProjectInput includes vncUrl
export interface CreateProjectInput {
  // ... other fields
  vncUrl?: string;
  containerTierId?: string;
}
```

### Mobile App Tier Selector

```svelte
<!-- src/lib/components/tier-selector.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  
  interface ContainerTier {
    id: string;
    name: string;
    description: string;
    cpuLimit: string;
    memoryLimit: string;
    storageGb: number;
    hasDesktopAccess: boolean;
    isDefault: boolean;
  }
  
  let { value = $bindable(), disabled = false } = $props();
  let tiers = $state<ContainerTier[]>([]);
  let loading = $state(true);
  
  onMount(async () => {
    try {
      const result = await invoke<{ tiers: ContainerTier[] }>('list_container_tiers');
      tiers = result.tiers;
      
      // Set default if no value
      if (!value) {
        const defaultTier = tiers.find(t => t.isDefault);
        if (defaultTier) value = defaultTier.id;
      }
    } catch (e) {
      console.error('Failed to load tiers:', e);
    } finally {
      loading = false;
    }
  });
</script>

<div class="tier-selector">
  {#each tiers as tier}
    <button
      class="tier-card"
      class:selected={value === tier.id}
      onclick={() => value = tier.id}
      {disabled}
    >
      <h4>{tier.name}</h4>
      <p>{tier.description}</p>
      <div class="specs">
        <span>{tier.cpuLimit} CPU</span>
        <span>{tier.memoryLimit} RAM</span>
        <span>{tier.storageGb}GB Storage</span>
        {#if tier.hasDesktopAccess}
          <span class="badge">VNC Desktop</span>
        {/if}
      </div>
    </button>
  {/each}
</div>
```

### Desktop Container Access

After creating a desktop tier project, users can access:

1. **OpenCode Chat API**: `https://opencode-{slug}.domain.com`
   - Used by the mobile app for chat interface
   - Standard OpenCode API endpoints

2. **VNC Desktop**: `https://vnc-{slug}.domain.com/vnc.html`
   - Full graphical desktop environment (Openbox)
   - Access via browser using noVNC
   - Includes Firefox, file manager, terminal, text editor

### Project API Response

```json
{
  "project": {
    "id": "abc123",
    "name": "My Desktop Project",
    "slug": "my-desktop-project",
    "fqdnUrl": "https://opencode-my-desktop-project.superchotu.com",
    "vncUrl": "https://vnc-my-desktop-project.superchotu.com",
    "containerTierId": "desktop",
    "status": "running"
  }
}
```

The mobile app can use `vncUrl` to provide an "Open Desktop" button that opens the VNC interface in a webview or browser.

---

## Docker Images

### CLI Image (opencode-cli)

Used for lite, standard, and pro tiers:
- Node.js 20 + OpenCode
- Git, curl, jq
- Exposes port 4096

### Desktop Image (opencode-desktop)

Used for desktop tier:
- Ubuntu base with X11
- Openbox window manager
- tint2 panel
- x11vnc + noVNC
- Firefox ESR, file manager, text editor
- Node.js, Python, Go, Rust
- Exposes ports 4096 (OpenCode) and 6080 (noVNC)

Both images are built and pushed to Forgejo Container Registry:
- `forgejo.superchotu.com/rakeshgangwar/opencode-cli:0.0.3`
- `forgejo.superchotu.com/rakeshgangwar/opencode-desktop:0.0.3`

