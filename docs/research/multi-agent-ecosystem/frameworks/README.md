# Multi-Agent Frameworks Overview

> **Version:** 1.0.0  
> **Last Updated:** January 5, 2026  
> **Status:** Active Research

---

## Overview

This section covers frameworks for building multi-agent AI systems, including both enterprise platforms and open-source options.

---

## Framework Categories

### Enterprise Cloud Platforms

Full-stack agent platforms from cloud providers:

| Framework | Provider | Type | Documentation |
|-----------|----------|------|---------------|
| [Cloudflare Agents](./cloudflare-agents.md) | Cloudflare | Full SDK + Runtime | Edge-native agents |
| [AWS Agents](./aws-agents.md) | Amazon | Managed + Open Source | Bedrock, AgentCore, Strands |
| [Google ADK](./google-adk.md) | Google | Open Source | Agent Development Kit |
| [Microsoft Agents](./microsoft-agents.md) | Microsoft | Open Source + Managed | Agent Framework, Foundry |
| [Vercel AI SDK](./vercel-ai-sdk.md) | Vercel | SDK | TypeScript-first AI SDK |

### Open-Source Frameworks

Community and vendor-backed open-source options:

| Framework | Maintainer | Documentation |
|-----------|------------|---------------|
| LangGraph | LangChain | [Open Source](./open-source.md#langgraph) |
| AutoGen (AG2) | Microsoft → Community | [Open Source](./open-source.md#autogen-ag2) |
| CrewAI | CrewAI | [Open Source](./open-source.md#crewai) |
| Semantic Kernel | Microsoft | [Open Source](./open-source.md#semantic-kernel) |
| OpenAI Swarm | OpenAI | [Open Source](./open-source.md#openai-swarm) |

---

## Framework Comparison Matrix

### Feature Comparison

| Framework | Language | Multi-Agent | MCP | A2A | Streaming | Memory |
|-----------|----------|-------------|-----|-----|-----------|--------|
| **Cloudflare Agents** | TS/JS | ✅ | ✅ | ❌ | ✅ | ✅ Built-in |
| **AWS Bedrock Agents** | Any | ✅ | ✅ | ❌ | ✅ | ✅ Built-in |
| **Strands Agents** | Python/TS | ✅ | ✅ | ✅ | ✅ | ✅ Pluggable |
| **Google ADK** | Multi | ✅ | ✅ | ✅ | ✅ | ✅ Sessions |
| **Microsoft Agent Framework** | C#/Python | ✅ | ✅ | ❌ | ✅ | ✅ |
| **Vercel AI SDK** | TypeScript | ⚠️ Limited | ✅ | ❌ | ✅ | ⚠️ Manual |
| **LangGraph** | Python/TS | ✅ | ✅ | ❌ | ✅ | ✅ Checkpoints |
| **AutoGen (AG2)** | Python | ✅ | ✅ | ❌ | ✅ | ✅ |
| **CrewAI** | Python | ✅ | ✅ | ❌ | ✅ | ✅ |

### Deployment Options

| Framework | Self-Hosted | Cloud Managed | Edge | Serverless |
|-----------|-------------|---------------|------|------------|
| **Cloudflare Agents** | ❌ | ✅ | ✅ | ✅ |
| **AWS Bedrock Agents** | ❌ | ✅ | ❌ | ✅ |
| **AWS AgentCore** | ❌ | ✅ | ❌ | ✅ |
| **Strands Agents** | ✅ | ✅ (AgentCore) | ❌ | ✅ |
| **Google ADK** | ✅ | ✅ (Agent Engine) | ❌ | ✅ |
| **Microsoft** | ✅ | ✅ (Azure) | ❌ | ✅ |
| **Vercel AI SDK** | ✅ | ✅ (Vercel) | ✅ | ✅ |
| **LangGraph** | ✅ | ✅ (LangGraph Cloud) | ❌ | ✅ |
| **AutoGen** | ✅ | ❌ | ❌ | ⚠️ |
| **CrewAI** | ✅ | ✅ (CrewAI+) | ❌ | ⚠️ |

### Model Support

| Framework | OpenAI | Anthropic | Google | AWS Bedrock | Local/Ollama |
|-----------|--------|-----------|--------|-------------|--------------|
| **Cloudflare Agents** | ✅ | ✅ | ✅ | ❌ | ❌ |
| **AWS Bedrock Agents** | ❌ | ✅ | ❌ | ✅ | ❌ |
| **Strands Agents** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Google ADK** | ✅ | ✅ | ✅ | ❌ | ✅ |
| **Microsoft** | ✅ | ✅ | ✅ | ❌ | ✅ |
| **Vercel AI SDK** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **LangGraph** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **AutoGen** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **CrewAI** | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## Selection Guide

### Choose by Use Case

| Use Case | Recommended Framework | Why |
|----------|----------------------|-----|
| **Edge/CDN deployment** | Cloudflare Agents | Only option for edge compute |
| **AWS-native enterprise** | Strands + AgentCore | Best AWS integration |
| **Multi-cloud enterprise** | Google ADK | Model/deployment agnostic |
| **TypeScript-first** | Vercel AI SDK | Best DX for TS developers |
| **Complex workflows** | LangGraph | Most flexible graph-based |
| **Quick prototyping** | CrewAI | Simplest role-based API |
| **Research/academia** | AutoGen (AG2) | Strong research backing |
| **Microsoft ecosystem** | Agent Framework | Azure integration |

### Choose by Team Skills

| Team Background | Recommended Framework |
|-----------------|----------------------|
| Python developers | LangGraph, CrewAI, Strands |
| TypeScript developers | Vercel AI SDK, Cloudflare Agents |
| Java/Go developers | Google ADK |
| C#/.NET developers | Microsoft Agent Framework |
| DevOps/infra focused | AWS AgentCore (any framework) |

### Choose by Constraints

| Constraint | Recommended Framework |
|------------|----------------------|
| Must run on AWS | Strands + AgentCore |
| Must run on edge | Cloudflare Agents |
| Must be self-hosted | LangGraph, AutoGen, Google ADK |
| Must support A2A | Strands, Google ADK |
| Must minimize cost | Open source (LangGraph, CrewAI) |

---

## Architecture Patterns

### 1. Single Agent + Tools

Simplest pattern - one agent with MCP tools.

```
┌──────────────┐     MCP     ┌──────────────┐
│    Agent     │◄───────────►│    Tools     │
└──────────────┘             └──────────────┘
```

**Best for:** Simple automation tasks
**Frameworks:** Any framework works

### 2. Supervisor + Workers

One coordinator delegates to specialists.

```
        ┌──────────────────────┐
        │   Supervisor Agent   │
        └──────────────────────┘
                   │
    ┌──────────────┼──────────────┐
    ▼              ▼              ▼
┌────────┐    ┌────────┐    ┌────────┐
│Worker A│    │Worker B│    │Worker C│
└────────┘    └────────┘    └────────┘
```

**Best for:** Task decomposition, parallel work
**Frameworks:** Strands, LangGraph, CrewAI

### 3. Sequential Pipeline

Tasks flow through agents in order.

```
┌─────────┐     ┌─────────┐     ┌─────────┐
│ Agent A │────►│ Agent B │────►│ Agent C │
└─────────┘     └─────────┘     └─────────┘
```

**Best for:** Document processing, code review pipelines
**Frameworks:** Google ADK, LangGraph

### 4. Swarm / Dynamic

Agents dynamically hand off based on context.

```
┌─────────┐ ◄─────► ┌─────────┐
│ Agent A │         │ Agent B │
└─────────┘         └─────────┘
     ▲                   ▲
     └───────┬───────────┘
             ▼
        ┌─────────┐
        │ Agent C │
        └─────────┘
```

**Best for:** Complex, adaptive workflows
**Frameworks:** OpenAI Swarm, Strands Swarm, LangGraph

### 5. Federated (A2A)

Independent agents discover and collaborate.

```
┌─────────────────┐         ┌─────────────────┐
│  Organization A │         │  Organization B │
│  ┌───────────┐  │   A2A   │  ┌───────────┐  │
│  │  Agent X  │◄─┼────────►┼─►│  Agent Y  │  │
│  └───────────┘  │         │  └───────────┘  │
└─────────────────┘         └─────────────────┘
```

**Best for:** Cross-organization workflows
**Frameworks:** Google ADK, Strands (A2A support required)

---

## Cost Considerations

### Managed Services

| Service | Pricing Model | Typical Cost |
|---------|---------------|--------------|
| AWS AgentCore | Per session + compute | $0.001/session + compute |
| Cloudflare Agents | Per request + duration | Usage-based |
| Google Agent Engine | Per invocation | Usage-based |
| LangGraph Cloud | Per trace | $0.01/trace |

### Self-Hosted

| Component | Cost Factors |
|-----------|--------------|
| Compute | Depends on usage and model |
| LLM API calls | Primary cost driver |
| Storage | Minimal for most use cases |
| Memory/State | Depends on session volume |

### Cost Optimization Tips

1. **Use smaller models** for simple tasks
2. **Cache LLM responses** where possible
3. **Batch operations** to reduce API calls
4. **Use local models** for development/testing

---

## Documentation Index

| Document | Description |
|----------|-------------|
| [Cloudflare Agents](./cloudflare-agents.md) | Edge-native agent SDK |
| [AWS Agents](./aws-agents.md) | Bedrock Agents, AgentCore, Strands |
| [Google ADK](./google-adk.md) | Agent Development Kit |
| [Microsoft Agents](./microsoft-agents.md) | Agent Framework, Azure |
| [Vercel AI SDK](./vercel-ai-sdk.md) | TypeScript AI SDK |
| [Open Source](./open-source.md) | LangGraph, AutoGen, CrewAI, etc. |

---

## Related Documentation

- [Protocol Overview](../README.md) - Protocol layer documentation
- [Infrastructure](../infrastructure/) - Supporting infrastructure
- [Recommendations](../recommendations.md) - AgentPod-specific guidance

---

*Part of AgentPod Multi-Agent Ecosystem Research*
