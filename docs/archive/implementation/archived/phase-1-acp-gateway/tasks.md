# Phase 1: ACP Gateway Tasks

## Status: 🔲 Not Started

---

## 1. Project Setup

### 1.1 Initialize Project
- [ ] Create `docker/opencode/acp-gateway/` directory
- [ ] Initialize npm project: `npm init -y`
- [ ] Install dependencies:
  ```bash
  npm install hono @hono/node-server
  npm install -D typescript @types/node
  ```
- [ ] Configure TypeScript (`tsconfig.json`)
- [ ] Set up build scripts in `package.json`

### 1.2 Project Structure
- [ ] Create directory structure:
  ```
  src/
  ├── index.ts
  ├── acp-client.ts
  ├── agent-registry.ts
  ├── agent-manager.ts
  ├── session-manager.ts
  ├── file-handler.ts
  ├── event-emitter.ts
  ├── auth-handler.ts
  └── types.ts
  ```

---

## 2. Core Types (`types.ts`)

### 2.1 Agent Types
- [ ] Define `AgentConfig` interface
- [ ] Define `AgentStatus` type
- [ ] Define `AgentConnection` interface

### 2.2 ACP Types
- [ ] Define `AcpRequest` interface
- [ ] Define `AcpResponse` interface
- [ ] Define `AcpNotification` interface

### 2.3 Session Types
- [ ] Define `Session` interface
- [ ] Define `SessionUpdate` interface
- [ ] Define `PermissionRequest` interface

---

## 3. Agent Registry (`agent-registry.ts`)

### 3.1 Default Agents
- [ ] Define `DEFAULT_AGENTS` configuration array
- [ ] Include: OpenCode, Claude Code, Gemini CLI, Qwen Code, Codex

### 3.2 Registry Functions
- [ ] `getAgents()` - List all agent configurations
- [ ] `getAgent(id)` - Get specific agent config
- [ ] `loadCustomAgents()` - Load from workspace config file
- [ ] `mergeAgentConfigs()` - Merge default with custom

---

## 4. ACP Client (`acp-client.ts`)

### 4.1 Connection Management
- [ ] Implement subprocess spawning with `child_process.spawn()`
- [ ] Set up stdin/stdout communication
- [ ] Handle stderr for logging/errors
- [ ] Implement reconnection logic

### 4.2 JSON-RPC Implementation
- [ ] Implement `sendRequest()` with promise tracking
- [ ] Implement `sendNotification()` for one-way messages
- [ ] Parse incoming JSON-RPC messages
- [ ] Handle message framing (newline-delimited JSON)

### 4.3 ACP Protocol Methods
- [ ] Implement `initialize()` method
- [ ] Implement `authenticate()` method
- [ ] Implement `session/new` method
- [ ] Implement `session/prompt` method
- [ ] Implement `session/cancel` method
- [ ] Implement `shutdown` method

### 4.4 Client Capability Handlers
- [ ] Handle `fs/read_text_file` requests
- [ ] Handle `fs/write_text_file` requests
- [ ] Handle `fs/list_directory` requests
- [ ] Handle `session/request_permission` requests
- [ ] Handle `terminal/run` requests (optional)

### 4.5 Event Handling
- [ ] Process `session/update` notifications
- [ ] Process `session/end_turn` notifications
- [ ] Forward events to EventEmitter

---

## 5. Agent Manager (`agent-manager.ts`)

### 5.1 Lifecycle Management
- [ ] `spawnAgent(agentId, env)` - Start agent subprocess
- [ ] `stopAgent(agentId)` - Gracefully stop agent
- [ ] `restartAgent(agentId)` - Restart agent
- [ ] `getAgentStatus(agentId)` - Get agent connection status

### 5.2 Connection Tracking
- [ ] Track active agent connections
- [ ] Monitor subprocess health
- [ ] Handle unexpected exits
- [ ] Implement cleanup on shutdown

### 5.3 Environment Injection
- [ ] Accept environment variables per agent
- [ ] Inject auth tokens from Management API
- [ ] Merge with container environment

---

## 6. File Handler (`file-handler.ts`)

### 6.1 Read Operations
- [ ] `readTextFile(path)` - Read file contents
- [ ] `listDirectory(path)` - List directory entries
- [ ] Handle file encoding (UTF-8)

### 6.2 Write Operations
- [ ] `writeTextFile(path, content)` - Write file contents
- [ ] Create parent directories if needed
- [ ] Handle file permissions

### 6.3 Security
- [ ] Validate paths are within working directory
- [ ] Prevent path traversal attacks
- [ ] Log all file operations

---

## 7. Session Manager (`session-manager.ts`)

### 7.1 Session CRUD
- [ ] `createSession(agentId, acpSessionId)` - Create session record
- [ ] `getSession(id)` - Get session by ID
- [ ] `updateSession(id, updates)` - Update session state
- [ ] `deleteSession(id)` - Remove session

### 7.2 Session Tracking
- [ ] Track session-to-agent mapping
- [ ] Track last activity time
- [ ] Clean up stale sessions

---

## 8. Event Emitter (`event-emitter.ts`)

### 8.1 SSE Management
- [ ] Track connected SSE clients
- [ ] Support global event streams
- [ ] Support per-session event streams

### 8.2 Event Broadcasting
- [ ] `emit(event, data, sessionId)` - Emit to specific session
- [ ] `emitToAll(event, data)` - Emit to all clients
- [ ] Handle client disconnection cleanup

---

## 9. Auth Handler (`auth-handler.ts`)

### 9.1 OAuth Support
- [ ] `initializeAuth(agentId)` - Start auth flow
- [ ] `getAuthStatus(agentId)` - Check auth status
- [ ] Handle OAuth URL from agent
- [ ] Emit auth events (auth_required, auth_complete)

---

## 10. HTTP Server (`index.ts`)

### 10.1 Server Setup
- [ ] Create Hono app
- [ ] Configure CORS (for container-local access)
- [ ] Add request logging middleware

### 10.2 Health Routes
- [ ] `GET /health` - Health check
- [ ] `GET /info` - Gateway info

### 10.3 Agent Routes
- [ ] `GET /agents` - List agents
- [ ] `POST /agents/:id/spawn` - Spawn agent
- [ ] `POST /agents/:id/stop` - Stop agent
- [ ] `GET /agents/:id/status` - Agent status

### 10.4 Auth Routes
- [ ] `POST /agents/:id/auth/init` - Init auth
- [ ] `GET /agents/:id/auth/status` - Auth status

### 10.5 Session Routes
- [ ] `POST /session` - Create session
- [ ] `GET /session/:id` - Get session
- [ ] `DELETE /session/:id` - End session
- [ ] `POST /session/:id/prompt` - Send prompt
- [ ] `POST /session/:id/cancel` - Cancel operation

### 10.6 Event Routes
- [ ] `GET /events` - Global SSE stream
- [ ] `GET /events/:sessionId` - Session SSE stream

### 10.7 Permission Routes
- [ ] `POST /permission/:id` - Respond to permission

---

## 11. Container Integration

### 11.1 Dockerfile Updates
- [ ] Add ACP Gateway build step
- [ ] Copy built files to `/opt/acp-gateway`
- [ ] Expose port 4097
- [ ] Update health check

### 11.2 Entrypoint Updates
- [ ] Start ACP Gateway alongside OpenCode
- [ ] Handle process supervision
- [ ] Clean shutdown handling

---

## 12. Testing

### 12.1 Unit Tests
- [ ] Test JSON-RPC message parsing
- [ ] Test file handler path validation
- [ ] Test session manager operations
- [ ] Test agent registry loading

### 12.2 Integration Tests
- [ ] Test OpenCode ACP connection
- [ ] Test session creation flow
- [ ] Test prompt/response flow
- [ ] Test SSE event streaming

### 12.3 Manual Testing
- [ ] Test with local container
- [ ] Test with real Claude Code (if auth available)
- [ ] Test permission flow
- [ ] Test error handling

---

## 13. Documentation

- [ ] Add inline code comments
- [ ] Document environment variables
- [ ] Document error codes
- [ ] Update container README

---

## Notes

- Start with OpenCode ACP support (no auth required)
- Add Claude Code support after basic flow works
- Keep logging verbose for debugging
- Consider adding request ID tracking for tracing
