# Google Agent Development Kit (ADK)

> **Version:** 1.0.0  
> **Last Updated:** January 5, 2026  
> **Status:** Production

---

## Overview

| Attribute | Value |
|-----------|-------|
| **Provider** | Google |
| **Type** | Open-Source Framework |
| **Languages** | Python, TypeScript, Go, Java |
| **Documentation** | https://google.github.io/adk-docs/ |
| **GitHub** | https://github.com/google/adk-python |

---

## What is Google ADK?

Google Agent Development Kit (ADK) is a comprehensive, open-source framework for building AI agents. While optimized for Gemini, ADK is model-agnostic and deployment-agnostic, designed to make agent development feel like software development.

### Key Differentiators

1. **Multi-Language** - Python, TypeScript, Go, Java SDKs
2. **Full Protocol Support** - MCP, A2A, AG-UI
3. **Workflow Agents** - Deterministic Sequential, Parallel, Loop patterns
4. **Google Cloud Integration** - BigQuery, Spanner, RAG Engine tools
5. **Built-in Evaluation** - Test response quality and trajectories

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Google ADK Architecture                  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                      Agent Types                     │   │
│  │                                                      │   │
│  │  ┌──────────────┐  ┌──────────────────────────────┐ │   │
│  │  │  LLM Agents  │  │     Workflow Agents          │ │   │
│  │  │  (Dynamic)   │  │  ┌──────────┐ ┌──────────┐  │ │   │
│  │  │              │  │  │Sequential│ │ Parallel │  │ │   │
│  │  │  • Reasoning │  │  └──────────┘ └──────────┘  │ │   │
│  │  │  • Planning  │  │  ┌──────────┐               │ │   │
│  │  │  • Handoffs  │  │  │   Loop   │               │ │   │
│  │  └──────────────┘  │  └──────────┘               │ │   │
│  │                    └──────────────────────────────┘ │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                    Tool Ecosystem                    │   │
│  │                                                      │   │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐      │   │
│  │  │Gemini API  │ │Google Cloud│ │Third-Party │      │   │
│  │  │Tools       │ │Tools       │ │Tools       │      │   │
│  │  │• Code Exec │ │• BigQuery  │ │• GitHub    │      │   │
│  │  │• Search    │ │• Spanner   │ │• Notion    │      │   │
│  │  │• Computer  │ │• RAG Engine│ │• PayPal    │      │   │
│  │  └────────────┘ └────────────┘ └────────────┘      │   │
│  │                                                      │   │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐      │   │
│  │  │ MCP Tools  │ │OpenAPI     │ │ Function   │      │   │
│  │  │            │ │Tools       │ │ Tools      │      │   │
│  │  └────────────┘ └────────────┘ └────────────┘      │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                    Protocols                         │   │
│  │  ┌──────┐  ┌──────┐  ┌────────┐                     │   │
│  │  │ MCP  │  │ A2A  │  │ AG-UI  │                     │   │
│  │  └──────┘  └──────┘  └────────┘                     │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Agent Types

### LLM Agents

Dynamic agents that use model reasoning:

```python
from google.adk import Agent

# Simple LLM agent
agent = Agent(
    name="researcher",
    model="gemini-2.0-flash-exp",
    instruction="You are a research assistant. Search for information and summarize findings.",
    tools=[google_search, web_fetch]
)

response = agent.run("What are the latest developments in AI agents?")
```

### Workflow Agents

Deterministic agents with fixed execution patterns:

#### Sequential Agent

```python
from google.adk.agents.workflow import SequentialAgent

# Sequential workflow
pipeline = SequentialAgent(
    name="content-pipeline",
    agents=[
        research_agent,
        writing_agent,
        editing_agent
    ]
)

result = pipeline.run("Create a blog post about AI")
```

#### Parallel Agent

```python
from google.adk.agents.workflow import ParallelAgent

# Parallel execution
parallel = ParallelAgent(
    name="multi-analyzer",
    agents=[
        sentiment_agent,
        topic_agent,
        entity_agent
    ]
)

results = parallel.run("Analyze this document")
```

#### Loop Agent

```python
from google.adk.agents.workflow import LoopAgent

# Iterative refinement
loop = LoopAgent(
    name="refiner",
    agent=improvement_agent,
    max_iterations=5,
    stop_condition=lambda result: result.quality_score > 0.9
)

refined = loop.run("Draft: Initial version of the document")
```

---

## Multi-Agent Systems

### Agent Hierarchy

```python
from google.adk import Agent

# Sub-agents as tools
coder = Agent(name="coder", ...)
reviewer = Agent(name="reviewer", ...)

# Parent agent coordinates
orchestrator = Agent(
    name="orchestrator",
    instruction="Coordinate coding and review tasks",
    sub_agents=[coder, reviewer]
)

# Orchestrator can delegate to sub-agents
result = orchestrator.run("Implement and review a sorting algorithm")
```

### Agent Transfer

```python
from google.adk import Agent

# Agents can transfer control
sales_agent = Agent(
    name="sales",
    instruction="Handle sales inquiries. Transfer to support for technical issues.",
    transfer_agents={"support": support_agent}
)

support_agent = Agent(
    name="support",
    instruction="Handle technical support. Transfer to sales for pricing.",
    transfer_agents={"sales": sales_agent}
)
```

---

## Tool Ecosystem

### Gemini API Tools

```python
from google.adk.tools.gemini_api import GoogleSearch, CodeExecution

agent = Agent(
    name="researcher",
    tools=[
        GoogleSearch(),      # Web search
        CodeExecution(),     # Code execution sandbox
    ]
)
```

### Google Cloud Tools

```python
from google.adk.tools.google_cloud import BigQuery, Spanner, RAGEngine

agent = Agent(
    name="analyst",
    tools=[
        BigQuery(project="my-project"),
        RAGEngine(corpus_id="my-corpus")
    ]
)
```

### MCP Tools

```python
from google.adk.tools.mcp import MCPToolset

# Load tools from MCP server
github_tools = MCPToolset.from_server("mcp/github")
postgres_tools = MCPToolset.from_server("mcp/postgres")

agent = Agent(
    name="developer",
    tools=[*github_tools, *postgres_tools]
)
```

### OpenAPI Tools

```python
from google.adk.tools.openapi import OpenAPIToolset

# Generate tools from OpenAPI spec
api_tools = OpenAPIToolset.from_spec("https://api.example.com/openapi.json")

agent = Agent(
    name="api-caller",
    tools=[*api_tools]
)
```

### Custom Function Tools

```python
from google.adk.tools import tool

@tool
def calculate_mortgage(
    principal: float,
    rate: float,
    years: int
) -> float:
    """Calculate monthly mortgage payment."""
    monthly_rate = rate / 12 / 100
    num_payments = years * 12
    return principal * (monthly_rate * (1 + monthly_rate)**num_payments) / ((1 + monthly_rate)**num_payments - 1)

agent = Agent(
    name="financial-advisor",
    tools=[calculate_mortgage]
)
```

---

## A2A Protocol Support

### Exposing Agent via A2A

```python
from google.adk import Agent
from google.adk.a2a import A2AServer

agent = Agent(
    name="code-reviewer",
    instruction="Review code for bugs and best practices"
)

# Expose via A2A
server = A2AServer(agent=agent, port=8080)
server.run()
```

### Consuming A2A Agents

```python
from google.adk.a2a import A2AClient

# Connect to remote A2A agent
client = A2AClient("https://agents.example.com/code-reviewer")

# Get agent capabilities
card = await client.get_agent_card()
print(f"Agent: {card.name}")
print(f"Skills: {[s.name for s in card.skills]}")

# Send task
result = await client.send_task(
    skill_id="review-code",
    input={"text": "def add(a, b): return a + b"}
)
```

---

## Sessions and Memory

### Session Management

```python
from google.adk import Agent
from google.adk.sessions import InMemorySessionService

# Session service for conversation history
session_service = InMemorySessionService()

agent = Agent(
    name="assistant",
    session_service=session_service
)

# Create session
session = session_service.create_session(
    app_name="my-app",
    user_id="user-123"
)

# Run with session
response = agent.run(
    "What's the weather?",
    session_id=session.id
)

# Continue conversation
response = agent.run(
    "What about tomorrow?",
    session_id=session.id
)
```

### State Management

```python
from google.adk.sessions import State

# Agent state
state = State(
    preferences={"language": "en"},
    history=[]
)

agent = Agent(
    name="stateful-agent",
    state=state
)

# State persists across turns
agent.state.history.append("Previous interaction")
```

---

## Deployment Options

### Agent Engine (Google Cloud)

```python
from google.adk.deploy import AgentEngine

# Deploy to Agent Engine
deployment = AgentEngine.deploy(
    agent=agent,
    project="my-project",
    location="us-central1"
)

# Invoke deployed agent
response = deployment.invoke("Hello!")
```

### Cloud Run

```python
from google.adk.deploy import CloudRunDeployment

# Deploy as Cloud Run service
deployment = CloudRunDeployment.deploy(
    agent=agent,
    project="my-project",
    region="us-central1"
)
```

### Self-Hosted

```bash
# Run locally with ADK CLI
adk run my_agent.py

# Or use the runtime directly
python -m google.adk.runtime.api_server --agent my_agent:agent
```

---

## Evaluation

### Built-in Evaluation

```python
from google.adk.evaluate import Evaluator, Criteria

evaluator = Evaluator(
    agent=agent,
    criteria=[
        Criteria.CORRECTNESS,
        Criteria.HELPFULNESS,
        Criteria.SAFETY
    ]
)

# Evaluate on test cases
results = evaluator.evaluate([
    {"input": "What is 2+2?", "expected": "4"},
    {"input": "Write a poem", "expected_criteria": ["creative", "coherent"]}
])

print(f"Correctness: {results.correctness}")
print(f"Helpfulness: {results.helpfulness}")
```

### User Simulation

```python
from google.adk.evaluate import UserSimulator

simulator = UserSimulator(
    persona="Confused beginner who asks follow-up questions"
)

# Simulate multi-turn conversation
conversation = simulator.simulate(
    agent=agent,
    initial_query="How do I use Python?",
    max_turns=5
)
```

---

## TypeScript SDK

```typescript
import { Agent } from "@google/adk";

const agent = new Agent({
  name: "assistant",
  model: "gemini-2.0-flash-exp",
  instruction: "You are a helpful assistant",
  tools: [searchWeb, calculateMath]
});

const response = await agent.run("What's the square root of 144?");
console.log(response.content);
```

---

## Go SDK

```go
package main

import (
    "google.golang.org/adk"
)

func main() {
    agent := adk.NewAgent(adk.AgentConfig{
        Name:        "assistant",
        Model:       "gemini-2.0-flash-exp",
        Instruction: "You are a helpful assistant",
        Tools:       []adk.Tool{searchTool, calcTool},
    })

    response, err := agent.Run(ctx, "What's the weather?")
    if err != nil {
        log.Fatal(err)
    }
    fmt.Println(response.Content)
}
```

---

## AgentPod Integration

### Relevance

Google ADK is highly relevant for AgentPod:
1. Multi-language support (Python, TS match AgentPod stack)
2. Full protocol support (MCP, A2A, AG-UI)
3. Self-hostable (runs in containers)
4. Workflow agents match AgentPod's workflow builder

### Potential Integration

```python
# Use Google ADK within AgentPod sandbox
from google.adk import Agent
from google.adk.tools.mcp import MCPToolset

# Load MCP tools from AgentPod's MCP gateway
tools = MCPToolset.from_server("http://mcp-gateway:8080")

agent = Agent(
    name="sandbox-agent",
    model="gemini-2.0-flash-exp",
    tools=[*tools]
)
```

---

## Resources

- **Documentation:** https://google.github.io/adk-docs/
- **Python SDK:** https://github.com/google/adk-python
- **TypeScript SDK:** https://github.com/google/adk-js
- **Go SDK:** https://github.com/google/adk-go
- **Java SDK:** https://github.com/google/adk-java

---

## Related Documentation

- [AWS Agents](./aws-agents.md) - AWS agent offerings
- [A2A Protocol](../protocols/a2a.md) - Agent communication
- [MCP Protocol](../protocols/mcp.md) - Tool integration

---

*Part of AgentPod Multi-Agent Ecosystem Research*
