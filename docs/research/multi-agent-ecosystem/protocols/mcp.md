# Model Context Protocol (MCP)

> **Version:** 1.0.0  
> **Last Updated:** January 5, 2026  
> **Status:** Production Standard

---

## Overview

| Attribute | Value |
|-----------|-------|
| **Full Name** | Model Context Protocol |
| **Originator** | Anthropic |
| **Current Governance** | AAIF (Linux Foundation) |
| **Purpose** | Agent ↔ Tools/Data connectivity |
| **Website** | https://modelcontextprotocol.io |
| **Specification** | https://spec.modelcontextprotocol.io |

---

## What is MCP?

MCP is a standardized protocol for connecting AI agents to external tools, data sources, and services. Think of it as "USB for AI" - a universal connector that lets any agent work with any tool.

Before MCP, each AI application needed custom integrations for every tool. MCP provides a common interface that tool providers implement once, and any MCP-compatible agent can use.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        MCP Host                             │
│                   (AI Application)                          │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                    MCP Client                        │   │
│  │           (Maintains server connections)             │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                           │
           ┌───────────────┼───────────────┐
           │               │               │
           ▼               ▼               ▼
    ┌────────────┐  ┌────────────┐  ┌────────────┐
    │ MCP Server │  │ MCP Server │  │ MCP Server │
    │   (Slack)  │  │  (GitHub)  │  │ (Database) │
    └────────────┘  └────────────┘  └────────────┘
```

### Components

| Component | Role |
|-----------|------|
| **Host** | AI application that wants to access tools/data |
| **Client** | Protocol implementation within the host |
| **Server** | Service exposing tools/resources via MCP |

---

## Protocol Capabilities

### 1. Tools

Tools are functions the agent can invoke to perform actions.

```json
{
  "name": "search_web",
  "description": "Search the web for information",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "Search query"
      }
    },
    "required": ["query"]
  }
}
```

### 2. Resources

Resources are data the agent can read (files, database records, etc.).

```json
{
  "uri": "file:///workspace/README.md",
  "name": "README.md",
  "mimeType": "text/markdown"
}
```

### 3. Prompts

Prompts are pre-defined templates for common interactions.

```json
{
  "name": "code_review",
  "description": "Review code for issues",
  "arguments": [
    {
      "name": "code",
      "description": "Code to review",
      "required": true
    }
  ]
}
```

### 4. Sampling

Servers can request LLM completions from the host (advanced use case).

---

## Transport Options

| Transport | Use Case | Example |
|-----------|----------|---------|
| **stdio** | Local processes | CLI tools, local servers |
| **HTTP + SSE** | Remote services | Cloud-hosted MCP servers |
| **WebSocket** | Bidirectional streaming | Real-time applications |

### stdio Transport (Most Common)

```bash
# Server runs as subprocess, communicates via stdin/stdout
node mcp-server.js
```

### HTTP + SSE Transport

```
POST /mcp/tools/call     # Invoke tool
GET  /mcp/resources      # List resources
GET  /mcp/sse           # Server-sent events stream
```

---

## Message Format

MCP uses JSON-RPC 2.0 for all communication.

### Request

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "search_web",
    "arguments": {
      "query": "MCP protocol specification"
    }
  }
}
```

### Response

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Search results for 'MCP protocol specification'..."
      }
    ]
  }
}
```

### Notification (No Response Expected)

```json
{
  "jsonrpc": "2.0",
  "method": "notifications/resources/updated",
  "params": {
    "uri": "file:///workspace/config.json"
  }
}
```

---

## Key Methods

### Client → Server

| Method | Purpose |
|--------|---------|
| `initialize` | Initialize connection, exchange capabilities |
| `tools/list` | List available tools |
| `tools/call` | Invoke a tool |
| `resources/list` | List available resources |
| `resources/read` | Read resource content |
| `prompts/list` | List available prompts |
| `prompts/get` | Get prompt template |

### Server → Client

| Method | Purpose |
|--------|---------|
| `sampling/createMessage` | Request LLM completion |
| `roots/list` | List workspace roots |

### Notifications

| Notification | Direction | Purpose |
|--------------|-----------|---------|
| `notifications/initialized` | Server → Client | Server ready |
| `notifications/tools/list_changed` | Server → Client | Tools updated |
| `notifications/resources/updated` | Server → Client | Resource changed |

---

## Authentication

MCP supports various authentication methods:

### OAuth 2.0

```json
{
  "method": "initialize",
  "params": {
    "capabilities": {
      "auth": {
        "oauth2": {
          "authorizationUrl": "https://example.com/oauth/authorize",
          "tokenUrl": "https://example.com/oauth/token",
          "scopes": ["read", "write"]
        }
      }
    }
  }
}
```

### API Key

```json
{
  "method": "initialize",
  "params": {
    "capabilities": {
      "auth": {
        "apiKey": {
          "header": "X-API-Key"
        }
      }
    }
  }
}
```

---

## Popular MCP Servers

### Official (Anthropic)

| Server | Purpose | Pulls |
|--------|---------|-------|
| `mcp/filesystem` | File system access | - |
| `mcp/git` | Git operations | - |
| `mcp/postgres` | PostgreSQL queries | - |
| `mcp/sqlite` | SQLite database | - |

### Docker Hub Catalog

| Server | Purpose | Pulls |
|--------|---------|-------|
| `mcp/playwright` | Browser automation | 100K+ |
| `mcp/kubernetes` | K8s management | 10K+ |
| `mcp/redis` | Redis operations | 10K+ |
| `mcp/mongodb` | MongoDB access | 50K+ |
| `mcp/stripe` | Stripe API | 10K+ |
| `mcp/github` | GitHub operations | 10K+ |
| `mcp/slack` | Slack integration | 10K+ |

**Total:** 240+ MCP servers available in Docker Hub

---

## Framework Support

| Framework | MCP Support | Notes |
|-----------|-------------|-------|
| Claude Desktop | ✅ Native | First-party support |
| OpenAI Assistants | ✅ Native | Added late 2024 |
| Google ADK | ✅ Native | Full MCP tools support |
| Strands Agents | ✅ Native | Via `mcp_tools` |
| LangChain/LangGraph | ✅ Native | Via `langchain-mcp` |
| CrewAI | ✅ Native | Via MCP tools |
| Vercel AI SDK | ✅ Native | v6+ |
| Cloudflare Agents | ✅ Partial | Via Workers |

---

## AgentPod Integration

### Current State

AgentPod already has MCP-related infrastructure:
- ACP Gateway in containers (can be extended for MCP)
- Docker-based sandbox architecture (compatible with MCP servers)

### Recommended Integration

1. **Add MCP client to containers** - Enable sandboxes to connect to MCP servers
2. **Integrate Docker MCP catalog** - Allow users to add MCP servers from Docker Hub
3. **Build MCP gateway** - Central MCP proxy for multi-tool management

```
┌─────────────────────────────────────────────────────────────┐
│                      AgentPod Sandbox                       │
│                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    │
│  │  OpenCode   │    │ MCP Client  │    │ ACP Gateway │    │
│  │   Agent     │───►│             │◄───│             │    │
│  └─────────────┘    └──────┬──────┘    └─────────────┘    │
│                            │                               │
└────────────────────────────┼───────────────────────────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
       ┌────────────┐ ┌────────────┐ ┌────────────┐
       │ MCP Server │ │ MCP Server │ │ MCP Server │
       │ (Database) │ │  (GitHub)  │ │   (Slack)  │
       └────────────┘ └────────────┘ └────────────┘
```

---

## Implementation Example

### TypeScript MCP Server

```typescript
import { Server } from "@modelcontextprotocol/sdk/server";

const server = new Server({
  name: "my-mcp-server",
  version: "1.0.0"
});

// Register a tool
server.tool("greet", {
  description: "Greet a user",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string" }
    },
    required: ["name"]
  }
}, async ({ name }) => {
  return {
    content: [
      { type: "text", text: `Hello, ${name}!` }
    ]
  };
});

// Start server
server.listen();
```

### Python MCP Server

```python
from mcp import Server, Tool

server = Server("my-mcp-server", version="1.0.0")

@server.tool("greet")
async def greet(name: str) -> str:
    """Greet a user"""
    return f"Hello, {name}!"

if __name__ == "__main__":
    server.run()
```

---

## Resources

- **Specification:** https://spec.modelcontextprotocol.io
- **TypeScript SDK:** https://github.com/modelcontextprotocol/typescript-sdk
- **Python SDK:** https://github.com/modelcontextprotocol/python-sdk
- **Server Examples:** https://github.com/modelcontextprotocol/servers
- **Docker Catalog:** https://hub.docker.com/u/mcp

---

## Related Documentation

- [A2A Protocol](./a2a.md) - Agent-to-agent communication
- [AG-UI Protocol](./ag-ui.md) - Frontend streaming
- [Docker MCP Ecosystem](../infrastructure/docker-mcp.md) - MCP server catalog

---

*Part of AgentPod Multi-Agent Ecosystem Research*
