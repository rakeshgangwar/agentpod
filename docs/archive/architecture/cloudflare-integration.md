# Cloudflare Sandbox Implementation Guide

> **Status:** Implemented  
> **Created:** December 2025  
> **Related:** [Design Doc](../ideas/cloudflare-sandbox-integration.md) | [Use Cases](../ideas/opencode-cloudflare-use-cases.md)

## Overview

This document provides a technical deep-dive into the implemented Cloudflare Sandbox integration for AgentPod. It covers the architecture, code organization, deployment, and operational considerations.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      AgentPod Frontend                          │
│                    (SvelteKit + React)                          │
└───────────────────────────┬─────────────────────────────────────┘
                            │ HTTP/WebSocket
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                      AgentPod API                               │
│                    (Bun + Hono)                                 │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                 Provider Layer                             │ │
│  │                                                            │ │
│  │   selectProvider()  ──►  DockerSandboxProvider            │ │
│  │         │                                                  │ │
│  │         └──────────►  CloudflareSandboxProvider           │ │
│  └───────────────────────────────────────────────────────────┘ │
│                            │                                    │
│  ┌─────────────────────────┼───────────────────────────────┐   │
│  │         Routes          │                               │   │
│  │                         ▼                               │   │
│  │   /api/v2/agents/task ──► Create & execute tasks        │   │
│  │   /api/v2/agents/team ──► Multi-agent workflows        │   │
│  │   /api/v2/cloudflare/webhook ──► Event handling        │   │
│  └─────────────────────────────────────────────────────────┘   │
└───────────────────────────┬─────────────────────────────────────┘
                            │ HTTPS
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│              Cloudflare Worker (Edge)                           │
│         https://agentpod-sandbox.mail-88a.workers.dev           │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                  Routes                                    │ │
│  │                                                            │ │
│  │   GET  /health              → Health check                │ │
│  │   POST /sandbox             → Create sandbox              │ │
│  │   GET  /sandbox/:id         → Get sandbox info            │ │
│  │   DELETE /sandbox/:id       → Delete sandbox              │ │
│  │   POST /sandbox/:id/wake    → Wake hibernating sandbox    │ │
│  │   ANY  /sandbox/:id/opencode/* → Proxy to OpenCode UI     │ │
│  │   POST /sandbox/:id/message → Send message (API)          │ │
│  │   POST /sandbox/:id/sync    → Sync workspace to R2        │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌────────────────┐ │
│  │ Durable Objects │  │   R2 Bucket     │  │ OpenCode SDK   │ │
│  │ (Sandbox State) │  │ (Workspaces)    │  │ Integration    │ │
│  └─────────────────┘  └─────────────────┘  └────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## File Structure

```
agentpod/
├── cloudflare/
│   └── worker/
│       ├── src/
│       │   ├── index.ts        # Main worker entry point
│       │   └── storage.ts      # R2 workspace storage utility
│       ├── Dockerfile          # Container with OpenCode pre-installed
│       ├── package.json
│       ├── tsconfig.json
│       └── wrangler.jsonc      # Cloudflare deployment config
│
├── apps/api/src/
│   ├── services/providers/
│   │   ├── types.ts            # SandboxProvider interface
│   │   ├── index.ts            # Provider factory
│   │   ├── docker-provider.ts  # Docker implementation
│   │   ├── cloudflare-provider.ts  # Cloudflare implementation
│   │   └── config-adapter.ts   # Config format conversion
│   │
│   ├── routes/
│   │   ├── agents.ts           # /api/v2/agents/* routes
│   │   └── cloudflare-webhook.ts  # Webhook handler
│   │
│   └── db/schema/
│       └── cloudflare.ts       # Database tables for Cloudflare
│
└── docs/
    ├── ideas/
    │   ├── cloudflare-sandbox-integration.md  # Design doc
    │   └── opencode-cloudflare-use-cases.md   # Use cases
    └── implementation/
        └── cloudflare-implementation-guide.md  # This file
```

---

## Component Details

### 1. Cloudflare Worker (`cloudflare/worker/src/index.ts`)

The worker handles all sandbox lifecycle operations:

```typescript
// Key imports from Cloudflare Sandbox SDK
import { getSandbox } from "@cloudflare/sandbox";
import {
  createOpencode,
  createOpencodeServer,
  proxyToOpencode,
} from "@cloudflare/sandbox/opencode";

// Environment bindings
interface Env {
  Sandbox: DurableObjectNamespace;  // Sandbox state
  WORKSPACE_BUCKET: R2Bucket;       // File storage
  AGENTPOD_API_URL: string;         // Callback URL
  AGENTPOD_API_TOKEN: string;       // Auth token
}
```

#### Route Handlers

| Route | Method | Handler | Description |
|-------|--------|---------|-------------|
| `/health` | GET | `handleHealth` | Health check |
| `/sandbox` | POST | `handleCreateSandbox` | Create new sandbox |
| `/sandbox/:id` | GET | `handleGetSandbox` | Get sandbox info |
| `/sandbox/:id` | DELETE | `handleDeleteSandbox` | Delete sandbox |
| `/sandbox/:id/wake` | POST | `handleWakeSandbox` | Wake from hibernation |
| `/sandbox/:id/opencode/*` | ANY | `handleOpenCodeProxy` | Proxy to OpenCode UI |
| `/sandbox/:id/message` | POST | `handleSendMessage` | Send message to AI |
| `/sandbox/:id/sync` | POST | `handleSyncWorkspace` | Sync to R2 |

#### Key Functions

**Creating a Sandbox:**
```typescript
async function handleCreateSandbox(request: Request, env: Env) {
  const { id, userId, config, gitUrl, gitBranch } = await request.json();
  
  // Get sandbox instance via Durable Object
  const sandbox = getSandbox(env.Sandbox, id);
  
  // Clone repository if provided
  if (gitUrl) {
    await sandbox.gitCheckout(gitUrl, { targetDir: directory, branch: gitBranch });
  }
  
  // Start OpenCode server inside sandbox
  const server = await createOpencodeServer(sandbox, {
    directory,
    config,  // LLM provider credentials
  });
  
  // Notify AgentPod API
  await notifyAgentPodAPI(env, "sandbox.created", { sandboxId, userId });
  
  return Response.json({ success: true, sandboxId, status: "running" });
}
```

**Sending Messages:**
```typescript
async function handleSendMessage(request: Request, env: Env, sandboxId: string) {
  const { message, sessionId, model, config } = await request.json();
  
  // Get typed OpenCode SDK client
  const { client } = await createOpencode<OpencodeClient>(sandbox, {
    directory: "/home/user/workspace",
    config,
  });
  
  // Create or reuse session
  let sid = sessionId;
  if (!sid) {
    const session = await client.session.create({ body: { title: "Agent Task" } });
    sid = session.data.id;
  }
  
  // Send message and get response
  const response = await client.session.prompt({
    path: { id: sid },
    body: {
      parts: [{ type: "text", text: message }],
      model,
    },
  });
  
  return Response.json({
    sessionId: sid,
    response: extractText(response),
    parts: response.data?.parts,
  });
}
```

---

### 2. R2 Workspace Storage (`cloudflare/worker/src/storage.ts`)

Provides persistent storage for sandbox workspaces:

```typescript
export class WorkspaceStorage {
  constructor(private bucket: R2Bucket, private sandboxId: string) {}
  
  // Save file to R2
  async saveFile(path: string, content: ArrayBuffer | string): Promise<void> {
    const key = `workspaces/${this.sandboxId}/${path}`;
    await this.bucket.put(key, content);
  }
  
  // Load file from R2
  async loadFile(path: string): Promise<ArrayBuffer | null> {
    const object = await this.bucket.get(this.getKey(path));
    return object?.arrayBuffer() ?? null;
  }
  
  // List all files in workspace
  async listFiles(): Promise<string[]> {
    const objects = await this.bucket.list({ prefix: `workspaces/${this.sandboxId}/` });
    return objects.objects.map(obj => obj.key);
  }
  
  // Delete entire workspace
  async deleteAllFiles(): Promise<void> {
    const files = await this.listFiles();
    for (const file of files) {
      await this.deleteFile(file);
    }
  }
}
```

---

### 3. API Provider (`apps/api/src/services/providers/cloudflare-provider.ts`)

The API-side client for communicating with the Cloudflare Worker:

```typescript
export class CloudflareSandboxProvider implements SandboxProvider {
  readonly type = "cloudflare" as const;
  
  constructor(workerUrl?: string, apiToken?: string) {
    this.workerUrl = workerUrl ?? config.cloudflare.workerUrl;
    this.apiToken = apiToken ?? config.cloudflare.apiToken;
  }
  
  // Create a new sandbox
  async createSandbox(options: SandboxProviderOptions): Promise<SandboxInfo> {
    const result = await this.workerFetch("/sandbox", {
      method: "POST",
      body: JSON.stringify({
        id: options.id,
        userId: options.userId,
        config: openCodeConfigToCloudflare(options.config),
        gitUrl: options.gitUrl,
        gitBranch: options.gitBranch,
      }),
    });
    
    return {
      id: options.id,
      status: "running",
      provider: "cloudflare",
      opencodeUrl: `${this.workerUrl}/sandbox/${options.id}/opencode`,
    };
  }
  
  // Send message to sandbox
  async sendMessage(sandboxId: string, message: string, options?: SendOptions) {
    const result = await this.workerFetch(`/sandbox/${sandboxId}/message`, {
      method: "POST",
      body: JSON.stringify({
        message,
        sessionId: options?.sessionId,
        model: options?.model,
        config: options?.config,
      }),
    });
    
    return {
      sessionId: result.sessionId,
      response: result.response,
    };
  }
}
```

---

### 4. Provider Factory (`apps/api/src/services/providers/index.ts`)

Intelligent provider selection:

```typescript
export function selectProvider(options: ProviderSelectionOptions): SandboxProvider {
  // Explicit provider selection
  if (options.provider === "cloudflare" && isCloudflareConfigured()) {
    return getCloudflareProvider();
  }
  
  if (options.provider === "docker") {
    return getDockerProvider();
  }
  
  // Auto-selection based on use case
  if (options.useCase === "quick-task" && isCloudflareConfigured()) {
    return getCloudflareProvider();  // Fast, cheap
  }
  
  if (options.useCase === "development") {
    return getDockerProvider();  // Persistent, full features
  }
  
  // Default to Docker if available, else Cloudflare
  return getDockerProvider();
}

// Check if Cloudflare is configured
export function isCloudflareConfigured(): boolean {
  return !!config.cloudflare.enabled && !!config.cloudflare.workerUrl;
}
```

---

### 5. Agent Routes (`apps/api/src/routes/agents.ts`)

API endpoints for agent tasks:

```typescript
export const agentRoutes = new Hono()
  // POST /api/v2/agents/task - Execute single agent task
  .post("/task", async (c) => {
    const { message, gitUrl, model, provider } = c.req.valid("json");
    const userId = getAuthenticatedUserId(c);
    
    // Select provider
    const sandboxProvider = selectProvider({
      provider,
      useCase: "quick-task",
    });
    
    // Create sandbox
    const sandbox = await sandboxProvider.createSandbox({
      id: `task-${nanoid(12)}`,
      userId,
      gitUrl,
    });
    
    // Get OpenCode client and send message
    const client = await sandboxProvider.getOpenCodeClient(sandbox.id);
    const session = await client.session.create({ body: {} });
    const response = await client.session.prompt({
      path: { id: session.data.id },
      body: { parts: [{ type: "text", text: message }], model },
    });
    
    return c.json({
      taskId,
      sandboxId: sandbox.id,
      sessionId: session.data.id,
      response: extractText(response),
    });
  })
  
  // POST /api/v2/agents/team - Execute multi-agent team
  .post("/team", async (c) => {
    const { agents, gitUrl } = c.req.valid("json");
    
    // Create parallel sandboxes for each agent
    const results = await Promise.all(
      agents.map(async (agent, index) => {
        const sandbox = await provider.createSandbox({
          id: `team-${teamId}-agent-${index}`,
          userId,
          gitUrl,
        });
        
        const client = await provider.getOpenCodeClient(sandbox.id);
        const session = await client.session.create({});
        const response = await client.session.prompt({
          path: { id: session.data.id },
          body: { parts: [{ type: "text", text: agent.message }] },
        });
        
        return { role: agent.role, sandboxId: sandbox.id, response };
      })
    );
    
    return c.json({ teamId, agents: results });
  })
  
  // GET /api/v2/agents/providers - List available providers
  .get("/providers", async (c) => {
    return c.json({
      docker: { available: true },
      cloudflare: { available: isCloudflareConfigured() },
    });
  });
```

---

### 6. Database Schema (`apps/api/src/db/schema/cloudflare.ts`)

```typescript
// Agent tasks table
export const agentTasks = pgTable("agent_tasks", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id),
  sandboxId: text("sandbox_id").notNull(),
  provider: sandboxProviderEnum("provider").default("cloudflare"),
  status: agentTaskStatusEnum("status").default("pending"),
  message: text("message").notNull(),
  response: text("response"),
  sessionId: text("session_id"),
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  error: text("error"),
});

// Cloudflare sandboxes table
export const cloudflareSandboxes = pgTable("cloudflare_sandboxes", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id),
  status: cloudflareSandboxStatusEnum("status").default("sleeping"),
  workerUrl: text("worker_url").notNull(),
  workspaceSyncedAt: timestamp("workspace_synced_at"),
  lastActiveAt: timestamp("last_active_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
```

---

## Configuration

### Environment Variables

```bash
# Root .env file
ENABLE_CLOUDFLARE_SANDBOXES=true
CLOUDFLARE_WORKER_URL=https://agentpod-sandbox.mail-88a.workers.dev
CLOUDFLARE_API_TOKEN=your-cloudflare-api-token
```

### Wrangler Configuration (`cloudflare/worker/wrangler.jsonc`)

```jsonc
{
  "name": "agentpod-sandbox",
  "main": "src/index.ts",
  "compatibility_date": "2024-12-01",
  "compatibility_flags": ["nodejs_compat"],
  
  // Durable Objects for sandbox state
  "durable_objects": {
    "bindings": [
      { "name": "Sandbox", "class_name": "Sandbox" }
    ]
  },
  
  // R2 bucket for workspace storage
  "r2_buckets": [
    {
      "binding": "WORKSPACE_BUCKET",
      "bucket_name": "agentpod-workspaces"
    }
  ],
  
  // Environment variables
  "vars": {
    "AGENTPOD_API_URL": "https://api.agentpod.dev"
  },
  
  // Container configuration (Sandbox SDK)
  "containers": {
    "dockerfile": "./Dockerfile",
    "expose": [4096]  // OpenCode server port
  }
}
```

---

## Deployment

### Deploy Cloudflare Worker

```bash
cd cloudflare/worker

# Install dependencies
npm install

# Set secrets
wrangler secret put AGENTPOD_API_TOKEN

# Deploy
wrangler deploy
```

### Create R2 Bucket

```bash
wrangler r2 bucket create agentpod-workspaces
```

### Build Container

The Dockerfile installs OpenCode in the container:

```dockerfile
FROM cloudflare/sandbox:0.6.7

# Install OpenCode
RUN npm install -g opencode-ai@1.0.170

# Expose OpenCode server port
EXPOSE 4096
```

---

## Testing

### Health Check

```bash
curl https://agentpod-sandbox.mail-88a.workers.dev/health
# {"status":"ok","timestamp":"2025-12-20T..."}
```

### Create Sandbox

```bash
curl -X POST https://agentpod-sandbox.mail-88a.workers.dev/sandbox \
  -H "Content-Type: application/json" \
  -d '{"id":"test-1","userId":"user-1"}'
# {"success":true,"sandboxId":"test-1","status":"running"}
```

### Send Message

```bash
curl -X POST https://agentpod-sandbox.mail-88a.workers.dev/sandbox/test-1/message \
  -H "Content-Type: application/json" \
  -d '{"message":"What is 2+2?"}'
# {"sessionId":"...","response":"4","parts":[...]}
```

### Via AgentPod API

```bash
# Login first
curl -X POST http://api.localhost/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -c /tmp/cookies.txt \
  -d '{"email":"user@example.com","password":"password"}'

# Execute task
curl -X POST http://api.localhost/api/v2/agents/task \
  -H "Content-Type: application/json" \
  -b /tmp/cookies.txt \
  -d '{"message":"What is 2+2?","provider":"cloudflare"}'
# {"taskId":"...","sandboxId":"...","response":"4"}
```

---

## Monitoring

### Key Metrics

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| `sandbox.created` | New sandbox creations | N/A |
| `sandbox.wake_latency` | Time to wake from sleep | >5s |
| `sandbox.message_latency` | Time to process message | >30s |
| `r2.sync_duration` | Workspace sync time | >60s |
| `r2.storage_bytes` | Total storage used | >1GB per user |

### Logging

All operations are logged with structured data:

```typescript
log.info("Creating Cloudflare sandbox", { 
  sandboxId, 
  userId, 
  provider: "cloudflare" 
});

log.error("Sandbox error", { 
  sandboxId, 
  error: error.message 
});
```

---

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| "Cloudflare sandboxes not configured" | `ENABLE_CLOUDFLARE_SANDBOXES=false` | Set to `true` in .env |
| "Cloudflare worker URL not configured" | Missing `CLOUDFLARE_WORKER_URL` | Add to .env |
| Provider shows unavailable | Environment vars not passed to Docker | Add to docker-compose.yml |
| Sandbox creation timeout | Worker cold start | Retry after 30s |
| "Failed to create session" | OpenCode server not ready | Wait and retry |

### Debug Commands

```bash
# Check provider availability
curl http://api.localhost/api/v2/agents/providers

# Check worker health
curl https://agentpod-sandbox.mail-88a.workers.dev/health

# Check environment in container
docker exec agentpod-api printenv | grep CLOUDFLARE
```

---

## Security Considerations

1. **Authentication**: All API requests require session authentication
2. **Authorization**: Webhook validates `AGENTPOD_API_TOKEN`
3. **Isolation**: Each sandbox runs in separate Durable Object
4. **Data Protection**: Workspaces stored per-sandbox in R2
5. **Secrets**: API tokens stored in Cloudflare Secrets, not code

---

## Future Improvements

- [ ] Implement workspace sync on hibernation
- [ ] Add cost tracking per user
- [ ] Support OAuth token refresh in sandboxes
- [ ] Multi-region worker deployment
- [ ] Frontend provider selector integration
- [ ] Cron-based scheduled tasks
