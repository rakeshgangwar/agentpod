# CodeOpen v2: ACP Multi-Agent Integration

This documentation covers the v2 evolution of CodeOpen from an OpenCode-only client to a **multi-agent ACP (Agent Client Protocol) client** supporting multiple AI coding agents.

## Vision

Transform CodeOpen from a single-agent client into a universal ACP client that supports:

- **OpenCode** (default, current implementation)
- **Claude Code** (Anthropic subscription users)
- **Gemini CLI** (Google AI subscription users)
- **Qwen Code** (Alibaba Cloud)
- **Codex** (OpenAI)
- **Custom ACP-compatible agents**

## What is ACP?

The [Agent Client Protocol (ACP)](https://agentclientprotocol.com) is an open standard created by Zed Industries and JetBrains for communication between code editors/IDEs and AI coding agents. Key characteristics:

- **Transport**: JSON-RPC 2.0 over stdio (agents run as subprocesses)
- **MCP-Compatible**: Reuses MCP types where possible
- **Session-based**: Multiple concurrent sessions per connection
- **Bidirectional**: Both client and agent can make requests

## Migration Strategy

| Phase | Current (v1) | Target (v2) |
|-------|-------------|-------------|
| **API** | OpenCode REST/SSE | ACP JSON-RPC (+ legacy REST for backward compat) |
| **Agents** | OpenCode only | Multi-agent selection |
| **Sessions** | REST-based | ACP sessions with persistence |
| **Auth** | Per-provider | Unified agent auth (OAuth/device flow) |

## Implementation Phases

| Phase | Name | Description | Status |
|-------|------|-------------|--------|
| 1 | [ACP Gateway](./phase-1-acp-gateway/) | Container-side ACP client service | ✅ Complete |
| 2 | [Management API](./phase-2-management-api/) | API routes for ACP proxying | ✅ Complete |
| 3 | [Frontend](./phase-3-frontend/) | Agent selection UI & chat adapter | 🔲 Pending |
| 4 | [Migration](./phase-4-migration/) | Migrate OpenCode SDK to ACP | 🔲 Pending |
| 5 | [Modular Containers](./modular-containers.md) | Resource tiers, flavors, and add-ons | 🔄 In Progress |

## Key Documents

| Document | Description |
|----------|-------------|
| [Architecture](./architecture.md) | System architecture and data flow |
| [ACP Protocol](./acp-protocol.md) | ACP protocol overview and implementation |
| [Modular Containers](./modular-containers.md) | Container tiers, flavors, and add-ons |
| [Authentication](./authentication.md) | Agent authentication flows |
| [Session Persistence](./session-persistence.md) | Session storage and recovery |

## Deferred Tasks from v1

Tasks from v1 phases that were deferred or incomplete have been consolidated in [deferred-v1-tasks/](./deferred-v1-tasks/). These will be addressed alongside or after the v2 implementation.

## Quick Links

- [ACP Official Documentation](https://agentclientprotocol.com)
- [ACP TypeScript SDK](https://agentclientprotocol.github.io/typescript-sdk/)
- [ACP Rust Crate](https://crates.io/crates/agent-client-protocol)
- [Reference Implementation: AionUi](https://github.com/iOfficeAI/AionUi)
- [Reference Implementation: agent-shell.el](https://github.com/xenodium/agent-shell)

## Getting Started with v2 Development

1. Read the [Architecture](./architecture.md) document
2. Understand [ACP Protocol](./acp-protocol.md) basics
3. Start with [Phase 1: ACP Gateway](./phase-1-acp-gateway/)
4. Follow phases sequentially

## Design Principles

1. **Backward Compatibility**: Keep existing OpenCode SDK routes working during migration
2. **Agent Agnostic**: Support any ACP-compliant agent
3. **Session Persistence**: Sessions survive container restarts
4. **Unified Auth**: Consistent authentication flow across agents
5. **Progressive Enhancement**: Users can use new agents without breaking existing workflows
