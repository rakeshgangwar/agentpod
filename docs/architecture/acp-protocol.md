# ACP Protocol Overview

## What is ACP?

The Agent Client Protocol (ACP) is an open standard for communication between code editors/IDEs and AI coding agents. Created by Zed Industries and JetBrains, it defines how clients (like CodeOpen) communicate with AI agents (like Claude Code, Gemini CLI, OpenCode).

## Protocol Basics

### Transport

- **Primary**: JSON-RPC 2.0 over stdio
- **Agents run as subprocesses**: Client spawns agent process, communicates via stdin/stdout
- **Bidirectional**: Both client and agent can initiate requests

### Message Types

| Type | Direction | Purpose |
|------|-----------|---------|
| Request | Client → Agent | Initialize, create session, send prompt |
| Request | Agent → Client | Read file, write file, request permission |
| Response | Both | Reply to request |
| Notification | Both | One-way update (no response expected) |

### Message Format

```json
// Request
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "session/new",
  "params": {
    "cwd": "/workspace",
    "mcpServers": []
  }
}

// Response
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "sessionId": "sess_abc123"
  }
}

// Notification (no id, no response)
{
  "jsonrpc": "2.0",
  "method": "session/update",
  "params": {
    "sessionId": "sess_abc123",
    "status": "idle"
  }
}
```

## Lifecycle

### 1. Initialization

```
Client                          Agent
   |                               |
   |--- spawn agent process ------>|
   |                               |
   |--- initialize --------------->|
   |<-- initialize response -------|
   |    (capabilities, auth)       |
   |                               |
```

**Initialize Request**:
```json
{
  "method": "initialize",
  "params": {
    "clientInfo": {
      "name": "CodeOpen",
      "version": "2.0.0"
    },
    "capabilities": {
      "textFiles": { "read": true, "write": true },
      "terminals": { "create": true },
      "permissions": { "request": true }
    }
  }
}
```

**Initialize Response**:
```json
{
  "result": {
    "serverInfo": {
      "name": "claude-code",
      "version": "1.0.0"
    },
    "capabilities": {
      "sessionModes": ["code", "ask", "plan"],
      "tools": ["read", "write", "bash", "webfetch"]
    },
    "authMethods": [
      { "id": "oauth", "name": "Anthropic Console OAuth" }
    ]
  }
}
```

### 2. Authentication (if required)

```
Client                          Agent
   |                               |
   |--- authenticate ------------->|
   |    { methodId: "oauth" }      |
   |                               |
   |<-- authenticate response -----|
   |    (OAuth URL or status)      |
   |                               |
   |... user completes OAuth ...|
   |                               |
   |<-- auth_complete notification-|
```

### 3. Session Creation

```
Client                          Agent
   |                               |
   |--- session/new -------------->|
   |    { cwd: "/workspace" }      |
   |                               |
   |<-- session/new response ------|
   |    { sessionId: "..." }       |
```

### 4. Prompt Turn

```
Client                          Agent
   |                               |
   |--- session/prompt ----------->|
   |    { sessionId, prompt }      |
   |                               |
   |<-- session/update notification|
   |    (thinking)                 |
   |                               |
   |<-- session/update notification|
   |    (tool call started)        |
   |                               |
   |<-- fs/read_text_file request--|
   |                               |
   |--- fs/read_text_file resp --->|
   |    { content: "..." }         |
   |                               |
   |<-- session/update notification|
   |    (text chunk)               |
   |                               |
   |<-- session/prompt response ---|
   |    (turn complete)            |
```

## Key Methods

### Client → Agent

| Method | Purpose |
|--------|---------|
| `initialize` | Initialize connection, exchange capabilities |
| `authenticate` | Start authentication flow |
| `session/new` | Create new session |
| `session/prompt` | Send prompt to agent |
| `session/cancel` | Cancel current operation |
| `session/set_mode` | Change session mode (code/plan/ask) |
| `shutdown` | Graceful shutdown |

### Agent → Client

| Method | Purpose |
|--------|---------|
| `fs/read_text_file` | Read file contents |
| `fs/write_text_file` | Write file contents |
| `fs/list_directory` | List directory contents |
| `terminal/create` | Create terminal session |
| `terminal/run` | Execute command in terminal |
| `session/request_permission` | Request user permission |

### Notifications (Agent → Client)

| Notification | Purpose |
|--------------|---------|
| `session/update` | Session state changed (text, tool call, etc.) |
| `session/end_turn` | Agent finished responding |
| `auth_complete` | Authentication completed |

## Session Updates

The `session/update` notification carries different types of content:

```typescript
interface SessionUpdate {
  sessionId: string;
  type: 'thinking' | 'text' | 'tool_call' | 'tool_result' | 'error';
  content?: {
    // For 'text'
    text?: string;
    
    // For 'tool_call'
    toolCall?: {
      id: string;
      name: string;
      input: Record<string, unknown>;
      status: 'pending' | 'running' | 'completed' | 'failed';
    };
    
    // For 'tool_result'
    toolResult?: {
      callId: string;
      output: string;
      isError: boolean;
    };
  };
}
```

## Permissions

Agents request permission before performing sensitive operations:

```json
// Agent → Client: Request permission
{
  "method": "session/request_permission",
  "params": {
    "id": "perm_123",
    "sessionId": "sess_abc",
    "tool": "bash",
    "description": "Execute: npm install express",
    "options": [
      { "id": "once", "label": "Allow Once" },
      { "id": "always", "label": "Always Allow" },
      { "id": "deny", "label": "Deny" }
    ]
  }
}

// Client → Agent: Permission response
{
  "result": {
    "optionId": "once"
  }
}
```

## File System Operations

Agents don't have direct filesystem access. They request file operations from the client:

```json
// Agent → Client: Read file
{
  "method": "fs/read_text_file",
  "params": {
    "path": "/workspace/package.json"
  }
}

// Client → Agent: File contents
{
  "result": {
    "content": "{ \"name\": \"my-project\" ... }"
  }
}

// Agent → Client: Write file
{
  "method": "fs/write_text_file",
  "params": {
    "path": "/workspace/hello.txt",
    "content": "Hello, World!"
  }
}

// Client → Agent: Success
{
  "result": null
}
```

## Implementation in CodeOpen

### ACP Gateway Role

The ACP Gateway in the container acts as the ACP Client:

1. Spawns agent subprocesses
2. Handles JSON-RPC communication via stdio
3. Implements file system operations (since container has filesystem access)
4. Forwards permission requests to frontend via SSE
5. Broadcasts session updates via SSE

### Event Translation

ACP notifications are translated to SSE events:

| ACP Notification | SSE Event |
|------------------|-----------|
| `session/update` (text) | `message.part.updated` |
| `session/update` (tool_call) | `tool.execute` |
| `session/update` (tool_result) | `tool.result` |
| `session/request_permission` | `permission.request` |
| `session/end_turn` | `session.updated` |

## Supported Agents

| Agent | Command | ACP Support |
|-------|---------|-------------|
| OpenCode | `opencode acp` | Native (via OpenCode docs) |
| Claude Code | `npx @zed-industries/claude-code-acp` | Wrapper by Zed |
| Gemini CLI | `gemini --experimental-acp` | Native (experimental) |
| Qwen Code | `npx @qwen-code/qwen-code --experimental-acp` | Native (experimental) |
| Codex | `npx @zed-industries/codex-acp` | Wrapper by Zed |

## Resources

- [ACP Specification](https://agentclientprotocol.com/protocol/overview)
- [ACP Schema](https://agentclientprotocol.com/protocol/schema)
- [TypeScript SDK](https://github.com/agentclientprotocol/typescript-sdk)
- [Rust Crate](https://github.com/agentclientprotocol/rust-sdk)
- [OpenCode ACP Docs](https://opencode.ai/docs/acp/)
