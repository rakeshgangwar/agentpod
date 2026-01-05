# Agent Protocol (REST API Standard)

> **Version:** 1.0.0  
> **Last Updated:** January 5, 2026  
> **Status:** Active Standard

---

## Overview

| Attribute | Value |
|-----------|-------|
| **Full Name** | Agent Protocol |
| **Originator** | E2B → AI Engineer Foundation |
| **Current Governance** | AI Engineer Foundation (AIEF) |
| **Purpose** | REST API standard for agent control |
| **Website** | https://agentprotocol.ai |
| **Specification** | https://agentprotocol.ai/protocol |

---

## What is Agent Protocol?

Agent Protocol defines a standard REST API for creating, running, and managing AI agent tasks. It emerged from E2B's work on sandboxed agent runtimes and provides a framework-agnostic way to control agents over HTTP.

### Key Problem Solved

Without Agent Protocol:
- Each agent framework has its own API
- No standard for task lifecycle management
- Benchmarking agents is difficult

With Agent Protocol:
- Standard REST endpoints for all agents
- Consistent task states and artifacts
- Easy to swap agent implementations

---

## API Structure

### Base URL

```
https://agent.example.com/ap/v1/
```

### Core Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/agent/tasks` | POST | Create new task |
| `/agent/tasks` | GET | List all tasks |
| `/agent/tasks/{task_id}` | GET | Get task details |
| `/agent/tasks/{task_id}/steps` | POST | Execute next step |
| `/agent/tasks/{task_id}/steps` | GET | List task steps |
| `/agent/tasks/{task_id}/steps/{step_id}` | GET | Get step details |
| `/agent/tasks/{task_id}/artifacts` | GET | List task artifacts |
| `/agent/tasks/{task_id}/artifacts` | POST | Upload artifact |
| `/agent/tasks/{task_id}/artifacts/{artifact_id}` | GET | Download artifact |

---

## Task Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│                     Create Task                             │
│                    POST /agent/tasks                        │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    Execute Steps                            │
│              POST /agent/tasks/{id}/steps                   │
│                                                             │
│    ┌─────────┐     ┌─────────┐     ┌─────────┐            │
│    │ Step 1  │────►│ Step 2  │────►│ Step N  │            │
│    └─────────┘     └─────────┘     └─────────┘            │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                   Retrieve Artifacts                        │
│              GET /agent/tasks/{id}/artifacts                │
└─────────────────────────────────────────────────────────────┘
```

---

## Data Models

### Task

```json
{
  "task_id": "task-abc123",
  "input": "Write a Python function to sort a list",
  "additional_input": {
    "language": "python",
    "style": "functional"
  },
  "artifacts": [],
  "created_at": "2026-01-05T12:00:00Z"
}
```

### Step

```json
{
  "step_id": "step-xyz789",
  "task_id": "task-abc123",
  "name": "analyze_requirements",
  "status": "completed",
  "input": "Analyze the sorting requirements",
  "output": "User wants a Python function using functional style",
  "artifacts": [],
  "is_last": false,
  "created_at": "2026-01-05T12:00:01Z"
}
```

### Artifact

```json
{
  "artifact_id": "artifact-def456",
  "file_name": "sort.py",
  "relative_path": "src/sort.py",
  "agent_created": true,
  "created_at": "2026-01-05T12:00:05Z"
}
```

---

## API Examples

### Create Task

```bash
curl -X POST https://agent.example.com/ap/v1/agent/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "input": "Create a REST API for a todo list application"
  }'
```

Response:
```json
{
  "task_id": "task-abc123",
  "input": "Create a REST API for a todo list application",
  "artifacts": [],
  "created_at": "2026-01-05T12:00:00Z"
}
```

### Execute Step

```bash
curl -X POST https://agent.example.com/ap/v1/agent/tasks/task-abc123/steps \
  -H "Content-Type: application/json" \
  -d '{
    "input": "Start by designing the API endpoints"
  }'
```

Response:
```json
{
  "step_id": "step-xyz789",
  "task_id": "task-abc123",
  "name": "design_api",
  "status": "completed",
  "output": "Designed endpoints: GET /todos, POST /todos, PUT /todos/:id, DELETE /todos/:id",
  "artifacts": [
    {
      "artifact_id": "artifact-spec001",
      "file_name": "openapi.yaml"
    }
  ],
  "is_last": false
}
```

### Get Artifacts

```bash
curl https://agent.example.com/ap/v1/agent/tasks/task-abc123/artifacts
```

Response:
```json
{
  "artifacts": [
    {
      "artifact_id": "artifact-spec001",
      "file_name": "openapi.yaml",
      "relative_path": "specs/openapi.yaml",
      "agent_created": true
    },
    {
      "artifact_id": "artifact-code001",
      "file_name": "app.py",
      "relative_path": "src/app.py",
      "agent_created": true
    }
  ]
}
```

### Download Artifact

```bash
curl https://agent.example.com/ap/v1/agent/tasks/task-abc123/artifacts/artifact-code001 \
  -o app.py
```

---

## Step Modes

### Autonomous Mode

Agent decides when task is complete:

```bash
# Keep executing steps until is_last is true
while true; do
  response=$(curl -X POST .../steps)
  is_last=$(echo $response | jq '.is_last')
  if [ "$is_last" = "true" ]; then
    break
  fi
done
```

### Interactive Mode

Human reviews each step:

```bash
# Execute one step at a time with human review
curl -X POST .../steps -d '{"input": "Design the database schema"}'
# Review output...
curl -X POST .../steps -d '{"input": "Implement the API endpoints"}'
# Review output...
```

---

## Implementation

### Python Server

```python
from fastapi import FastAPI
from agent_protocol import AgentProtocol

app = FastAPI()
protocol = AgentProtocol()

@app.post("/ap/v1/agent/tasks")
async def create_task(input: str):
    task = await protocol.create_task(input)
    return task

@app.post("/ap/v1/agent/tasks/{task_id}/steps")
async def execute_step(task_id: str, input: str = None):
    step = await protocol.execute_step(task_id, input)
    return step

@app.get("/ap/v1/agent/tasks/{task_id}/artifacts")
async def list_artifacts(task_id: str):
    artifacts = await protocol.list_artifacts(task_id)
    return {"artifacts": artifacts}
```

### TypeScript Client

```typescript
import { AgentProtocolClient } from "@agent-protocol/client";

const client = new AgentProtocolClient("https://agent.example.com");

// Create task
const task = await client.createTask({
  input: "Build a calculator API"
});

// Execute steps until complete
let step;
do {
  step = await client.executeStep(task.task_id);
  console.log(`Step: ${step.name} - ${step.output}`);
} while (!step.is_last);

// Get artifacts
const artifacts = await client.listArtifacts(task.task_id);
for (const artifact of artifacts) {
  const content = await client.downloadArtifact(task.task_id, artifact.artifact_id);
  console.log(`File: ${artifact.file_name}`);
}
```

---

## Framework Implementations

| Framework | Agent Protocol Support |
|-----------|----------------------|
| AutoGPT | ✅ Native |
| BabyAGI | ✅ Native |
| E2B | ✅ Native |
| LangChain | ✅ Via adapter |
| CrewAI | ⚠️ Community |
| AutoGen | ⚠️ Community |

---

## Comparison with Other Protocols

| Feature | Agent Protocol | A2A | MCP |
|---------|---------------|-----|-----|
| **Purpose** | Task management | Agent-to-agent | Tool access |
| **Transport** | REST HTTP | HTTP + SSE | JSON-RPC |
| **State** | Task/Step model | Task-based | Stateless |
| **Artifacts** | First-class | Via response | Via resources |
| **Use Case** | Benchmarking, orchestration | Multi-agent | Tool integration |

---

## Use Cases

### 1. Agent Benchmarking

Agent Protocol enables standardized benchmarking:

```python
# Run same task on different agents
agents = [
    "https://agent-a.example.com",
    "https://agent-b.example.com",
    "https://agent-c.example.com"
]

results = []
for agent_url in agents:
    client = AgentProtocolClient(agent_url)
    task = await client.create_task({"input": benchmark_prompt})
    
    start = time.time()
    while True:
        step = await client.execute_step(task.task_id)
        if step.is_last:
            break
    
    results.append({
        "agent": agent_url,
        "time": time.time() - start,
        "steps": len(await client.list_steps(task.task_id)),
        "artifacts": len(await client.list_artifacts(task.task_id))
    })
```

### 2. Agent Orchestration

Use Agent Protocol to coordinate multiple agents:

```python
# Orchestrator calls different specialized agents
async def orchestrate_project(requirements):
    # Design agent
    design_task = await design_client.create_task({"input": requirements})
    await run_to_completion(design_client, design_task.task_id)
    design_artifacts = await design_client.list_artifacts(design_task.task_id)
    
    # Implementation agent
    impl_task = await impl_client.create_task({
        "input": "Implement the design",
        "additional_input": {"design": design_artifacts}
    })
    await run_to_completion(impl_client, impl_task.task_id)
    
    # Test agent
    test_task = await test_client.create_task({
        "input": "Write tests for the implementation"
    })
    await run_to_completion(test_client, test_task.task_id)
```

### 3. Human-in-the-Loop

Interactive step execution with human review:

```python
while True:
    # Agent proposes next action
    step = await client.execute_step(task_id, {"input": "Continue"})
    
    # Human reviews
    print(f"Agent action: {step.output}")
    approval = input("Approve? (y/n/modify): ")
    
    if approval == 'n':
        await client.execute_step(task_id, {"input": "Undo and try different approach"})
    elif approval.startswith('modify:'):
        await client.execute_step(task_id, {"input": approval[7:]})
    
    if step.is_last:
        break
```

---

## AgentPod Integration

### Potential Use Cases

1. **Sandbox Task API** - Expose Agent Protocol endpoint per sandbox
2. **Agent Benchmarking** - Compare different agents using standard protocol
3. **External Orchestration** - Allow external systems to control AgentPod agents

### Implementation Sketch

```typescript
// AgentPod could expose Agent Protocol per sandbox
app.post("/sandbox/:sandboxId/ap/v1/agent/tasks", async (c) => {
  const { sandboxId } = c.req.param();
  const { input } = await c.req.json();
  
  // Forward to sandbox's OpenCode agent
  const task = await sandboxService.createAgentTask(sandboxId, input);
  
  return c.json({
    task_id: task.id,
    input: task.input,
    artifacts: [],
    created_at: task.createdAt
  });
});
```

---

## Resources

- **Specification:** https://agentprotocol.ai/protocol
- **Python SDK:** https://github.com/AI-Engineer-Foundation/agent-protocol
- **TypeScript SDK:** https://github.com/AI-Engineer-Foundation/agent-protocol-ts
- **Reference Implementation:** https://github.com/e2b-dev/agent-protocol

---

## Related Documentation

- [A2A Protocol](./a2a.md) - Agent-to-agent communication
- [MCP Protocol](./mcp.md) - Tool integration

---

*Part of AgentPod Multi-Agent Ecosystem Research*
