# Session Persistence

## Overview

Session persistence ensures users can continue their work even after container restarts, app closures, or network interruptions. This is critical for mobile users who may switch between apps frequently.

## Persistence Layers

### Layer 1: ACP Session (Container)

The ACP agent maintains its own session state:

- **OpenCode**: Persists sessions in `/workspace/.opencode/`
- **Claude Code**: Stateless, conversation in memory
- **Gemini CLI**: Stateless, conversation in memory

### Layer 2: Management API Database

CodeOpen stores session metadata:

```sql
CREATE TABLE agent_sessions (
  id TEXT PRIMARY KEY,                    -- CodeOpen session ID
  project_id TEXT NOT NULL,               -- Project reference
  agent_id TEXT NOT NULL,                 -- 'opencode', 'claude', etc.
  acp_session_id TEXT,                    -- ACP agent's session ID
  title TEXT,                             -- User-defined or auto-generated
  status TEXT NOT NULL,                   -- 'active', 'paused', 'completed'
  working_directory TEXT NOT NULL,        -- /workspace by default
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE agent_session_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,               -- References agent_sessions.id
  role TEXT NOT NULL,                     -- 'user', 'assistant'
  content TEXT NOT NULL,                  -- JSON: { text, images, files }
  tool_calls TEXT,                        -- JSON: [{ id, name, input, output }]
  created_at INTEGER DEFAULT (unixepoch())
);
```

### Layer 3: Frontend Cache (Optional)

For offline support:
- LocalStorage for recent sessions
- IndexedDB for message history

## Session Lifecycle

### Creation

```
1. User starts new chat with agent
2. Frontend → POST /api/projects/:id/acp/session
   { agentId: "claude" }

3. Management API:
   a. Create DB record (status: 'active')
   b. Call container ACP Gateway
   c. Update record with acp_session_id
   
4. Return session to frontend
```

### Active Session

```
1. User sends prompt
2. Frontend → POST /api/projects/:id/acp/session/:sid/prompt
   { text: "Create a hello.txt file" }

3. Management API:
   a. Store user message in DB
   b. Forward to ACP Gateway
   
4. SSE events flow:
   a. Management API intercepts session/update
   b. Store assistant messages/tool calls in DB
   c. Forward events to frontend
```

### Container Restart

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Container Restart                            │
└─────────────────────────────────────────────────────────────────────┘

Before Restart:
- Session active in ACP agent
- Messages stored in Management API DB
- User working in chat

During Restart:
- Container stops (deploy, crash, scale)
- ACP Gateway terminates
- Agent subprocess dies
- SSE connection breaks

After Restart:
- Container starts fresh
- ACP Gateway initializes
- No agent subprocesses running
- DB still has session records

Resume Flow:
1. Frontend detects SSE disconnect
2. Shows "Connection lost" indicator
3. Attempts reconnection

4. On reconnect:
   a. Fetch session from DB (status: 'paused')
   b. Show session with history
   c. User clicks "Resume"

5. Resume session:
   a. Spawn agent in container
   b. Create new ACP session
   c. Inject conversation history (optional)
   d. Update DB with new acp_session_id
   e. Continue conversation
```

## Session States

| State | Description | Actions Available |
|-------|-------------|-------------------|
| `active` | Session running, agent connected | Send prompt, cancel, end |
| `paused` | Container restarted or disconnected | Resume, delete |
| `completed` | User ended session | View history, delete |
| `error` | Agent crashed or failed | Retry, delete |

## State Transitions

```
          ┌─────────┐
          │  new    │
          └────┬────┘
               │ create
               ▼
          ┌─────────┐
     ┌───►│ active  │◄──────────┐
     │    └────┬────┘           │
     │         │                │
     │    disconnect        resume
     │    /restart              │
     │         ▼                │
     │    ┌─────────┐           │
     │    │ paused  │───────────┘
     │    └────┬────┘
     │         │
   retry   end/delete
     │         │
     │         ▼
     │    ┌─────────┐
     └────┤completed│
          └─────────┘
               │
             delete
               ▼
          ┌─────────┐
          │ deleted │
          └─────────┘
```

## History Injection

For stateless agents (Claude Code, Gemini), we can inject conversation history:

### Option A: System Prompt (Simple)

```typescript
async function resumeSession(sessionId: string): Promise<void> {
  const session = await getAgentSession(sessionId);
  const messages = await getSessionMessages(sessionId);
  
  // Build history summary
  const history = messages.map(m => 
    `${m.role}: ${m.content}`
  ).join('\n\n');
  
  // Create new ACP session with history in first prompt
  const newSession = await acpGateway.createSession(projectId, {
    agentId: session.agentId,
  });
  
  // Send history as context
  await acpGateway.prompt(newSession.acpSessionId, 
    `Previous conversation:\n${history}\n\nContinue from here.`
  );
  
  // Update DB
  await updateAgentSession(sessionId, { 
    acpSessionId: newSession.acpSessionId,
    status: 'active' 
  });
}
```

### Option B: MCP Context (Advanced)

Some agents support context injection via MCP:

```typescript
// If agent supports context resources
await acpGateway.createSession(projectId, {
  agentId: session.agentId,
  mcpServers: [{
    name: 'codeopen-context',
    type: 'stdio',
    command: 'node',
    args: ['context-server.js'],
    env: { SESSION_ID: sessionId },
  }],
});
```

## Message Storage

### Storing User Messages

```typescript
async function sendPrompt(sessionId: string, text: string): Promise<void> {
  // Store user message first
  await addSessionMessage(sessionId, {
    role: 'user',
    content: JSON.stringify({ text }),
  });
  
  // Forward to agent
  await acpGateway.prompt(projectId, sessionId, text);
}
```

### Storing Assistant Messages

```typescript
// In SSE event handler
function handleSessionUpdate(update: SessionUpdate): void {
  if (update.type === 'text' && update.content.text) {
    // Accumulate text chunks
    appendToCurrentMessage(sessionId, update.content.text);
  }
  
  if (update.type === 'tool_call') {
    // Store tool call
    addToolCall(sessionId, update.content.toolCall);
  }
  
  if (update.type === 'end_turn') {
    // Finalize message
    finalizeCurrentMessage(sessionId);
  }
}
```

### Message Schema

```typescript
interface StoredMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: {
    text?: string;
    images?: { url: string; alt?: string }[];
    files?: { path: string; content?: string }[];
  };
  toolCalls?: {
    id: string;
    name: string;
    input: Record<string, unknown>;
    output?: string;
    status: 'pending' | 'completed' | 'failed';
  }[];
  createdAt: number;
}
```

## Frontend Handling

### Session List

```svelte
<script>
  let sessions = [];
  
  onMount(async () => {
    sessions = await api.listSessions(projectId);
  });
</script>

{#each sessions as session}
  <SessionCard {session}>
    {#if session.status === 'paused'}
      <Button on:click={() => resumeSession(session.id)}>
        Resume
      </Button>
    {:else if session.status === 'active'}
      <Button on:click={() => openSession(session.id)}>
        Continue
      </Button>
    {/if}
  </SessionCard>
{/each}
```

### Reconnection Logic

```typescript
class SessionConnection {
  private reconnectAttempts = 0;
  private maxAttempts = 5;
  
  async connect(): Promise<void> {
    try {
      await this.subscribeToEvents();
      this.reconnectAttempts = 0;
    } catch (error) {
      await this.handleDisconnect();
    }
  }
  
  async handleDisconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.maxAttempts) {
      // Mark session as paused
      await this.markSessionPaused();
      return;
    }
    
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;
    
    await sleep(delay);
    await this.connect();
  }
}
```

## Cleanup

### Session Cleanup

```typescript
// Periodic cleanup job in Management API
async function cleanupStaleSessions(): Promise<void> {
  const staleThreshold = Date.now() - (7 * 24 * 60 * 60 * 1000); // 7 days
  
  db.query(`
    DELETE FROM agent_session_messages 
    WHERE session_id IN (
      SELECT id FROM agent_sessions 
      WHERE status = 'completed' 
      AND updated_at < $threshold
    )
  `).run({ $threshold: staleThreshold });
  
  db.query(`
    DELETE FROM agent_sessions 
    WHERE status = 'completed' 
    AND updated_at < $threshold
  `).run({ $threshold: staleThreshold });
}
```

### Message Size Limits

```typescript
const MAX_MESSAGES_PER_SESSION = 1000;
const MAX_MESSAGE_SIZE = 1024 * 1024; // 1MB

async function addSessionMessage(sessionId: string, message: Message): Promise<void> {
  // Truncate large content
  if (message.content.length > MAX_MESSAGE_SIZE) {
    message.content = message.content.substring(0, MAX_MESSAGE_SIZE);
  }
  
  // Enforce message limit
  const count = await getMessageCount(sessionId);
  if (count >= MAX_MESSAGES_PER_SESSION) {
    await deleteOldestMessages(sessionId, 100);
  }
  
  await insertMessage(sessionId, message);
}
```

## Migration from v1

For existing OpenCode sessions:

```typescript
// One-time migration
async function migrateOpenCodeSessions(): Promise<void> {
  const projects = await getAllProjects();
  
  for (const project of projects) {
    // Fetch existing sessions from OpenCode API
    const opencodeSessions = await opencode.listSessions(project.id);
    
    for (const session of opencodeSessions) {
      // Create agent_sessions record
      await createAgentSession({
        projectId: project.id,
        agentId: 'opencode',
        acpSessionId: session.id,
        title: session.title,
        status: 'active',
      });
    }
  }
}
```
