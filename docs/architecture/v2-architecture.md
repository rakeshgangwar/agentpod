# Architecture: ACP Multi-Agent Integration

## Overview

CodeOpen v2 introduces ACP (Agent Client Protocol) support to enable multiple AI coding agents within the same platform. This document describes the system architecture and data flow.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     CodeOpen Mobile/Desktop App                          │
│                        (SvelteKit + Tauri)                               │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                      Agent Selection UI                            │  │
│  │  [OpenCode] [Claude Code] [Gemini CLI] [Qwen Code] [Custom]       │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                              │                                           │
│                          HTTP/SSE                                        │
└──────────────────────────────┼───────────────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       Management API (Hono)                              │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ Existing Routes (kept for backward compat)                         │  │
│  │ /api/projects/:id/opencode/*  → OpenCode SDK                       │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ NEW: ACP Routes                                                    │  │
│  │ /api/projects/:id/acp/agents              → List agents            │  │
│  │ /api/projects/:id/acp/agents/:id/auth     → OAuth flow             │  │
│  │ /api/projects/:id/acp/session             → Create session         │  │
│  │ /api/projects/:id/acp/session/:id/prompt  → Send prompt            │  │
│  │ /api/projects/:id/acp/events              → SSE stream             │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ Auth Token Storage (like GitHub Copilot)                           │  │
│  │ - Encrypted storage in Management API database                     │  │
│  │ - Per-user, per-agent tokens                                       │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────┼───────────────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        Project Container                                 │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ OpenCode Server (existing) - Port 4096                             │  │
│  │ - REST/SSE API (backward compatible)                               │  │
│  │ - Also exposes `opencode acp` for ACP mode                         │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ ACP Gateway Service (NEW) - Port 4097                              │  │
│  │ - HTTP API for Management API to call                              │  │
│  │ - Spawns agent subprocesses on demand                              │  │
│  │ - JSON-RPC/stdio communication with agents                         │  │
│  │ - Handles fs/read, fs/write for agents                             │  │
│  │ - Proxies permissions to frontend                                  │  │
│  │ - SSE event broadcasting                                           │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                        │                                                 │
│          ┌─────────────┴─────────────┬─────────────┐                    │
│          ▼                           ▼             ▼                    │
│   ┌─────────────┐            ┌─────────────┐ ┌─────────────┐           │
│   │ opencode    │            │ claude-code │ │ gemini      │           │
│   │ acp         │            │ -acp (npx)  │ │ --exp-acp   │           │
│   └─────────────┘            └─────────────┘ └─────────────┘           │
│                                                                          │
│                       /workspace (project files)                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

### 1. CodeOpen App (Frontend)

| Component | Responsibility |
|-----------|---------------|
| Agent Selector | Display available agents, handle selection |
| Auth Modal | OAuth/device flow UI for agent authentication |
| Chat Adapter | Abstract communication with different agents |
| Session Manager | Track active sessions, handle persistence |
| Permission UI | Display and respond to agent permission requests |

### 2. Management API

| Component | Responsibility |
|-----------|---------------|
| ACP Routes | Proxy requests to container's ACP Gateway |
| Agent Auth Service | Handle OAuth flows, store tokens |
| Session Persistence | Store session metadata in database |
| Token Injection | Pass auth tokens to container via env vars |

### 3. ACP Gateway (Container)

| Component | Responsibility |
|-----------|---------------|
| HTTP Server | Expose REST/SSE API to Management API |
| Agent Manager | Spawn/stop agent subprocesses |
| ACP Client | JSON-RPC communication with agents |
| File Handler | Implement fs/read, fs/write for agents |
| Permission Proxy | Forward permission requests via SSE |
| Session Store | Track active ACP sessions |

### 4. ACP Agents

| Agent | Command | Auth Type |
|-------|---------|-----------|
| OpenCode | `opencode acp` | None (uses container env) |
| Claude Code | `npx @zed-industries/claude-code-acp` | OAuth (Anthropic Console) |
| Gemini CLI | `gemini --experimental-acp` | OAuth (Google) |
| Qwen Code | `npx @qwen-code/qwen-code --experimental-acp` | OAuth |
| Codex | `npx @zed-industries/codex-acp` | None |

## Data Flow

### Session Creation Flow

```
1. User selects agent in UI
2. Frontend → POST /api/projects/:id/acp/session
   { agentId: "claude", workingDirectory: "/workspace" }
   
3. Management API:
   a. Check if agent needs auth → retrieve token from DB
   b. Call container: POST http://container:4097/session
      { agentId: "claude", env: { ANTHROPIC_API_KEY: "..." } }
      
4. ACP Gateway:
   a. Spawn agent subprocess if not running
   b. Send ACP `session/new` request
   c. Return session ID
   
5. Management API:
   a. Store session in DB (for persistence)
   b. Return session info to frontend
   
6. Frontend:
   a. Subscribe to SSE events
   b. Update UI with session state
```

### Prompt Flow

```
1. User types prompt, clicks send
2. Frontend → POST /api/projects/:id/acp/session/:sid/prompt
   { text: "Create a hello.txt file" }
   
3. Management API → POST http://container:4097/session/:sid/prompt
   { text: "Create a hello.txt file" }
   
4. ACP Gateway:
   a. Send ACP `session/prompt` to agent subprocess
   b. Agent processes prompt, makes tool calls
   c. Agent calls fs/write_text_file → Gateway writes file
   d. Gateway emits SSE events for each update
   
5. SSE Events flow back:
   Container (ACP Gateway) → Management API → Frontend
   
6. Frontend updates UI in real-time
```

### Permission Flow

```
1. Agent needs permission (e.g., execute bash command)
2. Agent sends ACP `session/request_permission`
3. ACP Gateway emits SSE event:
   { type: "permission_request", id: "p123", tool: "bash", command: "npm install" }
   
4. Frontend displays permission modal
5. User clicks "Allow Once"
6. Frontend → POST /api/projects/:id/acp/permission/p123
   { response: "once" }
   
7. Management API → POST http://container:4097/permission/p123
   { response: "once" }
   
8. ACP Gateway sends permission response to agent
9. Agent continues execution
```

## Database Schema

### New Tables

```sql
-- Agent authentication tokens
CREATE TABLE agent_auth_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,           -- 'claude', 'gemini', 'qwen'
  access_token TEXT NOT NULL,        -- encrypted
  refresh_token TEXT,                -- encrypted
  expires_at INTEGER,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch()),
  UNIQUE(user_id, agent_id)
);

-- ACP sessions (for persistence)
CREATE TABLE agent_sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  agent_id TEXT NOT NULL,
  acp_session_id TEXT,              -- Session ID from ACP agent
  title TEXT,
  status TEXT NOT NULL,             -- 'active', 'paused', 'completed'
  working_directory TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

-- Session messages (for history/resumption)
CREATE TABLE agent_session_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES agent_sessions(id),
  role TEXT NOT NULL,               -- 'user', 'assistant'
  content TEXT NOT NULL,            -- JSON stringified
  tool_calls TEXT,                  -- JSON stringified
  created_at INTEGER DEFAULT (unixepoch())
);

-- Project agent preferences
ALTER TABLE projects ADD COLUMN default_agent_id TEXT DEFAULT 'opencode';
```

## Configuration

### Agent Configuration (Container)

```json
// /workspace/.codeopen/agents.json (or default)
{
  "agents": [
    {
      "id": "opencode",
      "name": "OpenCode",
      "command": "opencode",
      "args": ["acp"],
      "enabled": true,
      "authRequired": false,
      "isDefault": true
    },
    {
      "id": "claude",
      "name": "Claude Code",
      "command": "npx",
      "args": ["@zed-industries/claude-code-acp"],
      "enabled": true,
      "authRequired": true,
      "authType": "oauth"
    },
    {
      "id": "gemini",
      "name": "Gemini CLI",
      "command": "gemini",
      "args": ["--experimental-acp"],
      "enabled": true,
      "authRequired": true,
      "authType": "oauth"
    }
  ]
}
```

### User Preferences (Frontend)

```json
// Stored in local storage / settings
{
  "defaultAgentId": "opencode",
  "agentPreferences": {
    "claude": {
      "model": "claude-sonnet-4-20250514"
    },
    "gemini": {
      "model": "gemini-2.0-flash"
    }
  }
}
```

## Security Considerations

1. **Token Storage**: All auth tokens encrypted at rest using AES-256-GCM
2. **Token Transmission**: Tokens passed to container via environment variables (not in request body)
3. **Container Isolation**: Each project has its own container with isolated filesystem
4. **Permission System**: ACP permission requests require explicit user approval
5. **HTTPS Only**: All communication over HTTPS in production

## Scalability Considerations

1. **Agent Subprocess Management**: One subprocess per agent per container
2. **Session Limits**: Configurable maximum concurrent sessions per agent
3. **Memory Management**: Agents spawned on-demand, terminated when idle
4. **Event Streaming**: SSE connections efficiently proxied through Management API

## Next Steps

1. Implement [Phase 1: ACP Gateway](./phase-1-acp-gateway/)
2. Add [Phase 2: Management API routes](./phase-2-management-api/)
3. Build [Phase 3: Frontend components](./phase-3-frontend/)
4. Complete [Phase 4: Migration](./phase-4-migration/)
