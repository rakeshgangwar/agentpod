# Control-Plane Redesign — Phase 4: Resource Sub-views + Polish (Design Spec)

**Status:** Approved (brainstorm 2026-06-30). Phase 4 of 4 (milestone #13). (P3 bulk orchestration intentionally skipped for now.)
**Branch:** `develop` (merge `develop`→`main`).
**Context:** Complete the control-plane IA: split the Overview into a glance **dashboard** + a full **Agents** worklist, give **Runtimes** and **Activity** real pages (their backends already exist), finish the resource-typed nav, and clear the P1 polish debts (the `/nodes` "Fleet Overview" title, the gimmicky marquee).

**Almost entirely frontend** — `GET /api/runtimes` (+ destroy/start/stop, client fns exist) and `GET /api/activity` (fleet audit) are already built; only an optional activity `?limit` tweak is hub-side.

## 1. Goal & Scope

Finish the nav (Overview · Agents · Nodes · Runtimes · Activity / Settings · Admin) with a real page behind each, and replace the marquee with a proper Activity surface.

## 2. Agents split — Overview becomes a dashboard, Agents becomes the worklist

- **`/agents` (new):** the full dense `AgentTable` (from P1/P2 — search, group-by-node, filter pills, Status/CPU/Mem/Uptime/Version/Update columns, per-row update) as a focused full-height worklist. Reads `?station=<id>` / `?status=<s>` query params → applies the existing `externalFilter`.
- **`/` Overview = glance dashboard** (table moves out): keeps the **stat band** + the **FleetHeatmap**, and adds two compact panels:
  - **Needs attention** — agents not `running`, nodes offline, and updates-available, as a short actionable list (each row links to the agent / triggers update); empty → "all healthy."
  - **Recent activity** — the latest ~6 audit rows (from `/api/activity`) in a clean compact list, with a "view all →" link to `/activity`.
  - The heatmap stays actionable across the split: clicking a **cell** → `goto('/agents?station=<id>')`; a **legend status** → `goto('/agents?status=<s>')`. Glance → drill into the filtered worklist.

## 3. Activity view + kill the marquee

- **`/activity` (new):** a full-page fleet activity feed from `GET /api/activity` (station_audit: verb, actor, station/node, timestamp) — a readable reverse-chron list/table with relative times, grouped by day or just dense rows. Add a `listActivity()` client fn if missing.
- **Remove the `activity-ticker` marquee** from `NodesOverview` (the user flagged it as low-value); its purpose is served by the Overview "recent activity" panel + the full Activity page. Delete/retire `activity-ticker.svelte`.
- **(Optional hub)** the activity endpoint caps at `FLEET_ACTIVITY_LIMIT`; accept an optional `?limit` (bounded) so the full page can show more than the marquee's slice. Small, additive.

## 4. Runtimes view

- **`/runtimes` (new):** list provisioned runtimes via the existing `listRuntimes()` — columns: name/id, provider/driver, status (provisioning/online/stopped/error/destroyed via `statusBadgeClass`), linked node, created. Actions: **destroy** (`destroyRuntime`, with a confirm), start/stop where applicable, and the **New runtime** entry (reuse the existing provision flow/dialog from `NodesOverview`). Empty → a "provision your first runtime" prompt.

## 5. Nav + polish

- **Complete the nav** (`app-shell.svelte`): **FLEET** → Overview, Agents, Nodes, Runtimes, Activity; **SYSTEM** → Settings, Admin. Icons + active highlighting + mobile bottom-nav derivation (the bottom nav may need to prioritize/overflow with 5 fleet items — keep the most-used; acceptable to bottom-nav a subset + the rest under a "more").
- **Retitle `/nodes`** — `NodesOverview` header "Fleet Overview // connected nodes" → "Nodes // connected machines".
- **Fix the `?action=create-token` deep-link** on `/nodes` (the P1-noted `replaceState("/")` that bounces to `/` — point it at `/nodes`).

## 6. Risks & verification

- **Overview-not-hollow:** the dashboard must feel complete without the table — the attention + recent-activity panels carry it; if both are empty, show healthy/quiet states, not blank space.
- **No dead nav:** ship the nav additions together with their pages (one phase); every nav item resolves.
- **Don't regress** the P1/P2 AgentTable behavior when it moves to `/agents` (search/group/filter/update/externalFilter all still work) or the heatmap interaction (now cross-page via query params).
- **Mobile:** 5 fleet nav items must degrade sensibly on the bottom nav.
- **Gate:** console `pnpm check` (0/0) + `pnpm test` (Overview dashboard, /agents, /activity, /runtimes, nav) + `pnpm build`; hub `bun test` if the `?limit` tweak is done; live Playwright (each nav item resolves; Overview dashboard + heatmap→/agents drill; Activity feed; Runtimes list; /nodes retitled, no marquee).

## 7. Success criteria

The nav is complete and every item is a real page; Overview is a glance dashboard (stats + heatmap + attention + recent activity) whose heatmap drills into a filtered `/agents` worklist; `/agents` is the full table; `/activity` replaces the marquee with a proper feed; `/runtimes` lists + manages provisioned runtimes; `/nodes` is retitled and marquee-free; no dead links; gates green; verified live. The control-plane IA is complete.
