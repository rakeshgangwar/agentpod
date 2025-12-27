# Deployment Features Implementation Plan

> **Status**: Planning  
> **Priority**: High  
> **Estimated Effort**: 6-10 weeks across 4 phases

## Overview

### Purpose
Enable users to deploy projects created in AgentPod sandboxes to external platforms, transforming sandboxes from development environments into full deployment pipelines.

### Current State
- **Git Operations**: Full git support via isomorphic-git (`apps/api/src/services/git/`)
- **GitHub OAuth**: Device flow OAuth implemented (`apps/api/src/services/oauth/github-copilot.ts`)
- **Data Export**: JSON export for GDPR compliance (`apps/api/src/routes/account.ts`)
- **Config Sync**: Push configurations to containers (`apps/api/src/services/config-sync.ts`)

### Goal
Add deployment capabilities to:
- **Git Hosts**: GitHub, GitLab
- **Static Site Hosts**: Vercel, Netlify, Cloudflare Pages
- **Container Platforms**: Railway, Fly.io, GHCR, Docker Hub
- **Package Registries**: NPM, PyPI, Cargo

---

## Deployment Types (Priority Order)

| Priority | Type | Platforms | Phase |
|----------|------|-----------|-------|
| 1 | Git Export | GitHub, GitLab | Phase 1 |
| 2 | Static Site Deploy | Vercel, Netlify | Phase 2 |
| 3 | Container Deploy | Railway, GHCR, Docker Hub | Phase 3 |
| 4 | Package Publish | NPM, PyPI | Phase 4 |

---

## Architecture

### Provider Adapter Pattern

```typescript
interface DeploymentProvider {
  name: string;
  type: 'git' | 'static' | 'container' | 'package';
  
  // Authentication
  getAuthUrl(): string;
  exchangeCode(code: string): Promise<ProviderCredentials>;
  validateCredentials(): Promise<boolean>;
  
  // Deployment Operations
  deploy(options: DeployOptions): Promise<DeployResult>;
  getStatus(deploymentId: string): Promise<DeployStatus>;
  cancel(deploymentId: string): Promise<void>;
  rollback(deploymentId: string): Promise<DeployResult>;
  
  // Resource Discovery
  listProjects(): Promise<Project[]>;
  listEnvironments(projectId: string): Promise<Environment[]>;
}

interface DeployOptions {
  sandboxId: string;
  targetId: string;
  buildCommand?: string;
  outputDir?: string;
  environmentVariables?: Record<string, string>;
  branch?: string;
  commitMessage?: string;
}

interface DeployResult {
  id: string;
  status: DeployStatus;
  url?: string;
  logs?: string;
  startedAt: Date;
  completedAt?: Date;
}

type DeployStatus = 
  | 'pending' 
  | 'building' 
  | 'uploading' 
  | 'deploying' 
  | 'success' 
  | 'failed' 
  | 'cancelled';
```

### Service Structure

```
apps/api/src/services/deployment/
├── index.ts                 # Main DeploymentService class
├── providers/
│   ├── base.ts              # Abstract BaseProvider class
│   ├── github.ts            # GitHubProvider - git push
│   ├── vercel.ts            # VercelProvider - static sites
│   ├── netlify.ts           # NetlifyProvider - static sites
│   ├── railway.ts           # RailwayProvider - containers
│   ├── ghcr.ts              # GHCRProvider - container registry
│   └── npm.ts               # NpmProvider - package publish
├── builders/
│   ├── detector.ts          # Framework/project type detection
│   ├── static.ts            # Static site build runner
│   └── container.ts         # Docker image builder
└── types.ts                 # Shared TypeScript types
```

---

## Database Schema

### Tables

```sql
-- ============================================
-- Deployment Targets (Connected Platforms)
-- ============================================
CREATE TABLE deployment_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,    -- 'vercel', 'netlify', 'railway', 'github', 'ghcr', 'npm'
  name VARCHAR(255) NOT NULL,       -- User-friendly name like "My Vercel Account"
  config JSONB NOT NULL DEFAULT '{}', -- Provider-specific config (project ID, team, etc.)
  credentials_id UUID REFERENCES provider_credentials(id) ON DELETE SET NULL,
  is_default BOOLEAN DEFAULT FALSE, -- Default target for this provider type
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT unique_user_provider_name UNIQUE(user_id, provider, name)
);

CREATE INDEX idx_deployment_targets_user ON deployment_targets(user_id);
CREATE INDEX idx_deployment_targets_provider ON deployment_targets(provider);

-- ============================================
-- Deployments (History)
-- ============================================
CREATE TABLE deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sandbox_id UUID NOT NULL REFERENCES sandboxes(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES deployment_targets(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Status tracking
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  status_message TEXT,
  
  -- Results
  deployment_url TEXT,              -- Live URL after successful deploy
  preview_url TEXT,                 -- Preview/staging URL if applicable
  build_logs TEXT,                  -- Full build output
  error_message TEXT,               -- Error details if failed
  
  -- Metadata
  metadata JSONB DEFAULT '{}',      -- Provider-specific data (commit SHA, build ID, etc.)
  environment VARCHAR(50) DEFAULT 'production', -- 'production', 'preview', 'staging'
  
  -- Timestamps
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_deployments_sandbox ON deployments(sandbox_id);
CREATE INDEX idx_deployments_user ON deployments(user_id);
CREATE INDEX idx_deployments_status ON deployments(status);
CREATE INDEX idx_deployments_created ON deployments(created_at DESC);

-- ============================================
-- Deployment Webhooks (Async Status Updates)
-- ============================================
CREATE TABLE deployment_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id UUID NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,
  external_id VARCHAR(255) NOT NULL,  -- Provider's deployment/build ID
  webhook_secret VARCHAR(255),         -- For signature verification
  expires_at TIMESTAMPTZ,             -- When to stop listening
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT unique_provider_external UNIQUE(provider, external_id)
);

CREATE INDEX idx_webhooks_deployment ON deployment_webhooks(deployment_id);
CREATE INDEX idx_webhooks_external ON deployment_webhooks(provider, external_id);
```

### Drizzle Schema

```typescript
// apps/api/src/db/schema/deployments.ts
import { pgTable, uuid, varchar, text, boolean, jsonb, timestamp, index, unique } from 'drizzle-orm/pg-core';
import { users } from './users';
import { sandboxes } from './sandboxes';
import { providerCredentials } from './provider-credentials';

export const deploymentTargets = pgTable('deployment_targets', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider: varchar('provider', { length: 50 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  config: jsonb('config').notNull().default({}),
  credentialsId: uuid('credentials_id').references(() => providerCredentials.id, { onDelete: 'set null' }),
  isDefault: boolean('is_default').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  userIdx: index('idx_deployment_targets_user').on(table.userId),
  providerIdx: index('idx_deployment_targets_provider').on(table.provider),
  uniqueUserProviderName: unique('unique_user_provider_name').on(table.userId, table.provider, table.name),
}));

export const deployments = pgTable('deployments', {
  id: uuid('id').primaryKey().defaultRandom(),
  sandboxId: uuid('sandbox_id').notNull().references(() => sandboxes.id, { onDelete: 'cascade' }),
  targetId: uuid('target_id').notNull().references(() => deploymentTargets.id, { onDelete: 'restrict' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 50 }).notNull().default('pending'),
  statusMessage: text('status_message'),
  deploymentUrl: text('deployment_url'),
  previewUrl: text('preview_url'),
  buildLogs: text('build_logs'),
  errorMessage: text('error_message'),
  metadata: jsonb('metadata').default({}),
  environment: varchar('environment', { length: 50 }).default('production'),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  sandboxIdx: index('idx_deployments_sandbox').on(table.sandboxId),
  userIdx: index('idx_deployments_user').on(table.userId),
  statusIdx: index('idx_deployments_status').on(table.status),
  createdIdx: index('idx_deployments_created').on(table.createdAt),
}));

export const deploymentWebhooks = pgTable('deployment_webhooks', {
  id: uuid('id').primaryKey().defaultRandom(),
  deploymentId: uuid('deployment_id').notNull().references(() => deployments.id, { onDelete: 'cascade' }),
  provider: varchar('provider', { length: 50 }).notNull(),
  externalId: varchar('external_id', { length: 255 }).notNull(),
  webhookSecret: varchar('webhook_secret', { length: 255 }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  deploymentIdx: index('idx_webhooks_deployment').on(table.deploymentId),
  externalIdx: index('idx_webhooks_external').on(table.provider, table.externalId),
  uniqueProviderExternal: unique('unique_provider_external').on(table.provider, table.externalId),
}));
```

---

## API Endpoints

### Deployment Targets

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/deployments/targets` | List user's deployment targets |
| `POST` | `/api/deployments/targets` | Add new deployment target |
| `GET` | `/api/deployments/targets/:id` | Get target details |
| `PUT` | `/api/deployments/targets/:id` | Update target configuration |
| `DELETE` | `/api/deployments/targets/:id` | Remove target |
| `POST` | `/api/deployments/targets/:id/test` | Test target connection |

### OAuth Flows

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/deployments/auth/:provider/authorize` | Initiate OAuth flow |
| `GET` | `/api/deployments/auth/:provider/callback` | OAuth callback handler |
| `POST` | `/api/deployments/auth/:provider/token` | Exchange code for token (device flow) |
| `GET` | `/api/deployments/auth/:provider/status` | Check auth status |
| `DELETE` | `/api/deployments/auth/:provider` | Disconnect provider |

### Deployments

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/sandboxes/:id/deploy` | Trigger new deployment |
| `GET` | `/api/sandboxes/:id/deployments` | List sandbox's deployments |
| `GET` | `/api/deployments/:id` | Get deployment details |
| `GET` | `/api/deployments/:id/logs` | Stream build logs (SSE) |
| `POST` | `/api/deployments/:id/cancel` | Cancel in-progress deployment |
| `POST` | `/api/deployments/:id/redeploy` | Redeploy with same config |
| `DELETE` | `/api/deployments/:id` | Delete deployment record |

### Simple Export (Alternative to full deployment)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/sandboxes/:id/export/github` | Push to GitHub repository |
| `POST` | `/api/sandboxes/:id/export/zip` | Download as ZIP archive |
| `POST` | `/api/sandboxes/:id/export/tar` | Download as tarball |

### Webhooks (Provider Callbacks)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/webhooks/vercel` | Vercel deployment status updates |
| `POST` | `/api/webhooks/netlify` | Netlify build notifications |
| `POST` | `/api/webhooks/railway` | Railway deployment events |

---

## Implementation Phases

### Phase 1: Git Export (1-2 weeks)

**Goal**: Push code from sandbox to GitHub repositories

**Features**:
- Push to existing GitHub repository
- Create new GitHub repository and push
- Download as ZIP file
- Download as tarball

**Technical Details**:
- Leverage existing GitHub OAuth from Better Auth
- Use existing isomorphic-git service
- Add `repo` scope to OAuth for private repo access

**Files to Create**:
```
apps/api/src/services/deployment/index.ts
apps/api/src/services/deployment/providers/base.ts
apps/api/src/services/deployment/providers/github.ts
apps/api/src/routes/deployments.ts
apps/api/src/db/schema/deployments.ts
```

**API Endpoints**:
- `POST /api/sandboxes/:id/export/github`
- `POST /api/sandboxes/:id/export/zip`

---

### Phase 2: Static Site Deploy (2-3 weeks)

**Goal**: Deploy static sites to Vercel and Netlify

**Features**:
- Vercel deployment with OAuth
- Netlify deployment with OAuth
- Auto-detect framework (Next.js, Vite, Astro, etc.)
- Build in sandbox container
- Upload build artifacts

**Technical Details**:
- Implement OAuth flows for Vercel and Netlify
- Framework detection based on package.json, config files
- Run builds using container exec
- Upload via provider REST APIs

**Files to Create**:
```
apps/api/src/services/deployment/providers/vercel.ts
apps/api/src/services/deployment/providers/netlify.ts
apps/api/src/services/deployment/builders/detector.ts
apps/api/src/services/deployment/builders/static.ts
```

**API Endpoints**:
- `GET/POST /api/deployments/targets`
- `GET /api/deployments/auth/vercel/*`
- `GET /api/deployments/auth/netlify/*`
- `POST /api/sandboxes/:id/deploy`

---

### Phase 3: Container Deploy (2-3 weeks)

**Goal**: Deploy containerized applications to Railway, GHCR, Docker Hub

**Features**:
- Build Docker images in sandbox
- Push to GitHub Container Registry
- Deploy to Railway
- Environment variable management

**Technical Details**:
- Build images using Docker-in-Docker or Buildah
- Push using registry HTTP API
- Railway GraphQL API integration
- Store registry credentials securely

**Files to Create**:
```
apps/api/src/services/deployment/providers/railway.ts
apps/api/src/services/deployment/providers/ghcr.ts
apps/api/src/services/deployment/providers/dockerhub.ts
apps/api/src/services/deployment/builders/container.ts
```

---

### Phase 4: Package Publish (1-2 weeks)

**Goal**: Publish packages to NPM and PyPI

**Features**:
- NPM publish with token auth
- PyPI publish with token auth
- Version bump helpers
- Publish dry-run

**Technical Details**:
- Token-based auth (not OAuth)
- Run `npm publish` / `twine upload` in container
- Parse package.json / pyproject.toml for metadata

**Files to Create**:
```
apps/api/src/services/deployment/providers/npm.ts
apps/api/src/services/deployment/providers/pypi.ts
```

---

## UI/UX Design

### Deploy Button Placement
- Located in sandbox header toolbar
- Dropdown menu with deployment options
- Badge showing active deployments

### Deployment Flow

```
┌─────────────────────────────────────────────────────────────┐
│  Deploy to...                                               │
├─────────────────────────────────────────────────────────────┤
│  ○ Git Export                                               │
│    Push to GitHub repository                                │
│                                                             │
│  ○ Static Site          [Recommended for: Next.js]         │
│    Deploy to Vercel, Netlify                                │
│                                                             │
│  ○ Container                                                │
│    Deploy to Railway, GHCR                                  │
│                                                             │
│  ○ Package                                                  │
│    Publish to NPM, PyPI                                     │
└─────────────────────────────────────────────────────────────┘
```

### Target Selection

```
┌─────────────────────────────────────────────────────────────┐
│  Select Deployment Target                                   │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────┐   │
│  │ ◉ My Vercel Account                                  │   │
│  │   vercel.com • Connected                             │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ ○ Team Netlify                                       │   │
│  │   netlify.com • Connected                            │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  [ + Connect New Account ]                                  │
│                                                             │
│              [Cancel]  [Configure & Deploy →]               │
└─────────────────────────────────────────────────────────────┘
```

### Deployment Progress

```
┌─────────────────────────────────────────────────────────────┐
│  Deploying to Vercel                                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ✓ Preparing build                                          │
│  ✓ Installing dependencies                                  │
│  ● Building application...                          [45%]   │
│  ○ Uploading artifacts                                      │
│  ○ Deploying                                                │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ > next build                                         │   │
│  │ ✓ Compiled successfully                              │   │
│  │ ✓ Collecting page data                               │   │
│  │ ● Building static pages (12/24)                      │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│                                         [Cancel Deployment] │
└─────────────────────────────────────────────────────────────┘
```

### Deployment Success

```
┌─────────────────────────────────────────────────────────────┐
│  ✓ Deployment Successful                                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Your site is live at:                                      │
│  https://my-project-abc123.vercel.app                       │
│                                                             │
│  Deployed in 1m 23s                                         │
│                                                             │
│  [View Site]  [View Logs]  [Done]                           │
└─────────────────────────────────────────────────────────────┘
```

### Deployment History (in Sandbox Details)

```
┌─────────────────────────────────────────────────────────────┐
│  Deployment History                                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ✓ Production • Vercel           2 hours ago      [Redeploy]│
│    https://my-project.vercel.app                            │
│                                                             │
│  ✓ Preview • Vercel              5 hours ago                │
│    https://my-project-git-feature.vercel.app                │
│                                                             │
│  ✗ Failed • Netlify              1 day ago        [View Log]│
│    Build failed: Module not found                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Security Considerations

### 1. Token Storage
- Store tokens in existing `provider_credentials` table
- Encrypt tokens at rest using application-level encryption
- Never log or expose tokens in responses

### 2. OAuth Scopes
Request minimal scopes per provider:

| Provider | Scopes |
|----------|--------|
| GitHub | `repo` (for private repos), `packages:write` (for GHCR) |
| Vercel | `read`, `write` |
| Netlify | `read`, `write` |
| Railway | API token (no OAuth) |

### 3. Webhook Security
- Validate webhook signatures using provider-specific methods
- Use webhook secrets stored in `deployment_webhooks` table
- Expire webhooks after deployment completes

### 4. Rate Limiting
- Implement per-user rate limits on deployment endpoints
- Respect provider rate limits (Vercel: 100/min, Netlify: 500/min)
- Queue deployments if limits exceeded

### 5. Access Control
- Verify sandbox ownership before deployment
- Verify target ownership before using
- Audit log all deployment actions

### 6. Secrets in Environment
- Never include deployment credentials in container environment
- Use secure injection at deploy time
- Mask secrets in build logs

---

## Provider Integration Details

### Vercel

| Property | Value |
|----------|-------|
| Auth Type | OAuth 2.0 |
| Auth URL | `https://vercel.com/oauth/authorize` |
| Token URL | `https://vercel.com/oauth/access_token` |
| Scopes | `read`, `write` |
| API Base | `https://api.vercel.com` |
| API Version | v13 |

**Deploy Method**: Upload build output as files via `/v2/deployments`

**Webhook**: Configure via API, receives `deployment.succeeded`, `deployment.failed`

---

### Netlify

| Property | Value |
|----------|-------|
| Auth Type | OAuth 2.0 |
| Auth URL | `https://app.netlify.com/authorize` |
| Token URL | `https://api.netlify.com/oauth/token` |
| Scopes | Default (all) |
| API Base | `https://api.netlify.com/api/v1` |

**Deploy Method**: Upload ZIP archive via `/sites/{site_id}/deploys`

**Webhook**: Configure via API, receives `deploy_created`, `deploy_building`, `deploy_ready`, `deploy_failed`

---

### Railway

| Property | Value |
|----------|-------|
| Auth Type | API Token |
| API Base | `https://backboard.railway.app/graphql/v2` |
| API Type | GraphQL |

**Deploy Method**: 
1. Push Docker image to their registry, OR
2. Connect GitHub repo and trigger redeploy

**Webhook**: GraphQL subscriptions or polling

---

### GitHub (Git Export)

| Property | Value |
|----------|-------|
| Auth Type | OAuth 2.0 (existing) |
| Scopes | `repo` |

**Method**: Use isomorphic-git to push directly

---

### GHCR (GitHub Container Registry)

| Property | Value |
|----------|-------|
| Auth Type | GitHub OAuth with `packages:write` scope |
| Registry URL | `ghcr.io` |

**Method**: Docker registry HTTP API v2

---

### NPM

| Property | Value |
|----------|-------|
| Auth Type | Token (automation token) |
| Registry URL | `https://registry.npmjs.org` |

**Method**: Run `npm publish` with token in `.npmrc`

---

### PyPI

| Property | Value |
|----------|-------|
| Auth Type | API Token |
| Registry URL | `https://upload.pypi.org/legacy/` |

**Method**: Run `twine upload` with token

---

## File Locations Summary

### New Files to Create

```
apps/api/src/
├── db/
│   └── schema/
│       └── deployments.ts          # Drizzle schema
├── models/
│   ├── deployment.ts               # Deployment model/queries
│   └── deployment-target.ts        # Target model/queries
├── routes/
│   └── deployments.ts              # API routes
└── services/
    └── deployment/
        ├── index.ts                # Main service
        ├── types.ts                # Type definitions
        ├── providers/
        │   ├── base.ts             # Abstract base
        │   ├── github.ts           # Phase 1
        │   ├── vercel.ts           # Phase 2
        │   ├── netlify.ts          # Phase 2
        │   ├── railway.ts          # Phase 3
        │   ├── ghcr.ts             # Phase 3
        │   ├── dockerhub.ts        # Phase 3
        │   ├── npm.ts              # Phase 4
        │   └── pypi.ts             # Phase 4
        └── builders/
            ├── detector.ts         # Framework detection
            ├── static.ts           # Static builds
            └── container.ts        # Docker builds
```

### Files to Modify

```
apps/api/src/db/schema/index.ts     # Export new tables
apps/api/src/routes/index.ts        # Register new routes
apps/api/src/index.ts               # Initialize deployment service
```

---

## Dependencies

### Phase 1 (No new dependencies)
- Uses existing `isomorphic-git`
- Uses existing `better-auth` GitHub OAuth
- Uses built-in `fetch` for GitHub API

### Phase 2
- Consider `@vercel/client` or use REST directly
- Consider Netlify SDK or use REST directly

### Phase 3
- `dockerode` - Docker API client for building images
- Or use REST API to Docker socket directly

### Phase 4
- No SDK needed - run CLI commands in container

---

## Testing Strategy

### Unit Tests
- Provider adapter methods (mock HTTP responses)
- Framework detection logic
- Build output parsing

### Integration Tests
- OAuth flows with mock providers
- Webhook signature verification
- Database operations

### E2E Tests
- Full deployment flow to test accounts
- Provider-specific test projects

### Test Fixtures
- Sample project structures per framework
- Mock API responses per provider
- Webhook payloads

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Deployment success rate | > 95% |
| Average deploy time (static) | < 2 minutes |
| Average deploy time (container) | < 5 minutes |
| User adoption (Phase 1) | 50% of active users |
| Provider coverage | 4+ by end of Phase 2 |

---

## Open Questions

1. **Build caching**: Should we cache node_modules/build artifacts between deploys?
2. **Team deployments**: How to handle team-owned targets vs personal?
3. **Deployment previews**: Auto-deploy PRs to preview URLs?
4. **Custom domains**: Manage domains through our UI or defer to provider?
5. **Rollback**: Implement our own or use provider's rollback?

---

## References

- [Vercel API Documentation](https://vercel.com/docs/rest-api)
- [Netlify API Documentation](https://docs.netlify.com/api/get-started/)
- [Railway API Documentation](https://docs.railway.app/reference/public-api)
- [GitHub Container Registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)
- [NPM Registry API](https://github.com/npm/registry/blob/master/docs/REGISTRY-API.md)
- [PyPI API](https://warehouse.pypa.io/api-reference/)
