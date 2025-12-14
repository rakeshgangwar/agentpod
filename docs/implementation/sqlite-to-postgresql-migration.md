# SQLite to PostgreSQL Migration Plan

## Overview

The API codebase currently uses **two parallel database systems**:
1. **SQLite (bun:sqlite)** - Legacy models in `models/*.ts`, used by most business logic
2. **PostgreSQL/Drizzle** - New system in `db/drizzle.ts` with schemas in `db/schema/*.ts`

This creates a critical issue: the app initializes PostgreSQL via Drizzle but ALL business logic still uses SQLite. This document outlines the systematic migration plan.

## Current State

### Files Affected: 24 total

| Category | Count | Files |
|----------|-------|-------|
| Database Core | 2 | `db/index.ts` (SQLite), `db/drizzle.ts` (PostgreSQL) |
| Auth | 1 | `auth/index.ts` (separate SQLite DB) |
| Models | 11 | All files in `models/*.ts` |
| Services | 2 | `sandbox-manager.ts`, `image-resolver.ts` |
| Routes | 8 | Various route files |
| Middleware | 1 | `activity-logger.ts` |

### Drizzle Schemas (Already Exist)

The following schemas exist in `db/schema/*.ts` and are ready to use:

- `auth.ts` - user, session, account, verification tables
- `sandboxes.ts` - sandboxes table
- `chat.ts` - chat_sessions, chat_messages tables
- `providers.ts` - provider_credentials, oauth_state, providers tables
- `settings.ts` - settings, user_opencode_config, user_opencode_files, user_preferences tables
- `containers.ts` - resource_tiers, container_flavors, container_addons tables
- `activity.ts` - activity_log, activity_log_archive tables
- `knowledge.ts` - knowledge_documents table (new, PostgreSQL only)
- `onboarding.ts` - onboarding_sessions table (new, PostgreSQL only)

---

## Migration Phases

### Phase 1: Better Auth Migration
**Priority: HIGH | Risk: MEDIUM | Blocking: All authentication**

#### Files to Modify
- `src/auth/index.ts` - Switch from SQLite to Drizzle PostgreSQL adapter

#### Current Implementation
```typescript
// auth/index.ts - CURRENT (SQLite)
import { Database } from "bun:sqlite";

const authDb = new Database(config.auth.databasePath, { create: true });
// Uses SQLite for user, session, account tables
```

#### Target Implementation
```typescript
// auth/index.ts - TARGET (PostgreSQL/Drizzle)
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db/drizzle";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  // ... rest of config
});
```

#### Tests Required
- [ ] `tests/integration/auth.test.ts` - Sign up flow
- [ ] `tests/integration/auth.test.ts` - Sign in flow
- [ ] `tests/integration/auth.test.ts` - Session management
- [ ] `tests/integration/auth.test.ts` - OAuth flow (GitHub)

---

### Phase 2: Reference Data Models
**Priority: MEDIUM | Risk: LOW | Blocking: Container configuration**

These are read-only models, simplest to migrate.

#### Files to Modify
- `src/models/resource-tier.ts` → Use `db/schema/containers.ts`
- `src/models/container-flavor.ts` → Use `db/schema/containers.ts`
- `src/models/container-addon.ts` → Use `db/schema/containers.ts`
- `src/services/image-resolver.ts` → Update imports

#### Current Implementation
```typescript
// models/resource-tier.ts - CURRENT
import { db } from '../db/index.ts';

export function getResourceTierById(id: string): ResourceTier | null {
  const row = db.query<ResourceTierRow, [string]>(
    'SELECT * FROM resource_tiers WHERE id = ?'
  ).get(id);
  return row ? mapRowToResourceTier(row) : null;
}
```

#### Target Implementation
```typescript
// models/resource-tier.ts - TARGET
import { db } from '../db/drizzle';
import { resourceTiers } from '../db/schema/containers';
import { eq } from 'drizzle-orm';

export async function getResourceTierById(id: string): Promise<ResourceTier | null> {
  const [tier] = await db.select().from(resourceTiers).where(eq(resourceTiers.id, id));
  return tier ?? null;
}
```

#### Tests Required
- [ ] `tests/unit/models/resource-tier.test.ts`
- [ ] `tests/unit/models/container-flavor.test.ts`
- [ ] `tests/unit/models/container-addon.test.ts`
- [ ] `tests/integration/routes/resource-tiers.test.ts`
- [ ] `tests/integration/routes/flavors.test.ts`
- [ ] `tests/integration/routes/addons.test.ts`

---

### Phase 3: Core Sandbox System
**Priority: HIGH | Risk: HIGH | Blocking: Sandbox creation/management**

#### Files to Modify
- `src/models/sandbox.ts` → Use `db/schema/sandboxes.ts`
- `src/models/provider.ts` → Use `db/schema/providers.ts`
- `src/models/provider-credentials.ts` → Use `db/schema/providers.ts`
- `src/models/user-opencode-config.ts` → Use `db/schema/settings.ts`
- `src/services/sandbox-manager.ts` → Update to async/await
- `src/services/sync/opencode-sync.ts` → Update imports

#### Key Considerations
- `sandbox.ts` has complex status management
- `provider-credentials.ts` uses encryption - must preserve
- `sandbox-manager.ts` is the core orchestration layer
- All methods become async (SQLite was sync)

#### Tests Required
- [ ] `tests/unit/models/sandbox.test.ts`
- [ ] `tests/unit/models/provider.test.ts`
- [ ] `tests/unit/models/provider-credentials.test.ts`
- [ ] `tests/unit/models/user-opencode-config.test.ts`
- [ ] `tests/integration/sandbox-manager.test.ts`
- [ ] `tests/integration/routes/sandboxes.test.ts`
- [ ] `tests/e2e/sandbox-lifecycle.test.ts`

---

### Phase 4: User Preferences
**Priority: MEDIUM | Risk: LOW | Blocking: Settings sync**

#### Files to Modify
- `src/models/user-preferences.ts` → Use `db/schema/settings.ts`
- `src/routes/preferences.ts` → Update to async

#### Tests Required
- [ ] `tests/unit/models/user-preferences.test.ts`
- [ ] `tests/integration/routes/preferences.test.ts`

---

### Phase 5: Chat Models
**Priority: MEDIUM | Risk: MEDIUM | Blocking: Chat history**

#### Files to Modify
- `src/models/chat-session.ts` → Use `db/schema/chat.ts`
- `src/models/chat-message.ts` → Use `db/schema/chat.ts`
- `src/routes/chat.ts` → Update to async

#### Tests Required
- [ ] `tests/unit/models/chat-session.test.ts`
- [ ] `tests/unit/models/chat-message.test.ts`
- [ ] `tests/integration/routes/chat.test.ts`

---

### Phase 6: Activity Log
**Priority: LOW | Risk: LOW | Blocking: Audit/analytics**

#### Files to Modify
- `src/models/activity-log.ts` → Use `db/schema/activity.ts`
- `src/routes/activity.ts` → Update to async
- `src/middleware/activity-logger.ts` → Update to async
- `src/services/sync/activity-archival.ts` → Update to async

#### Tests Required
- [ ] `tests/unit/models/activity-log.test.ts`
- [ ] `tests/integration/routes/activity.test.ts`
- [ ] `tests/integration/activity-archival.test.ts`

---

### Phase 7: Direct Query Cleanup
**Priority: MEDIUM | Risk: MEDIUM | Blocking: Account management**

#### Files to Modify
- `src/routes/account.ts` - Has direct `db.query()` and `db.run()` calls

#### Tests Required
- [ ] `tests/integration/routes/account.test.ts`

---

### Phase 8: Legacy Cleanup
**Priority: LOW | Risk: LOW | Blocking: None**

#### Files to Remove
- `src/db/index.ts` - SQLite connection
- `src/db/schema.sql` - SQLite schema
- `src/db/migrations.ts` - SQLite migrations

#### Verification
- [ ] No imports of `db/index.ts` remain
- [ ] All tests pass
- [ ] Application starts without SQLite

---

## Migration Pattern

For each model migration, follow this pattern:

### Step 1: Create Async Version
```typescript
// models/example.ts
import { db } from '../db/drizzle';
import { exampleTable } from '../db/schema/example';
import { eq } from 'drizzle-orm';

// New async implementation
export async function getById(id: string): Promise<Example | null> {
  const [row] = await db.select().from(exampleTable).where(eq(exampleTable.id, id));
  return row ?? null;
}
```

### Step 2: Update Callers
All callers must be updated to use `await`:
```typescript
// Before
const item = ExampleModel.getById(id);

// After
const item = await ExampleModel.getById(id);
```

### Step 3: Update Route Handlers
Route handlers are already async, just add await:
```typescript
.get('/:id', async (c) => {
  const item = await ExampleModel.getById(c.req.param('id'));
  return c.json({ item });
});
```

### Step 4: Run Tests
```bash
cd apps/api
bun test tests/unit/models/example.test.ts
bun test tests/integration/routes/example.test.ts
```

---

## Testing Strategy

### Unit Tests
Each model should have unit tests that verify:
- CRUD operations work correctly
- Edge cases are handled (null, empty, etc.)
- Type safety is maintained

### Integration Tests
Route tests that verify:
- API endpoints return correct data
- Error handling works
- Authentication/authorization is enforced

### E2E Tests
Full flow tests for critical paths:
- Sandbox creation → start → stop → delete
- User signup → login → create sandbox
- Provider configuration → use in container

---

## Rollback Plan

If issues arise during migration:

1. **Per-model rollback**: Keep old SQLite implementation as `_legacy.ts` until migration is verified
2. **Feature flags**: Add `USE_POSTGRES_MODEL_X` env vars for gradual rollout
3. **Database sync**: Keep SQLite and PostgreSQL in sync during transition

---

## Progress Tracking

| Phase | Status | Started | Completed | Tests Passing |
|-------|--------|---------|-----------|---------------|
| Phase 1: Better Auth | ❌ Not Started | - | - | - |
| Phase 2: Reference Data | ✅ **DONE** | Dec 14, 2024 | Dec 14, 2024 | Pending |
| Phase 3: Core Sandbox | ✅ **DONE** | Dec 14, 2024 | Dec 14, 2024 | Pending |
| Phase 4: User Preferences | ✅ **DONE** | Dec 14, 2024 | Dec 14, 2024 | Pending |
| Phase 5: Chat Models | ✅ **DONE** | Dec 14, 2024 | Dec 14, 2024 | Pending |
| Phase 6: Activity Log | ✅ **DONE** | Dec 14, 2024 | Dec 14, 2024 | Pending |
| Phase 7: Direct Queries | ✅ **DONE** | Dec 14, 2024 | Dec 14, 2024 | Pending |
| Phase 8: Cleanup | ⏳ Partial | Dec 14, 2024 | - | - |

### Phase Notes

**Phase 1 (Better Auth):** Still uses SQLite via `bun:sqlite`. Requires switching to `drizzleAdapter(db, { provider: "pg" })`.

**Phases 2-7:** All models converted to use Drizzle/PostgreSQL. Key changes:
- All functions are now `async` and return `Promise<T>`
- Using `db.select()`, `db.insert()`, `db.update()`, `db.delete()` from Drizzle
- Schema imports from `db/schema/*.ts`

**Phase 8 (Cleanup):** 
- SQLite files (`db/index.ts`, `db/migrations.ts`) still exist
- Cannot remove until Phase 1 (Better Auth) is migrated

### Additional Work Completed

**Per-User Provider Credentials:** Provider credentials were made per-user (not global):
- Added `userId` column to `providerCredentials` table
- Added `userId` column to `oauthState` table  
- All credential functions now require `userId` parameter
- Security: Users can only access their own credentials/OAuth flows

---

## Notes

- All Drizzle schemas already exist - this is about switching implementations
- PostgreSQL migrations run automatically on startup via `initDatabase()`
- Better Auth already supports Drizzle adapter - just need to switch
- Encryption in `provider-credentials.ts` is database-agnostic

---

## Schema Changes Made

### Provider Credentials (Per-User)

The `providerCredentials` table was updated to support per-user credentials:

```sql
-- New columns added
userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE
-- Unique constraint: one credential per provider per user
UNIQUE(userId, providerId)
-- Index for efficient lookups
CREATE INDEX idx_provider_credentials_user ON provider_credentials(userId)
```

### OAuth State (Per-User)

The `oauthState` table was updated to track which user initiated OAuth:

```sql
-- New column added  
userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE
-- Index for efficient lookups
CREATE INDEX idx_oauth_state_user ON oauth_state(userId)
```

These changes require a database migration to be generated and applied.
