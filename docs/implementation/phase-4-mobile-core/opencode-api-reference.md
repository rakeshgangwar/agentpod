# OpenCode API Reference

This document consolidates the OpenCode HTTP API documentation for use in Phase 4 implementation.

## Architecture Overview

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│   Desktop App   │────▶│  Management API  │────▶│ OpenCode Container  │
│   (Tauri)       │     │  (Proxy Layer)   │     │ (Per Project)       │
└─────────────────┘     └──────────────────┘     └─────────────────────┘
```

- **Desktop App**: Connects only to Management API
- **Management API**: Proxies requests to correct OpenCode container, stores metadata
- **OpenCode Container**: One per project, runs on port 4096 internally

## Management API Proxy Endpoints (To Implement)

These endpoints will be added to the Management API to proxy to OpenCode:

| Management API Endpoint | Proxies To | Description |
|------------------------|------------|-------------|
| `GET /api/projects/:id/opencode/app` | `GET /app` | App info |
| `GET /api/projects/:id/opencode/session` | `GET /session` | List sessions |
| `POST /api/projects/:id/opencode/session` | `POST /session` | Create session |
| `GET /api/projects/:id/opencode/session/:sid` | `GET /session/:sid` | Get session |
| `DELETE /api/projects/:id/opencode/session/:sid` | `DELETE /session/:sid` | Delete session |
| `POST /api/projects/:id/opencode/session/:sid/message` | `POST /session/:sid/message` | Send message |
| `GET /api/projects/:id/opencode/session/:sid/message` | `GET /session/:sid/message` | List messages |
| `POST /api/projects/:id/opencode/session/:sid/abort` | `POST /session/:sid/abort` | Abort session |
| `GET /api/projects/:id/opencode/event` | `GET /event` | SSE stream |
| `GET /api/projects/:id/opencode/file` | `GET /file` | List files |
| `GET /api/projects/:id/opencode/file/content` | `GET /file/content` | Read file |

---

## OpenCode Native API Reference

### Application Endpoints

#### GET /app
Get application information.

**Response:**
```json
{
  "name": "opencode",
  "version": "1.0.0"
}
```

#### POST /app/init
Initialize the application.

**Response:**
```json
true
```

#### GET /config
Get configuration.

**Query Parameters:**
- `directory` (optional): Directory path for config

**Response:**
```json
{
  "theme": "dark"
}
```

#### GET /agent
List available agents.

**Response:**
```json
[
  {
    "id": "agent_ai_coder",
    "name": "AI Coder Agent",
    "description": "Assists with code generation and explanation."
  }
]
```

---

### Session Management

#### GET /session
List all sessions.

**Response:**
```json
[
  {
    "id": "session789",
    "status": "idle",
    "created_at": "2024-01-15T10:30:00Z"
  }
]
```

#### POST /session
Create a new session.

**Request Body:**
```json
{
  "agent": "build",
  "model": {
    "providerID": "anthropic",
    "modelID": "claude-3-5-sonnet-20241022"
  }
}
```

**Response:**
```json
{
  "id": "session101",
  "status": "idle"
}
```

#### GET /session/:id
Get session details including cost and stats.

**Response:**
```json
{
  "id": "session789",
  "status": "idle",
  "cost": 0.0023,
  "created_at": "2024-01-15T10:30:00Z"
}
```

#### DELETE /session/:id
Delete a session.

#### POST /session/:id/abort
Abort a running session.

#### POST /session/:id/fork
Fork session at a specific message.

**Request Body:**
```json
{
  "messageID": "MESSAGE_ID"
}
```

#### POST /session/:id/share
Share session publicly.

#### POST /session/:id/revert
Revert file changes made in session.

**Request Body:**
```json
{
  "files": ["/path/to/file1.ts", "/path/to/file2.ts"]
}
```

#### POST /session/:id/compact
Compact session history.

#### GET /session/:id/diff
Get session diff summary.

---

### Message API

#### GET /session/:id/message
List all messages in a session.

**Response:**
```json
[
  {
    "info": {
      "id": "msg-abc",
      "role": "user",
      "content": "Hello!"
    },
    "parts": [
      {
        "id": "part-1",
        "type": "text",
        "text": "Hello!"
      }
    ]
  }
]
```

#### POST /session/:id/message
Send a message to a session.

**Request Body:**
```json
{
  "parts": [
    {
      "type": "text",
      "text": "Add error handling to the login function"
    },
    {
      "type": "file",
      "url": "file:///path/to/auth.ts",
      "filename": "auth.ts",
      "mime": "text/plain"
    }
  ]
}
```

**Message Part Types:**
- `text`: Plain text content
- `file`: File reference with URL, filename, and MIME type

#### GET /session/:id/message/:messageID
Get a specific message.

---

### File API

#### GET /file
List files based on query parameters.

**Query Parameters:**
- `query`: FileListParams object

**Response:**
```json
[
  {
    "name": "src",
    "type": "directory",
    "path": "/src",
    "children": [...]
  }
]
```

#### GET /file/content
Read file contents.

**Query Parameters:**
- `path`: File path to read

**Response:**
```json
{
  "content": "file contents here",
  "language": "typescript"
}
```

#### GET /file/status
Get file statuses (modified, staged, etc.).

---

### Find API

#### GET /find/file
Find files by pattern.

**Query Parameters:**
- `pattern`: Glob pattern

**Response:**
```json
["/src/index.ts", "/src/utils.ts"]
```

#### GET /find/symbol
Find symbols by name.

**Response:**
```json
[
  {
    "name": "handleLogin",
    "kind": "function",
    "location": "/src/auth.ts:42"
  }
]
```

#### GET /find
Search text content.

**Response:**
```json
[
  {
    "file": "/src/auth.ts",
    "line": 42,
    "text": "function handleLogin() {"
  }
]
```

---

### Server-Sent Events (SSE)

#### GET /event
Subscribe to real-time events. This is an SSE endpoint that streams events.

**Connection:**
```bash
curl -N http://localhost:4096/event
```

**Event Stream Format:**
```
data: {"type":"session.updated","properties":{...}}

data: {"type":"message.part.updated","properties":{...}}

data: {"type":"tool.execute","properties":{...}}
```

**Event Types:**

| Event Type | Description | Properties |
|------------|-------------|------------|
| `server.connected` | Initial connection established | - |
| `session.updated` | Session status/cost changed | `info.status`, `info.cost` |
| `message.part.updated` | New message content streamed | `part.type`, `part.text` |
| `tool.execute` | Tool is being executed | `name`, `input` |
| `tool.result` | Tool execution completed | `output` |
| `file.edited` | File was modified | `file` |

**TypeScript Event Handling Example:**
```typescript
const events = client.event.subscribe()
for await (const event of events) {
  switch (event.type) {
    case "session.updated":
      console.log("Status:", event.properties.info.status)
      console.log("Cost:", event.properties.info.cost)
      break

    case "message.part.updated":
      if (event.properties.part.type === "text") {
        process.stdout.write(event.properties.part.text)
      }
      break

    case "tool.execute":
      console.log(`Tool: ${event.properties.name}`)
      console.log("Input:", event.properties.input)
      break

    case "tool.result":
      console.log("Output:", event.properties.output)
      break

    case "file.edited":
      console.log("File changed:", event.properties.file)
      break
  }
}
```

---

## Data Models

### Session
```typescript
interface Session {
  id: string;
  status: "idle" | "running" | "error";
  cost?: number;
  created_at: string;
  updated_at?: string;
}
```

### Message
```typescript
interface Message {
  info: {
    id: string;
    role: "user" | "assistant";
    content?: string;
  };
  parts: MessagePart[];
}

interface MessagePart {
  id: string;
  type: "text" | "tool_call" | "tool_result" | "file";
  text?: string;
  content?: string;
}
```

### FileNode
```typescript
interface FileNode {
  name: string;
  type: "file" | "directory";
  path: string;
  children?: FileNode[];
}
```

### SSE Event
```typescript
interface SSEEvent {
  type: string;
  properties: Record<string, any>;
}
```

---

## Authentication

- **OpenCode itself**: No authentication required (runs in trusted environment)
- **LLM Providers**: Configured via OpenCode's config file with API keys
- **Management API**: Uses API key authentication (existing implementation)

The Management API handles all authentication. OpenCode containers are on a private Docker network and not directly accessible from the internet.

---

## Error Handling

OpenCode API errors follow standard HTTP status codes:

| Status | Meaning |
|--------|---------|
| 200 | Success |
| 400 | Bad request (invalid parameters) |
| 404 | Resource not found (session, message, file) |
| 500 | Internal server error |

Error response format:
```json
{
  "error": "Session not found",
  "code": "SESSION_NOT_FOUND"
}
```
