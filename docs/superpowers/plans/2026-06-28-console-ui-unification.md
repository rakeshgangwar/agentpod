# Console UI Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the plain fleet-console pages into the existing polished UI — reusing its shell, layouts, and design system — make the fleet the primary experience, and phase the OpenCode pages out of the nav.

**Architecture:** Presentation + IA only, no fleet-feature logic changes. Re-skin each fleet page/panel with the existing `lib/components/ui/*` (bits-ui + Tailwind 4) components and the cyber theme; reuse existing layout patterns (the home card-grid for the fleet overview, the `/projects/[id]` tabbed-workspace for the station page); make everything responsive (mobile → desktop) in ONE shell (no separate desktop/Tauri shell). Demote OpenCode pages from nav (kept routable).

**Tech Stack:** SvelteKit + Svelte 5 runes, Tailwind 4, bits-ui, `lib/components/ui/*`, the `--cyber-*` theme; vitest + @testing-library/svelte.

**Spec:** `docs/superpowers/specs/2026-06-28-console-ui-unification-design.md`.

## Global Constraints

- **Branch:** `redesign/fleet-console`. Frequent commits.
- **Presentation + IA only.** NO changes to fleet-feature logic, data flow, API calls, or store behavior. Each task keeps the relevant `apps/console` vitest suite **green** — preserve the behavior the tests assert; where a test queries a tag/structure that the re-skin changes, update that test in the SAME task to the new structure (keep it asserting behavior/text/roles, not vacuous).
- **Reuse, don't reinvent.** Style exclusively with `apps/console/src/lib/components/ui/*` + the cyber theme (`src/app.css`: `--cyber-*`, `cyber-card`, `mesh-gradient`, `grid-bg`). Mine the OpenCode pages (`routes/+page.svelte` home, `routes/projects/[id]/+layout.svelte`) as the reference for how the system is applied. Do NOT add a new design language or new heavy deps.
- **Responsive, web-only.** Every page works mobile → desktop via Tailwind breakpoints. One responsive `app-shell` (BottomNav on mobile → side/top nav on `md+`). No separate desktop shell. Do NOT add or depend on Tauri.
- **Demote, don't delete.** OpenCode pages (`/projects/*`, `/workflows/*`, the sandboxes home) leave the nav but stay routable; deletion is a later phase.
- **Per task:** `cd apps/console && pnpm test <file>` (green) + `pnpm check` (clean for touched files; pre-existing legacy errors out of scope) + `pnpm build` completes.

## File Structure

- `src/lib/components/app-shell.svelte` (modify) — responsive shell + fleet-first nav.
- `src/routes/+layout.svelte` (modify) — post-login redirect → fleet home; ensure shell wraps fleet routes.
- `src/routes/+page.svelte` (modify) — becomes the Fleet home (nodes overview); old OpenCode dashboard demoted.
- `src/routes/nodes/+page.svelte` (modify) — redirect to `/` (home is the fleet list) or fold in.
- `src/routes/nodes/[id]/+page.svelte` (modify) — re-skin detect/adopt.
- `src/routes/nodes/[id]/stations/[stationId]/+page.svelte` (modify) — tabbed-workspace layout.
- `src/lib/components/stations/{HealthPanel,LogTail,Terminal,FileBrowser,ConfigEditor,CleanupPanel,ActivityPanel,StationTree}.svelte` (modify) — re-skin.
- `src/lib/components/ui/{ConfirmDialog,TypeToConfirmDialog}.svelte` (modify) — onto `ui/dialog`.
- `src/routes/login/+page.svelte` (modify) — consistency + #102 default-URL fix.
- Tests: the co-located `*.svelte.test.ts` for each touched component.

---

## Task 1: Responsive app-shell + fleet-first nav

**Files:** Modify `src/lib/components/app-shell.svelte`, `src/routes/+layout.svelte`; test `src/lib/components/app-shell.svelte.test.ts` (create if absent).

**Interfaces — Produces:** a responsive shell: mobile shows the existing `BottomNav`; `md+` shows a persistent side (or top) nav using the same items. Nav items: **Fleet** (`/`, icon `Server`/`LayoutDashboard`), **Activity** (`/activity` — only if Task scope includes a fleet-activity page; else omit), **Settings** (`/settings`), **Admin** (`/admin`, only when `auth.user?.role === "admin"`). Projects/Workflows removed. A small "Legacy" link (to `/projects`) in Settings or an overflow menu.

- [ ] **Step 1: Failing test** — assert the shell renders a Fleet nav item linking `/` and does NOT render Projects/Workflows; Admin item present only when a mocked `auth.user.role==="admin"`.
- [ ] **Step 2: Run → FAIL** — `cd apps/console && pnpm test app-shell`.
- [ ] **Step 3: Implement** — restructure `app-shell.svelte`: wrap content in a responsive grid — `<nav>` hidden on mobile (`hidden md:flex` side/top) + the existing `BottomNav` shown `md:hidden`. Replace the Home/Projects items with Fleet (`/`); keep Settings; add Admin (role-gated); drop Projects/Workflows. In `+layout.svelte`, change the post-auth redirect target from the OpenCode home to `/` (which becomes the fleet home in Task 2) — if the layout currently redirects authenticated users somewhere OpenCode-specific, point it at `/`.
- [ ] **Step 4: Run → PASS**; `pnpm check`; `pnpm build`.
- [ ] **Step 5: Commit** — `feat(console): responsive fleet-first app-shell nav (UI unification)`

---

## Task 2: Fleet home (`/`) — nodes overview

**Files:** Modify `src/routes/+page.svelte` (the OpenCode dashboard → fleet overview); `src/routes/nodes/+page.svelte` (redirect to `/`); test `src/routes/+page.svelte` is hard to unit-test (route) — add/extend a test on a extracted `FleetOverview` component if you create one, else rely on the visual pass.

**Interfaces — Consumes:** `listNodes()` from `$lib/api/client` (the existing nodes API the current `/nodes` page uses). **Produces:** `/` renders the fleet overview — a responsive grid of node **Cards** (host, online/offline `Badge`, arch · CPU, station count, "view" link to `/nodes/[id]`), a "Create enrollment token" `Button`, an empty state, and `Skeleton` while loading. Reuse the card-grid layout pattern from the existing OpenCode home for spacing/structure.

- [ ] **Step 1:** Extract the current `/nodes` list logic (fetch + render) into a `src/lib/components/fleet/NodesOverview.svelte` styled with `ui/card`, `ui/badge`, `ui/button`, `ui/skeleton`. Render it from `routes/+page.svelte`. (Keep the OpenCode dashboard component file but stop rendering it at `/` — move it to render only at `/legacy` or leave unreferenced.)
- [ ] **Step 2:** `routes/nodes/+page.svelte` → `redirect(307, "/")` (home is the canonical fleet list); node detail stays at `/nodes/[id]`.
- [ ] **Step 3: Test** — `NodesOverview.svelte.test.ts`: mock `listNodes()` → 2 nodes → both cards render with host + status badge; empty → empty state; the create-token button present.
- [ ] **Step 4:** `pnpm test NodesOverview` green; `pnpm check`; `pnpm build`. Verify visiting `/` shows the fleet (not the OpenCode dashboard) and `/nodes` redirects to `/`.
- [ ] **Step 5: Commit** — `feat(console): fleet overview home (nodes cards), demote OpenCode dashboard (UI unification)`

---

## Task 3: Node detail (`/nodes/[id]`) re-skin

**Files:** Modify `src/routes/nodes/[id]/+page.svelte`, `src/lib/components/stations/StationTree.svelte`; tests: `StationTree.svelte.test.ts`.

**Interfaces:** unchanged logic (detect via `listStations`/the detect call, adopt, StationTree). **Produces:** detected stations as `Card` rows with a harness `Badge` + workspace path in mono + an Adopt `Button`; "Adopt all" `Button`; adopted stations as linked `Card`s; `StationTree` styled with the design system; `Skeleton` while detecting.

- [ ] **Step 1:** Re-skin `routes/nodes/[id]/+page.svelte` — wrap detected/adopted sections in `ui/card`; Adopt → `ui/button`; harness/kind → `ui/badge`; responsive list (stack on mobile, grid/`md:` on desktop). Keep all click handlers + data flow identical.
- [ ] **Step 2:** Re-skin `StationTree.svelte` with the design system (indentation, badges) — keep its props + emitted events.
- [ ] **Step 3: Tests** — update `StationTree.svelte.test.ts` to the new markup (assert it still renders the station names/structure + fires the same events). Add/keep an assertion that an Adopt button exists per detected station.
- [ ] **Step 4:** `pnpm test StationTree`; `pnpm check`; `pnpm build`.
- [ ] **Step 5: Commit** — `feat(console): re-skin node detail (detect/adopt) (UI unification)`

---

## Task 4: Station page — tabbed-workspace layout

**Files:** Modify `src/routes/nodes/[id]/stations/[stationId]/+page.svelte`.

**Interfaces — Consumes:** the existing tab logic (`activeTab`, capability gates `hasTerminal`/`canWrite`/`canLifecycle`/`hasCleanup`, `matrixId`). **Produces:** the station page using the existing `ui/tabs` (or `ui/inline-tabs`) for the panel nav + a themed page header (station name, harness Badge, back link), reusing the visual structure of `routes/projects/[id]/+layout.svelte` (the OpenCode tabbed workspace). Tabs: Health / Logs / Files / Terminal / Cleanup / Activity (gated as today). Responsive: tabs scroll/wrap on mobile.

- [ ] **Step 1:** Reference `routes/projects/[id]/+layout.svelte` for the workspace/tab layout pattern. Re-skin the station page header + tab bar with `ui/tabs` + theme; keep the exact `activeTab` state machine + capability gates + the `<HealthPanel>/<LogTail>/...` children unchanged.
- [ ] **Step 2:** Ensure the ConfigEditor modal wiring + `matrixId` prop pass-through stay intact.
- [ ] **Step 3: Verify** — the page is a route (hard to unit-test); rely on `pnpm check` + `pnpm build` + the Task 10 visual pass. Confirm all tabs still switch + gated tabs still hidden without the capability.
- [ ] **Step 4:** `pnpm check`; `pnpm build`.
- [ ] **Step 5: Commit** — `feat(console): station page on the tabbed-workspace layout (UI unification)`

---

## Task 5: Health panel re-skin (+ lifecycle + Matrix)

**Files:** Modify `src/lib/components/stations/HealthPanel.svelte`; test `HealthPanel.svelte.test.ts`.

**Produces:** the health snapshot as a `Card` with a responsive stat grid (Status as a colored `Badge` — green running / muted stopped, Disk, PID, CPU, Mem, Uptime, Last Activity, Note), the Matrix-ID row with the `matrix.to` deep-link, and the lifecycle `Button`s (Start/Stop/Restart, capability-gated, Stop/Restart via the existing `TypeToConfirmDialog`). Replace the hand-rolled `<table>` + raw CSS.

- [ ] **Step 1:** Re-skin using `ui/card`, `ui/badge`, `ui/button`. Keep the exact data props (`stationId`, `canLifecycle`, `matrixId`), the health fetch, the lifecycle handlers, and the type-to-confirm flow.
- [ ] **Step 2: Update test** — `HealthPanel.svelte.test.ts`: the existing assertions (Matrix link, lifecycle buttons gated by `canLifecycle`, Stop→dialog→`lifecycle("stop")`) must still pass against the new markup; update any selector that depended on the old `<table>` rows to query by text/role/test-id.
- [ ] **Step 3:** `pnpm test HealthPanel` green; `pnpm check`; `pnpm build`.
- [ ] **Step 4: Commit** — `feat(console): re-skin Health panel + lifecycle (UI unification)`

---

## Task 6: Logs + Terminal panels re-skin

**Files:** Modify `src/lib/components/stations/LogTail.svelte`, `Terminal.svelte`; tests: `LogTail.svelte.test.ts`, `Terminal`-related test if present.

**Produces:** **LogTail** — a monospace log view in a `ui/scroll-area` (or the `code-block` styling), a connection-status `Badge`, keeping the line-cap (MAX_LINES) + SSE/stream logic. **Terminal** — the xterm canvas in a framed cyber panel (`cyber-card`/themed border) with a connected/disconnected `Badge` (the xterm wiring + WS client unchanged).

- [ ] **Step 1:** Re-skin `LogTail.svelte` (scroll-area + badge), preserving the append/cap logic + any test-ids the test uses. Re-skin `Terminal.svelte` chrome (frame + status), preserving the `onMount` xterm setup + the terminal client.
- [ ] **Step 2: Tests** — update `LogTail.svelte.test.ts` to the new structure (line-cap test + most-recent assertion still pass). Keep/skip the Terminal test as before (xterm canvas isn't unit-testable).
- [ ] **Step 3:** `pnpm test LogTail`; `pnpm check`; `pnpm build`.
- [ ] **Step 4: Commit** — `feat(console): re-skin Logs + Terminal panels (UI unification)`

---

## Task 7: Files + Config editor re-skin

**Files:** Modify `src/lib/components/stations/FileBrowser.svelte`, `ConfigEditor.svelte`; tests: their `*.svelte.test.ts`.

**Produces:** **FileBrowser** — entries with file/folder icons (`@lucide/svelte`), hover states, New/Rename/Delete as `ui/button` + `ui/dropdown-menu` (or inline buttons), the editor flow + confirm dialogs intact. **ConfigEditor** — use the existing `ui/monaco-editor` component for the buffer (replacing the plain `<textarea>`) with the diff view styled via the theme; Save (backup) + confirm flow unchanged.

- [ ] **Step 1:** Re-skin `FileBrowser.svelte` with the design system, preserving write actions + the `canWrite` gate + `onOpenConfigEditor`. Re-skin `ConfigEditor.svelte` to mount `ui/monaco-editor` for editing (keep the diff + `writeFile{backup:true}` save + `ConfirmDialog`).
- [ ] **Step 2: Tests** — update `FileBrowser.svelte.test.ts` (delete→type-to-confirm→`del`; new-folder→`mkdir`) + `ConfigEditor.svelte.test.ts` (edit→diff→save with backup) to the new markup; keep behavior assertions.
- [ ] **Step 3:** `pnpm test FileBrowser ConfigEditor`; `pnpm check`; `pnpm build`.
- [ ] **Step 4: Commit** — `feat(console): re-skin Files + Config editor (UI unification)`

---

## Task 8: Cleanup + Activity panels re-skin

**Files:** Modify `src/lib/components/stations/CleanupPanel.svelte`, `ActivityPanel.svelte`; tests: their `*.svelte.test.ts`.

**Produces:** **CleanupPanel** — Scan results as a `Card` list with checkboxes + size `Badge`s + a total, Apply via `Button` + the type-to-confirm, removedBytes feedback, "Nothing to clean" empty state. **ActivityPanel** — a timeline/`Card` list, each row: relative time, verb, compact params, a result `Badge` (ok=green/error=red/pending=muted), + Refresh `Button`; loading `Skeleton`.

- [ ] **Step 1:** Re-skin both with the design system, preserving `cleanupPlan/cleanupApply` + `activity()` calls + the gates/flows.
- [ ] **Step 2: Tests** — update `CleanupPanel.svelte.test.ts` (scan→select→confirm→`cleanupApply(selected)`) + `ActivityPanel.svelte.test.ts` (rows newest-first, empty, refresh) to the new markup; keep behavior assertions.
- [ ] **Step 3:** `pnpm test CleanupPanel ActivityPanel`; `pnpm check`; `pnpm build`.
- [ ] **Step 4: Commit** — `feat(console): re-skin Cleanup + Activity panels (UI unification)`

---

## Task 9: Dialogs onto `ui/dialog` + login consistency + #102

**Files:** Modify `src/lib/components/ui/ConfirmDialog.svelte`, `TypeToConfirmDialog.svelte`, `src/routes/login/+page.svelte`; tests: `TypeToConfirmDialog.svelte.test.ts`.

**Produces:** the two confirm dialogs rebuilt on `ui/dialog` (bits-ui) for consistent styling/animation/focus-trap, keeping their exact props + the type-to-confirm gating (Confirm disabled until typed === phrase). Login: light theme consistency pass; **fix #102** — the connect screen + the enroll command default to `PUBLIC_HUB_URL` (`import.meta.env.PUBLIC_HUB_URL`) instead of hardcoded `http://localhost:3001`.

- [ ] **Step 1:** Migrate `ConfirmDialog`/`TypeToConfirmDialog` to compose `ui/dialog`, preserving props (`open,title,message,confirmPhrase,onConfirm,onCancel`) + Esc/backdrop cancel + the typed-gate.
- [ ] **Step 2:** Login — default `apiUrl` to `import.meta.env.PUBLIC_HUB_URL ?? "http://localhost:3001"`; update the Nodes-page enroll command string to use the connected hub URL.
- [ ] **Step 3: Tests** — `TypeToConfirmDialog.svelte.test.ts` (gating) still green against the `ui/dialog` markup.
- [ ] **Step 4:** `pnpm test TypeToConfirmDialog`; `pnpm check`; `pnpm build`.
- [ ] **Step 5: Commit** — `feat(console): dialogs on ui/dialog + login hub-url default (#102) (UI unification)`

---

## Task 10: Visual E2E + responsive screenshots

**Files:** Create `docs/superpowers/plans/ui-unification-e2e.md` (runbook).

- [ ] **Step 1:** Local stack (fresh DB `:5434`, hub `PORT=3001 bun run start`, console `PUBLIC_HUB_URL=http://localhost:3001 pnpm dev`); build node-agent + enroll + run.
- [ ] **Step 2 (Playwright):** sign in → fleet home (node cards) → node detail (detect/adopt) → station page (tabs) → each panel (Health/Logs/Terminal/Files/Config/Cleanup/Activity). Confirm the polished look + that gated tabs hide.
- [ ] **Step 3: Responsive** — capture each key screen at **mobile (390px)**, **tablet (768px)**, **desktop (1440px)**; confirm the shell switches BottomNav ↔ side/top nav and pages reflow (no fixed-width overflow).
- [ ] **Step 4:** Confirm OpenCode pages are out of the nav but still load via direct URL (`/projects`, `/workflows`) — demote, not break.
- [ ] **Step 5:** Write the runbook + screenshots; teardown; commit (`docs: UI unification visual + responsive E2E`). Send screenshots to the user.

---

## Self-Review

- **Spec coverage:** design-system reuse (every re-skin task), responsive shell (T1) + responsive pages (all + T10), fleet home (T2), demote OpenCode from nav + keep routable (T1 nav + T2 + T10 §4), reuse tabbed-workspace for stations (T4), all panels (T5–T8), dialogs (T9), login/#102 (T9), visual+responsive E2E (T10). Phase-out list (§3) honored: Projects/Workflows out of nav (T1), kept routable (T10 §4). Provisioning not pre-built (out of scope) ✓.
- **Placeholder scan:** none — each task names exact files, the components to use, the test updates, and commands. UI tasks specify the `ui/*` components + which existing page is the reference (not "make it nice").
- **Type/selector consistency:** every re-skin task explicitly updates the co-located test to the new markup while preserving behavior assertions — the recurring risk in a re-skin. Capability gates (`hasTerminal`/`canWrite`/`canLifecycle`/`hasCleanup`) + props (`stationId`,`matrixId`) referenced consistently with P2/P3.
- **No logic drift:** every task states "logic/flows unchanged"; the only behavioral change is #102 (login default URL) in T9, explicitly scoped.
