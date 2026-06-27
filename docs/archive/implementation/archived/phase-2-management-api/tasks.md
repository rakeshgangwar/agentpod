# Phase 2: Tasks

## Status: COMPLETE ✅

**Deployed at**: https://api.superchotu.com

**Key Achievement**: Full end-to-end project creation flow working - creates Forgejo repo, Coolify app with embedded Dockerfile, sets env vars, deploys container, and container successfully clones repo and starts OpenCode.

---

## 1. Project Setup ✅

### 1.1 Initialize Project
- [x] Create `management-api/` directory
- [x] Initialize Bun project: `bun init`
- [x] Install dependencies:
  ```bash
  # Core framework
  bun add hono @hono/zod-validator zod

  # Database
  bun add better-sqlite3
  bun add -D @types/better-sqlite3

  # Utilities
  bun add nanoid dotenv
  ```
- [x] Configure TypeScript (`tsconfig.json`)
- [x] Set up project structure:
  ```
  management-api/
  ├── src/
  │   ├── index.ts           # Entry point with Hono app
  │   ├── config.ts          # Environment config
  │   ├── routes/
  │   │   ├── index.ts       # Route aggregation & type export
  │   │   ├── health.ts
  │   │   ├── projects.ts
  │   │   ├── providers.ts
  │   │   └── sync.ts
  │   ├── services/
  │   ├── models/
  │   └── utils/
  ├── Dockerfile
  ├── package.json
  └── tsconfig.json
  ```

### 1.2 Configure Environment
- [x] Create `.env.example` with required variables
- [x] Set up config loader (`src/config.ts`)
- [x] Variables needed:
  - `PORT` - API port (default: 3001)
  - `COOLIFY_URL` - Coolify API URL
  - `COOLIFY_TOKEN` - Coolify API token
  - `FORGEJO_URL` - Forgejo URL (internal, for API)
  - `FORGEJO_PUBLIC_URL` - Forgejo URL (external, for git clone)
  - `FORGEJO_TOKEN` - Forgejo API token
  - `DATABASE_PATH` - SQLite database path

---

## 2. Database Setup ✅

### 2.1 Design Schema
- [x] Create `src/db/schema.sql`
- [x] Tables:
  - `projects` - Project metadata
  - `providers` - LLM provider configurations
  - `settings` - Global settings

### 2.2 Implement Database Layer
- [x] Create `src/db/index.ts` - Database connection (using Bun's native `bun:sqlite`)
- [x] Create `src/db/migrations.ts` - Migration framework (ready for future use)
- [x] Create `src/models/project.ts` - Project CRUD operations
- [x] Create `src/models/provider.ts` - Provider CRUD operations
- [x] Create `src/db/test-db.ts` - Database test script

---

## 3. External Service Clients ✅

### 3.1 Coolify Client ✅
- [x] Create `src/services/coolify.ts`
- [x] Implement methods:
  - `listServers()` - Get available servers
  - `listApplications()` - Get all apps
  - `createDockerImageApp(config)` - Create from Docker image
  - `createDockerfileApp(config)` - Create from embedded Dockerfile (BASE64!)
  - `getApplication(uuid)` - Get app details
  - `startApplication(uuid)` - Start container
  - `stopApplication(uuid)` - Stop container
  - `restartApplication(uuid)` - Restart container
  - `deployApplication(uuid)` - Trigger build/deploy
  - `deleteApplication(uuid)` - Remove container
  - `setEnvVars(uuid, vars)` - Bulk set env vars
  - `listEnvVars(uuid, filterPreview)` - List env vars
- [x] Add error handling and logging
- [x] **Fixed**: Deploy endpoint uses `/deploy?uuid=` not `/applications/{uuid}/deploy`
- [x] **Fixed**: Dockerfile must be base64 encoded

### 3.2 Forgejo Client ✅
- [x] Create `src/services/forgejo.ts`
- [x] Implement methods:
  - `listRepos()` - List all repositories
  - `createRepo(name, description)` - Create new repo
  - `createMirror(config)` - Import from GitHub
  - `deleteRepo(owner, name)` - Delete repo
  - `getRepo(owner, name)` - Get repo details
  - `getCloneUrl(owner, name)` - Get clone URL for container
- [x] Add error handling

### 3.3 GitHub Client (for imports) - Using Forgejo Mirror
- [x] GitHub import via Forgejo's `createMirror()` instead of separate client

---

## 4. API Routes ✅

### 4.1 Health & Info Routes ✅
- [x] Create `src/routes/health.ts`
- [x] Endpoints:
  - `GET /health` - Health check
  - `GET /api/info` - API version, status

### 4.2 Project Routes ✅
- [x] Create `src/routes/projects.ts`
- [x] Endpoints:
  - `GET /api/projects` - List all projects
  - `GET /api/projects/:id` - Get project details (with live container status)
  - `POST /api/projects` - Create new project
  - `PATCH /api/projects/:id` - Update project metadata
  - `DELETE /api/projects/:id` - Delete project
  - `POST /api/projects/:id/start` - Start container
  - `POST /api/projects/:id/stop` - Stop container
  - `POST /api/projects/:id/restart` - Restart container
  - `POST /api/projects/:id/credentials` - Update LLM credentials

### 4.3 Provider Routes ✅
- [x] Create `src/routes/providers.ts`
- [x] Endpoints:
  - `GET /api/providers` - List configured providers
  - `GET /api/providers/default` - Get default provider
  - `GET /api/providers/:id` - Get provider details
  - `POST /api/providers/:id/configure` - Set API key
  - `POST /api/providers/:id/set-default` - Set as default
  - `DELETE /api/providers/:id` - Remove provider config

### 4.4 Sync Routes (Deferred)
- [x] Create `src/routes/sync.ts` (basic implementation, full sync deferred)
- [ ] Endpoints (deferred for post-MVP):
  - `POST /api/projects/:id/sync` - Sync with GitHub
  - `GET /api/projects/:id/sync/status` - Get sync status
  - `POST /api/projects/:id/sync/config` - Configure sync settings

---

## 5. Core Business Logic ✅

### 5.1 Project Creation Flow ✅
- [x] Create `src/services/project-manager.ts`
- [x] Implement `createNewProject(options)`:
  1. Validate input
  2. Create Forgejo repo (or import from GitHub via mirror)
  3. Create Coolify application with **embedded Dockerfile**
  4. Transform Forgejo URL to public HTTPS (remove port)
  5. Set environment variables (LLM keys, Forgejo URL)
  6. Save project to database
  7. Return project details

### 5.2 Project Deletion Flow ✅
- [x] Implement `deleteProjectFully(id)`:
  1. Stop container
  2. Delete Coolify application
  3. Delete Forgejo repo (optional, configurable)
  4. Remove from database

### 5.3 Container Management ✅
- [x] Implement `startProject(id)`
- [x] Implement `stopProject(id)`
- [x] Implement `restartProject(id)`
- [x] Implement `getProjectWithStatus(id)` - Get live status from Coolify

### 5.4 Credential Injection ✅
- [x] Implement `updateProjectCredentials(projectId, providerId)`:
  1. Get default provider or project-specific override
  2. Get credentials from database
  3. Update Coolify env vars
  4. Restart container if running

---

## 6. GitHub Import (Using Forgejo Mirror) ✅

### 6.1 Import Flow ✅
- [x] GitHub import integrated into `createNewProject` via Forgejo mirror
- [x] Implement via `forgejo.createMirror()`:
  1. Parse GitHub URL
  2. Create Forgejo repo as one-time import
  3. Continue with normal project creation

### 6.2 Sync Flow (Deferred)
- [ ] Implement `syncToGitHub(projectId)` - Deferred for post-MVP

---

## 7. Testing ✅

### 7.1 Unit Tests ✅
- [x] Set up Bun test framework
- [x] Test database operations (23 tests for project model)
- [ ] Test service clients (with mocks) - Deferred

### 7.2 Integration Tests ✅
- [x] Test API routes (16 tests)
- [x] Test authentication flow
- [x] Test full project creation flow (E2E test script)

### 7.3 Manual Testing ✅
- [x] Test all endpoints with curl
- [x] Verified health, providers, and projects endpoints
- [x] E2E test: project creation → deploy → running:healthy

---

## 8. Deployment ✅

### 8.1 Create Dockerfile ✅
- [x] Create `management-api/Dockerfile`
- [x] Multi-stage build (builder + production)
- [x] Non-root user for security
- [x] Health check configured
- [x] SQLite data volume mount

### 8.2 Docker Compose ✅
- [x] Create `docker-compose.yml` for local development
- [x] Environment variables from .env
- [x] Persistent volume for database

### 8.3 Deployment Scripts ✅
- [x] `scripts/build.sh` - Local Docker build
- [x] `scripts/deploy.sh` - Deploy to Coolify
- [x] `.dockerignore` for optimized builds

### 8.4 Deploy to Coolify ✅
- [x] Create application in Coolify
- [x] Set environment variables
- [x] Configure persistent storage for SQLite
- [x] Deploy and test
- [x] Verified at https://api.superchotu.com

---

## Critical Bugs Fixed

1. **Coolify strips git URL domain** → Use `/applications/dockerfile` with embedded Dockerfile
2. **Dockerfile must be base64 encoded** → Added encoding in `createDockerfileApp()`
3. **Forgejo URL port not accessible** → Transform to public HTTPS URL (strip port)
4. **Deploy endpoint 404** → Use `/deploy?uuid=` query parameter
5. **Heredocs in Dockerfile fail** → Use `printf` with escaped strings

---

## Notes

- Keep authentication simple for MVP (static API token)
- Consider adding rate limiting later
- Log all external API calls for debugging
- Sync flow deferred for post-MVP
- Container health check confirms OpenCode is running
