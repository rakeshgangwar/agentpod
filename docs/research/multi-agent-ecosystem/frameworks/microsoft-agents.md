# Microsoft Agent Offerings

> **Version:** 1.0.0  
> **Last Updated:** January 5, 2026  
> **Status:** Production

---

## Overview

Microsoft offers multiple agent-related products:

| Product | Type | Purpose |
|---------|------|---------|
| **Microsoft Agent Framework** | Open-Source SDK | Unified agent development |
| **Azure AI Foundry Agent Service** | Managed Service | Host and manage agents |
| **Semantic Kernel** | SDK | LLM orchestration layer |

---

## Microsoft Agent Framework

### Overview

| Attribute | Value |
|-----------|-------|
| **Type** | Open-Source Framework |
| **Languages** | Python, C# |
| **Documentation** | https://learn.microsoft.com/agent-framework |
| **GitHub** | https://github.com/microsoft/agent-framework |

### What is Agent Framework?

Microsoft Agent Framework is the unified successor to AutoGen and integrates with Semantic Kernel. It provides a production-ready foundation for building agentic AI solutions.

### Key Features

- **Migration Paths** - From AutoGen and Semantic Kernel
- **Multi-Language** - Python and C# support
- **Azure Integration** - First-class Azure AI support
- **Production Ready** - Enterprise patterns built-in

### Migration from AutoGen

```python
# Before (AutoGen)
from autogen import AssistantAgent, UserProxyAgent

assistant = AssistantAgent("assistant", llm_config={...})
user = UserProxyAgent("user")
user.initiate_chat(assistant, message="Hello")

# After (Agent Framework)
from agent_framework import Agent, AgentRuntime

agent = Agent(
    name="assistant",
    model_config={...}
)
runtime = AgentRuntime(agents=[agent])
result = runtime.run("Hello")
```

### Migration from Semantic Kernel

```python
# Before (Semantic Kernel)
import semantic_kernel as sk
kernel = sk.Kernel()
# ... setup plugins and planners

# After (Agent Framework)
from agent_framework import Agent
from agent_framework.plugins import SemanticKernelPlugin

agent = Agent(
    name="sk-agent",
    plugins=[SemanticKernelPlugin(kernel)]  # Reuse SK plugins
)
```

---

## Azure AI Foundry Agent Service

### Overview

| Attribute | Value |
|-----------|-------|
| **Type** | Managed Service |
| **Documentation** | https://learn.microsoft.com/azure/ai-services/agents |
| **Portal** | https://ai.azure.com |

### What is Agent Service?

Azure AI Foundry Agent Service provides infrastructure to orchestrate and host AI agents that automate business processes.

### Key Features

| Feature | Description |
|---------|-------------|
| **Hosting** | Managed agent runtime |
| **Orchestration** | Multi-agent coordination |
| **Tools** | Azure AI Search, Speech, Vision |
| **Evaluation** | Built-in quality assessment |
| **Monitoring** | Azure Monitor integration |

### Creating an Agent

```python
from azure.ai.agents import AgentClient
from azure.identity import DefaultAzureCredential

# Connect to Agent Service
client = AgentClient(
    endpoint="https://myproject.cognitiveservices.azure.com",
    credential=DefaultAzureCredential()
)

# Create agent
agent = client.agents.create(
    name="customer-support",
    instructions="You are a helpful customer support agent.",
    model="gpt-4",
    tools=[
        {"type": "code_interpreter"},
        {"type": "file_search"}
    ]
)

# Create thread and run
thread = client.threads.create()
message = client.messages.create(
    thread_id=thread.id,
    role="user",
    content="I need help with my order"
)
run = client.runs.create(
    thread_id=thread.id,
    agent_id=agent.id
)
```

### Azure AI Search Integration

```python
from azure.ai.agents.tools import AzureAISearchTool

# Create search tool
search_tool = AzureAISearchTool(
    index_name="products",
    endpoint="https://search.windows.net"
)

agent = client.agents.create(
    name="product-advisor",
    tools=[search_tool.to_dict()]
)
```

---

## Semantic Kernel

### Overview

| Attribute | Value |
|-----------|-------|
| **Type** | SDK / Orchestration Layer |
| **Languages** | C#, Python, Java |
| **GitHub** | https://github.com/microsoft/semantic-kernel |
| **Documentation** | https://learn.microsoft.com/semantic-kernel |

### What is Semantic Kernel?

Semantic Kernel is Microsoft's SDK for integrating LLMs into applications. It provides plugins, planners, and memory abstractions.

**Note:** Semantic Kernel is being consolidated into Agent Framework for agent scenarios, but remains the recommended SDK for non-agentic LLM integration.

### Key Concepts

```
┌─────────────────────────────────────────────────────────────┐
│                    Semantic Kernel                          │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                      Kernel                          │   │
│  │            (Orchestration Engine)                    │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                 │
│           ┌───────────────┼───────────────┐                │
│           ▼               ▼               ▼                │
│    ┌──────────┐    ┌──────────┐    ┌──────────┐          │
│    │ Plugins  │    │ Planners │    │  Memory  │          │
│    │(Functions)│    │(Task Plan)│    │(Embeddings)│        │
│    └──────────┘    └──────────┘    └──────────┘          │
│           │               │               │                │
│           └───────────────┼───────────────┘                │
│                           ▼                                 │
│    ┌─────────────────────────────────────────────────────┐ │
│    │                  AI Services                        │ │
│    │  ┌─────────┐ ┌─────────┐ ┌─────────┐              │ │
│    │  │ OpenAI  │ │  Azure  │ │ Hugging │              │ │
│    │  │         │ │ OpenAI  │ │  Face   │              │ │
│    │  └─────────┘ └─────────┘ └─────────┘              │ │
│    └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Plugins

```python
import semantic_kernel as sk
from semantic_kernel.functions import kernel_function

class EmailPlugin:
    @kernel_function(description="Send an email")
    def send_email(self, to: str, subject: str, body: str) -> str:
        # Send email logic
        return f"Email sent to {to}"
    
    @kernel_function(description="Read recent emails")
    def read_emails(self, count: int = 10) -> str:
        # Read emails logic
        return "Recent emails..."

# Register plugin
kernel = sk.Kernel()
kernel.add_plugin(EmailPlugin(), "email")
```

### Planners

```python
from semantic_kernel.planners import ActionPlanner

# Create planner
planner = ActionPlanner(kernel)

# Generate plan
plan = await planner.create_plan(
    "Send an email to john@example.com about the meeting"
)

# Execute plan
result = await plan.invoke()
```

### Memory

```python
from semantic_kernel.memory import SemanticTextMemory
from semantic_kernel.connectors.memory import ChromaMemoryStore

# Create memory
memory = SemanticTextMemory(
    storage=ChromaMemoryStore(),
    embeddings_generator=embeddings_service
)

# Save information
await memory.save_information(
    collection="documents",
    id="doc-1",
    text="The quarterly report shows 20% growth."
)

# Recall information
results = await memory.search(
    collection="documents",
    query="quarterly performance"
)
```

---

## Comparison

| Feature | Agent Framework | Agent Service | Semantic Kernel |
|---------|----------------|---------------|-----------------|
| **Type** | Open Source | Managed | Open Source |
| **Purpose** | Agent development | Agent hosting | LLM orchestration |
| **Multi-Agent** | ✅ | ✅ | ⚠️ Limited |
| **MCP Support** | ✅ | ✅ | ✅ |
| **Self-Hosted** | ✅ | ❌ | ✅ |
| **Azure Integration** | ✅ | ✅ Native | ✅ |

---

## When to Use What

| Scenario | Recommendation |
|----------|----------------|
| Building new agent applications | Agent Framework |
| Hosting agents in Azure | Agent Service |
| Adding LLM features to existing apps | Semantic Kernel |
| Migrating from AutoGen | Agent Framework |
| C#/.NET development | Any (all have C# support) |

---

## AgentPod Integration

### Relevance

Microsoft's offerings are relevant for:
1. C#/.NET backend development
2. Azure cloud deployment
3. Enterprise patterns and compliance

### Considerations

- Agent Framework provides good patterns
- Semantic Kernel plugins could be reused
- Agent Service is Azure-locked

---

## Resources

- **Agent Framework:** https://learn.microsoft.com/agent-framework
- **Agent Service:** https://learn.microsoft.com/azure/ai-services/agents
- **Semantic Kernel:** https://learn.microsoft.com/semantic-kernel
- **GitHub (Agent Framework):** https://github.com/microsoft/agent-framework
- **GitHub (Semantic Kernel):** https://github.com/microsoft/semantic-kernel

---

## Related Documentation

- [AWS Agents](./aws-agents.md) - AWS agent offerings
- [Google ADK](./google-adk.md) - Google's agent framework
- [Open Source Frameworks](./open-source.md) - Community frameworks

---

*Part of AgentPod Multi-Agent Ecosystem Research*
