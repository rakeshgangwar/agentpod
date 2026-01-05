# Open-Source Multi-Agent Frameworks

> **Version:** 1.0.0  
> **Last Updated:** January 5, 2026  
> **Status:** Active Research

---

## Overview

This document covers community and vendor-backed open-source frameworks for building multi-agent systems.

---

## Framework Comparison

| Framework | Maintainer | Language | Stars | MCP | Multi-Agent |
|-----------|------------|----------|-------|-----|-------------|
| **LangGraph** | LangChain | Python/TS | 10K+ | ✅ | ✅ |
| **AutoGen (AG2)** | Community | Python | 35K+ | ✅ | ✅ |
| **CrewAI** | CrewAI | Python | 25K+ | ✅ | ✅ |
| **Semantic Kernel** | Microsoft | C#/Python | 22K+ | ✅ | ⚠️ |
| **OpenAI Swarm** | OpenAI | Python | 20K+ | ❌ | ✅ |
| **Agency Swarm** | Community | Python | 3K+ | ❌ | ✅ |
| **MetaGPT** | DeepWisdom | Python | 45K+ | ❌ | ✅ |
| **goose** | Block/AAIF | Rust | 5K+ | ✅ | ❌ |

---

## LangGraph

### Overview

| Attribute | Value |
|-----------|-------|
| **Maintainer** | LangChain |
| **Language** | Python, TypeScript |
| **GitHub** | https://github.com/langchain-ai/langgraph |
| **Documentation** | https://langchain-ai.github.io/langgraph/ |

### What is LangGraph?

LangGraph is a graph-based framework for building stateful, multi-actor applications with LLMs. It extends LangChain with cyclic graph support and built-in persistence.

### Key Features

- **Graph-Based**: Define agent workflows as state machines
- **Cyclic Support**: Handle loops and iterative refinement
- **Checkpointing**: Built-in state persistence
- **Streaming**: First-class streaming support
- **Human-in-the-Loop**: Interrupt and resume workflows

### Example

```python
from langgraph.graph import StateGraph, END
from typing import TypedDict

class AgentState(TypedDict):
    messages: list
    next_step: str

# Define nodes
def researcher(state: AgentState):
    # Research logic
    return {"messages": state["messages"] + ["Research complete"]}

def writer(state: AgentState):
    # Writing logic
    return {"messages": state["messages"] + ["Draft complete"]}

def reviewer(state: AgentState):
    # Review logic
    return {"messages": state["messages"] + ["Review complete"]}

# Build graph
graph = StateGraph(AgentState)
graph.add_node("researcher", researcher)
graph.add_node("writer", writer)
graph.add_node("reviewer", reviewer)

graph.add_edge("researcher", "writer")
graph.add_edge("writer", "reviewer")
graph.add_conditional_edges(
    "reviewer",
    lambda state: "writer" if "needs revision" in state["messages"][-1] else END
)

graph.set_entry_point("researcher")
agent = graph.compile()

# Run
result = agent.invoke({"messages": [], "next_step": "research"})
```

### When to Use

- Complex workflows with cycles
- State persistence requirements
- Integration with LangChain ecosystem

---

## AutoGen (AG2)

### Overview

| Attribute | Value |
|-----------|-------|
| **Maintainer** | Community (forked from Microsoft) |
| **Language** | Python |
| **GitHub** | https://github.com/ag2ai/ag2 |
| **Documentation** | https://ag2ai.github.io/ag2/ |

### What is AutoGen?

AutoGen (now AG2 after community fork) is a framework for building multi-agent conversational systems. Agents communicate through natural language messages.

### Key Features

- **Conversation-Based**: Agents communicate via messages
- **Code Execution**: Built-in secure code execution
- **Group Chat**: Multiple agents in conversation
- **Human Proxy**: Human-in-the-loop patterns
- **Flexible Roles**: Assistant, user proxy, custom agents

### Example

```python
from autogen import AssistantAgent, UserProxyAgent

# Create agents
assistant = AssistantAgent(
    name="assistant",
    llm_config={"model": "gpt-4"}
)

user_proxy = UserProxyAgent(
    name="user",
    human_input_mode="NEVER",
    code_execution_config={"work_dir": "workspace"}
)

# Start conversation
user_proxy.initiate_chat(
    assistant,
    message="Write a Python function to calculate factorial"
)
```

### Group Chat

```python
from autogen import GroupChat, GroupChatManager

# Multiple agents
coder = AssistantAgent(name="coder", ...)
reviewer = AssistantAgent(name="reviewer", ...)
tester = AssistantAgent(name="tester", ...)

# Group chat
group_chat = GroupChat(
    agents=[coder, reviewer, tester],
    messages=[],
    max_round=10
)

manager = GroupChatManager(groupchat=group_chat)
user_proxy.initiate_chat(manager, message="Build a calculator")
```

### When to Use

- Natural conversation between agents
- Code generation and execution
- Research and academic projects

---

## CrewAI

### Overview

| Attribute | Value |
|-----------|-------|
| **Maintainer** | CrewAI |
| **Language** | Python |
| **GitHub** | https://github.com/crewAIInc/crewAI |
| **Documentation** | https://docs.crewai.com |

### What is CrewAI?

CrewAI is a framework for orchestrating role-playing AI agents. Each agent has a role, goal, and backstory, working together as a "crew."

### Key Features

- **Role-Based**: Agents defined by roles and backstories
- **Task-Oriented**: Clear task definitions
- **Process Types**: Sequential, hierarchical execution
- **Tool Integration**: Easy tool attachment
- **Simple API**: Minimal boilerplate

### Example

```python
from crewai import Agent, Task, Crew, Process

# Define agents
researcher = Agent(
    role="Senior Research Analyst",
    goal="Discover groundbreaking insights",
    backstory="Expert researcher with deep analytical skills",
    tools=[search_tool, scrape_tool]
)

writer = Agent(
    role="Technical Writer",
    goal="Create engaging content",
    backstory="Experienced writer specializing in tech topics"
)

# Define tasks
research_task = Task(
    description="Research AI agent frameworks",
    agent=researcher,
    expected_output="Comprehensive research report"
)

writing_task = Task(
    description="Write blog post from research",
    agent=writer,
    expected_output="Engaging blog post"
)

# Create crew
crew = Crew(
    agents=[researcher, writer],
    tasks=[research_task, writing_task],
    process=Process.sequential
)

# Run
result = crew.kickoff()
```

### When to Use

- Quick prototyping
- Role-based workflows
- Content creation pipelines

---

## Semantic Kernel

### Overview

| Attribute | Value |
|-----------|-------|
| **Maintainer** | Microsoft |
| **Language** | C#, Python, Java |
| **GitHub** | https://github.com/microsoft/semantic-kernel |
| **Documentation** | https://learn.microsoft.com/semantic-kernel |

### What is Semantic Kernel?

Semantic Kernel is Microsoft's SDK for integrating LLMs into applications. It provides plugins, planners, and memory for building AI features.

### Key Features

- **Plugins**: Reusable AI capabilities
- **Planners**: Automatic task decomposition
- **Memory**: Semantic memory with embeddings
- **Connectors**: Multiple LLM providers
- **Enterprise Ready**: Azure integration

### Example

```python
import semantic_kernel as sk
from semantic_kernel.connectors.ai.open_ai import OpenAIChatCompletion

# Create kernel
kernel = sk.Kernel()
kernel.add_service(OpenAIChatCompletion(
    service_id="chat",
    ai_model_id="gpt-4"
))

# Define function
@kernel.function
def summarize(text: str) -> str:
    """Summarize the given text."""
    return kernel.invoke_prompt(f"Summarize: {text}")

# Use
result = summarize("Long article text...")
```

### When to Use

- Microsoft/Azure ecosystem
- Enterprise applications
- C#/.NET development

---

## OpenAI Swarm

### Overview

| Attribute | Value |
|-----------|-------|
| **Maintainer** | OpenAI |
| **Language** | Python |
| **GitHub** | https://github.com/openai/swarm |
| **Status** | Experimental/Educational |

### What is Swarm?

Swarm is OpenAI's experimental framework demonstrating lightweight agent handoffs and routines. It's primarily educational.

### Key Features

- **Handoffs**: Agents transfer control
- **Routines**: Predefined instruction sets
- **Lightweight**: Minimal abstraction
- **Educational**: Learn agent patterns

### Example

```python
from swarm import Swarm, Agent

client = Swarm()

# Define agents
sales_agent = Agent(
    name="Sales Agent",
    instructions="Handle sales inquiries. Transfer to support for technical issues.",
    functions=[get_pricing, transfer_to_support]
)

support_agent = Agent(
    name="Support Agent",
    instructions="Handle technical support.",
    functions=[troubleshoot, check_status]
)

def transfer_to_support():
    return support_agent

# Run conversation
response = client.run(
    agent=sales_agent,
    messages=[{"role": "user", "content": "I have a technical problem"}]
)
```

### When to Use

- Learning agent patterns
- Simple handoff scenarios
- OpenAI-only applications

---

## MetaGPT

### Overview

| Attribute | Value |
|-----------|-------|
| **Maintainer** | DeepWisdom |
| **Language** | Python |
| **GitHub** | https://github.com/geekan/MetaGPT |
| **Documentation** | https://docs.deepwisdom.ai |

### What is MetaGPT?

MetaGPT simulates a software company with agents playing different roles (PM, Architect, Engineer) following standardized operating procedures (SOPs).

### Key Features

- **SOP-Based**: Structured operating procedures
- **Software Company**: PM, Architect, Engineer roles
- **Document Generation**: PRDs, designs, code
- **Complete Pipeline**: Idea to implementation

### Example

```python
from metagpt.roles import ProductManager, Architect, Engineer
from metagpt.team import Team

# Create company
company = Team()
company.hire([
    ProductManager(),
    Architect(),
    Engineer()
])

# Run project
company.run_project("Create a snake game")
```

### When to Use

- End-to-end software generation
- Research on agent collaboration
- Understanding team dynamics

---

## goose

### Overview

| Attribute | Value |
|-----------|-------|
| **Maintainer** | Block → AAIF |
| **Language** | Rust |
| **GitHub** | https://github.com/block/goose |
| **Status** | AAIF Project |

### What is goose?

goose is an autonomous coding agent that runs in the terminal. It's one of the first projects under AAIF governance.

### Key Features

- **Terminal-Native**: Runs in your terminal
- **MCP-First**: Native MCP tool integration
- **Autonomous**: Works independently
- **AAIF Governed**: Neutral governance

### Example

```bash
# Install
brew install goose

# Run
goose session start

# goose will autonomously work on your request
> Fix the failing tests in src/
```

### When to Use

- Terminal-based workflows
- Autonomous coding tasks
- MCP tool integration

---

## Selection Guide

| Use Case | Best Framework |
|----------|----------------|
| **Complex state machines** | LangGraph |
| **Conversational agents** | AutoGen (AG2) |
| **Quick prototypes** | CrewAI |
| **Enterprise C#/.NET** | Semantic Kernel |
| **Learning agent patterns** | OpenAI Swarm |
| **Full software generation** | MetaGPT |
| **Terminal coding** | goose |

---

## AgentPod Relevance

### Recommended for Integration

1. **LangGraph** - Most flexible, good for workflow builder
2. **CrewAI** - Simple API for role-based agents
3. **goose** - MCP-native, terminal integration

### Integration Example

```python
# Use LangGraph within AgentPod sandbox
from langgraph.graph import StateGraph
from agentpod.tools import sandbox_tools

# Create agent with AgentPod tools
graph = StateGraph(AgentState)
graph.add_node("executor", lambda s: execute_with_tools(s, sandbox_tools))
```

---

## Resources

- **LangGraph:** https://langchain-ai.github.io/langgraph/
- **AutoGen/AG2:** https://ag2ai.github.io/ag2/
- **CrewAI:** https://docs.crewai.com
- **Semantic Kernel:** https://learn.microsoft.com/semantic-kernel
- **OpenAI Swarm:** https://github.com/openai/swarm
- **MetaGPT:** https://docs.deepwisdom.ai
- **goose:** https://github.com/block/goose

---

*Part of AgentPod Multi-Agent Ecosystem Research*
