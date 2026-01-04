# Phase 2: Technical Notes

## Framework: Hono

Hono is the SST team's preferred framework, used in OpenCode itself. Key features:
- Ultrafast routing with `RegExpRouter`
- Multi-runtime support (Bun, Node.js, Deno, Cloudflare Workers)
- Built-in middleware (CORS, validation, auth)
- Type-safe RPC with Hono Client (`hc`)
- ~14KB with no external dependencies

---

## Critical Fixes & Lessons Learned

### Issue 1: Coolify Strips Git URL Domain (BLOCKING)

**Problem**: Coolify's `/applications/public` endpoint strips the domain from git URLs and defaults to GitHub as the source.

```
Input:  git_repository: "https://forgejo.superchotu.com/rakeshgangwar/repo.git"
Stored: git_repository: "rakeshgangwar/repo.git"  # Domain stripped!
Result: Deployment fails - tries to clone from GitHub instead of Forgejo
```

**Root Cause**: Coolify's public git app endpoint sets `source_type: "GithubApp"` and reconstructs URLs assuming GitHub.

**Solution**: Use the `/applications/dockerfile` endpoint instead, which:
1. Accepts raw Dockerfile content (base64 encoded)
2. No git cloning during build - bypasses the URL issue entirely
3. Clone the Forgejo repo at container startup via entrypoint script

```typescript
// Dockerfile must be base64 encoded!
const dockerfileBase64 = Buffer.from(dockerfile).toString('base64');

await coolify.createDockerfileApp({
  projectUuid: config.coolify.projectUuid,
  serverUuid: config.coolify.serverUuid,
  environmentName: 'production',
  dockerfile: dockerfileBase64,  // Base64 encoded!
  portsExposes: '4096',
  name: 'opencode-myproject',
  instantDeploy: false,
});
```

### Issue 2: Forgejo URL Port Not Accessible from Containers

**Problem**: Forgejo returns clone URLs with internal port (`:3000`), but containers can't reach that port externally.

```
Forgejo returns: https://forgejo.superchotu.com:3000/owner/repo.git
Container error: Failed to connect to forgejo.superchotu.com port 3000
```

**Solution**: Transform URLs to use public HTTPS (through Traefik reverse proxy):

```typescript
// Fallback regex: strip port from HTTPS URLs
const publicCloneUrl = cloneUrl.replace(
  /^(https:\/\/[^/:]+):\d+(\/.*)/,
  '$1$2'
);
// Result: https://forgejo.superchotu.com/owner/repo.git
```

### Issue 3: Coolify Deploy Endpoint

**Problem**: Documentation suggested `/applications/{uuid}/deploy` but it returned 404.

**Solution**: Use `/deploy?uuid={uuid}` (query parameter, not path parameter):

```typescript
async deployApplication(uuid: string, force: boolean = false) {
  const forceParam = force ? '&force=true' : '';
  return request('GET', `/deploy?uuid=${uuid}${forceParam}`);
}
```

### Issue 4: Coolify Environment Variable "Duplicates"

**Observation**: Coolify creates both `is_preview: true` and `is_preview: false` versions of each env var.

**Explanation**: This is intentional behavior for preview deployment support. Use `filterPreview: true` when listing to get only production vars:

```typescript
async listEnvVars(appUuid: string, filterPreview: boolean = false) {
  const envVars = await request('GET', `/applications/${appUuid}/envs`);
  return filterPreview ? envVars.filter(e => !e.is_preview) : envVars;
}
```

### Issue 5: Bulk Environment Variable Updates

**Problem**: Setting env vars one-by-one is slow and error-prone.

**Solution**: Use the bulk update endpoint:

```typescript
async setEnvVars(appUuid: string, vars: Record<string, string>) {
  const data = Object.entries(vars).map(([key, value]) => ({
    key,
    value,
    is_preview: false,
    is_literal: true,
  }));
  await request('PATCH', `/applications/${appUuid}/envs/bulk`, { data });
}
```

---

## Final Working Architecture

### Container Creation Flow

```
1. Create Forgejo repo (empty or mirror from GitHub)
2. Create Coolify app with embedded Dockerfile (base64)
3. Set env vars (FORGEJO_REPO_URL with public URL, LLM keys)
4. Deploy triggers build
5. Container starts, entrypoint clones Forgejo repo
6. OpenCode server starts on configured port
```

### Embedded Dockerfile Approach

The Dockerfile is embedded directly in the API code to avoid git cloning issues:

```dockerfile
FROM node:20-slim

RUN apt-get update && apt-get install -y git curl && rm -rf /var/lib/apt/lists/*
RUN npm install -g opencode-ai

WORKDIR /workspace

# Entrypoint created via printf (heredocs don't work in Dockerfile)
RUN printf '%s\n' \
    '#!/bin/bash' \
    'set -e' \
    'if [ -n "$FORGEJO_REPO_URL" ]; then git clone "$FORGEJO_REPO_URL" /workspace; fi' \
    'exec opencode serve --port "${OPENCODE_PORT:-4096}"' \
    > /entrypoint.sh && chmod +x /entrypoint.sh

EXPOSE 4096
HEALTHCHECK CMD curl -f http://localhost:${OPENCODE_PORT}/app || exit 1
ENTRYPOINT ["/entrypoint.sh"]
```

### Configuration

```bash
# .env
FORGEJO_URL=https://forgejo.superchotu.com:3000      # API access (internal)
FORGEJO_PUBLIC_URL=https://forgejo.superchotu.com    # Clone URL (external)
```

---

## Project Structure

```
management-api/
├── src/
│   ├── index.ts              # Entry point, Hono app setup
│   ├── config.ts             # Environment config
│   ├── db/
│   │   ├── index.ts          # Database connection
│   │   ├── schema.sql        # Table definitions
│   │   └── migrations.ts     # Migration runner
│   ├── routes/
│   │   ├── index.ts          # Route aggregation & AppType export
│   │   ├── health.ts         # Health endpoints
│   │   ├── projects.ts       # Project CRUD
│   │   ├── providers.ts      # LLM provider config
│   │   └── sync.ts           # GitHub sync
│   ├── services/
│   │   ├── coolify.ts        # Coolify API client
│   │   ├── forgejo.ts        # Forgejo API client
│   │   ├── github.ts         # GitHub operations
│   │   ├── project-manager.ts # Core business logic
│   │   └── github-import.ts  # Import from GitHub
│   ├── models/
│   │   ├── project.ts        # Project data model
│   │   └── provider.ts       # Provider data model
│   └── utils/
│       ├── logger.ts         # Logging utility
│       └── errors.ts         # Custom error classes
├── Dockerfile
├── package.json
├── tsconfig.json
└── .env.example
```

---

## Database Schema

```sql
-- schema.sql

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  
  -- Forgejo
  forgejo_repo_url TEXT NOT NULL,
  forgejo_repo_id INTEGER,
  
  -- Coolify
  coolify_app_uuid TEXT NOT NULL,
  container_port INTEGER DEFAULT 4096,
  
  -- GitHub sync
  github_repo_url TEXT,
  github_sync_enabled INTEGER DEFAULT 0,
  github_sync_direction TEXT DEFAULT 'push', -- 'push', 'pull', 'bidirectional'
  last_sync_at TEXT,
  
  -- LLM config
  llm_provider TEXT,  -- NULL = use default
  
  -- Status
  status TEXT DEFAULT 'creating', -- 'creating', 'running', 'stopped', 'error'
  
  -- Timestamps
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS providers (
  id TEXT PRIMARY KEY,  -- 'openrouter', 'anthropic', 'openai', etc.
  name TEXT NOT NULL,
  type TEXT NOT NULL,   -- 'api_key', 'oauth'
  api_key TEXT,         -- Encrypted or stored in Coolify
  is_default INTEGER DEFAULT 0,
  is_configured INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_projects_slug ON projects(slug);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
```

---

## Configuration

```typescript
// src/config.ts
import { config as dotenv } from 'dotenv';

dotenv();

export const config = {
  port: parseInt(process.env.PORT || '3001'),
  
  coolify: {
    url: process.env.COOLIFY_URL || 'http://localhost:8000',
    token: process.env.COOLIFY_TOKEN || '',
    projectUuid: process.env.COOLIFY_PROJECT_UUID || '', // Pre-created project
    serverUuid: process.env.COOLIFY_SERVER_UUID || '',   // VPS server UUID
  },
  
  forgejo: {
    url: process.env.FORGEJO_URL || 'http://localhost:3000',
    token: process.env.FORGEJO_TOKEN || '',
    owner: process.env.FORGEJO_OWNER || 'admin', // Default repo owner
  },
  
  opencode: {
    image: process.env.OPENCODE_IMAGE || 'yourusername/opencode-server:latest',
    basePort: parseInt(process.env.OPENCODE_BASE_PORT || '4001'),
  },
  
  database: {
    path: process.env.DATABASE_PATH || './data/database.sqlite',
  },
  
  auth: {
    token: process.env.API_TOKEN || 'change-me-in-production',
  },
};
```

---

## Coolify Client

```typescript
// src/services/coolify.ts
import { config } from '../config';

const BASE_URL = `${config.coolify.url}/api/v1`;

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${config.coolify.token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Coolify API error: ${response.status} - ${error}`);
  }
  
  return response.json();
}

export const coolify = {
  async listServers() {
    return request<Server[]>('GET', '/servers');
  },
  
  async createDockerImageApp(options: {
    name: string;
    image: string;
    tag: string;
    port: number;
    envVars?: Record<string, string>;
  }) {
    const app = await request<{ uuid: string }>('POST', '/applications/dockerimage', {
      project_uuid: config.coolify.projectUuid,
      server_uuid: config.coolify.serverUuid,
      environment_name: 'production',
      docker_registry_image_name: options.image,
      docker_registry_image_tag: options.tag,
      ports_exposes: String(options.port),
      name: options.name,
      instant_deploy: false, // Don't deploy yet, set env vars first
    });
    
    // Set environment variables
    if (options.envVars) {
      for (const [key, value] of Object.entries(options.envVars)) {
        await request('POST', `/applications/${app.uuid}/envs`, {
          key,
          value,
          is_build_time: false,
        });
      }
    }
    
    return app;
  },
  
  async startApplication(uuid: string) {
    return request('GET', `/applications/${uuid}/start`);
  },
  
  async stopApplication(uuid: string) {
    return request('GET', `/applications/${uuid}/stop`);
  },
  
  async deleteApplication(uuid: string) {
    return request('DELETE', `/applications/${uuid}`);
  },
  
  async getApplication(uuid: string) {
    return request<Application>('GET', `/applications/${uuid}`);
  },
  
  async setEnvVar(uuid: string, key: string, value: string) {
    return request('POST', `/applications/${uuid}/envs`, {
      key,
      value,
      is_build_time: false,
    });
  },
};
```

---

## Forgejo Client

```typescript
// src/services/forgejo.ts
import { config } from '../config';

const BASE_URL = `${config.forgejo.url}/api/v1`;

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Authorization': `token ${config.forgejo.token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Forgejo API error: ${response.status} - ${error}`);
  }
  
  return response.json();
}

export const forgejo = {
  async createRepo(name: string, description?: string) {
    return request<Repository>('POST', '/user/repos', {
      name,
      description,
      private: false,
      auto_init: true, // Create with README
    });
  },
  
  async deleteRepo(owner: string, name: string) {
    return request('DELETE', `/repos/${owner}/${name}`);
  },
  
  async getRepo(owner: string, name: string) {
    return request<Repository>('GET', `/repos/${owner}/${name}`);
  },
  
  async listRepos() {
    return request<Repository[]>('GET', '/user/repos');
  },
  
  getCloneUrl(owner: string, name: string): string {
    return `${config.forgejo.url}/${owner}/${name}.git`;
  },
};
```

---

## Project Manager

```typescript
// src/services/project-manager.ts
import { nanoid } from 'nanoid';
import { coolify } from './coolify';
import { forgejo } from './forgejo';
import { db } from '../db';
import { config } from '../config';

export async function createProject(options: {
  name: string;
  description?: string;
  source: {
    type: 'empty' | 'github';
    githubUrl?: string;
    syncEnabled?: boolean;
    syncDirection?: 'push' | 'pull' | 'bidirectional';
  };
  llmProvider?: string;
}) {
  const id = nanoid();
  const slug = options.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const port = await getNextAvailablePort();
  
  try {
    // 1. Create Forgejo repo
    let repo;
    if (options.source.type === 'empty') {
      repo = await forgejo.createRepo(slug, options.description);
    } else {
      // GitHub import - handled separately
      repo = await importFromGitHub(options.source.githubUrl!, slug);
    }
    
    // 2. Get LLM credentials
    const credentials = await getLLMCredentials(options.llmProvider);
    
    // 3. Create Coolify app
    const app = await coolify.createDockerImageApp({
      name: `opencode-${slug}`,
      image: config.opencode.image.split(':')[0],
      tag: config.opencode.image.split(':')[1] || 'latest',
      port,
      envVars: {
        FORGEJO_REPO_URL: forgejo.getCloneUrl(config.forgejo.owner, slug),
        OPENCODE_PORT: String(port),
        OPENCODE_HOST: '0.0.0.0',
        ...credentials,
      },
    });
    
    // 4. Save to database
    db.prepare(`
      INSERT INTO projects (id, name, slug, description, forgejo_repo_url, coolify_app_uuid, container_port, github_repo_url, github_sync_enabled, github_sync_direction, llm_provider, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      options.name,
      slug,
      options.description || null,
      repo.clone_url,
      app.uuid,
      port,
      options.source.githubUrl || null,
      options.source.syncEnabled ? 1 : 0,
      options.source.syncDirection || 'push',
      options.llmProvider || null,
      'stopped'
    );
    
    // 5. Start container
    await coolify.startApplication(app.uuid);
    
    // 6. Update status
    db.prepare('UPDATE projects SET status = ? WHERE id = ?').run('running', id);
    
    return getProject(id);
  } catch (error) {
    // Cleanup on failure
    console.error('Project creation failed:', error);
    throw error;
  }
}

async function getNextAvailablePort(): Promise<number> {
  const result = db.prepare('SELECT MAX(container_port) as max_port FROM projects').get() as { max_port: number | null };
  return (result.max_port || config.opencode.basePort - 1) + 1;
}

async function getLLMCredentials(providerId?: string): Promise<Record<string, string>> {
  const provider = providerId
    ? db.prepare('SELECT * FROM providers WHERE id = ?').get(providerId)
    : db.prepare('SELECT * FROM providers WHERE is_default = 1').get();
  
  if (!provider) {
    return {};
  }
  
  // Map provider to environment variable
  const envVarMap: Record<string, string> = {
    'anthropic': 'ANTHROPIC_API_KEY',
    'openai': 'OPENAI_API_KEY',
    'openrouter': 'OPENROUTER_API_KEY',
  };
  
  const envVar = envVarMap[provider.id];
  if (envVar && provider.api_key) {
    return { [envVar]: provider.api_key };
  }
  
  return {};
}
```

---

## Hono App Entry Point

```typescript
// src/index.ts
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { bearerAuth } from 'hono/bearer-auth';
import { config } from './config';
import { projectRoutes } from './routes/projects';
import { providerRoutes } from './routes/providers';
import { healthRoutes } from './routes/health';

const app = new Hono()
  .use('*', logger())
  .use('*', cors())
  .use('/api/*', bearerAuth({ token: config.auth.token }))
  .route('/', healthRoutes)
  .route('/', projectRoutes)
  .route('/', providerRoutes);

// Export type for Hono Client (type-safe RPC from mobile app)
export type AppType = typeof app;

export default app;

// Start server
const port = config.port;
console.log(`Management API running on port ${port}`);

Bun.serve({
  fetch: app.fetch,
  port,
});
```

---

## API Routes

```typescript
// src/routes/projects.ts
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { createProject, getProject, listProjects, deleteProject, startProject, stopProject } from '../services/project-manager';

// Request schemas
const createProjectSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  source: z.object({
    type: z.enum(['empty', 'github']),
    githubUrl: z.string().url().optional(),
    syncEnabled: z.boolean().optional(),
    syncDirection: z.enum(['push', 'pull', 'bidirectional']).optional(),
  }),
  llmProvider: z.string().optional(),
});

export const projectRoutes = new Hono()
  // List all projects
  .get('/api/projects', async (c) => {
    const projects = await listProjects();
    return c.json({ projects });
  })
  
  // Get single project
  .get('/api/projects/:id', async (c) => {
    const id = c.req.param('id');
    const project = await getProject(id);
    if (!project) {
      return c.json({ error: 'Project not found' }, 404);
    }
    return c.json(project);
  })
  
  // Create project
  .post('/api/projects', zValidator('json', createProjectSchema), async (c) => {
    const body = c.req.valid('json');
    const project = await createProject(body);
    return c.json(project, 201);
  })
  
  // Delete project
  .delete('/api/projects/:id', async (c) => {
    const id = c.req.param('id');
    await deleteProject(id);
    return c.json({ success: true });
  })
  
  // Start project
  .post('/api/projects/:id/start', async (c) => {
    const id = c.req.param('id');
    await startProject(id);
    return c.json({ success: true });
  })
  
  // Stop project
  .post('/api/projects/:id/stop', async (c) => {
    const id = c.req.param('id');
    await stopProject(id);
    return c.json({ success: true });
  });
```

---

## Health Routes

```typescript
// src/routes/health.ts
import { Hono } from 'hono';

export const healthRoutes = new Hono()
  .get('/health', (c) => c.json({ status: 'ok' }))
  .get('/api/info', (c) => c.json({
    name: 'Management API',
    version: '1.0.0',
    status: 'running',
  }));
```

---

## Provider Routes

```typescript
// src/routes/providers.ts
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { listProviders, configureProvider, setDefaultProvider, removeProvider } from '../services/provider-manager';

const configureSchema = z.object({
  apiKey: z.string().min(1),
});

export const providerRoutes = new Hono()
  .get('/api/providers', async (c) => {
    const providers = await listProviders();
    return c.json({ providers });
  })
  
  .post('/api/providers/:id/configure', zValidator('json', configureSchema), async (c) => {
    const id = c.req.param('id');
    const { apiKey } = c.req.valid('json');
    await configureProvider(id, apiKey);
    return c.json({ success: true });
  })
  
  .post('/api/providers/:id/set-default', async (c) => {
    const id = c.req.param('id');
    await setDefaultProvider(id);
    return c.json({ success: true });
  })
  
  .delete('/api/providers/:id', async (c) => {
    const id = c.req.param('id');
    await removeProvider(id);
    return c.json({ success: true });
  });
```

---

## Dockerfile

```dockerfile
# management-api/Dockerfile
FROM oven/bun:1 AS builder

WORKDIR /app

COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

COPY . .

# Production image
FROM oven/bun:1-slim

WORKDIR /app

# Install SQLite (for better-sqlite3)
RUN apt-get update && apt-get install -y sqlite3 && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/package.json ./

# Create data directory for SQLite
RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV DATABASE_PATH=/app/data/database.sqlite

EXPOSE 3001

CMD ["bun", "run", "src/index.ts"]
```

### Alternative: Node.js Dockerfile

If you prefer Node.js instead of Bun:

```dockerfile
# management-api/Dockerfile (Node.js version)
FROM node:20-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-slim

WORKDIR /app

RUN apt-get update && apt-get install -y sqlite3 && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./

RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV DATABASE_PATH=/app/data/database.sqlite

EXPOSE 3001

# For Node.js, use the node adapter
CMD ["node", "dist/index.js"]
```

For Node.js, update `src/index.ts`:

```typescript
import { serve } from '@hono/node-server';
// ... rest of the app

serve({
  fetch: app.fetch,
  port: config.port,
});
```

---

## Environment Variables

```bash
# .env.example

# Server
PORT=3001

# Authentication
API_TOKEN=your-secret-token

# Coolify
COOLIFY_URL=http://100.x.x.x:8000
COOLIFY_TOKEN=your-coolify-token
COOLIFY_PROJECT_UUID=uuid-of-opencode-project
COOLIFY_SERVER_UUID=uuid-of-vps-server

# Forgejo
FORGEJO_URL=http://100.x.x.x:3000
FORGEJO_TOKEN=your-forgejo-token
FORGEJO_OWNER=admin

# OpenCode
OPENCODE_IMAGE=yourusername/opencode-server:latest
OPENCODE_BASE_PORT=4001

# Database
DATABASE_PATH=./data/database.sqlite
```

---

## Testing with curl

```bash
# Health check
curl http://localhost:3001/health

# Create project (empty)
curl -X POST http://localhost:3001/api/projects \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-token" \
  -d '{
    "name": "My Project",
    "description": "Test project",
    "source": { "type": "empty" }
  }'

# Create project (from GitHub)
curl -X POST http://localhost:3001/api/projects \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-token" \
  -d '{
    "name": "Imported Project",
    "source": {
      "type": "github",
      "githubUrl": "https://github.com/user/repo",
      "syncEnabled": true,
      "syncDirection": "bidirectional"
    }
  }'

# List projects
curl http://localhost:3001/api/projects \
  -H "Authorization: Bearer your-token"

# Stop project
curl -X POST http://localhost:3001/api/projects/PROJECT_ID/stop \
  -H "Authorization: Bearer your-token"

# Configure LLM provider
curl -X POST http://localhost:3001/api/providers/openrouter/configure \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-token" \
  -d '{ "apiKey": "sk-or-xxx" }'
```

---

## Type-Safe API Client (Hono RPC)

One of the key benefits of Hono is the type-safe RPC client. This allows the mobile app (Tauri + Svelte) to call the Management API with full type safety.

### Server-side: Export AppType

```typescript
// src/index.ts (already shown above)
export type AppType = typeof app;
```

### Client-side: Use Hono Client

```typescript
// In the mobile app (Svelte frontend)
import { hc } from 'hono/client';
import type { AppType } from 'management-api'; // Import the type

// Create type-safe client
const client = hc<AppType>('http://100.x.x.x:3001', {
  headers: {
    Authorization: 'Bearer your-token',
  },
});

// Now you get full autocomplete and type checking!
async function listProjects() {
  const res = await client.api.projects.$get();
  if (res.ok) {
    const data = await res.json();
    return data.projects; // Fully typed!
  }
}

async function createProject(name: string) {
  const res = await client.api.projects.$post({
    json: {
      name,
      source: { type: 'empty' },
    },
  });
  return res.json();
}

async function startProject(id: string) {
  const res = await client.api.projects[':id'].start.$post({
    param: { id },
  });
  return res.json();
}
```

### Benefits of Hono RPC

1. **End-to-end type safety** - No manual type definitions for API responses
2. **Autocomplete** - IDE suggests available endpoints and parameters
3. **Compile-time errors** - Catch API mismatches before runtime
4. **No code generation** - Types are inferred from the server code
