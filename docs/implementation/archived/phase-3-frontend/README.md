# Phase 3: Frontend Updates

## Overview

Update the CodeOpen desktop/mobile app to support multiple ACP agents with agent selection, authentication, and unified chat experience.

## Objectives

1. Add agent selector UI for project creation and settings
2. Implement agent authentication modals (OAuth/device flow)
3. Create ACP-specific chat adapter
4. Update Tauri commands for ACP communication

## New Components

### Agent Selection

| Component | Purpose |
|-----------|---------|
| `agent-selector.svelte` | Dropdown/grid to select agent |
| `agent-card.svelte` | Display agent info and status |
| `agent-auth-modal.svelte` | OAuth/device flow UI |

### Chat Integration

| Component | Purpose |
|-----------|---------|
| `acp-adapter.ts` | Chat adapter for ACP protocol |
| `agents.svelte.ts` | Agent state store |

## New Files

```
src/lib/
├── api/
│   └── acp.ts                    # ACP API client functions
├── stores/
│   └── agents.svelte.ts          # Agent state management
├── components/
│   ├── agent-selector.svelte     # Agent selection dropdown
│   ├── agent-card.svelte         # Agent info card
│   └── agent-auth-modal.svelte   # Auth flow modal
├── chat/
│   └── acp-adapter.ts            # ACP chat adapter

src-tauri/src/
├── commands/
│   └── acp.rs                    # ACP Tauri commands
```

## UI Changes

### Project Creation

Add agent selector to project creation form:

```svelte
<script>
  let selectedAgent = 'opencode';
  let agents = [];
  
  onMount(async () => {
    agents = await api.listAvailableAgents();
  });
</script>

<form>
  <Label>Project Name</Label>
  <Input bind:value={name} />
  
  <Label>Default Agent</Label>
  <AgentSelector bind:value={selectedAgent} {agents} />
  
  <!-- ... other fields ... -->
  
  <Button type="submit">Create Project</Button>
</form>
```

### Project Settings

Add agent configuration section:

```svelte
<Card>
  <CardHeader>
    <CardTitle>AI Agent</CardTitle>
  </CardHeader>
  <CardContent>
    <AgentSelector bind:value={project.defaultAgentId} {agents} />
    
    {#if selectedAgent.authRequired && !selectedAgent.isAuthenticated}
      <Button on:click={handleAuth}>
        Authenticate with {selectedAgent.name}
      </Button>
    {/if}
  </CardContent>
</Card>
```

### Chat Interface

Update chat to show current agent and allow switching:

```svelte
<div class="chat-header">
  <AgentSelector 
    bind:value={currentAgentId} 
    {agents}
    on:change={handleAgentChange}
  />
</div>

<ChatMessages {messages} />

<ChatInput on:send={handleSend} />
```

## State Management

### Agents Store

```typescript
// src/lib/stores/agents.svelte.ts
import { api } from '$lib/api/tauri';

interface AgentState {
  agents: Agent[];
  selectedAgentId: string | null;
  isLoading: boolean;
  error: string | null;
}

let state = $state<AgentState>({
  agents: [],
  selectedAgentId: null,
  isLoading: false,
  error: null,
});

export const agents = {
  get list() { return state.agents; },
  get selected() { return state.agents.find(a => a.id === state.selectedAgentId); },
  get isLoading() { return state.isLoading; },
  get error() { return state.error; },
  
  async fetchAgents(projectId: string) {
    state.isLoading = true;
    try {
      state.agents = await api.acpListAgents(projectId);
    } catch (e) {
      state.error = e.message;
    } finally {
      state.isLoading = false;
    }
  },
  
  async selectAgent(agentId: string) {
    state.selectedAgentId = agentId;
  },
  
  async authenticate(projectId: string, agentId: string) {
    return await api.acpStartAuth(projectId, agentId);
  },
};
```

## ACP Chat Adapter

```typescript
// src/lib/chat/acp-adapter.ts
export class AcpChatAdapter implements ChatAdapter {
  private projectId: string;
  private agentId: string;
  private sessionId: string | null = null;
  
  constructor(projectId: string, agentId: string) {
    this.projectId = projectId;
    this.agentId = agentId;
  }
  
  async createSession(): Promise<void> {
    const session = await api.acpCreateSession(this.projectId, this.agentId);
    this.sessionId = session.id;
    await this.subscribeToEvents();
  }
  
  async sendMessage(text: string): Promise<void> {
    if (!this.sessionId) throw new Error('No active session');
    await api.acpSendPrompt(this.projectId, this.sessionId, text);
  }
  
  async cancel(): Promise<void> {
    if (!this.sessionId) return;
    await api.acpCancelSession(this.projectId, this.sessionId);
  }
  
  private async subscribeToEvents(): Promise<void> {
    // Use Tauri events from SSE subscription
    await listen('acp-session-update', (event) => {
      this.handleSessionUpdate(event.payload);
    });
  }
  
  private handleSessionUpdate(update: SessionUpdate): void {
    // Update UI based on event type
    switch (update.type) {
      case 'text':
        this.onTextChunk?.(update.content.text);
        break;
      case 'tool_call':
        this.onToolCall?.(update.content.toolCall);
        break;
      case 'permission_request':
        this.onPermissionRequest?.(update.content);
        break;
    }
  }
}
```

## Tauri Commands

```rust
// src-tauri/src/commands/acp.rs

#[tauri::command]
pub async fn acp_list_agents(project_id: String) -> Result<Vec<Agent>, Error> {
    let response = api_client()
        .get(&format!("/api/projects/{}/acp/agents", project_id))
        .send()
        .await?;
    Ok(response.json().await?)
}

#[tauri::command]
pub async fn acp_start_auth(project_id: String, agent_id: String) -> Result<AuthInfo, Error> {
    let response = api_client()
        .post(&format!("/api/projects/{}/acp/agents/{}/auth/start", project_id, agent_id))
        .send()
        .await?;
    Ok(response.json().await?)
}

#[tauri::command]
pub async fn acp_create_session(
    project_id: String, 
    agent_id: String
) -> Result<Session, Error> {
    let response = api_client()
        .post(&format!("/api/projects/{}/acp/session", project_id))
        .json(&json!({ "agentId": agent_id }))
        .send()
        .await?;
    Ok(response.json().await?)
}

#[tauri::command]
pub async fn acp_send_prompt(
    project_id: String,
    session_id: String,
    text: String
) -> Result<(), Error> {
    api_client()
        .post(&format!("/api/projects/{}/acp/session/{}/prompt", project_id, session_id))
        .json(&json!({ "text": text }))
        .send()
        .await?;
    Ok(())
}

#[tauri::command]
pub async fn acp_subscribe_events(
    app: AppHandle,
    project_id: String,
    session_id: Option<String>
) -> Result<(), Error> {
    // Start SSE subscription and emit Tauri events
    let url = match session_id {
        Some(sid) => format!("/api/projects/{}/acp/events/{}", project_id, sid),
        None => format!("/api/projects/{}/acp/events", project_id),
    };
    
    // ... SSE handling code ...
    
    Ok(())
}
```

## Tasks

See [tasks.md](./tasks.md) for detailed task breakdown.
