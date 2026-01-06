# AG-UI Protocol (Agent User Interaction)

> **Version:** 1.0.0  
> **Last Updated:** January 5, 2026  
> **Status:** Active Development

---

## Overview

| Attribute | Value |
|-----------|-------|
| **Full Name** | Agent User Interaction Protocol |
| **Originator** | CopilotKit |
| **Governance** | Community / CopilotKit |
| **Purpose** | Agent ↔ Frontend UI streaming |
| **Website** | https://ag-ui.com |
| **Specification** | https://docs.ag-ui.com |

---

## What is AG-UI?

AG-UI (Agent User Interaction) is a protocol that standardizes how AI agents communicate with frontend applications. It defines event types for streaming content, tool execution visibility, and human-in-the-loop interactions.

### Key Problem Solved

Without AG-UI:
- Each agent framework has its own UI integration pattern
- No standard for streaming tool calls to the frontend
- Human-in-the-loop implementations are inconsistent

With AG-UI:
- Standard event format for agent → UI communication
- Consistent tool execution visibility across frameworks
- Portable human-in-the-loop components

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend                             │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                    AG-UI Client                      │   │
│  │         (React, Vue, Svelte components)              │   │
│  │                                                      │   │
│  │  • Parse events from agent                          │   │
│  │  • Render streaming content                         │   │
│  │  • Display tool calls in progress                   │   │
│  │  • Handle human-in-the-loop prompts                 │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                           ▲
                           │ Event Stream (SSE/WebSocket)
                           │
┌─────────────────────────────────────────────────────────────┐
│                        Backend                              │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                    AG-UI Server                      │   │
│  │           (Agent runtime adapter)                    │   │
│  │                                                      │   │
│  │  • Wrap agent execution                             │   │
│  │  • Emit AG-UI events                                │   │
│  │  • Handle user responses                            │   │
│  └─────────────────────────────────────────────────────┘   │
│                            │                                │
│                            ▼                                │
│                    ┌──────────────┐                        │
│                    │    Agent     │                        │
│                    │  (Any SDK)   │                        │
│                    └──────────────┘                        │
└─────────────────────────────────────────────────────────────┘
```

---

## Event Types

AG-UI defines a standard set of events for agent → UI communication:

### Core Events

| Event | Purpose | Direction |
|-------|---------|-----------|
| `run.start` | Agent run started | Agent → UI |
| `run.end` | Agent run completed | Agent → UI |
| `run.error` | Agent encountered error | Agent → UI |
| `text.delta` | Streaming text chunk | Agent → UI |
| `text.done` | Text message complete | Agent → UI |

### Tool Events

| Event | Purpose | Direction |
|-------|---------|-----------|
| `tool.call.start` | Tool invocation started | Agent → UI |
| `tool.call.args.delta` | Streaming tool arguments | Agent → UI |
| `tool.call.end` | Tool invocation completed | Agent → UI |
| `tool.result` | Tool execution result | Agent → UI |

### Human-in-the-Loop Events

| Event | Purpose | Direction |
|-------|---------|-----------|
| `state.snapshot` | Current agent state | Agent → UI |
| `state.delta` | State update | Agent → UI |
| `messages.snapshot` | Current messages | Agent → UI |
| `raw` | Raw data passthrough | Both |

---

## Event Format

### Base Event Structure

```typescript
interface AGUIEvent {
  type: string;           // Event type
  timestamp?: number;     // Unix timestamp
  runId?: string;         // Run identifier
  [key: string]: unknown; // Event-specific data
}
```

### Text Delta Event

```json
{
  "type": "text.delta",
  "runId": "run-123",
  "messageId": "msg-456",
  "delta": "Hello, ",
  "timestamp": 1704499200000
}
```

### Tool Call Start Event

```json
{
  "type": "tool.call.start",
  "runId": "run-123",
  "toolCallId": "call-789",
  "toolName": "search_web",
  "timestamp": 1704499200000
}
```

### Tool Call Arguments Delta

```json
{
  "type": "tool.call.args.delta",
  "runId": "run-123",
  "toolCallId": "call-789",
  "delta": "{\"query\": \"weather",
  "timestamp": 1704499201000
}
```

### Tool Result Event

```json
{
  "type": "tool.result",
  "runId": "run-123",
  "toolCallId": "call-789",
  "result": {
    "content": "Current weather: 72°F, sunny"
  },
  "timestamp": 1704499202000
}
```

### State Snapshot Event

```json
{
  "type": "state.snapshot",
  "runId": "run-123",
  "snapshot": {
    "messages": [...],
    "toolCalls": [...],
    "metadata": {...}
  },
  "timestamp": 1704499200000
}
```

---

## Transport

AG-UI supports multiple transport mechanisms:

### Server-Sent Events (SSE)

```
GET /api/agent/stream HTTP/1.1
Accept: text/event-stream

---

event: text.delta
data: {"type":"text.delta","delta":"Hello"}

event: tool.call.start
data: {"type":"tool.call.start","toolName":"search"}

event: text.done
data: {"type":"text.done","content":"Hello, world!"}
```

### WebSocket

```json
// Client → Server
{"type": "user.message", "content": "What's the weather?"}

// Server → Client
{"type": "text.delta", "delta": "Let me check..."}
{"type": "tool.call.start", "toolName": "get_weather"}
{"type": "tool.result", "result": "72°F, sunny"}
{"type": "text.done", "content": "The weather is 72°F and sunny."}
```

---

## Framework Integrations

### CopilotKit (Native)

```tsx
import { useCopilotChat } from "@copilotkit/react-core";

function Chat() {
  const { messages, sendMessage } = useCopilotChat();
  
  return (
    <div>
      {messages.map((msg) => (
        <Message key={msg.id} message={msg} />
      ))}
    </div>
  );
}
```

### LangGraph

```python
from langgraph.pregel import Pregel
from ag_ui import AGUIAdapter

# Wrap LangGraph in AG-UI adapter
agent = Pregel(...)
adapter = AGUIAdapter(agent)

# Stream AG-UI events
async for event in adapter.stream(input):
    yield event.model_dump_json()
```

### Strands Agents

```python
from strands import Agent
from strands.integrations.ag_ui import AGUIHandler

agent = Agent(...)
handler = AGUIHandler()

# Stream with AG-UI events
async for event in agent.stream(prompt, handler=handler):
    print(event)
```

### Google ADK

Google ADK includes AG-UI as a third-party tool integration:

```python
from adk.tools.third_party import ag_ui

# AG-UI integration available via tools
```

---

## React Components

AG-UI provides React hooks and components:

### useChatStream Hook

```tsx
import { useChatStream } from "@ag-ui/react";

function Chat() {
  const { 
    messages,
    toolCalls,
    isStreaming,
    sendMessage 
  } = useChatStream({
    endpoint: "/api/agent/stream"
  });

  return (
    <div>
      {messages.map((msg) => <Message key={msg.id} {...msg} />)}
      {toolCalls.map((call) => <ToolCall key={call.id} {...call} />)}
      <Input onSubmit={sendMessage} disabled={isStreaming} />
    </div>
  );
}
```

### ToolCallDisplay Component

```tsx
import { ToolCallDisplay } from "@ag-ui/react";

function ToolCall({ toolCall }) {
  return (
    <ToolCallDisplay
      name={toolCall.name}
      args={toolCall.args}
      result={toolCall.result}
      status={toolCall.status}
    />
  );
}
```

---

## Human-in-the-Loop

AG-UI standardizes human intervention patterns:

### Confirmation Request

```json
{
  "type": "confirmation.request",
  "runId": "run-123",
  "confirmationId": "confirm-456",
  "action": {
    "type": "tool_call",
    "name": "delete_file",
    "args": {"path": "/important.txt"}
  },
  "message": "Are you sure you want to delete this file?",
  "options": [
    {"id": "approve", "label": "Delete"},
    {"id": "deny", "label": "Cancel"}
  ]
}
```

### Confirmation Response

```json
{
  "type": "confirmation.response",
  "confirmationId": "confirm-456",
  "choice": "approve"
}
```

### Input Request

```json
{
  "type": "input.request",
  "runId": "run-123",
  "inputId": "input-789",
  "message": "Please enter the API key:",
  "inputType": "password"
}
```

---

## Protocol Stack Position

AG-UI complements MCP and A2A:

```
┌─────────────────────────────────────────────────────────────┐
│                         User/Browser                        │
│                                                             │
│                         ┌───────────┐                       │
│                         │   AG-UI   │                       │
│                         │  (Events) │                       │
│                         └─────┬─────┘                       │
└───────────────────────────────┼─────────────────────────────┘
                                │
┌───────────────────────────────┼─────────────────────────────┐
│                          Agent │Runtime                      │
│                                │                             │
│    ┌─────────┐     A2A     ┌───┴───┐     MCP     ┌───────┐ │
│    │ Agent A │◄───────────►│ Agent │◄───────────►│ Tools │ │
│    └─────────┘             └───────┘             └───────┘ │
└─────────────────────────────────────────────────────────────┘
```

| Protocol | Layer | Purpose |
|----------|-------|---------|
| **AG-UI** | Presentation | Agent ↔ User Interface |
| **A2A** | Application | Agent ↔ Agent |
| **MCP** | Data | Agent ↔ Tools/Data |

---

## AgentPod Integration

### Current State

AgentPod uses assistant-ui (React) for chat, which has its own event model. AG-UI adoption would standardize the event format.

### Recommendation

1. **Evaluate adoption** - AG-UI aligns with AgentPod's SSE-based architecture
2. **Adapter approach** - Translate existing SSE events to AG-UI format
3. **Component reuse** - Leverage AG-UI's tool call visualization components

### Integration Example

```typescript
// Translate AgentPod SSE to AG-UI events
function translateEvent(event: AgentPodEvent): AGUIEvent {
  switch (event.type) {
    case "message.part.updated":
      return {
        type: "text.delta",
        delta: event.data.content,
        runId: event.sessionId
      };
    case "tool.execute":
      return {
        type: "tool.call.start",
        toolName: event.data.tool,
        toolCallId: event.data.id,
        runId: event.sessionId
      };
    // ... more translations
  }
}
```

---

## Resources

- **Website:** https://ag-ui.com
- **Documentation:** https://docs.ag-ui.com
- **GitHub:** https://github.com/CopilotKit/ag-ui
- **React SDK:** `@ag-ui/react`
- **Python Adapter:** `ag-ui-python`

---

## Related Documentation

- [MCP Protocol](./mcp.md) - Tool integration
- [A2A Protocol](./a2a.md) - Agent communication
- [Vercel AI SDK](../frameworks/vercel-ai-sdk.md) - Similar streaming patterns

---

*Part of AgentPod Multi-Agent Ecosystem Research*
