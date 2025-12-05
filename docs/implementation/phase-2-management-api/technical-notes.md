# Phase 2: Technical Notes

## Project Structure

```
management-api/
├── src/
│   ├── index.ts              # Entry point, server setup
│   ├── config.ts             # Environment config
│   ├── db/
│   │   ├── index.ts          # Database connection
│   │   ├── schema.sql        # Table definitions
│   │   └── migrations.ts     # Migration runner
│   ├── routes/
│   │   ├── index.ts          # Route registration
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

## API Routes

```typescript
// src/routes/projects.ts
import { FastifyInstance } from 'fastify';
import { createProject, getProject, listProjects, deleteProject, startProject, stopProject } from '../services/project-manager';

export async function projectRoutes(app: FastifyInstance) {
  // List all projects
  app.get('/api/projects', async () => {
    return { projects: await listProjects() };
  });
  
  // Get single project
  app.get('/api/projects/:id', async (request) => {
    const { id } = request.params as { id: string };
    const project = await getProject(id);
    if (!project) {
      throw { statusCode: 404, message: 'Project not found' };
    }
    return project;
  });
  
  // Create project
  app.post('/api/projects', async (request) => {
    const body = request.body as {
      name: string;
      description?: string;
      source: {
        type: 'empty' | 'github';
        githubUrl?: string;
        syncEnabled?: boolean;
        syncDirection?: string;
      };
      llmProvider?: string;
    };
    
    const project = await createProject(body);
    return project;
  });
  
  // Delete project
  app.delete('/api/projects/:id', async (request) => {
    const { id } = request.params as { id: string };
    await deleteProject(id);
    return { success: true };
  });
  
  // Start project
  app.post('/api/projects/:id/start', async (request) => {
    const { id } = request.params as { id: string };
    await startProject(id);
    return { success: true };
  });
  
  // Stop project
  app.post('/api/projects/:id/stop', async (request) => {
    const { id } = request.params as { id: string };
    await stopProject(id);
    return { success: true };
  });
}
```

---

## Dockerfile

```dockerfile
# management-api/Dockerfile
FROM node:20-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production image
FROM node:20-slim

WORKDIR /app

# Install SQLite
RUN apt-get update && apt-get install -y sqlite3 && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./

# Create data directory for SQLite
RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV DATABASE_PATH=/app/data/database.sqlite

EXPOSE 3001

CMD ["node", "dist/index.js"]
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
