# Browser EventSource SSE Migration Plan

**Status**: Ready for Implementation  
**Created**: 2025-12-23  
**Estimated Time**: ~3 days

## Executive Summary

**Goal**: Replace Tauri Rust SSE proxy with native Browser EventSource API for OpenCode events only. All other APIs continue through Tauri.

**Why**:
- Browser EventSource is battle-tested and handles SSE perfectly
- Auto-reconnection built-in
- Remove ~200 lines of fragile Rust SSE parsing code
- Simpler architecture, fewer moving parts

**Current Problem**:
- Tauri Rust SSE proxy fails with "error decoding response body" every ~10 seconds
- Only `server.connected` events get through
- No `session.status`, `message.updated`, or other events arrive
- Session status indicators don't work

---

## Architecture Change

### Before (Broken)

```
Frontend (SvelteKit)
    │
    │ invoke("sandbox_opencode_connect_stream")
    │
    ▼
Tauri Rust Backend
    │
    │ reqwest SSE parsing (FAILING)
    │ ❌ "error decoding response body"
    │
    ▼
Management API (Bun/Hono)
    │
    │ streamSSE()
    │
    ▼
OpenCode Container
```

### After (Browser EventSource)

```
Frontend (SvelteKit)
    │
    │ new EventSource(url)  ← Browser native API
    │ ✅ Auto-reconnect built-in
    │
    ▼
Management API (Bun/Hono)
    │
    │ streamSSE()
    │
    ▼
OpenCode Container

Note: All other APIs (messages, sessions, files, etc.) 
      continue through Tauri as before.
```

---

## Current State Analysis

### Files Using Tauri SSE

| File | Usage | Changes Needed |
|------|-------|----------------|
| `src/lib/api/tauri.ts` | `OpenCodeStream` class, `onStreamEvent`, `onStreamStatus` | Replace with Browser SSE |
| `src/lib/chat/RuntimeProvider.tsx` | Uses `OpenCodeStream` for SSE | Use new `BrowserSSEClient` |
| `src/lib/chat/adapter.ts` | Uses `OpenCodeStream` for assistant-ui | Use new `BrowserSSEClient` |
| `src-tauri/src/commands/sandboxes.rs` | `sandbox_opencode_connect_stream`, `sandbox_opencode_disconnect_stream`, `parse_sse_event` | Remove |
| `src-tauri/src/lib.rs` | Registers SSE commands | Remove command registrations |

---

## Implementation Plan

### Phase 1: Create Browser SSE Client

**New File**: `apps/frontend/src/lib/api/browser-sse.ts`

```typescript
/**
 * Browser-native SSE client for OpenCode events
 * 
 * Uses the native EventSource API which provides:
 * - Automatic reconnection on connection loss
 * - Proper SSE parsing (event types, data fields)
 * - Built-in error handling
 */

import type { Event as OpenCodeEvent } from "@opencode-ai/sdk/client";
import { getAuthApiUrl } from "../stores/auth.svelte";

export type SSEStatus = "connecting" | "connected" | "disconnected" | "error";

export interface BrowserSSEClientOptions {
  onEvent: (event: OpenCodeEvent) => void;
  onStatus?: (status: SSEStatus, error?: string) => void;
}

export class BrowserSSEClient {
  private eventSource: EventSource | null = null;
  private sandboxId: string;
  private options: BrowserSSEClientOptions;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;

  constructor(sandboxId: string, options: BrowserSSEClientOptions) {
    this.sandboxId = sandboxId;
    this.options = options;
  }

  connect(): void {
    const apiUrl = getAuthApiUrl();
    const sseUrl = `${apiUrl}/api/v2/sandboxes/${this.sandboxId}/opencode/event`;
    
    this.eventSource = new EventSource(sseUrl, { withCredentials: true });
    
    // Handle events, errors, connection status
    // (Full implementation in code)
  }

  disconnect(): void {
    this.eventSource?.close();
    this.eventSource = null;
  }

  get isConnected(): boolean {
    return this.eventSource?.readyState === EventSource.OPEN;
  }
}
```

### Phase 2: Management API Auth

The current setup should work because:
1. Better Auth stores session in httpOnly cookies
2. CORS has `credentials: true`
3. EventSource with `withCredentials: true` sends cookies

**Fallback** (if cookies don't work): Add query parameter auth support.

### Phase 3: Update RuntimeProvider

Replace `OpenCodeStream` with `BrowserSSEClient`:

```typescript
// BEFORE
const stream = new OpenCodeStream(projectId);
await stream.connect(onEvent, onStatus);

// AFTER
const sseClient = new BrowserSSEClient(projectId, { onEvent, onStatus });
sseClient.connect();
```

### Phase 4: Update adapter.ts

Same pattern - replace `OpenCodeStream` with `BrowserSSEClient`.

### Phase 5: Remove Rust SSE Code

**Remove from `sandboxes.rs`**:
- `sandbox_opencode_connect_stream()` function (~100 lines)
- `sandbox_opencode_disconnect_stream()` function (~20 lines)
- `parse_sse_event()` function (~80 lines)
- `SSE_STREAM_HANDLES` and `get_stream_handles()`

**Remove from `lib.rs`**:
- Command registrations for SSE functions

### Phase 6: Remove TypeScript SSE Code

**Remove from `tauri.ts`**:
- `OpenCodeStream` class
- `sandboxOpencodeConnectStream()`
- `sandboxOpencodeDisconnectStream()`
- `onStreamEvent()`
- `onStreamStatus()`

---

## Implementation Checklist

### New Files
- [ ] `apps/frontend/src/lib/api/browser-sse.ts`

### Files to Modify

#### Frontend TypeScript
- [ ] `apps/frontend/src/lib/chat/RuntimeProvider.tsx`
  - [ ] Replace `OpenCodeStream` with `BrowserSSEClient`
  - [ ] Update SSE connection useEffect
  - [ ] Update cleanup logic

- [ ] `apps/frontend/src/lib/chat/adapter.ts`
  - [ ] Replace `OpenCodeStream` with `BrowserSSEClient`

- [ ] `apps/frontend/src/lib/api/tauri.ts`
  - [ ] Remove `OpenCodeStream` class
  - [ ] Remove SSE-related functions
  - [ ] Keep `OpenCodeEvent` interface (mark deprecated)

#### Rust Backend
- [ ] `apps/frontend/src-tauri/src/commands/sandboxes.rs`
  - [ ] Remove SSE functions (~200 lines)

- [ ] `apps/frontend/src-tauri/src/lib.rs`
  - [ ] Remove SSE command registrations

### Testing
- [ ] SSE connection establishes successfully
- [ ] Events are received (session.status, message.updated, etc.)
- [ ] Auto-reconnection works on network loss
- [ ] Session status indicators update correctly
- [ ] Permissions are received and displayed
- [ ] Works in Tauri desktop app

---

## Code Diff Summary

| Category | Lines |
|----------|-------|
| Rust removed | ~200 |
| TypeScript removed | ~150 |
| TypeScript added | ~180 |
| **Net change** | **~-170** |

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Cookie auth doesn't work in Tauri | Add query param auth fallback |
| EventSource doesn't work in Tauri webview | Test early; fallback to fetch-based polling |
| CORS issues with SSE | Verify CORS config includes SSE headers |

---

## Timeline

| Day | Task |
|-----|------|
| 1 | Create `browser-sse.ts`, update RuntimeProvider |
| 2 | Update adapter.ts, test SSE functionality |
| 3 | Remove Rust/TS SSE code, final testing |

---

## References

- [MDN EventSource](https://developer.mozilla.org/en-US/docs/Web/API/EventSource)
- [OpenCode SDK](https://github.com/sst/opencode)
- Current SSE implementation: `apps/frontend/src-tauri/src/commands/sandboxes.rs`
