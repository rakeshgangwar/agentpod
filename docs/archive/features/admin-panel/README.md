# Admin Functionality Implementation Plan

## Overview

This document outlines the implementation plan for admin functionality in AgentPod, enabling administrators to manage users and their resource limits.

### Goals

1. **User Management**: Admins can list, view, ban/unban users
2. **Resource Limits**: Per-user customizable limits on sandboxes, resources, and tiers
3. **Audit Logging**: Track all admin actions for accountability
4. **First-User Admin**: First user to sign up automatically becomes admin

### Scope

- **Phase 1 (Current)**: Simple admin/user roles with per-user resource limits
- **Phase 2 (Future)**: Organization plugin for teams and shared sandboxes

---

## Architecture

### Authentication

Using **Better Auth** with the **Admin Plugin**:

- Built-in `admin` and `user` roles
- Session-based authentication with cookies
- First user becomes admin via database hook
- Admin middleware protects admin routes

### Database Schema

#### Modified Tables

**`user` table** (Better Auth managed):
| Column | Type | Default | Description |
|--------|------|---------|-------------|
| role | text | "user" | User role: "user" or "admin" |
| banned | boolean | false | Whether user is banned |
| banned_reason | text | null | Reason for ban |
| banned_at | timestamp | null | When user was banned |

#### New Tables

**`user_resource_limits` table**:
| Column | Type | Default | Description |
|--------|------|---------|-------------|
| id | text | PK | Unique identifier |
| user_id | text | FK | Reference to user (unique) |
| max_sandboxes | integer | 1 | Maximum total sandboxes |
| max_concurrent_running | integer | 1 | Max running sandboxes |
| allowed_tier_ids | text (JSON) | ["starter"] | Allowed resource tier IDs |
| max_tier_id | text | "starter" | Highest tier allowed |
| max_total_storage_gb | integer | 10 | Total storage limit |
| max_total_cpu_cores | integer | 2 | Aggregate CPU limit |
| max_total_memory_gb | integer | 4 | Aggregate memory limit |
| allowed_addon_ids | text (JSON) | null | Allowed addons (null = all) |
| notes | text | null | Admin notes |
| created_at | timestamp | now | Created timestamp |
| updated_at | timestamp | now | Updated timestamp |

**`admin_audit_log` table**:
| Column | Type | Description |
|--------|------|-------------|
| id | text | Unique identifier |
| admin_user_id | text | Admin who performed action |
| action | text | Action type (see below) |
| target_user_id | text | Affected user (nullable) |
| target_resource_id | text | Affected resource ID |
| details | text (JSON) | Action-specific details |
| ip_address | text | Admin's IP address |
| user_agent | text | Admin's user agent |
| created_at | timestamp | When action occurred |

**Action Types**:
- `user_ban` - User was banned
- `user_unban` - User was unbanned
- `user_role_change` - User role changed
- `limits_update` - Resource limits updated
- `sandbox_force_delete` - Admin deleted user's sandbox
- `sandbox_force_stop` - Admin stopped user's sandbox

---

## Default Resource Limits

New users receive these default limits:

```typescript
const DEFAULT_LIMITS = {
  maxSandboxes: 1,
  maxConcurrentRunning: 1,
  allowedTierIds: ["starter"],
  maxTierId: "starter",
  maxTotalStorageGb: 10,
  maxTotalCpuCores: 2,
  maxTotalMemoryGb: 4,
  allowedAddonIds: null, // All allowed
};
```

Admins can adjust any user's limits individually.

---

## API Endpoints

### Admin Routes (`/api/admin/*`)

All routes require admin authentication.

#### User Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/users` | List all users (paginated) |
| GET | `/api/admin/users/:id` | Get user details with limits |
| PUT | `/api/admin/users/:id` | Update user (role) |
| POST | `/api/admin/users/:id/ban` | Ban user |
| POST | `/api/admin/users/:id/unban` | Unban user |

#### Resource Limits

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/users/:id/limits` | Get user's resource limits |
| PUT | `/api/admin/users/:id/limits` | Update user's resource limits |

#### User Resources

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/users/:id/sandboxes` | List user's sandboxes |
| GET | `/api/admin/users/:id/activity` | Get user's activity log |

#### System-wide

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/sandboxes` | List all sandboxes |
| DELETE | `/api/admin/sandboxes/:id` | Force delete sandbox |
| GET | `/api/admin/stats` | System statistics |
| GET | `/api/admin/audit-log` | Admin action audit log |

### Request/Response Examples

#### List Users
```http
GET /api/admin/users?search=john&page=1&limit=25
```

```json
{
  "users": [
    {
      "id": "user_123",
      "email": "john@example.com",
      "name": "John Doe",
      "role": "user",
      "banned": false,
      "createdAt": "2024-01-15T10:00:00Z",
      "sandboxCount": 1,
      "runningSandboxCount": 0
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 25,
  "totalPages": 1
}
```

#### Update Resource Limits
```http
PUT /api/admin/users/user_123/limits
Content-Type: application/json

{
  "maxSandboxes": 5,
  "maxConcurrentRunning": 2,
  "allowedTierIds": ["starter", "builder"],
  "maxTierId": "builder"
}
```

#### Ban User
```http
POST /api/admin/users/user_123/ban
Content-Type: application/json

{
  "reason": "Violation of terms of service"
}
```

---

## Ban Behavior

When a user is banned:

1. **User record updated**: `banned = true`, `banned_reason` and `banned_at` set
2. **Running containers stopped**: All user's running sandboxes are stopped
3. **Sessions revoked**: All active sessions invalidated via Better Auth
4. **Data preserved**: Sandbox metadata and data remain intact
5. **Access blocked**: Ban check middleware prevents API access
6. **Audit logged**: Action recorded with reason

When unbanned:
1. User record updated
2. User can log in again
3. Sandboxes can be started again
4. Audit logged

---

## Limit Enforcement

### Sandbox Creation

Before creating a sandbox, check:

```typescript
// 1. Total sandbox count
if (userSandboxes.length >= limits.maxSandboxes) {
  throw new LimitExceededError("sandbox_limit", limits.maxSandboxes);
}

// 2. Resource tier allowed
if (!limits.allowedTierIds.includes(requestedTierId)) {
  throw new LimitExceededError("tier_not_allowed", limits.allowedTierIds);
}

// 3. Addon restrictions (if configured)
if (limits.allowedAddonIds !== null) {
  const disallowed = requestedAddons.filter(
    a => !limits.allowedAddonIds.includes(a)
  );
  if (disallowed.length > 0) {
    throw new LimitExceededError("addon_not_allowed", disallowed);
  }
}
```

### Sandbox Start

Before starting a sandbox:

```typescript
// 1. Concurrent running limit
const running = userSandboxes.filter(s => s.status === 'running');
if (running.length >= limits.maxConcurrentRunning) {
  throw new LimitExceededError("concurrent_limit", limits.maxConcurrentRunning);
}

// 2. Aggregate resource check (optional, for future)
const totalCpu = calculateTotalCpuUsage(running);
const sandboxCpu = getTierCpuCores(sandbox.resourceTierId);
if (totalCpu + sandboxCpu > limits.maxTotalCpuCores) {
  throw new LimitExceededError("cpu_limit", limits.maxTotalCpuCores);
}
```

---

## Frontend Implementation

### Routes

```
/admin                      → Redirects to /admin/users
/admin/users                → User list (search, pagination)
/admin/users/[id]           → User detail + limits editor
```

### Components

| Component | Purpose |
|-----------|---------|
| `AdminGuard.svelte` | Protects admin routes, redirects non-admins |
| `AdminLayout.svelte` | Admin page layout with navigation |
| `UserTable.svelte` | Sortable, searchable user list |
| `UserDetail.svelte` | User info, stats, actions |
| `UserLimitsForm.svelte` | Resource limits editor form |
| `BanUserDialog.svelte` | Ban confirmation with reason input |
| `UserSandboxList.svelte` | List user's sandboxes with actions |
| `AdminStatsCards.svelte` | Dashboard statistics |

### Auth Store Updates

```typescript
// Add to auth store
export const auth = {
  // ... existing ...
  get isAdmin() {
    return sessionData?.user?.role === "admin";
  },
  get role() {
    return sessionData?.user?.role ?? "user";
  },
};
```

### Navigation

Admin link appears in navigation only for admin users:

```svelte
{#if auth.isAdmin}
  <NavItem href="/admin" icon={ShieldIcon}>Admin</NavItem>
{/if}
```

---

## File Structure

### Backend (apps/api/src/)

```
db/
  schema/
    admin.ts              # New: user_resource_limits, admin_audit_log
    auth.ts               # Modified: add role, banned columns
  migrations.ts           # Modified: add migration

auth/
  index.ts                # Modified: add admin plugin
  drizzle-auth.ts         # Modified: add admin plugin
  admin-middleware.ts     # New: admin route protection
  middleware.ts           # Modified: add ban check

models/
  user-resource-limits.ts # New: CRUD for limits
  admin-audit-log.ts      # New: audit logging
  admin-users.ts          # New: admin user operations

routes/
  admin.ts                # New: all admin endpoints
  sandboxes.ts            # Modified: limit enforcement
  index.ts                # Modified: mount admin routes

services/
  sandbox-manager.ts      # Modified: limit checks on start
```

### Frontend (apps/frontend/src/)

```
lib/
  api/
    admin.ts              # New: admin API client
  components/
    admin/
      AdminGuard.svelte
      UserTable.svelte
      UserLimitsForm.svelte
      BanUserDialog.svelte
      UserSandboxList.svelte
  stores/
    auth.svelte.ts        # Modified: add isAdmin

routes/
  admin/
    +layout.svelte        # Admin layout with guard
    +page.svelte          # Redirect to /admin/users
    users/
      +page.svelte        # User list
      [id]/
        +page.svelte      # User detail
```

### Shared Types (packages/types/src/)

```
admin.ts                  # New: all admin-related types
index.ts                  # Modified: export admin types
```

---

## Implementation Phases

### Phase 1: Database & Schema
- [ ] Add columns to user table schema
- [ ] Create user_resource_limits schema
- [ ] Create admin_audit_log schema
- [ ] Write database migration
- [ ] Test migration

### Phase 2: Better Auth Configuration
- [ ] Add admin plugin to auth config
- [ ] Configure first-user-becomes-admin hook
- [ ] Add new user default limits hook
- [ ] Update auth middleware for ban check

### Phase 3: Backend Models
- [ ] Create user-resource-limits model
- [ ] Create admin-audit-log model
- [ ] Create admin-users model
- [ ] Write unit tests for models

### Phase 4: Admin Routes
- [ ] Create admin middleware
- [ ] Implement user management endpoints
- [ ] Implement resource limits endpoints
- [ ] Implement system-wide endpoints
- [ ] Write integration tests

### Phase 5: Limit Enforcement
- [ ] Add checks to sandbox creation
- [ ] Add checks to sandbox start
- [ ] Handle limit errors gracefully
- [ ] Test limit enforcement

### Phase 6: Shared Types
- [ ] Create admin.ts types file
- [ ] Export from index.ts
- [ ] Update API to use shared types

### Phase 7: Frontend Auth
- [ ] Update auth store with role
- [ ] Add isAdmin computed property
- [ ] Update navigation for admin link

### Phase 8: Frontend Admin Pages
- [ ] Create admin layout
- [ ] Create user list page
- [ ] Create user detail page
- [ ] Create admin components

### Phase 9: Testing
- [ ] E2E tests for admin flows
- [ ] Integration tests for API
- [ ] Unit tests for components

---

## Security Considerations

1. **Route Protection**: All `/api/admin/*` routes require admin role
2. **Ban Check**: Middleware checks ban status on every authenticated request
3. **Audit Trail**: All admin actions logged with IP and user agent
4. **Session Revocation**: Banning immediately invalidates all sessions
5. **Input Validation**: All inputs validated with Zod schemas
6. **CSRF Protection**: Existing CSRF middleware applies to admin routes

---

## Future Enhancements

### Phase 2: Teams & Organizations

When ready for shared sandboxes:

1. Add Better Auth Organization plugin
2. Create organization, team, member tables
3. Add sandbox sharing with permissions
4. Implement team-based access control

### Billing Integration

When implementing billing:

1. Create subscription tiers linked to resource limit presets
2. Auto-apply limits based on subscription
3. Add usage tracking and billing alerts

---

## Open Questions (Resolved)

| Question | Decision |
|----------|----------|
| Default limits for new users | 1 sandbox, starter tier only |
| Resource limit presets | Skip for now, revisit with billing |
| Ban behavior | Stop containers, preserve data |
| Admin audit logging | Yes, all actions logged |
| UI priority | User list + limits management first |
