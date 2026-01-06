# AWS Agent Offerings

> **Version:** 1.0.0  
> **Last Updated:** January 5, 2026  
> **Status:** Production

---

## Overview

AWS offers a comprehensive suite of agent capabilities:

| Product | Type | Purpose |
|---------|------|---------|
| **Amazon Bedrock Agents** | Managed Service | No-code/low-code agent building |
| **Amazon Bedrock AgentCore** | Infrastructure | Framework-agnostic agent platform |
| **Strands Agents** | Open-Source SDK | Code-first agent development |

---

## Amazon Bedrock Agents

### Overview

| Attribute | Value |
|-----------|-------|
| **Type** | Fully Managed Service |
| **Documentation** | https://aws.amazon.com/bedrock/agents/ |
| **Pricing** | Per agent invocation |

### What is Bedrock Agents?

Amazon Bedrock Agents is a managed service that enables building AI agents without managing infrastructure or writing orchestration code. Agents automatically plan, execute, and iterate on tasks.

### Key Features

| Feature | Description |
|---------|-------------|
| **Multi-Agent Collaboration** | Supervisor coordinates specialist agents |
| **RAG Integration** | Connect to Knowledge Bases |
| **Memory Retention** | Context persists across conversations |
| **Code Interpretation** | Secure code execution sandbox |
| **Guardrails** | Built-in safety controls |

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Amazon Bedrock Agents                    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                  Supervisor Agent                    │   │
│  │            (Coordinates specialist agents)           │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                 │
│           ┌───────────────┼───────────────┐                │
│           ▼               ▼               ▼                │
│    ┌──────────┐    ┌──────────┐    ┌──────────┐          │
│    │Specialist│    │Specialist│    │Specialist│          │
│    │ Agent A  │    │ Agent B  │    │ Agent C  │          │
│    └──────────┘    └──────────┘    └──────────┘          │
│           │               │               │                │
│           └───────────────┼───────────────┘                │
│                           ▼                                 │
│    ┌─────────────────────────────────────────────────────┐ │
│    │              Action Groups & Knowledge Bases         │ │
│    │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐  │ │
│    │  │  API    │ │ Lambda  │ │   RAG   │ │  S3     │  │ │
│    │  └─────────┘ └─────────┘ └─────────┘ └─────────┘  │ │
│    └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Creating an Agent

```python
import boto3

bedrock_agent = boto3.client('bedrock-agent')

# Create agent
response = bedrock_agent.create_agent(
    agentName='my-agent',
    foundationModel='anthropic.claude-3-sonnet-20240229-v1:0',
    instruction="""You are a helpful customer service agent. 
    You can look up orders, process returns, and answer questions.""",
    idleSessionTTLInSeconds=1800
)

# Add action group (Lambda function as tool)
bedrock_agent.create_agent_action_group(
    agentId=response['agent']['agentId'],
    actionGroupName='order-actions',
    actionGroupExecutor={
        'lambda': 'arn:aws:lambda:us-east-1:123456789:function:order-handler'
    },
    apiSchema={
        's3': {
            's3BucketName': 'my-schemas',
            's3ObjectKey': 'order-api.yaml'
        }
    }
)

# Attach knowledge base
bedrock_agent.associate_agent_knowledge_base(
    agentId=response['agent']['agentId'],
    knowledgeBaseId='kb-123456'
)
```

### Invoking an Agent

```python
bedrock_runtime = boto3.client('bedrock-agent-runtime')

response = bedrock_runtime.invoke_agent(
    agentId='agent-123',
    agentAliasId='alias-456',
    sessionId='session-789',
    inputText='What is the status of order #12345?'
)

# Stream response
for event in response['completion']:
    if 'chunk' in event:
        print(event['chunk']['bytes'].decode())
```

---

## Amazon Bedrock AgentCore

### Overview

| Attribute | Value |
|-----------|-------|
| **Type** | Infrastructure Platform |
| **Documentation** | https://aws.amazon.com/bedrock/agentcore/ |
| **Key Feature** | Framework-agnostic |

### What is AgentCore?

AgentCore is an infrastructure layer for building, deploying, and operating agents at scale. Unlike Bedrock Agents (managed service), AgentCore lets you use ANY framework while providing enterprise infrastructure.

### Key Services

| Service | Purpose |
|---------|---------|
| **Runtime** | Serverless agent hosting (up to 8 hours) |
| **Gateway** | Convert APIs/Lambda to agent tools, MCP support |
| **Policy** | Natural language → Cedar access policies |
| **Memory** | Persistent context across interactions |
| **Identity** | Agent IAM and OAuth delegation |
| **Evaluations** | Real-time quality scoring |
| **Observability** | CloudWatch dashboards + OpenTelemetry |
| **Code Interpreter** | Secure multi-language execution |
| **Browser** | Serverless browser for web tasks |

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    AgentCore Platform                       │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                    Gateway                           │   │
│  │         (APIs → Tools, MCP Server Support)          │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                    Runtime                           │   │
│  │         (Serverless, 8hr sessions, isolation)        │   │
│  │                                                      │   │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐    │   │
│  │  │ LangGraph  │  │  Strands   │  │   Custom   │    │   │
│  │  │   Agent    │  │   Agent    │  │   Agent    │    │   │
│  │  └────────────┘  └────────────┘  └────────────┘    │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                 │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐          │
│  │   Memory    │ │  Identity   │ │   Policy    │          │
│  └─────────────┘ └─────────────┘ └─────────────┘          │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐          │
│  │Observability│ │ Evaluations │ │Code Interp. │          │
│  └─────────────┘ └─────────────┘ └─────────────┘          │
└─────────────────────────────────────────────────────────────┘
```

### Gateway: MCP Support

AgentCore Gateway supports MCP servers:

```python
# Configure MCP servers in Gateway
gateway_config = {
    "tools": [
        {
            "type": "mcp",
            "server": "mcp/github",
            "config": {
                "token": "${secrets.GITHUB_TOKEN}"
            }
        },
        {
            "type": "mcp",
            "server": "mcp/postgres",
            "config": {
                "connectionString": "${secrets.DATABASE_URL}"
            }
        }
    ]
}
```

### Runtime: Deploy Any Framework

```python
# Deploy a LangGraph agent to AgentCore Runtime
from langgraph.graph import StateGraph
from agentcore import AgentCoreRuntime

# Your LangGraph agent
graph = StateGraph(...)
agent = graph.compile()

# Deploy to AgentCore
runtime = AgentCoreRuntime()
deployment = runtime.deploy(
    agent=agent,
    config={
        "session_timeout": 28800,  # 8 hours
        "memory": "agentcore-memory",
        "identity": "agentcore-identity"
    }
)
```

---

## Strands Agents

### Overview

| Attribute | Value |
|-----------|-------|
| **Type** | Open-Source SDK |
| **Languages** | Python, TypeScript |
| **Documentation** | https://strandsagents.com |
| **GitHub** | https://github.com/strands-agents |

### What is Strands?

Strands Agents is AWS's open-source agent framework. It's model-driven (LLM plans and orchestrates), provider-agnostic, and has first-class A2A protocol support.

### Key Features

| Feature | Description |
|---------|-------------|
| **Model-Driven** | LLM reasoning for orchestration |
| **Provider Agnostic** | Bedrock, OpenAI, Anthropic, Ollama |
| **A2A Protocol** | Native agent-to-agent communication |
| **MCP Tools** | Full MCP integration |
| **Multi-Agent** | Handoffs, swarms, graphs |
| **AgentCore Ready** | First-class AgentCore deployment |

### Basic Agent

```python
from strands import Agent

# Simple agent with tools
agent = Agent(
    name="researcher",
    model="anthropic.claude-3-sonnet-20240229-v1:0",
    system_prompt="You are a research assistant.",
    tools=[search_web, read_file, write_file]
)

# Run agent
result = agent("Research the latest AI agent frameworks")
print(result.content)
```

### MCP Tools

```python
from strands import Agent
from strands.tools.mcp import MCPClient

# Connect to MCP servers
github_mcp = MCPClient("mcp/github")
postgres_mcp = MCPClient("mcp/postgres")

agent = Agent(
    name="developer",
    tools=[
        *github_mcp.tools,
        *postgres_mcp.tools
    ]
)
```

### A2A Protocol

```python
from strands import Agent
from strands.multiagent.a2a import A2AServer, A2AClient

# Expose agent via A2A
server = A2AServer(
    agent=Agent(name="code-reviewer", ...),
    port=8080
)
server.start()

# Connect to A2A agents
client = A2AClient("https://agents.example.com/code-reviewer")
result = await client.send_task(
    skill_id="review-code",
    input={"text": code}
)
```

### Multi-Agent Patterns

#### Swarm

```python
from strands import Agent
from strands.multiagent import Swarm

# Create specialized agents
researcher = Agent(name="researcher", ...)
writer = Agent(name="writer", ...)
editor = Agent(name="editor", ...)

# Swarm with dynamic handoffs
swarm = Swarm(
    agents=[researcher, writer, editor],
    handoff_strategy="model_decision"
)

result = swarm("Write a blog post about AI agents")
```

#### Graph

```python
from strands.multiagent import Graph

# Define agent workflow
graph = Graph()
graph.add_node("research", researcher)
graph.add_node("write", writer)
graph.add_node("review", editor)

graph.add_edge("research", "write")
graph.add_edge("write", "review")
graph.add_conditional_edge("review", 
    condition=lambda x: "approved" if x.approved else "write"
)

result = graph.run("Create a technical report")
```

### Deploy to AgentCore

```python
from strands import Agent
from strands.deploy import AgentCoreDeployment

agent = Agent(name="production-agent", ...)

# Deploy to AgentCore
deployment = AgentCoreDeployment(
    agent=agent,
    runtime_config={
        "memory": True,
        "observability": True
    }
)
deployment.deploy()
```

---

## Comparison

| Feature | Bedrock Agents | AgentCore | Strands |
|---------|---------------|-----------|---------|
| **Type** | Managed Service | Infrastructure | SDK |
| **Framework Lock-in** | Yes | No | No |
| **Code Required** | Minimal | Varies | Yes |
| **A2A Support** | No | Via Gateway | Native |
| **MCP Support** | Indirect | Gateway | Native |
| **Multi-Agent** | Built-in | Depends on framework | Built-in |
| **Self-Hosted** | No | No | Yes |

---

## When to Use What

| Scenario | Recommendation |
|----------|----------------|
| Quick prototyping, no code | Bedrock Agents |
| Production, any framework | AgentCore |
| Python/TS code-first | Strands |
| Need A2A protocol | Strands |
| Maximum flexibility | Strands + AgentCore |

---

## AgentPod Integration

### Relevance

AWS agent offerings are highly relevant for AgentPod:
1. AgentPod uses Docker containers (similar to AgentCore Runtime)
2. MCP Gateway aligns with AgentPod's tool integration needs
3. Strands' A2A support matches multi-agent requirements

### Integration Path

1. **Evaluate AgentCore Gateway** for MCP server management
2. **Consider Strands** for agent development within sandboxes
3. **Monitor AgentCore** for potential runtime deployment

---

## Resources

- **Bedrock Agents:** https://aws.amazon.com/bedrock/agents/
- **AgentCore:** https://aws.amazon.com/bedrock/agentcore/
- **Strands:** https://strandsagents.com
- **Strands GitHub:** https://github.com/strands-agents

---

## Related Documentation

- [Google ADK](./google-adk.md) - Google's agent framework
- [MCP Protocol](../protocols/mcp.md) - Tool integration
- [A2A Protocol](../protocols/a2a.md) - Agent communication

---

*Part of AgentPod Multi-Agent Ecosystem Research*
