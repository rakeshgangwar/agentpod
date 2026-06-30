# Control-Plane Redesign — Phase 2: Live Health + Interactive Heatmap (Design Spec)

**Status:** Approved (brainstorm 2026-06-30). Phase 2 of 4 (milestone #13). Builds on P1 (`/api/fleet/agents`, Overview, AgentTable) + the F16 per-station `Health()`.
**Branch:** `develop` (merge `develop`→`main`).
**Context:** P1's table is honest but static — only node reachability, no live metrics, and the heatmap slot is empty. P2 makes the control plane *alive*: agents push health, the hub caches it, and the Overview shows real CPU/mem/uptime + a status heatmap you can **act on**.

## 1. Goal & Scope

Live per-agent status + metrics, pushed (not polled), surfaced in the table and an **interactive** heatmap. **Defers:** "idle" status (OpenClaw agents share one gateway process — per-agent idle can't be derived honestly until there's a per-agent activity signal); persisting health (in-memory only); historical/timeseries metrics (P-later if ever).

## 2. Agent (node-agent)

- A **health ticker** in `gateway/client.go` `connectOnce` — a separate goroutine, ~**30s**, sharing the existing `writeMu`. Each tick: enumerate the node's detected stations (reuse the detect/registry path), call `Health(key)` per station (best-effort), and send one frame:
  `{ type:"health", stations: [ { key, ok, running, pid, cpuPct, memBytes, uptimeSec } ] }` — `ok=false` when `Health(key)` errored (so the hub can mark it `error`); metrics nullable. One frame per node covers all its agents.
- Cadence decoupled from the 15s heartbeat so a slow health gather never delays keepalive.

## 3. Contract

- `StationHealthReport = { key, ok: boolean, running: boolean, pid: number|null, cpuPct: number|null, memBytes: number|null, uptimeSec: number|null }`; `HealthReportMsg = { type:"health", stations: StationHealthReport[] }` added to the `GatewayClientMessage` union (`packages/contract/src/gateway.ts`).
- `FleetAgent` (P1) gains: `status: "running"|"stopped"|"error"|"unknown"`, `cpuPct: number|null`, `memBytes: number|null`, `uptimeSec: number|null`. (The P1 `nodeStatus` stays as the node-reachability input.)

## 4. Hub

- **In-memory health cache** `services/health-cache.ts` (pattern of `connection-manager`): `recordHealth(nodeId, stations)`, `getHealth(nodeId, stationKey) → { report, at } | null`, `clearNode(nodeId)`. No DB.
- **Gateway** (`routes/gateway.ts`): `onMessage` `type==="health"` → `recordHealth(authed, msg.stations)`; `onClose` → `clearNode(authed)`. (Respects the existing `authReady` await.)
- **Status derivation** (in the fleet service, per agent): node offline → `unknown`; no cached report or stale (`age > 2.5×30s ≈ 75s`) → `unknown`; report `ok=false` → `error`; `ok && running` → `running`; `ok && !running` → `stopped`. Attach `cpuPct/memBytes/uptimeSec` from the report (null when unknown). `getFleetStats().running` becomes the count of `status==="running"`.

## 5. Console

- **AgentTable** — replace the P1 "Reachability" column with **Status** (`statusBadgeClass`: running→chart-2, stopped→muted, error→destructive, unknown→muted-dim) + add **CPU / Mem / Uptime** columns (`—` when null). The update column/grouping stay.
- **FleetHeatmap** (`lib/components/fleet/FleetHeatmap.svelte`) — fills the P1 placeholder slot. A grid of cells, one per agent, colored by `status`; **hover** → tooltip (agent · node · status · cpu/mem/uptime); **click a cell** → selects that agent; a **legend** whose status chips are clickable.
- **Interaction wiring (the point):** the Overview page holds the shared filter state. Clicking a heatmap **cell** filters the AgentTable to that agent (and scrolls/highlights it); clicking a legend **status** filters the table to that status; clearing returns to all. The heatmap is the control surface into the table, not decoration.

## 6. Risks & verification

- **Honest staleness:** never show stale metrics as live — the 75s staleness window flips an agent to `unknown` (dim) if its node stops reporting; `onClose` clears immediately. Test the stale→unknown transition.
- **Gather cost:** ~a handful of `ps`/health calls per node every 30s — trivial at fleet scale; the separate goroutine keeps it off the heartbeat path.
- **Shared-gateway reality:** OpenClaw composites report the gateway's CPU/mem for the whole set (F16) — the table/heatmap will show the same metrics across an OpenClaw node's agents; that's correct (they share the process), and the per-agent status (running/error) is still meaningful. Note it in the tooltip copy ("shared gateway").
- **Frame compat:** `HealthReportMsg` is additive to the union; old agents that never send it → their agents stay `unknown` (graceful).
- **Gate:** node-agent `go vet`/`go test -race`/`go build`; hub `bun test` (health-cache, status derivation incl. staleness, gateway ingest); console `pnpm check`/`test`/`build` (Status column, FleetHeatmap render + click-filter); live Playwright (after a release + the agent reporting): Overview shows real CPU/mem/uptime, the heatmap colors by status, clicking a cell filters the table.

## 7. Success criteria

The Overview shows live per-agent CPU/mem/uptime + status (running/stopped/error/unknown with honest staleness); the heatmap renders one cell per agent colored by status and **clicking a cell or legend status filters the table**; the stat band's running count is real; health pushes ~every 30s with no heartbeat impact; in-memory only; all gates green; verified live on superchotu. The control plane feels alive and the overview is actionable.
