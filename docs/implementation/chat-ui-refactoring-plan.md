# Chat UI Refactoring Plan

> **Status:** In Progress  
> **Created:** 2025-01-16  
> **Last Updated:** 2025-01-17  

## Executive Summary

The current `RuntimeProvider.tsx` (1,200+ lines) needs to be refactored into a modular architecture that properly handles all OpenCode events, message types, and integrates cleanly with assistant-ui. This plan covers:

1. **Complete event type support** - All 31 OpenCode SSE event types
2. **Complete message part support** - All 12 message part types including `step-start`, `step-finish`, `reasoning`, and `patch`
3. **Modular architecture** - Split into 7+ focused modules
4. **Improved UX** - Cost tracking, step indicators, diff viewers
5. **Proper type safety** - Using SDK types from `@opencode-ai/sdk` and `@assistant-ui/react`

---

## Implementation Progress

### Completed
- [x] **Phase 1: Type Definitions** - Created `types/events.ts` and `types/messages.ts` with SDK re-exports
- [x] **Phase 2: Part Converters** - Created `converters/part-converters.ts` for all 12 part types
- [x] **Phase 2: Message Converter** - Created `converters/message-converter.ts` for OpenCode -> InternalMessage
- [x] **Phase 2: Thread Converter** - Created `converters/thread-converter.ts` for InternalMessage -> ThreadMessageLike

### In Progress
- [ ] **Phase 3: Event Handlers** - Extract SSE event handling into modular handlers
- [ ] **Phase 4: Hooks** - Extract reusable hooks from RuntimeProvider

### Pending
- [ ] **Phase 5: UI Components** - StepIndicator, CostBadge, DiffViewer
- [ ] **Phase 6: Integration** - Refactor RuntimeProvider to use new modules

---

## SDK-Based Architecture

### Key Discovery: Available SDKs

We leverage two SDKs that are already installed:

#### 1. OpenCode SDK (`@opencode-ai/sdk` v1.0.144)
- **Location:** `node_modules/.pnpm/@opencode-ai+sdk@1.0.144/`
- **Types file:** `dist/gen/types.gen.d.ts`
- **Import path:** `@opencode-ai/sdk/client`
- **Exports:** All 31 event types, 12 part types, message types, error types

#### 2. assistant-ui SDK (`@assistant-ui/react` v0.11.47)
- **Runtime:** `useExternalStoreRuntime` - for external state management
- **Types:** `ThreadMessageLike`, `TextMessagePart`, `ToolCallMessagePart`, etc.
- **Native support for:**
  - `ReasoningMessagePart` - AI thinking/reasoning
  - `ToolCallMessagePart` - with `result`, `isError`, `artifact` fields
  - `DataMessagePart` - for custom data (patches, subtasks) with `name` field
  - `metadata.steps` - for token usage tracking

### Type Flow

```
OpenCode API/SSE Events
        │
        ▼
┌───────────────────────┐
│  OpenCode SDK Types   │  @opencode-ai/sdk/client
│  (Event, Part, etc.)  │
└───────────────────────┘
        │
        ▼  convertOpenCodeMessage()
┌───────────────────────┐
│   InternalMessage     │  Our React state format
│   (with Map, arrays)  │
└───────────────────────┘
        │
        ▼  convertMessage()
┌───────────────────────┐
│  ThreadMessageLike    │  @assistant-ui/react
│  (ReadonlyJSON-safe)  │
└───────────────────────┘
        │
        ▼
    assistant-ui Components
```

### assistant-ui Message Part Types

Based on the actual type definitions in assistant-ui:

```typescript
// From @assistant-ui/react/dist/types/MessagePartTypes.d.ts

type TextMessagePart = {
  readonly type: "text";
  readonly text: string;
  readonly parentId?: string;
};

type ReasoningMessagePart = {
  readonly type: "reasoning";
  readonly text: string;
  readonly parentId?: string;
};

type ImageMessagePart = {
  readonly type: "image";
  readonly image: string;
  readonly filename?: string;
};

type FileMessagePart = {
  readonly type: "file";
  readonly filename?: string;
  readonly data: string;
  readonly mimeType: string;
};

type DataMessagePart<T = any> = {
  readonly type: "data";
  readonly name: string;  // REQUIRED - identifies the data type
  readonly data: T;
};

type ToolCallMessagePart<TArgs = ReadonlyJSONObject, TResult = unknown> = {
  readonly type: "tool-call";
  readonly toolCallId: string;
  readonly toolName: string;
  readonly args: TArgs;           // Must be ReadonlyJSONObject
  readonly argsText: string;      // REQUIRED - raw args as string
  readonly result?: TResult;
  readonly isError?: boolean;
  readonly artifact?: unknown;
  readonly interrupt?: { type: "human"; payload: unknown };
  readonly parentId?: string;
  readonly messages?: readonly ThreadMessage[];
};
```

### Mapping OpenCode Parts to assistant-ui

| OpenCode Part Type | assistant-ui Part Type | Notes |
|--------------------|------------------------|-------|
| `text` | `TextMessagePart` | Direct mapping |
| `reasoning` | `ReasoningMessagePart` | Native support! |
| `tool` | `ToolCallMessagePart` | Map `state.status` to `isError` |
| `tool-invocation` | `ToolCallMessagePart` | Legacy format support |
| `file` | `ImageMessagePart` or `FileMessagePart` | Based on mime type |
| `patch` | `DataMessagePart` | `name: "opencode-patches"` |
| `subtask` | `DataMessagePart` | `name: "opencode-subtasks"` |
| `step-start/finish` | `metadata.steps` | Token usage tracking |
| `retry` | `metadata.custom.retries` | Custom metadata |
| `agent` | `metadata.custom.agent` | Custom metadata |
| `compaction` | `metadata.custom.isCompacted` | Custom metadata |

---

## Type Coverage Verification

### OpenCode SDK Part Types → InternalMessage

| SDK Part Type | Handled in `part-converters.ts` | Stored in InternalMessage | Notes |
|---------------|--------------------------------|---------------------------|-------|
| `TextPart` | ✅ `convertTextPart()` | `text: string` | Appended to text field |
| `ReasoningPart` | ✅ `convertReasoningPart()` | `reasoning: InternalReasoning[]` | Full support |
| `FilePart` | ✅ `convertFilePart()` | `files: InternalFilePart[]` | With source info |
| `ToolPart` | ✅ `convertToolPart()` | `toolCalls: Map<string, InternalToolCall>` | All 4 states |
| `StepStartPart` | ✅ `convertStepStartPart()` | `steps: InternalStep[]` | Phase tracking |
| `StepFinishPart` | ✅ `convertStepFinishPart()` | `steps: InternalStep[]` | With tokens/cost |
| `SnapshotPart` | ✅ Handled in SSE | Referenced in steps | Snapshot ID stored |
| `PatchPart` | ✅ `convertPatchPart()` | `patches: InternalPatch[]` | Hash + files |
| `AgentPart` | ✅ `convertAgentPart()` | `agent: string` | Agent name |
| `RetryPart` | ✅ `convertRetryPart()` | `retries: InternalRetry[]` | Error details |
| `CompactionPart` | ✅ `convertCompactionPart()` | `isCompacted: boolean` | Auto flag |
| `SubtaskPart` (inline) | ✅ `convertSubtaskPart()` | `subtasks: InternalSubtask[]` | Prompt/desc/agent |

**Legacy/Extra Types:**
| Type | Handled | Notes |
|------|---------|-------|
| `tool-invocation` | ✅ `convertToolInvocationPart()` | Legacy Vercel AI SDK format |
| `tool-result` | ✅ `convertToolResultPart()` | Standalone result part |

### InternalMessage → assistant-ui ThreadMessageLike

| InternalMessage Field | assistant-ui Target | Conversion |
|-----------------------|---------------------|------------|
| `id` | `id` | Direct |
| `role` | `role` | Direct |
| `createdAt` | `createdAt` | Direct |
| `text` | `TextMessagePart` | `{ type: "text", text }` |
| `reasoning[]` | `ReasoningMessagePart[]` | `{ type: "reasoning", text }` |
| `toolCalls` | `ToolCallMessagePart[]` | With `args: ReadonlyJSONObject`, `argsText` required |
| `files[]` | `ImageMessagePart` or `FileMessagePart` | Based on mime type |
| `patches[]` | `DataMessagePart` | `name: "opencode-patches"` |
| `subtasks[]` | `DataMessagePart` | `name: "opencode-subtasks"` |
| `steps[]` | `metadata.steps` | Token usage for UI |
| `cost` | `metadata.custom.cost` | Number |
| `tokens` | `metadata.custom.tokens` | Full breakdown |
| `agent` | `metadata.custom.agent` | String |
| `retries[]` | `metadata.custom.retries` | Array |
| `isCompacted` | `metadata.custom.isCompacted` | Boolean |
| `completedAt` | `status.type` | Determines "complete" vs "running" |

### assistant-ui Part Types Coverage

| assistant-ui Part Type | Used For | Status |
|------------------------|----------|--------|
| `TextMessagePart` | Main text content | ✅ Used |
| `ReasoningMessagePart` | AI thinking/reasoning | ✅ Used |
| `ImageMessagePart` | Image files | ✅ Used |
| `FileMessagePart` | Non-image files | ✅ Used |
| `ToolCallMessagePart` | Tool calls | ✅ Used (properly typed with `ReadonlyJSONObject`) |
| `DataMessagePart` | Custom data (patches, subtasks) | ✅ Used (with required `name` field) |
| `SourceMessagePart` | Source citations | ❌ Not used (OpenCode doesn't have this) |
| `Unstable_AudioMessagePart` | Audio content | ❌ Not used (OpenCode doesn't have this) |

### OpenCode SSE Event Types Coverage

| Event Type | Currently Handled | Handler Location | Priority |
|------------|-------------------|------------------|----------|
| **Session Events** |
| `session.created` | ✅ Yes | RuntimeProvider | - |
| `session.updated` | ✅ Yes | RuntimeProvider | - |
| `session.status` | ✅ Yes | RuntimeProvider | - |
| `session.idle` | ✅ Yes | RuntimeProvider | - |
| `session.error` | ✅ Yes | RuntimeProvider | - |
| `session.deleted` | ❌ No | TODO | Medium |
| `session.compacted` | ❌ No | TODO | Low |
| `session.diff` | ❌ No | TODO | Low |
| **Message Events** |
| `message.updated` | ✅ Yes | RuntimeProvider | - |
| `message.part.updated` | ✅ Yes | RuntimeProvider | - |
| `message.removed` | ✅ Yes | RuntimeProvider | - |
| `message.part.removed` | ❌ No | TODO | Medium |
| **Permission Events** |
| `permission.updated` | ✅ Yes | RuntimeProvider | - |
| `permission.replied` | ✅ Yes | RuntimeProvider | - |
| **File Events** |
| `file.edited` | ❌ No | TODO | Medium |
| `file.watcher.updated` | ❌ No | TODO | Low |
| **Server Events** |
| `server.connected` | ❌ No | TODO | Low |
| `server.instance.disposed` | ❌ No | TODO | Low |
| **VCS Events** |
| `vcs.branch.updated` | ❌ No | TODO | Medium |
| **PTY Events** |
| `pty.created` | ❌ No | TODO | Medium |
| `pty.updated` | ❌ No | TODO | Medium |
| `pty.exited` | ❌ No | TODO | Medium |
| `pty.deleted` | ❌ No | TODO | Low |
| **Other Events** |
| `command.executed` | ❌ No | TODO | Low |
| `installation.updated` | ❌ No | TODO | Low |
| `installation.update-available` | ❌ No | TODO | Medium |
| `lsp.client.diagnostics` | ❌ No | TODO | Medium |
| `lsp.updated` | ❌ No | TODO | Low |
| `todo.updated` | ❌ No | TODO | Medium |
| **TUI Events** |
| `tui.prompt.append` | ❌ No | N/A | N/A (TUI only) |
| `tui.command.execute` | ❌ No | N/A | N/A (TUI only) |
| `tui.toast.show` | ❌ No | N/A | N/A (TUI only) |

**Summary:**
- **Part Types:** 12/12 SDK types handled + 2 legacy types = **100% coverage**
- **Event Types:** 10/31 events handled = **32% coverage** (TUI events excluded = 10/28 = 36%)
- **assistant-ui Parts:** 6/8 part types used = **75%** (remaining 2 not applicable to OpenCode)

---

## Table of Contents

1. [Current State Analysis](#current-state-analysis)
2. [Complete Event Type Reference](#complete-event-type-reference)
3. [Complete Message Part Type Reference](#complete-message-part-type-reference)
4. [Protocol Comparison](#protocol-comparison)
5. [Proposed Module Architecture](#proposed-module-architecture)
6. [New UI Components](#new-ui-components)
7. [Implementation Phases](#implementation-phases)
8. [Testing Strategy](#testing-strategy)

---

## Current State Analysis

### Problems with Current Implementation

1. **Monolithic File**: `RuntimeProvider.tsx` is 1,200+ lines handling:
   - SSE event streaming
   - Message state management
   - assistant-ui runtime integration
   - Permission handling
   - Session status tracking
   - File attachments

2. **Missing Event Handlers**: Only 10 of 26 event types are handled

3. **Missing Part Types**: `step-start`, `step-finish`, `patch`, `tool-result` are not processed

4. **No Cost Tracking**: Token usage and costs from `step-finish` parts are lost

5. **Tight Coupling**: Hard to test individual pieces

### Files Involved

| File | Lines | Purpose |
|------|-------|---------|
| `apps/frontend/src/lib/chat/RuntimeProvider.tsx` | 1,202 | Main runtime provider |
| `apps/frontend/src/lib/chat/PermissionContext.tsx` | 194 | Permission state management |
| `apps/frontend/src/lib/chat/PermissionBar.tsx` | 340 | Permission UI |
| `apps/frontend/src/lib/chat/FileAttachment.tsx` | 280 | File attachment handling |
| `apps/frontend/src/lib/api/tauri.ts` | 600+ | Type definitions & API calls |

---

## Complete Event Type Reference

> **Source:** Types derived from `/docs/implementation/types.ts` (auto-generated from OpenCode OpenAPI spec)

### All 31 OpenCode SSE Event Types

#### Session Events (8)

| Event | Currently Handled | Priority | Description |
|-------|-------------------|----------|-------------|
| `session.created` | Yes | - | New session started (including child sessions from task tool) |
| `session.updated` | Yes | - | Session metadata changed (title, cost, status) |
| `session.status` | Yes | - | Session status changed (idle/busy/retry) |
| `session.idle` | Yes | - | Session processing completed |
| `session.error` | Yes | - | Error occurred during processing |
| `session.deleted` | **No** | Medium | Session was deleted |
| `session.compacted` | **No** | Low | Context was compacted (summarized) |
| `session.diff` | **No** | Low | Session diff available |

#### Message Events (4)

| Event | Currently Handled | Priority | Description |
|-------|-------------------|----------|-------------|
| `message.updated` | Yes | - | New message created or metadata updated |
| `message.part.updated` | Yes | - | Streaming content update (text, tool, file) |
| `message.removed` | Yes | - | Message was deleted |
| `message.part.removed` | **No** | Medium | Message part was removed (tool cancellation) |

#### Permission Events (2)

| Event | Currently Handled | Priority | Description |
|-------|-------------------|----------|-------------|
| `permission.updated` | Yes | - | Tool requests user permission |
| `permission.replied` | Yes | - | Permission was responded to |

#### File Events (2)

| Event | Currently Handled | Priority | Description |
|-------|-------------------|----------|-------------|
| `file.edited` | **No** | Medium | File was modified by AI |
| `file.watcher.updated` | **No** | Low | File system change detected |

#### Server Events (3)

| Event | Currently Handled | Priority | Description |
|-------|-------------------|----------|-------------|
| `server.connected` | **No** | Low | SSE connection established |
| `server.instance.disposed` | **No** | Low | Server instance was disposed |
| `error` | **No** | Low | Legacy error event |

#### VCS Events (1)

| Event | Currently Handled | Priority | Description |
|-------|-------------------|----------|-------------|
| `vcs.branch.updated` | **No** | Medium | Git branch changed |

#### PTY/Terminal Events (4)

| Event | Currently Handled | Priority | Description |
|-------|-------------------|----------|-------------|
| `pty.created` | **No** | Medium | Terminal session created |
| `pty.updated` | **No** | Medium | Terminal session updated |
| `pty.exited` | **No** | Medium | Terminal exited with code |
| `pty.deleted` | **No** | Low | Terminal session deleted |

#### Tool Events (2)

| Event | Currently Handled | Priority | Description |
|-------|-------------------|----------|-------------|
| `tool.execute.before` | **No** | Low | Before tool runs (plugin hook) |
| `tool.execute.after` | **No** | Low | After tool completes (plugin hook) |

#### Other Events (7)

| Event | Currently Handled | Priority | Description |
|-------|-------------------|----------|-------------|
| `command.executed` | **No** | Low | A command was executed |
| `installation.updated` | **No** | Low | Installation was updated |
| `installation.update-available` | **No** | Medium | New version available |
| `lsp.client.diagnostics` | **No** | Medium | LSP diagnostics received |
| `lsp.updated` | **No** | Low | LSP state updated |
| `todo.updated` | **No** | Medium | Todo list was updated |
| `tui.*` (3 events) | **No** | N/A | TUI-specific events |

### Event Structures

#### Session Events

```typescript
// session.created
interface SessionCreatedEvent {
  type: "session.created";
  properties: {
    info: {
      id: string;
      parentID?: string;      // For child sessions (task tool)
      title?: string;
      time?: { created: number; updated: number };
      status?: { type?: string };
    };
  };
}

// session.updated
interface SessionUpdatedEvent {
  type: "session.updated";
  properties: {
    info: {
      id: string;
      parentID?: string;
      title?: string;
      time?: { created: number; updated: number };
      status?: { type?: string };
      cost?: number;
    };
  };
}

// session.status
interface SessionStatusEvent {
  type: "session.status";
  properties: {
    sessionID: string;
    status: {
      type: "idle" | "busy" | "retry";
      attempt?: number;       // For retry
      message?: string;       // For retry
      next?: number;          // Timestamp for next retry
    };
  };
}

// session.idle
interface SessionIdleEvent {
  type: "session.idle";
  properties?: {
    sessionId?: string;
    duration?: number;
  };
}

// session.error
interface SessionErrorEvent {
  type: "session.error";
  properties: {
    sessionID?: string;
    error?: string | { name?: string; data?: { message?: string } };
    message?: string;
  };
}

// session.deleted
interface SessionDeletedEvent {
  type: "session.deleted";
  properties: {
    info?: { id: string };
    sessionID?: string;
  };
}
```

#### Message Events

```typescript
// message.updated
interface MessageUpdatedEvent {
  type: "message.updated";
  properties: {
    info: {
      id: string;
      sessionID: string;
      role: "user" | "assistant";
      time?: { created: number; completed?: number };
      parentID?: string;
      modelID?: string;
      providerID?: string;
      mode?: string;
      agent?: string;
      path?: { cwd: string; root: string };
      cost?: number;
      tokens?: TokenUsage;
      finish?: string;
    };
  };
}

// message.part.updated
interface MessagePartUpdatedEvent {
  type: "message.part.updated";
  properties: {
    messageID: string;
    part: MessagePart;        // See Part Types section
    delta?: string;           // Text delta for streaming
  };
}

// message.removed
interface MessageRemovedEvent {
  type: "message.removed";
  properties: {
    messageID: string;
    sessionID: string;
  };
}

// message.part.removed
interface MessagePartRemovedEvent {
  type: "message.part.removed";
  properties: {
    part: {
      id: string;
      messageID: string;
      sessionID: string;
    };
  };
}
```

#### Permission Events

```typescript
// permission.updated
interface PermissionUpdatedEvent {
  type: "permission.updated";
  properties: {
    id: string;
    type: string;              // "bash", "edit", "write", "webfetch", "mcp", etc.
    pattern?: string | string[];
    sessionID: string;
    messageID: string;
    callID?: string;
    title: string;
    metadata: Record<string, unknown>;
    time: { created: number };
  };
}

// permission.replied
interface PermissionRepliedEvent {
  type: "permission.replied";
  properties: {
    sessionID: string;
    permissionID: string;
    response: "once" | "always" | "reject";
  };
}
```

#### File Events

```typescript
// file.edited
interface FileEditedEvent {
  type: "file.edited";
  properties: {
    file?: string;
    path?: string;
  };
}

// file.watcher.updated
interface FileWatcherUpdatedEvent {
  type: "file.watcher.updated";
  properties: {
    path?: string;
    changeType?: "create" | "modify" | "delete";
  };
}
```

---

## Complete Message Part Type Reference

> **Source:** Types derived from `/docs/implementation/types.ts` (auto-generated from OpenCode OpenAPI spec)

### All 12 Message Part Types

| Type | Currently Handled | Priority | Description |
|------|-------------------|----------|-------------|
| `text` | Yes | - | Plain text or markdown content |
| `reasoning` | **No** | **High** | AI reasoning/thinking content (Claude thinking) |
| `tool` | Yes | - | Current OpenCode tool format with state |
| `tool-invocation` | Yes (legacy) | - | Legacy Vercel AI SDK format |
| `tool-result` | **No** | Medium | Standalone tool execution results |
| `file` | Yes | - | File attachments (images, documents) |
| `patch` | **No** | **High** | Code diffs/patches (with hash and files array) |
| `step-start` | **No** | **High** | Start of LLM processing step |
| `step-finish` | **No** | **High** | End of step with cost/tokens |
| `subtask` | **No** | Medium | Subtask information (prompt, description, agent) |
| `snapshot` | **No** | Low | State snapshot reference |
| `agent` | **No** | Medium | Agent change indicator |
| `retry` | **No** | Medium | Retry attempt information with error |
| `compaction` | **No** | Low | Context compaction indicator |

### Part Type Structures

#### Text Part

```typescript
interface TextPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: "text";
  text: string;
  time?: { start: number; end?: number };
}
```

**Example:**
```json
{
  "id": "part-abc123",
  "sessionID": "sess-xyz",
  "messageID": "msg-456",
  "type": "text",
  "text": "I'll help you create a new file. Let me first check the existing structure."
}
```

#### Tool Part (Current Format)

```typescript
// From official types.ts - ToolState is a discriminated union
type ToolStatePending = {
  status: "pending";
  input: { [key: string]: unknown };
  raw: string;
};

type ToolStateRunning = {
  status: "running";
  input: { [key: string]: unknown };
  title?: string;
  metadata?: { [key: string]: unknown };
  time: { start: number };
};

type ToolStateCompleted = {
  status: "completed";
  input: { [key: string]: unknown };
  output: string;
  title: string;
  metadata: { [key: string]: unknown };
  time: {
    start: number;
    end: number;
    compacted?: number;
  };
  attachments?: Array<FilePart>;
};

type ToolStateError = {
  status: "error";
  input: { [key: string]: unknown };
  error: string;
  metadata?: { [key: string]: unknown };
  time: {
    start: number;
    end: number;
  };
};

type ToolState = ToolStatePending | ToolStateRunning | ToolStateCompleted | ToolStateError;

interface ToolPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: "tool";
  callID: string;
  tool: string;                // "bash", "read", "write", "edit", "glob", "grep", "webfetch", "task"
  state: ToolState;
  metadata?: { [key: string]: unknown };
}
```

**Example (Running):**
```json
{
  "type": "tool",
  "callID": "call-abc123",
  "tool": "bash",
  "state": {
    "status": "running",
    "input": { "command": "ls -la" },
    "title": "Running: ls -la"
  }
}
```

**Example (Completed):**
```json
{
  "type": "tool",
  "callID": "call-abc123",
  "tool": "read",
  "state": {
    "status": "completed",
    "input": { "path": "/src/index.ts" },
    "output": "export function main() {\n  console.log('Hello');\n}",
    "title": "Read: /src/index.ts"
  }
}
```

**Example (Error):**
```json
{
  "type": "tool",
  "callID": "call-abc123",
  "tool": "bash",
  "state": {
    "status": "error",
    "input": { "command": "rm -rf /protected" },
    "error": "Permission denied: Cannot modify protected directory"
  }
}
```

#### Tool Invocation Part (Legacy)

```typescript
interface ToolInvocationPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: "tool-invocation";
  toolInvocation: {
    toolCallId: string;
    toolName: string;
    args?: unknown;
    state?: string;
    result?: unknown;
  };
}
```

#### Tool Result Part (NOT YET HANDLED)

```typescript
interface ToolResultPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: "tool-result";
  callID?: string;             // Links to original tool call
  tool?: string;
  text?: string;               // Result as text
}
```

#### File Part

```typescript
interface FilePart {
  id: string;
  sessionID: string;
  messageID: string;
  type: "file";
  url: string;                 // Data URL or file:// URL
  filename?: string;
  mime?: string;               // "image/png", "application/pdf", etc.
}
```

**Example (Image):**
```json
{
  "type": "file",
  "url": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
  "filename": "screenshot.png",
  "mime": "image/png"
}
```

#### Reasoning Part (NOT YET HANDLED)

```typescript
// From official types.ts
interface ReasoningPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: "reasoning";
  text: string;
  metadata?: { [key: string]: unknown };
  time: {
    start: number;
    end?: number;
  };
}
```

**Example:**
```json
{
  "type": "reasoning",
  "text": "Let me think about this step by step. First, I need to understand the current file structure...",
  "time": { "start": 1702657200000 }
}
```

**UI Recommendation:** Collapsible "Thinking..." section with subtle styling, similar to Claude's thinking display.

#### Patch Part (NOT YET HANDLED)

```typescript
// From official types.ts - NOTE: Different structure than previously assumed
interface PatchPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: "patch";
  hash: string;                // Commit/patch hash
  files: Array<string>;        // List of affected files
}
```

**Example:**
```json
{
  "type": "patch",
  "hash": "abc123def456",
  "files": ["/src/utils.ts", "/src/index.ts"]
}
```

**Note:** The actual diff content may need to be fetched separately using the hash. The patch part just references which files were changed.

#### Step Start Part (NOT YET HANDLED)

```typescript
interface StepStartPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: "step-start";
  snapshot?: string;
  reason?: string;
  time?: { start: number };
}
```

**Example:**
```json
{
  "type": "step-start",
  "snapshot": "snap-abc123",
  "reason": "Processing user request",
  "time": { "start": 1702657200000 }
}
```

#### Step Finish Part (NOT YET HANDLED)

```typescript
interface StepFinishPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: "step-finish";
  snapshot?: string;
  reason?: string;
  cost?: number;
  tokens?: {
    input: number;
    output: number;
    reasoning: number;
    cache?: { read: number; write: number };
  };
  time?: { start: number; end: number };
}
```

**Example:**
```json
{
  "type": "step-finish",
  "snapshot": "snap-abc123",
  "reason": "completed",
  "cost": 0.0034,
  "tokens": {
    "input": 1523,
    "output": 456,
    "reasoning": 0,
    "cache": { "read": 1200, "write": 323 }
  },
  "time": { "start": 1702657200000, "end": 1702657205000 }
}
```

#### Subtask Part (NOT YET HANDLED)

```typescript
// From official types.ts
interface SubtaskPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: "subtask";
  prompt: string;
  description: string;
  agent: string;
}
```

**Example:**
```json
{
  "type": "subtask",
  "prompt": "Analyze the database schema",
  "description": "Reviewing database structure",
  "agent": "explore"
}
```

#### Agent Part (NOT YET HANDLED)

```typescript
// From official types.ts
interface AgentPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: "agent";
  name: string;
  source?: {
    value: string;
    start: number;
    end: number;
  };
}
```

**Example:**
```json
{
  "type": "agent",
  "name": "build",
  "source": { "value": "@build", "start": 0, "end": 6 }
}
```

#### Retry Part (NOT YET HANDLED)

```typescript
// From official types.ts
interface RetryPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: "retry";
  attempt: number;
  error: ApiError;
  time: {
    created: number;
  };
}
```

**Example:**
```json
{
  "type": "retry",
  "attempt": 2,
  "error": {
    "name": "APIError",
    "data": { "message": "Rate limited", "statusCode": 429, "isRetryable": true }
  },
  "time": { "created": 1702657200000 }
}
```

#### Compaction Part (NOT YET HANDLED)

```typescript
// From official types.ts
interface CompactionPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: "compaction";
  auto: boolean;
}
```

**Example:**
```json
{
  "type": "compaction",
  "auto": true
}
```

#### Snapshot Part (NOT YET HANDLED)

```typescript
// From official types.ts
interface SnapshotPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: "snapshot";
  snapshot: string;
}
```

---

## Protocol Comparison

### OpenCode vs assistant-ui vs AG-UI

| Aspect | OpenCode (Current) | assistant-ui | AG-UI Protocol |
|--------|-------------------|--------------|----------------|
| **Event Format** | `eventType` + `properties` | `ThreadMessageLike` | `EventType` enum |
| **Message Structure** | `Message { info, parts[] }` | `{ role, content[], id, status }` | Start/Content/End events |
| **Tool Calls** | `{ type: "tool", callID, state }` | `{ type: "tool-call", toolCallId, result }` | `TOOL_CALL_START/ARGS/END/RESULT` |
| **Streaming** | `message.part.updated` with delta | `isRunning` boolean | `TEXT_MESSAGE_CONTENT` delta |
| **Status** | `session.status` (idle/busy/retry) | `MessageStatus` (running/complete/incomplete) | `RUN_STARTED/FINISHED/ERROR` |
| **Permissions** | `permission.updated/replied` | Not native | Not native |

### assistant-ui Expected Types

```typescript
// What assistant-ui expects
type ThreadMessageLike = {
  role: "assistant" | "user" | "system";
  content: string | readonly MessagePart[];
  id?: string;
  createdAt?: Date;
  status?: MessageStatus;
  attachments?: readonly CompleteAttachment[];
  metadata?: {
    steps?: readonly ThreadStep[];
    custom?: Record<string, unknown>;
  };
};

type MessageStatus = 
  | { type: "running" }
  | { type: "complete" }
  | { type: "incomplete"; reason: "length" | "cancelled" | "content-filter" | "other" | "error"; error?: unknown }
  | { type: "requires-action"; reason: "tool-calls" };
```

### AG-UI Evaluation

AG-UI is a protocol specification for agent-UI communication. After evaluation:

**Why AG-UI is NOT directly helpful for our case:**
- OpenCode already has its own event protocol
- We'd need to build a translation layer (OpenCode events -> AG-UI events)
- assistant-ui doesn't have native AG-UI integration
- The effort to adopt AG-UI would be significant with unclear benefits

**Recommendation:** Focus on properly mapping OpenCode events to assistant-ui's expected format.

---

## Proposed Module Architecture

### File Structure

```
apps/frontend/src/lib/chat/
├── RuntimeProvider.tsx              # Main orchestrator (to be refactored to ~200 lines)
├── index.ts                         # Re-exports
│
├── types/
│   ├── events.ts                    # ✅ CREATED - SSE event types (re-exports from SDK)
│   ├── messages.ts                  # ✅ CREATED - Internal message types + type guards
│   └── index.ts                     # ✅ CREATED - Re-exports
│
├── converters/
│   ├── part-converters.ts           # ✅ CREATED - Individual part type converters
│   ├── message-converter.ts         # ✅ CREATED - OpenCode API -> InternalMessage
│   ├── thread-converter.ts          # ✅ CREATED - InternalMessage -> ThreadMessageLike
│   └── index.ts                     # ✅ CREATED - Re-exports all converters
│
├── handlers/                        # 🔲 PENDING
│   ├── sse-event-handler.ts         # Main SSE event router
│   ├── session-events.ts            # Session event handlers
│   ├── message-events.ts            # Message event handlers
│   ├── permission-events.ts         # Permission event handlers
│   ├── file-events.ts               # File event handlers
│   └── index.ts
│
├── hooks/                           # 🔲 PENDING
│   ├── use-message-state.ts         # Message state management
│   ├── use-message-actions.ts       # Send, cancel operations
│   ├── use-sse-stream.ts            # SSE connection management
│   └── index.ts
│
├── contexts/                        # 🔲 PENDING (extract from RuntimeProvider)
│   ├── attachment-context.tsx       # File attachment handling
│   ├── session-status-context.tsx   # Session status (idle/busy/retry)
│   └── index.ts
│
├── components/                      # 🔲 PENDING (new UI components)
│   ├── PermissionBar.tsx            # (existing)
│   ├── StepIndicator.tsx            # (new) Step boundaries
│   ├── CostBadge.tsx                # (new) Cost/token display
│   ├── DiffViewer.tsx               # (new) Patch display
│   └── index.ts
│
├── PermissionContext.tsx            # (existing)
└── FileAttachment.tsx               # (existing)
```

### Module Details

#### 1. `types/events.ts` (~100 lines)

All SSE event type definitions:

```typescript
export type OpenCodeEventType = 
  // Session events
  | "session.created" | "session.updated" | "session.status" 
  | "session.idle" | "session.error" | "session.deleted"
  | "session.compacted" | "session.diff"
  // Message events
  | "message.updated" | "message.part.updated" 
  | "message.removed" | "message.part.removed"
  // Permission events
  | "permission.updated" | "permission.replied"
  // File events
  | "file.edited" | "file.watcher.updated"
  // Server events
  | "server.connected" | "error"
  // Tool events
  | "tool.execute.before" | "tool.execute.after"
  // Other
  | "command.executed" | "installation.updated"
  | "lsp.client.diagnostics" | "lsp.updated"
  | "todo.updated"
  | "tui.prompt.append" | "tui.command.execute" | "tui.toast.show";

export interface SessionCreatedEvent { ... }
export interface MessagePartUpdatedEvent { ... }
// ... all event interfaces
```

#### 2. `types/messages.ts` (~120 lines)

Extended internal message types to handle all 12 part types:

```typescript
export type ToolCallStatus = "pending" | "running" | "completed" | "error";

export interface InternalToolCall {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  argsRaw?: string;             // Raw JSON string
  result?: string;
  status: ToolCallStatus;
  error?: string;
  title?: string;
  metadata?: Record<string, unknown>;
  startTime?: number;
  endTime?: number;
  attachments?: InternalFilePart[];  // Tool can have file attachments
}

export interface InternalFilePart {
  id: string;
  url: string;
  filename?: string;
  mime: string;
  source?: {
    type: "file" | "symbol";
    path: string;
    // Additional source info
  };
}

export interface InternalStep {
  id: string;
  phase: "start" | "finish";
  startTime?: number;
  endTime?: number;
  reason?: string;
  snapshot?: string;
  cost?: number;
  tokens?: {
    input: number;
    output: number;
    reasoning: number;
    cache?: { read: number; write: number };
  };
}

export interface InternalPatch {
  id: string;
  hash: string;
  files: string[];
}

export interface InternalReasoning {
  id: string;
  text: string;
  startTime?: number;
  endTime?: number;
}

export interface InternalSubtask {
  id: string;
  prompt: string;
  description: string;
  agent: string;
}

export interface InternalRetry {
  id: string;
  attempt: number;
  error: {
    name: string;
    message: string;
    statusCode?: number;
    isRetryable?: boolean;
  };
  createdAt: number;
}

export interface InternalMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  reasoning?: InternalReasoning[];   // NEW: Thinking/reasoning content
  toolCalls: Map<string, InternalToolCall>;
  files: InternalFilePart[];
  steps: InternalStep[];              // NEW: Step start/finish tracking
  patches: InternalPatch[];           // NEW: Code change patches
  subtasks?: InternalSubtask[];       // NEW: Subtask references
  retries?: InternalRetry[];          // NEW: Retry attempts
  agent?: string;                     // NEW: Agent used
  isCompacted?: boolean;              // NEW: Whether context was compacted
  createdAt?: Date;
  completedAt?: Date;
  cost?: number;                      // Accumulated cost from step-finish parts
  tokens?: {                          // Accumulated tokens from step-finish parts
    input: number;
    output: number;
    reasoning: number;
    cached?: number;
  };
}
```

#### 3. `converters/message-converter.ts` (~150 lines)

```typescript
import type { Message, MessagePart } from "@/lib/api/tauri";
import type { InternalMessage } from "../types/messages";
import type { ThreadMessageLike } from "@assistant-ui/react";

export function convertOpenCodeMessage(msg: Message): InternalMessage {
  // Handle ALL part types:
  // - text
  // - tool
  // - tool-invocation
  // - tool-result (NEW)
  // - file
  // - patch (NEW)
  // - step-start (NEW)
  // - step-finish (NEW)
}

export function convertToThreadMessage(msg: InternalMessage): ThreadMessageLike {
  // Convert to assistant-ui format with:
  // - text parts
  // - tool-call parts (with proper status mapping)
  // - image parts
  // - file parts
  // - Custom parts for steps, patches, cost
}
```

#### 4. `handlers/sse-event-handler.ts` (~100 lines)

```typescript
export interface SSEHandlerContext {
  sessionId: string;
  projectId: string;
  callbacks: {
    setMessages: React.Dispatch<React.SetStateAction<InternalMessage[]>>;
    setIsRunning: (running: boolean) => void;
    setSessionStatus: (status: SessionStatusType) => void;
    setRetryInfo: (info: RetryInfo | null) => void;
    setError: (error: string | null) => void;
    addPermission: (permission: PermissionRequest) => void;
    removePermission: (permissionId: string) => void;
    onSessionCreated?: (session: Session) => void;
    onSessionUpdated?: (session: Session) => void;
    onFileEdited?: (filePath: string) => void;
  };
}

export function createSSEEventHandler(ctx: SSEHandlerContext) {
  return (event: OpenCodeEvent) => {
    const eventType = event.data?.type || event.eventType;
    const properties = (event.data as any)?.properties;

    // Route to appropriate handler
    if (eventType.startsWith("session.")) {
      handleSessionEvent(eventType, properties, ctx);
    } else if (eventType.startsWith("message.")) {
      handleMessageEvent(eventType, properties, ctx);
    } else if (eventType.startsWith("permission.")) {
      handlePermissionEvent(eventType, properties, ctx);
    } else if (eventType.startsWith("file.")) {
      handleFileEvent(eventType, properties, ctx);
    } else {
      console.log(`[SSE] Unhandled event type: ${eventType}`, properties);
    }
  };
}
```

#### 5. `hooks/use-message-state.ts` (~100 lines)

```typescript
export interface MessageStateOptions {
  projectId: string;
  sessionId: string | null;
  onSessionModelDetected?: (model: ModelSelection) => void;
  onSessionAgentDetected?: (agent: string) => void;
}

export interface MessageStateReturn {
  messages: InternalMessage[];
  isLoading: boolean;
  error: string | null;
  setMessages: React.Dispatch<React.SetStateAction<InternalMessage[]>>;
  setError: (error: string | null) => void;
  addOptimisticUserMessage: (text: string, files?: InternalFilePart[]) => string;
}

export function useMessageState(options: MessageStateOptions): MessageStateReturn;
```

#### 6. `hooks/use-sse-stream.ts` (~80 lines)

```typescript
export interface SSEStreamOptions {
  projectId: string;
  sessionId: string | null;
  isLoading: boolean;
  onEvent: (event: OpenCodeEvent) => void;
}

export function useSSEStream(options: SSEStreamOptions): {
  isConnected: boolean;
  streamRef: React.MutableRefObject<OpenCodeStream | null>;
};
```

#### 7. Refactored `RuntimeProvider.tsx` (~200 lines)

```typescript
export function RuntimeProvider({ projectId, sessionId, ... }: RuntimeProviderProps) {
  // Use modular hooks
  const { messages, setMessages, isLoading, error, setError, addOptimisticUserMessage } = 
    useMessageState({ projectId, sessionId, ... });
  
  const { addPermission, removePermission } = usePermissions();
  
  const [isRunning, setIsRunning] = useState(false);
  const [sessionStatus, setSessionStatus] = useState<SessionStatusType>("idle");
  const [retryInfo, setRetryInfo] = useState<RetryInfo | null>(null);

  // Create SSE handler with all callbacks
  const handleSSEEvent = useMemo(() => createSSEEventHandler({
    sessionId: sessionId || "",
    projectId,
    callbacks: { ... },
  }), [sessionId, projectId, ...deps]);

  // Connect SSE stream
  useSSEStream({
    projectId,
    sessionId,
    isLoading,
    onEvent: handleSSEEvent,
  });

  // Message actions
  const { onNew, onCancel } = useMessageActions({ ... });

  // Convert to assistant-ui format
  const threadMessages = useMemo(
    () => messages.map(convertToThreadMessage),
    [messages]
  );

  const runtime = useExternalStoreRuntime({
    messages: threadMessages,
    isRunning,
    onNew,
    onCancel,
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <SessionStatusContext.Provider value={{ status: sessionStatus, retryInfo }}>
        <AttachmentContext.Provider value={{ sendWithAttachments }}>
          <div className="flex flex-col flex-1 min-h-0">
            {error && <ErrorBanner error={error} onDismiss={() => setError(null)} />}
            <div className="flex-1 min-h-0">{children}</div>
            <PermissionBar />
          </div>
        </AttachmentContext.Provider>
      </SessionStatusContext.Provider>
    </AssistantRuntimeProvider>
  );
}
```

---

## New UI Components

### 1. StepIndicator Component

**Purpose:** Show processing step boundaries with timing

```tsx
interface StepIndicatorProps {
  reason?: string;        // "Processing user request"
  startTime: number;
  endTime?: number;
  cost?: number;
  tokens?: TokenUsage;
  collapsed?: boolean;
}
```

**Display:** Subtle divider with optional expand for details

### 2. CostBadge Component

**Purpose:** Display cost and token usage for a step/message

```tsx
interface CostBadgeProps {
  cost: number;           // e.g., 0.0034
  tokens?: {
    input: number;
    output: number;
    reasoning?: number;
    cached?: number;
  };
  compact?: boolean;
}
```

**Display:** Small badge like `$0.003 | 1.5k tokens`

### 3. DiffViewer Component

**Purpose:** Display code patches/diffs

```tsx
interface DiffViewerProps {
  filename?: string;
  diff: string;           // Unified diff format
  collapsed?: boolean;
  viewMode?: "unified" | "split";
}
```

**Display Options:**
- **Simple:** Syntax-highlighted code block with `diff` language
- **Advanced:** Side-by-side view using a diff library

---

## Implementation Phases

### Phase 1: Type Definitions ✅ COMPLETED
- [x] Create `types/events.ts` with all 31 event types (re-exports from SDK)
- [x] Create `types/messages.ts` with extended internal types
- [x] Add `steps`, `patches`, `cost`, `tokens`, `reasoning`, `subtasks`, `retries` to InternalMessage
- [x] Export all types from `types/index.ts`
- [x] Add type guards for all part types

### Phase 2: Message Converters ✅ COMPLETED
- [x] Create `converters/part-converters.ts` - handles all 12 part types
- [x] Create `converters/message-converter.ts` - OpenCode API -> InternalMessage
- [x] Create `converters/thread-converter.ts` - InternalMessage -> ThreadMessageLike (proper assistant-ui types)
- [x] Create `converters/index.ts` - re-exports all converters
- [ ] Add unit tests for converters (deferred)

### Phase 3: Event Handlers 🔲 IN PROGRESS
- [ ] Create `handlers/sse-event-handler.ts` (router)
- [ ] Create `handlers/session-events.ts`
- [ ] Create `handlers/message-events.ts`
- [ ] Create `handlers/permission-events.ts`
- [ ] Create `handlers/file-events.ts`
- [ ] Add all missing event handlers (currently only ~10 of 31 handled)
- [ ] Add unit tests for handlers

### Phase 4: Hooks 🔲 PENDING
- [ ] Create `hooks/use-message-state.ts`
- [ ] Create `hooks/use-message-actions.ts`
- [ ] Create `hooks/use-sse-stream.ts`
- [ ] Extract contexts to `contexts/`
- [ ] Add unit tests for hooks

### Phase 5: New UI Components 🔲 PENDING
- [ ] Create `components/StepIndicator.tsx`
- [ ] Create `components/CostBadge.tsx`
- [ ] Create `components/DiffViewer.tsx`
- [ ] Create custom DataMessagePart renderers for patches/subtasks
- [ ] Integrate into ChatThread rendering
- [ ] Style components with existing design system

### Phase 6: Integration & Testing 🔲 PENDING
- [ ] Refactor `RuntimeProvider.tsx` to use new modules (~1,200 lines -> ~200 lines)
- [ ] Update RuntimeProvider to use `convertMessage` from thread-converter
- [ ] Integration testing with real OpenCode backend
- [ ] Fix any regressions
- [ ] Performance testing
- [ ] Update documentation

---

## Testing Strategy

### Unit Tests

**Converters:**
- Test `convertOpenCodeMessage` with all part types
- Test `convertToThreadMessage` produces valid assistant-ui format
- Test edge cases (empty messages, missing fields, malformed data)

**Event Handlers:**
- Test each event type handler in isolation
- Mock callbacks and verify they're called correctly
- Test error handling for malformed events

**Hooks:**
- Test `useMessageState` state management
- Test `useSSEStream` connection lifecycle
- Test `useMessageActions` with mocked API calls

### Integration Tests

- Test full flow: SSE event -> handler -> state update -> UI render
- Test permission flow end-to-end
- Test session switching doesn't lose permissions
- Test cost accumulation across messages

### Mock Events for Testing

```typescript
// Example mock events for testing
export const mockEvents = {
  sessionCreated: {
    type: "session.created",
    properties: {
      info: { id: "sess-123", title: "Test Session" }
    }
  },
  messagePartUpdated: {
    type: "message.part.updated",
    properties: {
      messageID: "msg-456",
      part: { type: "text", text: "Hello world" },
      delta: "Hello world"
    }
  },
  stepFinish: {
    type: "message.part.updated",
    properties: {
      messageID: "msg-456",
      part: {
        type: "step-finish",
        cost: 0.0034,
        tokens: { input: 100, output: 50, reasoning: 0 }
      }
    }
  },
  // ... more mock events
};
```

---

## Open Questions

1. **Patch Display Preference:**
   - Option A: Simple syntax-highlighted code block (quick to implement)
   - Option B: Full diff viewer with side-by-side/unified toggle (better UX)

2. **Cost Display Location:**
   - Per-message badge?
   - Session total in header?
   - Both?

3. **File Edit Notifications:**
   - Should `file.edited` events trigger a toast notification?
   - Should they auto-refresh the file browser sidebar?

4. **LSP Diagnostics:**
   - Should we display LSP diagnostics in the file viewer?
   - Or defer to future iteration?

---

## Summary

This refactoring will:

- **Reduce complexity**: From 1,200 lines -> ~200 lines main file + focused modules
- **Add missing features**: Cost tracking, step indicators, diff viewing
- **Handle all events**: 26 SSE event types properly routed
- **Handle all parts**: 8 message part types with dedicated converters
- **Improve testability**: Pure functions that can be unit tested
- **Better UX**: Users see costs, progress steps, and code changes clearly

---

## Appendix: Official OpenCode Types

The complete official types are available in `/docs/implementation/types.ts`, auto-generated from the OpenCode OpenAPI specification. Key type exports include:

### Event Types (Union)
```typescript
export type Event =
  | EventServerInstanceDisposed
  | EventInstallationUpdated
  | EventInstallationUpdateAvailable
  | EventLspClientDiagnostics
  | EventLspUpdated
  | EventMessageUpdated
  | EventMessageRemoved
  | EventMessagePartUpdated
  | EventMessagePartRemoved
  | EventPermissionUpdated
  | EventPermissionReplied
  | EventSessionStatus
  | EventSessionIdle
  | EventSessionCompacted
  | EventFileEdited
  | EventTodoUpdated
  | EventCommandExecuted
  | EventSessionCreated
  | EventSessionUpdated
  | EventSessionDeleted
  | EventSessionDiff
  | EventSessionError
  | EventFileWatcherUpdated
  | EventVcsBranchUpdated
  | EventTuiPromptAppend
  | EventTuiCommandExecute
  | EventTuiToastShow
  | EventPtyCreated
  | EventPtyUpdated
  | EventPtyExited
  | EventPtyDeleted
  | EventServerConnected;
```

### Part Types (Union)
```typescript
export type Part =
  | TextPart
  | SubtaskPart      // { type: "subtask", prompt, description, agent }
  | ReasoningPart
  | FilePart
  | ToolPart
  | StepStartPart
  | StepFinishPart
  | SnapshotPart
  | PatchPart
  | AgentPart
  | RetryPart
  | CompactionPart;
```

### Error Types
```typescript
export type MessageError =
  | ProviderAuthError
  | UnknownError
  | MessageOutputLengthError
  | MessageAbortedError
  | ApiError;
```

---

## References

- [assistant-ui Documentation](https://www.assistant-ui.com/docs)
- [AG-UI Protocol](https://docs.ag-ui.com)
- [OpenCode Events (architecture.md)](../onboarding-system/architecture.md#available-plugin-events)
- [Official OpenCode Types](./types.ts) - Auto-generated from OpenAPI spec
