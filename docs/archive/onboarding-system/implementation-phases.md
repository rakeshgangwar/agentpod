# Implementation Phases

Step-by-step guide to implementing the Onboarding Agent System for AgentPod.

---

## Progress Tracker

| Phase | Status | Completion Date | Notes |
|-------|--------|-----------------|-------|
| **Phase 1** | **COMPLETED** | Dec 14, 2024 | PostgreSQL + Drizzle schema ready |
| **Phase 2** | **COMPLETED** | Dec 14, 2024 | Services, types, & knowledge base seeded |
| **Phase 3** | **COMPLETED** | Dec 14, 2024 | MCP Server & API Routes implemented |
| **Phase 4** | **COMPLETED** | Dec 14, 2024 | Container Integration with E2E tests |
| **Phase 5** | **COMPLETED** | Dec 14, 2024 | Frontend Integration with Onboarding Banner |

### Phase 1 Completed Tasks

- [x] Add PostgreSQL container to docker-compose.yml
- [x] Add pgvector init script (`apps/api/src/db/init/01-extensions.sql`)
- [x] Install Drizzle ORM dependencies
- [x] Create drizzle.config.ts
- [x] Create all schema files (22 tables total):
  - [x] `schema/auth.ts` - user, session, account, verification
  - [x] `schema/sandboxes.ts` - sandboxes with status enum
  - [x] `schema/chat.ts` - chat_sessions, chat_messages
  - [x] `schema/providers.ts` - provider_credentials, oauth_state, providers
  - [x] `schema/settings.ts` - settings, user_opencode_config, user_opencode_files, user_preferences
  - [x] `schema/containers.ts` - resource_tiers, container_flavors, container_addons, container_tiers
  - [x] `schema/activity.ts` - activity_log, activity_log_archive
  - [x] `schema/knowledge.ts` - knowledge_documents with pgvector
  - [x] `schema/onboarding.ts` - onboarding_sessions
- [x] Create database connection module (`db/drizzle.ts`)
- [x] Create Better Auth Drizzle adapter (`auth/drizzle-auth.ts`)
- [x] Add migration scripts to package.json
- [x] Update .env.example with PostgreSQL config
- [x] Generate and apply migrations (22 tables created)

### Phase 2 Completed Tasks

- [x] Create onboarding types (`packages/types/src/onboarding.ts`):
  - [x] `KnowledgeDocument`, `KnowledgeSearchParams`, `KnowledgeSearchResult`
  - [x] `CreateKnowledgeDocument`, `UpdateKnowledgeDocument`
  - [x] `OnboardingSession`, `OnboardingStatus`, `OnboardingRequirements`
  - [x] `GeneratedConfig`, `OpenCodeSettings`, `AgentDefinition`, `CommandDefinition`
  - [x] `OnboardingModelRecommendation`, `ModelSelectionParams`
  - [x] `ReOnboardingStrategy`, `ReOnboardingOptions`
- [x] Create Knowledge Service (`apps/api/src/services/knowledge-service.ts`):
  - [x] CRUD operations (create, getById, getByCategory, getAll, update, delete)
  - [x] Keyword search with ILIKE patterns
  - [x] Semantic search with pgvector (embedding generation stub)
  - [x] Embedding management methods
  - [x] Statistics endpoint
- [x] Create Onboarding Service (`apps/api/src/services/onboarding-service.ts`):
  - [x] Session management (create, getById, getBySandboxId, getByUserId)
  - [x] Status transitions (start, markGathering, markGenerating, complete, skip, fail)
  - [x] Requirements and config persistence
  - [x] Re-onboarding support
- [x] Create Model Selection Service (`apps/api/src/services/model-selection-service.ts`):
  - [x] Get configured providers from database
  - [x] Recommend primary and small models based on preferences
  - [x] Provider setup guides for Anthropic, OpenAI, Google, Groq, OpenRouter
  - [x] Fix type errors (model possibly undefined)
- [x] Create Knowledge Seed Script (`apps/api/src/scripts/seed-knowledge.ts`):
  - [x] Parse markdown files with gray-matter frontmatter
  - [x] Parse TypeScript files for plugin/tool templates
  - [x] Parse JSON files for MCP templates
  - [x] Seed 18 documents from knowledge-base directory
  - [x] Support --clear flag for reset

### Files Created in Phase 1

```
apps/api/
├── drizzle.config.ts                    # Drizzle configuration
├── src/
│   ├── auth/
│   │   └── drizzle-auth.ts              # Better Auth with Drizzle PostgreSQL
│   └── db/
│       ├── drizzle.ts                   # PostgreSQL connection with Drizzle
│       ├── drizzle-migrations/          # Generated SQL migrations
│       │   └── 0000_*.sql
│       ├── init/
│       │   └── 01-extensions.sql        # pgvector extension init
│       └── schema/
│           ├── index.ts                 # Schema exports
│           ├── auth.ts                  # Better Auth tables
│           ├── sandboxes.ts             # Sandbox management
│           ├── chat.ts                  # Chat sessions/messages
│           ├── providers.ts             # Provider credentials
│           ├── settings.ts              # User settings/preferences
│           ├── containers.ts            # Resource tiers, flavors, addons
│           ├── activity.ts              # Activity logging
│           ├── knowledge.ts             # Knowledge base with vectors
│           └── onboarding.ts            # Onboarding sessions
```

### Files Created in Phase 2

```
packages/types/
└── src/
    └── onboarding.ts                    # Onboarding system types

apps/api/
└── src/
    ├── scripts/
    │   └── seed-knowledge.ts            # Knowledge base seed script
    └── services/
        ├── knowledge-service.ts         # Knowledge document CRUD + search
        ├── onboarding-service.ts        # Onboarding session management
        └── model-selection-service.ts   # Model recommendation service
```

### Phase 3 Completed Tasks

- [x] Create MCP Knowledge endpoint (`apps/api/src/routes/mcp-knowledge.ts`)
  - [x] Implement 7 MCP tools: search_knowledge, get_project_template, get_agent_pattern, get_command_template, list_project_types, get_available_models, get_provider_setup_guide
  - [x] Add tools/list and tools/call handlers
  - [x] Bearer token authentication
- [x] Create Onboarding API routes (`apps/api/src/routes/onboarding.ts`)
  - [x] GET /api/onboarding/:id - Get session by ID
  - [x] GET /api/onboarding/sandbox/:sandboxId - Get session by sandbox
  - [x] POST /api/onboarding/start - Start onboarding
  - [x] POST /api/onboarding/:id/skip - Skip onboarding
  - [x] POST /api/onboarding/:id/complete - Complete onboarding
  - [x] POST /api/onboarding/apply - Apply config to sandbox
  - [x] POST /api/onboarding/link - Link sandbox to session
  - [x] GET /api/onboarding/config/:sandboxId - Get config for sandbox
  - [x] POST /api/onboarding/validate-sandbox - Validate sandbox setup

### Phase 4 Completed Tasks

- [x] Create agent definitions
  - [x] `docker/base/scripts/agents/onboarding.md` - Onboarding agent template
  - [x] `docker/base/scripts/agents/workspace.md` - Workspace agent template
- [x] Update container entrypoint (`docker/base/entrypoint.sh`)
  - [x] Add `setup_onboarding_agents()` function
  - [x] Configure MCP server in opencode.json with API token
  - [x] Install agents when ONBOARDING_MODE=true
- [x] Update sandbox manager (`apps/api/src/services/sandbox-manager.ts`)
  - [x] Auto-create onboarding session on sandbox creation
  - [x] Inject ONBOARDING_MODE, ONBOARDING_SESSION_ID, AGENTPOD_API_TOKEN env vars
- [x] Create sandbox-onboarding-service (`apps/api/src/services/sandbox-onboarding-service.ts`)
- [x] Add E2E tests (`apps/api/tests/e2e/`)
  - [x] Docker client helper for real container testing
  - [x] Container startup with onboarding env vars
  - [x] Agent installation verification
  - [x] MCP configuration in opencode.json
  - [x] Container-to-host MCP communication
  - [x] All 7 MCP tools tested from inside container
  - [x] Error handling tests
- [x] Add shell script for quick E2E verification (`scripts/test-onboarding-e2e.sh`)

### Phase 5 Completed Tasks

- [x] Create Onboarding API client (`apps/frontend/src/lib/api/onboarding.ts`)
  - [x] Types: OnboardingSession, OnboardingStatus, OnboardingRequirements, GeneratedConfig
  - [x] Functions: getOnboardingSession, createOnboardingSession, startOnboarding, skipOnboarding, completeOnboarding, applyOnboardingConfig, resetOnboarding
  - [x] Authentication with Bearer token from authGetToken
- [x] Create Onboarding Store (`apps/frontend/src/lib/stores/onboarding.svelte.ts`)
  - [x] Svelte 5 runes-based state management
  - [x] Session map with loading/error states per sandbox
  - [x] Reactive getters: getSession, getStatus, needsOnboarding, isInProgress, isComplete
  - [x] Actions: fetchOnboardingSession, startOnboarding, skipOnboarding, completeOnboarding, resetOnboarding
- [x] Create Onboarding Banner component (`apps/frontend/src/lib/components/onboarding-banner.svelte`)
  - [x] Welcome state with "Start Setup" and "Skip" buttons
  - [x] In-progress state with spinner and status message
  - [x] Failed state with error display and retry button
  - [x] Follows design language (gradients, icons, spacing)
- [x] Integrate banner into Chat page (`apps/frontend/src/routes/projects/[id]/chat/+page.svelte`)
  - [x] Import onboarding store and banner component
  - [x] Fetch onboarding status on project load
  - [x] Display banner between model selector and chat thread
  - [x] Add toast notifications for start/skip actions

### Files Created in Phase 5

```
apps/frontend/src/
├── lib/
│   ├── api/
│   │   └── onboarding.ts                  # HTTP client for onboarding API
│   ├── stores/
│   │   └── onboarding.svelte.ts           # Svelte 5 onboarding store
│   └── components/
│       └── onboarding-banner.svelte       # Welcome/progress banner component
└── routes/
    └── projects/
        └── [id]/
            └── chat/
                └── +page.svelte           # Updated with onboarding integration
```

### Files Created in Phase 3

```
apps/api/
└── src/
    └── routes/
        └── mcp-knowledge.ts               # MCP endpoint with 7 tools
```

### Files Created in Phase 4

```
apps/api/
├── src/
│   └── services/
│       └── sandbox-onboarding-service.ts  # Sandbox-onboarding integration
└── tests/
    └── e2e/
        ├── helpers/
        │   └── docker.ts                  # E2E Docker client helper
        └── onboarding-flow.test.ts        # E2E test suite

docker/base/
├── entrypoint.sh                          # Updated with setup_onboarding_agents()
└── scripts/
    └── agents/
        ├── onboarding.md                  # Onboarding agent template
        └── workspace.md                   # Workspace agent template

scripts/
└── test-onboarding-e2e.sh                 # Quick E2E verification script
```

---

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Database** | PostgreSQL 16 + pgvector | Robust, scalable, native vector search |
| **ORM** | Drizzle ORM | Type-safe, lightweight, great DX |
| **Auth Adapter** | Better Auth Drizzle adapter | Built-in PostgreSQL support |
| **Framework** | OpenCode (native agent) | Already integrated, consistent UX |
| **First message trigger** | UI prompt | User clicks "Start Setup" in UI, sends first message |
| **Provider detection** | Assume from configured providers | Use existing `provider_credentials` table |
| **No providers fallback** | Offer help getting API key | Guide user through setup |
| **Model info source** | models.dev API | Always up-to-date, already integrated |
| **Provider storage** | Both DB + sandbox env vars | DB for Management API, env vars for container |
| **Onboarding scope** | Once per sandbox | Each sandbox can have different setup |
| **Post-onboarding** | `@workspace` agent | Replaces `@onboarding`, helps maintain workspace |
| **Re-onboarding** | Ask user preference | Wipe vs merge existing config |
| **Knowledge seeding** | Manual command | `pnpm db:seed`, automated later |
| **Testing approach** | TDD (Red-Green-Refactor) | Tests written before implementation |
| **Migration approach** | Clean start | No SQLite migration needed |
| **Connection pooling** | Built-in | Sufficient for current scale |

## Overview

The implementation is divided into 4 phases:

| Phase | Focus | Effort | Dependencies |
|-------|-------|--------|--------------|
| Phase 1 | PostgreSQL + Drizzle Migration | 5-6 days | None |
| Phase 2 | MCP Server & API Routes | 2-3 days | Phase 1 |
| Phase 3 | Container Integration | 2-3 days | Phase 2 |
| Phase 4 | Frontend & Polish | 2-3 days | Phase 3 |

**Total Estimated Effort:** 12-15 days

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Updated Architecture with PostgreSQL                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────┐                    ┌─────────────────────────────────┐ │
│  │   Mobile/Desktop│◄──────────────────►│      Management API             │ │
│  │   App           │    REST/SSE        │  (Bun + Hono + Drizzle)         │ │
│  └─────────────────┘                    │                                 │ │
│         │                               │  • Onboarding session tracking  │ │
│         │                               │  • Knowledge document storage   │ │
│         │                               │  • Vector similarity search     │ │
│         ▼                               └──────────┬──────────────────────┘ │
│  ┌─────────────────┐                               │                        │
│  │    Sandbox      │                               ▼                        │
│  │   Container     │                    ┌─────────────────────────────────┐ │
│  │                 │                    │  PostgreSQL 16 + pgvector       │ │
│  │  ┌───────────┐  │  MCP (remote)      │                                 │ │
│  │  │ OpenCode  │◄─┼───────────────────►│  Tables:                        │ │
│  │  │ + Agents  │  │                    │  • user, session, account       │ │
│  │  └───────────┘  │                    │  • sandboxes, chat_*            │ │
│  │                 │                    │  • knowledge_documents          │ │
│  │  .opencode/     │                    │  • onboarding_sessions          │ │
│  │  ├── agent/     │                    │  • provider_credentials         │ │
│  │  │   ├── onboarding.md               │  • + HNSW vector indexes        │ │
│  │  │   └── workspace.md                └─────────────────────────────────┘ │
│  │  └── ...        │                                                        │
│  └─────────────────┘                                                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: PostgreSQL + Drizzle Migration

This phase sets up PostgreSQL, migrates all existing tables, and adds new onboarding/knowledge tables with vector search.

### 1.1 Add PostgreSQL Container to Docker Compose

**File:** `docker-compose.yml`

Add PostgreSQL service with pgvector:

```yaml
services:
  # ... existing services (traefik) ...

  # ===========================================================================
  # PostgreSQL Database
  # ===========================================================================
  postgres:
    image: pgvector/pgvector:pg16
    container_name: agentpod-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: agentpod
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-agentpod-dev-password}
      POSTGRES_DB: agentpod
    volumes:
      - postgres-data:/var/lib/postgresql/data
    networks:
      - agentpod-net
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U agentpod -d agentpod"]
      interval: 5s
      timeout: 5s
      retries: 5
    labels:
      - "traefik.enable=false"
      - "agentpod.managed=false"

  # ===========================================================================
  # Management API (updated)
  # ===========================================================================
  api:
    # ... existing config ...
    environment:
      # ... existing env vars ...
      # Remove SQLite config, add PostgreSQL
      - DATABASE_URL=postgres://agentpod:${POSTGRES_PASSWORD:-agentpod-dev-password}@postgres:5432/agentpod
    depends_on:
      - traefik
      - postgres  # Add postgres dependency

volumes:
  postgres-data:
    driver: local
  # ... existing volumes ...
```

**Update .env.example:**

```bash
# Database
POSTGRES_PASSWORD=your-secure-password-here
DATABASE_URL=postgres://agentpod:your-secure-password-here@localhost:5432/agentpod
```

**Checklist:**
- [ ] Add PostgreSQL service to docker-compose.yml
- [ ] Add postgres-data volume
- [ ] Update API service with DATABASE_URL
- [ ] Add postgres dependency to API service
- [ ] Remove SQLite-related env vars (DATABASE_PATH)
- [ ] Update .env.example with POSTGRES_PASSWORD
- [ ] Test: `docker compose up postgres` starts successfully

### 1.2 Install Drizzle ORM and Dependencies

**In `apps/api` directory:**

```bash
# Install Drizzle ORM and PostgreSQL driver
bun add drizzle-orm postgres

# Install dev dependencies
bun add -D drizzle-kit
```

**Checklist:**
- [ ] Install drizzle-orm and postgres driver
- [ ] Install drizzle-kit for migrations
- [ ] Verify packages in package.json

### 1.3 Create Drizzle Configuration

**File:** `apps/api/drizzle.config.ts`

```typescript
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
});
```

**Checklist:**
- [ ] Create drizzle.config.ts
- [ ] Verify configuration points to correct schema path

### 1.4 Create Database Schema with Drizzle

Create the following schema files:

**File:** `apps/api/src/db/schema/index.ts`

```typescript
// Re-export all schema modules
export * from './auth';
export * from './sandboxes';
export * from './chat';
export * from './providers';
export * from './settings';
export * from './containers';
export * from './activity';
export * from './knowledge';
export * from './onboarding';
```

**File:** `apps/api/src/db/schema/auth.ts`

```typescript
import { pgTable, text, timestamp, boolean, index } from 'drizzle-orm/pg-core';

// Better Auth tables
export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  image: text('image'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
}, (table) => [
  index('session_userId_idx').on(table.userId),
]);

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('account_userId_idx').on(table.userId),
  index('account_providerId_idx').on(table.providerId, table.accountId),
]);

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('verification_identifier_idx').on(table.identifier),
]);
```

**File:** `apps/api/src/db/schema/knowledge.ts`

```typescript
import { 
  pgTable, text, timestamp, integer, index, pgEnum, vector 
} from 'drizzle-orm/pg-core';

export const knowledgeCategoryEnum = pgEnum('knowledge_category', [
  'project_template',
  'agent_pattern',
  'command_template',
  'tool_template',
  'plugin_template',
  'mcp_template',
  'workflow_pattern',
  'best_practice',
  'provider_guide',
]);

export const embeddingStatusEnum = pgEnum('embedding_status', [
  'pending', 'processing', 'completed', 'failed'
]);

export const knowledgeDocuments = pgTable('knowledge_documents', {
  id: text('id').primaryKey(),
  category: knowledgeCategoryEnum('category').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  content: text('content').notNull(),
  tags: text('tags').default('[]'), // JSON array
  applicableTo: text('applicable_to'), // JSON array or null
  metadata: text('metadata').default('{}'), // JSON object
  embedding: vector('embedding', { dimensions: 1536 }),
  embeddingStatus: embeddingStatusEnum('embedding_status').default('pending'),
  version: integer('version').default(1),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('knowledge_category_idx').on(table.category),
  index('knowledge_updated_idx').on(table.updatedAt),
  index('knowledge_embedding_status_idx').on(table.embeddingStatus),
  // HNSW index for vector similarity search
  index('knowledge_embedding_idx').using('hnsw', table.embedding.op('vector_cosine_ops')),
]);
```

**File:** `apps/api/src/db/schema/onboarding.ts`

```typescript
import { 
  pgTable, text, timestamp, index, pgEnum, unique 
} from 'drizzle-orm/pg-core';
import { user } from './auth';
import { sandboxes } from './sandboxes';

export const onboardingStatusEnum = pgEnum('onboarding_status', [
  'pending', 'started', 'gathering', 'generating', 
  'applying', 'completed', 'skipped', 'failed',
]);

export const onboardingSessions = pgTable('onboarding_sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  sandboxId: text('sandbox_id').references(() => sandboxes.id, { onDelete: 'set null' }),
  status: onboardingStatusEnum('status').default('pending').notNull(),
  
  // Project information
  projectType: text('project_type'),
  projectName: text('project_name'),
  projectDescription: text('project_description'),
  
  // JSON fields
  gatheredRequirements: text('gathered_requirements'),
  generatedConfig: text('generated_config'),
  
  // Selected models
  selectedModel: text('selected_model'),
  selectedSmallModel: text('selected_small_model'),
  
  // Error info
  errorMessage: text('error_message'),
  
  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
}, (table) => [
  index('onboarding_userId_idx').on(table.userId),
  index('onboarding_sandboxId_idx').on(table.sandboxId),
  index('onboarding_status_idx').on(table.status),
  unique('onboarding_sandbox_unique').on(table.sandboxId),
]);
```

**Additional schema files to create (see full implementation):**
- `apps/api/src/db/schema/sandboxes.ts`
- `apps/api/src/db/schema/chat.ts`
- `apps/api/src/db/schema/providers.ts`
- `apps/api/src/db/schema/settings.ts`
- `apps/api/src/db/schema/containers.ts`
- `apps/api/src/db/schema/activity.ts`

**Checklist:**
- [ ] Create schema/index.ts
- [ ] Create schema/auth.ts (user, session, account, verification)
- [ ] Create schema/sandboxes.ts
- [ ] Create schema/chat.ts
- [ ] Create schema/providers.ts
- [ ] Create schema/settings.ts
- [ ] Create schema/containers.ts
- [ ] Create schema/activity.ts
- [ ] Create schema/knowledge.ts with vector column
- [ ] Create schema/onboarding.ts

### 1.5 Create Database Connection Module

**File:** `apps/api/src/db/index.ts`

```typescript
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { createLogger } from '../utils/logger';

const log = createLogger('database');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is required');
}

// Create postgres client with connection pooling
const client = postgres(connectionString, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

// Create drizzle instance with schema
export const db = drizzle(client, { schema });

export type Database = typeof db;

// Health check
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    await client`SELECT 1`;
    return true;
  } catch (error) {
    log.error('Database health check failed', { error });
    return false;
  }
}

// Enable pgvector extension (run once on startup)
export async function enableVectorExtension(): Promise<void> {
  try {
    await client`CREATE EXTENSION IF NOT EXISTS vector`;
    log.info('pgvector extension enabled');
  } catch (error) {
    log.error('Failed to enable pgvector extension', { error });
    throw error;
  }
}

// Graceful shutdown
export async function closeDatabase(): Promise<void> {
  await client.end();
  log.info('Database connection closed');
}

log.info('Database connection initialized');
```

**Checklist:**
- [ ] Create db/index.ts with Drizzle connection
- [ ] Add connection pooling
- [ ] Add health check function
- [ ] Add pgvector extension enablement
- [ ] Add graceful shutdown

### 1.6 Update Better Auth Configuration

**File:** `apps/api/src/auth/index.ts`

```typescript
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '../db';

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',  // Use PostgreSQL provider
  }),
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
  },
  secret: process.env.SESSION_SECRET!,
});
```

**Checklist:**
- [ ] Update auth to use Drizzle adapter with 'pg' provider
- [ ] Test authentication flow

### 1.7 Add Migration Scripts

**File:** `apps/api/package.json` (add scripts):

```json
{
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio",
    "db:seed": "bun run src/scripts/seed-knowledge.ts"
  }
}
```

**Checklist:**
- [ ] Add migration scripts to package.json
- [ ] Run `bun run db:generate` to create migration files
- [ ] Review generated SQL migrations
- [ ] Run `bun run db:migrate` to apply migrations
- [ ] Verify tables with `bun run db:studio`

### 1.8 Migrate All Services to Drizzle

Replace all raw SQLite queries with Drizzle queries.

**Example transformation:**

```typescript
// Before (SQLite)
const stmt = db.prepare('SELECT * FROM sandboxes WHERE user_id = ?');
const rows = stmt.all(userId);

// After (Drizzle)
import { db } from '../db';
import { sandboxes } from '../db/schema';
import { eq } from 'drizzle-orm';

const rows = await db.select().from(sandboxes).where(eq(sandboxes.userId, userId));
```

**Files to migrate:**
- [ ] `apps/api/src/services/sandbox-manager.ts`
- [ ] `apps/api/src/routes/sandboxes.ts`
- [ ] `apps/api/src/routes/chat.ts`
- [ ] `apps/api/src/routes/providers.ts`
- [ ] `apps/api/src/routes/preferences.ts`
- [ ] `apps/api/src/routes/activity.ts`
- [ ] `apps/api/src/routes/users.ts`
- [ ] `apps/api/src/routes/resource-tiers.ts`
- [ ] `apps/api/src/routes/flavors.ts`
- [ ] `apps/api/src/models/provider-credentials.ts`
- [ ] `apps/api/src/models/provider.ts`

### 1.9 Create Knowledge Service with Vector Search

**File:** `apps/api/src/services/knowledge-service.ts`

```typescript
import { db } from '../db';
import { knowledgeDocuments } from '../db/schema';
import { eq, ilike, or, desc, sql, gt, and } from 'drizzle-orm';
import { cosineDistance } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import type { KnowledgeDocument, KnowledgeSearchParams } from '@agentpod/types';

export class KnowledgeService {
  async search(params: KnowledgeSearchParams): Promise<KnowledgeDocument[]> {
    const { query, category, tags, limit = 10, useSemanticSearch = false } = params;
    
    if (useSemanticSearch && query) {
      return this.semanticSearch(query, { category, tags, limit });
    }
    return this.keywordSearch({ query, category, tags, limit });
  }

  private async semanticSearch(
    query: string,
    filters: { category?: string; tags?: string[]; limit: number }
  ): Promise<KnowledgeDocument[]> {
    const embedding = await this.generateEmbedding(query);
    if (embedding.length === 0) {
      return this.keywordSearch({ query, ...filters });
    }
    
    const similarity = sql<number>`1 - (${cosineDistance(knowledgeDocuments.embedding, embedding)})`;
    
    const results = await db
      .select({
        id: knowledgeDocuments.id,
        category: knowledgeDocuments.category,
        title: knowledgeDocuments.title,
        description: knowledgeDocuments.description,
        content: knowledgeDocuments.content,
        tags: knowledgeDocuments.tags,
        applicableTo: knowledgeDocuments.applicableTo,
        metadata: knowledgeDocuments.metadata,
        embeddingStatus: knowledgeDocuments.embeddingStatus,
        version: knowledgeDocuments.version,
        createdAt: knowledgeDocuments.createdAt,
        updatedAt: knowledgeDocuments.updatedAt,
        similarity,
      })
      .from(knowledgeDocuments)
      .where(gt(similarity, 0.5))
      .orderBy(desc(similarity))
      .limit(filters.limit);
    
    return results.map(this.rowToDocument);
  }

  private async keywordSearch(params: {
    query?: string;
    category?: string;
    tags?: string[];
    limit: number;
  }): Promise<KnowledgeDocument[]> {
    const conditions = [];
    
    if (params.category) {
      conditions.push(eq(knowledgeDocuments.category, params.category as any));
    }
    
    if (params.query) {
      const pattern = `%${params.query}%`;
      conditions.push(
        or(
          ilike(knowledgeDocuments.title, pattern),
          ilike(knowledgeDocuments.description, pattern),
          ilike(knowledgeDocuments.content, pattern)
        )
      );
    }
    
    const query = conditions.length > 0
      ? db.select().from(knowledgeDocuments).where(and(...conditions))
      : db.select().from(knowledgeDocuments);
    
    return (await query.orderBy(desc(knowledgeDocuments.updatedAt)).limit(params.limit))
      .map(this.rowToDocument);
  }

  private async generateEmbedding(text: string): Promise<number[]> {
    // TODO: Implement with OpenAI or Anthropic
    console.warn('Embedding generation not implemented');
    return [];
  }

  private rowToDocument(row: any): KnowledgeDocument {
    return {
      id: row.id,
      category: row.category,
      title: row.title,
      description: row.description,
      content: row.content,
      tags: row.tags ? JSON.parse(row.tags) : [],
      applicableTo: row.applicableTo ? JSON.parse(row.applicableTo) : null,
      metadata: row.metadata ? JSON.parse(row.metadata) : {},
      embeddingStatus: row.embeddingStatus,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
  
  // ... additional CRUD methods
}

export const knowledgeService = new KnowledgeService();
```

**Checklist:**
- [ ] Write tests for knowledge-service.ts (RED)
- [ ] Implement with Drizzle (GREEN)
- [ ] Test vector similarity search
- [ ] Add embedding generation stub

### 1.10 Create Onboarding Service

**File:** `apps/api/src/services/onboarding-service.ts`

Similar structure to knowledge service, using Drizzle for all queries.

**Checklist:**
- [ ] Write tests (RED)
- [ ] Implement with Drizzle (GREEN)

### 1.11 Create Model Selection Service

**File:** `apps/api/src/services/model-selection-service.ts`

Uses models.dev + configured providers to recommend models.

**Checklist:**
- [ ] Write tests (RED)
- [ ] Implement service (GREEN)

### 1.12 Create Knowledge Seed Script

**File:** `apps/api/src/scripts/seed-knowledge.ts`

Seeds knowledge base from markdown files using Drizzle insert.

**Checklist:**
- [ ] Install gray-matter: `bun add gray-matter`
- [ ] Create seed script
- [ ] Test seeding

### 1.13 Create TypeScript Types

**File:** `packages/types/src/onboarding.ts`

Type definitions for knowledge documents, onboarding sessions, model selection.

**Checklist:**
- [ ] Create types
- [ ] Export from index.ts

### 1.14 Testing Phase 1

```
tests/
├── unit/
│   ├── db/
│   │   └── connection.test.ts
│   └── services/
│       ├── knowledge-service.test.ts
│       ├── onboarding-service.test.ts
│       └── model-selection-service.test.ts
└── integration/
    ├── auth-postgres.test.ts
    └── vector-search.test.ts
```

**Checklist:**
- [ ] Unit tests for database connection
- [ ] Unit tests for knowledge service
- [ ] Unit tests for onboarding service
- [ ] Integration tests for auth
- [ ] Integration tests for vector search

---

## Phase 2: MCP Server & API Routes

### 2.1 Create MCP Knowledge Endpoint

**File:** `apps/api/src/routes/mcp-knowledge.ts`

MCP tools:
- `search_knowledge`
- `get_project_template`
- `get_agent_pattern`
- `get_command_template`
- `list_project_types`
- `get_available_models`
- `get_provider_setup_guide`

### 2.2 Create Onboarding API Routes

**File:** `apps/api/src/routes/onboarding.ts`

REST endpoints for session management.

### 2.3 Testing Phase 2

Unit and integration tests for routes.

---

## Phase 3: Container Integration

### 3.1 Create Agent Definitions

- `docker/base/scripts/agents/onboarding.md`
- `docker/base/scripts/agents/workspace.md`

### 3.2 Update Container Entrypoint

Inject agents and configure MCP.

### 3.3 Update Sandbox Manager

Create onboarding session on sandbox creation.

---

## Phase 4: Frontend Integration

### 4.1 Create Onboarding Store

Svelte stores for onboarding state.

### 4.2 Create UI Components

OnboardingPrompt.svelte modal.

### 4.3 Handle Agent Transition

UI logic for onboarding → workspace transition.

---

## File Changes Summary

| Phase | New Files | Modified Files |
|-------|-----------|----------------|
| **1** | `apps/api/drizzle.config.ts`<br>`apps/api/src/db/index.ts`<br>`apps/api/src/db/schema/*.ts`<br>`apps/api/src/db/migrations/*.sql`<br>`apps/api/src/services/knowledge-service.ts`<br>`apps/api/src/services/onboarding-service.ts`<br>`apps/api/src/services/model-selection-service.ts`<br>`apps/api/src/scripts/seed-knowledge.ts`<br>`packages/types/src/onboarding.ts` | `docker-compose.yml`<br>`apps/api/package.json`<br>`apps/api/src/auth/index.ts`<br>All route/service files using SQLite<br>`.env.example` |
| **2** | `apps/api/src/routes/mcp-knowledge.ts`<br>`apps/api/src/routes/onboarding.ts` | `apps/api/src/index.ts` |
| **3** | `docker/base/scripts/agents/onboarding.md`<br>`docker/base/scripts/agents/workspace.md` | `docker/base/entrypoint.sh`<br>`apps/api/src/services/sandbox-manager.ts` |
| **4** | `apps/frontend/src/lib/stores/onboarding.ts`<br>`apps/frontend/src/lib/components/OnboardingPrompt.svelte` | Chat UI components |

---

## Estimated Effort

| Phase | Tasks | Effort |
|-------|-------|--------|
| **Phase 1** | PostgreSQL setup, Drizzle migration, services | 5-6 days |
| **Phase 2** | MCP endpoint, API routes | 2-3 days |
| **Phase 3** | Agent definitions, container integration | 2-3 days |
| **Phase 4** | Frontend UI, store, polish | 2-3 days |

**Total: 12-15 days**

---

## Resolved Decisions

| Question | Decision |
|----------|----------|
| Database | PostgreSQL 16 + pgvector |
| ORM | Drizzle ORM |
| Framework | OpenCode native agent |
| First message trigger | UI prompt |
| Onboarding scope | Once per sandbox |
| Post-onboarding | `@workspace` agent |
| Re-onboarding | Ask user (wipe vs merge) |
| Vector search | pgvector with HNSW index |
| Knowledge seeding | Manual command |
| Testing | TDD approach |
| Migration | Clean start (no SQLite migration) |

---

## Next Steps

1. **Phase 1.1**: Add PostgreSQL container to docker-compose.yml
2. **Phase 1.2**: Install Drizzle and create schema files
3. **Phase 1.3**: Generate and run migrations
4. **Phase 1.4**: Migrate existing services to Drizzle
5. **Phase 1.5**: Add knowledge/onboarding tables with vector search
