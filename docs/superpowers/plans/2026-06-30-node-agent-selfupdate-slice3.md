# Node-agent Self-Update Slice 3 (Hub-Orchestrated Update) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** One-click per-node update from the console — hub sends an `update` verb, the agent self-updates in-process and restarts.

**Architecture:** T1 agent (`selfupdate.Apply` refactor + `update` verb handler), T2 hub+contract (latest-version + `updateAvailable` + `POST /:id/update`), T3 console (Update button), T4 deploy/verify. T1 (Go) ∥ T2 (TS hub/contract) are parallel-safe (disjoint files + toolchains); T3 follows T2 (needs the contract + endpoint).

**Tech Stack:** Go node-agent; Bun/Hono/Drizzle hub; SvelteKit console.

**Spec:** `docs/superpowers/specs/2026-06-30-node-agent-selfupdate-slice3-design.md`. Builds on Slice 2 `internal/selfupdate`.

## Global Constraints

- **Wire interface:** hub→agent RPC `broker.request(nodeId, "update", {})`; the agent's `update` handler responds `{ ok: true, updating: true, tag: "<latest>" }` (or `{ ok:false, error }`), then exits; `Restart=always` (both units) restarts it.
- **Contract:** `NodeSummary` gains `latestVersion: z.string().nullable()` + `updateAvailable: z.boolean()`.
- Gates: node-agent `go vet ./... && go test ./... -race && go build ./...`; hub `bun test`; console `pnpm check` (0/0) + `pnpm test` + `pnpm build`.
- Reuse Slice-2 verify-before-swap + `.bak`. The verb carries no version — the agent resolves latest itself.

---

### Task 1: Agent — `selfupdate.Apply` + `update` verb handler

**Files:** `apps/node-agent/internal/selfupdate/selfupdate.go` (+ `_test.go`), `apps/node-agent/internal/gateway/update_handler.go` (+ `_test.go`), `apps/node-agent/cmd/agentpod-node/run.go`.

**Interfaces (produced):** `func Apply(ctx context.Context, opts Options) (Result, error)` — resolve latest → download → verify → swap, **no restart**. `func NewUpdateHandler(inner gateway.Handler, version string) gateway.Handler` — routes `verb=="update"`.

- [ ] **Step 1 — refactor for Apply (RED).** Read `selfupdate.go`. Add a test in `selfupdate_test.go`: `Apply` against the existing httptest fixtures (latest `v0.1.3`, valid binary + SHA256SUMS, temp install dir via the test target override) → swaps the target to the new bytes, returns `Result{LatestTag:"v0.1.3", Updated:true}`, and **does NOT call the restart runner** (assert the injected `RunCommand` is never invoked). Run `go test ./internal/selfupdate/ -run Apply` → FAIL.
- [ ] **Step 2 — refactor (GREEN).** Extract `applyTag(ctx, opts, tag) (Result, error)` = the download+verify+swap body (no resolve, no restart). `Apply` = `LatestTag(...)` then `applyTag(...)`. Rework `Update` to `LatestTag` → up-to-date/check short-circuits → `applyTag` → `restartService` (behavior unchanged; existing Slice-2 Update tests must still pass). Run `go test ./internal/selfupdate/ -race` → all PASS (Apply + existing).
- [ ] **Step 3 — update handler (RED).** Read the `gateway` Handler interface + `NewTerminalHandler` (signature `Handle(ctx, verb string, p json.RawMessage, emit func(int,string,bool,string) error) (any, bool, error)`). In `update_handler_test.go`: build `NewUpdateHandler` with an injected apply func (returns `Result{LatestTag:"v0.1.3"}`) + injected `exit func(int)` (records the code) + zero restart delay; call with `verb="update"` → returns `(result with tag v0.1.3 + updating:true, handled=true, nil)` AND the injected exit is invoked (code 0); call with `verb="ping"` → delegates to a stub inner (handled by inner). FAIL.
- [ ] **Step 4 — update handler (GREEN).** `update_handler.go`: a struct wrapping `inner gateway.Handler`, `version string`, and (unexported, defaulted) `apply func(ctx,Options)(Result,error)=selfupdate.Apply`, `exit func(int)=os.Exit`, `delay time.Duration=1*time.Second`. Its `Handle`: if `verb=="update"` → `res, err := apply(ctx, Options{CurrentVersion:version})`; on err return `(map{ok:false,error:err.Error()}, true, nil)`; on success spawn `go func(){ time.Sleep(delay); exit(0) }()` and return `(map{ok:true, updating:true, tag:res.LatestTag}, true, nil)`. Else `return inner.Handle(ctx, verb, p, emit)`. Test → PASS.
- [ ] **Step 5 — wire run.go.** In `run.go` wrap the handler: `h = gateway.NewUpdateHandler(h, version)` (after the existing `h := gateway.NewTerminalHandler(...)`, before `gateway.Run(ctx, cfg, h, version)`).
- [ ] **Step 6 — gate + commit.** `cd apps/node-agent && go vet ./... && go test ./... -race && go build ./...`. Commit: `feat(node): 'update' gateway verb — in-process self-update via selfupdate.Apply + clean exit (self-update slice 3)`

---

### Task 2: Hub — latest-version + updateAvailable + update endpoint

**Files:** `packages/contract/src/node.ts`, `apps/hub/src/services/agent-version.ts` (new, + test), `apps/hub/src/services/node-registry.ts` (annotate), `apps/hub/src/routes/nodes.ts` (POST), + tests.

**Interfaces (produced):** `getLatestAgentVersion(): Promise<string|null>`; `NodeSummary.latestVersion`, `NodeSummary.updateAvailable`; `POST /api/nodes/:id/update`.

- [ ] **Step 1 — contract.** `packages/contract/src/node.ts`: add `latestVersion: z.string().nullable()` + `updateAvailable: z.boolean()` to `NodeSummary` (+ node-detail schema if separate).
- [ ] **Step 2 — agent-version service (RED).** `agent-version.test.ts`: an httptest-style fetch mock (inject the base URL / `fetch`) returning `{"tag_name":"v0.1.3"}` → `getLatestAgentVersion()` returns `"v0.1.3"`; a second call within TTL does **not** re-fetch (assert fetch called once); fetch failure → returns null (no throw). FAIL.
- [ ] **Step 3 — agent-version (GREEN).** `agent-version.ts`: module-level cache `{ value: string|null, at: number }`; `getLatestAgentVersion()` returns cached if `Date.now()-at < 3600_000` else GET `https://api.github.com/repos/rakeshgangwar/agentpod/releases/latest`, parse `tag_name`, cache + return; on any error return the last cache value or null (catch, never throw). Base URL + a clock/fetch injectable for tests. Test → PASS. *(Date.now is fine in hub runtime; only workflow scripts ban it.)*
- [ ] **Step 4 — annotate listNodes (RED).** Extend a `node-registry` test: with a node `agentVersion="v0.1.2"` and `getLatestAgentVersion` stubbed `"v0.1.3"` → `listNodes` returns that node with `latestVersion:"v0.1.3"`, `updateAvailable:true`; with `agentVersion="v0.1.3"` → `updateAvailable:false`; with `agentVersion=null` → `updateAvailable:false`. FAIL.
- [ ] **Step 5 — annotate (GREEN).** In `listNodes`, call `getLatestAgentVersion()` once, map each node to include `latestVersion` + `updateAvailable = agentVersion!=null && latestVersion!=null && agentVersion!==latestVersion`. Test → PASS.
- [ ] **Step 6 — update endpoint (RED).** In the hub nodes route test: `POST /api/nodes/:id/update` (authed) with the broker stubbed → asserts `broker.request(nodeId, "update", {})` is called and its result returned; offline node (broker returns `{ok:false,error:"node offline"}`) → response reflects it. FAIL.
- [ ] **Step 7 — endpoint (GREEN).** `routes/nodes.ts`: add `POST /:id/update` under the same auth as the other `/api/nodes` routes; `const r = await request(nodeId, "update", {})` (from `services/broker`); return `r` (200 with the agent response, or surface `{ok:false,error}`). Test → PASS.
- [ ] **Step 8 — gate + commit.** `cd apps/hub && bun test` green; contract typechecks. Commit: `feat(hub): latest-agent-version (cached) + updateAvailable + POST /nodes/:id/update (self-update slice 3)`

---

### Task 3: Console — Update button + update-available badge

**Files:** `apps/console/src/lib/api/client.ts`, `apps/console/src/lib/components/fleet/NodesOverview.svelte`, `apps/console/src/routes/nodes/[id]/+page.svelte`, + tests.

**Interfaces (consumed):** `NodeSummary.latestVersion`, `.updateAvailable`; `POST /api/nodes/:id/update`.

- [ ] **Step 1 — API client.** `client.ts`: `updateNode(id: string) => http<{ ok: boolean; updating?: boolean; tag?: string; error?: string }>(\`/api/nodes/${id}/update\`, { method: "POST" })`.
- [ ] **Step 2 — UI (RED).** Component test (NodesOverview): a node with `updateAvailable:true, agentVersion:"v0.1.2", latestVersion:"v0.1.3"` → renders an "Update" button + "v0.1.2 → v0.1.3"; `updateAvailable:false` → no Update button. FAIL.
- [ ] **Step 3 — UI (GREEN).** In `NodesOverview.svelte` (card) + `routes/nodes/[id]/+page.svelte` (header): when `node.updateAvailable`, show `update available: {agentVersion} → {latestVersion}` + an **Update** button (cyber-styled). On click: call `updateNode(id)`, set a local `updating` state (button → "updating…", disabled); on `{ok:true}` keep "updating…" (the node will blip offline→online and re-report the new version, clearing it via the normal nodes refresh); on error show a toast. Test → PASS.
- [ ] **Step 4 — gate + commit.** `cd apps/console && pnpm check` (0/0) + `pnpm test` + `pnpm build`. Commit: `feat(console): per-node Update button + update-available badge (self-update slice 3)`

---

### Task 4: Release v0.1.3 + live verification (driver-run + user)

- [ ] Merge `develop`→`main` (+ sync `redesign/fleet-console`). Redeploy hub (restart; no migration this slice) + redeploy console. Cut tag **`v0.1.3`** → release workflow publishes versioned binaries + `SHA256SUMS`.
- [ ] In the console, superchotu (on v0.1.2) should show **update available: v0.1.2 → v0.1.3** + an Update button (the hub's 1h cache may need a hub restart or up-to-1h to pick up v0.1.3 — restart the hub after the release to refresh immediately).
- [ ] **Click Update** → the node responds, blips offline (~5s, `RestartSec`), returns **online on v0.1.3** (console version chip updates; `updateAvailable` clears). No SSH. End-to-end proof.
- [ ] Confirm an offline node's Update surfaces a clean error (optional; covered by tests).

## Self-review

- **Spec coverage:** §2 latest+updateAvailable → T2 s1-5; §3 endpoint → T2 s6-7; §4 agent verb+Apply+exit → T1; §5 console → T3; §6 live → T4. ✓
- **Parallelism:** T1 (Go) ∥ T2 (TS hub/contract) disjoint files+toolchains; T3 after T2 (contract+API). Add index.lock-retry note to the parallel briefs. ✓
- **Type consistency:** `Apply`, `NewUpdateHandler`, verb `"update"`, response `{ok,updating,tag}`, `latestVersion`/`updateAvailable`, `getLatestAgentVersion`, `updateNode` — consistent across tasks. ✓
- **No placeholders:** signatures, the handler routing, the cache TTL, the endpoint, the UI conditions all concrete. ✓
