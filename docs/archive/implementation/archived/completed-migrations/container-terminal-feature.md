# Container Interactive Terminal Feature

## Overview

Add an interactive terminal feature allowing users to execute commands directly in containers via a web-based terminal (xterm.js). This complements the existing Logs tab by providing an interactive shell rather than read-only log viewing.

## Requirements

### Functional Requirements
- Interactive shell access to running containers
- Multiple terminal sessions per container (max 5)
- Session persistence across tab navigation
- Terminal resize support (responsive to window size)
- Shell auto-detection (bash → zsh → sh fallback)
- Mobile support with on-screen function keys

### Non-Functional Requirements
- Low latency bidirectional communication via WebSocket
- Output buffering for session restoration (max 10k lines)
- Auto-reconnect with retry logic (3 attempts, then manual button)
- Terminal tab only enabled when container is running

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (Svelte + xterm.js)                    │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │  Terminal Tab (4th tab, after Logs)                                │ │
│  │    ├── Empty state: "New Terminal" button                          │ │
│  │    ├── Multi-terminal tabs (max 5 per container)                  │ │
│  │    ├── On-screen keys for mobile (Ctrl, Esc, Tab, ↑↓←→)          │ │
│  │    └── Session persistence via module-level store                 │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │  terminals.svelte.ts (Store)                                       │ │
│  │    ├── Module-level state (survives navigation)                   │ │
│  │    ├── Output buffer per session (max 10k lines)                  │ │
│  │    └── WebSocket connection management                            │ │
│  └───────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │ Tauri IPC + Events
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      TAURI BACKEND (Rust + tokio-tungstenite)           │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │  terminal.rs                                                       │ │
│  │    ├── terminal_connect(sandbox_id) → session_id                  │ │
│  │    ├── terminal_send(session_id, data)                            │ │
│  │    ├── terminal_resize(session_id, cols, rows)                    │ │
│  │    ├── terminal_disconnect(session_id)                            │ │
│  │    └── Emits "terminal_output" events to frontend                 │ │
│  └───────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │ WebSocket (ws://)
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                   MANAGEMENT API (Bun + Hono + Dockerode)               │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │  GET /api/v2/sandboxes/:id/terminal (WebSocket upgrade)            │ │
│  │    ├── createBunWebSocket() from hono/bun                         │ │
│  │    ├── orchestrator.execInteractive() with hijack:true            │ │
│  │    ├── Bidirectional bridge: ws ↔ docker stream                   │ │
│  │    └── exec.resize() for terminal dimension changes               │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │  docker.ts - execInteractive()                                     │ │
│  │    └── container.exec({ Tty: true, AttachStdin: true })           │ │
│  │    └── exec.start({ hijack: true, stdin: true })                  │ │
│  └───────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │ Docker API (unix socket)
                                  ▼
                        ┌───────────────────┐
                        │  Docker Container │
                        │    /bin/bash      │
                        └───────────────────┘
```

## WebSocket Message Protocol

### Client → Server

```typescript
type ClientMessage = 
  | { type: "input"; data: string }              // Terminal input (keystrokes)
  | { type: "resize"; cols: number; rows: number }  // Terminal resize
```

### Server → Client

```typescript
type ServerMessage = 
  | { type: "output"; data: string }             // Terminal output
  | { type: "connected"; shell: string }         // Connection established
  | { type: "exit"; code: number }               // Shell exited
  | { type: "error"; message: string }           // Error occurred
```

## Implementation Phases

### Phase 1: Backend - WebSocket Terminal Endpoint

**Files to create/modify:**
- `apps/api/src/routes/terminal.ts` (new)
- `apps/api/src/services/orchestrator/docker.ts` (modify)
- `apps/api/src/services/orchestrator/types.ts` (modify)
- `apps/api/src/index.ts` (modify)

**Tasks:**
1. Add Bun WebSocket support using `createBunWebSocket` from `hono/bun`
2. Create WebSocket route at `/api/v2/sandboxes/:id/terminal`
3. Add `execInteractive()` method to Docker orchestrator
4. Bridge WebSocket ↔ Docker exec stream
5. Implement `exec.resize()` for terminal dimensions

**Key Implementation Details:**

```typescript
// docker.ts - execInteractive method
async execInteractive(
  sandboxId: string,
  options?: { shell?: string; cols?: number; rows?: number }
): Promise<{ stream: Duplex; exec: Exec }> {
  const container = await this.getContainer(sandboxId);
  
  const exec = await container.exec({
    Cmd: [options?.shell ?? '/bin/bash'],
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
    Tty: true,
    Env: ['TERM=xterm-256color'],
  });

  // hijack: true gives us a raw bidirectional socket
  const stream = await exec.start({ 
    hijack: true, 
    stdin: true,
    Tty: true
  });

  // Set initial size if provided
  if (options?.cols && options?.rows) {
    await exec.resize({ w: options.cols, h: options.rows });
  }

  return { stream, exec };
}
```

### Phase 2: Tauri Backend - WebSocket Proxy

**Files to create/modify:**
- `apps/frontend/src-tauri/Cargo.toml` (modify)
- `apps/frontend/src-tauri/src/commands/terminal.rs` (new)
- `apps/frontend/src-tauri/src/commands/mod.rs` (modify)
- `apps/frontend/src-tauri/src/lib.rs` (modify)

**Tasks:**
1. Add `tokio-tungstenite` and `futures-util` dependencies
2. Create `terminal_connect` command (returns session_id)
3. Implement `terminal_send` command (sends data to WebSocket)
4. Add `terminal_resize` command (sends resize message)
5. Create `terminal_disconnect` command (cleanup)
6. Emit `terminal_output` events to frontend via Tauri event system

**Key Implementation Details:**

```rust
// terminal.rs - session management
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio_tungstenite::WebSocketStream;

// Global terminal session storage
lazy_static! {
    static ref TERMINAL_SESSIONS: Arc<RwLock<HashMap<String, TerminalSession>>> = 
        Arc::new(RwLock::new(HashMap::new()));
}

struct TerminalSession {
    sandbox_id: String,
    ws_sender: futures_util::stream::SplitSink<...>,
}

#[tauri::command]
pub async fn terminal_connect(
    sandbox_id: String,
    app_handle: tauri::AppHandle,
) -> Result<String, AppError> {
    // Connect to API WebSocket
    // Store session
    // Spawn task to read from WebSocket and emit events
    // Return session_id
}
```

### Phase 3: Frontend - Terminal Store

**Files to create:**
- `apps/frontend/src/lib/stores/terminals.svelte.ts` (new)
- `apps/frontend/src/lib/api/tauri.ts` (modify)

**Tasks:**
1. Create module-level state for session persistence
2. Implement `TerminalSession` interface with output buffer
3. Add CRUD operations with max 5 sessions limit
4. Implement WebSocket connection management via Tauri
5. Add auto-reconnect logic (3 retries, then button)

**Key Implementation Details:**

```typescript
// terminals.svelte.ts
interface TerminalSession {
  id: string;
  sandboxId: string;
  name: string;
  buffer: string[];        // Output buffer for persistence
  isConnected: boolean;
  reconnectAttempts: number;
  createdAt: Date;
}

// Module-level state (persists across navigation)
let sessions = $state.raw<Map<string, TerminalSession>>(new Map());
let activeSessionId = $state<string | null>(null);
let stateVersion = $state(0);

const MAX_SESSIONS = 5;
const MAX_BUFFER_LINES = 10000;
const MAX_RECONNECT_ATTEMPTS = 3;
```

### Phase 4: Frontend - xterm.js Component

**Files to create:**
- `apps/frontend/src/lib/components/terminal/Terminal.svelte` (new)
- `apps/frontend/src/lib/components/terminal/TerminalTabs.svelte` (new)
- `apps/frontend/src/lib/components/terminal/OnScreenKeys.svelte` (new)

**Dependencies to add:**
```bash
pnpm --filter @agentpod/frontend add @xterm/xterm @xterm/addon-fit @xterm/addon-web-links
```

**Tasks:**
1. Create `Terminal.svelte` with xterm.js initialization
2. Implement `FitAddon` for responsive sizing
3. Add `TerminalTabs.svelte` for multi-session UI
4. Create `OnScreenKeys.svelte` for mobile support
5. Implement buffer restoration on session switch

**Key Implementation Details:**

```svelte
<!-- Terminal.svelte -->
<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { Terminal } from "@xterm/xterm";
  import { FitAddon } from "@xterm/addon-fit";
  import { WebLinksAddon } from "@xterm/addon-web-links";
  import "@xterm/xterm/css/xterm.css";
  
  let { sessionId, onData, onResize } = $props<{
    sessionId: string;
    onData: (data: string) => void;
    onResize: (cols: number, rows: number) => void;
  }>();
  
  let terminalContainer: HTMLDivElement;
  let terminal: Terminal;
  let fitAddon: FitAddon;
  
  onMount(() => {
    terminal = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
      }
    });
    
    fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(new WebLinksAddon());
    
    terminal.open(terminalContainer);
    fitAddon.fit();
    
    terminal.onData(onData);
    
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      onResize(terminal.cols, terminal.rows);
    });
    resizeObserver.observe(terminalContainer);
    
    return () => resizeObserver.disconnect();
  });
  
  // Expose write method for receiving data
  export function write(data: string) {
    terminal?.write(data);
  }
  
  export function clear() {
    terminal?.clear();
  }
</script>

<div bind:this={terminalContainer} class="h-full w-full"></div>
```

### Phase 5: Frontend - Route & Navigation

**Files to create/modify:**
- `apps/frontend/src/routes/projects/[id]/terminal/+page.svelte` (new)
- `apps/frontend/src/routes/projects/[id]/+layout.svelte` (modify)

**Tasks:**
1. Create terminal route with empty state UI
2. Add Terminal as 4th tab (after Logs)
3. Conditionally enable tab when container is running

### Phase 6: Mobile Support

**Tasks:**
1. Add on-screen function keys component
2. Detect touch devices and show keys automatically
3. Handle special key combinations (Ctrl+C, Ctrl+D, etc.)

### Phase 7: Shell Auto-Detection

**Tasks:**
1. Implement shell detection in backend
2. Try shells in order: `/bin/bash` → `/bin/zsh` → `/bin/sh`
3. Cache detected shell per container

## Files Summary

### New Files

| File | Purpose |
|------|---------|
| `apps/api/src/routes/terminal.ts` | WebSocket terminal route |
| `apps/frontend/src-tauri/src/commands/terminal.rs` | Tauri WebSocket commands |
| `apps/frontend/src/lib/stores/terminals.svelte.ts` | Terminal state management |
| `apps/frontend/src/lib/components/terminal/Terminal.svelte` | xterm.js wrapper |
| `apps/frontend/src/lib/components/terminal/TerminalTabs.svelte` | Multi-terminal UI |
| `apps/frontend/src/lib/components/terminal/OnScreenKeys.svelte` | Mobile keyboard |
| `apps/frontend/src/routes/projects/[id]/terminal/+page.svelte` | Terminal route |

### Modified Files

| File | Change |
|------|--------|
| `apps/api/src/index.ts` | Add WebSocket handler + terminal routes |
| `apps/api/src/services/orchestrator/docker.ts` | Add `execInteractive()` method |
| `apps/api/src/services/orchestrator/types.ts` | Add `InteractiveExecOptions` type |
| `apps/frontend/src-tauri/Cargo.toml` | Add WebSocket dependencies |
| `apps/frontend/src-tauri/src/commands/mod.rs` | Export terminal module |
| `apps/frontend/src-tauri/src/lib.rs` | Register terminal commands |
| `apps/frontend/src/routes/projects/[id]/+layout.svelte` | Add Terminal tab |
| `apps/frontend/package.json` | Add xterm.js dependencies |
| `apps/frontend/src/lib/api/tauri.ts` | Add terminal API functions |

## Testing Strategy

### Unit Tests
- Docker orchestrator `execInteractive()` method
- Terminal store CRUD operations
- Shell detection logic

### Integration Tests
- WebSocket connection lifecycle
- Message protocol validation
- Reconnection behavior

### E2E Tests
- Create terminal session
- Type commands and receive output
- Multiple terminals
- Tab switching persistence
- Mobile on-screen keys

## Estimated Timeline

| Phase | Complexity | Time Estimate |
|-------|------------|---------------|
| Phase 1: API WebSocket | Medium | 2-3 hours |
| Phase 2: Tauri WebSocket | High | 3-4 hours |
| Phase 3: Terminal Store | Medium | 2 hours |
| Phase 4: xterm Component | Medium | 2-3 hours |
| Phase 5: Route Integration | Low | 1 hour |
| Phase 6: Mobile Support | Low | 1-2 hours |
| Phase 7: Shell Detection | Low | 30 min |
| **Total** | | **12-16 hours** |

## Security Considerations

1. **Authentication**: WebSocket connections require valid session/API key
2. **Authorization**: Users can only access their own sandboxes
3. **Input Sanitization**: Terminal input is passed directly to shell (intentional)
4. **Resource Limits**: Max 5 terminals per container prevents resource exhaustion
5. **Connection Cleanup**: Sessions are cleaned up on disconnect

## Future Enhancements

1. **Terminal sharing**: Allow sharing terminal sessions between users
2. **Recording/Playback**: Record terminal sessions for replay
3. **Custom shells**: Allow users to select preferred shell
4. **Terminal profiles**: Save terminal preferences (font, colors, etc.)
5. **Split terminals**: Multiple terminals in split view
