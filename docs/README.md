# AgentPod Documentation

> **Version:** 1.0.0  
> **Last Updated:** December 27, 2025

Welcome to the AgentPod documentation. This guide will help you understand, use, and contribute to AgentPod.

---

## Quick Navigation

| I want to... | Go to... |
|--------------|----------|
| Get started quickly | [Quick Start Guide](./guides/quick-start.md) |
| Deploy to production | [Self-Hosting Guide](./guides/self-hosting.md) |
| Understand the architecture | [Technical Architecture](./technical-architecture.md) |
| Build workflows | [Workflow Builder Plan](./implementation/workflow-builder-plan.md) |
| Contribute code | [Contributing Guide](../CONTRIBUTING.md) |

---

## Documentation Structure

### [Guides](./guides/) - Start Here

Practical guides for users, operators, and developers.

| Guide | Description |
|-------|-------------|
| [Quick Start](./guides/quick-start.md) | Get running in 5 minutes |
| [Self-Hosting](./guides/self-hosting.md) | Deploy to production |
| [Configuration](./guides/configuration.md) | Environment and settings |

---

### [Architecture](./architecture/)

System design and technical architecture.

| Document | Description |
|----------|-------------|
| [System Architecture](./technical-architecture.md) | Core system design |
| [Monorepo Structure](./architecture/monorepo-structure.md) | Project layout |

---

### [Implementation](./implementation/)

Development guides and feature documentation.

| Section | Description | Status |
|---------|-------------|--------|
| [Phases 1-6](./implementation/) | Core implementation phases | ✅ Complete |
| [Workflow Builder](./implementation/workflow-builder-plan.md) | Visual workflow system | ✅ Complete |
| [Cloudflare Integration](./implementation/cloudflare-implementation-guide.md) | Cloudflare services | ✅ Complete |
| [Archived](./implementation/archived/) | Completed migrations | 📦 Reference |

---

### [Agents](./agents/)

AI agent framework documentation.

| Document | Description |
|----------|-------------|
| [Agent Architecture](./agents/architecture.md) | System design |
| [Agent Catalog](./agents/agent-catalog.md) | Available agents |
| [Personality Framework](./agents/personality-framework.md) | Agent personalities |
| [Integration Guide](./agents/integration-guide.md) | How to integrate agents |

---

### [UI/UX](./ui-ux/)

Design system and specifications.

| Document | Description |
|----------|-------------|
| [Design Language](./design-language.md) | Visual design principles |
| [Component Specs](./ui-ux/10-component-specifications.md) | UI component library |
| [Responsive Design](./ui-ux/12-responsive-design-plan.md) | Mobile-first approach |

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

### [Production](./production-readiness/)

Production deployment and operations.

| Document | Description |
|----------|-------------|
| [Security](./production-readiness/phase-1-security.md) | Security hardening |
| [Observability](./production-readiness/phase-2-observability.md) | Logging & monitoring |
| [CI/CD](./production-readiness/phase-3-ci-cd.md) | Continuous deployment |
| [Backup](./production-readiness/phase-4-backup.md) | Backup strategies |
| [Production Checklist](./production-readiness/PRODUCTION_CHECKLIST.md) | Pre-launch checklist |

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
| [Sandbox Patterns](./research/sandbox-environment-patterns.md) | Security and isolation |

---

### [Ideas](./ideas/)

Future concepts and planning.

| Document | Description |
|----------|-------------|
| [Cloudflare Sandbox](./ideas/cloudflare-sandbox-integration.md) | Cloudflare integration ideas |
| [OpenCode Use Cases](./ideas/opencode-cloudflare-use-cases.md) | Use case exploration |
| [Autonomous Sandboxes](./ideas/autonomous-sandboxes.md) | Self-healing concepts |

---

### [Reference](./reference/)

External references and vision documents.

| Section | Description |
|---------|-------------|
| [Agentic Space](./reference/agentic-space/) | Future VR/AR virtual office vision |

**Note:** Reference docs contain visionary concepts, not current product features.

---

## Project Status

| Component | Status | Documentation |
|-----------|--------|---------------|
| Desktop App | ✅ Complete | [User Guide](./guides/README.md) |
| Management API | ✅ Complete | [API Reference](./implementation/phase-4-mobile-core/opencode-api-reference.md) |
| Workflows | ✅ Complete | [Workflow Builder](./implementation/workflow-builder-plan.md) |
| Cloudflare Integration | ✅ Complete | [Implementation Guide](./implementation/cloudflare-implementation-guide.md) |
| Agents | ✅ Complete | [Agent Catalog](./agents/agent-catalog.md) |
| Production | ✅ Complete | [Checklist](./production-readiness/PRODUCTION_CHECKLIST.md) |

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
1. [Quick Start](./guides/quick-start.md)
2. [Working with Agents](./guides/README.md#user-guides)
3. [Workflows Guide](./implementation/workflow-builder-plan.md)

### I'm an Operator
1. [Self-Hosting](./guides/self-hosting.md)
2. [Production Checklist](./production-readiness/PRODUCTION_CHECKLIST.md)
3. [Monitoring](./production-readiness/phase-2-observability.md)

### I'm a Developer
1. [Architecture](./technical-architecture.md)
2. [Contributing](../CONTRIBUTING.md)
3. [Testing](./testing/tdd-workflow.md)

### I'm a Designer
1. [Design Language](./design-language.md)
2. [Component Specs](./ui-ux/10-component-specifications.md)
3. [UI Analysis](./ui-ux/01-ui-review.md)

---

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for development guidelines.

---

## Support

- **GitHub Issues:** https://github.com/rakeshgangwar/agentpod/issues
- **Discussions:** https://github.com/rakeshgangwar/agentpod/discussions

---

**Built with Tauri v2 + SvelteKit + Bun + Docker + Cloudflare**
