# AgentPod Agent Framework

**Version**: 1.0.0  
**Last Updated**: December 2025  
**Status**: Implementation Phase

---

## Overview

The AgentPod Agent Framework provides a personality-driven, team-based AI agent system inspired by:

- **[The Agentic Space](https://github.com/rakeshgangwar/The-Agentic-Space)** — Personality dimensions, behavioral traits, intelligence levels
- **[BuddhiMaan Framework](https://github.com/SuperJackfruitLabs/buddhimaan)** — Team structure, 108-agent taxonomy, workflow coordination
- **[oh-my-opencode](https://github.com/code-yeongyu/oh-my-opencode)** — Implementation patterns, prompt engineering, delegation strategies

This framework enables AgentPod to provide specialized AI assistance through distinct agent personalities organized into collaborative teams.

---

## Key Features

| Feature | Description |
|---------|-------------|
| **Personality-Driven** | Each agent has distinct expertise, communication style, and behavioral traits |
| **Team-Based** | Agents organized into squads (Development, Product, Operations, Security, Data) |
| **Hub-and-Spoke** | Central orchestrator coordinates all agent interactions |
| **Workflow Coordination** | Multi-agent workflows for complex tasks (PR Review, Incident Response) |
| **Prompt Engineering** | Personality expressed through carefully crafted system prompts |
| **Extensible** | Easy to add new agents, squads, and workflows |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    AgentPod Central                             │
│              (Hub Orchestrator)                                 │
│                                                                 │
│  • Intent Analysis → Classify user request                     │
│  • Team Routing → Match expertise to need                      │
│  • Personality Matching → Right agent for context              │
│  • Workflow Coordination → Multi-agent task execution          │
└─────────────────────────────────────────────────────────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         ▼                 ▼                 ▼
  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
  │ Development  │  │   Product    │  │  Operations  │
  │    Squad     │  │    Squad     │  │    Squad     │
  │              │  │              │  │              │
  │  • Kai       │  │  • Pete      │  │  • Olivia    │
  │  • Dana      │  │  • Spencer   │  │  • Nora      │
  │  • Alex      │  │  • River     │  │              │
  │  • Tess      │  │              │  │              │
  │  • Sam       │  │              │  │              │
  └──────────────┘  └──────────────┘  └──────────────┘
```

---

## Documentation Index

| Document | Description |
|----------|-------------|
| [Architecture](./architecture.md) | System design, integration points, data flow |
| [OpenCode Integration Plan](./opencode-integration-plan.md) | **NEW**: Native OpenCode agent integration strategy |
| [Personality Framework](./personality-framework.md) | Dimensions, traits, intelligence levels |
| [Team Structure](./team-structure.md) | Squads, tiers, agent relationships |
| [Agent Catalog](./agent-catalog.md) | Complete list of agents with specifications |
| [Workflows](./workflows.md) | Multi-agent coordination patterns |
| [Integration Guide](./integration-guide.md) | How to integrate with AgentPod |
| [Prompt Engineering](./prompt-engineering.md) | Guidelines for agent system prompts |

### Multi-Agent Ecosystem Research

For comprehensive research on agent protocols, frameworks, and industry standards, see:

| Document | Description |
|----------|-------------|
| [Multi-Agent Ecosystem](../research/multi-agent-ecosystem/) | Full research index |
| [MCP Protocol](../research/multi-agent-ecosystem/protocols/mcp.md) | Model Context Protocol (tool integration) |
| [A2A Protocol](../research/multi-agent-ecosystem/protocols/a2a.md) | Agent-to-Agent Protocol |
| [Framework Comparison](../research/multi-agent-ecosystem/frameworks/) | Cloudflare, AWS, Google, Microsoft, etc. |
| [Recommendations](../research/multi-agent-ecosystem/recommendations.md) | AgentPod-specific guidance |

---

## Quick Start

### Using Agents in Chat

When you interact with AgentPod, the central orchestrator automatically routes your request to the appropriate agent:

```
User: "Can you review this code for security issues?"

AgentPod Central: Routing to Kai (Code Review) + Sam (Security)

Kai: "I'll review the overall code quality..."
Sam: "I'll check for security vulnerabilities..."
```

### Agent Personalities in Action

**Kai (Code Reviewer)** - Technical, methodical, encouraging:
```
## Code Review: Authentication Handler

### Strengths ✅
- Good separation of concerns
- Proper error handling

### Issues 🔍

#### IMPORTANT
- Line 42: Password comparison should use constant-time comparison
  **Why**: Timing attacks can leak information
  **Fix**: Use `crypto.timingSafeEqual()` instead
```

**Dana (Debugger)** - Analytical, calm, evidence-driven:
```
## Bug Investigation: Login Failure

### Severity: P2 (High)
**Impact**: 15% of users affected

### Evidence
- Error logs: `401 Unauthorized at 14:23:45`
- Recent deploy: v2.3.1 at 14:00:00
- Git blame: `auth.ts` changed in this release

### Root Cause
Token validation regex was updated to stricter pattern,
breaking tokens with special characters.
```

---

## Package Structure

```
packages/agents/
├── src/
│   ├── core/                    # Framework (MIT licensed)
│   │   ├── personality.ts       # Personality types
│   │   ├── config.ts            # Agent configuration
│   │   ├── orchestrator.ts      # Routing & coordination
│   │   ├── workflows.ts         # Workflow definitions
│   │   └── index.ts
│   │
│   ├── library/                 # Agent definitions (IP)
│   │   ├── central/
│   │   │   └── agentpod-central.ts
│   │   ├── development/
│   │   │   ├── kai-coder.ts
│   │   │   ├── dana-debugger.ts
│   │   │   ├── alex-architect.ts
│   │   │   ├── tess-tester.ts
│   │   │   └── sam-security.ts
│   │   ├── product/
│   │   │   ├── pete-product.ts
│   │   │   ├── spencer-specs.ts
│   │   │   └── river-roadmap.ts
│   │   ├── operations/
│   │   │   ├── olivia-operations.ts
│   │   │   └── nora-notifier.ts
│   │   └── index.ts
│   │
│   └── index.ts                 # Public API
│
├── package.json
├── tsconfig.json
└── README.md
```

---

## Integration Points

| Component | Integration | Purpose |
|-----------|-------------|---------|
| **Management API** | `AgentOrchestratorService` | Route requests, execute agents |
| **PostgreSQL** | `agent_sessions`, `agent_metrics` | Track performance, learning |
| **OpenCode Containers** | Agent injection | Run agents in sandbox context |
| **Frontend** | Agent UI components | Display agent info, avatars |

---

## Roadmap

### Phase 1: Foundation (Current)
- [x] Personality framework design
- [x] Team structure architecture
- [ ] Core agent types
- [ ] 5 foundation agents (Kai, Dana, Alex, Pete, Olivia)
- [ ] Central orchestrator

### Phase 2: Expansion
- [ ] 10+ specialized agents
- [ ] 3 core workflows (PR Review, Incident Response, Feature Planning)
- [ ] Agent metrics & learning

### Phase 3: Advanced
- [ ] Custom agent creation UI
- [ ] Workflow builder
- [ ] Agent marketplace
- [ ] Team templates

---

## Design Principles

### 1. Personality Through Prompts
Agent personality is expressed entirely through system prompts. No special runtime handling required.

### 2. Hub-and-Spoke Coordination
Central orchestrator prevents chaos. All requests route through AgentPod Central.

### 3. Delegation Over Autonomy
Agents delegate to specialists rather than trying to handle everything themselves.

### 4. Evidence-Based Responses
Agents must provide evidence (code references, logs, data) for their recommendations.

### 5. Fail Gracefully
If uncertain, agents ask for clarification. If failing, they escalate.

---

## Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for guidelines on:
- Adding new agents
- Creating workflows
- Extending the personality framework

---

## License

- **Core Framework** (`packages/agents/src/core/`): MIT License
- **Agent Library** (`packages/agents/src/library/`): Proprietary (AgentPod IP)

---

*Built for AgentPod — The Portable Command Center*
