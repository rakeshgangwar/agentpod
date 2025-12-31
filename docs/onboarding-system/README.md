# Onboarding Agent System

A system-level AI agent that helps users set up their workspace for any type of project through conversational interviews.

## Overview

The Onboarding Agent is a core feature of AgentPod that:

1. **Interviews users** conversationally to understand their project requirements
2. **Researches best practices** using a knowledge base of templates and patterns
3. **Generates complete workspace configuration** including:
   - `opencode.json` - Project settings
   - `AGENTS.md` - Project rules and instructions
   - `.opencode/agent/*.md` - Custom agents for their workflow
   - `.opencode/command/*.md` - Custom commands for repetitive tasks
   - `.opencode/tool/*.ts` - Custom tools if needed

## Key Design Decisions

### 1. System Feature, Not Agent Harness

The onboarding agent is a **system-level feature** built into AgentPod, not another generic agent harness. It has special privileges and access to the knowledge base.

### 2. Knowledge Delivery via MCP Server

The knowledge base is delivered via an **MCP (Model Context Protocol) server**. OpenCode queries this server to retrieve templates, patterns, and best practices.

### 3. Automatic Trigger on First Sandbox

Onboarding triggers **automatically on first sandbox creation** for a user. Users can skip if they prefer manual setup.

### 4. General Purpose Projects

The system supports **any type of project**, not just software development:
- Web applications
- API services
- Book publishing
- Social media management
- Research projects
- Data analysis
- And more...

## Documentation Structure

```
docs/onboarding-system/
├── README.md                    # This file - Overview
├── architecture.md              # System architecture & OpenCode config reference
├── opencode-config-explainer.md # Plain English guide to all config options
├── automation-strategy.md       # Doc sync & template generation pipelines
├── implementation-phases.md     # Step-by-step implementation guide
├── database-schema.sql          # SQL schema reference
│
└── knowledge-base/              # Raw knowledge base content
    ├── README.md                # Knowledge base overview
    ├── project-templates/       # Full project setup templates
    ├── agent-patterns/          # Reusable agent definitions
    ├── command-templates/       # Reusable command definitions
    ├── tool-templates/          # Reusable tool definitions
    ├── plugin-templates/        # Reusable plugin definitions
    └── mcp-templates/           # MCP server configurations
```

## Quick Links

- [Architecture](./architecture.md) - System design and OpenCode configuration reference
- [OpenCode Config Explainer](./opencode-config-explainer.md) - Plain English guide to all configuration options
- [Automation Strategy](./automation-strategy.md) - Documentation sync and template generation
- [Implementation Phases](./implementation-phases.md) - How to build this
- [Knowledge Base](./knowledge-base/README.md) - Templates and patterns

## Open Questions

The following decisions need to be finalized before implementation:

### 1. MCP Server Deployment

Should the Knowledge MCP server be:
- **Part of the Management API** (same process) - Simpler, less infrastructure
- **Separate microservice** - More scalable, independent deployment

**Current recommendation:** Integrated into the API for initial simplicity.

### 2. Embedding/Vector Search

For semantic search in the knowledge base:
- **Vercel AI SDK `embed()`** - Requires API key, easy to implement
- **Local embedding model** - More complex, no external dependencies
- **Keyword/tag-based search** - Simple, no ML required

**Current recommendation:** Start with keyword/tag-based search, add semantic later.

### 3. Onboarding Trigger Mechanism

How should onboarding be triggered:
- **Automatic on first sandbox** - Current plan
- **Optional flag in sandbox creation API** - More control
- **Always available via `@onboarding`** - User chooses

**Current recommendation:** Automatic trigger with easy skip option.

### 4. External Integrations

Should we integrate with external services:
- **Context7** - For documentation lookup during onboarding
- **Archon-style RAG** - For sophisticated knowledge retrieval

**Current recommendation:** Keep it simple initially, expand later.

### 5. Knowledge Base Population

How to manage knowledge base content:
- **Seed from markdown files in repo** - Version controlled
- **Admin API for CRUD** - Dynamic updates
- **Both** - Seed initially, allow updates

**Current recommendation:** Both - seed from repo, allow admin updates.

## Related Documentation

- [OpenCode Configuration](https://opencode.ai/docs/configuration) - Official OpenCode config docs
- [OpenCode Agents](https://opencode.ai/docs/agents) - How agents work
- [OpenCode MCP Servers](https://opencode.ai/docs/mcp-servers) - MCP integration
- [OpenCode Custom Tools](https://opencode.ai/docs/custom-tools) - Tool development
- [OpenCode Plugins](https://opencode.ai/docs/plugins) - Plugin development
- [OpenCode Commands](https://opencode.ai/docs/commands) - Custom commands

## Contributing

When adding to this documentation:

1. **Project Templates** go in `knowledge-base/project-templates/`
2. **Agent Patterns** go in `knowledge-base/agent-patterns/`
3. **Command Templates** go in `knowledge-base/command-templates/`
4. **Tool Templates** go in `knowledge-base/tool-templates/`
5. **Plugin Templates** go in `knowledge-base/plugin-templates/`
6. **MCP Templates** go in `knowledge-base/mcp-templates/`

Each template should follow the format defined in the respective README files.

See [automation-strategy.md](./automation-strategy.md) for guidelines on auto-generating templates from the project types reference.
