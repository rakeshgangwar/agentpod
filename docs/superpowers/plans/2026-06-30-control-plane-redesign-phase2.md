# Control-Plane Redesign Phase 2 (Live Health + Interactive Heatmap) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Agents push live health → hub caches it → the Overview shows real CPU/mem/uptime + status, and an interactive heatmap that filters the table.

**Architecture:** T1 agent (health ticker + push frame). T2 contract+hub (frame + in-memory cache + status derivation in `/api/fleet/agents`). T3 console (Status/CPU/Mem/Uptime columns + interactive FleetHeatmap + wiring). T1 (Go) ∥ T2 (TS) parallel-safe; T3 follows T2; T4 release + live verify.

**Tech Stack:** Go node-agent; Bun/Hono hub; SvelteKit console; Zod contract.

**Spec:** `docs/superpowers/specs/2026-06-30-control-plane-redesign-phase2-design.md`. Builds on P1 (`fleet` service, `AgentTable`, `OverviewStats`).

## Global Constraints

- Gates: node-agent `go vet ./... && go test ./... -race && go build ./...`; hub `bun test`; console `pnpm check` (0/0) + `pnpm test` + `pnpm build`.
- **Wire interface (T1↔T2):** client→hub frame `{ type:"health", stations: StationHealthReport[] }`; `StationHealthReport = { key: string, ok: boolean, running: boolean, pid: number|null, cpuPct: number|null, memBytes: number|null, uptimeSec: number|null }`.
- **Status derivation (hub):** node offline → `unknown`; no report or `age > 75000ms` → `unknown`; `!ok` → `error`; `ok && running` → `running`; `ok && !running` → `stopped`.
- In-memory only (no DB). Health cadence ~30s, off the 15s heartbeat path. Additive contract/frame (old agents → agents stay `unknown`).

---

### Task 1: Agent — health ticker + push frame

**Files:** `apps/node-agent/internal/gateway/client.go` (ticker + send), `apps/node-agent/cmd/agentpod-node/run.go` (build the gather fn), maybe a small `gateway` type for the report; tests in `internal/gateway/`. Read `client.go` (connectOnce, the heartbeat ticker, `writeMu`), `run.go` (how `h` + the registry/resolver are built), `internal/descriptor/handler.go` (detect enumeration + `Health(key)`) FIRST.

**Interfaces (produced):** the health frame (see Global). `gateway.Run(..., gatherHealth func() []HealthReport)` — a new param the client calls each tick.

- [ ] **Step 1 — report type + Run signature.** In the `gateway` package add `type HealthReport struct { Key string `json:"key"`; OK bool `json:"ok"`; Running bool `json:"running"`; PID *int `json:"pid"`; CPUPct *float64 `json:"cpuPct"`; MemBytes *int64 `json:"memBytes"`; UptimeSec *int64 `json:"uptimeSec"` }`. Extend `Run` (and `connectOnce`) to take `gatherHealth func() []HealthReport`.
- [ ] **Step 2 — gather fn in run.go.** Build `gatherHealth` from the descriptor registry: enumerate detected stations (reuse the detect path), call `Health(key)` per station; map a successful `Health` → `HealthReport{OK:true, Running, PID, CPUPct, MemBytes, UptimeSec}` (from the `descriptor.Health` fields), an errored `Health(key)` → `HealthReport{Key, OK:false}`. Pass it into `gateway.Run`.
- [ ] **Step 3 — health ticker test (RED).** In `internal/gateway/`: a test that `connectOnce` (with a stub `gatherHealth` returning one report + a short test cadence) writes a `{"type":"health","stations":[…]}` frame. RED.
- [ ] **Step 4 — ticker (GREEN).** In `connectOnce` add a second goroutine: `tick := time.NewTicker(30*time.Second)` (make the interval injectable/overridable for the test), on each tick marshal `map[string]any{"type":"health","stations":gatherHealth()}` and write under `writeMu`; stop on ctx.Done. Don't block or share timing with the heartbeat. Test → PASS.
- [ ] **Step 5 — gate + commit.** `cd apps/node-agent && go vet ./... && go test ./... -race && go build ./...`. Commit: `feat(node): push periodic station health frame (~30s) (control-plane P2)`

---

### Task 2: Contract + Hub — health frame, cache, status derivation

**Files:** `packages/contract/src/gateway.ts` (+ `fleet.ts` FleetAgent fields), `apps/hub/src/services/health-cache.ts` (new, + test), `apps/hub/src/routes/gateway.ts` (ingest), `apps/hub/src/services/fleet.ts` (status + metrics), + tests. Read `gateway.ts` (the `onMessage`/`authReady`/`onClose` from the hello-race fix), `fleet.ts` (P1 `listFleetAgents`), `services/connection-manager.ts` (cache pattern) FIRST.

**Interfaces (produced/consumed):** consumes the health frame; produces `FleetAgent.{status,cpuPct,memBytes,uptimeSec}`.

- [ ] **Step 1 — contract.** `gateway.ts`: add `StationHealthReport` + `HealthReportMsg = z.object({ type: z.literal("health"), stations: z.array(StationHealthReport) })` to the `GatewayClientMessage` union. `fleet.ts`: add `status: z.enum(["running","stopped","error","unknown"])`, `cpuPct/memBytes/uptimeSec` (nullable numbers) to `FleetAgent`.
- [ ] **Step 2 — health cache (RED→GREEN).** `services/health-cache.ts`: in-memory `Map<nodeId, Map<stationKey, { report, at }>>` (use an injectable clock for tests). `recordHealth(nodeId, stations, now)`, `getHealth(nodeId, key, now) → { report, at } | null`, `clearNode(nodeId)`. Test: record→get round-trip; clearNode empties.
- [ ] **Step 3 — gateway ingest.** `routes/gateway.ts`: in `onMessage`, `else if (parsed.data.type === "health") recordHealth(authed, parsed.data.stations)`; in `onClose`, `clearNode(authed)`. (Keep the `authReady` await.) Add a gateway test asserting a health frame populates the cache.
- [ ] **Step 4 — status derivation (RED).** In `fleet.test.ts`: with the cache stubbed — fresh `ok&&running` → `status:"running"` + metrics; fresh `ok&&!running` → `stopped`; `!ok` → `error`; stale (age>75s) → `unknown` + null metrics; node offline → `unknown`. RED.
- [ ] **Step 5 — derivation (GREEN).** In `listFleetAgents`, for each agent look up `getHealth(nodeId, stationKey)` and derive `status` + attach `cpuPct/memBytes/uptimeSec` per the Global rule (a pure `deriveStatus(nodeStatus, cached, now)` helper — tested directly). `getFleetStats().running` = count `status==="running"`. Test → PASS.
- [ ] **Step 6 — gate + commit.** `cd apps/hub && bun test` green; contract typechecks. Commit: `feat(hub): in-memory health cache + live status/metrics in /api/fleet/agents (control-plane P2)`

---

### Task 3: Console — Status/metrics columns + interactive heatmap

**Files:** `apps/console/src/lib/components/fleet/AgentTable.svelte`, `apps/console/src/lib/components/fleet/FleetHeatmap.svelte` (new), `apps/console/src/routes/+page.svelte` (wire), + tests. Read the P1 `AgentTable.svelte`, `OverviewStats.svelte`, `routes/+page.svelte`, `lib/utils/status-badge.ts` FIRST.

**Interfaces (consumed):** `FleetAgent.{status,cpuPct,memBytes,uptimeSec}`.

- [ ] **Step 1 — AgentTable columns.** Replace the P1 "Reachability" column with **Status** (`statusBadgeClass(agent.status)`: running→chart-2, stopped→muted-foreground, error→destructive, unknown→muted-foreground dim) and add **CPU / Mem / Uptime** columns (format: `%`, bytes→MB/GB, secs→`Xh Ym`; `—` when null). Keep grouping/search/filter/update. Update/extend the AgentTable test for the Status column + a metrics cell.
- [ ] **Step 2 — FleetHeatmap (RED).** Component test (`FleetHeatmap.svelte`, props `agents: FleetAgent[]`, callbacks `onSelectAgent`, `onFilterStatus`): renders one cell per agent with a status-colored class; clicking a cell calls `onSelectAgent(stationId)`; a legend with status chips, clicking one calls `onFilterStatus(status)`. RED→GREEN.
- [ ] **Step 3 — FleetHeatmap polish.** Cells colored by status (token classes), `title`/tooltip per cell (agent · node · status · cpu/mem/uptime; note "shared gateway" for composite). Legend (running/stopped/error/unknown counts, clickable).
- [ ] **Step 4 — wire the Overview.** In `routes/+page.svelte`: hold shared filter state (`$state` — a selected stationId and/or a status filter). Render `<FleetHeatmap {agents} onSelectAgent={...} onFilterStatus={...}/>` in the P1 placeholder slot; pass the filter down to `<AgentTable>` (accept an optional `filter` prop: by stationId or status) so a heatmap click narrows the table (and scrolls/highlights the row); a "clear filter" affordance resets. Test the round-trip (click cell → table filtered).
- [ ] **Step 5 — gate + commit.** `cd apps/console && pnpm check` (0/0) + `pnpm test` + `pnpm build`. Commit: `feat(console): live status/metrics columns + interactive fleet heatmap (control-plane P2)`

---

### Task 4: Release v0.1.5 + live verification (driver-run)

- [ ] Merge `develop`→`main` (+ sync `redesign/fleet-console`); redeploy hub (restart) + console; cut tag **`v0.1.5`** (the health-pushing agent).
- [ ] **Dogfood slice 3:** in the console, superchotu (v0.1.4) shows update available → **v0.1.5**; click **Update** → it self-updates and starts pushing health. (Restart the hub after the release if the version cache needs refreshing.)
- [ ] Playwright (Neutral + a dark scheme): within ~30s the Overview shows superchotu's agents with real **CPU/Mem/Uptime** + **running** status; the **heatmap** renders cells colored by status; **clicking a cell filters the table** to that agent; clicking a legend status filters by status; stat band "running" count is real. Disconnect tolerance: not easily testable live (covered by the staleness unit test).
- [ ] Fix any regression → `fix: control-plane P2 regression — <what>`.

## Self-review

- **Spec coverage:** §2 agent push → T1; §3 contract + §4 hub cache/ingest/derivation → T2; §5 console columns + interactive heatmap + wiring → T3; §6 live verify → T4. ✓
- **Ordering:** T1 (Go) ∥ T2 (TS) on the shared frame interface; T3 after T2 (FleetAgent fields); T4 after all + release. index.lock-retry note in the parallel briefs. ✓
- **Type consistency:** `HealthReport`/`StationHealthReport` fields, the frame `type:"health"`, `FleetAgent.status` enum, `deriveStatus`, `getHealth/recordHealth/clearNode` — consistent across tasks. ✓
- **No placeholders:** the report struct, the derivation rule, the cache API, the heatmap callbacks + wiring are concrete. ✓
