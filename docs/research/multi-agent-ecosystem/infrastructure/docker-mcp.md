# Docker MCP Ecosystem

> **Version:** 1.0.0  
> **Last Updated:** January 5, 2026  
> **Status:** Production

---

## Overview

| Attribute | Value |
|-----------|-------|
| **Provider** | Docker |
| **Registry** | https://hub.docker.com/u/mcp |
| **Catalog** | 240+ MCP servers |
| **Format** | OCI container images |

---

## What is Docker MCP?

Docker provides a curated catalog of MCP (Model Context Protocol) servers as container images. This makes it easy to:
- **Discover** available tools
- **Deploy** MCP servers consistently
- **Isolate** tool execution
- **Scale** tool infrastructure

---

## Catalog Overview

### Total Servers

240+ MCP servers available in the `mcp/` namespace on Docker Hub.

### Popular Servers by Category

#### Browser & Automation

| Server | Description | Pulls |
|--------|-------------|-------|
| `mcp/playwright` | Browser automation | 100K+ |
| `mcp/puppeteer` | Chrome automation | 50K+ |

#### Databases

| Server | Description | Pulls |
|--------|-------------|-------|
| `mcp/postgres` | PostgreSQL queries | 50K+ |
| `mcp/mongodb` | MongoDB access | 50K+ |
| `mcp/redis` | Redis operations | 10K+ |
| `mcp/neo4j-cypher` | Neo4j graph queries | 10K+ |
| `mcp/neo4j-memory` | Graph-based memory | 9.5K |

#### Cloud & Infrastructure

| Server | Description | Pulls |
|--------|-------------|-------|
| `mcp/kubernetes` | K8s management | 10K+ |
| `mcp/docker` | Docker operations | 10K+ |
| `mcp/terraform` | Infrastructure as code | 5K+ |

#### Developer Tools

| Server | Description | Pulls |
|--------|-------------|-------|
| `mcp/github` | GitHub operations | 10K+ |
| `mcp/gitlab` | GitLab integration | 5K+ |
| `mcp/linear` | Linear issue tracking | 5K+ |
| `mcp/jira` | Jira integration | 5K+ |

#### Payments & E-Commerce

| Server | Description | Pulls |
|--------|-------------|-------|
| `mcp/stripe` | Stripe API | 10K+ |
| `mcp/paypal` | PayPal integration | 3K+ |
| `mcp/shopify` | Shopify operations | 2K+ |

#### Communication

| Server | Description | Pulls |
|--------|-------------|-------|
| `mcp/slack` | Slack integration | 10K+ |
| `mcp/discord` | Discord bot tools | 5K+ |
| `mcp/email` | Email operations | 5K+ |

#### AI & ML

| Server | Description | Pulls |
|--------|-------------|-------|
| `mcp/openai` | OpenAI API wrapper | 10K+ |
| `mcp/huggingface` | HuggingFace models | 5K+ |
| `mcp/langchain` | LangChain tools | 3K+ |

#### Code Execution

| Server | Description | Pulls |
|--------|-------------|-------|
| `mcp/node-code-sandbox` | Node.js sandbox | 100K+ |
| `mcp/python-sandbox` | Python sandbox | 50K+ |

---

## Using Docker MCP Servers

### Running a Server

```bash
# Run MCP server directly
docker run -it --rm \
  -e GITHUB_TOKEN="your-token" \
  mcp/github

# Run with port mapping (for HTTP transport)
docker run -d -p 8080:8080 \
  -e DATABASE_URL="postgres://..." \
  mcp/postgres
```

### Configuration

Most servers accept configuration via environment variables:

```bash
docker run -it --rm \
  -e STRIPE_API_KEY="sk_..." \
  -e STRIPE_WEBHOOK_SECRET="whsec_..." \
  mcp/stripe
```

### Docker Compose

```yaml
version: '3.8'

services:
  mcp-github:
    image: mcp/github
    environment:
      - GITHUB_TOKEN=${GITHUB_TOKEN}
    
  mcp-postgres:
    image: mcp/postgres
    environment:
      - DATABASE_URL=${DATABASE_URL}
    
  mcp-slack:
    image: mcp/slack
    environment:
      - SLACK_BOT_TOKEN=${SLACK_BOT_TOKEN}
```

---

## Docker MCP Catalog

Docker provides a catalog service for discovering MCP servers:

```bash
# Pull catalog
docker pull mcp/docker-mcp-catalog

# Run catalog API
docker run -d -p 3000:3000 mcp/docker-mcp-catalog

# Query available servers
curl http://localhost:3000/servers
```

### Catalog API

```json
{
  "servers": [
    {
      "name": "github",
      "description": "GitHub operations",
      "image": "mcp/github",
      "tools": ["create_issue", "list_repos", "search_code"],
      "resources": ["repos", "issues", "pull_requests"],
      "configuration": {
        "GITHUB_TOKEN": {
          "required": true,
          "description": "GitHub personal access token"
        }
      }
    }
  ]
}
```

---

## Integration Patterns

### Pattern 1: Sidecar Deployment

Run MCP servers as sidecars alongside your agent:

```yaml
# docker-compose.yml
services:
  agent:
    image: my-agent
    depends_on:
      - mcp-github
      - mcp-postgres
    environment:
      - MCP_SERVERS=mcp-github:8080,mcp-postgres:8081
      
  mcp-github:
    image: mcp/github
    
  mcp-postgres:
    image: mcp/postgres
```

### Pattern 2: MCP Gateway

Central gateway managing multiple MCP servers:

```
┌─────────────────────────────────────────────────────────────┐
│                        Agent                                │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                     MCP Gateway                             │
│              (Routes to appropriate server)                 │
└─────────────────────────────────────────────────────────────┘
                           │
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
    ┌──────────┐    ┌──────────┐    ┌──────────┐
    │mcp/github│    │mcp/postgres│    │mcp/slack│
    └──────────┘    └──────────┘    └──────────┘
```

### Pattern 3: On-Demand Spawning

Spawn MCP servers on demand:

```typescript
import Docker from 'dockerode';

const docker = new Docker();

async function spawnMCPServer(serverName: string, config: Record<string, string>) {
  const container = await docker.createContainer({
    Image: `mcp/${serverName}`,
    Env: Object.entries(config).map(([k, v]) => `${k}=${v}`),
    HostConfig: {
      AutoRemove: true
    }
  });
  
  await container.start();
  return container;
}

// Usage
const githubServer = await spawnMCPServer('github', {
  GITHUB_TOKEN: process.env.GITHUB_TOKEN
});
```

---

## Security Considerations

### Network Isolation

```yaml
services:
  agent:
    networks:
      - internal
      - external
      
  mcp-postgres:
    networks:
      - internal  # Only accessible from agent
      
networks:
  internal:
    internal: true
  external:
```

### Secret Management

```yaml
services:
  mcp-stripe:
    image: mcp/stripe
    secrets:
      - stripe_api_key
      
secrets:
  stripe_api_key:
    external: true
```

### Resource Limits

```yaml
services:
  mcp-code-sandbox:
    image: mcp/node-code-sandbox
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 512M
```

---

## Building Custom MCP Servers

### Dockerfile Template

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

# MCP servers typically use stdio transport
CMD ["node", "index.js"]
```

### Publishing to Docker Hub

```bash
# Build
docker build -t myorg/mcp-myserver .

# Tag
docker tag myorg/mcp-myserver myorg/mcp-myserver:v1.0.0

# Push
docker push myorg/mcp-myserver:v1.0.0
```

---

## AgentPod Integration

### Current State

AgentPod already uses Docker containers for sandboxes. The Docker MCP ecosystem is a natural fit.

### Recommended Integration

1. **MCP Server Selection UI** - Let users choose MCP servers from catalog
2. **Automatic Provisioning** - Spawn MCP servers per sandbox
3. **Tool Discovery** - Auto-discover tools from configured servers

### Implementation Example

```typescript
// apps/api/src/services/mcp-manager.ts

export class MCPManager {
  private docker: Docker;
  
  async provisionForSandbox(sandboxId: string, servers: string[]) {
    const containers = await Promise.all(
      servers.map(server => this.spawnServer(sandboxId, server))
    );
    
    return containers;
  }
  
  private async spawnServer(sandboxId: string, server: string) {
    const container = await this.docker.createContainer({
      Image: `mcp/${server}`,
      name: `mcp-${server}-${sandboxId}`,
      NetworkMode: `sandbox-${sandboxId}`,
      Labels: {
        'agentpod.sandbox': sandboxId,
        'agentpod.mcp-server': server
      }
    });
    
    await container.start();
    return container;
  }
}
```

### Frontend Integration

```svelte
<script>
  import { mcpCatalog } from '$lib/stores/mcp';
  
  let selectedServers = [];
</script>

<div class="mcp-selector">
  <h3>Available Tools</h3>
  
  {#each $mcpCatalog as server}
    <label>
      <input 
        type="checkbox" 
        bind:group={selectedServers}
        value={server.name}
      />
      <span>{server.name}</span>
      <span class="description">{server.description}</span>
    </label>
  {/each}
</div>
```

---

## Resources

- **Docker Hub Catalog:** https://hub.docker.com/u/mcp
- **MCP Specification:** https://spec.modelcontextprotocol.io
- **Docker Documentation:** https://docs.docker.com

---

## Related Documentation

- [MCP Protocol](../protocols/mcp.md) - Protocol specification
- [Cloudflare Agents](../frameworks/cloudflare-agents.md) - Alternative deployment
- [AWS AgentCore](../frameworks/aws-agents.md#amazon-bedrock-agentcore) - MCP Gateway support

---

*Part of AgentPod Multi-Agent Ecosystem Research*
