# Legacy Retirement + UI Repurpose Implementation Plan (Phase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repurpose three legacy OpenCode UI patterns into fleet features (Cmd-K command palette, activity ticker, connect banner/polish) and delete the rest of the legacy OpenCode console code.

**Architecture:** Transform the salvageable components in place (quick-task-modal → command palette; news-ticker → activity ticker; onboarding-banner/lottie → connect banner/polish), add one small additive hub endpoint (`GET /api/activity`), then delete the dead legacy console code + the orphaned `management-api/`. Console-focused; hub-side OpenCode retirement is deferred (Phase 2, milestone #9).

**Tech Stack:** SvelteKit + Svelte 5 runes + bits-ui (console), Bun + Hono + Drizzle (hub).

**Spec:** `docs/superpowers/specs/2026-06-29-legacy-retirement-ui-repurpose-design.md`.

## Global Constraints

- **Branch:** `redesign/fleet-console`. Frequent commits.
- **Console-focused.** The ONLY hub change is the additive `GET /api/activity`. NO hub-side OpenCode deletion (sandboxes/chat/workflows backend, the P4-reused Cloudflare/Docker provider+orchestrator) — that's Phase 2 (#135–139).
- **Repurpose, don't rebuild:** transform `quick-task-modal`/`news-ticker`/`onboarding-banner`/`lottie-icon` rather than delete-then-recreate. Reuse `ui/*` + the cyber theme.
- **Keep (hard boundary):** `page-header`, all `ui/*`, `app-shell`, `stores/{auth,connection,settings}`, `api/client`, routes `nodes`/`login`/`admin`/`settings`/`setup`, all P4/fleet code.
- **No dangling imports:** any deletion must remove all references in the same task; `pnpm check` + `pnpm build` gate it.
- **Recoverable:** everything deleted is in git history + the `v0.0.4-opencode` tag.
- **Per task:** `cd apps/console && pnpm test <file>` + `pnpm check`; hub `cd apps/hub && bun test <file>` (Postgres on :5434). TDD; existing suites stay green.

## File Structure

- `apps/console/src/lib/stores/command-palette.svelte.ts` (create) — palette open/close store (replaces `quick-task.svelte.ts`).
- `apps/console/src/lib/components/command-palette.svelte` (create, from `quick-task-modal.svelte`) — the Cmd-K palette.
- `apps/console/src/routes/+layout.svelte` (modify) — rewire Cmd-K → palette.
- `apps/hub/src/routes/activity-fleet.ts` (create) — `GET /api/activity`; mounted in `apps/hub/src/index.ts`.
- `apps/console/src/lib/api/client.ts` (modify) — `listFleetActivity()`.
- `apps/console/src/lib/components/fleet/activity-ticker.svelte` (create, from `news-ticker.svelte`) + render on the fleet home (`NodesOverview.svelte`).
- `apps/console/src/lib/components/fleet/connect-banner.svelte` (create, from `onboarding-banner.svelte`) + `lottie-icon` reuse on the home.
- Deletions (Task 5): `lib/chat/*`, `routes/{projects,workflows,legacy}/*`, `lib/voice/*`(verify), `lib/components/{workflow,session-forks}/*`, legacy stores + components, `management-api/`.

---

## Task 1: Fleet Command Palette (Cmd-K)

**Files:** Create `apps/console/src/lib/stores/command-palette.svelte.ts`, `apps/console/src/lib/components/command-palette.svelte`; Modify `apps/console/src/routes/+layout.svelte`; Test `apps/console/src/lib/components/command-palette.svelte.test.ts`.

**Interfaces — Consumes:** `listNodes()` from `$lib/api/client`; `goto` from `$app/navigation`. **Produces:** `commandPalette` store (`isOpen`, `open()`, `close()`, `toggle()`); `<CommandPalette>`.

- [ ] **Step 1: Store** — `command-palette.svelte.ts`:
```ts
let _open = $state(false);
export const commandPalette = {
  get isOpen() { return _open; },
  open() { _open = true; },
  close() { _open = false; },
  toggle() { _open = !_open; },
};
```
- [ ] **Step 2: Failing test** — `command-palette.svelte.test.ts` (mock `$lib/api/client` + `$app/navigation`): with `commandPalette.open()`, the palette renders a search input + at least the static actions ("New runtime", "Create enrollment token", "Settings"); mock `listNodes()`→[{id:"node_1",hostname:"box1"}] → typing "box" filters to a node entry; selecting an action item calls the expected handler (e.g. selecting a node entry calls `goto("/nodes/node_1")`). RED.
- [ ] **Step 3: Implement** — copy `quick-task-modal.svelte` → `command-palette.svelte`; strip the AI-task/template logic; bind `Dialog.Root open` to `commandPalette.isOpen` + `onOpenChange`→close. Build the item list: static **actions** (`{label, run}`): "New runtime" (dispatch an event / a passed callback or navigate to `/?new=1`), "Create enrollment token", "Fleet"→`goto("/")`, "Settings"→`goto("/settings")`; plus **nodes** from `listNodes()` (fetched on open) → each `{label: hostname, run: () => goto(\`/nodes/${id}\`)}`. A search `input` filters items by label (case-insensitive substring); ArrowUp/Down move a highlighted index; Enter runs the highlighted item then `close()`; Esc closes. Use `ui/dialog` + `ui/input` + the cyber theme.
- [ ] **Step 4: Rewire layout** — in `+layout.svelte`: replace `import { quickTask } from "$lib/stores/quick-task.svelte"` with `import { commandPalette } from "$lib/stores/command-palette.svelte"`; replace `import QuickTaskModal` with `import CommandPalette from "$lib/components/command-palette.svelte"`; in `handleGlobalKeydown` change `quickTask.toggle()` → `commandPalette.toggle()`; replace `<QuickTaskModal />` with `<CommandPalette />`.
- [ ] **Step 5: GREEN** — `cd apps/console && pnpm test command-palette` + `pnpm check` + `pnpm build`.
- [ ] **Step 6: Commit** — `feat(console): Cmd-K fleet command palette (repurpose quick-task-modal)`

---

## Task 2: Hub `GET /api/activity` (fleet-wide recent audit)

**Files:** Create `apps/hub/src/routes/activity-fleet.ts`; Modify `apps/hub/src/index.ts` (mount); Test `apps/hub/src/routes/activity-fleet.test.ts`.

**Interfaces — Consumes:** `stationAudit` (`apps/hub/src/db/schema/audit.ts`), `db`, the auth `c.get("user")` pattern (see `station-activity.ts`). **Produces:** `GET /api/activity` → the caller's most recent `station_audit` rows (already sanitized — `paramsSummary`, no content/tokens), newest-first, bounded.

- [ ] **Step 1: Failing test** — `activity-fleet.test.ts` (mirror `station-activity.test.ts` DB setup; insert station_audit rows for two users): `GET /api/activity` as user A → returns only A's rows, newest-first, length ≤ the limit; user B's rows excluded; unauthenticated → 401. RED.
- [ ] **Step 2: Implement** — `activity-fleet.ts`:
```ts
export const fleetActivityRoutes = new Hono().get("/activity", async (c) => {
  const user = c.get("user") as AuthUser | undefined;
  if (!user || user.id === "anonymous") return c.json({ error: "Unauthorized" }, 401);
  const rows = await db.select().from(stationAudit)
    .where(eq(stationAudit.userId, user.id))
    .orderBy(desc(stationAudit.createdAt))
    .limit(30);
  return c.json(rows);
});
```
Mount in `index.ts` in the authenticated section: `.route('/api', fleetActivityRoutes)` (so the path is `/api/activity`; confirm the mount style matches neighbors).
- [ ] **Step 3: GREEN** — `cd apps/hub && bun test activity-fleet` (+ existing suites green).
- [ ] **Step 4: Commit** — `feat(hub): GET /api/activity fleet-wide recent audit`

---

## Task 3: Fleet Activity Ticker

**Files:** Create `apps/console/src/lib/components/fleet/activity-ticker.svelte` (from `news-ticker.svelte`); Modify `apps/console/src/lib/api/client.ts`, `apps/console/src/lib/components/fleet/NodesOverview.svelte`; Test `apps/console/src/lib/components/fleet/activity-ticker.svelte.test.ts`.

**Interfaces — Consumes:** `GET /api/activity` (Task 2). **Produces:** `listFleetActivity()` client fn; `<ActivityTicker>` on the fleet home.

- [ ] **Step 1: Client** — `client.ts`: `export const listFleetActivity = () => http<AuditRow[]>("/api/activity")` (define a minimal `AuditRow` type: `{ id, stationKey, verb, result, paramsSummary, createdAt }` — match the hub rows).
- [ ] **Step 2: Failing test** — `activity-ticker.svelte.test.ts` (mock `$lib/api/client`): `listFleetActivity()`→2 rows → the ticker renders 2 formatted item strings (e.g. contains the verb + station); empty → the component renders nothing (or is hidden). RED.
- [ ] **Step 3: Implement** — copy `news-ticker.svelte` → `fleet/activity-ticker.svelte`; keep its marquee animation + `items: string[]` rendering; add an `onMount` that calls `listFleetActivity()` and maps rows → strings (`${verb} · ${stationKey.split(":")[0]} · ${relativeTime(createdAt)}`); hide when no items. Render `<ActivityTicker />` on the fleet home (in `NodesOverview.svelte`, above the node grid).
- [ ] **Step 4: GREEN** — `pnpm test activity-ticker` + `pnpm check` + `pnpm build`.
- [ ] **Step 5: Commit** — `feat(console): fleet activity ticker (repurpose news-ticker)`

---

## Task 4: Connect banner + animated polish

**Files:** Create `apps/console/src/lib/components/fleet/connect-banner.svelte` (from `onboarding-banner.svelte`); Modify `apps/console/src/lib/components/fleet/NodesOverview.svelte`; reuse `lib/components/lottie-icon.svelte`; Test `connect-banner.svelte.test.ts`.

**Interfaces — Produces:** `<ConnectBanner>` shown on the fleet home when there are zero nodes.

- [ ] **Step 1: Failing test** — `connect-banner.svelte.test.ts`: renders a "connect your first node" heading + a "Create enrollment token" CTA; clicking the CTA fires the passed `onCreateToken` callback. RED.
- [ ] **Step 2: Implement** — copy `onboarding-banner.svelte` → `fleet/connect-banner.svelte`; restyle to "Connect your first node" + the create-token CTA (prop `onCreateToken`); use `ui/*` + the cyber theme + (optionally) a `lottie-icon` animation. In `NodesOverview.svelte`, when `nodes.length === 0` render `<ConnectBanner onCreateToken={...}>` in place of (or enriching) the current bare empty state; wire its CTA to the existing create-token flow. Keep a `lottie-icon` on the loading/empty state for subtle polish.
- [ ] **Step 3: GREEN** — `pnpm test connect-banner NodesOverview` + `pnpm check` + `pnpm build`.
- [ ] **Step 4: Commit** — `feat(console): connect-first-node banner + animated polish (repurpose onboarding-banner/lottie)`

---

## Task 5: Retire dead legacy console code + management-api

**Files:** Delete (console) `lib/chat/`, `routes/projects/`, `routes/workflows/`, `routes/legacy/`, `lib/voice/`(verify), `lib/components/workflow/`, `lib/components/session-forks/`, `lib/components/{project-animated-icon,project-icon-picker,sandbox-not-running,quick-task-modal,news-ticker,onboarding-banner}.svelte` (the last three are now superseded by the repurposed copies), `lib/stores/{sandboxes,session-activity,session-forks,session-status,project-icons,workflows,quick-task}.svelte.ts`; Modify `apps/console/src/routes/settings/+page.svelte`, `apps/console/src/lib/components/app-shell.svelte`; Delete (root) `management-api/`.

**Interfaces — Consumes:** Tasks 1–4 must be merged first (they un-wire the layout + supersede the repurposed components).

- [ ] **Step 1: Verify `lib/voice` ownership** — `grep -rl "lib/voice" apps/console/src --include=*.svelte --include=*.ts | grep -v lib/voice/` → if only `lib/chat` references it, it's chat-only (delete with chat); if anything kept references it, leave it + note. Record the finding.
- [ ] **Step 2: Un-wire settings** — `settings/+page.svelte:12` imports `{ sandboxes, fetchSandboxes } from "$lib/stores/sandboxes.svelte"`. Remove that import + the settings section that renders sandboxes (the OpenCode-sandbox settings block). Keep the rest of settings intact. `pnpm check` settings compiles.
- [ ] **Step 3: Drop the Legacy nav link** — in `app-shell.svelte`, remove the "Legacy" link (the `/projects` affordance) — its target is being deleted.
- [ ] **Step 4: Delete** — remove the files/dirs listed above (console legacy + the now-superseded `quick-task-modal`/`news-ticker`/`onboarding-banner` originals + their stores) and `management-api/`. Use `git rm -r`.
- [ ] **Step 5: Resolve dangling references** — `cd apps/console && pnpm check` → fix every "cannot find module" by removing the now-dead import/usage (these should only be in deleted files or the un-wired touchpoints; if a KEEP file references a deleted symbol, that's a missed dependency — handle it). Repeat until `pnpm check` is clean.
- [ ] **Step 6: GREEN** — `pnpm check` (0 errors), `pnpm test` (full console suite green — deleted tests go with their code), `pnpm build` (clean static output). Confirm `routes/{projects,workflows,legacy}` 404 / are gone and the app still loads (fleet home, nodes, station, settings, login).
- [ ] **Step 7: Commit** — `chore(console): retire legacy OpenCode UI (chat/projects/workflows/stores) + orphaned management-api`

---

## Self-Review

- **Spec coverage:** command palette (T1), `/api/activity` (T2) + ticker (T3), connect banner + polith (T4), retirement + management-api + un-wiring + Legacy-nav-link (T5). Boundaries (keep page-header/ui/app-shell/fleet/P4; hub-side deferred) honored — only T2 touches the hub, additively. Workflows leaves AgentPod (T5 deletes the console routes; the hub workflow backend is Phase 2). ✓
- **Placeholder scan:** none — exact files, the store/route code, the delete list, the un-wire targets (`settings/+page.svelte:12`, the `+layout` Cmd-K lines, the Legacy nav link), and the `pnpm check`/`build` gates. The two "verify" items (voice ownership, settings section) have concrete grep/remove steps, not vague directives.
- **Type/name consistency:** `commandPalette` store (T1) used in `+layout` (T1) consistently; `listFleetActivity`/`AuditRow` (T3) consume `/api/activity` (T2); the repurposed components live under `lib/components/fleet/` while their originals are deleted in T5 (no name clash — different paths); T5 deletes `quick-task.svelte.ts` which T1 already stopped importing.
- **Ordering:** T1–T4 (repurpose + un-wire the layout) precede T5 (delete) so nothing live imports a deleted file; T5 explicitly gates on `pnpm check`/`build` to catch any dangling reference.
