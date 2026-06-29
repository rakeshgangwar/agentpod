# P2b — Hub OpenCode Backend Retirement (Design Spec)

**Status:** Approved (brainstorm 2026-06-29). Second of three Phase-2 sub-projects (after P2a console purge). Issue #135.
**Branch:** `develop` (work on it; merge `develop`→`main`).
**Context:** P2a removed all OpenCode console code, so the hub's OpenCode backend (sandboxes/chat/workflows/agents/mcp/providers/…) now has **no callers**. This sub-project removes it: routes, services, schema, and the **tables** (a Drizzle drop-migration). The hub becomes fleet-only. The CONSOLE is untouched (done in P2a); INFRA (`docker/`, `cloudflare/worker`, Tauri, `config/`) is P2c.

**Decision (locked):** drop the OpenCode tables via migration; remove **everything** OpenCode including the borderline routes (`account`, `activity`-legacy, `preferences`, `users`, `knowledge`). Re-add fleet-specific versions later only if needed (YAGNI). Recoverable from git history + `v0.0.4-opencode`.

## 1. Goal & Scope

Reduce the hub to the fleet/facilities backend only — node enrollment + gateway, stations & capabilities, runtimes/provisioning, audit/activity, admin user-management, auth — and drop the OpenCode schema.

## 2. Keep — hard boundary (fleet + P4)

- **Routes (index.ts mounts):** `healthRoutes`, `gatewayRoutes` (`/public/nodes/gateway`), `nodeEnrollRoutes`+`nodeRoutes`, `enrollmentTokenRoutes`, `runtimeRoutes`, `stationRoutes`, `stationTerminalRoutes`, `stationActivityRoutes`, `fleetActivityRoutes` (`/api/activity`), `stationWriteRoutes`, `stationLifecycleRoutes`, `stationCleanupRoutes`, `adminRouter` *(cleaned, §4)*, `cloudflareWebhookRoutes` (P4 CF provider posts here). Better Auth handler (`/api/auth/*`) stays (mounted via the auth middleware, not a route file). *(`mcpPublicStatusRoutes` is OpenCode MCP → removed, §3.)*
- **Schema:** `auth`, `admin` (system_settings + admin_audit_log — the signup flag lives here), `nodes`, `stations`, `audit`, `cloudflare`.
- **Services:** `provisioner/*` (docker, cloudflare, registry, bootstrap), station services (registry, writes, lifecycle, cleanup, terminal, activity), node-registry, broker, enrollment, runtime-autoadopt.

## 3. Remove — OpenCode backend

- **Route files + index.ts mounts:** `users`, `resource-tiers`, `flavors`, `addons`, `docker`, `providers`, `preferences`, `activity` (legacy), `account`, `sandboxes` (+ `sandboxHealthRoutes`, `pendingActionsRoutes`), `repos`, `chat`, `terminal` (OpenCode; **not** `station-terminal`), `knowledge`, `onboarding`, `mcp-knowledge`, `preview` (+ `publicPreviewRoutes`), `agents`, `workflows` (+ `workflowExecutionRoutes`), `session-forks`, `mcp-servers` (all mcp* exports), `mcp-oauth`, `acp`.
- **Schema files + barrel exports (`schema/index.ts`):** `sandboxes`, `chat`, `providers`, `containers`, `activity`, `agents`, `agent-catalog`, `knowledge`, `onboarding`, `preview-ports`, `quick-tasks`, `workflows`, `session-forks`, `mcp`. **VERIFY `settings.ts`** before deleting — system_settings (the signup flag) must survive; if `settings.ts` is OpenCode user-settings it's removed, but confirm the signup flag table is in `admin.ts` (per `models/system-settings`) and stays.
- **Services:** every service under `apps/hub/src/services` that backs the above (sandbox orchestration, coolify/forgejo, chat, agents/default-agents-service, knowledge-service, onboarding-service, mcp-*, model-selection-service, oauth/github-copilot, session-fork-manager, providers/credentials, preview, etc.) — driven by "is it imported only by removed routes?" Verify each has no fleet/P4 importer before deleting.
- **`models/` + `scripts/`** that serve only OpenCode (e.g. `seed-knowledge.ts`, OpenCode admin-users sandbox helpers) — remove or trim.

## 4. Entanglements — surgery on KEEP files

1. **`auth/drizzle-auth.ts`** — the user-create `after` hook inserts `userResourceLimits` (`DEFAULT_RESOURCE_LIMITS`) and calls `ensureDefaultAgents` (both OpenCode). **Remove both side-effects** + their imports. Keep: first-user→admin (`before` hook), `disableSignup` after first user, the admin + customSession plugins. Locate where `userResourceLimits` / `DEFAULT_RESOURCE_LIMITS` are defined; if in a KEEP file (`admin.ts`?) drop just that table def, if in a removed file they go with it.
2. **`routes/admin.ts`** — strip the OpenCode endpoints: `/users/:id/sandboxes`, `/sandboxes`, the ban-handler's "stop all running sandboxes" (lines ~192–214), user-limits/resource-tier endpoints, and the `getUserSandboxes`/limits model imports. **Keep** user list / detail / role / ban-unban (what the new console admin uses, verified in P2a) + admin_audit_log.

## 5. Migration — drop the OpenCode tables

1. Remove the OpenCode `export *` lines from `schema/index.ts` + delete the schema files (§3).
2. `cd apps/hub && bun run db:generate` (drizzle-kit) → produces a migration in `src/db/drizzle-migrations` containing `DROP TABLE` for the removed tables.
3. **Review the generated migration** — it must DROP only OpenCode tables and **never** touch `nodes`/`stations`/`station_audit`/`user`/`session`/`account`/`provisioned_runtimes`/`enrollment_tokens`/`system_settings`/`admin_audit_log`/`cloudflare_*`. If drizzle proposes anything against a KEEP table, stop + fix the schema.
4. The hub auto-applies migrations on startup (`migrate()`), so deploy = pull + restart (drops apply). Test DB (:5434) applies it during `bun test`.

## 6. Risks & verification

- **Hub must still boot + serve fleet** after removal — top risk. Gate: `cd apps/hub && bun test` (provisioner/runtimes/stations/station-*/activity-fleet/admin) all green; the hub starts locally against :5434 → `/health` 200 + log "Provisioners registered: docker".
- **Dangling imports** — `index.ts` + any KEEP service/model importing a removed module breaks the build. Resolve until `bun` typechecks/tests clean. (TS: `tsc --noEmit` or the test run surfaces these.)
- **Drop-migration safety** — §5 step 3 review is mandatory; a wrong drop = fleet data loss. (Prod DB was clean-started, but the migration must still be correct.)
- **Auth/admin still work** — the auth-hook + admin surgery must not break signup/login/role/ban; covered by hub auth/admin tests + a live check.
- **pgvector** — `knowledge` was the embedding consumer; dropping it leaves the `vector` extension unused but installed (harmless; leave it).
- **Ordering:** (a) unmount + delete routes/services, (b) do the §4 surgeries, (c) prune schema barrel + delete schema files + generate/review the drop migration, (d) gate on build + `bun test`, (e) deploy + verify the live fleet (superchotu stays online, drive a station, admin loads).

## 7. Success criteria

`apps/hub/src/routes` + `schema` contain only the §2 keep-set; `bun test` green; hub boots with "Provisioners registered: docker"; the drop migration touches only OpenCode tables; post-deploy the live fleet (superchotu online, station ops, /admin, /settings) is unaffected. Repo route count drops from ~41 to ~16.
