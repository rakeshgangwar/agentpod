# P2b — Hub OpenCode Backend Retirement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`).

**Goal:** Reduce the hub to the fleet/facilities backend only — remove all OpenCode routes/services/models/schema and drop the OpenCode tables — without breaking the fleet (nodes/stations/runtimes/provisioning/admin/auth) or P4.

**Architecture:** Surgery first (un-wire the two kept files that touch OpenCode), then delete the OpenCode routes/services/models + unmount them, then purge the schema + generate a reviewed drop-migration. Gate each step on `bun test` + the hub booting.

**Tech Stack:** Bun + Hono, Drizzle ORM + Postgres, drizzle-kit migrations (auto-applied on startup).

**Spec:** `docs/superpowers/specs/2026-06-29-p2b-hub-opencode-backend-retirement-design.md`.

## Global Constraints

- Hub dir: `apps/hub`. Tooling: `bun test` (needs Postgres on :5434 — `postgres://agentpod:agentpod-dev-password@localhost:5434/agentpod`); `bun run db:generate` (drizzle-kit); typecheck via `bunx tsc --noEmit` or the test run.
- **KEEP-boundary (never delete/break):**
  - routes: `health`, `gateway`, `nodes`(enroll+list), `enrollment-tokens`, `runtimes`, `stations`, `station-terminal`, `station-activity`, `activity-fleet`, `station-writes`, `station-lifecycle`, `station-cleanup`, `admin` *(cleaned)*, `cloudflare-webhook`.
  - services: `audit`, `broker`, `connection-manager`, `enrollment`, `node-registry`, `runtime-autoadopt`, `runtimes`, `station-registry`, `image-resolver`, `provisioner/*` (+ their `*.test.ts`).
  - models: `admin-audit-log`, `admin-users` *(trimmed)*, `system-settings`.
  - schema: `auth`, `admin` *(minus `userResourceLimits`/`DEFAULT_RESOURCE_LIMITS`)*, `nodes`, `stations`, `audit`, `cloudflare`.
  - Better Auth (`admin()`+`customSession()` plugins, `/api/auth/*`).
- **Deletion rule:** a route/service/model is removed if it is OpenCode AND nothing in the KEEP-set imports it. Grep each basename before deleting; resolve any kept-set importer first.
- Recoverable from git history + `v0.0.4-opencode`.

---

### Task 1: Surgery — un-wire the two kept files from OpenCode

**Files:** Modify `apps/hub/src/auth/drizzle-auth.ts`, `apps/hub/src/routes/admin.ts`.

**1a — `drizzle-auth.ts`:** in the `databaseHooks.user.create.after` hook, remove the `db.insert(userResourceLimits)...` block and the `ensureDefaultAgents(createdUser.id)` call (+ their `try/catch` + log lines). Remove the now-unused imports: `userResourceLimits`, `DEFAULT_RESOURCE_LIMITS` (from `../db/schema`), `ensureDefaultAgents` (from `../services/default-agents-service`). KEEP: the `before` hook (first-user→admin), the `disableSignup(createdUser.id)` call after the first admin, and all plugins. The `after` hook may become empty except the signup-disable — that's fine.

**1b — `routes/admin.ts`:** remove the OpenCode endpoints + their imports — `GET /users/:id/sandboxes`, `GET /sandboxes`, the "stop all running sandboxes" block in the ban handler (~lines 192–214), and any user resource-limits / resource-tier endpoints. Remove imports of `getUserSandboxes`, user-limits/resource-tier model functions, `sandbox-manager`, etc. KEEP: list users, get user, update role, ban/unban, the admin audit-log endpoints — i.e. everything the P2a console admin calls (`getUser`/`banUser`/`unbanUser`/`updateUserRole`/list).

- [ ] **Step 1** — apply 1a + 1b.
- [ ] **Step 2** — `cd apps/hub && bun test routes/admin services/enrollment` (auth/admin paths still pass). The deleted OpenCode modules still exist at this point, so there are no dangling imports yet — this proves the surgery itself is sound.
- [ ] **Step 3** — `bunx tsc --noEmit` (or `bun test`) → no new type errors from the surgery.
- [ ] **Step 4 — commit:** `refactor(hub): un-wire auth hook + admin route from OpenCode (resource-limits/agents/sandboxes) (P2b T1)`

---

### Task 2: Delete OpenCode routes, services, models + unmount

**2a — `apps/hub/src/index.ts`:** remove the imports + `.route(...)` mounts for every OpenCode route: `userRoutes`, `resourceTiersRouter`, `flavorsRouter`, `addonsRouter`, `dockerRouter`, `providerRoutes`, `preferencesRoutes`, `activityRoutes`, `accountRoutes`, `sandboxRoutes`/`sandboxHealthRoutes`/`pendingActionsRoutes`, `repoRoutes`, `chatRoutes`, `terminalRoutes` (+ the `cleanupTerminalSessions` call/interval), `knowledgeRoutes`, `onboardingRoutes`, `mcpKnowledgeRoutes`, `previewRoutes`/`publicPreviewRoutes`, `agentRoutes`, `workflowRoutes`/`workflowExecutionRoutes`, `sessionForkRoutes`, all `mcp*Routes` (servers/namespaces/endpoints/status/keys/publicStatus/oauth). KEEP every mount in the §Global keep-set. Remove any OpenCode startup wiring (e.g. metamcp init, terminal-session sweeper) while keeping `registerEnabledProvisioners()`, the gateway, and the node/station wiring.

**2b — `git rm` the OpenCode route files:** `routes/{users,resource-tiers,flavors,addons,docker,providers,preferences,activity,account,sandboxes,repos,chat,terminal,knowledge,onboarding,mcp-knowledge,preview,agents,workflows,session-forks,mcp-servers,mcp-oauth,acp}.ts` (+ their `*.test.ts`).

**2c — `git rm` OpenCode services + models** (verify each basename has no keep-set importer first):
- services: `acp-gateway`, `agent-catalog-service`, `agents/`, `config/`, `config-sync`, `default-agents-service`, `default-plugins-service`, `git/`, `knowledge-service`, `mcp-auth-handlers`, `mcp-credentials`, `mcp-oauth.service`, `mcp-provider-servers`, `metamcp-client`, `metamcp-trpc-client`, `model-selection-service`, `models-dev`, `oauth/`, `onboarding-agent-service`, `onboarding-service`, `opencode-v2`, `orchestrator/`, `preview/`, `providers/`, `sandbox-manager`, `sandbox-onboarding-service`, `session-fork-manager`, `sync/`.
- models: `activity-log`, `agent-auth`, `agent-session`, `chat-message`, `chat-session`, `container-addon`, `container-flavor`, `preview-port`, `provider-credentials`, `provider`, `resource-tier`, `sandbox`, `user-opencode-config`, `user-preferences`, `user-resource-limits`.
- `scripts/seed-knowledge.ts` (+ drop the `db:seed` script from package.json).

- [ ] **Step 1** — do 2a; then 2b/2c deleting + grepping each basename (`grep -rn "<name>" apps/hub/src` → only self/removed refs).
- [ ] **Step 2** — `bunx tsc --noEmit` → resolve EVERY dangling import until clean (this is the dangling-import gate). Schema files are still present (removed in T3), so schema imports won't dangle yet.
- [ ] **Step 3** — `bun test` (full hub suite) green; hub starts locally against :5434 → `curl localhost:3001/health` 200 + log "Provisioners registered: docker".
- [ ] **Step 4 — commit:** `chore(hub): delete OpenCode routes/services/models + unmount (P2b T2)`

---

### Task 3: Purge schema + generate the drop-migration

**3a — schema barrel `apps/hub/src/db/schema/index.ts`:** remove the `export *` lines for `sandboxes`, `chat`, `providers`, `containers`, `activity`, `agents`, `agent-catalog`, `knowledge`, `onboarding`, `preview-ports`, `quick-tasks`, `workflows`, `session-forks`, `mcp`, `settings`. KEEP exports: `auth`, `admin`, `cloudflare`, `nodes`, `stations`, `audit`.

**3b — `git rm` schema files:** `db/schema/{sandboxes,chat,providers,containers,activity,agents,agent-catalog,knowledge,onboarding,preview-ports,quick-tasks,workflows,session-forks,mcp,settings}.ts`.

**3c — trim `db/schema/admin.ts`:** remove `userResourceLimits` (the `pgTable("user_resource_limits", …)`) and `DEFAULT_RESOURCE_LIMITS`. KEEP `systemSettings` (`system_settings`) and `adminAuditLog`. (Nothing imports `userResourceLimits` after T1.)

**3d — drop-migration:** `cd apps/hub && bun run db:generate`. Inspect the generated file in `src/db/drizzle-migrations/`: it MUST contain only `DROP TABLE` (+ enum drops) for OpenCode tables and **must not** ALTER/DROP `nodes`, `stations`, `station_audit`, `user`, `session`, `account`, `verification`, `provisioned_runtimes`, `enrollment_tokens`, `system_settings`, `admin_audit_log`, `cloudflare_*`. If it proposes anything against a KEEP table, stop and fix the schema, regenerate.

- [ ] **Step 1** — do 3a/3b/3c.
- [ ] **Step 2** — `bunx tsc --noEmit` → fix any straggler schema import (e.g. a kept model importing a removed table) until clean.
- [ ] **Step 3** — `bun run db:generate`; **read the migration** and confirm it only drops OpenCode tables (paste the DROP list into the report).
- [ ] **Step 4** — drop + recreate the test DB to apply cleanly: against :5434 run the full `bun test` (the hub migrates on connect) → green; hub boots → `/health` 200 + "Provisioners registered: docker".
- [ ] **Step 5 — commit:** `chore(hub): drop OpenCode schema + tables (drizzle drop-migration) (P2b T3)`

---

### Task 4: Live verification (post-merge + deploy)

After T1–T3 merge `develop`→`main` and the hub is redeployed (pull on the VPS + `systemctl restart agentpod-hub`; the drop-migration applies on startup):
- [ ] Hub restarts clean; journal shows migrations applied + "Provisioners registered: docker"; Synapse stays active.
- [ ] `superchotu` stays/online (or reconnects); drive a station (terminal/files/logs) — fleet unaffected.
- [ ] `console.agentpod.dev`: sign in, `/admin` user list + `/admin/users/[id]` work, `/settings` works, provisioning (New runtime → destroy) works.
- [ ] `psql` the prod DB: OpenCode tables are gone; `nodes`/`stations`/`station_audit`/`user`/`provisioned_runtimes`/`system_settings` intact.

## Self-review

- **Spec coverage:** §2 keep → Global Constraints; §3 remove routes/services/schema → T2/T3; §4 entanglements → T1; §5 migration → T3; §6 risks (boot, dangling, drop-safety, auth/admin, ordering) → T1 Step 2 / T2 Step 2-3 / T3 Step 3-4 / T4. ✓
- **Ordering:** T1 (surgery) → T2 (delete code) → T3 (schema+migration) → T4 (deploy). Surgery first so kept files don't dangle; schema last so T2 typechecks with tables still present. ✓
- **Type/name consistency:** `userResourceLimits`/`DEFAULT_RESOURCE_LIMITS`/`systemSettings`/`adminAuditLog` all confirmed in `schema/admin.ts`; admin client fns (`getUser`/`banUser`/`unbanUser`/`updateUserRole`) match P2a. ✓
