# AgentPod Protocol & Framework Recommendations

> **Version:** 1.0.0  
> **Last Updated:** January 5, 2026  
> **Status:** Strategic Guidance

---

## Executive Summary

Based on our research of the multi-agent ecosystem, here are specific recommendations for AgentPod's architecture and technology choices.

---

## Current AgentPod Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    AgentPod Current State                   │
│                                                             │
│  Frontend (Tauri + SvelteKit)                              │
│       └── assistant-ui (React) for chat                    │
│                                                             │
│  Backend                                                    │
│       ├── Management API (Bun + Hono)                      │
│       └── Docker Sandboxes                                 │
│            ├── ACP Gateway (Agent Client Protocol)         │
│            ├── OpenCode (AI Agent)                         │
│            └── Development Tools                           │
│                                                             │
│  Infrastructure                                             │
│       ├── Cloudflare Workflows (Durable execution)         │
│       ├── PostgreSQL (Data persistence)                    │
│       └── Traefik (Reverse proxy)                          │
└─────────────────────────────────────────────────────────────┘
```

---

## Protocol Recommendations

### Priority 1: MCP (Model Context Protocol)

**Recommendation:** ADOPT

| Aspect | Recommendation |
|--------|----------------|
| **Priority** | High |
| **Timeline** | Immediate |
| **Effort** | Medium |

**Rationale:**
- Industry standard for tool integration
- 240+ servers available in Docker Hub
- All major frameworks support MCP
- AAIF governance ensures stability

**Implementation:**
1. Add MCP client to sandbox containers
2. Create MCP server selector in UI
3. Integrate with Docker MCP catalog
4. Build AgentPod-specific MCP servers

```
┌─────────────────────────────────────────────────────────────┐
│                   Recommended MCP Integration               │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                   AgentPod Sandbox                   │   │
│  │  ┌───────────────┐  ┌───────────────┐              │   │
│  │  │   OpenCode    │  │  MCP Client   │              │   │
│  │  │    Agent      │──│               │              │   │
│  │  └───────────────┘  └───────┬───────┘              │   │
│  └─────────────────────────────┼────────────────────────┘   │
│                                │                            │
│              ┌─────────────────┼─────────────────┐         │
│              ▼                 ▼                 ▼         │
│       ┌──────────┐      ┌──────────┐      ┌──────────┐   │
│       │mcp/github│      │mcp/postgres│     │mcp/custom│   │
│       └──────────┘      └──────────┘      └──────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

### Priority 2: A2A (Agent-to-Agent Protocol)

**Recommendation:** EVALUATE FOR FUTURE

| Aspect | Recommendation |
|--------|----------------|
| **Priority** | Medium |
| **Timeline** | 6-12 months |
| **Effort** | High |

**Rationale:**
- Needed for true multi-agent scenarios
- Growing adoption (Google ADK, Strands)
- Enables cross-sandbox agent communication

**Wait Because:**
- Current single-agent model works well
- A2A adds complexity
- Protocol still evolving

**Future Implementation:**
1. Expose internal agents via A2A
2. Enable cross-sandbox communication
3. Connect to external A2A agents

---

### Priority 3: AG-UI (Agent User Interaction)

**Recommendation:** MONITOR

| Aspect | Recommendation |
|--------|----------------|
| **Priority** | Low-Medium |
| **Timeline** | When assistant-ui lacks features |
| **Effort** | Medium |

**Rationale:**
- Current assistant-ui covers needs
- AG-UI provides standardized events
- Could improve tool call visualization

**Consider When:**
- Need richer tool visualization
- Want portable UI components
- Integrating multiple agent frameworks

---

### Priority 4: AGENTS.md

**Recommendation:** ALREADY SUPPORTED

| Aspect | Status |
|--------|--------|
| **Priority** | Already done |
| **Status** | OpenCode reads AGENTS.md |

**Enhancement:**
- Add AGENTS.md templates for common projects
- Document in onboarding flow
- Provide validation/linting

---

## Framework Recommendations

### For In-Sandbox Agent Development

**Recommendation:** Support Multiple (Don't Lock In)

| Framework | Recommendation | Rationale |
|-----------|----------------|-----------|
| **OpenCode** | Keep as default | Already integrated, works well |
| **LangGraph** | Support as option | Popular, graph-based workflows |
| **CrewAI** | Support as option | Simple role-based agents |
| **Strands** | Evaluate | A2A support, good patterns |

**Implementation:**
- Keep OpenCode as default
- Allow users to install alternative frameworks
- Don't build framework lock-in

---

### For Orchestration Layer

**Recommendation:** Cloudflare Workflows (Already Using)

| Aspect | Status |
|--------|--------|
| **Current** | Already integrated |
| **Status** | Keep and expand |

**Rationale:**
- Already integrated
- Durable execution
- Good for long-running tasks

**Alternatives Considered:**
- Temporal: More complex, self-hosted
- Inngest: Good but less mature
- AWS Step Functions: AWS lock-in

---

### For Edge Features (Future)

**Recommendation:** Cloudflare Agents SDK

| Aspect | Recommendation |
|--------|----------------|
| **Priority** | Low (Future) |
| **Use Case** | Edge-based chat agents |

**When to Consider:**
- Need ultra-low latency chat
- Want edge-based preprocessing
- Building real-time collaboration

---

## Infrastructure Recommendations

### MCP Server Management

**Recommendation:** Docker MCP Catalog Integration

```yaml
# Proposed docker-compose addition
services:
  mcp-gateway:
    image: agentpod/mcp-gateway
    environment:
      - MCP_CATALOG_URL=https://hub.docker.com/u/mcp
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    networks:
      - agentpod-net
```

**Features:**
1. Browse MCP catalog from UI
2. One-click server deployment
3. Per-sandbox server isolation
4. Automatic discovery of tools

---

### Tool Authentication

**Recommendation:** Secret Management Layer

```
┌─────────────────────────────────────────────────────────────┐
│                    Secret Management                        │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                  AgentPod Vault                      │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │   │
│  │  │GitHub Token │ │Stripe Key   │ │DB Passwords │   │   │
│  │  └─────────────┘ └─────────────┘ └─────────────┘   │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                 │
│                           │ Inject at runtime              │
│                           ▼                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              MCP Servers (in sandbox)                │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Roadmap

### Phase 1: MCP Foundation (Q1 2026)

| Task | Priority | Effort |
|------|----------|--------|
| Add MCP client to containers | High | Medium |
| Build MCP catalog UI | High | Medium |
| Integrate 5 core MCP servers | High | Low |
| Secret management for MCP | High | Medium |

### Phase 2: Enhanced Tools (Q2 2026)

| Task | Priority | Effort |
|------|----------|--------|
| Custom MCP server builder | Medium | High |
| Tool analytics/monitoring | Medium | Medium |
| Per-user tool preferences | Medium | Low |

### Phase 3: Multi-Agent (Q3 2026)

| Task | Priority | Effort |
|------|----------|--------|
| Evaluate A2A adoption | Medium | Low |
| Cross-sandbox communication | Medium | High |
| Agent marketplace | Medium | High |

### Phase 4: Advanced (Q4 2026)

| Task | Priority | Effort |
|------|----------|--------|
| Edge agents (Cloudflare) | Low | High |
| AG-UI standardization | Low | Medium |
| External agent federation | Low | High |

---

## Risk Assessment

### Low Risk

| Decision | Risk Level | Mitigation |
|----------|------------|------------|
| MCP adoption | Low | Industry standard, AAIF governed |
| Docker MCP catalog | Low | Standard containers |
| Keep OpenCode | Low | Already working |

### Medium Risk

| Decision | Risk Level | Mitigation |
|----------|------------|------------|
| A2A adoption | Medium | Wait for more adoption |
| Custom MCP servers | Medium | Follow spec strictly |
| Multi-agent features | Medium | Start simple |

### Avoid

| Decision | Risk | Why Avoid |
|----------|------|-----------|
| Building custom protocol | High | Standards exist |
| Single framework lock-in | High | Limits flexibility |
| Complex multi-agent early | High | Not needed yet |

---

## Success Metrics

### MCP Integration

| Metric | Target |
|--------|--------|
| MCP servers available | 20+ |
| User adoption of MCP tools | 50% of active sandboxes |
| Tool invocation success rate | >95% |

### User Experience

| Metric | Target |
|--------|--------|
| Time to add new tool | <5 minutes |
| Tool discovery satisfaction | >4/5 rating |
| Agent task completion | >80% |

---

## Conclusion

1. **MCP is the clear priority** - Adopt immediately
2. **Don't over-engineer multi-agent** - Current model works
3. **Leverage Docker MCP catalog** - 240+ servers ready to use
4. **Keep framework flexibility** - Don't lock users in
5. **Monitor A2A and AG-UI** - Adopt when mature

---

## Related Documentation

- [MCP Protocol](./protocols/mcp.md)
- [A2A Protocol](./protocols/a2a.md)
- [Framework Comparison](./frameworks/README.md)
- [Docker MCP Ecosystem](./infrastructure/docker-mcp.md)

---

*Part of AgentPod Multi-Agent Ecosystem Research*
