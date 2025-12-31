# Phase 2: Management API Tasks

## Status: 🔲 Not Started

---

## 1. Database Schema Updates

### 1.1 Create Migration
- [ ] Add migration for agent_auth_tokens table
- [ ] Add migration for agent_sessions table
- [ ] Add migration for agent_session_messages table
- [ ] Add default_agent_id column to projects table
- [ ] Run migrations

### 1.2 Model Files
- [ ] Create `src/models/agent-auth.ts`
- [ ] Create `src/models/agent-session.ts`

---

## 2. Agent Auth Token Model (`src/models/agent-auth.ts`)

### 2.1 CRUD Operations
- [ ] `getAgentAuthToken(userId, agentId)` - Get stored token
- [ ] `saveAgentAuthToken(input)` - Save/update token (encrypted)
- [ ] `deleteAgentAuthToken(userId, agentId)` - Remove token
- [ ] `isAgentAuthenticated(userId, agentId)` - Check if authenticated

### 2.2 Token Helpers
- [ ] `isTokenExpired(token)` - Check if token needs refresh
- [ ] `getEnvVarsForAgent(agentId, token)` - Get env vars for injection

---

## 3. Agent Session Model (`src/models/agent-session.ts`)

### 3.1 Session CRUD
- [ ] `createAgentSession(input)` - Create session record
- [ ] `getAgentSession(id)` - Get session by ID
- [ ] `getProjectSessions(projectId)` - List project sessions
- [ ] `updateAgentSession(id, updates)` - Update session
- [ ] `deleteAgentSession(id)` - Delete session

### 3.2 Message Operations
- [ ] `addSessionMessage(sessionId, message)` - Add message to history
- [ ] `getSessionMessages(sessionId)` - Get message history
- [ ] `clearSessionMessages(sessionId)` - Clear history

---

## 4. Gateway Proxy Service (`src/services/acp-gateway.ts`)

### 4.1 URL Resolution
- [ ] `getGatewayUrl(projectId)` - Get ACP Gateway URL for project
- [ ] Handle port mapping (4096 → 4097)

### 4.2 Proxy Methods
- [ ] `proxyRequest(projectId, path, options)` - Generic proxy
- [ ] `listAgents(projectId)` - GET /agents
- [ ] `spawnAgent(projectId, agentId, env)` - POST /agents/:id/spawn
- [ ] `stopAgent(projectId, agentId)` - POST /agents/:id/stop
- [ ] `getAgentStatus(projectId, agentId)` - GET /agents/:id/status

### 4.3 Session Methods
- [ ] `createSession(projectId, agentId, workingDir, env)` - Create ACP session
- [ ] `sendPrompt(projectId, sessionId, text)` - Send prompt
- [ ] `cancelSession(projectId, sessionId)` - Cancel operation

### 4.4 Event Streaming
- [ ] `createEventStream(projectId, sessionId?)` - SSE proxy

---

## 5. Agent OAuth Service (`src/services/oauth/agent-oauth.ts`)

### 5.1 OAuth Flow
- [ ] `initAgentAuth(projectId, agentId)` - Start auth flow
- [ ] `getAgentAuthStatus(projectId, agentId)` - Check status
- [ ] `handleAuthCallback(agentId, token)` - Handle callback

### 5.2 Agent-Specific Handlers
- [ ] Claude Code OAuth handler
- [ ] Gemini CLI OAuth handler
- [ ] Generic OAuth handler for others

---

## 6. ACP Routes (`src/routes/acp.ts`)

### 6.1 Agent Routes
- [ ] `GET /:projectId/acp/agents` - List agents with status
- [ ] `POST /:projectId/acp/agents/:agentId/spawn` - Spawn agent
- [ ] `POST /:projectId/acp/agents/:agentId/stop` - Stop agent
- [ ] `GET /:projectId/acp/agents/:agentId/status` - Agent status

### 6.2 Auth Routes
- [ ] `POST /:projectId/acp/agents/:agentId/auth/start` - Start OAuth
- [ ] `GET /:projectId/acp/agents/:agentId/auth/status` - Auth status
- [ ] `POST /:projectId/acp/agents/:agentId/auth/callback` - OAuth callback

### 6.3 Session Routes
- [ ] `POST /:projectId/acp/session` - Create session
  - Validate agent auth
  - Inject tokens
  - Persist to database
- [ ] `GET /:projectId/acp/session` - List sessions
- [ ] `GET /:projectId/acp/session/:sessionId` - Get session
- [ ] `DELETE /:projectId/acp/session/:sessionId` - End session
- [ ] `POST /:projectId/acp/session/:sessionId/prompt` - Send prompt
  - Store message in database
  - Proxy to gateway
- [ ] `POST /:projectId/acp/session/:sessionId/cancel` - Cancel

### 6.4 Event Routes
- [ ] `GET /:projectId/acp/events` - Global SSE stream
- [ ] `GET /:projectId/acp/events/:sessionId` - Session SSE stream
  - Proxy SSE from container
  - Add session/message persistence hooks

### 6.5 Permission Routes
- [ ] `POST /:projectId/acp/permission/:permissionId` - Respond

---

## 7. Register Routes

### 7.1 Update Main App
- [ ] Import ACP routes in `src/index.ts`
- [ ] Register routes under `/api/projects`
- [ ] Add any required middleware

---

## 8. Project Settings

### 8.1 Default Agent
- [ ] Add `defaultAgentId` to project creation
- [ ] Add endpoint to update project's default agent
- [ ] Include in project GET response

---

## 9. Testing

### 9.1 Unit Tests
- [ ] Test agent auth token encryption/decryption
- [ ] Test session persistence
- [ ] Test message storage

### 9.2 Integration Tests
- [ ] Test full session creation flow
- [ ] Test prompt with token injection
- [ ] Test SSE proxying
- [ ] Test OAuth flow (mock)

### 9.3 Manual Testing
- [ ] Test with running container
- [ ] Test agent spawning
- [ ] Test session flow end-to-end
- [ ] Test SSE events in browser

---

## 10. Documentation

- [ ] Document new API endpoints
- [ ] Document environment variables
- [ ] Update API reference

---

## Notes

- Reuse existing OAuth infrastructure from GitHub Copilot
- Keep backward compatibility with existing OpenCode routes
- SSE proxying may need buffering for reliability
