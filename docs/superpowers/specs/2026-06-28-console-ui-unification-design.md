# Console UI Unification (Design Spec)

**Status:** Approved (brainstorm 2026-06-28). Single phase. Sequenced **before P4 (provisioning)**.
**Builds on:** P0–P3 (the fleet console functionality is complete; this is the presentation + IA layer the redesign never reached).
**Branch:** `redesign/fleet-console`.

## 1. Goal & Scope

The fleet-console pages (P0–P3) are functionally complete but **visually plain** (hand-rolled tables + raw CSS), while the rest of the app (OpenCode-era) has a polished design system. This phase brings the fleet console up to that visual standard and makes it the **primary** AgentPod experience.

Two coordinated changes:
1. **Re-skin** every fleet-console page/panel using the **existing design system** (`apps/console/src/lib/components/ui/*` + the cyber theme) — reuse, don't reinvent.
2. **Fleet-first IA**: a Fleet Overview landing, fleet-first navigation, and **demotion** (not deletion) of the OpenCode-specific pages.

**Hard constraint: presentation only.** No changes to fleet-feature logic, data flow, API calls, or store behavior. Existing vitest suites must stay green — re-skins preserve component logic and the selectors/`data-testid`/roles those tests rely on.

**In scope:** re-skin of all fleet pages/panels/dialogs; the Fleet Overview landing; fleet-first nav (desktop + mobile); demoting OpenCode pages from nav.

**Out of scope (explicit):**
- **P4 — Provisioning** (the next phase; its UI lands in this new shell).
- **Retiring** the OpenCode pages (`/projects/*`, `/workflows/*`, the old home) — they are demoted now, deleted in a later phase once the fleet console stands alone.
- Any functional/logic change to fleet features, the hub, or the node-agent.
- A new/bespoke design language — we extend the existing one.

## 2. Design System (reuse)

The console already ships a shadcn-style component set on **bits-ui + Tailwind 4 + tailwind-variants**, plus a cyber theme:
- **Components** (`lib/components/ui/`): `card`, `button`, `badge`, `tabs`, `inline-tabs`, `dialog`, `dropdown-menu`, `popover`, `tooltip`, `input`, `label`, `select`, `switch`, `separator`, `scroll-area`, `skeleton`, `sonner` (toasts), `code-block`, `markdown`, `monaco-editor`, `sheet`, `collapsible`, `avatar`.
- **Theme** (`src/app.css`): `--cyber-*` tokens, `cyber-card`, `corner-accent`, `mesh-gradient`, `grid-bg` (as used by `routes/login/+page.svelte`).

The re-skin uses these exclusively. The OpenCode home (`routes/+page.svelte`) and `/projects` pages are the **reference** for how the system is applied (card grids, badges, status colors, loading skeletons, toasts).

## 3. IA / Shell — fleet-first

- **Fleet Overview landing.** A new overview becomes the post-login landing (replacing the OpenCode sandboxes dashboard): a grid of **node cards** (host, online/offline Badge, arch/CPU, station count, a health rollup) + the "Create enrollment token" CTA + empty state. Routed at `/` (the OpenCode dashboard moves to a demoted route, e.g. `/legacy` or stays at its component but is unlinked).
- **Primary navigation.** Fleet-first, via the existing shell (`lib/components/app-shell.svelte` BottomNav for mobile) plus a **desktop sidebar/top-nav** (added if none exists): **Fleet** (overview/nodes) · **Activity** (fleet-wide audit — optional, include if cheap) · **Settings** · **Admin** (admins only). **Projects / Workflows are removed from the primary nav.**
- **Demote OpenCode.** `/projects/*`, `/workflows/*`, and the old sandboxes home are dropped from navigation but remain routable (code retained). A minimal "Legacy" affordance (e.g. a link in Settings or a menu) keeps them reachable. The post-login redirect target changes from the OpenCode home to the Fleet Overview.

## 4. Pages Re-skinned

Each below moves from plain markup to the design system, behavior unchanged:
- **Nodes list** (`routes/nodes/+page.svelte`) → node Cards + status Badges + skeleton loading.
- **Node detail** (`routes/nodes/[id]/+page.svelte`) → Card list of detected stations with Adopt Buttons; styled `StationTree`; adopted-stations section.
- **Station page** (`routes/nodes/[id]/stations/[stationId]/+page.svelte`) → polished `Tabs` for the panel nav, themed page header.
- **Station panels** (`lib/components/stations/*`):
  - `HealthPanel` → stat grid in a Card, status Badge, lifecycle Buttons (start/stop/restart) + the existing TypeToConfirm; Matrix-ID row with the deep-link.
  - `LogTail` → monospace log view in a `ScrollArea` / `code-block`, connection status Badge.
  - `Terminal` → framed cyber panel, connected/disconnected Badge (xterm canvas unchanged).
  - `FileBrowser` → iconed entries, hover states, Buttons for new/rename/delete, the editor flow.
  - `ConfigEditor` → the `ui/monaco-editor` component for edit + a styled diff view.
  - `CleanupPanel` → Card list of items + size Badges + the apply flow.
  - `ActivityPanel` → a timeline/Card list with result Badges (ok/error/pending) + relative timestamps.
- **Dialogs** (`lib/components/ui/ConfirmDialog.svelte`, `TypeToConfirmDialog.svelte`) → migrate onto `ui/dialog` for consistent styling/animation.
- **Login** (`routes/login/+page.svelte`) → already on-theme; light consistency pass + fix the connect/enroll default URL (#102) if cheap.

## 5. Testing

- All existing `apps/console` vitest suites stay **green** — the re-skin must not break component logic or the selectors/test-ids/roles the tests query. Where a test asserts on a tag that changes (e.g. `<table>` → Card divs), update the test to the new structure in the same task.
- `pnpm check` + `pnpm build` clean per task.
- A final **visual E2E + screenshots** pass (Playwright, like P2.0/P3) over the full re-skinned console to confirm the polish + that the fleet-first IA works.

## 6. Risks & Open Items

- **Test-selector churn.** Re-skinning structural markup can break tests that query tags/classes. Mitigation: prefer role/text/test-id selectors; update tests alongside each re-skin; keep changes per-component.
- **Desktop shell may not exist.** The current `app-shell` is a mobile BottomNav; a desktop nav (sidebar/top-bar) likely needs to be added. Keep it within the existing design system.
- **Scope creep into logic.** Strictly presentation — resist "while I'm here" logic changes; route those to follow-ups.
- **Demote vs break.** Demoting must not break the demoted pages (they still must load if visited) nor the auth redirect — verify the new landing redirect + that legacy routes still render.
- **#102** (connect/enroll URL default) — fold the small fix into the login pass if low-risk; otherwise leave for its own follow-up.
