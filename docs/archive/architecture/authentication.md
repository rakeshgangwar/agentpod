# Agent Authentication

## Overview

Different ACP agents require different authentication methods. This document describes how CodeOpen handles authentication for each agent type.

## Authentication Types

| Type | Description | Examples |
|------|-------------|----------|
| **None** | No authentication required | OpenCode (uses container env) |
| **OAuth** | Browser-based OAuth flow | Claude Code, Gemini CLI |
| **Device Flow** | Device code + polling | GitHub Copilot style |
| **API Key** | Simple API key input | Some local agents |

## Supported Agents

| Agent | Auth Type | Provider | Token Location |
|-------|-----------|----------|----------------|
| OpenCode | None | N/A | Container env vars |
| Claude Code | OAuth | Anthropic Console | `~/.claude/.credentials.json` |
| Gemini CLI | OAuth | Google | `~/.config/gemini/` |
| Qwen Code | OAuth | Alibaba Cloud | TBD |
| Codex | None | N/A | Uses OpenAI env var |

## Authentication Flow

### Agent Without Auth (OpenCode, Codex)

```
1. User selects agent
2. Agent spawns with container environment
3. Uses existing ANTHROPIC_API_KEY, OPENAI_API_KEY, etc.
4. No additional auth needed
```

### OAuth Flow (Claude Code, Gemini)

```
┌─────────────┐     ┌─────────────────┐     ┌─────────────┐
│   Frontend  │     │  Management API │     │  Container  │
└──────┬──────┘     └────────┬────────┘     └──────┬──────┘
       │                     │                     │
       │ 1. Select "Claude Code"                   │
       ├────────────────────>│                     │
       │                     │                     │
       │                     │ 2. Spawn agent      │
       │                     ├────────────────────>│
       │                     │                     │
       │                     │ 3. Call initialize  │
       │                     ├────────────────────>│
       │                     │                     │
       │                     │<──────────────────────
       │                     │   auth_methods      │
       │                     │                     │
       │                     │ 4. Call authenticate│
       │                     ├────────────────────>│
       │                     │                     │
       │                     │<──────────────────────
       │                     │   OAuth URL         │
       │                     │                     │
       │<──────────────────────                    │
       │   auth_required + URL                     │
       │                     │                     │
       │ 5. Open browser with OAuth URL            │
       │───────────────────────────────────────────┼──>  Browser
       │                     │                     │
       │      ... User completes OAuth in browser ...
       │                     │                     │
       │                     │<──────────────────────
       │                     │   auth_complete     │
       │                     │                     │
       │                     │ 6. Extract token    │
       │                     │    from agent       │
       │                     │                     │
       │                     │ 7. Store encrypted  │
       │                     │    in database      │
       │                     │                     │
       │<──────────────────────                    │
       │   auth_complete                           │
       │                     │                     │
       │ 8. Show "Connected"                       │
       └─────────────────────────────────────────────
```

### Device Flow (GitHub Copilot Style)

```
┌─────────────┐     ┌─────────────────┐
│   Frontend  │     │  Management API │
└──────┬──────┘     └────────┬────────┘
       │                     │
       │ 1. Click "Authenticate"
       ├────────────────────>│
       │                     │
       │                     │ 2. Request device code
       │                     │    from provider
       │                     │
       │<──────────────────────
       │   user_code + verification_uri
       │                     │
       │ 3. Display code and URL
       │    to user          │
       │                     │
       │    ... User visits URL ...
       │    ... User enters code ...
       │                     │
       │ 4. Poll for token   │
       ├────────────────────>│
       │                     │
       │<──────────────────────
       │   status: pending   │
       │                     │
       │ (repeat polling)    │
       │                     │
       │<──────────────────────
       │   status: completed │
       │   token stored      │
       │                     │
       │ 5. Show "Connected" │
       └─────────────────────────
```

## Token Storage

### Database Schema

```sql
CREATE TABLE agent_auth_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,           -- User who authenticated
  agent_id TEXT NOT NULL,          -- 'claude', 'gemini', etc.
  access_token TEXT NOT NULL,      -- Encrypted with AES-256-GCM
  refresh_token TEXT,              -- Encrypted (optional)
  expires_at INTEGER,              -- Unix timestamp
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch()),
  UNIQUE(user_id, agent_id)
);
```

### Encryption

Tokens are encrypted using the same method as provider credentials:

```typescript
import { encrypt, decrypt } from '../utils/encryption.ts';

async function saveAgentAuthToken(input: SaveTokenInput): Promise<void> {
  const accessTokenEncrypted = await encrypt(input.accessToken);
  const refreshTokenEncrypted = input.refreshToken 
    ? await encrypt(input.refreshToken) 
    : null;
  
  // Insert/update in database
}

async function getAgentAuthToken(userId: string, agentId: string): Promise<string | null> {
  const row = db.query('SELECT access_token FROM agent_auth_tokens WHERE ...');
  if (!row) return null;
  return await decrypt(row.access_token);
}
```

## Token Injection

When creating an ACP session, tokens are injected as environment variables:

```typescript
// Management API - when creating session
async function createAcpSession(projectId: string, agentId: string): Promise<Session> {
  // Get stored token
  const token = await getAgentAuthToken(userId, agentId);
  
  // Build environment variables based on agent
  const env = getEnvVarsForAgent(agentId, token);
  
  // Create session with env vars
  const response = await acpGateway.createSession(projectId, {
    agentId,
    env,
  });
  
  return response;
}

function getEnvVarsForAgent(agentId: string, token: string): Record<string, string> {
  switch (agentId) {
    case 'claude':
      return { ANTHROPIC_API_KEY: token };
    case 'gemini':
      return { GOOGLE_API_KEY: token };
    case 'qwen':
      return { DASHSCOPE_API_KEY: token };
    default:
      return {};
  }
}
```

## Token Refresh

### Strategy: Agent-Managed

Most ACP agents handle token refresh internally:

1. Agent detects token expiry
2. Agent uses refresh token (if available)
3. Agent stores new token in its config
4. CodeOpen may need to re-extract token periodically

### Handling Auth Failures

If agent reports auth failure mid-session:

```typescript
// In SSE event handler
function handleSessionUpdate(update: SessionUpdate): void {
  if (update.type === 'error' && update.error?.code === 'auth_failed') {
    // Clear stored token
    await deleteAgentAuthToken(userId, agentId);
    
    // Notify user
    emit('auth_required', { agentId, reason: 'Token expired' });
  }
}
```

## Frontend UI

### Auth Modal Component

```svelte
<script>
  export let agent;
  export let authInfo;  // { type, userCode?, verificationUri?, oauthUrl? }
  
  let status = 'pending';
  
  async function pollStatus() {
    const result = await api.getAuthStatus(projectId, agent.id);
    status = result.status;
    if (status === 'pending') {
      setTimeout(pollStatus, 2000);
    }
  }
  
  onMount(() => {
    if (authInfo.type === 'device_flow') {
      pollStatus();
    }
  });
</script>

{#if authInfo.type === 'device_flow'}
  <div class="device-flow">
    <p>Visit: <a href={authInfo.verificationUri} target="_blank">
      {authInfo.verificationUri}
    </a></p>
    <p>Enter code: <code>{authInfo.userCode}</code></p>
    <p>Status: {status}</p>
  </div>
{:else if authInfo.type === 'oauth'}
  <div class="oauth">
    <p>Opening browser for authentication...</p>
    <Button on:click={() => open(authInfo.oauthUrl)}>
      Open in Browser
    </Button>
  </div>
{/if}
```

### Auth Status in Agent Selector

```svelte
<script>
  export let agents;
  export let value;
</script>

<div class="agent-grid">
  {#each agents as agent}
    <button
      class:selected={value === agent.id}
      class:needs-auth={agent.authRequired && !agent.isAuthenticated}
      on:click={() => handleSelect(agent)}
    >
      <img src={agent.icon} alt={agent.name} />
      <span>{agent.name}</span>
      {#if agent.authRequired && !agent.isAuthenticated}
        <Badge variant="warning">Needs Auth</Badge>
      {:else if agent.isAuthenticated}
        <Badge variant="success">Connected</Badge>
      {/if}
    </button>
  {/each}
</div>
```

## Security Considerations

1. **Token Encryption**: All tokens encrypted at rest with AES-256-GCM
2. **Token Transmission**: Tokens passed via env vars, not in request bodies
3. **Session Isolation**: Tokens scoped to user, not shared across users
4. **Token Cleanup**: Clear tokens on logout or manual disconnect
5. **HTTPS Only**: All OAuth callbacks over HTTPS
