# Web Preview Feature Implementation Plan

> **Status**: Planning  
> **Priority**: High  
> **Estimated Effort**: 4-6 weeks across 5 phases

## Overview

### Purpose
Enable users to see live previews of running applications within sandbox containers during development. This transforms AgentPod from a "blind coding assistant" into a complete development environment where users can interact with and verify what the AI agent is building in real-time.

### Current State
- **Terminal Access**: Full xterm.js terminal via WebSocket ✅
- **File Browser**: View/edit files with syntax highlighting ✅
- **Chat Streaming**: Real-time SSE events for agent activity ✅
- **Container Logs**: View stdout/stderr ✅
- **Web Preview**: ❌ **NOT IMPLEMENTED**

### Problem Statement
When an AI agent builds a web application (React app, API server, etc.), users cannot:
1. See the running application in a browser view
2. Test interactions with the built UI
3. Verify visual changes without manual terminal inspection
4. Experience hot-reload updates as files change

### Goal
Add a web preview feature that allows users to:
1. View any port exposed by their sandbox container
2. See live updates when the agent makes changes (hot-reload)
3. Access preview from both desktop and mobile clients
4. Optionally share preview URLs with others

---

## Architecture Options Analysis

### Option A: Subdomain-Based Routing (Recommended)

```
┌────────────────────────────────────────────────────────────────────┐
│                         User's Browser                              │
│  ┌──────────────────────┐  ┌──────────────────────────────────┐    │
│  │  AgentPod Desktop    │  │  preview-myproject-3000.localhost │    │
│  │  (Main Application)  │  │  (Iframe or New Tab)              │    │
│  └──────────┬───────────┘  └──────────────┬───────────────────┘    │
└─────────────┼──────────────────────────────┼───────────────────────┘
              │                              │
              │  api.localhost               │  preview-{slug}-{port}.localhost
              │                              │
              ▼                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        Traefik Reverse Proxy                         │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │  Routing Rules:                                                  ││
│  │  - api.localhost → Management API                                ││
│  │  - {slug}.localhost → Sandbox Homepage (nginx:80)                ││
│  │  - {slug}-api.localhost → OpenCode API (4096)                    ││
│  │  - preview-{slug}-{port}.localhost → Sandbox Port {port}  (NEW)  ││
│  └─────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
              │                              │
              │                              │
              ▼                              ▼
┌─────────────────────┐      ┌─────────────────────────────────────────┐
│   Management API    │      │            Sandbox Container             │
│   (agentpod-api)    │      │  ┌─────────────────────────────────────┐ │
│                     │      │  │  Port 80   - nginx (homepage)       │ │
│  - Auth             │      │  │  Port 4096 - OpenCode               │ │
│  - Container CRUD   │      │  │  Port 4097 - ACP Gateway            │ │
│  - Preview Proxy    │      │  │  Port 3000 - User's Dev Server  ←   │ │
│    Registration     │      │  │  Port 5173 - User's Vite Server ←   │ │
└─────────────────────┘      │  │  Port 8080 - Any other service  ←   │ │
                             │  └─────────────────────────────────────┘ │
                             └─────────────────────────────────────────┘
```

**Pros:**
- Clean URLs (`preview-myapp-3000.localhost`)
- Works with cookies (same-origin-ish)
- Full WebSocket support
- Hot-reload works out of the box
- Follows industry patterns (CodeSandbox, StackBlitz)

**Cons:**
- Requires wildcard DNS (*.localhost works locally, need *.agentpod.dev for prod)
- Slightly more complex Traefik configuration

### Option B: Path-Based Routing via API Proxy

```
GET /api/v2/sandboxes/:id/preview/:port/*
```

**Pros:**
- Simpler DNS setup
- Single domain

**Cons:**
- Cookie/auth issues (path-based cookies don't isolate well)
- WebSocket URL rewriting is complex
- Hot-reload may break
- Asset paths require rewriting

### Option C: WebSocket Tunnel (like ngrok)

```
User → API WebSocket → Container Port
```

**Pros:**
- Works through firewalls
- Single connection

**Cons:**
- All traffic tunneled (bandwidth)
- Latency
- Complex implementation
- No direct browser access

**Decision: Option A (Subdomain-Based Routing)**

This matches how industry leaders (CodeSandbox, Replit, Gitpod) implement preview features and provides the best user experience.

---

## Database Schema

### New Table: Preview Ports

```sql
-- ============================================
-- Preview Port Configuration
-- ============================================
CREATE TABLE sandbox_preview_ports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sandbox_id UUID NOT NULL REFERENCES sandboxes(id) ON DELETE CASCADE,
  port INTEGER NOT NULL,                   -- Container port (e.g., 3000)
  label VARCHAR(255),                      -- User-friendly name (e.g., "Dev Server")
  is_public BOOLEAN DEFAULT FALSE,         -- Can be shared without auth
  public_token VARCHAR(64),                -- Token for public access
  detected_framework VARCHAR(50),          -- Auto-detected (vite, next, etc.)
  last_seen_at TIMESTAMPTZ,                -- Last activity timestamp
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT unique_sandbox_port UNIQUE(sandbox_id, port),
  CONSTRAINT valid_port CHECK(port >= 1 AND port <= 65535)
);

CREATE INDEX idx_preview_ports_sandbox ON sandbox_preview_ports(sandbox_id);
CREATE INDEX idx_preview_ports_public ON sandbox_preview_ports(public_token) WHERE public_token IS NOT NULL;
```

### Drizzle Schema

```typescript
// apps/api/src/db/schema/preview-ports.ts
import { pgTable, uuid, integer, varchar, boolean, timestamp, index, unique } from 'drizzle-orm/pg-core';
import { sandboxes } from './sandboxes';

export const sandboxPreviewPorts = pgTable('sandbox_preview_ports', {
  id: uuid('id').primaryKey().defaultRandom(),
  sandboxId: uuid('sandbox_id').notNull().references(() => sandboxes.id, { onDelete: 'cascade' }),
  port: integer('port').notNull(),
  label: varchar('label', { length: 255 }),
  isPublic: boolean('is_public').default(false),
  publicToken: varchar('public_token', { length: 64 }),
  detectedFramework: varchar('detected_framework', { length: 50 }),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  sandboxIdx: index('idx_preview_ports_sandbox').on(table.sandboxId),
  publicIdx: index('idx_preview_ports_public').on(table.publicToken),
  uniqueSandboxPort: unique('unique_sandbox_port').on(table.sandboxId, table.port),
}));
```

---

## API Endpoints

### Preview Port Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v2/sandboxes/:id/preview` | List all preview ports for sandbox |
| `POST` | `/api/v2/sandboxes/:id/preview` | Register a new preview port |
| `GET` | `/api/v2/sandboxes/:id/preview/:port` | Get preview port details |
| `PUT` | `/api/v2/sandboxes/:id/preview/:port` | Update port settings (label, public) |
| `DELETE` | `/api/v2/sandboxes/:id/preview/:port` | Unregister preview port |
| `GET` | `/api/v2/sandboxes/:id/preview/:port/url` | Get the preview URL |

### Port Detection (Auto-discovery)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v2/sandboxes/:id/preview/detect` | Scan for open ports in container |
| `POST` | `/api/v2/sandboxes/:id/preview/detect` | Force re-detection |

### Public Sharing

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v2/sandboxes/:id/preview/:port/share` | Generate public share token |
| `DELETE` | `/api/v2/sandboxes/:id/preview/:port/share` | Revoke public access |

---

## Implementation Phases

### Phase 1: Backend - Dynamic Traefik Labels (1 week)

**Goal:** Generate Traefik labels dynamically to route preview traffic to container ports.

**Files to Create/Modify:**

```
apps/api/src/
├── db/
│   └── schema/
│       └── preview-ports.ts          # New Drizzle schema
├── models/
│   └── preview-port.ts               # New model for CRUD operations
├── routes/
│   └── preview.ts                    # New API routes
├── services/
│   ├── orchestrator/
│   │   └── traefik.ts                # Modify to add preview routes
│   ├── preview/
│   │   ├── index.ts                  # New preview service
│   │   ├── detector.ts               # Port detection logic
│   │   └── types.ts                  # Type definitions
│   └── sandbox-manager.ts            # Modify to register preview labels
```

**Key Implementation:**

```typescript
// apps/api/src/services/orchestrator/traefik.ts

/**
 * Generate preview port labels for dynamic routing
 */
export function generatePreviewLabels(options: {
  sandboxId: string;
  slug: string;
  baseDomain: string;
  ports: { port: number; label?: string }[];
  tls?: boolean;
  certResolver?: string;
}): Record<string, string> {
  const { sandboxId, slug, baseDomain, ports, tls, certResolver } = options;
  const labels: Record<string, string> = {};

  for (const { port, label } of ports) {
    const routerName = `${slug}-preview-${port}`;
    const subdomain = `preview-${slug}-${port}`;
    const host = `${subdomain}.${baseDomain}`;
    
    // Router rule
    labels[`traefik.http.routers.${routerName}.rule`] = `Host(\`${host}\`)`;
    labels[`traefik.http.routers.${routerName}.entrypoints`] = tls ? 'websecure' : 'web';
    labels[`traefik.http.routers.${routerName}.service`] = routerName;
    
    // TLS if enabled
    if (tls) {
      labels[`traefik.http.routers.${routerName}.tls`] = 'true';
      if (certResolver) {
        labels[`traefik.http.routers.${routerName}.tls.certresolver`] = certResolver;
      }
    }
    
    // Service (load balancer to container port)
    labels[`traefik.http.services.${routerName}.loadbalancer.server.port`] = String(port);
    
    // WebSocket support headers
    labels[`traefik.http.middlewares.${routerName}-ws.headers.customrequestheaders.Upgrade`] = 'websocket';
    labels[`traefik.http.middlewares.${routerName}-ws.headers.customrequestheaders.Connection`] = 'Upgrade';
    labels[`traefik.http.routers.${routerName}.middlewares`] = `${routerName}-ws`;
  }

  return labels;
}
```

**Container Label Update Flow:**

```typescript
// When a preview port is registered:
async function registerPreviewPort(sandboxId: string, port: number): Promise<void> {
  // 1. Add to database
  await PreviewPortModel.create({ sandboxId, port });
  
  // 2. Get current container labels
  const sandbox = await sandboxManager.getSandbox(sandboxId);
  
  // 3. Generate new labels with preview routes
  const newLabels = generatePreviewLabels({
    sandboxId,
    slug: sandbox.slug,
    baseDomain: config.baseDomain,
    ports: await PreviewPortModel.listBySandbox(sandboxId),
  });
  
  // 4. Update container labels (requires container recreate or label update)
  // Note: Docker doesn't support live label updates, so we use a workaround:
  // Option A: Recreate container (disruptive)
  // Option B: Use Traefik file provider with dynamic config
  // Option C: Use API to directly update Traefik
  await updateContainerLabels(sandboxId, newLabels);
}
```

**Traefik Dynamic Configuration (Recommended Approach):**

Instead of relying solely on Docker labels (which require container restart to update), we'll use Traefik's file provider for preview routes:

```yaml
# config/traefik/dynamic/preview-routes.yml
# This file is generated/updated by the API when preview ports change

http:
  routers:
    preview-myproject-3000:
      rule: "Host(`preview-myproject-3000.localhost`)"
      service: preview-myproject-3000
      entryPoints:
        - web
      middlewares:
        - preview-websocket
        
  services:
    preview-myproject-3000:
      loadBalancer:
        servers:
          - url: "http://agentpod-myproject:3000"

  middlewares:
    preview-websocket:
      headers:
        customRequestHeaders:
          Connection: "Upgrade"
          Upgrade: "websocket"
```

**docker-compose.yml update:**

```yaml
traefik:
  volumes:
    - ./config/traefik/dynamic:/etc/traefik/dynamic:ro
  command:
    # ... existing commands ...
    - "--providers.file.directory=/etc/traefik/dynamic"
    - "--providers.file.watch=true"
```

---

### Phase 2: Port Detection Service (1 week)

**Goal:** Automatically detect which ports have services running inside the container.

**Detection Methods:**

1. **netstat/ss scanning** - Run `ss -tlnp` inside container
2. **Process inspection** - Check for known frameworks (node, python, etc.)
3. **Config file analysis** - Parse package.json scripts, vite.config.ts, etc.
4. **Port polling** - HTTP HEAD requests to common ports

**Implementation:**

```typescript
// apps/api/src/services/preview/detector.ts

interface DetectedPort {
  port: number;
  pid?: number;
  process?: string;
  framework?: string;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Detect running services in a container by scanning open ports
 */
export async function detectOpenPorts(sandboxId: string): Promise<DetectedPort[]> {
  const results: DetectedPort[] = [];
  
  // Method 1: Run ss (socket statistics) inside container
  try {
    const { stdout } = await orchestrator.exec(sandboxId, {
      cmd: ['ss', '-tlnp'],
    });
    
    // Parse ss output
    // Example: LISTEN 0 128 0.0.0.0:3000 0.0.0.0:* users:(("node",pid=123,fd=20))
    const lines = stdout.split('\n');
    for (const line of lines) {
      const match = line.match(/:(\d+)\s.*users:\(\("([^"]+)",pid=(\d+)/);
      if (match) {
        const port = parseInt(match[1], 10);
        const process = match[2];
        
        // Skip system ports
        if (port < 1024 || port === 4096 || port === 4097) continue;
        
        results.push({
          port,
          process,
          pid: parseInt(match[3], 10),
          framework: detectFramework(process, port),
          confidence: 'high',
        });
      }
    }
  } catch (error) {
    log.warn('ss command failed, falling back to port probe', { error });
  }
  
  // Method 2: Probe common development ports
  const commonPorts = [3000, 3001, 4000, 5000, 5173, 5174, 8000, 8080, 8888];
  for (const port of commonPorts) {
    if (results.some(r => r.port === port)) continue;
    
    try {
      const isOpen = await probePort(sandboxId, port);
      if (isOpen) {
        results.push({
          port,
          framework: guessFrameworkByPort(port),
          confidence: 'medium',
        });
      }
    } catch {
      // Port not open
    }
  }
  
  return results;
}

/**
 * Detect framework from process name
 */
function detectFramework(process: string, port: number): string | undefined {
  const frameworkPatterns: Record<string, RegExp[]> = {
    'vite': [/vite/, /node.*vite/],
    'next': [/next/, /node.*next/],
    'react': [/react-scripts/],
    'vue': [/vue-cli-service/, /vite/],
    'angular': [/ng serve/, /angular/],
    'express': [/node.*express/],
    'fastapi': [/uvicorn/, /python.*fastapi/],
    'flask': [/flask/],
    'django': [/python.*manage.py/],
  };
  
  for (const [framework, patterns] of Object.entries(frameworkPatterns)) {
    if (patterns.some(p => p.test(process))) {
      return framework;
    }
  }
  
  return undefined;
}

/**
 * Guess framework by common port conventions
 */
function guessFrameworkByPort(port: number): string | undefined {
  const portFrameworks: Record<number, string> = {
    3000: 'react/next',
    3001: 'next',
    4000: 'graphql',
    5173: 'vite',
    5174: 'vite',
    8000: 'django/fastapi',
    8080: 'spring/general',
    8888: 'jupyter',
  };
  
  return portFrameworks[port];
}
```

**Auto-Detection Trigger Points:**

1. **On container start** - Scan after container is running
2. **On file change** - When package.json or config files change
3. **Periodic polling** - Every 30 seconds while container is running
4. **Manual trigger** - User clicks "Detect Ports" button

---

### Phase 3: Frontend - Preview Tab Component (1-2 weeks)

**Goal:** Add a "Preview" tab to the project view that displays running services in an iframe.

**New Files:**

```
apps/frontend/src/
├── routes/
│   └── projects/
│       └── [id]/
│           └── preview/
│               └── +page.svelte          # Preview tab route
├── lib/
│   ├── components/
│   │   └── preview/
│   │       ├── PreviewFrame.svelte       # Iframe wrapper component
│   │       ├── PreviewToolbar.svelte     # URL bar, refresh, open in new tab
│   │       ├── PortSelector.svelte       # Dropdown to select port
│   │       └── PortDetector.svelte       # Auto-detect running services
│   ├── stores/
│   │   └── preview.svelte.ts             # Preview state management
│   └── api/
│       └── tauri.ts                      # Add preview API functions
```

**Preview Tab UI:**

```svelte
<!-- apps/frontend/src/routes/projects/[id]/preview/+page.svelte -->
<script lang="ts">
  import { page } from "$app/stores";
  import { sandboxes, getSandbox } from "$lib/stores/sandboxes.svelte";
  import * as previewStore from "$lib/stores/preview.svelte";
  import PreviewFrame from "$lib/components/preview/PreviewFrame.svelte";
  import PreviewToolbar from "$lib/components/preview/PreviewToolbar.svelte";
  import PortSelector from "$lib/components/preview/PortSelector.svelte";
  import SandboxNotRunning from "$lib/components/sandbox-not-running.svelte";

  let sandboxId = $derived($page.params.id ?? "");
  let sandbox = $derived(getSandbox(sandboxId));
  
  // Preview state
  let ports = $derived(previewStore.getPortsForSandbox(sandboxId));
  let selectedPort = $state<number | null>(null);
  let previewUrl = $derived(selectedPort ? previewStore.getPreviewUrl(sandboxId, selectedPort) : null);
  
  // Auto-select first detected port
  $effect(() => {
    if (ports.length > 0 && !selectedPort) {
      selectedPort = ports[0].port;
    }
  });
  
  // Detect ports on mount
  $effect(() => {
    if (sandbox?.status === 'running') {
      previewStore.detectPorts(sandboxId);
    }
  });
</script>

{#if sandbox?.status !== 'running'}
  <SandboxNotRunning {sandbox} icon="🌐" actionText="view the preview" />
{:else}
  <div class="preview-container h-full flex flex-col">
    <!-- Toolbar -->
    <PreviewToolbar
      url={previewUrl}
      onRefresh={() => previewStore.refresh(sandboxId, selectedPort!)}
      onOpenExternal={() => window.open(previewUrl, '_blank')}
    >
      <PortSelector
        {ports}
        selected={selectedPort}
        onSelect={(port) => selectedPort = port}
        onDetect={() => previewStore.detectPorts(sandboxId)}
      />
    </PreviewToolbar>
    
    <!-- Preview Frame -->
    {#if previewUrl}
      <PreviewFrame
        url={previewUrl}
        class="flex-1"
      />
    {:else}
      <div class="flex-1 flex items-center justify-center">
        <div class="text-center space-y-4">
          <div class="text-4xl">🔍</div>
          <p class="text-muted-foreground">No running services detected</p>
          <p class="text-sm text-muted-foreground">
            Start a dev server (e.g., <code>npm run dev</code>) in the terminal
          </p>
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .preview-container {
    background: var(--background);
  }
</style>
```

**Preview Frame Component:**

```svelte
<!-- apps/frontend/src/lib/components/preview/PreviewFrame.svelte -->
<script lang="ts">
  interface Props {
    url: string;
    class?: string;
  }
  
  let { url, class: className = '' }: Props = $props();
  
  let iframeRef: HTMLIFrameElement;
  let isLoading = $state(true);
  let error = $state<string | null>(null);
  
  function handleLoad() {
    isLoading = false;
    error = null;
  }
  
  function handleError() {
    isLoading = false;
    error = 'Failed to load preview. The server may not be running.';
  }
  
  export function refresh() {
    if (iframeRef) {
      isLoading = true;
      iframeRef.src = iframeRef.src;
    }
  }
</script>

<div class="preview-frame relative {className}">
  {#if isLoading}
    <div class="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
      <div class="flex flex-col items-center gap-2">
        <div class="loading-spinner"></div>
        <span class="text-sm text-muted-foreground">Loading preview...</span>
      </div>
    </div>
  {/if}
  
  {#if error}
    <div class="absolute inset-0 flex items-center justify-center bg-background z-10">
      <div class="text-center space-y-4 p-8">
        <div class="text-4xl">⚠️</div>
        <p class="text-destructive">{error}</p>
        <button 
          class="btn btn-outline"
          onclick={refresh}
        >
          Retry
        </button>
      </div>
    </div>
  {/if}
  
  <iframe
    bind:this={iframeRef}
    src={url}
    class="w-full h-full border-0"
    sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
    on:load={handleLoad}
    on:error={handleError}
    title="Application Preview"
  />
</div>

<style>
  .preview-frame {
    background: white;
    border-radius: var(--radius);
    overflow: hidden;
  }
  
  :global(.dark) .preview-frame {
    background: #1a1a1a;
  }
  
  .loading-spinner {
    width: 24px;
    height: 24px;
    border: 2px solid var(--cyber-cyan);
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
  
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
```

**Add Preview Tab to Layout:**

```svelte
<!-- Modify apps/frontend/src/routes/projects/[id]/+layout.svelte -->
<script lang="ts">
  // ... existing imports ...
  import GlobeIcon from "@lucide/svelte/icons/globe";
  
  const tabs = [
    { id: "chat", label: "Chat", icon: MessageSquareIcon },
    { id: "files", label: "Files", icon: FolderIcon },
    { id: "preview", label: "Preview", icon: GlobeIcon },  // NEW
    { id: "logs", label: "Logs", icon: ScrollTextIcon },
    { id: "terminal", label: "Terminal", icon: TerminalIcon },
    { id: "sync", label: "Git", icon: GitBranchIcon },
    { id: "settings", label: "Settings", icon: SettingsIcon },
  ];
</script>
```

#### Console Forwarding

Capture `console.log`, `console.warn`, and `console.error` from the iframe and display in a collapsible panel.

**Architecture:**
1. Inject a script into the preview page (via middleware or postMessage listener)
2. Override console methods to post messages to parent
3. Parent receives and displays in a styled console panel

**Console Panel Component:**

```svelte
<!-- apps/frontend/src/lib/components/preview/ConsolePanel.svelte -->
<script lang="ts">
  import { onMount } from "svelte";
  import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
  import ChevronUpIcon from "@lucide/svelte/icons/chevron-up";
  import TrashIcon from "@lucide/svelte/icons/trash-2";

  interface ConsoleMessage {
    id: string;
    level: "log" | "warn" | "error" | "info";
    message: string;
    timestamp: Date;
    count: number; // For duplicate grouping
  }

  let messages = $state<ConsoleMessage[]>([]);
  let isExpanded = $state(true);
  let filter = $state<"all" | "error" | "warn">("all");

  // Listen for postMessage from iframe
  onMount(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "agentpod-console") {
        const { level, args } = event.data;
        addMessage(level, args.map(String).join(" "));
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  });

  function addMessage(level: ConsoleMessage["level"], message: string) {
    // Group duplicate messages
    const last = messages[messages.length - 1];
    if (last?.message === message && last?.level === level) {
      messages = messages.map((m, i) =>
        i === messages.length - 1 ? { ...m, count: m.count + 1 } : m
      );
    } else {
      messages = [
        ...messages,
        {
          id: crypto.randomUUID(),
          level,
          message,
          timestamp: new Date(),
          count: 1,
        },
      ].slice(-100); // Keep last 100 messages
    }
  }

  function clearMessages() {
    messages = [];
  }

  let filteredMessages = $derived(
    filter === "all" ? messages : messages.filter((m) => m.level === filter)
  );

  let errorCount = $derived(messages.filter((m) => m.level === "error").length);
  let warnCount = $derived(messages.filter((m) => m.level === "warn").length);
</script>

<div class="console-panel border-t border-border">
  <!-- Header -->
  <button
    class="w-full flex items-center justify-between px-3 py-2 bg-muted/50 hover:bg-muted"
    onclick={() => (isExpanded = !isExpanded)}
  >
    <div class="flex items-center gap-2">
      {#if isExpanded}
        <ChevronDownIcon class="w-4 h-4" />
      {:else}
        <ChevronUpIcon class="w-4 h-4" />
      {/if}
      <span class="text-sm font-medium">Console</span>
      {#if errorCount > 0}
        <span class="px-1.5 py-0.5 text-xs bg-destructive text-destructive-foreground rounded">
          {errorCount}
        </span>
      {/if}
      {#if warnCount > 0}
        <span class="px-1.5 py-0.5 text-xs bg-yellow-500 text-black rounded">
          {warnCount}
        </span>
      {/if}
    </div>
    <button
      class="p-1 hover:bg-background rounded"
      onclick|stopPropagation={clearMessages}
      title="Clear console"
    >
      <TrashIcon class="w-4 h-4" />
    </button>
  </button>

  <!-- Messages -->
  {#if isExpanded}
    <div class="max-h-48 overflow-y-auto font-mono text-xs">
      {#if filteredMessages.length === 0}
        <div class="p-3 text-muted-foreground text-center">No console output</div>
      {:else}
        {#each filteredMessages as msg (msg.id)}
          <div
            class="px-3 py-1 border-b border-border/50 flex items-start gap-2"
            class:bg-destructive/10={msg.level === "error"}
            class:text-destructive={msg.level === "error"}
            class:bg-yellow-500/10={msg.level === "warn"}
            class:text-yellow-600={msg.level === "warn"}
          >
            <span class="text-muted-foreground shrink-0">
              {msg.timestamp.toLocaleTimeString()}
            </span>
            <span class="break-all">{msg.message}</span>
            {#if msg.count > 1}
              <span class="ml-auto px-1.5 py-0.5 bg-muted rounded text-muted-foreground">
                {msg.count}
              </span>
            {/if}
          </div>
        {/each}
      {/if}
    </div>
  {/if}
</div>
```

**Script to inject into preview (via Traefik middleware or served from API):**

```javascript
// Injected console interceptor script
(function() {
  const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    info: console.info,
  };

  function sendToParent(level, args) {
    try {
      window.parent.postMessage({
        type: 'agentpod-console',
        level,
        args: Array.from(args).map(arg => {
          try {
            return typeof arg === 'object' ? JSON.stringify(arg) : String(arg);
          } catch {
            return String(arg);
          }
        }),
      }, '*');
    } catch (e) {
      // Ignore postMessage errors
    }
  }

  console.log = function(...args) {
    sendToParent('log', args);
    originalConsole.log.apply(console, args);
  };

  console.warn = function(...args) {
    sendToParent('warn', args);
    originalConsole.warn.apply(console, args);
  };

  console.error = function(...args) {
    sendToParent('error', args);
    originalConsole.error.apply(console, args);
  };

  console.info = function(...args) {
    sendToParent('info', args);
    originalConsole.info.apply(console, args);
  };

  // Also capture unhandled errors
  window.addEventListener('error', (event) => {
    sendToParent('error', [`Uncaught ${event.error?.name || 'Error'}: ${event.message}`]);
  });

  window.addEventListener('unhandledrejection', (event) => {
    sendToParent('error', [`Unhandled Promise Rejection: ${event.reason}`]);
  });
})();
```

#### Screenshot Capture

Allow users to capture a screenshot of the current preview state.

**Implementation using html2canvas:**

```typescript
// apps/frontend/src/lib/utils/screenshot.ts
import html2canvas from 'html2canvas';

/**
 * Capture a screenshot of an iframe's contents
 * Note: Due to cross-origin restrictions, we use a workaround
 */
export async function capturePreviewScreenshot(
  iframeElement: HTMLIFrameElement,
  filename: string = 'preview-screenshot.png'
): Promise<void> {
  try {
    // Method 1: If same-origin, capture directly
    const iframeDoc = iframeElement.contentDocument;
    if (iframeDoc) {
      const canvas = await html2canvas(iframeDoc.body, {
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
      });
      downloadCanvas(canvas, filename);
      return;
    }
  } catch (e) {
    // Cross-origin, fall back to Method 2
  }

  // Method 2: Use native browser screenshot API (if available)
  // This requires the iframe to have same-origin or CORS headers
  try {
    // Request screenshot from iframe via postMessage
    iframeElement.contentWindow?.postMessage({ type: 'agentpod-screenshot-request' }, '*');
    
    // Listen for response
    const response = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Screenshot timeout')), 5000);
      const handler = (event: MessageEvent) => {
        if (event.data?.type === 'agentpod-screenshot-response') {
          clearTimeout(timeout);
          window.removeEventListener('message', handler);
          resolve(event.data.dataUrl);
        }
      };
      window.addEventListener('message', handler);
    });

    // Download the image
    const link = document.createElement('a');
    link.download = filename;
    link.href = response;
    link.click();
  } catch (e) {
    console.error('Screenshot capture failed:', e);
    throw new Error('Unable to capture screenshot. The preview may have cross-origin restrictions.');
  }
}

function downloadCanvas(canvas: HTMLCanvasElement, filename: string) {
  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/png');
  link.click();
}
```

**Screenshot handler script (injected alongside console interceptor):**

```javascript
// Screenshot handler - responds to parent requests
window.addEventListener('message', async (event) => {
  if (event.data?.type === 'agentpod-screenshot-request') {
    try {
      // Use html2canvas if available, otherwise fall back to canvas API
      if (typeof html2canvas !== 'undefined') {
        const canvas = await html2canvas(document.body);
        window.parent.postMessage({
          type: 'agentpod-screenshot-response',
          dataUrl: canvas.toDataURL('image/png'),
        }, '*');
      } else {
        // Fallback: Create a simple canvas from the visible area
        // This is limited but works without external dependencies
        window.parent.postMessage({
          type: 'agentpod-screenshot-response',
          error: 'html2canvas not available',
        }, '*');
      }
    } catch (e) {
      window.parent.postMessage({
        type: 'agentpod-screenshot-response',
        error: e.message,
      }, '*');
    }
  }
});
```

**Screenshot Button in Toolbar:**

```svelte
<!-- Add to PreviewToolbar.svelte -->
<script lang="ts">
  import CameraIcon from "@lucide/svelte/icons/camera";
  import { capturePreviewScreenshot } from "$lib/utils/screenshot";
  
  interface Props {
    iframeRef?: HTMLIFrameElement;
    sandboxSlug: string;
    // ... other props
  }
  
  let { iframeRef, sandboxSlug }: Props = $props();
  let isCapturing = $state(false);
  
  async function handleScreenshot() {
    if (!iframeRef) return;
    isCapturing = true;
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      await capturePreviewScreenshot(iframeRef, `${sandboxSlug}-${timestamp}.png`);
    } catch (e) {
      console.error('Screenshot failed:', e);
      // Show toast notification
    } finally {
      isCapturing = false;
    }
  }
</script>

<button
  class="p-2 hover:bg-muted rounded"
  onclick={handleScreenshot}
  disabled={isCapturing}
  title="Capture screenshot"
>
  <CameraIcon class="w-4 h-4" class:animate-pulse={isCapturing} />
</button>
```

---

### Phase 4: Hot-Reload Integration (1 week)

**Goal:** Automatically refresh the preview when files change and the dev server recompiles.

**Approach 1: Dev Server Events (Vite/Webpack HMR)**

Most modern dev servers emit WebSocket events for hot reload. We can listen for these:

```typescript
// apps/frontend/src/lib/stores/preview.svelte.ts

/**
 * Connect to the dev server's HMR WebSocket to detect updates
 */
function connectToHMR(previewUrl: string) {
  // Vite HMR uses /__vite_hmr
  const wsUrl = new URL('/__vite_hmr', previewUrl.replace('http', 'ws'));
  
  const ws = new WebSocket(wsUrl);
  
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'full-reload' || data.type === 'update') {
      // Optionally notify UI that app is updating
      console.log('[Preview] Hot reload triggered');
    }
  };
  
  ws.onclose = () => {
    // Reconnect after delay
    setTimeout(() => connectToHMR(previewUrl), 1000);
  };
  
  return () => ws.close();
}
```

**Approach 2: File Watcher Events**

Listen for `file.edited` SSE events from OpenCode and debounce refresh:

```typescript
// In RuntimeProvider or preview store

const FILE_CHANGE_DEBOUNCE_MS = 500;
let refreshTimeout: ReturnType<typeof setTimeout> | null = null;

function handleFileChange(filePath: string) {
  // Only refresh for relevant file types
  const refreshableExtensions = ['.tsx', '.jsx', '.ts', '.js', '.css', '.scss', '.html', '.svelte', '.vue'];
  if (!refreshableExtensions.some(ext => filePath.endsWith(ext))) return;
  
  // Debounce refresh
  if (refreshTimeout) clearTimeout(refreshTimeout);
  refreshTimeout = setTimeout(() => {
    previewStore.softRefresh(sandboxId);
  }, FILE_CHANGE_DEBOUNCE_MS);
}
```

**Approach 3: Build Output Monitoring**

Watch terminal output for build completion:

```typescript
// In terminal store or preview store

const BUILD_COMPLETE_PATTERNS = [
  /ready in \d+ms/i,           // Vite
  /compiled successfully/i,     // Webpack
  /Compiled\./i,                // CRA
  /Local:.*http/i,              // Many dev servers
  /Serving!/i,                  // SvelteKit
];

function checkForBuildComplete(output: string): boolean {
  return BUILD_COMPLETE_PATTERNS.some(pattern => pattern.test(output));
}
```

---

### Phase 5: Mobile & Security (1 week)

**Goal:** Ensure preview works on mobile and has proper security controls.

**Mobile Considerations:**

1. **Responsive iframe** - Scale preview to fit mobile viewport
2. **Device toolbar** - Toggle between desktop/tablet/mobile viewport sizes
3. **Touch support** - Ensure touch events pass through to iframe
4. **External browser** - Option to open in system browser

**Security Features:**

1. **Authentication** - Only sandbox owner can access preview
2. **Public sharing** - Optional token-based public URLs with expiration
3. **iframe sandbox** - Restrict capabilities (`allow-scripts`, `allow-same-origin`, etc.)
4. **CSP headers** - Proper Content-Security-Policy on preview routes

**Public Sharing Implementation:**

```typescript
// apps/api/src/routes/preview.ts

/**
 * Generate a public share token for a preview port
 */
app.post('/api/v2/sandboxes/:id/preview/:port/share', async (c) => {
  const { id, port } = c.req.param();
  const { expiresIn = '24h' } = await c.req.json();
  
  // Generate secure token
  const token = nanoid(32);
  const expiresAt = calculateExpiration(expiresIn);
  
  await PreviewPortModel.update(id, parseInt(port), {
    isPublic: true,
    publicToken: token,
    publicExpiresAt: expiresAt,
  });
  
  const publicUrl = `${config.publicBaseUrl}/p/${token}`;
  
  return c.json({ url: publicUrl, expiresAt });
});

/**
 * Public preview access (no auth required, token-based)
 */
app.get('/p/:token', async (c) => {
  const { token } = c.req.param();
  
  const previewPort = await PreviewPortModel.findByPublicToken(token);
  if (!previewPort || !previewPort.isPublic) {
    return c.text('Preview not found or expired', 404);
  }
  
  if (previewPort.publicExpiresAt && new Date() > previewPort.publicExpiresAt) {
    return c.text('Preview link expired', 410);
  }
  
  // Redirect to actual preview URL
  const sandbox = await SandboxModel.getSandboxById(previewPort.sandboxId);
  const previewUrl = buildPreviewUrl(sandbox.slug, previewPort.port);
  
  return c.redirect(previewUrl);
});
```

---

## URL Patterns

### Development (localhost)

| Type | URL Pattern | Example |
|------|-------------|---------|
| Main Preview | `preview-{slug}-{port}.localhost` | `preview-myapp-3000.localhost` |
| Multiple Ports | `preview-{slug}-{port}.localhost` | `preview-myapp-5173.localhost` |
| Public Share | `{api-host}/p/{token}` | `api.localhost/p/abc123xyz` |

### Production (agentpod.dev)

| Type | URL Pattern | Example |
|------|-------------|---------|
| Main Preview | `preview-{slug}-{port}.agentpod.dev` | `preview-myapp-3000.agentpod.dev` |
| Public Share | `share.agentpod.dev/{token}` | `share.agentpod.dev/abc123xyz` |

---

## Files Summary

### New Files to Create

| File | Purpose |
|------|---------|
| `apps/api/src/db/schema/preview-ports.ts` | Drizzle schema for preview ports |
| `apps/api/src/models/preview-port.ts` | Preview port model/queries |
| `apps/api/src/routes/preview.ts` | Preview API endpoints |
| `apps/api/src/services/preview/index.ts` | Preview service orchestration |
| `apps/api/src/services/preview/detector.ts` | Port detection logic |
| `apps/api/src/services/preview/types.ts` | Type definitions |
| `apps/frontend/src/routes/projects/[id]/preview/+page.svelte` | Preview tab route |
| `apps/frontend/src/lib/components/preview/PreviewFrame.svelte` | Iframe wrapper |
| `apps/frontend/src/lib/components/preview/PreviewToolbar.svelte` | URL bar, controls, screenshot button |
| `apps/frontend/src/lib/components/preview/PortSelector.svelte` | Port dropdown |
| `apps/frontend/src/lib/components/preview/ConsolePanel.svelte` | Console output display (log/warn/error) |
| `apps/frontend/src/lib/stores/preview.svelte.ts` | Preview state management |
| `apps/frontend/src/lib/utils/screenshot.ts` | Screenshot capture utility |
| `apps/api/src/services/preview/injected-scripts.ts` | Console interceptor & screenshot handler scripts |
| `config/traefik/dynamic/.gitkeep` | Dynamic Traefik config directory |

### Files to Modify

| File | Change |
|------|--------|
| `apps/api/src/db/schema/index.ts` | Export preview-ports schema |
| `apps/api/src/routes/index.ts` | Register preview routes |
| `apps/api/src/services/orchestrator/traefik.ts` | Add preview label generation |
| `apps/api/src/services/sandbox-manager.ts` | Integrate preview port registration |
| `apps/frontend/src/routes/projects/[id]/+layout.svelte` | Add Preview tab |
| `apps/frontend/src/lib/api/tauri.ts` | Add preview API functions |
| `docker-compose.yml` | Add Traefik file provider config |
| `package.json` (frontend) | Add `html2canvas` dependency |

---

## Testing Strategy

### Unit Tests
- Port detection regex patterns
- Preview URL generation
- Traefik label generation
- Framework detection logic
- Console message parsing and deduplication
- Screenshot utility error handling

### Integration Tests
- API endpoint CRUD operations
- Traefik routing configuration
- Container label updates
- Console postMessage communication

### E2E Tests
- Start dev server → detect port → view in preview
- Hot reload triggers preview update
- Public share link generation and access
- Mobile viewport switching
- Console forwarding (log appears in panel)
- Screenshot capture and download

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Preview load time | < 2 seconds |
| Port detection accuracy | > 90% |
| Hot-reload propagation | < 500ms |
| User adoption (Phase 1) | 60% of active users |

---

## Open Questions (Resolved)

| Question | Decision | Reasoning |
|----------|----------|-----------|
| **1. Multi-port preview** | ❌ **No** (MVP) | Split-pane adds complexity. Users can open multiple browser tabs. Consider for v2 if frequently requested. |
| **2. Network inspection** | ❌ **No** | Browser DevTools already exists. Duplicating Chrome's Network tab is massive scope creep. Users can right-click → Inspect in the preview iframe. |
| **3. Console forwarding** | ✅ **Yes** (limited) | High value, low effort. Use `window.postMessage` from injected script to capture `console.log/warn/error`. Show in collapsible panel below preview. |
| **4. Screenshot capture** | ✅ **Yes** | Useful for sharing progress with stakeholders. Use `html2canvas` library. Single button click → downloads PNG. |
| **5. Offline caching** | ❌ **No** | Previews are live dev servers—caching defeats the purpose of seeing real-time changes. Not worth the complexity. |

### MVP Scope Summary
- **Include**: Console forwarding, screenshot capture
- **Exclude**: Multi-port split view, network inspection, offline caching

---

## Future Enhancements

1. **Responsive mode toolbar** - Quick device size presets (iPhone, iPad, etc.)
2. **Network throttling** - Simulate slow connections
3. **Accessibility audit** - Built-in a11y checking
4. **Visual diff** - Compare before/after screenshots
5. **Collaborative preview** - Real-time cursor sharing
6. **Recording** - Record user interactions for replay

---

## References

- [Traefik Docker Provider](https://doc.traefik.io/traefik/providers/docker/)
- [Traefik File Provider](https://doc.traefik.io/traefik/providers/file/)
- [CodeSandbox Preview Architecture](https://codesandbox.io/docs/learn/sandboxes/preview)
- [Vite HMR Protocol](https://vitejs.dev/guide/api-hmr.html)
- [iframe sandbox attribute](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/iframe#sandbox)
