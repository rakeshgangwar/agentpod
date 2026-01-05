# Agentic AI Foundation (AAIF)

> **Version:** 1.0.0  
> **Last Updated:** January 5, 2026  
> **Status:** Active

---

## Overview

| Attribute | Value |
|-----------|-------|
| **Full Name** | Agentic AI Foundation |
| **Parent Organization** | Linux Foundation |
| **Announced** | December 9, 2025 |
| **Website** | https://aaif.io |
| **Mission** | Neutral governance for AI agent standards |

---

## What is AAIF?

The Agentic AI Foundation (AAIF) is a Linux Foundation project that provides open, neutral governance for AI agent standards and projects. It was created to prevent fragmentation in the multi-agent ecosystem and ensure protocols evolve for the benefit of all.

### Key Problem Solved

Before AAIF:
- MCP was Anthropic-controlled
- A2A was Google-controlled
- AGENTS.md was OpenAI-controlled
- Risk of vendor lock-in and incompatible standards

With AAIF:
- Neutral governance for critical protocols
- Multi-stakeholder decision making
- Open specification evolution
- Interoperability guaranteed

---

## Governance Structure

```
┌─────────────────────────────────────────────────────────────┐
│                    Linux Foundation                         │
│                  (Parent Organization)                      │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                         AAIF                                │
│              (Agentic AI Foundation)                        │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Governing Board                         │   │
│  │         (Platinum Member Representatives)            │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                 │
│           ┌───────────────┼───────────────┐                │
│           ▼               ▼               ▼                │
│    ┌──────────┐    ┌──────────┐    ┌──────────┐          │
│    │Technical │    │ Outreach │    │   Legal  │          │
│    │ Steering │    │Committee │    │Committee │          │
│    │Committee │    │          │    │          │          │
│    └──────────┘    └──────────┘    └──────────┘          │
└─────────────────────────────────────────────────────────────┘
                           │
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
    ┌──────────┐    ┌──────────┐    ┌──────────┐
    │   MCP    │    │  goose   │    │ AGENTS.md│
    │ Project  │    │ Project  │    │ Project  │
    └──────────┘    └──────────┘    └──────────┘
```

---

## Membership Tiers

### Platinum Members

Platinum members have board seats and significant influence on foundation direction.

| Member | Industry | Contribution |
|--------|----------|--------------|
| **Amazon Web Services** | Cloud | Strands, AgentCore |
| **Anthropic** | AI Research | MCP protocol |
| **Block** | Fintech | goose project |
| **Bloomberg** | Finance | Enterprise requirements |
| **Cloudflare** | Infrastructure | MCP integration |
| **Google** | AI/Cloud | A2A protocol |
| **Microsoft** | AI/Cloud | Enterprise integration |
| **OpenAI** | AI Research | AGENTS.md |

### General Members

General members contribute to projects and participate in working groups.

### Associate Members

Academic institutions, non-profits, and government organizations.

---

## Initial Projects

### 1. Model Context Protocol (MCP)

| Attribute | Value |
|-----------|-------|
| **Original Owner** | Anthropic |
| **Transferred** | December 2025 |
| **Purpose** | Agent ↔ Tools/Data |
| **Documentation** | [MCP Protocol](../protocols/mcp.md) |

MCP was the first major protocol transferred to AAIF. This ensures:
- Neutral evolution of the specification
- Multi-vendor input on new features
- Open governance of reference implementations

### 2. goose

| Attribute | Value |
|-----------|-------|
| **Original Owner** | Block (Square) |
| **Transferred** | December 2025 |
| **Purpose** | Autonomous coding agent |
| **Repository** | https://github.com/block/goose |

goose is an autonomous coding agent that:
- Runs in the terminal
- Uses MCP for tool integration
- Provides reference implementation patterns

### 3. AGENTS.md

| Attribute | Value |
|-----------|-------|
| **Original Owner** | OpenAI |
| **Transferred** | December 2025 |
| **Purpose** | Agent instruction specification |
| **Documentation** | [AGENTS.md Spec](../protocols/agents-md.md) |

AGENTS.md provides:
- File-based convention for agent instructions
- Project context for AI coding agents
- Standard location and format

---

## Significance

### 1. Prevents Vendor Lock-in

With protocols under neutral governance:
- No single vendor can change specifications unilaterally
- Implementations must remain interoperable
- Users can switch between compatible tools

### 2. Accelerates Adoption

Companies are more likely to adopt standards that are:
- Neutrally governed
- Multi-stakeholder
- Open specification

### 3. Enables Ecosystem Growth

Open standards enable:
- Third-party tool development
- Framework compatibility
- Marketplace of interoperable components

---

## How AAIF Works

### Specification Changes

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Proposal                                                 │
│    - Any member or community can propose changes           │
│    - Proposals submitted via GitHub RFC process            │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Discussion                                               │
│    - Public discussion period (30+ days)                   │
│    - Technical Steering Committee review                   │
│    - Community feedback incorporated                       │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Voting                                                   │
│    - TSC votes on specification changes                    │
│    - Major changes require supermajority                   │
│    - Breaking changes have longer review periods           │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Release                                                  │
│    - Specification version published                       │
│    - Reference implementations updated                     │
│    - Migration guides provided                             │
└─────────────────────────────────────────────────────────────┘
```

### Project Contributions

All contributions to AAIF projects follow:
1. **Apache 2.0 License** - For code
2. **CC BY 4.0** - For specifications
3. **CLA Required** - Contributor License Agreement

---

## Participating

### As a User

- Use AAIF specifications in your projects
- Report issues and request features
- Participate in public discussions

### As a Developer

- Contribute to reference implementations
- Build compatible tools and frameworks
- Join working groups

### As an Organization

- Become a member (Platinum, General, or Associate)
- Influence protocol direction
- Ensure your needs are represented

---

## Future Roadmap

### Expected Projects (Speculative)

| Project | Source | Status |
|---------|--------|--------|
| A2A Protocol | Google | Under discussion |
| AG-UI | CopilotKit | Potential candidate |
| Agent Protocol | AIEF | Potential merger |

### Focus Areas

1. **Interoperability Testing** - Certification for protocol compliance
2. **Reference Implementations** - Official SDKs in multiple languages
3. **Security Standards** - Agent security best practices
4. **Enterprise Features** - Authentication, audit, compliance

---

## Comparison with Other Foundations

| Foundation | Focus | Key Projects |
|------------|-------|--------------|
| **AAIF** | AI agents | MCP, goose, AGENTS.md |
| **LF AI & Data** | AI/ML infrastructure | ONNX, Kubeflow |
| **OpenAI Foundation** | AI research | (Research focus) |
| **AIEF** | AI engineering | Agent Protocol |
| **CNCF** | Cloud native | Kubernetes, Prometheus |

---

## Impact on AgentPod

### Positive Implications

1. **MCP Stability** - MCP will remain stable and backwards-compatible
2. **Multi-Vendor Support** - All major vendors committed to MCP
3. **Clear Roadmap** - Specification changes are predictable
4. **Legal Clarity** - Apache 2.0 licensing is clear

### Recommendations

1. **Adopt AAIF Standards** - MCP and AGENTS.md should be primary
2. **Monitor A2A Governance** - Likely to join AAIF
3. **Participate** - Consider AAIF membership for influence

---

## Resources

- **Website:** https://aaif.io
- **Announcement:** https://linuxfoundation.org/press/aaif-launch
- **GitHub:** https://github.com/agentic-ai-foundation
- **Mailing Lists:** https://lists.aaif.io

---

## Related Documentation

- [MCP Protocol](../protocols/mcp.md) - AAIF project
- [AGENTS.md](../protocols/agents-md.md) - AAIF project
- [A2A Protocol](../protocols/a2a.md) - Potential AAIF project

---

*Part of AgentPod Multi-Agent Ecosystem Research*
