# Control-Plane Redesign Phase 4 (Sub-views + Polish) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Complete the control-plane IA — split Overview (dashboard) / Agents (worklist), add Activity + Runtimes pages, finish the nav, retitle /nodes, kill the marquee.

**Architecture:** Three sequential console tasks (shared `app-shell` nav + console build gate), each adding its own nav item with its page (no dead links). T1 Agents-split + nav(Agents) + polish; T2 Activity + nav(Activity) + marquee removal; T3 Runtimes + nav(Runtimes). T4 deploy + verify. Backends (`/api/runtimes`, `/api/activity`) already exist.

**Tech Stack:** SvelteKit (Svelte 5) console; existing hub endpoints.

**Spec:** `docs/superpowers/specs/2026-06-30-control-plane-redesign-phase4-design.md`. Builds on P1/P2 (`AgentTable`, `FleetHeatmap`, `OverviewStats`, `getFleet`).

## Global Constraints

- Console `apps/console`. Gate each task: `pnpm check` (0/0) + `pnpm test` + `pnpm build`.
- Reuse existing client fns: `getFleet`, `updateNode`, `listRuntimes`, `destroyRuntime`, `provisionRuntime`, `listRuntimeProviders`; `statusBadgeClass`, `PageHeader`, cyber tokens. Add `listActivity()` (endpoint `GET /api/activity` exists).
- Each task adds its **own** nav entry to `app-shell.svelte` (FLEET group) so no dead links exist between tasks. Final FLEET nav order: Overview · Agents · Nodes · Runtimes · Activity.

---

### Task 1: Agents split + nav(Agents) + polish

**Files:** `apps/console/src/routes/+page.svelte` (Overview → dashboard), `apps/console/src/routes/agents/+page.svelte` (new), `apps/console/src/lib/components/app-shell.svelte` (nav: add Agents), `apps/console/src/lib/components/fleet/NodesOverview.svelte` (retitle + deep-link), `apps/console/src/lib/api/client.ts` (`listActivity`), maybe `lib/components/fleet/NeedsAttention.svelte` + `RecentActivity.svelte`; tests. Read the current `+page.svelte` (Overview with stats+heatmap+AgentTable+externalFilter), `AgentTable.svelte`, `FleetHeatmap.svelte`, `app-shell.svelte` FIRST.

- [ ] **Step 1 — listActivity client.** `client.ts`: `listActivity = () => http<ActivityRow[]>("/api/activity")` (define a minimal `ActivityRow` type from the audit shape: `{ id, verb, stationId?, nodeId?, actorType?, createdAt }` — match the contract/audit fields; import or declare).
- [ ] **Step 2 — /agents page.** `routes/agents/+page.svelte`: `PageHeader title="Agents" subtitle="// every agent in the fleet"` + `onMount`→`getFleet()` → `<AgentTable {agents} {externalFilter}/>` where `externalFilter` is derived from `$page.url.searchParams` (`station` → `{stationId}`, `status` → `{status}`). Full-height; keep all AgentTable behavior. Component/route test: renders the table; `?status=running` applies the filter.
- [ ] **Step 3 — Overview → dashboard.** Rewrite `routes/+page.svelte`: keep `OverviewStats` + `FleetHeatmap`, **remove `AgentTable`**. Heatmap callbacks now navigate: `onSelectAgent=(id)=>goto('/agents?station='+id)`, `onFilterStatus=(s)=>goto('/agents?status='+s)`. Add **NeedsAttention** (from `agents`: those with `status!=="running"`, plus offline-node + updates-available counts; each links to `/agents?...` or triggers `updateNode`; empty → "all healthy ✓") and **RecentActivity** (top 6 from `listActivity()`, compact list, "view all →" → `/activity`). Keep the empty-fleet connect-banner.
- [ ] **Step 4 — nav: Agents.** `app-shell.svelte`: add **Agents** (`/agents`, an icon e.g. `Boxes`/`Cpu`) to the FLEET group between Overview and Nodes. Mobile bottom-nav picks up the new item.
- [ ] **Step 5 — polish.** `NodesOverview.svelte`: retitle header "Fleet Overview" → "Nodes", "// connected nodes" → "// connected machines". Fix the `?action=create-token` `replaceState` to target `/nodes` (not `/`).
- [ ] **Step 6 — gate + commit.** `pnpm check` (0/0) + `pnpm test` (update Overview test for the dashboard shape; new /agents test) + `pnpm build`. Commit: `feat(console): split Overview (dashboard) / Agents (worklist) + nav + /nodes polish (control-plane P4)`

---

### Task 2: Activity view + kill marquee + nav(Activity)

**Files:** `apps/console/src/routes/activity/+page.svelte` (new), `apps/console/src/lib/components/app-shell.svelte` (nav: add Activity), `apps/console/src/lib/components/fleet/NodesOverview.svelte` (remove the `<activity-ticker>`), delete `apps/console/src/lib/components/fleet/activity-ticker.svelte` (+ its test); optional `apps/hub/src/routes/activity-fleet.ts` (`?limit`). Read `activity-ticker.svelte` (how it fetches/renders) + `NodesOverview.svelte` (where it's mounted) FIRST.

- [ ] **Step 1 — /activity page.** `routes/activity/+page.svelte`: `PageHeader title="Activity" subtitle="// fleet event log"` + `onMount`→`listActivity()` → a dense reverse-chron list/table (verb, station/node, actor, **relative time** e.g. "5m ago"). Readable rows; empty → "no activity yet". Component test: renders rows from a mocked `listActivity`.
- [ ] **Step 2 — remove marquee.** In `NodesOverview.svelte` remove the `activity-ticker` usage/import; delete `lib/components/fleet/activity-ticker.svelte` + `activity-ticker.svelte.test.ts`. `grep -rn "activity-ticker" apps/console/src` → empty.
- [ ] **Step 3 — nav: Activity.** `app-shell.svelte`: add **Activity** (`/activity`, icon e.g. `Activity`) to the FLEET group (last).
- [ ] **Step 4 — (optional) hub `?limit`.** If the page wants more than the marquee's `FLEET_ACTIVITY_LIMIT`, add an optional bounded `?limit` query param to `GET /api/activity` (clamp e.g. ≤200) + pass it from `listActivity(limit?)`. Skip if the default is fine; if done, `cd apps/hub && bun test`.
- [ ] **Step 5 — gate + commit.** `pnpm check` (0/0) + `pnpm test` + `pnpm build`. Commit: `feat(console): Activity page + remove marquee (control-plane P4)`

---

### Task 3: Runtimes view + nav(Runtimes)

**Files:** `apps/console/src/routes/runtimes/+page.svelte` (new), `apps/console/src/lib/components/app-shell.svelte` (nav: add Runtimes). Reuse the existing provision dialog/flow from `NodesOverview` (read it for the "New runtime" pattern). Client fns `listRuntimes`/`destroyRuntime`/`provisionRuntime`/`listRuntimeProviders` already exist.

- [ ] **Step 1 — /runtimes page.** `routes/runtimes/+page.svelte`: `PageHeader title="Runtimes" subtitle="// provisioned containers"` + `onMount`→`listRuntimes()` → a table: name/id, provider, **status** (`statusBadgeClass`), linked node, created. Actions: **Destroy** (confirm dialog → `destroyRuntime` → refresh), start/stop where status warrants (`startRuntime`/`stopRuntime` if present), and a **New runtime** button reusing the existing provision flow. Empty → "provision your first runtime" prompt. Component test: renders runtimes; destroy calls `destroyRuntime`.
- [ ] **Step 2 — nav: Runtimes.** `app-shell.svelte`: add **Runtimes** (`/runtimes`, icon e.g. `Container`/`Box`) to the FLEET group between Nodes and Activity. Final order: Overview · Agents · Nodes · Runtimes · Activity.
- [ ] **Step 3 — gate + commit.** `pnpm check` (0/0) + `pnpm test` + `pnpm build`. Commit: `feat(console): Runtimes page + nav (control-plane P4)`

---

### Task 4: Deploy + live verification (driver-run)

- [ ] Merge `develop`→`main` (+ sync `redesign/fleet-console`); redeploy hub (only if the `?limit` tweak was done) + rebuild/redeploy console.
- [ ] Playwright (Neutral + a dark scheme): nav shows Overview·Agents·Nodes·Runtimes·Activity / Settings·Admin — **every item resolves** (no dead links). Overview is a dashboard (stats + heatmap + needs-attention + recent-activity); **clicking a heatmap cell lands on `/agents` filtered** to that agent. `/agents` shows the full table. `/activity` shows the feed (no marquee on `/nodes`). `/runtimes` lists runtimes (or the empty prompt). `/nodes` titled "Nodes". Mobile (390px) bottom-nav degrades sensibly.
- [ ] Fix any regression → `fix: control-plane P4 regression — <what>`.

## Self-review

- **Spec coverage:** §2 Agents split + Overview dashboard → T1; §3 Activity + marquee → T2; §4 Runtimes → T3; §5 nav (split across tasks) + /nodes polish → T1/T2/T3; §6 verify → T4. ✓
- **No dead nav:** each task adds its own nav item with its page. ✓
- **Ordering:** sequential console tasks (shared app-shell + build gate). ✓
- **Type consistency:** `listActivity`/`ActivityRow`, `externalFilter` ({stationId}|{status}), reused runtime client fns, `goto('/agents?station=…')` — consistent. ✓
- **No placeholders:** routes, the dashboard panels, the query-param filter, the runtime table + actions are concrete.
