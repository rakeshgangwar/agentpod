# Phase 1: ACP Gateway Service

## Overview

The ACP Gateway is a lightweight HTTP service that runs inside project containers. It manages ACP agent subprocesses and exposes them via HTTP/SSE to the Management API.

## Objectives

1. Create a TypeScript/Node.js service that implements an ACP Client
2. Manage multiple agent subprocesses (OpenCode, Claude Code, Gemini, etc.)
3. Expose HTTP/SSE API for Management API to consume
4. Handle file system operations for agents
5. Proxy permission requests to frontend

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Project Container                             │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ ACP Gateway Service - Port 4097                                │  │
│  │                                                                │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐   │  │
│  │  │ HTTP Server │  │ Agent       │  │ Session             │   │  │
│  │  │ (Hono)      │  │ Manager     │  │ Store               │   │  │
│  │  └─────────────┘  └─────────────┘  └─────────────────────┘   │  │
│  │         │                │                    │               │  │
│  │         └────────────────┼────────────────────┘               │  │
│  │                          │                                     │  │
│  │  ┌─────────────────────────────────────────────────────────┐  │  │
│  │  │              ACP Client (per agent)                      │  │  │
│  │  │  - JSON-RPC over stdio                                   │  │  │
│  │  │  - File handler (fs/read, fs/write)                      │  │  │
│  │  │  - Permission proxy                                      │  │  │
│  │  └─────────────────────────────────────────────────────────┘  │  │
│  │                          │                                     │  │
│  │          ┌───────────────┼───────────────┐                    │  │
│  │          ▼               ▼               ▼                    │  │
│  │   [opencode acp]  [claude-code-acp]  [gemini --acp]          │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

## File Structure

```
docker/opencode/acp-gateway/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # Hono HTTP server entry point
│   ├── acp-client.ts         # ACP Client implementation
│   ├── agent-registry.ts     # Agent configurations
│   ├── agent-manager.ts      # Agent subprocess lifecycle
│   ├── session-manager.ts    # Session tracking
│   ├── file-handler.ts       # fs/read, fs/write operations
│   ├── event-emitter.ts      # SSE event broadcasting
│   ├── auth-handler.ts       # OAuth flow handling
│   └── types.ts              # TypeScript types
```

## Dependencies

```json
{
  "dependencies": {
    "hono": "^4.0.0",
    "@hono/node-server": "^1.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/node": "^20.0.0"
  }
}
```

## API Endpoints

### Health & Info

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/info` | GET | Gateway info and version |

### Agents

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/agents` | GET | List available agents with status |
| `/agents/:id/spawn` | POST | Start agent subprocess |
| `/agents/:id/stop` | POST | Stop agent subprocess |
| `/agents/:id/status` | GET | Get agent connection status |

### Authentication

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/agents/:id/auth/init` | POST | Initialize auth flow |
| `/agents/:id/auth/status` | GET | Check auth status |

### Sessions

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/session` | POST | Create new session |
| `/session/:id` | GET | Get session info |
| `/session/:id` | DELETE | End session |
| `/session/:id/prompt` | POST | Send prompt |
| `/session/:id/cancel` | POST | Cancel current operation |

### Events

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/events` | GET | SSE stream for all events |
| `/events/:sessionId` | GET | SSE stream for specific session |

### Permissions

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/permission/:id` | POST | Respond to permission request |

## Implementation Details

### 1. Agent Registry (`agent-registry.ts`)

Manages agent configurations:

```typescript
interface AgentConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
  enabled: boolean;
  authRequired: boolean;
  authType?: 'oauth' | 'api_key' | 'none';
  isDefault?: boolean;
}

const DEFAULT_AGENTS: AgentConfig[] = [
  {
    id: 'opencode',
    name: 'OpenCode',
    command: 'opencode',
    args: ['acp'],
    enabled: true,
    authRequired: false,
    isDefault: true,
  },
  {
    id: 'claude',
    name: 'Claude Code',
    command: 'npx',
    args: ['@zed-industries/claude-code-acp'],
    enabled: true,
    authRequired: true,
    authType: 'oauth',
  },
  // ... more agents
];
```

### 2. ACP Client (`acp-client.ts`)

Core ACP implementation:

```typescript
class AcpClient {
  private process: ChildProcess | null = null;
  private pendingRequests: Map<number, PendingRequest>;
  private nextRequestId = 0;

  // Event handlers
  onSessionUpdate: (data: SessionUpdate) => void;
  onPermissionRequest: (data: PermissionRequest) => void;

  // Lifecycle
  async connect(config: AgentConfig, env: Record<string, string>): Promise<void>;
  async disconnect(): Promise<void>;

  // ACP Methods (Client → Agent)
  async initialize(): Promise<InitializeResponse>;
  async authenticate(methodId?: string): Promise<AuthResponse>;
  async newSession(cwd: string): Promise<{ sessionId: string }>;
  async prompt(sessionId: string, text: string): Promise<void>;
  async cancel(sessionId: string): Promise<void>;

  // ACP Handlers (Agent → Client)
  private handleFileRead(params: { path: string }): Promise<{ content: string }>;
  private handleFileWrite(params: { path: string; content: string }): Promise<void>;
  private handlePermissionRequest(params: PermissionParams): void;
}
```

### 3. File Handler (`file-handler.ts`)

Implements file operations for agents:

```typescript
class FileHandler {
  private workingDirectory: string;

  constructor(workingDirectory: string) {
    this.workingDirectory = workingDirectory;
  }

  async readTextFile(path: string): Promise<string> {
    const fullPath = this.resolvePath(path);
    return await fs.readFile(fullPath, 'utf-8');
  }

  async writeTextFile(path: string, content: string): Promise<void> {
    const fullPath = this.resolvePath(path);
    await fs.writeFile(fullPath, content, 'utf-8');
  }

  async listDirectory(path: string): Promise<DirectoryEntry[]> {
    const fullPath = this.resolvePath(path);
    const entries = await fs.readdir(fullPath, { withFileTypes: true });
    return entries.map(e => ({
      name: e.name,
      isDirectory: e.isDirectory(),
    }));
  }

  private resolvePath(path: string): string {
    // Security: Ensure path is within working directory
    const resolved = resolve(this.workingDirectory, path);
    if (!resolved.startsWith(this.workingDirectory)) {
      throw new Error('Path traversal not allowed');
    }
    return resolved;
  }
}
```

### 4. Session Manager (`session-manager.ts`)

Tracks active sessions:

```typescript
interface Session {
  id: string;
  agentId: string;
  acpSessionId: string;
  status: 'active' | 'idle' | 'error';
  createdAt: Date;
  lastActivity: Date;
}

class SessionManager {
  private sessions: Map<string, Session> = new Map();

  createSession(agentId: string, acpSessionId: string): Session;
  getSession(id: string): Session | undefined;
  updateSession(id: string, updates: Partial<Session>): void;
  deleteSession(id: string): void;
  getActiveSessions(): Session[];
}
```

### 5. Event Emitter (`event-emitter.ts`)

Manages SSE connections:

```typescript
class EventEmitter {
  private clients: Map<string, Set<Response>> = new Map();

  addClient(sessionId: string | null, response: Response): void;
  removeClient(sessionId: string | null, response: Response): void;
  
  emit(event: string, data: unknown, sessionId?: string): void;
  emitToAll(event: string, data: unknown): void;
}
```

## Container Integration

### Dockerfile Changes

```dockerfile
# Build ACP Gateway
WORKDIR /opt/acp-gateway
COPY acp-gateway/package*.json ./
RUN npm ci --production
COPY acp-gateway/dist ./dist

# ... rest of Dockerfile

ENV ACP_GATEWAY_PORT=4097
EXPOSE 4096 4097
```

### Entrypoint Changes

```bash
#!/bin/bash
# Start OpenCode server
opencode server &

# Start ACP Gateway
node /opt/acp-gateway/dist/index.js &

# Wait for either to exit
wait -n
```

## Testing

### Unit Tests

- [ ] Test agent registry configuration loading
- [ ] Test ACP Client JSON-RPC parsing
- [ ] Test file handler path resolution and security
- [ ] Test session manager CRUD operations

### Integration Tests

- [ ] Test agent spawning and communication
- [ ] Test SSE event streaming
- [ ] Test permission flow end-to-end
- [ ] Test session lifecycle

### Manual Testing

```bash
# Health check
curl http://localhost:4097/health

# List agents
curl http://localhost:4097/agents

# Spawn agent
curl -X POST http://localhost:4097/agents/opencode/spawn

# Create session
curl -X POST http://localhost:4097/session \
  -H "Content-Type: application/json" \
  -d '{"agentId": "opencode", "workingDirectory": "/workspace"}'

# Send prompt
curl -X POST http://localhost:4097/session/sess_123/prompt \
  -H "Content-Type: application/json" \
  -d '{"text": "Create a hello.txt file"}'

# Subscribe to events
curl http://localhost:4097/events
```

## Tasks

See [tasks.md](./tasks.md) for detailed task breakdown.

## Next Steps

After completing Phase 1:
1. Proceed to [Phase 2: Management API](../phase-2-management-api/)
2. Add proxy routes for ACP Gateway
3. Implement token storage and injection
