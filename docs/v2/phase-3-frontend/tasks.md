# Phase 3: Frontend Tasks

## Status: 🔲 Not Started

---

## 1. API Client Updates

### 1.1 ACP API Functions (`src/lib/api/acp.ts`)
- [ ] `listAgents(projectId)` - Get available agents
- [ ] `getAgentStatus(projectId, agentId)` - Get agent status
- [ ] `spawnAgent(projectId, agentId)` - Spawn agent
- [ ] `stopAgent(projectId, agentId)` - Stop agent
- [ ] `startAuth(projectId, agentId)` - Start OAuth flow
- [ ] `getAuthStatus(projectId, agentId)` - Check auth status
- [ ] `createSession(projectId, agentId)` - Create ACP session
- [ ] `sendPrompt(projectId, sessionId, text)` - Send prompt
- [ ] `cancelSession(projectId, sessionId)` - Cancel operation
- [ ] `respondToPermission(projectId, permissionId, response)` - Permission response

### 1.2 Type Definitions
- [ ] Define `Agent` interface
- [ ] Define `AgentStatus` type
- [ ] Define `AcpSession` interface
- [ ] Define `SessionUpdate` interface
- [ ] Define `PermissionRequest` interface

---

## 2. State Management

### 2.1 Agents Store (`src/lib/stores/agents.svelte.ts`)
- [ ] Create store with Svelte 5 runes
- [ ] State: agents list, selected agent, loading, error
- [ ] `fetchAgents(projectId)` - Load agents for project
- [ ] `selectAgent(agentId)` - Set current agent
- [ ] `getAuthStatus(agentId)` - Check if authenticated
- [ ] `authenticate(agentId)` - Trigger auth flow

### 2.2 ACP Sessions Store (extend existing chat store)
- [ ] Track ACP session IDs
- [ ] Handle session creation/destruction
- [ ] Map sessions to agents

---

## 3. Components

### 3.1 Agent Selector (`src/lib/components/agent-selector.svelte`)
- [ ] Display available agents in dropdown/grid
- [ ] Show agent icons and names
- [ ] Indicate authentication status
- [ ] Highlight default agent
- [ ] Emit `change` event on selection
- [ ] Show loading state while fetching

### 3.2 Agent Card (`src/lib/components/agent-card.svelte`)
- [ ] Display agent name and icon
- [ ] Show connection status
- [ ] Show auth status (authenticated/needs auth)
- [ ] Action button (authenticate/select)

### 3.3 Auth Modal (`src/lib/components/agent-auth-modal.svelte`)
- [ ] Support device flow (show code + URL)
- [ ] Support OAuth redirect (open browser)
- [ ] Show QR code for mobile
- [ ] Poll for completion
- [ ] Handle success/failure states
- [ ] Close on completion

### 3.4 Permission Modal (`src/lib/components/permission-modal.svelte`)
- [ ] Display permission request details
- [ ] Show tool name and description
- [ ] Allow Once / Always / Deny buttons
- [ ] Auto-dismiss on response

---

## 4. Chat Integration

### 4.1 ACP Chat Adapter (`src/lib/chat/acp-adapter.ts`)
- [ ] Implement `ChatAdapter` interface
- [ ] `createSession()` - Create ACP session
- [ ] `sendMessage(text)` - Send prompt via ACP
- [ ] `cancel()` - Cancel current operation
- [ ] Subscribe to SSE events
- [ ] Handle session updates
- [ ] Handle permission requests
- [ ] Emit callbacks for UI updates

### 4.2 Adapter Factory
- [ ] Create factory to select adapter based on agent
- [ ] Default to existing OpenCode adapter for `opencode`
- [ ] Use ACP adapter for other agents
- [ ] Handle adapter switching

### 4.3 Chat Runtime Integration
- [ ] Update `RuntimeProvider` to support ACP adapter
- [ ] Pass agent ID when creating adapter
- [ ] Handle agent switching mid-chat

---

## 5. Tauri Commands

### 5.1 Create ACP Commands (`src-tauri/src/commands/acp.rs`)
- [ ] `acp_list_agents(project_id)` - List agents
- [ ] `acp_get_agent_status(project_id, agent_id)` - Status
- [ ] `acp_spawn_agent(project_id, agent_id)` - Spawn
- [ ] `acp_stop_agent(project_id, agent_id)` - Stop
- [ ] `acp_start_auth(project_id, agent_id)` - Start auth
- [ ] `acp_get_auth_status(project_id, agent_id)` - Auth status
- [ ] `acp_create_session(project_id, agent_id)` - Create session
- [ ] `acp_send_prompt(project_id, session_id, text)` - Send prompt
- [ ] `acp_cancel_session(project_id, session_id)` - Cancel
- [ ] `acp_respond_permission(project_id, permission_id, response)` - Permission

### 5.2 SSE Subscription
- [ ] `acp_subscribe_events(project_id, session_id?)` - Start SSE
- [ ] Parse SSE events
- [ ] Emit Tauri events to frontend
- [ ] Handle reconnection

### 5.3 Register Commands
- [ ] Add commands to `lib.rs`
- [ ] Update capabilities in `default.json`

---

## 6. UI Updates

### 6.1 Project Creation (`src/routes/projects/new/+page.svelte`)
- [ ] Add Agent Selector below LLM provider
- [ ] Pre-select default agent (OpenCode)
- [ ] Pass `defaultAgentId` to create API

### 6.2 Project Settings (`src/routes/projects/[id]/settings/+page.svelte`)
- [ ] Add "AI Agent" section
- [ ] Show Agent Selector
- [ ] Show "Authenticate" button if needed
- [ ] Save agent preference on change

### 6.3 Chat Header (`src/routes/projects/[id]/chat/+page.svelte`)
- [ ] Add Agent Selector in header
- [ ] Show current agent icon
- [ ] Allow switching agents
- [ ] Confirm when switching mid-session

### 6.4 Session List
- [ ] Show agent icon per session
- [ ] Group sessions by agent (optional)

---

## 7. Permission Handling

### 7.1 Permission Flow
- [ ] Listen for permission events
- [ ] Show permission modal
- [ ] Send response to API
- [ ] Update UI on completion

### 7.2 Permission Preferences
- [ ] Store "always allow" preferences
- [ ] Apply preferences automatically
- [ ] Show in settings

---

## 8. Error Handling

### 8.1 Auth Errors
- [ ] Handle auth timeout
- [ ] Handle auth denial
- [ ] Prompt re-auth on token expiry

### 8.2 Session Errors
- [ ] Handle session creation failure
- [ ] Handle agent crash
- [ ] Offer retry/reconnect

---

## 9. Testing

### 9.1 Component Tests
- [ ] Test Agent Selector rendering
- [ ] Test Auth Modal flow
- [ ] Test Permission Modal

### 9.2 Integration Tests
- [ ] Test full auth flow
- [ ] Test session creation with different agents
- [ ] Test prompt/response flow

### 9.3 Manual Testing
- [ ] Test with OpenCode agent
- [ ] Test with Claude Code (auth flow)
- [ ] Test agent switching
- [ ] Test permission handling

---

## 10. Documentation

- [ ] Update README with agent selection
- [ ] Document auth flow for each agent
- [ ] Add troubleshooting guide

---

## Notes

- Start with OpenCode (no auth) for initial testing
- Add Claude Code after auth flow is working
- Keep existing OpenCode adapter as fallback
- Consider agent-specific UI customizations later
