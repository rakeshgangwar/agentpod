# P4 slice B — Harness-Preloaded Provisioning + Auto-Adopt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provision an OpenCode runtime (harness pre-installed + an initialized `/workspace`) that auto-adopts its station on node-online — one action yields a ready, runtime-linked OpenCode station.

**Architecture:** Builds on P4 slice A. Add `harness` to the request/record; the runtime service resolves a harness-specific image and passes it via `ProvisionSpec.image` (drivers become image-agnostic); a baked `agentpod-node-opencode` image registers `/workspace` as an OpenCode project; on node-online the hub detects + auto-adopts the harness station via the broker.

**Tech Stack:** Bun + Hono + Drizzle (hub), zod (contract), Go + Docker (node-agent image), SvelteKit + Svelte 5 + bits-ui (console).

**Spec:** `docs/superpowers/specs/2026-06-29-p4b-harness-provisioning-design.md`.

## Global Constraints

- **Branch:** `redesign/fleet-console`. Frequent commits. Builds on slice A (`provisioned_runtimes`, `RuntimeProvisioner`, `mintEnrollmentToken({provisionedRuntimeId})`, `enrollNode` linking, `adoptStations`, `broker.request`).
- **Scope:** OpenCode harness, baked image, empty workspace, **creds deferred** (no secret injection), auto-adopt. NO repo-clone, NO other harnesses, NO Cloudflare *live* harness verify, NO k8s/multi-tenant.
- **Don't break slice A:** generic (`harness:"none"`) provisioning must keep working; the driver image-source refactor (env → `spec.image`) must preserve slice-A behavior + keep its tests green (update them to the new source).
- **Docker-gated pieces are deferred with slice A's #125:** building `agentpod-node-opencode` + the in-container `detect` check + the live dogfood need Docker (down on this Mac). All other code (contract, schema, service, auto-adopt, UI) is fully testable without Docker and must be.
- **Per task:** relevant suite green — contract `cd packages/contract && bun test`; hub `cd apps/hub && bun test <file>` (DB-backed hub tests need Postgres on :5434 — note if unavailable, like slice A); node-agent `cd apps/node-agent && go test ./... -race`; console `cd apps/console && pnpm test <file>` + `pnpm check`. TDD; existing suites stay green.

## File Structure

- `packages/contract/src/runtime.ts` (modify) — `RuntimeHarness` + `harness` on request/record.
- `apps/hub/src/db/schema/nodes.ts` (modify) — `provisionedRuntimes.harness` + migration.
- `apps/hub/src/services/provisioner/types.ts` (modify) — `ProvisionSpec.image`.
- `apps/hub/src/services/provisioner/{docker,cloudflare}.ts` (modify) — use `spec.image`.
- `apps/hub/src/services/runtimes.ts` (modify) — persist `harness`, resolve image-by-harness, pass `image`.
- `apps/hub/src/services/runtime-autoadopt.ts` (create) — `autoAdoptProvisionedHarness`.
- `apps/hub/src/routes/gateway.ts` (modify) — call auto-adopt on node-online.
- `apps/node-agent/deploy/Dockerfile.opencode` + `deploy/node-opencode-entrypoint.sh` (create) — baked OpenCode image.
- `apps/console/src/lib/api/client.ts` + `lib/components/fleet/NewRuntimeDialog.svelte` (modify) — harness picker + param.

---

## Task 1: Contract — harness

**Files:** Modify `packages/contract/src/runtime.ts`; Test `packages/contract/src/runtime.test.ts`.

**Interfaces — Produces:** `RuntimeHarness = z.enum(["none","opencode"])`; `ProvisionRequest.harness = RuntimeHarness.default("none")`; `ProvisionedRuntime.harness: RuntimeHarness`.

- [ ] **Step 1: Failing test** — extend `runtime.test.ts`: `ProvisionRequest.parse({provider:"docker",name:"x"}).harness === "none"` (default); `parse({...,harness:"opencode"}).harness==="opencode"`; invalid harness throws; `ProvisionedRuntime.parse(<obj with harness:"opencode">)` round-trips.
- [ ] **Step 2: RED** — `cd packages/contract && bun test runtime`.
- [ ] **Step 3: Implement** — add `RuntimeHarness` enum + type; add `harness: RuntimeHarness.default("none")` to `ProvisionRequest`; add `harness: RuntimeHarness` to `ProvisionedRuntime`.
- [ ] **Step 4: GREEN** — `bun test runtime` (whole package green).
- [ ] **Step 5: Commit** — `feat(contract): runtime harness type (P4B T1)`

---

## Task 2: Schema — provisioned_runtimes.harness

**Files:** Modify `apps/hub/src/db/schema/nodes.ts`; generate migration in `apps/hub/src/db/drizzle-migrations/`; Test `apps/hub/tests/unit/runtimes.schema.test.ts` (extend).

**Interfaces — Produces:** `provisionedRuntimes.harness` column (text, not null, default `"none"`).

- [ ] **Step 1: Implement** — in `nodes.ts` add to the `provisionedRuntimes` table: `harness: text("harness").notNull().default("none"),`.
- [ ] **Step 2: Migration** — `cd apps/hub && bun run db:generate` → a new numbered SQL (0022) with `ALTER TABLE "provisioned_runtimes" ADD COLUMN "harness" text DEFAULT 'none' NOT NULL`. Commit the SQL + snapshot.
- [ ] **Step 3: Test** — extend `runtimes.schema.test.ts`: assert `provisionedRuntimes` has a `harness` column key.
- [ ] **Step 4:** `bun test runtimes.schema` green; if Postgres on :5434 is reachable, `bun run db:migrate` against a scratch DB applies cleanly (else note deferred, like slice A).
- [ ] **Step 5: Commit** — `feat(hub): provisioned_runtimes.harness column + migration (P4B T2)`

---

## Task 3: Image-by-harness — ProvisionSpec.image + service resolution + driver refactor

**Files:** Modify `apps/hub/src/services/provisioner/types.ts`, `docker.ts`, `cloudflare.ts`, `apps/hub/src/services/runtimes.ts`; Tests: `provisioner/docker.test.ts`, `routes/runtimes.test.ts`.

**Interfaces — Consumes:** `RuntimeHarness` (T1), slice-A `ProvisionSpec`/drivers/`createRuntime`. **Produces:** `ProvisionSpec.image: string`; drivers run `spec.image`; `createRuntime` persists `harness` + resolves the image.

- [ ] **Step 1: ProvisionSpec** — add `image: string;` to `ProvisionSpec` in `types.ts`.
- [ ] **Step 2: Driver refactor (failing test first)** — update `provisioner/docker.test.ts`: provision is now called with `image` in the spec; assert the orchestrator `createSandbox` config `image === spec.image` (e.g. pass `image:"agentpod-node-opencode:local"` and assert it's used; the `NODE_AGENT_IMAGE` env is no longer read by the driver). Run → RED.
- [ ] **Step 3: Implement driver change** — in `docker.ts`, replace `const image = process.env.NODE_AGENT_IMAGE ?? "agentpod-node:local"` with `const image = spec.image`. In `cloudflare.ts`, likewise use `spec.image` for the create body image. (Image resolution moves to the service, Step 5.)
- [ ] **Step 4: GREEN driver** — `cd apps/hub && bun test provisioner/docker`.
- [ ] **Step 5: Service — persist harness + resolve image (failing test)** — extend `routes/runtimes.test.ts`: `POST /api/runtimes {provider:"docker",name:"x",harness:"opencode"}` → the persisted row has `harness:"opencode"`; the fake provisioner's `provision` was called with `image` = the opencode image; a `harness:"none"` (or omitted) request → `image` = the generic image; the returned `ProvisionedRuntime` includes `harness`. RED.
- [ ] **Step 6: Implement service** — in `runtimes.ts`: `createRuntime(userId, req, hubUrl)` where `req` now includes `harness?: string`. Add a resolver:
```ts
function imageForHarness(harness: string): string {
  if (harness === "opencode")
    return process.env.NODE_AGENT_OPENCODE_IMAGE ?? "agentpod-node-opencode:local";
  return process.env.NODE_AGENT_IMAGE ?? "agentpod-node:local";
}
```
Insert `harness: req.harness ?? "none"` into the `provisionedRuntimes` row; pass `image: imageForHarness(req.harness ?? "none")` in the `provision({...})` spec; include `harness` in `toContract(row)` (map `row.harness`). The route handler (`routes/runtimes.ts` POST) already zod-parses `ProvisionRequest` (now carrying `harness`) — pass `harness` through to `createRuntime`.
- [ ] **Step 7: GREEN** — `bun test routes/runtimes provisioner/docker` (+ existing slice-A behavior green: generic provision still uses the generic image).
- [ ] **Step 8: Commit** — `feat(hub): image-by-harness via ProvisionSpec.image + persist harness (P4B T3)`

---

## Task 4: Auto-adopt service + gateway hook

**Files:** Create `apps/hub/src/services/runtime-autoadopt.ts`; Modify `apps/hub/src/routes/gateway.ts`; Test `apps/hub/src/services/runtime-autoadopt.test.ts`.

**Interfaces — Consumes:** `broker.request(nodeId, "detect", {}, {timeoutMs})` (→ `{ok, data}`; parse with `VERB_RESULTS.detect` from the contract → `DetectedStation[]` with `harness`/`key`/`workspacePath`), `adoptStations(userId, nodeId, stations)` from `station-registry.ts` (confirm exact arg order/shape against the existing route caller), `listAdopted(userId, nodeId)`, `provisionedRuntimes`. **Produces:** `autoAdoptProvisionedHarness(nodeId: string): Promise<void>`.

- [ ] **Step 1: Failing test** — `runtime-autoadopt.test.ts`: inject a fake `broker.request` (return a detect result with an `opencode` station at `/workspace` + an unrelated station) and a fake/real `adoptStations`. Seed a `provisionedRuntimes` row (harness `"opencode"`, `nodeId` set, no adopted station). Call `autoAdoptProvisionedHarness(nodeId)` → asserts `adoptStations` called once with the `userId` from the row + the `opencode` station; calling again (now a station is adopted) → no-op (idempotent); a row with `harness:"none"` → no detect/adopt; a node with no provisioned row → no-op. (Use dependency injection or `vi`/bun mock for `broker`/`station-registry` — match the repo's hub test-mocking style.)
- [ ] **Step 2: RED** — `cd apps/hub && bun test runtime-autoadopt`.
- [ ] **Step 3: Implement** — `autoAdoptProvisionedHarness(nodeId)`: load the `provisionedRuntimes` row by `nodeId`; return if none / `harness === "none"`; if `listAdopted(row.userId, nodeId)` already non-empty → return (idempotent); `const r = await broker.request(nodeId,"detect",{},{timeoutMs:10_000})`; if `!r.ok` → log + return; parse with `VERB_RESULTS.detect`; pick the station with `harness === row.harness` (prefer `workspacePath === "/workspace"`); if none → log + return; `await adoptStations(row.userId, nodeId, [station])`. Wrap the whole body so it NEVER throws (log errors).
- [ ] **Step 4: Hook gateway** — in `routes/gateway.ts` on-open, after `connectionManager.register(...)` + `await setNodeStatus(nodeId,"online")`, fire-and-forget with a short retry so the node can answer detect:
```ts
// auto-adopt a provisioned harness station once the node can answer detect
void (async () => {
  for (const delay of [1500, 4000, 9000]) {
    await new Promise((r) => setTimeout(r, delay));
    try { await autoAdoptProvisionedHarness(nodeId); } catch {}
    // stop early if it adopted (autoAdopt is idempotent, so re-calling is cheap)
  }
})();
```
(Keep it best-effort; never block or throw into the gateway.)
- [ ] **Step 5: GREEN** — `bun test runtime-autoadopt`; `pnpm`/`bun` typecheck the gateway change; existing gateway/station tests stay green.
- [ ] **Step 6: Commit** — `feat(hub): auto-adopt provisioned harness station on node-online (P4B T4)`

---

## Task 5: OpenCode baked image + /workspace registration

**Files:** Create `apps/node-agent/deploy/Dockerfile.opencode`, `apps/node-agent/deploy/node-opencode-entrypoint.sh`.

**Interfaces — Produces:** an image `agentpod-node-opencode` whose entrypoint registers `/workspace` as an OpenCode project then `enroll` (env) → `run`, so `agentpod-node detect` lists an `opencode` station for `/workspace`.

- [ ] **Step 1: Dockerfile** — `deploy/Dockerfile.opencode`, multi-stage: builder `golang:1.26` builds the static node-agent (as the slice-A Dockerfile); runtime base with a JS runtime for `opencode` — use `oven/bun:1-slim` (or a `node` slim base), `RUN apt-get/apk add ca-certificates git` as needed, install opencode (`bun add -g opencode-ai` or the documented install — pin a version matching the fleet, e.g. 0.5.x), copy the node-agent binary + the entrypoint, `ENTRYPOINT ["/node-opencode-entrypoint.sh"]`. Build context is `apps/node-agent`.
- [ ] **Step 2: Entrypoint + registration** — `deploy/node-opencode-entrypoint.sh`:
```sh
#!/bin/sh
set -e
mkdir -p /workspace
# Register /workspace as an OpenCode project so the descriptor detects it.
# Primary: drive opencode headlessly in the dir to register it; if that does not
# create an opencode.db `project` row with worktree=/workspace, seed it directly.
cd /workspace
opencode --version >/dev/null 2>&1 || true
# (registration: run the opencode command that registers a project here; the
#  implementing task MUST verify `agentpod-node detect` then lists /workspace —
#  if opencode won't register headlessly, seed ~/.local/share/opencode/opencode.db
#  with a project row via sqlite3, matching the descriptor's `SELECT worktree FROM project`.)
agentpod-node enroll
exec agentpod-node run
```
The implementing task must **determine the concrete registration mechanism** by inspecting how `opencode` registers a project (the P4 #103 descriptor reads `opencode.db` `SELECT worktree FROM project` primary, sanitized `project/<dir>` fallback) and make `/workspace` appear there — finalize the entrypoint accordingly (no placeholder comment in the shipped script).
- [ ] **Step 3: Verify (Docker-gated — deferred with #125 if Docker down)** — when Docker is available: `docker build -t agentpod-node-opencode:local -f apps/node-agent/deploy/Dockerfile.opencode apps/node-agent`, then `docker run --rm --entrypoint sh agentpod-node-opencode:local -c '/node-opencode-entrypoint-register-only && agentpod-node detect'` (or run the registration steps then `agentpod-node detect`) and confirm the JSON lists an `opencode` station with `workspacePath` `/workspace`. If Docker is unavailable, record the exact build+detect commands in the report for the deferred dogfood and ensure the registration logic is written to the known opencode.db schema.
- [ ] **Step 4: Commit** — `feat(node): agentpod-node-opencode image + /workspace registration (P4B T5)`

---

## Task 6: Console — harness picker

**Files:** Modify `apps/console/src/lib/api/client.ts`, `apps/console/src/lib/components/fleet/NewRuntimeDialog.svelte`; Test `NewRuntimeDialog.svelte.test.ts`.

**Interfaces — Consumes:** the `/api/runtimes` route (now accepts `harness`). **Produces:** `provisionRuntime` sends `harness`; the dialog has a harness select; the provisioning card/badge can show harness.

- [ ] **Step 1: Client** — change `provisionRuntime(req)` to accept `{provider, name, resourceTier, harness}` and include `harness` in the POST body.
- [ ] **Step 2: Failing test** — extend `NewRuntimeDialog.svelte.test.ts`: a harness `select` renders (options Generic=`none` / OpenCode=`opencode`, default `none`); creating with OpenCode selected calls `provisionRuntime` with `harness:"opencode"`. RED.
- [ ] **Step 3: Implement** — add a harness `ui/select` to `NewRuntimeDialog.svelte` (Generic→`none`, OpenCode→`opencode`, default `none`); thread the value into the `provisionRuntime` call. (Optional, cheap: show the harness on the provisioning card in `NodesOverview.svelte`.)
- [ ] **Step 4: GREEN** — `cd apps/console && pnpm test NewRuntimeDialog` + `pnpm check` + `pnpm build` + existing console suites green.
- [ ] **Step 5: Commit** — `feat(console): harness picker in New-runtime dialog (P4B T6)`

---

## Task 7: Dogfood — OpenCode auto-adopt (deferred, with slice A #125)

**Files:** extend `docs/superpowers/plans/p4-provisioning-e2e.md` (or a B section).

- [ ] **Step 1 (Docker required):** build `agentpod-node-opencode:local` (T5 command); hub env `ENABLE_DOCKER_PROVISIONING=true`, `NODE_AGENT_OPENCODE_IMAGE=agentpod-node-opencode:local`, `PROVISIONING_HUB_URL=http://host.docker.internal:3001`; console `pnpm dev`.
- [ ] **Step 2 (Playwright):** New runtime → provider Docker, **harness OpenCode**, name → create. Confirm: provisioning card → container boots → `/workspace` registered → node online → **auto-adopted** OpenCode station appears (no manual adopt), linked to the runtime + provisioned badge.
- [ ] **Step 3:** open the auto-adopted station → drive it (terminal/fs/logs over the public path); then **Destroy** → container + runtime gone.
- [ ] **Step 4:** screenshots + runbook section; teardown; commit. Send screenshots to the user. (Blocked until this Mac's Colima/Docker is healthy — runs with #125.)

---

## Self-Review

- **Spec coverage:** harness on request/record (T1) + schema (T2); image-by-harness + driver refactor + persist harness (T3); auto-adopt service + gateway hook (T4); OpenCode image + `/workspace` registration (T5); console harness picker (T6); deferred dogfood (T7). Creds-deferred / empty-workspace / OpenCode-only / no-repo-clone honored — no task adds them. ✓
- **Placeholder scan:** the only "figure it out" is T5's `/workspace` registration mechanism — that is inherent research (how opencode registers a project), explicitly bounded to the known descriptor data model with a sqlite-seed fallback, and the task must ship a concrete entrypoint + verify via `detect` (no placeholder in the shipped script). Everything else has exact signatures/commands.
- **Type consistency:** `RuntimeHarness`/`harness` (T1) used in T2 (column), T3 (service/spec), T6 (UI); `ProvisionSpec.image` (T3) consumed by both drivers (T3) + the opencode image value from `imageForHarness` (T3) matches T5's image tag `agentpod-node-opencode:local`; `autoAdoptProvisionedHarness(nodeId)` (T4) matches the gateway hook; `adoptStations`/`broker.request`/`VERB_RESULTS.detect` referenced as the existing slice-A/P0 signatures (implementer confirms exact arg order).
- **No slice-A regression:** T3 explicitly preserves generic (`harness:"none"`) provisioning + updates slice-A driver/route tests to the `spec.image` source; auto-adopt is best-effort (a miss degrades to manual adopt).
