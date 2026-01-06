# User Data Persistence Plan

This document describes the architecture for persisting user data across the AgentPod platform, ensuring data survives app reinstalls, container recreations, and device changes.

> **Last Updated:** December 2024
> **Status:** Implementation in progress

## Table of Contents

1. [Overview](#overview)
2. [Design Decisions](#design-decisions)
3. [Current State Analysis](#current-state-analysis)
4. [Architecture](#architecture)
5. [Database Schema](#database-schema)
6. [Sync Services](#sync-services)
7. [API Endpoints](#api-endpoints)
8. [Data Retention Policy](#data-retention-policy)
9. [Implementation Plan](#implementation-plan)

---

## Overview

### Problem Statement

Currently, user data persistence has significant gaps:
- **Chat sessions** exist only inside containers (lost on container recreation)
- **App settings** are local-only (lost on app uninstall)
- **Sandbox metadata** is stored in Docker labels (lost on Docker reset)

### Solution

Implement a comprehensive server-side persistence layer that:
1. Stores all user data in the Management API's SQLite database
2. Real-time syncs chat sessions from OpenCode and ACP Gateway
3. Bidirectionally syncs user preferences across devices
4. Maintains activity logs with 90-day retention and permanent anonymized archive

### What Survives After User Reinstalls App

| Data Type | Restored? |
|-----------|-----------|
| User account | Yes |
| Projects/Sandboxes | Yes |
| Chat history | Yes |
| LLM API keys | Yes |
| OpenCode config | Yes |
| App preferences | Yes |
| Activity history | Yes (90 days) |

---

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Chat persistence | **Real-time sync** | Ensures no message loss; enables cross-device access |
| Sandbox ownership | **Single user** | Simplifies permissions; team features can be added later |
| Settings sync | **Automatic bidirectional** | Best UX; server pushes changes to all devices |
| Data retention | **Anonymized archive** | Preserves analytics value while respecting privacy |
| ACP Gateway persistence | **Management API only** | Keeps containers stateless and easily replaceable |
| Message format | **Raw with source field** | Preserves full fidelity; normalize at API layer |
| Sync conflict resolution | **OpenCode is source of truth** | Our DB is cache/backup; OpenCode has authoritative state |

---

## Current State Analysis

### What IS Persisted (Server-Side)

| Data | Table | Notes |
|------|-------|-------|
| User accounts | `user` | Better Auth |
| OAuth connections | `account` | Better Auth |
| Session tokens | `session` | Better Auth |
| LLM credentials | `provider_credentials` | AES-256-GCM encrypted |
| OpenCode settings | `user_opencode_config` | JSON settings + AGENTS.md |
| Custom agents/commands | `user_opencode_files` | User's global customizations |
| Resource tiers | `resource_tiers` | Container resource definitions |
| Container flavors | `container_flavors` | Language-specific images |
| Container addons | `container_addons` | Optional features |

### What IS NOT Persisted (Gaps)

| Data | Current Location | Problem |
|------|------------------|---------|
| Sandbox metadata | Docker labels | Lost on Docker reset |
| Chat sessions | OpenCode internal DB | Lost on container recreation |
| Chat messages | OpenCode internal DB | Lost on container recreation |
| ACP Gateway sessions | In-memory | Lost on container restart |
| App preferences | Local files only | Lost on app uninstall |
| Activity logs | Not tracked | No audit trail |

---

## Architecture

### Conversation Persistence Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Conversation Persistence Architecture                 │
│                                                                          │
│  Path 1: Direct OpenCode API                                            │
│  ─────────────────────────────────                                      │
│  Mobile App → Management API → OpenCode SDK → OpenCode Container        │
│                    │                              │                      │
│                    │                              ▼                      │
│                    │                    OpenCode Internal DB             │
│                    │                    (source of truth)                │
│                    │                                                     │
│                    └──── Sync Service ────► Management API DB            │
│                            (SSE)              (cache/backup)             │
│                                                                          │
│  Path 2: ACP Gateway (multi-agent)                                      │
│  ─────────────────────────────────                                      │
│  Mobile App → Management API → ACP Gateway → Agent (OpenCode/Claude)    │
│                    │                │                                    │
│                    │                │ (stateless, in-memory)             │
│                    │                │                                    │
│                    └── ACP Sync ────┴────► Management API DB             │
│                         (SSE)                (sole persistence)          │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                  Management API SQLite Database                    │ │
│  │  ┌─────────────┐ ┌──────────────┐ ┌──────────────┐               │ │
│  │  │ sandboxes   │ │chat_sessions │ │chat_messages │               │ │
│  │  └─────────────┘ └──────────────┘ └──────────────┘               │ │
│  │  ┌─────────────────┐ ┌───────────────┐ ┌─────────────────────┐  │ │
│  │  │user_preferences │ │ activity_log  │ │activity_log_archive │  │ │
│  │  └─────────────────┘ └───────────────┘ └─────────────────────┘  │ │
│  └───────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

### Sync Service Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                       Sync Services                                  │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                   OpenCode Sync Service                       │  │
│  │  • Subscribes to OpenCode SSE events per sandbox             │  │
│  │  • Real-time: session.created, message.created, etc.         │  │
│  │  • Backup: Full sync every 5 minutes                         │  │
│  │  • Reconnects with exponential backoff                       │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                   ACP Gateway Sync Service                    │  │
│  │  • Subscribes to ACP Gateway SSE events per sandbox          │  │
│  │  • Sole persistence layer (ACP Gateway is stateless)         │  │
│  │  • Handles multi-agent sessions (OpenCode, Claude, etc.)     │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                   Preferences Sync Service                    │  │
│  │  • Bidirectional sync between server and clients             │  │
│  │  • Server is source of truth                                 │  │
│  │  • Version tracking for conflict resolution                  │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                   Activity Archival Service                   │  │
│  │  • Runs daily via cron                                       │  │
│  │  • Archives logs older than 90 days                          │  │
│  │  • Anonymizes PII, preserves action/entity data              │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### New Tables

#### `sandboxes` - Sandbox metadata (replaces Docker labels)

```sql
CREATE TABLE sandboxes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  
  -- Git/Repository info
  repo_name TEXT NOT NULL,
  github_url TEXT,
  
  -- Container configuration (modular system)
  resource_tier_id TEXT DEFAULT 'starter' REFERENCES resource_tiers(id),
  flavor_id TEXT DEFAULT 'fullstack' REFERENCES container_flavors(id),
  addon_ids TEXT DEFAULT '[]',  -- JSON array of addon IDs
  
  -- Container runtime info
  container_id TEXT,
  container_name TEXT,
  status TEXT DEFAULT 'created' CHECK(status IN ('created', 'starting', 'running', 'stopping', 'stopped', 'error')),
  error_message TEXT,
  
  -- URLs
  opencode_url TEXT,
  acp_gateway_url TEXT,
  vnc_url TEXT,
  code_server_url TEXT,
  
  -- Timestamps
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  last_accessed_at TEXT,
  
  UNIQUE(user_id, slug)
);

CREATE INDEX idx_sandboxes_user_id ON sandboxes(user_id);
CREATE INDEX idx_sandboxes_status ON sandboxes(status);
CREATE INDEX idx_sandboxes_container_id ON sandboxes(container_id);
```

#### `chat_sessions` - Unified session tracking

```sql
CREATE TABLE chat_sessions (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  sandbox_id TEXT NOT NULL REFERENCES sandboxes(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  
  -- Session source
  source TEXT NOT NULL CHECK(source IN ('opencode', 'acp_gateway')),
  
  -- External references
  opencode_session_id TEXT,     -- Session ID in OpenCode
  acp_session_id TEXT,          -- Session ID in ACP Gateway
  acp_agent_id TEXT,            -- Agent ID (opencode, claude-code, etc.)
  
  -- Session metadata
  title TEXT,
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'archived', 'deleted')),
  
  -- Statistics
  message_count INTEGER DEFAULT 0,
  user_message_count INTEGER DEFAULT 0,
  assistant_message_count INTEGER DEFAULT 0,
  total_input_tokens INTEGER DEFAULT 0,
  total_output_tokens INTEGER DEFAULT 0,
  
  -- Timestamps
  last_message_at TEXT,
  last_synced_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX idx_chat_sessions_opencode ON chat_sessions(sandbox_id, opencode_session_id) 
  WHERE opencode_session_id IS NOT NULL;
CREATE UNIQUE INDEX idx_chat_sessions_acp ON chat_sessions(sandbox_id, acp_session_id) 
  WHERE acp_session_id IS NOT NULL;
CREATE INDEX idx_chat_sessions_user ON chat_sessions(user_id);
CREATE INDEX idx_chat_sessions_status ON chat_sessions(status);
```

#### `chat_messages` - Message content (raw format)

```sql
CREATE TABLE chat_messages (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  
  -- External reference
  external_message_id TEXT,
  
  -- Message content (raw format from source)
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,     -- JSON: raw message parts/content
  tool_calls TEXT,           -- JSON: tool invocations
  tool_results TEXT,         -- JSON: tool results
  thinking TEXT,             -- JSON: reasoning output
  
  -- Model info
  model_provider TEXT,
  model_id TEXT,
  agent_id TEXT,             -- For ACP: which agent responded
  
  -- Token usage
  input_tokens INTEGER,
  output_tokens INTEGER,
  
  -- Message status
  status TEXT DEFAULT 'complete' CHECK(status IN ('streaming', 'complete', 'error', 'cancelled')),
  error_message TEXT,
  
  -- Timestamps
  created_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE INDEX idx_chat_messages_session ON chat_messages(session_id);
CREATE INDEX idx_chat_messages_external ON chat_messages(session_id, external_message_id);
CREATE INDEX idx_chat_messages_created ON chat_messages(created_at);
```

#### `user_preferences` - User app settings

```sql
CREATE TABLE user_preferences (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL UNIQUE REFERENCES user(id) ON DELETE CASCADE,
  
  -- Theme
  theme_mode TEXT DEFAULT 'system' CHECK(theme_mode IN ('light', 'dark', 'system')),
  theme_preset TEXT DEFAULT 'default-neutral',
  
  -- App behavior
  auto_refresh_interval INTEGER DEFAULT 30,
  in_app_notifications INTEGER DEFAULT 1,
  system_notifications INTEGER DEFAULT 1,
  
  -- Default sandbox configuration
  default_resource_tier_id TEXT DEFAULT 'starter',
  default_flavor_id TEXT DEFAULT 'fullstack',
  default_addon_ids TEXT DEFAULT '["code-server"]',
  default_agent_id TEXT DEFAULT 'opencode',
  
  -- Sync tracking
  settings_version INTEGER DEFAULT 1,
  
  -- Timestamps
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

#### `activity_log` - Activity tracking (90-day retention)

```sql
CREATE TABLE activity_log (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT REFERENCES user(id) ON DELETE SET NULL,
  
  -- Action details
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  
  -- Context
  metadata TEXT,       -- JSON
  ip_address TEXT,
  user_agent TEXT,
  
  -- For anonymization
  anonymized INTEGER DEFAULT 0,
  
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_activity_log_user ON activity_log(user_id);
CREATE INDEX idx_activity_log_action ON activity_log(action);
CREATE INDEX idx_activity_log_created ON activity_log(created_at);
```

#### `activity_log_archive` - Archived activity (anonymized, permanent)

```sql
CREATE TABLE activity_log_archive (
  id TEXT PRIMARY KEY,
  
  -- Anonymized action details
  action TEXT NOT NULL,
  entity_type TEXT,
  
  -- Aggregated metadata (no PII)
  metadata TEXT,
  
  -- Timestamps
  original_created_at TEXT NOT NULL,
  archived_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_activity_archive_action ON activity_log_archive(action);
CREATE INDEX idx_activity_archive_original ON activity_log_archive(original_created_at);
```

---

## Sync Services

### OpenCode Sync Service

Real-time sync via SSE events from OpenCode containers.

**Events Handled:**
- `session.created` → Insert `chat_sessions`
- `session.updated` → Update session metadata
- `session.deleted` → Mark as deleted
- `message.created` → Insert `chat_messages`
- `message.updated` → Update message (streaming complete)
- `part.updated` → Append to message content

**Backup Sync:**
- Full sync every 5 minutes
- Fetches all sessions/messages from OpenCode
- Reconciles with local database

### ACP Gateway Sync Service

Persists ACP Gateway sessions (sole persistence layer).

**Events Handled:**
- `session_update` → Update message content
- `session_end_turn` → Mark message complete
- `permission_request` → Log permission event
- `error` → Log error, mark message as errored

### Preferences Sync Service

Bidirectional sync with version tracking.

**Sync Flow:**
1. Client changes preference → API call → Update DB → Increment version
2. Server broadcasts change → Other clients update local state
3. On app startup: Fetch from server, merge with local (server wins)

### Activity Archival Service

Daily cron job for log management.

**Process:**
1. Find logs older than 90 days
2. Remove PII (user_id → null, ip/user_agent → null, sanitize metadata)
3. Insert into `activity_log_archive`
4. Delete from `activity_log`

---

## API Endpoints

### Sandbox API (Updated)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/sandboxes` | List user's sandboxes |
| POST | `/sandboxes` | Create sandbox |
| GET | `/sandboxes/:id` | Get sandbox details |
| PATCH | `/sandboxes/:id` | Update sandbox |
| DELETE | `/sandboxes/:id` | Delete sandbox |
| POST | `/sandboxes/:id/start` | Start container |
| POST | `/sandboxes/:id/stop` | Stop container |

### Chat API (New)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/sandboxes/:id/chat/sessions` | List sessions |
| GET | `/sandboxes/:id/chat/sessions/:sessionId` | Get session with messages |
| POST | `/sandboxes/:id/chat/sessions/:sessionId/sync` | Force sync |
| DELETE | `/sandboxes/:id/chat/sessions/:sessionId` | Archive session |
| GET | `/sandboxes/:id/chat/sessions/:sessionId/messages` | Paginated messages |

### Preferences API (New)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/users/me/preferences` | Get preferences |
| PUT | `/users/me/preferences` | Update preferences |
| PATCH | `/users/me/preferences` | Partial update |

### Activity API (New)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/users/me/activity` | Get activity log |
| GET | `/users/me/activity/export` | Export as JSON/CSV |

---

## Data Retention Policy

| Data Type | Active Retention | Archive | Delete |
|-----------|-----------------|---------|--------|
| Chat sessions | Forever | N/A | On user delete |
| Chat messages | Forever | N/A | On user delete |
| Activity logs | 90 days | Anonymized archive | Never |
| User preferences | Forever | N/A | On user delete |
| Sandboxes | Forever | N/A | On user delete |

### User Deletion Process

1. **Archive activity logs** (anonymize PII, keep for analytics)
2. **Stop all containers** and delete Docker resources
3. **Delete user** (cascades to sandboxes → sessions → messages → preferences)
4. Activity logs remain with `user_id = NULL, anonymized = 1`

---

## Implementation Plan

### Phase 1: Database Foundation (Week 1) ✅ COMPLETE
- [x] Create migrations 13-17 (all new tables)
- [x] Create DB models for all new tables
- [x] Update sandbox-manager to use database
- [x] Create migration 18 (Docker to DB migration)
- [ ] Test migration on existing data

**What was implemented:**
- Migrations 13-18 in `apps/api/src/db/migrations.ts`
- Database models in `apps/api/src/models/`:
  - `sandbox.ts` - Full CRUD for sandbox metadata
  - `chat-session.ts` - Session management
  - `chat-message.ts` - Message storage
  - `user-preferences.ts` - User preferences with sync
  - `activity-log.ts` - Activity logging with archival
- Refactored `sandbox-manager.ts` to:
  - Use database as source of truth (not Docker labels)
  - Create sandbox DB records before Docker containers
  - Sync container status/URLs back to DB
  - Automatic migration of existing Docker containers to DB

### Phase 2: Chat Persistence (Week 2) ✅ COMPLETE
- [x] Implement OpenCode sync service
- [x] Subscribe to OpenCode SSE events
- [x] Implement full sync (5-minute backup)
- [x] Create chat API routes
- [ ] Add ACP Gateway sync hooks (deferred to Phase 4)

**What was implemented:**
- Created `apps/api/src/services/sync/opencode-sync.ts`:
  - SSE subscription to OpenCode containers for real-time sync
  - Event handling: session.created, session.updated, session.deleted, message.created, message.updated, part.updated
  - Full sync every 5 minutes as backup
  - Reconnection with exponential backoff (max 10 attempts)
  - `startSyncForRunningSandboxes()` - called on API startup
  - `stopAllSync()` - called on API shutdown (SIGINT/SIGTERM)
- Created `apps/api/src/routes/chat.ts`:
  - `GET /:sandboxId/chat/sessions` - List sessions with pagination
  - `GET /:sandboxId/chat/sessions/:sessionId` - Get session with messages
  - `GET /:sandboxId/chat/sessions/:sessionId/messages` - Paginated messages
  - `POST /:sandboxId/chat/sessions/:sessionId/sync` - Force sync session
  - `DELETE /:sandboxId/chat/sessions/:sessionId` - Archive session
  - `GET /:sandboxId/chat/sync/status` - Get sync status
  - `POST /:sandboxId/chat/sync` - Full sync for sandbox
- Updated `apps/api/src/index.ts`:
  - Registered chat routes at `/api/v2/sandboxes`
  - Start sync for running sandboxes on API startup
  - Graceful shutdown handlers for sync service
- Updated `apps/api/src/services/sandbox-manager.ts`:
  - `startSandbox()` - starts sync after container starts
  - `stopSandbox()` - stops sync before stopping container
  - `deleteSandbox()` - stops sync before deleting
  - `createSandbox()` with `autoStart=true` - starts sync after container starts

### Phase 3: Preferences & Activity (Week 3) ✅ COMPLETE
- [x] Create preferences API routes
- [x] Create activity API routes
- [x] Add activity logging middleware
- [ ] Update frontend settings store (deferred - needs frontend work)
- [ ] Implement preferences sync service (deferred - WebSocket for push updates)

**What was implemented:**
- Created `apps/api/src/routes/preferences.ts`:
  - `GET /` - Get user preferences (creates defaults if not exists)
  - `PUT /` - Replace preferences
  - `PATCH /` - Partial update
  - `GET /version` - Get settings version for sync
  - `GET /sync` - Check sync status (compare local vs server version)
  - `DELETE /` - Reset preferences to defaults
- Created `apps/api/src/routes/activity.ts`:
  - `GET /` - List activity logs (paginated, filterable by action)
  - `GET /stats` - Get activity statistics by action type
  - `GET /export` - Export as JSON or CSV
  - `GET /entity/:type/:id` - Get activity for specific entity
- Created `apps/api/src/middleware/activity-logger.ts`:
  - Automatic logging middleware for POST/PUT/PATCH/DELETE requests
  - Route-to-action mapping for sandbox, provider, preferences, chat operations
  - Path parameter extraction for entity info
  - Manual `logActivity()` helper for custom logging in handlers
- Updated `apps/api/src/index.ts`:
  - Registered preferences routes at `/api/users/me/preferences`
  - Registered activity routes at `/api/users/me/activity`
  - Added activity logger middleware to `/api/*` routes

### Phase 4: Archival & Cleanup (Week 4) ✅ COMPLETE
- [x] Implement activity archival service
- [x] Create archival cron job (daily at 3 AM)
- [x] Implement user deletion with anonymization
- [ ] End-to-end testing (manual testing recommended)
- [x] Documentation

**What was implemented:**
- Created `apps/api/src/services/sync/activity-archival.ts`:
  - `ActivityArchivalService` class with singleton pattern
  - Automatic archival of logs older than 90 days
  - Daily scheduling via interval-based checks (runs at 3 AM)
  - Anonymizes PII during archival (removes email, name, IP, user agent)
  - `forceArchival()` for manual trigger
  - `getArchivalStatus()` for monitoring
- Created `apps/api/src/routes/account.ts`:
  - `GET /api/account` - Get account info with stats
  - `DELETE /api/account` - Full account deletion with:
    - Confirmation phrase required ("DELETE MY ACCOUNT")
    - Deletes all sandboxes (containers + repos)
    - Anonymizes activity logs (preserves for analytics)
    - Deletes preferences, OpenCode config, provider credentials
    - Deletes user account (Better Auth tables)
  - `GET /api/account/data-export` - GDPR-compliant data export (JSON)
- Updated `apps/api/src/index.ts`:
  - Registered account routes at `/api/account`
  - Added archival service startup/shutdown
  - Updated startup banner with new endpoints

---

## Activity Log Actions

| Action | Entity Type | Description |
|--------|-------------|-------------|
| `auth.login` | `user` | User logged in |
| `auth.logout` | `user` | User logged out |
| `auth.token_refresh` | `user` | Session refreshed |
| `sandbox.create` | `sandbox` | Sandbox created |
| `sandbox.start` | `sandbox` | Container started |
| `sandbox.stop` | `sandbox` | Container stopped |
| `sandbox.delete` | `sandbox` | Sandbox deleted |
| `sandbox.update` | `sandbox` | Config updated |
| `chat.session_create` | `chat_session` | Session started |
| `chat.message_send` | `chat_message` | User sent message |
| `chat.message_receive` | `chat_message` | Assistant responded |
| `chat.session_archive` | `chat_session` | Session archived |
| `preferences.update` | `user` | Preferences changed |
| `provider.configure` | `provider` | LLM provider configured |
| `provider.oauth_complete` | `provider` | OAuth completed |

---

## Files to Create/Modify

### New Files

| File | Purpose |
|------|---------|
| `apps/api/src/models/sandbox.ts` | Sandbox DB model |
| `apps/api/src/models/chat-session.ts` | Chat session DB model |
| `apps/api/src/models/chat-message.ts` | Chat message DB model |
| `apps/api/src/models/user-preferences.ts` | Preferences DB model |
| `apps/api/src/models/activity-log.ts` | Activity log DB model |
| `apps/api/src/services/sync/opencode-sync.ts` | OpenCode sync |
| `apps/api/src/services/sync/acp-sync.ts` | ACP Gateway sync |
| `apps/api/src/services/sync/preferences-sync.ts` | Preferences sync |
| `apps/api/src/services/sync/activity-archival.ts` | Archival job |
| `apps/api/src/routes/chat.ts` | Chat API |
| `apps/api/src/routes/preferences.ts` | Preferences API |
| `apps/api/src/routes/activity.ts` | Activity API |
| `apps/api/src/middleware/activity-logger.ts` | Activity middleware |
| `packages/types/src/persistence.ts` | Shared types |

### Modified Files

| File | Changes |
|------|---------|
| `apps/api/src/db/migrations.ts` | Add migrations 13-18 |
| `apps/api/src/services/sandbox-manager.ts` | Use DB as source |
| `apps/api/src/routes/sandboxes.ts` | Update to DB-backed |
| `apps/api/src/index.ts` | Register routes, start sync |
| `apps/frontend/src/lib/stores/settings.svelte.ts` | Add server sync |

---

## References

- [OpenCode SDK Analysis](./opencode-sdk-analysis.md)
- [OpenCode Config Architecture](./opencode-config-architecture.md)
- [ACP Gateway Source](../docker/base/acp-gateway/)
