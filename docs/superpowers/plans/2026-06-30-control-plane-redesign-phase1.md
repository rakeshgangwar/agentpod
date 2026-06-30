# Control-Plane Redesign Phase 1 (IA Spine + Overview Home) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** A control-plane Overview home + resource-typed nav — every agent across the fleet in one dense, grouped, searchable table with version/update — from data the hub already has.

**Architecture:** T1 hub aggregate read (`/api/fleet/agents` + `/api/fleet/stats` + contract). T2 console (nav restructure + Overview home: stat band + AgentTable; move node-cards to `/nodes`). T2 follows T1 (consumes the contract + endpoints). T3 deploy + live verify.

**Tech Stack:** Bun/Hono/Drizzle hub; SvelteKit (Svelte 5) console; Zod contract.

**Spec:** `docs/superpowers/specs/2026-06-30-control-plane-redesign-phase1-design.md`.

## Global Constraints

- Gates: hub `bun test`; console `pnpm check` (0/0) + `pnpm test` + `pnpm build`.
- Phase 1 uses **cheap data only** — no gateway round-trips, no node-agent changes. Per-agent live status/CPU/mem + heatmap = P2; bulk select = P3; Agents/Runtimes/Activity views = P4 (do NOT add them to nav now).
- Reuse: `updateNode` (slice 3), `statusBadgeClass`, `PageHeader`, cyber tokens. Additive contract only.
- **Wire interface (T1→T2):** `GET /api/fleet/agents` → `{ stats: FleetStats, agents: FleetAgent[] }`; `FleetAgent = { stationId, nodeId, nodeName, agentName, harness, kind, nodeStatus: "online"|"offline", agentVersion: string|null, latestVersion: string|null, updateAvailable: boolean, capabilities: string[], workspacePath: string|null }`; `FleetStats = { nodes: {total, online}, agents: {total}, updatesAvailable: number }`.

---

### Task 1: Hub — fleet aggregate read + contract

**Files:** `packages/contract/src/fleet.ts` (new, + export from index), `apps/hub/src/services/fleet.ts` (new, + test), `apps/hub/src/routes/fleet.ts` (new, + test), `apps/hub/src/index.ts` (mount under the authed `/api` middleware). Read `db/schema/stations.ts` + `db/schema/nodes.ts` + `services/node-registry.ts` (`getLatestAgentVersion`, the existing node/station queries) FIRST.

**Interfaces (produced):** the wire interface above; `listFleetAgents(): Promise<FleetAgent[]>`, `getFleetStats(): Promise<FleetStats>`.

- [ ] **Step 1 — contract.** `packages/contract/src/fleet.ts`: define `FleetAgent` + `FleetStats` Zod schemas + inferred types per the Global wire interface; export from the contract index.
- [ ] **Step 2 — service (RED).** `fleet.test.ts`: seed (test DB or mocked query) a node `superchotu` (online, agentVersion v0.1.4) with 2 adopted stations → `listFleetAgents()` returns 2 `FleetAgent`s with `nodeName:"superchotu"`, `nodeStatus:"online"`, `updateAvailable` computed from `agentVersion` vs stubbed `getLatestAgentVersion`; `getFleetStats()` → `{nodes:{total:1,online:1}, agents:{total:2}, updatesAvailable:<n>}`. RED.
- [ ] **Step 3 — service (GREEN).** `services/fleet.ts`: `listFleetAgents()` = a Drizzle join of **adopted** `stations` with `nodes` (select stationId, nodeId, nodes.name, station.displayName→agentName, harness, kind, nodes.status→nodeStatus, nodes.agentVersion, capabilities, workspacePath), then annotate each with `latestVersion = await getLatestAgentVersion()` (call once) + `updateAvailable = agentVersion!=null && latestVersion!=null && agentVersion!==latestVersion`. `getFleetStats()` = count nodes (total + online) + count adopted stations + count nodes/agents with updateAvailable. Match existing query/style in node-registry. Test → PASS.
- [ ] **Step 4 — routes (RED).** `fleet.test.ts` (route): `GET /api/fleet/agents` (authed) → `{ stats, agents }`; `GET /api/fleet/stats` → `FleetStats`. Use the route-test pattern from `nodes` (mock/inject the service or use the test DB). RED.
- [ ] **Step 5 — routes (GREEN).** `routes/fleet.ts`: `GET /agents` → `{ stats: await getFleetStats(), agents: await listFleetAgents() }`; `GET /stats` → `await getFleetStats()`. Mount in `index.ts` under the same auth middleware as `/api/nodes`. Test → PASS.
- [ ] **Step 6 — gate + commit.** `cd apps/hub && bun test` (new fleet tests green) + contract typechecks. Commit: `feat(hub): fleet aggregate read — GET /api/fleet/agents + /stats (control-plane P1)`

---

### Task 2: Console — resource-typed nav + Overview home

**Files:** the sidebar nav component (find it — `lib/components/.../sidebar` or in the layout), `apps/console/src/routes/+page.svelte` (rewrite → Overview), `apps/console/src/routes/nodes/+page.svelte` (new → node cards), `apps/console/src/lib/components/fleet/OverviewStats.svelte` (new), `apps/console/src/lib/components/fleet/AgentTable.svelte` (new), `apps/console/src/lib/api/client.ts`; tests. Read the current `routes/+page.svelte` (renders `NodesOverview`), the sidebar, and `NodesOverview.svelte` FIRST.

**Interfaces (consumed):** `GET /api/fleet/agents` → `{stats, agents}` (see Global).

- [ ] **Step 1 — API client.** `client.ts`: `getFleet() => http<{ stats: FleetStats; agents: FleetAgent[] }>("/api/fleet/agents")` (import the contract types).
- [ ] **Step 2 — nav restructure.** In the sidebar component, change the flat nav to grouped: **Fleet** → `Overview` (`/`), `Nodes` (`/nodes`); **System** → `Settings` (`/settings`), `Admin` (`/admin`). Use small uppercase group labels. Do NOT add Agents/Runtimes/Activity (P4). Keep the active-route highlighting + mobile behavior.
- [ ] **Step 3 — move node-cards to /nodes.** Create `routes/nodes/+page.svelte` that renders the existing `NodesOverview` (the current home content) — node cards, enroll, runtime actions — unchanged. (`/nodes/[id]` detail already exists.)
- [ ] **Step 4 — OverviewStats (RED→GREEN).** `OverviewStats.svelte` (props: `stats: FleetStats`): a row of stat cards — Nodes (`online/total`), Agents (`total`), Updates available (`updatesAvailable`, accented when >0), styled with the cyber tokens/`PageHeader` family. Component test: renders the three values. 
- [ ] **Step 5 — AgentTable (RED).** Component test (`AgentTable.svelte`, props `agents: FleetAgent[]`): renders a row per agent with agentName/harness/version; **groups by node** (a group header per `nodeName` with the agent count) by default; typing in search filters rows by agent/node; an agent with `updateAvailable:true` renders an **Update** button. RED.
- [ ] **Step 6 — AgentTable (GREEN).** `AgentTable.svelte`: a dense table — columns **Agent · Harness · Node · Reachability (nodeStatus via `statusBadgeClass`) · Version · Update**. Group-by-node (collapsible group header: node name + arch + count) with a flat/group toggle; a search input (filters agent/node, `$derived`); filter pills (node, harness, update-available). Each data row links to `/nodes/{nodeId}/stations/{stationId}`; rows with `updateAvailable` show an inline Update button → `updateNode(nodeId)` with an "updating…" state (reuse the slice-3 pattern). Test → PASS.
- [ ] **Step 7 — Overview page.** Rewrite `routes/+page.svelte`: `PageHeader` ("Overview" / "// fleet control plane") + load `getFleet()` (the existing load/onMount data pattern) → `<OverviewStats {stats} />` + `<AgentTable {agents} />`. Empty state (no agents) → the centered connect-banner/enroll (reuse from P2 polish). Leave a comment marking where the P2 health heatmap will slot in.
- [ ] **Step 8 — gate + commit.** `cd apps/console && pnpm check` (0/0) + `pnpm test` (Overview/AgentTable/OverviewStats green; update any test/route referencing the old `/` content) + `pnpm build`. Commit: `feat(console): control-plane Overview home + resource-typed nav; node cards → /nodes (P1)`

---

### Task 3: Deploy + live verification (driver-run)

- [ ] Merge `develop`→`main` (+ sync `redesign/fleet-console`); redeploy hub (restart) + rebuild/redeploy console.
- [ ] Playwright (Neutral + a dark scheme): `/` shows the Overview — stat band correct (1 node online, 13 agents, updates count), the agent table lists **all 13 of superchotu's agents grouped under the node**, search filters, a row's Update button works; nav shows Overview/Nodes/Settings/Admin (no dead links); `/nodes` still shows the node cards + enroll; drill-in (agent row → station detail) intact.
- [ ] Fix any regression → `fix(console): control-plane P1 regression — <what>`.

## Self-review

- **Spec coverage:** §2 backend → T1; §3 nav + Overview + AgentTable + Nodes-at-/nodes → T2; deferrals (heatmap/live/bulk/sub-views) excluded; §4 verify → T3. ✓
- **Ordering:** T1 (contract+hub) → T2 (console consumes contract+API) sequential; T3 after. ✓
- **Type consistency:** `FleetAgent`/`FleetStats` fields, `getFleet()`, `listFleetAgents`/`getFleetStats`, `updateNode` reuse — consistent. ✓
- **No placeholders:** the wire interface, the join columns, the component props + test assertions are concrete. ✓
