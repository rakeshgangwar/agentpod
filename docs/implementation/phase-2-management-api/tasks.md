# Phase 2: Tasks

## 1. Project Setup

### 1.1 Initialize Project
- [ ] Create `management-api/` directory
- [ ] Initialize Bun project: `bun init`
- [ ] Install dependencies:
  ```bash
  # Core framework
  bun add hono @hono/zod-validator zod

  # Database
  bun add better-sqlite3
  bun add -D @types/better-sqlite3

  # Utilities
  bun add nanoid dotenv
  ```
- [ ] Configure TypeScript (`tsconfig.json`)
- [ ] Set up project structure:
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
- [ ] Create `.env.example` with required variables
- [ ] Set up config loader (`src/config.ts`)
- [ ] Variables needed:
  - `PORT` - API port (default: 3001)
  - `COOLIFY_URL` - Coolify API URL
  - `COOLIFY_TOKEN` - Coolify API token
  - `FORGEJO_URL` - Forgejo URL
  - `FORGEJO_TOKEN` - Forgejo API token
  - `DATABASE_PATH` - SQLite database path

---

## 2. Database Setup

### 2.1 Design Schema
- [ ] Create `src/db/schema.sql`
- [ ] Tables:
  - `projects` - Project metadata
  - `providers` - LLM provider configurations
  - `settings` - Global settings

### 2.2 Implement Database Layer
- [ ] Create `src/db/index.ts` - Database connection
- [ ] Create `src/db/migrations.ts` - Run migrations on startup
- [ ] Create `src/models/project.ts` - Project CRUD operations
- [ ] Create `src/models/provider.ts` - Provider CRUD operations

---

## 3. External Service Clients

### 3.1 Coolify Client
- [ ] Create `src/services/coolify.ts`
- [ ] Implement methods:
  - `listServers()` - Get available servers
  - `listApplications()` - Get all apps
  - `createDockerImageApp(config)` - Create OpenCode container
  - `getApplication(uuid)` - Get app details
  - `startApplication(uuid)` - Start container
  - `stopApplication(uuid)` - Stop container
  - `deleteApplication(uuid)` - Remove container
  - `setEnvironmentVariables(uuid, vars)` - Set env vars
- [ ] Add error handling and retries
- [ ] Add request logging

### 3.2 Forgejo Client
- [ ] Create `src/services/forgejo.ts`
- [ ] Implement methods:
  - `listRepos()` - List all repositories
  - `createRepo(name, description)` - Create new repo
  - `deleteRepo(owner, name)` - Delete repo
  - `getRepo(owner, name)` - Get repo details
  - `getCloneUrl(owner, name)` - Get clone URL for container
- [ ] Add error handling

### 3.3 GitHub Client (for imports)
- [ ] Create `src/services/github.ts`
- [ ] Implement methods:
  - `getRepoInfo(url)` - Parse and validate GitHub URL
  - `cloneRepo(url, destination)` - Clone to temp directory
- [ ] Handle authentication for private repos

---

## 4. API Routes

### 4.1 Health & Info Routes
- [ ] Create `src/routes/health.ts`
- [ ] Endpoints:
  - `GET /health` - Health check
  - `GET /api/info` - API version, status

### 4.2 Project Routes
- [ ] Create `src/routes/projects.ts`
- [ ] Endpoints:
  - `GET /api/projects` - List all projects
  - `GET /api/projects/:id` - Get project details
  - `POST /api/projects` - Create new project
  - `DELETE /api/projects/:id` - Delete project
  - `POST /api/projects/:id/start` - Start container
  - `POST /api/projects/:id/stop` - Stop container
  - `GET /api/projects/:id/status` - Get container status

### 4.3 Provider Routes
- [ ] Create `src/routes/providers.ts`
- [ ] Endpoints:
  - `GET /api/providers` - List configured providers
  - `POST /api/providers/:id/configure` - Set API key
  - `POST /api/providers/:id/set-default` - Set as default
  - `DELETE /api/providers/:id` - Remove provider config

### 4.4 Sync Routes
- [ ] Create `src/routes/sync.ts`
- [ ] Endpoints:
  - `POST /api/projects/:id/sync` - Sync with GitHub
  - `GET /api/projects/:id/sync/status` - Get sync status

---

## 5. Core Business Logic

### 5.1 Project Creation Flow
- [ ] Create `src/services/project-manager.ts`
- [ ] Implement `createProject(options)`:
  1. Validate input
  2. Create Forgejo repo (or import from GitHub)
  3. Create Coolify application
  4. Set environment variables (LLM keys, Forgejo URL)
  5. Start container
  6. Save project to database
  7. Return project details

### 5.2 Project Deletion Flow
- [ ] Implement `deleteProject(id)`:
  1. Stop container
  2. Delete Coolify application
  3. Delete Forgejo repo (optional, configurable)
  4. Remove from database

### 5.3 Container Management
- [ ] Implement `startProject(id)`
- [ ] Implement `stopProject(id)`
- [ ] Implement `getProjectStatus(id)` - Get live status from Coolify

### 5.4 Credential Injection
- [ ] Implement `injectCredentials(projectId)`:
  1. Get default provider or project-specific override
  2. Get credentials from database
  3. Update Coolify env vars
  4. Restart container if running

---

## 6. GitHub Import

### 6.1 Import Flow
- [ ] Create `src/services/github-import.ts`
- [ ] Implement `importFromGitHub(url, options)`:
  1. Parse GitHub URL
  2. Clone repo to temp directory
  3. Create Forgejo repo
  4. Push content to Forgejo
  5. Store sync configuration
  6. Continue with normal project creation

### 6.2 Sync Flow
- [ ] Implement `syncToGitHub(projectId)`:
  1. Get project and sync config
  2. Pull latest from Forgejo
  3. Push to GitHub
  4. Handle conflicts

---

## 7. Testing

### 7.1 Unit Tests
- [ ] Set up Jest or Vitest
- [ ] Test database operations
- [ ] Test service clients (with mocks)

### 7.2 Integration Tests
- [ ] Test full project creation flow
- [ ] Test start/stop operations
- [ ] Test GitHub import

### 7.3 Manual Testing
- [ ] Test all endpoints with curl/Postman
- [ ] Document sample requests

---

## 8. Deployment

### 8.1 Create Dockerfile
- [ ] Create `management-api/Dockerfile`
- [ ] Multi-stage build for smaller image
- [ ] Include SQLite database file in volume

### 8.2 Deploy to Coolify
- [ ] Build and push image
- [ ] Create application in Coolify
- [ ] Set environment variables
- [ ] Configure persistent storage for SQLite
- [ ] Deploy and test

### 8.3 Documentation
- [ ] Document all API endpoints
- [ ] Create Postman/Insomnia collection
- [ ] Update technical-notes.md

---

## Notes

- Keep authentication simple for MVP (static API token)
- Consider adding rate limiting later
- Log all external API calls for debugging
