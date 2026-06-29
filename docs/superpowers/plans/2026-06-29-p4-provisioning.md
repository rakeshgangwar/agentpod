# P4 Provisioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create generic node-agent runtimes from the console (Docker + Cloudflare) that auto-enroll into the fleet and are managed by everything P0–P3 already built.

**Architecture:** *Provision = create-then-attach.* A fleet-era `RuntimeProvisioner` (Docker + Cloudflare drivers) creates a container running the node-agent with an injected one-time enrollment token + hub URL; the node-agent auto-enrolls and dials back; the hub links the enrolled node to the runtime record. New `provisioned_runtimes` table + token→node linking; New-runtime/destroy console UI.

**Tech Stack:** Bun + Hono + Drizzle (hub), zod (contract), Go (node-agent + Dockerfile), SvelteKit + Svelte 5 + bits-ui (console).

**Spec:** `docs/superpowers/specs/2026-06-29-p4-provisioning-design.md`.

## Global Constraints

- **Branch:** `redesign/fleet-console`. Frequent commits.
- **Slice A only** — generic node-agent host. NO harness preload/auto-adopt (model B), NO k8s, NO multi-tenant/quotas. Do NOT touch or reuse the legacy OpenCode `sandboxes` table/routes/UI — add clean fleet-era tables/routes.
- **Reuse mechanics, not shape:** mine `apps/hub/src/services/orchestrator/docker.ts` and `apps/hub/src/services/providers/cloudflare-provider.ts` for container/sandbox mechanics; do NOT implement the OpenCode-era `SandboxProvider` interface — P4 has its own `RuntimeProvisioner`.
- **Secrets:** the enrollment token is one-time + short-TTL, injected via container env; never log it.
- **Per task:** the relevant suite green — hub `cd apps/hub && bun test <file>`; contract `cd packages/contract && bun test`; node-agent `cd apps/node-agent && go test ./... -race`; console `cd apps/console && pnpm test <file>` + `pnpm check`. TDD (RED→GREEN). Existing suites must stay green.
- **Migrations:** hub schema changes use `bun run db:generate` (drizzle-kit) to emit a numbered migration; the hub applies migrations on startup.

## File Structure

- `packages/contract/src/runtime.ts` (create) — runtime wire types; exported via `packages/contract/src/index.ts`.
- `apps/hub/src/db/schema/nodes.ts` (modify) — `provisionedRuntimes` table + `enrollmentTokens.provisionedRuntimeId`.
- `apps/hub/src/services/enrollment.ts` (modify) — token mint takes a runtime id; `enrollNode` links it.
- `apps/hub/src/services/provisioner/{types.ts,registry.ts,docker.ts,cloudflare.ts}` (create) — interface + registry + drivers.
- `apps/hub/src/services/runtimes.ts` (create) — orchestration service (create/list/destroy/start/stop) tying tokens + drivers + persistence.
- `apps/hub/src/routes/runtimes.ts` (create) — REST routes; mounted in `apps/hub/src/index.ts`.
- `apps/hub/src/routes/nodes.ts` (modify) — include provisioning info on node responses.
- `apps/node-agent/internal/enroll/enroll.go` + `cmd/agentpod-node/main.go` (modify) — env-var fallback for hub/token.
- `apps/node-agent/deploy/Dockerfile` + `deploy/node-entrypoint.sh` (create) — node-agent image.
- `apps/console/src/lib/api/client.ts` (modify) — `provisionRuntime`/`listRuntimes`/`destroyRuntime`/`startRuntime`/`stopRuntime`.
- `apps/console/src/lib/components/fleet/{NewRuntimeDialog,NodesOverview}.svelte` (create/modify) — create flow + provisioning cards.
- `apps/console/src/routes/nodes/[id]/+page.svelte` (modify) — provisioned badge + destroy/stop/start.

---

## Task 1: Contract — runtime types

**Files:** Create `packages/contract/src/runtime.ts`; Modify `packages/contract/src/index.ts`; Test `packages/contract/src/runtime.test.ts`.

**Interfaces — Produces:**
- `RuntimeProvider = z.enum(["docker","cloudflare"])`
- `RuntimeStatus = z.enum(["provisioning","online","stopped","error","destroyed"])`
- `ResourceTier = z.enum(["small","medium","large"])`
- `ProvisionRequest = z.object({ provider: RuntimeProvider, name: z.string().min(1), resourceTier: ResourceTier.default("small") })`
- `ProvisionedRuntime = z.object({ id, ownerId, provider: RuntimeProvider, externalId: z.string().nullable(), status: RuntimeStatus, nodeId: z.string().nullable(), name: z.string(), resourceTier: ResourceTier, createdAt: z.string(), updatedAt: z.string() })`

- [ ] **Step 1: Failing test** — `runtime.test.ts`: `ProvisionRequest.parse({provider:"docker",name:"box1"})` yields `resourceTier:"small"`; an invalid provider throws; `ProvisionedRuntime.parse(fullObject)` round-trips; `nodeId`/`externalId` accept null.
- [ ] **Step 2: RED** — `cd packages/contract && bun test runtime` (module missing).
- [ ] **Step 3: Implement** `runtime.ts` with the zod schemas above + `export type` inferred types; re-export from `index.ts`.
- [ ] **Step 4: GREEN** — `bun test runtime`.
- [ ] **Step 5: Commit** — `feat(contract): runtime provisioning types (P4 T1)`

---

## Task 2: Hub schema — provisioned_runtimes + token link

**Files:** Modify `apps/hub/src/db/schema/nodes.ts`; generate migration under `apps/hub/drizzle/`. Test `apps/hub/src/db/schema/runtimes.schema.test.ts` (light — import + column presence).

**Interfaces — Consumes:** `nodes`, `enrollmentTokens`, `user` (existing in `nodes.ts`/`auth.ts`). **Produces:** `provisionedRuntimes` table + `enrollmentTokens.provisionedRuntimeId` column.

- [ ] **Step 1: Implement schema** — in `nodes.ts` add:
```ts
export const runtimeStatusEnum = pgEnum("runtime_status", ["provisioning","online","stopped","error","destroyed"]);

export const provisionedRuntimes = pgTable("provisioned_runtimes", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),            // "docker" | "cloudflare"
  externalId: text("external_id"),                 // container/sandbox id, null until created
  status: runtimeStatusEnum("status").notNull().default("provisioning"),
  nodeId: text("node_id").references(() => nodes.id, { onDelete: "set null" }), // null until enrolled
  name: text("name").notNull(),
  resourceTier: text("resource_tier").notNull().default("small"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [index("provisioned_runtimes_user_id_idx").on(t.userId)]);
```
and add to `enrollmentTokens`: `provisionedRuntimeId: text("provisioned_runtime_id").references(() => provisionedRuntimes.id, { onDelete: "set null" })`.
- [ ] **Step 2: Generate migration** — `cd apps/hub && bun run db:generate` → a new numbered SQL migration appears in `drizzle/`. Verify it `CREATE TABLE provisioned_runtimes` + `ALTER TABLE enrollment_tokens ADD COLUMN provisioned_runtime_id`.
- [ ] **Step 3: Test** — `runtimes.schema.test.ts` imports `provisionedRuntimes` and asserts the table name + key columns exist (mirror an existing schema test if present; else a minimal `expect(provisionedRuntimes).toBeDefined()` + column key check).
- [ ] **Step 4:** `bun test runtimes.schema` green; against a scratch DB `bun run db:migrate` applies cleanly.
- [ ] **Step 5: Commit** — `feat(hub): provisioned_runtimes table + token link (P4 T2)`

---

## Task 3: Enrollment linking — token carries runtime, enroll links node

**Files:** Modify `apps/hub/src/services/enrollment.ts`; Test `apps/hub/src/services/enrollment.test.ts` (extend).

**Interfaces — Consumes:** `provisionedRuntimes` (T2). **Produces:**
- `mintEnrollmentToken(userId: string, opts?: { ttlMs?: number; provisionedRuntimeId?: string }): Promise<{token, expiresAt}>` (keep back-compat: existing callers pass no opts).
- `enrollNode(token, hostInfo)` unchanged signature, but when the consumed token row has `provisionedRuntimeId`, in the same flow set that runtime's `nodeId = nodeId`, `status = "online"`, `updatedAt = now`.

- [ ] **Step 1: Failing test** — extend `enrollment.test.ts`: mint a token with `{provisionedRuntimeId: rt}` (after inserting a `provisioning` runtime row), `enrollNode` it → assert the runtime row now has `nodeId` set + `status==="online"`; a token minted WITHOUT a runtime id enrolls normally and touches no runtime (back-compat).
- [ ] **Step 2: RED** — `cd apps/hub && bun test enrollment`.
- [ ] **Step 3: Implement** — change `mintEnrollmentToken` to accept `opts` and write `provisionedRuntimeId` into the `enrollmentTokens` insert (default ttl preserved). In `enrollNode`, after the node insert, if `row.provisionedRuntimeId` is set, `db.update(provisionedRuntimes).set({nodeId, status:"online", updatedAt:new Date()}).where(eq(provisionedRuntimes.id, row.provisionedRuntimeId))`.
- [ ] **Step 4: GREEN** — `bun test enrollment` (incl. the existing tests).
- [ ] **Step 5: Commit** — `feat(hub): link enrolled node to its provisioned runtime (P4 T3)`

---

## Task 4: RuntimeProvisioner interface + registry

**Files:** Create `apps/hub/src/services/provisioner/types.ts`, `apps/hub/src/services/provisioner/registry.ts`; Test `apps/hub/src/services/provisioner/registry.test.ts`.

**Interfaces — Produces:**
```ts
// types.ts
export interface ProvisionSpec { runtimeId: string; name: string; resourceTier: "small"|"medium"|"large"; hubUrl: string; enrollToken: string; }
export interface RuntimeProvisioner {
  readonly provider: "docker" | "cloudflare";
  provision(spec: ProvisionSpec): Promise<{ externalId: string }>;
  destroy(externalId: string): Promise<void>;
  start?(externalId: string): Promise<void>;
  stop?(externalId: string): Promise<void>;
}
// registry.ts
export function getProvisioner(provider: string): RuntimeProvisioner   // throws if unknown/disabled
export function enabledProviders(): ("docker"|"cloudflare")[]          // gated by env flags
export function registerProvisioner(p: RuntimeProvisioner): void       // for tests/wiring
```
Gating: `docker` enabled when `ENABLE_DOCKER_PROVISIONING === "true"`; `cloudflare` when `ENABLE_CLOUDFLARE_SANDBOXES === "true"` (existing flag).

- [ ] **Step 1: Failing test** — `registry.test.ts`: with both env flags off, `enabledProviders()` is `[]` and `getProvisioner("docker")` throws; register a fake docker provisioner + flag on → `getProvisioner("docker")` returns it + `enabledProviders()` includes `"docker"`; unknown provider throws.
- [ ] **Step 2: RED** — `cd apps/hub && bun test provisioner/registry`.
- [ ] **Step 3: Implement** `types.ts` + `registry.ts` (a `Map<string,RuntimeProvisioner>` + env gating; `getProvisioner` checks both registration AND enabled flag).
- [ ] **Step 4: GREEN** — `bun test provisioner/registry`.
- [ ] **Step 5: Commit** — `feat(hub): RuntimeProvisioner interface + registry (P4 T4)`

---

## Task 5: Docker driver

**Files:** Create `apps/hub/src/services/provisioner/docker.ts`; Test `apps/hub/src/services/provisioner/docker.test.ts`.

**Interfaces — Consumes:** `RuntimeProvisioner`/`ProvisionSpec` (T4); the existing orchestrator `apps/hub/src/services/orchestrator/docker.ts` (`createSandbox(config)`/`startSandbox`/`stopSandbox` + a destroy/remove — inspect its real API and reuse it; if a remove method is missing, add a minimal `removeSandbox(id)` to the orchestrator). **Produces:** `DockerRuntimeProvisioner implements RuntimeProvisioner` (`provider="docker"`), constructable with an injected orchestrator (for test fakes).

- [ ] **Step 1: Failing test** — `docker.test.ts`: construct `new DockerRuntimeProvisioner(fakeOrchestrator)`; `provision({runtimeId,name,resourceTier:"small",hubUrl,enrollToken})` → calls the orchestrator create with the **node-agent image** + env containing `AGENTPOD_HUB_URL`+`AGENTPOD_ENROLL_TOKEN` + a label `agentpod.runtime.id=runtimeId`, and returns `{externalId}` from the fake; `destroy(id)`/`stop(id)`/`start(id)` call the matching orchestrator methods. Assert the token is in env (not logged).
- [ ] **Step 2: RED** — `cd apps/hub && bun test provisioner/docker`.
- [ ] **Step 3: Implement** — `DockerRuntimeProvisioner`: `provision` builds a container config (image from `NODE_AGENT_IMAGE` env, default `agentpod-node:local`; `env: { AGENTPOD_HUB_URL: spec.hubUrl, AGENTPOD_ENROLL_TOKEN: spec.enrollToken }`; labels `agentpod.runtime.id`, `agentpod.managed=true`; resources mapped from `resourceTier`; NO opencode ports), calls the orchestrator create, returns its container id as `externalId`. `destroy/stop/start` delegate. Default-construct with the real orchestrator (`getDockerOrchestrator()` or equivalent — check the module export).
- [ ] **Step 4: GREEN** — `bun test provisioner/docker`.
- [ ] **Step 5: Commit** — `feat(hub): Docker runtime provisioner (P4 T5)`

---

## Task 6: Cloudflare driver

**Files:** Create `apps/hub/src/services/provisioner/cloudflare.ts`; Test `apps/hub/src/services/provisioner/cloudflare.test.ts`.

**Interfaces — Consumes:** `RuntimeProvisioner`/`ProvisionSpec` (T4); the CF worker mechanics in `apps/hub/src/services/providers/cloudflare-provider.ts` (inspect how it `fetch`es the worker to create/delete a sandbox + reads env `CLOUDFLARE_WORKER_URL`/token). **Produces:** `CloudflareRuntimeProvisioner implements RuntimeProvisioner` (`provider="cloudflare"`, no `start`/`stop` — ephemeral), constructable with an injected `fetch` for tests.

- [ ] **Step 1: Failing test** — `cloudflare.test.ts`: construct with a fake `fetch`; `provision(spec)` → POSTs the worker create endpoint with a body that delivers the node-agent + `AGENTPOD_HUB_URL`+`AGENTPOD_ENROLL_TOKEN` (assert the token is in the request body, never logged) and returns `{externalId}` from the fake response; `destroy(id)` → calls the worker delete. `start`/`stop` are undefined on the instance.
- [ ] **Step 2: RED** — `cd apps/hub && bun test provisioner/cloudflare`.
- [ ] **Step 3: Implement** — `CloudflareRuntimeProvisioner` following the existing CF provider's worker-fetch pattern (reuse its URL/auth construction): create a sandbox that runs the node-agent (image or setup step) with the env injected; map response → `{externalId}`; `destroy` calls delete. Inject `fetch` (default `globalThis.fetch`).
- [ ] **Step 4: GREEN** — `bun test provisioner/cloudflare`.
- [ ] **Step 5: Commit** — `feat(hub): Cloudflare runtime provisioner (P4 T6)`

---

## Task 7: node-agent env enroll fallback + Dockerfile

**Files:** Modify `apps/node-agent/cmd/agentpod-node/main.go` (+ `internal/enroll` if the flag parsing lives there); Create `apps/node-agent/deploy/Dockerfile`, `apps/node-agent/deploy/node-entrypoint.sh`; Test `apps/node-agent/cmd/agentpod-node/main_test.go` (or an enroll-args helper test).

**Interfaces — Produces:** the `enroll` subcommand resolves hub + token from `--hub`/`--token` flags, falling back to env `AGENTPOD_HUB_URL`/`AGENTPOD_ENROLL_TOKEN`; flags win; if neither yields both, exit non-zero with a clear message.

- [ ] **Step 1: Failing test** — extract the resolution into a testable helper `resolveEnrollArgs(flagHub, flagToken string, getenv func(string)string) (hub, token string, err error)`; test: flags set → used; flags empty + env set → env used; flag overrides env; both empty → error.
- [ ] **Step 2: RED** — `cd apps/node-agent && go test ./cmd/... -race`.
- [ ] **Step 3: Implement** `resolveEnrollArgs` + wire it into `main.go`'s enroll path (replace direct flag reads).
- [ ] **Step 4: GREEN** — `go test ./... -race` + `go build ./...`.
- [ ] **Step 5: Dockerfile** — `deploy/Dockerfile`: multi-stage (golang build → small runtime e.g. `gcr.io/distroless/static` or `alpine`); copy the binary + `node-entrypoint.sh`; `ENTRYPOINT ["/node-entrypoint.sh"]`. `node-entrypoint.sh`: `set -e; agentpod-node enroll && exec agentpod-node run` (enroll reads env). `docker build -t agentpod-node:local apps/node-agent` succeeds (if local Docker is usable; else note the build command in the report for the dogfood task).
- [ ] **Step 6: Commit** — `feat(node): env-var enroll fallback + node-agent Dockerfile (P4 T7)`

---

## Task 8: Hub runtime service + routes + node provisioning info

**Files:** Create `apps/hub/src/services/runtimes.ts`, `apps/hub/src/routes/runtimes.ts`; Modify `apps/hub/src/index.ts` (mount), `apps/hub/src/routes/nodes.ts` (include provisioning info); Test `apps/hub/src/routes/runtimes.test.ts`.

**Interfaces — Consumes:** `mintEnrollmentToken` w/ `{provisionedRuntimeId}` (T3), `getProvisioner`/`enabledProviders` (T4), `provisionedRuntimes` (T2), the contract types (T1). **Produces:**
- service `createRuntime(userId, req)`, `listRuntimes(userId)`, `getRuntime(userId,id)`, `destroyRuntime(userId,id)`, `startRuntime`/`stopRuntime`.
- routes (authenticated, owner-scoped): `POST /api/runtimes` (body `ProvisionRequest`), `GET /api/runtimes`, `DELETE /api/runtimes/:id`, `POST /api/runtimes/:id/start`, `POST /api/runtimes/:id/stop`.
- `GET /api/nodes` / node detail responses gain `provisioned: { runtimeId, provider } | null`.

- [ ] **Step 1: Failing test** — `runtimes.test.ts` (register a **fake** provisioner + flag on): `POST /api/runtimes {provider:"docker",name:"box1"}` → inserts a `provisioning` runtime, mints a token tagged with its id, calls `provision` once with `hubUrl`+`enrollToken`+`runtimeId`, persists `externalId`, returns the `ProvisionedRuntime` (201). `GET /api/runtimes` lists only the caller's. `DELETE /api/runtimes/:id` calls driver `destroy` + marks `destroyed`. `POST /api/runtimes` with a disabled provider → 400. Unauthenticated → 401. Cross-user access → 404.
- [ ] **Step 2: RED** — `cd apps/hub && bun test routes/runtimes`.
- [ ] **Step 3: Implement** — `runtimes.ts` service: `createRuntime` inserts the row (`provisioning`), `hubUrl = config.publicHubUrl` (use the existing config value the enroll command uses), `mintEnrollmentToken(userId,{provisionedRuntimeId})`, `getProvisioner(provider).provision(spec)`, update `externalId`; on driver throw → mark `error` + rethrow as 502. `destroyRuntime` → driver `destroy` + status `destroyed`. `start/stop` guard on driver capability (400 if unsupported, e.g. CF). Routes wire auth (mirror `enrollment-tokens.ts`) + zod-validate the body with `ProvisionRequest`. Mount `runtimeRoutes` in `index.ts`. In `nodes.ts`, left-join `provisionedRuntimes` (by `nodeId`) and include `provisioned`.
- [ ] **Step 4: GREEN** — `bun test routes/runtimes` + existing `nodes`/`enrollment` suites stay green.
- [ ] **Step 5: Commit** — `feat(hub): runtime provisioning service + routes + node provisioning info (P4 T8)`

---

## Task 9: Console — New-runtime create flow

**Files:** Modify `apps/console/src/lib/api/client.ts`; Create `apps/console/src/lib/components/fleet/NewRuntimeDialog.svelte`; Modify `apps/console/src/lib/components/fleet/NodesOverview.svelte`; Test `NewRuntimeDialog.svelte.test.ts`.

**Interfaces — Consumes:** the `/api/runtimes` routes (T8). **Produces:** client fns `provisionRuntime(req)`, `listRuntimes()`, `destroyRuntime(id)`, `startRuntime(id)`, `stopRuntime(id)`; a "New runtime" dialog; provisioning runtimes shown on the fleet overview.

- [ ] **Step 1: Client fns** — add the five fns to `client.ts` (mirror existing `createEnrollmentToken`/`listNodes` patterns: `withCredentials`, base URL resolution).
- [ ] **Step 2: Failing test** — `NewRuntimeDialog.svelte.test.ts` (mock `$lib/api/client`): renders a provider `select` (from a passed `providers` prop / `enabledProviders`), a name input, a tier select; submitting calls `provisionRuntime({provider,name,resourceTier})` and emits success/close.
- [ ] **Step 3: RED** — `cd apps/console && pnpm test NewRuntimeDialog`.
- [ ] **Step 4: Implement** — `NewRuntimeDialog.svelte` on `ui/dialog` + `ui/select`/`ui/input`/`ui/button` (design system); wire into `NodesOverview.svelte`: a **"New runtime"** `Button` beside "Create enrollment token" opens the dialog; after create, refresh; render runtimes whose `status==="provisioning"` (from `listRuntimes()`) as **provisioning cards** that drop off once the node appears online. (Enabled providers: fetch from `listRuntimes`-adjacent config or a small `GET /api/runtimes/providers` if cheap; otherwise show both and let the API 400 — keep it simple: show providers returned by a `providers` field or default `["docker","cloudflare"]`.)
- [ ] **Step 5: GREEN** — `pnpm test NewRuntimeDialog` + `pnpm check` + `pnpm build`.
- [ ] **Step 6: Commit** — `feat(console): New-runtime provisioning dialog + provisioning cards (P4 T9)`

---

## Task 10: Console — destroy/stop/start + provisioned badge

**Files:** Modify `apps/console/src/routes/nodes/[id]/+page.svelte`, `apps/console/src/lib/components/fleet/NodesOverview.svelte`; Test (extend a relevant component test where feasible).

**Interfaces — Consumes:** `destroyRuntime`/`startRuntime`/`stopRuntime` (T9); the node `provisioned: {runtimeId,provider}|null` field (T8).

- [ ] **Step 1: Implement badge** — on node cards (`NodesOverview`) and node detail header, when `node.provisioned` is set show a **provisioned** `Badge` with the provider.
- [ ] **Step 2: Implement actions** — on the node detail page for a provisioned node: a **Destroy** `Button` → `TypeToConfirmDialog` (phrase = node hostname) → `destroyRuntime(runtimeId)` → navigate back to `/`; **Stop/Start** `Button`s for `provider==="docker"` → `stopRuntime`/`startRuntime` + refresh. Hide stop/start for cloudflare.
- [ ] **Step 3: Test** — extend the node-detail or a small wrapper test: a provisioned node shows the badge + Destroy; Destroy confirm calls `destroyRuntime`. (If the route page is hard to test, assert via a small extracted component or rely on `pnpm check`/build + the T11 dogfood; keep at least the badge logic unit-tested.)
- [ ] **Step 4: GREEN** — `pnpm test` (touched) + `pnpm check` + `pnpm build`.
- [ ] **Step 5: Commit** — `feat(console): provisioned badge + destroy/stop/start (P4 T10)`

---

## Task 11: Docker dogfood E2E + runbook

**Files:** Create `docs/superpowers/plans/p4-provisioning-e2e.md`.

- [ ] **Step 1: Stack** — fresh DB; hub on `:3001` with `ENABLE_DOCKER_PROVISIONING=true` + `NODE_AGENT_IMAGE=agentpod-node:local` + a `publicHubUrl` reachable from a container (`http://host.docker.internal:3001` on macOS); console `pnpm dev`. Build the image: `docker build -t agentpod-node:local apps/node-agent`. (If local Docker is unreliable per the runc issue, point `DOCKER_HOST` at a server's Docker + push the image there; record which.)
- [ ] **Step 2 (Playwright):** sign in → fleet home → **New runtime** → provider Docker, name, small → create. Confirm: a `provisioning` card appears; the container starts; the node **auto-enrolls + flips online**; it carries the **provisioned (docker)** badge.
- [ ] **Step 3:** open the provisioned node → **detect/adopt** a station on it (it's a fresh container — at minimum the node is manageable: health/fs/terminal work over the public path).
- [ ] **Step 4:** **Destroy** (type-to-confirm) → container removed, runtime `destroyed`, node gone from the fleet.
- [ ] **Step 5: CF** — if a Cloudflare sandbox is reachable, smoke-test provider Cloudflare create→enroll; else record the CF gap (driver-unit-tested only).
- [ ] **Step 6:** screenshots + runbook; teardown; commit (`docs: P4 provisioning E2E runbook`). Send screenshots to the user.

---

## Self-Review

- **Spec coverage:** flow (T3+T8), interface+registry (T4), Docker driver (T5), CF driver (T6), node-agent image+auto-enroll (T7), data model+linking (T2+T3), lifecycle destroy/stop/start (T8 service + T10 UI), New-runtime UI (T9), provisioned-vs-attached badge (T8 data + T10), contract (T1), tests + Docker dogfood (every task + T11). Out-of-scope (B/k8s/multi-tenant, legacy sandboxes) honored — no task touches them. ✓
- **Placeholder scan:** none — exact files, signatures (`mintEnrollmentToken(userId,{provisionedRuntimeId})`, `provision(spec)→{externalId}`, the contract schemas), test cases, commands. The two "route is hard to test" notes (T9/T10) name the concrete fallback (extracted component / dogfood) rather than skipping coverage.
- **Type consistency:** `RuntimeProvider`/`RuntimeStatus`/`ResourceTier`/`ProvisionRequest`/`ProvisionedRuntime` (T1) used verbatim in T8/T9; `ProvisionSpec{runtimeId,name,resourceTier,hubUrl,enrollToken}` + `provision→{externalId}` consistent across T4/T5/T6/T8; `provisionedRuntimeId` consistent across T2/T3/T8; `AGENTPOD_HUB_URL`/`AGENTPOD_ENROLL_TOKEN` consistent across T5/T6/T7.
- **Reuse boundary:** T5/T6 explicitly reuse orchestrator/CF-worker mechanics, not the OpenCode `SandboxProvider`; no task touches the legacy sandboxes table/routes.
