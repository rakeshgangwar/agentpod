# Control-Plane Redesign — Phase 1: IA Spine + Overview Home (Design Spec)

**Status:** Approved (brainstorm 2026-06-30, visual companion). First of a 4-phase redesign program. Mockups in `.superpowers/brainstorm/.../control-plane-home-combined.html`.
**Branch:** `develop` (merge `develop`→`main`).
**Context:** The console is drill-down-first with a sparse home — you must enter a node to even see its agents, and nothing summarizes the fleet. Reposition it as a **control plane** with **agents (stations) as the primary plane**: see and operate every agent across every node from one surface.

**Program phases** (each its own spec→plan→build): **P1 — IA spine + Overview home (this doc)**; P2 — live health aggregation (CPU/mem/uptime + status heatmap); P3 — bulk orchestration (multi-select restart/update/stop); P4 — resource sub-views (Agents/Nodes/Runtimes/Activity) + detail/mobile polish.

## 1. Goal & Scope (Phase 1)

A control-plane **Overview home** + resource-typed navigation, built **only from data the hub already has cheaply** (no gateway round-trips, no new agent-side work). Phase 1 explicitly **defers**: live per-agent CPU/mem/uptime and the health-colored heatmap (P2), row multi-select + bulk actions (P3), and the standalone Agents/Runtimes/Activity views (P4).

**Phase 1 delivers what's impossible today:** every agent across the whole fleet in one dense, searchable, grouped table — with version + update-available + node reachability — and an at-a-glance stat rollup.

## 2. Backend (hub)

- **Aggregate read** `GET /api/fleet/agents` → a flat list of all **adopted stations across all nodes**, each joined with its node: `{ stationId, nodeId, nodeName, agentName (station displayName), harness, kind, nodeStatus ("online"|"offline"), agentVersion, latestVersion, updateAvailable, capabilities, workspacePath }`. Pure DB join (`stations ⋈ nodes`) + `getLatestAgentVersion()` (already cached) — no gateway calls.
- **Fleet stats** `GET /api/fleet/stats` (or embed in the agents payload as `{ stats, agents }`) → `{ nodes: { total, online }, agents: { total }, updatesAvailable: number }`. Counts only.
- **Contract:** add `FleetAgent` + `FleetStats` schemas to `packages/contract`.
- **Reuse, don't rebuild:** per-row "Update" uses the existing `POST /api/nodes/:id/update`; the per-station status the hub knows at list time is **node reachability only** (online/offline) — true running/idle/error is P2. Row "⋯" → the existing station-detail route.

## 3. Frontend (console)

- **Nav restructure** (`lib/components/.../sidebar`): from flat `Fleet · Settings · Admin` to grouped, resource-typed nav. **Phase 1 wires the live entries only:** **Fleet** → Overview (`/`), Nodes (`/nodes`); **System** → Settings, Admin. The deferred entries (Agents / Runtimes / Activity) are **not shown until their phase** (no dead links). The grouped structure + labels land now.
- **Overview home** (`/` — replaces the current node-card "Fleet Overview"):
  - **Stat band** — cards from `/api/fleet/stats`: Nodes (online/total), Agents, Updates available (accented when >0).
  - **Agent table** (`AgentTable` component) — from `/api/fleet/agents`: columns **Agent · Harness · Node · Reachability (node online/offline) · Version · Update**. **Group-by node** by default (collapsible group headers showing node name/arch/count), toggleable to **flat**. **Search** (agent/node) + **filter pills** (node, harness, update-available). Each row → station detail; rows with `updateAvailable` show an inline **Update** button (reusing `updateNode`). A node group header with an outdated node may show "Update node".
  - **Empty state** — when no nodes/agents, the existing connect-banner/enroll flow (centered, from the P2 polish).
  - **Heatmap placeholder:** the stat band reserves the layout slot but the health heatmap itself lands in **P2** (needs real per-agent health to color honestly — a uniformly-green heatmap from node-status alone would mislead).
- **Nodes view** (`/nodes`): retain the current node-card list (the existing `NodesOverview`) so node-centric access + enroll/runtime actions stay reachable; node-detail + station-detail unchanged.
- New components are focused + testable: `OverviewStats.svelte`, `AgentTable.svelte` (+ its row), reusing `statusBadgeClass`, `PageHeader`, the cyber tokens.

## 4. Risks & verification

- **Hollow-table risk:** without P2's live metrics the table lacks CPU/mem/running-status — mitigated by leading with what's genuinely useful + new (fleet-wide agent inventory + versions + one-place updates) and being explicit that liveness is P2. Don't fake a status column: show node reachability, label it as such.
- **Don't regress** node/station drill-in, enroll, runtime provisioning, or the self-update Update buttons — Phase 1 adds a surface + restructures nav; the existing routes stay.
- **Aggregate query cost:** one `stations ⋈ nodes` query + the cached latest-version; fine at fleet scale. Paginate/virtualize only if needed (note, don't pre-build).
- **Gate:** hub `bun test` (the new `/api/fleet/*` routes + the aggregate query) ; console `pnpm check` (0/0) + `pnpm test` (Overview + AgentTable component tests) + `pnpm build`; live Playwright pass (Overview renders all of superchotu's agents grouped, stats correct, an Update button works, nav restructured, drill-in + enroll intact). No contract break for existing consumers (additive).

## 5. Success criteria

The home is a control-plane Overview: a stat rollup + a dense, grouped, searchable table of **every agent across the fleet**, with version/update and one-click per-row update; nav is resource-typed (Overview/Nodes/System) with no dead links; existing flows intact; check/test/build green; verified live on superchotu. Establishes the IA + components P2–P4 build on.
