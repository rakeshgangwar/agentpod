# Phase 2: Management API Updates

## Overview

Add ACP proxy routes to the Management API to enable frontend communication with the ACP Gateway running in containers.

## Objectives

1. Add ACP routes that proxy to container's ACP Gateway
2. Implement agent authentication token storage
3. Add session persistence to database
4. Handle SSE event proxying

## New Routes

### Agent Routes

```
GET  /api/projects/:projectId/acp/agents
POST /api/projects/:projectId/acp/agents/:agentId/spawn
POST /api/projects/:projectId/acp/agents/:agentId/stop
GET  /api/projects/:projectId/acp/agents/:agentId/status
```

### Authentication Routes

```
POST /api/projects/:projectId/acp/agents/:agentId/auth/start
GET  /api/projects/:projectId/acp/agents/:agentId/auth/status
POST /api/projects/:projectId/acp/agents/:agentId/auth/callback
```

### Session Routes

```
POST /api/projects/:projectId/acp/session
GET  /api/projects/:projectId/acp/session/:sessionId
DELETE /api/projects/:projectId/acp/session/:sessionId
POST /api/projects/:projectId/acp/session/:sessionId/prompt
POST /api/projects/:projectId/acp/session/:sessionId/cancel
```

### Event Routes

```
GET /api/projects/:projectId/acp/events
GET /api/projects/:projectId/acp/events/:sessionId
```

### Permission Routes

```
POST /api/projects/:projectId/acp/permission/:permissionId
```

## New Files

| File | Purpose |
|------|---------|
| `src/routes/acp.ts` | ACP API routes |
| `src/services/acp-gateway.ts` | Gateway proxy service |
| `src/services/oauth/agent-oauth.ts` | Agent OAuth service |
| `src/models/agent-session.ts` | Session persistence model |
| `src/models/agent-auth.ts` | Auth token model |

## Database Schema

```sql
-- Agent authentication tokens
CREATE TABLE agent_auth_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at INTEGER,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch()),
  UNIQUE(user_id, agent_id)
);

-- ACP sessions
CREATE TABLE agent_sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  agent_id TEXT NOT NULL,
  acp_session_id TEXT,
  title TEXT,
  status TEXT NOT NULL,
  working_directory TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

-- Session messages
CREATE TABLE agent_session_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES agent_sessions(id),
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  tool_calls TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);
```

## Implementation Details

### Gateway Proxy Service

```typescript
// src/services/acp-gateway.ts
export const acpGateway = {
  async getGatewayUrl(projectId: string): Promise<string> {
    const project = getProjectById(projectId);
    // Use port 4097 for ACP Gateway
    return `${project.fqdnUrl.replace(':4096', ':4097')}`;
  },

  async proxyRequest(projectId: string, path: string, options: RequestInit) {
    const baseUrl = await this.getGatewayUrl(projectId);
    const response = await fetch(`${baseUrl}${path}`, options);
    return response;
  },

  async createEventStream(projectId: string, sessionId?: string) {
    const baseUrl = await this.getGatewayUrl(projectId);
    const path = sessionId ? `/events/${sessionId}` : '/events';
    return fetch(`${baseUrl}${path}`);
  },
};
```

### Session Persistence

```typescript
// src/models/agent-session.ts
export function createAgentSession(input: CreateSessionInput): AgentSession {
  const id = crypto.randomUUID();
  db.query(`
    INSERT INTO agent_sessions (id, project_id, agent_id, status, working_directory)
    VALUES ($id, $projectId, $agentId, $status, $workingDirectory)
  `).run({
    $id: id,
    $projectId: input.projectId,
    $agentId: input.agentId,
    $status: 'active',
    $workingDirectory: input.workingDirectory,
  });
  return getAgentSession(id)!;
}

export function updateAgentSession(id: string, acpSessionId: string): void {
  db.query(`
    UPDATE agent_sessions 
    SET acp_session_id = $acpSessionId, updated_at = unixepoch()
    WHERE id = $id
  `).run({ $id: id, $acpSessionId: acpSessionId });
}
```

### Token Injection

When creating a session, inject auth tokens:

```typescript
// In ACP routes
app.post('/:projectId/acp/session', async (c) => {
  const { agentId, workingDirectory } = await c.req.json();
  
  // Get auth token if agent requires it
  const agent = await acpGateway.getAgent(projectId, agentId);
  let env: Record<string, string> = {};
  
  if (agent.authRequired) {
    const token = await getAgentAuthToken(userId, agentId);
    if (!token) {
      return c.json({ error: 'Authentication required' }, 401);
    }
    env = getEnvVarsForAgent(agentId, token);
  }
  
  // Create session with token injection
  const response = await acpGateway.proxyRequest(projectId, '/session', {
    method: 'POST',
    body: JSON.stringify({ agentId, workingDirectory, env }),
  });
  
  // Persist session
  const session = createAgentSession({ projectId, agentId, workingDirectory });
  
  return c.json(session);
});
```

## Tasks

See [tasks.md](./tasks.md) for detailed task breakdown.
