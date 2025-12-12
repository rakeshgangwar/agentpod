# AgentPod Architecture Redesign Plan

**Status:** In Progress - Phase 3 Complete  
**Created:** 2024-12-12  
**Branch:** `feature/architecture-redesign`

## Executive Summary

This document outlines the complete architecture redesign of AgentPod to:

1. **Remove Coolify** - Replace with direct Docker API orchestration
2. **Remove Forgejo** - Use filesystem-based Git with optional GitHub sync
3. **Remove Keycloak** - Replace with Better Auth (simpler, embedded)
4. **Enable full local development** - `docker compose up` runs everything
5. **Keep modular container system** - Same flavor/addon architecture

### Goals

- Full end-to-end testing locally without remote dependencies
- Production-ready for Hetzner deployment
- Self-hosted friendly for users
- Configurable sandbox environments for AI agents
- Simpler infrastructure with fewer moving parts

---

## Current vs New Architecture

### Current Architecture (Being Replaced)

```
┌─────────────────────────────────────────────────────────────────┐
│  HETZNER VPS                                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Coolify    │  │   Forgejo    │  │   Keycloak   │          │
│  │ (Container   │  │ (Git + Reg.) │  │ (SSO/OAuth)  │          │
│  │  Orchestr.)  │  │              │  │              │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│         │                │                  │                   │
│         └────────────────┴──────────────────┘                   │
│                          │                                      │
│                   ┌──────┴──────┐                               │
│                   │ Management  │                               │
│                   │    API      │                               │
│                   └─────────────┘                               │
└─────────────────────────────────────────────────────────────────┘
```

**Problems:**
- Cannot test locally (requires remote Coolify/Forgejo)
- Complex infrastructure (4+ services to manage)
- Coolify API quirks and workarounds
- Keycloak overhead for simple auth needs

### New Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AGENTPOD v2 ARCHITECTURE                            │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                        INFRASTRUCTURE LAYER                             ││
│  │                                                                         ││
│  │   ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐  ││
│  │   │ Docker Engine     │  │ Traefik           │  │ SQLite/PostgreSQL │  ││
│  │   │ (via dockerode)   │  │ (Reverse Proxy)   │  │ (Data Store)      │  ││
│  │   │                   │  │ + Auto SSL        │  │                   │  ││
│  │   └───────────────────┘  └───────────────────┘  └───────────────────┘  ││
│  │            │                     │                      │               ││
│  │            └─────────────────────┴──────────────────────┘               ││
│  │                                  │                                       ││
│  │                     ┌────────────┴────────────┐                          ││
│  │                     │    Management API       │                          ││
│  │                     │    (Bun + Hono)         │                          ││
│  │                     │    + Better Auth        │                          ││
│  │                     └─────────────────────────┘                          ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                         SANDBOX LAYER                                   ││
│  │                                                                         ││
│  │   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                    ││
│  │   │ Sandbox A   │  │ Sandbox B   │  │ Sandbox C   │                    ││
│  │   │ + Git Repo  │  │ + Git Repo  │  │ + Git Repo  │                    ││
│  │   │ + OpenCode  │  │ + OpenCode  │  │ + OpenCode  │                    ││
│  │   │ + Volume    │  │ + Volume    │  │ + Volume    │                    ││
│  │   └─────────────┘  └─────────────┘  └─────────────┘                    ││
│  │          │               │               │                              ││
│  │   ┌──────┴───────────────┴───────────────┴───────┐                      ││
│  │   │           Docker Network (agentpod-net)       │                      ││
│  │   └───────────────────────────────────────────────┘                      ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                         STORAGE LAYER                                   ││
│  │                                                                         ││
│  │   ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐  ││
│  │   │ ./data/repos/     │  │ ./data/volumes/   │  │ ./data/db/        │  ││
│  │   │ (Git Repos)       │  │ (Container Vols)  │  │ (SQLite/PG)       │  ││
│  │   └───────────────────┘  └───────────────────┘  └───────────────────┘  ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

**Benefits:**
- `docker compose up` for local development
- Same architecture for local and production
- Fewer external dependencies
- Full control over container lifecycle

---

## Implementation Phases

### Phase 1: Container Orchestrator (Replace Coolify)

**Goal:** Replace Coolify with direct Docker API integration using `dockerode`.

#### New Files to Create

```
apps/api/src/
├── services/
│   ├── orchestrator/
│   │   ├── index.ts              # ContainerOrchestrator interface
│   │   ├── docker.ts             # DockerOrchestrator implementation
│   │   ├── types.ts              # Shared types
│   │   └── traefik.ts            # Traefik label generator
```

#### ContainerOrchestrator Interface

```typescript
export interface ContainerOrchestrator {
  // Lifecycle
  createSandbox(config: SandboxConfig): Promise<Sandbox>;
  startSandbox(id: string): Promise<void>;
  stopSandbox(id: string): Promise<void>;
  restartSandbox(id: string): Promise<void>;
  deleteSandbox(id: string): Promise<void>;
  
  // Status
  getSandboxStatus(id: string): Promise<SandboxStatus>;
  listSandboxes(): Promise<Sandbox[]>;
  
  // Logs
  getLogs(id: string, lines?: number): Promise<string>;
  streamLogs(id: string): AsyncIterable<string>;
  
  // Exec
  exec(id: string, command: string[]): Promise<ExecResult>;
  
  // Health
  healthCheck(): Promise<boolean>;
}

export interface SandboxConfig {
  id: string;
  name: string;
  image: string;
  env: Record<string, string>;
  volumes: VolumeMount[];
  ports: PortMapping[];
  labels: Record<string, string>;
  resources: ResourceLimits;
  network?: string;
}

export interface Sandbox {
  id: string;
  containerId: string;
  name: string;
  status: 'creating' | 'running' | 'stopped' | 'error';
  urls: {
    main?: string;
    codeServer?: string;
    vnc?: string;
  };
  createdAt: Date;
}
```

#### Files to Modify

| File | Changes |
|------|---------|
| `apps/api/src/services/project-manager.ts` | Replace Coolify calls with DockerOrchestrator |
| `apps/api/src/config.ts` | Remove Coolify config, add Docker config |
| `apps/api/src/models/project.ts` | Remove `coolifyAppUuid`, add `containerId` |
| `apps/api/src/routes/projects.ts` | Update to use new orchestrator |

#### Files to Delete

| File | Reason |
|------|--------|
| `apps/api/src/services/coolify.ts` | Replaced by DockerOrchestrator |

#### New Dependencies

```bash
cd apps/api
bun add dockerode @types/dockerode
```

#### Estimated Effort: 3-4 days

---

### Phase 2: Git Backend (Replace Forgejo)

**Goal:** Replace Forgejo with filesystem-based Git repositories using `isomorphic-git`.

#### New Files to Create

```
apps/api/src/
├── services/
│   ├── git/
│   │   ├── index.ts              # GitBackend interface
│   │   ├── filesystem.ts         # FileSystemGitBackend implementation
│   │   ├── operations.ts         # Git operations (clone, commit, push)
│   │   └── github-sync.ts        # Optional GitHub sync (future)
```

#### GitBackend Interface

```typescript
export interface GitBackend {
  // Repository lifecycle
  createRepo(name: string, options?: CreateRepoOptions): Promise<Repository>;
  cloneRepo(url: string, name: string): Promise<Repository>;
  getRepo(name: string): Promise<Repository | null>;
  deleteRepo(name: string): Promise<void>;
  listRepos(): Promise<Repository[]>;
  
  // Git operations
  commit(repoName: string, message: string, author: Author): Promise<string>;
  getLog(repoName: string, limit?: number): Promise<Commit[]>;
  
  // File operations
  listFiles(repoName: string, path?: string): Promise<FileEntry[]>;
  readFile(repoName: string, path: string): Promise<string>;
  writeFile(repoName: string, path: string, content: string): Promise<void>;
  
  // Remote sync (optional, for future GitHub integration)
  addRemote?(repoName: string, name: string, url: string): Promise<void>;
  push?(repoName: string, remote?: string): Promise<void>;
  pull?(repoName: string, remote?: string): Promise<void>;
}

export interface Repository {
  name: string;
  path: string;
  createdAt: Date;
  lastModified: Date;
}
```

#### Container Git Access

Containers will mount the repository directly as a volume:

```typescript
// In DockerOrchestrator.createSandbox()
volumes: [
  {
    host: `/data/repos/${projectSlug}`,
    container: '/workspace',
    mode: 'rw',
  },
]
```

#### Files to Modify

| File | Changes |
|------|---------|
| `apps/api/src/services/project-manager.ts` | Replace Forgejo calls with GitBackend |
| `apps/api/src/config.ts` | Remove Forgejo config, add DATA_DIR |
| `apps/api/src/models/project.ts` | Remove `forgejoRepoId`, `forgejoOwner`, add `repoPath` |

#### Files to Delete

| File | Reason |
|------|--------|
| `apps/api/src/services/forgejo.ts` | Replaced by FileSystemGitBackend |

#### New Dependencies

```bash
cd apps/api
bun add isomorphic-git
```

#### GitHub Cloning

GitHub cloning is already functional. The new GitBackend will use `isomorphic-git` to clone from GitHub URLs:

```typescript
async cloneRepo(url: string, name: string): Promise<Repository> {
  const repoPath = path.join(this.reposDir, name);
  
  await git.clone({
    fs,
    http,
    dir: repoPath,
    url,
    singleBranch: true,
    depth: 1, // Shallow clone for speed
  });
  
  return this.getRepoInfo(name);
}
```

#### Estimated Effort: 2-3 days

---

### Phase 3: Authentication (Replace Keycloak with Better Auth)

**Goal:** Replace Keycloak with Better Auth - a simpler, embedded authentication solution.

#### New Files to Create

```
apps/api/src/
├── auth/
│   ├── index.ts              # Better Auth configuration
│   └── middleware.ts         # Hono middleware
```

#### Better Auth Server Configuration

```typescript
// apps/api/src/auth/index.ts
import { betterAuth } from "better-auth";
import Database from "bun:sqlite";
import { config } from "../config";

export const auth = betterAuth({
  database: new Database(config.database.path),
  
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  
  socialProviders: {
    github: {
      clientId: config.auth.github.clientId,
      clientSecret: config.auth.github.clientSecret,
    },
  },
  
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24,
  },
});
```

#### Updated Hono Middleware

```typescript
// apps/api/src/auth/middleware.ts
import { createMiddleware } from "hono/factory";
import { auth } from "./index";
import { config } from "../config";

export const sessionMiddleware = createMiddleware(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  c.set("user", session?.user ?? null);
  c.set("session", session?.session ?? null);
  return next();
});

export const requireAuth = createMiddleware(async (c, next) => {
  const user = c.get("user");
  
  if (!user) {
    // Fallback to API key for backward compatibility
    const authHeader = c.req.header("Authorization");
    if (authHeader?.startsWith("Bearer ") && authHeader.slice(7) === config.auth.apiKey) {
      c.set("user", { id: "api-key-user", email: "api@local" });
      return next();
    }
    return c.json({ error: "Unauthorized" }, 401);
  }
  
  return next();
});
```

#### Frontend Auth Client

```typescript
// apps/frontend/src/lib/auth-client.ts
import { createAuthClient } from "better-auth/svelte";

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:3001",
});

export const { signIn, signOut, signUp, useSession } = authClient;
```

#### Files to Modify

| File | Changes |
|------|---------|
| `apps/api/src/index.ts` | Mount Better Auth routes |
| `apps/api/src/config.ts` | Remove Keycloak config, add auth config |
| `apps/frontend/src/lib/stores/auth.svelte.ts` | Use Better Auth client |
| `apps/frontend/src/lib/api/tauri.ts` | Remove Keycloak-specific calls |
| `apps/frontend/src/routes/login/+page.svelte` | Update login UI |

#### Files to Delete

| File | Reason |
|------|--------|
| `apps/api/src/services/keycloak.ts` | Replaced by Better Auth |
| `apps/api/src/middleware/auth.ts` | Replaced by new middleware |
| `keycloak/*` | No longer needed |
| `docker/sso/*` | No longer needed |

#### New Dependencies

```bash
cd apps/api
bun add better-auth

cd apps/frontend
bun add better-auth
```

#### Database Support

- **Development:** SQLite (via `bun:sqlite`)
- **Production:** PostgreSQL (via `@better-auth/pg`)

```typescript
// Production config
import { Pool } from "pg";

export const auth = betterAuth({
  database: new Pool({ connectionString: process.env.DATABASE_URL }),
  // ... rest of config
});
```

#### Estimated Effort: 2-3 days

---

### Phase 4: Configuration System (agentpod.toml)

**Goal:** Implement the configuration format for defining sandbox environments.

#### New Files to Create

```
apps/api/src/
├── services/
│   ├── config/
│   │   ├── parser.ts             # Parse agentpod.toml
│   │   ├── schema.ts             # JSON Schema for validation
│   │   ├── devcontainer.ts       # Devcontainer compatibility
│   │   └── autodetect.ts         # Auto-detect project type
```

#### agentpod.toml Format

```toml
# agentpod.toml
[project]
name = "my-project"
description = "My awesome project"

[environment]
# Base flavor: js, python, go, rust, fullstack, polyglot
base = "fullstack"

[environment.languages]
node = "22"
python = "3.12"

[environment.packages]
apt = ["ffmpeg", "imagemagick"]
npm = ["typescript"]
pip = ["pytest"]

[services]
postgres = true
redis = true

[ports]
3000 = { label = "Frontend", public = true }
8000 = { label = "API" }

[resources]
tier = "builder"  # starter, builder, creator, power

[addons]
code-server = true
gui = false

[lifecycle]
setup = "npm install"
dev = "npm run dev"
test = "npm test"
```

#### Config Parser

```typescript
export function parseConfig(content: string): AgentPodConfig {
  const parsed = TOML.parse(content);
  const validation = validateConfig(parsed);
  
  if (!validation.valid) {
    throw new Error(`Invalid config: ${validation.errors.join(", ")}`);
  }
  
  return parsed as AgentPodConfig;
}

export function configToContainerSpec(config: AgentPodConfig): ContainerSpec {
  return {
    flavorId: config.environment.base,
    resourceTierId: config.resources?.tier || "builder",
    addonIds: Object.entries(config.addons || {})
      .filter(([_, enabled]) => enabled)
      .map(([id]) => id),
    env: buildEnvVars(config),
    setupCommand: config.lifecycle?.setup,
  };
}
```

#### Auto-Detection

When no `agentpod.toml` exists, auto-detect project type:

```typescript
export function detectProjectType(repoPath: string): DetectedConfig {
  const files = fs.readdirSync(repoPath);
  
  // Detect Node.js
  if (files.includes("package.json")) {
    return { base: "js", languages: { node: "22" }, setupCommand: "npm install" };
  }
  
  // Detect Python
  if (files.includes("requirements.txt") || files.includes("pyproject.toml")) {
    return { base: "python", languages: { python: "3.12" } };
  }
  
  // ... more detection logic
}
```

#### New Dependencies

```bash
cd apps/api
bun add @iarna/toml ajv
```

#### Estimated Effort: 2 days

---

### Phase 5: Updated Container Images

**Goal:** Update container images to work with new architecture.

#### Key Changes

1. **No Forgejo dependency** - Workspace is mounted as a volume
2. **Config loading** - Read `agentpod.toml` or `devcontainer.json`
3. **Simpler startup** - No git clone needed, workspace is pre-mounted
4. **Auth via env** - `OPENCODE_AUTH_JSON` for LLM credentials

#### Updated Entrypoint Script

```bash
#!/bin/bash
set -e

echo "=== AgentPod Sandbox Starting ==="

cd /workspace

# Load config if present
if [ -f "/workspace/agentpod.toml" ]; then
    echo "Loading agentpod.toml configuration..."
fi

# Run setup command if specified
if [ -n "$SETUP_COMMAND" ]; then
    echo "Running setup: $SETUP_COMMAND"
    eval "$SETUP_COMMAND"
fi

# Configure git
git config --global user.email "${GIT_USER_EMAIL:-agent@agentpod.local}"
git config --global user.name "${GIT_USER_NAME:-AgentPod}"
git config --global --add safe.directory /workspace

# Setup auth.json for OpenCode
if [ -n "$OPENCODE_AUTH_JSON" ]; then
    mkdir -p ~/.local/share/opencode
    echo "$OPENCODE_AUTH_JSON" > ~/.local/share/opencode/auth.json
fi

# Start OpenCode server
echo "Starting OpenCode server on port ${OPENCODE_PORT:-4096}..."
exec opencode serve --port "${OPENCODE_PORT:-4096}" --hostname "0.0.0.0"
```

#### Files to Modify

| File | Changes |
|------|---------|
| `docker/base/entrypoint.sh` | Simplified startup, no Forgejo clone |
| `docker/base/Dockerfile` | Remove Forgejo-related setup |
| `docker/flavors/*/Dockerfile` | Update base image references |

#### Estimated Effort: 1-2 days

---

### Phase 6: Local Development Experience

**Goal:** Create a seamless local development experience.

#### docker-compose.yml

```yaml
version: "3.8"

services:
  traefik:
    image: traefik:v3.0
    command:
      - "--api.insecure=true"
      - "--providers.docker=true"
      - "--providers.docker.exposedbydefault=false"
      - "--providers.docker.network=agentpod-net"
      - "--entrypoints.web.address=:80"
    ports:
      - "80:80"
      - "8080:8080"  # Traefik dashboard
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    networks:
      - agentpod-net

  api:
    build: ./apps/api
    environment:
      - NODE_ENV=development
      - PORT=3001
      - DOCKER_SOCKET=/var/run/docker.sock
      - DATA_DIR=/data
      - BASE_DOMAIN=localhost
      - DATABASE_PATH=/data/db/agentpod.sqlite
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./data:/data
      - ./apps/api/src:/app/src  # Hot reload
    ports:
      - "3001:3001"
    networks:
      - agentpod-net
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.api.rule=Host(`api.localhost`)"
      - "traefik.http.services.api.loadbalancer.server.port=3001"

networks:
  agentpod-net:
    driver: bridge
```

#### Quick Start

```bash
# 1. Clone and setup
git clone https://github.com/your-org/agentpod
cd agentpod
pnpm install

# 2. Start infrastructure
docker compose up -d

# 3. Start frontend (separate terminal)
cd apps/frontend
pnpm dev

# 4. Open app
open http://localhost:1420
```

#### Domain Strategy

| Environment | Base Domain | Example URLs |
|-------------|-------------|--------------|
| **Local Dev** | `*.localhost` | `api.localhost`, `project-a.localhost` |
| **Production** | `*.agentpod.dev` | `api.agentpod.dev`, `project-a.agentpod.dev` |

#### Production docker-compose.prod.yml

```yaml
version: "3.8"

services:
  traefik:
    image: traefik:v3.0
    command:
      - "--providers.docker=true"
      - "--entrypoints.web.address=:80"
      - "--entrypoints.websecure.address=:443"
      - "--certificatesresolvers.letsencrypt.acme.email=admin@agentpod.dev"
      - "--certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json"
      - "--certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=web"
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./letsencrypt:/letsencrypt
    networks:
      - agentpod-net

  api:
    image: ghcr.io/agentpod/api:latest
    environment:
      - NODE_ENV=production
      - BASE_DOMAIN=agentpod.dev
      - DATABASE_URL=postgresql://...
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - /data:/data
    networks:
      - agentpod-net
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.api.rule=Host(`api.agentpod.dev`)"
      - "traefik.http.routers.api.tls.certresolver=letsencrypt"
```

#### Estimated Effort: 1-2 days

---

## Summary

### Timeline

| Phase | Description | Effort | Dependencies |
|-------|-------------|--------|--------------|
| **Phase 1** | Container Orchestrator (Docker API) | 3-4 days | None |
| **Phase 2** | Git Backend (Filesystem) | 2-3 days | Phase 1 |
| **Phase 3** | Authentication (Better Auth) | 2-3 days | None (can parallel) |
| **Phase 4** | Configuration System | 2 days | Phase 1-2 |
| **Phase 5** | Container Images Update | 1-2 days | Phase 1-2 |
| **Phase 6** | Local Dev Experience | 1-2 days | All |

**Total Estimated Effort: 11-16 days**

### Files to Delete

| File/Directory | Reason |
|----------------|--------|
| `apps/api/src/services/coolify.ts` | Replaced by DockerOrchestrator |
| `apps/api/src/services/forgejo.ts` | Replaced by FileSystemGitBackend |
| `apps/api/src/services/keycloak.ts` | Replaced by Better Auth |
| `apps/api/src/middleware/auth.ts` | Replaced by new auth middleware |
| `keycloak/` | No longer needed |
| `docker/sso/` | No longer needed |

### Database Schema Changes

| Old Field | New Field | Notes |
|-----------|-----------|-------|
| `coolifyAppUuid` | `containerId` | Docker container ID |
| `coolifyServerUuid` | (removed) | Not needed |
| `forgejoRepoUrl` | `repoPath` | Local filesystem path |
| `forgejoRepoId` | (removed) | Not needed |
| `forgejoOwner` | (removed) | Not needed |

### New Dependencies

```bash
# API
bun add dockerode @types/dockerode
bun add isomorphic-git
bun add better-auth
bun add @iarna/toml ajv

# Frontend
bun add better-auth
```

### Breaking Changes

1. All existing projects will need migration
2. Keycloak sessions will be invalidated
3. Container URLs will change format
4. Environment variables will change

---

## Migration Path

### For Existing Data

1. Export project metadata from current database
2. Clone repos from Forgejo to local filesystem
3. Run database migration script
4. Update project records with new schema

### Migration Script (to be created)

```typescript
// scripts/migrate-v2.ts
async function migrate() {
  // 1. Connect to old database
  // 2. For each project:
  //    - Clone repo from Forgejo URL to ./data/repos/{slug}
  //    - Update database record with new schema
  //    - Remove old Coolify/Forgejo references
  // 3. Create new user accounts in Better Auth
}
```

---

## Next Steps

After this plan is reviewed and approved:

1. Start with Phase 1 (Container Orchestrator)
2. Phases 1-2 can be done sequentially
3. Phase 3 (Auth) can be done in parallel with Phase 1-2
4. Phases 4-6 depend on completion of earlier phases

---

## Appendix A: New Config Format Reference

See [sandbox-environment-patterns.md](../research/sandbox-environment-patterns.md) for full configuration format documentation.

## Appendix B: API Changes

The API endpoints will remain largely the same, but internal implementation changes:

| Endpoint | Current | New |
|----------|---------|-----|
| `POST /api/projects` | Creates Coolify app + Forgejo repo | Creates Docker container + local git repo |
| `POST /api/projects/:id/start` | Calls Coolify API | Calls Docker API |
| `GET /api/projects/:id/logs` | Calls Coolify API | Calls Docker API |
| `POST /api/auth/*` | Keycloak | Better Auth |

## Appendix C: Research References

- [Container Orchestration Options](../research/sandbox-environment-patterns.md)
- [Coolify Analysis](../implementation/coolify-analysis.md)
- [OpenCode Config Architecture](../implementation/opencode-config-architecture.md)
