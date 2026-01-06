# Agent-to-Agent Protocol (A2A)

> **Version:** 1.0.0  
> **Last Updated:** January 5, 2026  
> **Status:** Production Standard

---

## Overview

| Attribute | Value |
|-----------|-------|
| **Full Name** | Agent-to-Agent Protocol |
| **Originator** | Google |
| **Current Governance** | Linux Foundation |
| **Purpose** | Agent ↔ Agent communication |
| **Website** | https://a2a-protocol.org |
| **Specification** | https://google.github.io/A2A/ |

---

## What is A2A?

A2A (Agent-to-Agent) is a protocol that enables independent AI agents to discover, communicate, and collaborate with each other. If MCP is "USB for tools," A2A is "HTTP for agents" - a standard way for agents to work together regardless of their underlying framework.

### Key Problem Solved

Without A2A:
- Agent A (LangGraph) can't easily delegate to Agent B (CrewAI)
- Multi-vendor agent systems require custom integrations
- No standard for capability discovery between agents

With A2A:
- Any agent can discover another agent's capabilities
- Standard task delegation and handoff patterns
- Framework-agnostic collaboration

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        A2A Client                           │
│                    (Requesting Agent)                       │
│                                                             │
│  1. Discover agents via Agent Cards                        │
│  2. Send tasks to appropriate agents                       │
│  3. Handle responses and artifacts                         │
└─────────────────────────────────────────────────────────────┘
                           │
                           │ HTTP + JSON
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                        A2A Server                           │
│                    (Responding Agent)                       │
│                                                             │
│  1. Publish Agent Card with capabilities                   │
│  2. Receive and process tasks                              │
│  3. Return results via streaming or batch                  │
└─────────────────────────────────────────────────────────────┘
```

---

## Core Concepts

### 1. Agent Cards

Agent Cards are JSON documents that describe an agent's identity and capabilities. They serve as the "business card" for agents.

```json
{
  "name": "Code Review Agent",
  "description": "Expert code reviewer for Python, JavaScript, and Go",
  "url": "https://agents.example.com/code-reviewer",
  "provider": {
    "organization": "Example Corp",
    "url": "https://example.com"
  },
  "version": "1.0.0",
  "capabilities": {
    "streaming": true,
    "pushNotifications": false
  },
  "authentication": {
    "schemes": ["bearer"]
  },
  "skills": [
    {
      "id": "review-code",
      "name": "Code Review",
      "description": "Review code for bugs, style, and best practices",
      "inputModes": ["text", "file"],
      "outputModes": ["text"]
    },
    {
      "id": "suggest-fixes",
      "name": "Suggest Fixes",
      "description": "Suggest code improvements and fixes",
      "inputModes": ["text"],
      "outputModes": ["text", "file"]
    }
  ]
}
```

### 2. Tasks

Tasks are the unit of work in A2A. A client sends a task to a server, which processes it and returns results.

```json
{
  "id": "task-123",
  "skillId": "review-code",
  "input": {
    "text": {
      "text": "Please review this function:\n\nfunction add(a, b) { return a + b; }"
    }
  },
  "sessionId": "session-456"
}
```

### 3. Artifacts

Artifacts are the outputs of tasks - text, files, structured data, etc.

```json
{
  "taskId": "task-123",
  "artifacts": [
    {
      "name": "review-result",
      "mimeType": "text/markdown",
      "parts": [
        {
          "type": "text",
          "text": "## Code Review\n\n### Suggestions\n1. Add type hints\n2. Add docstring"
        }
      ]
    }
  ]
}
```

### 4. Streaming

A2A supports streaming responses for long-running tasks.

```
Client                          Server
   |                               |
   |--- POST /tasks -------------->|
   |                               |
   |<-- 200 OK + SSE stream -------|
   |    event: task.status         |
   |    data: {"status":"working"} |
   |                               |
   |<-- event: task.artifact ------|
   |    data: {"artifact": {...}}  |
   |                               |
   |<-- event: task.complete ------|
   |    data: {"status":"completed"}|
```

---

## API Endpoints

### Discovery

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/.well-known/agent.json` | GET | Get Agent Card |
| `/skills` | GET | List available skills |
| `/skills/{id}` | GET | Get skill details |

### Task Management

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/tasks` | POST | Create new task |
| `/tasks/{id}` | GET | Get task status |
| `/tasks/{id}` | DELETE | Cancel task |
| `/tasks/{id}/artifacts` | GET | Get task artifacts |

### Streaming

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/tasks/{id}/stream` | GET | SSE stream for task updates |

---

## Task Lifecycle

```
┌─────────┐     ┌──────────┐     ┌─────────┐     ┌───────────┐
│ PENDING │────►│ WORKING  │────►│ OUTPUT  │────►│ COMPLETED │
└─────────┘     └──────────┘     └─────────┘     └───────────┘
                     │                                  │
                     │                                  │
                     ▼                                  │
               ┌──────────┐                             │
               │  FAILED  │◄────────────────────────────┘
               └──────────┘
                     │
                     ▼
               ┌───────────┐
               │ CANCELLED │
               └───────────┘
```

### Task States

| State | Description |
|-------|-------------|
| `pending` | Task received, not yet started |
| `working` | Task is being processed |
| `input-required` | Agent needs more information |
| `output` | Task has partial results available |
| `completed` | Task finished successfully |
| `failed` | Task failed with error |
| `cancelled` | Task was cancelled |

---

## Multi-Agent Patterns

### 1. Simple Delegation

One agent delegates a subtask to another.

```
┌──────────────┐                    ┌──────────────┐
│  Orchestrator │                    │  Specialist  │
│    Agent      │                    │    Agent     │
│               │ ── POST /tasks ──► │              │
│               │ ◄── Response ───── │              │
└──────────────┘                    └──────────────┘
```

### 2. Pipeline

Tasks flow through multiple agents in sequence.

```
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│ Agent A │────►│ Agent B │────►│ Agent C │────►│ Agent D │
│ Analyze │     │ Process │     │ Review  │     │ Format  │
└─────────┘     └─────────┘     └─────────┘     └─────────┘
```

### 3. Parallel Fan-Out

One agent sends tasks to multiple specialists simultaneously.

```
                    ┌─────────────┐
               ┌───►│ Specialist A│
               │    └─────────────┘
┌──────────────┤    ┌─────────────┐
│  Orchestrator├───►│ Specialist B│
└──────────────┤    └─────────────┘
               │    ┌─────────────┐
               └───►│ Specialist C│
                    └─────────────┘
```

### 4. Supervisor Pattern

A supervisor coordinates multiple worker agents.

```
               ┌──────────────────────┐
               │   Supervisor Agent   │
               │  (Coordinates work)  │
               └──────────────────────┘
                          │
         ┌────────────────┼────────────────┐
         │                │                │
         ▼                ▼                ▼
   ┌──────────┐    ┌──────────┐    ┌──────────┐
   │ Worker A │    │ Worker B │    │ Worker C │
   └──────────┘    └──────────┘    └──────────┘
```

---

## Framework Support

| Framework | A2A Support | Implementation |
|-----------|-------------|----------------|
| Google ADK | ✅ Native | Built-in A2A client/server |
| Strands Agents | ✅ Native | `multiagent.a2a` module |
| LangGraph | ⚠️ Community | Third-party integration |
| CrewAI | ⚠️ Planned | On roadmap |
| AutoGen | ⚠️ Community | Third-party integration |

---

## Implementation Example

### Python A2A Server (Strands)

```python
from strands.multiagent.a2a import A2AServer, skill

class CodeReviewAgent:
    @skill(
        name="Review Code",
        description="Review code for issues",
        input_modes=["text"],
        output_modes=["text"]
    )
    async def review_code(self, code: str) -> str:
        # Perform code review
        return f"## Review Results\n\nCode looks good!"

# Start A2A server
server = A2AServer(
    name="Code Review Agent",
    agent=CodeReviewAgent(),
    port=8080
)
server.run()
```

### Python A2A Client (Strands)

```python
from strands.multiagent.a2a import A2AClient

# Connect to A2A server
client = A2AClient("https://agents.example.com/code-reviewer")

# Get agent capabilities
agent_card = await client.get_agent_card()
print(f"Agent: {agent_card.name}")
print(f"Skills: {[s.name for s in agent_card.skills]}")

# Send task
task = await client.create_task(
    skill_id="review-code",
    input={"text": "def add(a, b): return a + b"}
)

# Wait for result
result = await client.wait_for_task(task.id)
print(result.artifacts[0].text)
```

### Go A2A Server (ADK)

```go
package main

import (
    "google.golang.org/adk/a2a"
)

func main() {
    server := a2a.NewServer(a2a.Config{
        Name: "Code Review Agent",
        Port: 8080,
    })

    server.RegisterSkill(a2a.Skill{
        ID:          "review-code",
        Name:        "Review Code",
        Description: "Review code for issues",
        Handler:     reviewCodeHandler,
    })

    server.ListenAndServe()
}

func reviewCodeHandler(task *a2a.Task) (*a2a.Artifact, error) {
    code := task.Input.Text
    // Perform review...
    return &a2a.Artifact{
        Text: "## Review Results\n\nCode looks good!",
    }, nil
}
```

---

## Comparison with Other Protocols

| Feature | A2A | MCP | HTTP/REST |
|---------|-----|-----|-----------|
| **Purpose** | Agent ↔ Agent | Agent ↔ Tools | Generic APIs |
| **Discovery** | Agent Cards | Capability negotiation | OpenAPI |
| **Streaming** | SSE | SSE/WebSocket | SSE |
| **State** | Task-based | Stateless | Stateless |
| **Typing** | Artifacts | Content blocks | JSON |

---

## A2A + MCP Together

A2A and MCP are complementary:

```
┌─────────────────────────────────────────────────────────────┐
│                      Orchestrator Agent                     │
└─────────────────────────────────────────────────────────────┘
           │                              │
           │ A2A                          │ A2A
           │ (agent communication)        │ (agent communication)
           ▼                              ▼
    ┌──────────────┐              ┌──────────────┐
    │ Code Agent   │              │ Data Agent   │
    └──────────────┘              └──────────────┘
           │                              │
           │ MCP                          │ MCP
           │ (tool access)                │ (tool access)
           ▼                              ▼
    ┌──────────────┐              ┌──────────────┐
    │ Git Server   │              │ DB Server    │
    └──────────────┘              └──────────────┘
```

---

## AgentPod Integration

### Recommendation

A2A is recommended for AgentPod's multi-agent scenarios:

1. **Agent-to-Agent Delegation** - Central orchestrator delegates to specialist agents
2. **Cross-Container Communication** - Agents in different sandboxes can collaborate
3. **External Agent Integration** - Connect to third-party A2A-compatible agents

### Implementation Path

1. Add A2A client to sandbox containers
2. Implement A2A server wrapper for internal agents
3. Build agent discovery UI for browsing available agents

---

## Resources

- **Specification:** https://google.github.io/A2A/
- **Python SDK:** https://github.com/google/a2a-python
- **Go SDK:** Part of Google ADK
- **Examples:** https://github.com/google/A2A/tree/main/samples

---

## Related Documentation

- [MCP Protocol](./mcp.md) - Tool integration
- [AG-UI Protocol](./ag-ui.md) - Frontend streaming
- [Strands Agents](../frameworks/aws-agents.md#strands-agents) - A2A implementation

---

*Part of AgentPod Multi-Agent Ecosystem Research*
