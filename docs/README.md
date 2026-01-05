# AgentPod Documentation

> **Version:** 0.0.4  
> **Last Updated:** January 4, 2026

Welcome to the AgentPod documentation. This guide will help you understand, use, and contribute to AgentPod.

---

## Quick Navigation

| I want to... | Go to... |
|--------------|----------|
| Get started quickly | [Quick Start Guide](./getting-started/quick-start.md) |
| Deploy to production | [Self-Hosting Guide](./getting-started/self-hosting.md) |
| Understand the architecture | [Architecture Overview](./architecture/) |
| See what's implemented | [Current Features](./implementation/current-features.md) |
| See what's remaining | [Pending Work](./implementation/pending-work.md) |
| Contribute code | [Contributing Guide](../CONTRIBUTING.md) |

---

## Documentation Structure

### [Getting Started](./getting-started/) - Start Here

Practical guides for users, operators, and developers.

| Guide | Description |
|-------|-------------|
| [Quick Start](./getting-started/quick-start.md) | Get running in 5 minutes |
| [Self-Hosting](./getting-started/self-hosting.md) | Deploy to production |

---

### [Architecture](./architecture/)

System design and technical architecture.

| Document | Description |
|----------|-------------|
| [Monorepo Structure](./architecture/monorepo-structure.md) | Project layout |
| [ACP Protocol](./architecture/acp-protocol.md) | Agent Communication Protocol |
| [Authentication](./architecture/authentication.md) | Auth flows and providers |
| [Session Persistence](./architecture/session-persistence.md) | Session storage |
| [Modular Containers](./architecture/modular-containers.md) | Container tiers and flavors |
| [Cloudflare Integration](./architecture/cloudflare-integration.md) | Cloudflare services |

---

### [Implementation](./implementation/)

Development status and documentation.

| Document | Description |
|----------|-------------|
| [Current Features](./implementation/current-features.md) | What's implemented (~95% complete) |
| [Pending Work](./implementation/pending-work.md) | Remaining tasks (106+ items) |
| [Restructuring Plan](./implementation/00-restructuring-plan.md) | Doc reorganization plan |
| [Archived](./implementation/archived/) | Historical documentation |

---

### [Features](./features/)

Independent feature documentation.

| Feature | Description |
|---------|-------------|
| [Workflow Builder](./features/workflow-builder/) | Visual workflow system |
| [Agent Management](./features/agent-management/) | Agent configuration and teams |
| [Admin Panel](./features/admin-panel/) | User and resource management |
| [Web Preview](./features/web-preview/) | In-app web preview |

---

### [Agents](./agents/)

AI agent framework documentation.

| Document | Description |
|----------|-------------|
| [Agent Architecture](./agents/architecture.md) | System design |
| [Agent Catalog](./agents/agent-catalog.md) | Available agents |
| [Personality Framework](./agents/personality-framework.md) | Agent personalities |
| [Team Structure](./agents/team-structure.md) | Agent teams and squads |
| [Integration Guide](./agents/integration-guide.md) | How to integrate agents |

---

### [Design](./design/)

Design system and specifications.

| Document | Description |
|----------|-------------|
| [Design Language](./design/design-language.md) | Visual design principles |
| [Component Specs](./design/component-specifications.md) | UI component library |
| [Responsive Design](./design/responsive-design.md) | Mobile-first approach |
| [Agentic UX Analysis](./design/agentic-ux-analysis.md) | AI UX patterns |
| [User Journeys](./design/user-journey-paths.md) | User flow paths |

---

### [Testing](./testing/)

Testing strategies and guides.

| Document | Description |
|----------|-------------|
| [API Testing](./testing/api-testing-guide.md) | 411 tests implemented |
| [Frontend Testing](./testing/frontend-testing-guide.md) | Svelte + React testing |
| [E2E Testing](./testing/e2e-testing-guide.md) | End-to-end strategy |
| [TDD Workflow](./testing/tdd-workflow.md) | Test-driven development |

---

### [Operations](./operations/)

Production deployment and operations.

| Document | Description |
|----------|-------------|
| [Security](./operations/phase-1-security.md) | Security hardening |
| [Observability](./operations/phase-2-observability.md) | Logging & monitoring |
| [CI/CD](./operations/phase-3-ci-cd.md) | Continuous deployment |
| [Backup](./operations/phase-4-backup.md) | Backup strategies |
| [Production Checklist](./operations/PRODUCTION_CHECKLIST.md) | Pre-launch checklist |

---

### [Onboarding System](./onboarding-system/)

AI-powered user onboarding.

| Document | Description |
|----------|-------------|
| [Architecture](./onboarding-system/architecture.md) | MCP knowledge server |
| [Knowledge Base](./onboarding-system/knowledge-base/) | Templates and patterns |
| [Implementation](./onboarding-system/implementation-phases.md) | Build roadmap |

---

### [Research](./research/)

Research notes and explorations.

| Document | Description |
|----------|-------------|
| [Multi-Agent Ecosystem](./research/multi-agent-ecosystem/) | **NEW**: Protocols, frameworks, and standards |
| [Sandbox Patterns](./research/sandbox-environment-patterns.md) | Security and isolation |
| [Autonomous AgentPod](./research/autonomous-agentpod-poc.md) | POC documentation |

#### Multi-Agent Ecosystem Research

Comprehensive research on the multi-agent AI ecosystem:

| Section | Topics |
|---------|--------|
| [Protocols](./research/multi-agent-ecosystem/protocols/) | MCP, A2A, AG-UI, AGENTS.md, Agent Protocol |
| [Governance](./research/multi-agent-ecosystem/governance/) | AAIF (Linux Foundation) |
| [Frameworks](./research/multi-agent-ecosystem/frameworks/) | Cloudflare, AWS, Google, Microsoft, Vercel, Open Source |
| [Infrastructure](./research/multi-agent-ecosystem/infrastructure/) | Docker MCP, Durable Workflows |
| [Recommendations](./research/multi-agent-ecosystem/recommendations.md) | AgentPod-specific guidance |

---

### [Ideas](./ideas/)

Future concepts and planning.

| Document | Description |
|----------|-------------|
| [Cloudflare Sandbox](./ideas/cloudflare-sandbox-integration.md) | Cloudflare integration ideas |
| [OpenCode Use Cases](./ideas/opencode-cloudflare-use-cases.md) | Use case exploration |

---

### [Vision](./vision/) (External)

Future concepts from The-Agentic-Space repository.

| Section | Description |
|---------|-------------|
| [docs/](./vision/docs/) | Business, concepts, technical vision |

**Note:** This is a symlink to the external `The-Agentic-Space` repository containing visionary concepts, not current product features.

---

## Project Status

| Component | Status | Documentation |
|-----------|--------|---------------|
| Desktop App | ✅ Complete | [Getting Started](./getting-started/) |
| Management API | ✅ Complete | [Current Features](./implementation/current-features.md) |
| Workflows | ✅ Complete | [Workflow Builder](./features/workflow-builder/) |
| Cloudflare Integration | ✅ Complete | [Architecture](./architecture/cloudflare-integration.md) |
| Agents | ✅ Complete | [Agent Catalog](./agents/agent-catalog.md) |
| Production | ✅ Complete | [Checklist](./operations/PRODUCTION_CHECKLIST.md) |

**Overall:** ~95% Feature Complete | [See Pending Work](./implementation/pending-work.md)

---

## Technology Stack

| Layer | Technology |
|-------|------------|
| Desktop/Mobile | Tauri v2 + SvelteKit |
| UI Components | shadcn-svelte + Tailwind |
| Chat UI | assistant-ui (React) |
| API | Bun + Hono |
| Database | PostgreSQL + pgvector |
| Auth | Better Auth |
| Containers | Docker + Traefik |
| Workflows | Cloudflare Workflows SDK |
| AI Agent | OpenCode |
| Build | Turborepo + pnpm |

---

## Navigation by Role

### I'm a User
1. [Quick Start](./getting-started/quick-start.md)
2. [Working with Agents](./agents/)
3. [Workflows Guide](./features/workflow-builder/)

### I'm an Operator
1. [Self-Hosting](./getting-started/self-hosting.md)
2. [Production Checklist](./operations/PRODUCTION_CHECKLIST.md)
3. [Monitoring](./operations/phase-2-observability.md)

### I'm a Developer
1. [Architecture](./architecture/)
2. [Current Features](./implementation/current-features.md)
3. [Contributing](../CONTRIBUTING.md)
4. [Testing](./testing/tdd-workflow.md)

### I'm a Designer
1. [Design Language](./design/design-language.md)
2. [Component Specs](./design/component-specifications.md)
3. [Agentic UX](./design/agentic-ux-analysis.md)

---

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for development guidelines.

---

## Support

- **GitHub Issues:** https://github.com/rakeshgangwar/agentpod/issues
- **Discussions:** https://github.com/rakeshgangwar/agentpod/discussions

---

**Built with Tauri v2 + SvelteKit + Bun + Docker + Cloudflare**
