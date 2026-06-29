# Legacy Retirement + UI Repurpose (Design Spec)

**Status:** Approved (brainstorm 2026-06-29). Console-focused; hub-side OpenCode retirement explicitly deferred.
**Builds on:** the UI unification (which *demoted* the OpenCode pages, "retire later") + P4. The fleet console now stands on its own, so it's time to remove the legacy OpenCode console code — and **salvage its good UI patterns** into fleet features rather than just deleting them.
**Branch:** `redesign/fleet-console`.

## 1. Goal & Scope

Shrink the repo to the fleet-console product and improve the UI by **repurposing** three legacy OpenCode UI patterns into fleet features, while **deleting** the rest of the legacy OpenCode *console* code.

**In scope (console only, + one small hub endpoint):**
1. **Fleet Command Palette (Cmd-K)** — repurpose `quick-task-modal`.
2. **Fleet Activity Ticker** — repurpose `news-ticker` + a new `GET /api/activity` (fleet-wide recent audit).
3. **Connect banner + animated polish** — repurpose `onboarding-banner` + `lottie-icon`.
4. **Retire dead legacy console code** — delete the OpenCode client UI not being repurposed.

**Out of scope (deferred — keeps this focused):**
- **Hub-side OpenCode retirement** — `sandboxes` routes/tables, chat schema/routes, the `workflows` *backend* routes/schema, the v2 opencode endpoints. They become unused once the console UI is gone but stay (harmless) for a later, separate hub-cleanup slice. The Cloudflare/Docker **provider + orchestrator are reused by P4** and must NOT be touched. The only hub change here is the **additive** `/api/activity` endpoint.
- **Workflows as an AgentPod feature** — work orchestration is **kaambaan's** domain (pivot non-goal). The OpenCode workflow builder is removed from AgentPod's console; it's recoverable from git history + the `v0.0.4-opencode` tag for kaambaan to mine. No fleet-console workflow feature.
- Net-new features beyond the three repurposes (no "maintenance automation", etc.).

**Recoverability:** everything deleted is preserved in git history + the `v0.0.4-opencode` tag.

## 2. Feature — Fleet Command Palette (Cmd-K)

Transform `lib/components/quick-task-modal.svelte` (317 lines, already on `ui/dialog` + keyboard handling) into a fleet command palette:
- A new `lib/stores/command-palette.svelte.ts` (replaces `quick-task.svelte.ts`): `isOpen`, `open()/close()/toggle()`.
- `+layout.svelte`: replace the `quickTask` import + `<QuickTaskModal>` with the command store + `<CommandPalette>`; keep the existing **Cmd/Ctrl-K** global keydown (already in the layout) → `commandPalette.toggle()`.
- The palette: a search input + a fuzzy-filtered list of **destinations** (each node, each adopted station — fetched via the existing `listNodes`/station APIs) and **actions** (New runtime, Create enrollment token, go to Fleet/Settings). Selecting navigates (`goto`) or invokes the action. Arrow-key navigation + Enter, Esc closes.
- Reuse `ui/dialog`, `ui/input`, the cyber theme; mine the existing modal's keyboard/focus handling.

## 3. Feature — Fleet Activity Ticker

Transform `lib/components/news-ticker.svelte` (242 lines, prop-driven `items: string[]` marquee) into a fleet activity ticker on the fleet home:
- **Hub (additive):** `GET /api/activity` — returns the most recent `station_audit` rows across the **caller's** stations (join `station_audit` → `stations` by `userId`, order by time desc, bounded limit e.g. 30). Reuse the audit sanitizer (never returns content/tokens — same allowlist as the per-station activity route). New route file `apps/hub/src/routes/activity-fleet.ts` (do not disturb the existing per-station `station-activity.ts` or the legacy user-`activity.ts`).
- **Console:** `client.ts` `listFleetActivity()`; the fleet home (`NodesOverview` or the home page) renders `<ActivityTicker>` (the repurposed news-ticker) fed by formatted activity strings (e.g. `verb · station · relative-time`). Hidden when there's no activity.

## 4. Feature — Connect banner + animated polish

- Repurpose `onboarding-banner.svelte` → a **"connect your first node"** banner shown on the fleet home when there are zero nodes (richer than the current bare empty state; includes the create-token CTA).
- Repurpose `lottie-icon.svelte` for animated empty/loading states (fleet home empty state, skeletons). Light polish; keep it subtle.

## 5. Retirement — delete the dead legacy console code

Delete (not repurposed):
- Routes: `routes/projects/*`, `routes/workflows/*`, `routes/legacy/*`.
- `lib/chat/*` (assistant-ui React-in-Svelte — AgentPod is *no chat*); `lib/voice/*` **iff** it's chat-only (verify in the plan).
- Components: `project-animated-icon`, `project-icon-picker`, `sandbox-not-running`, `session-forks/`, `workflow/` (and `quick-task-modal`, `news-ticker`, `onboarding-banner`, `lottie-icon` are **transformed**, not deleted — §2–4).
- Stores: `sandboxes`, `session-activity`, `session-forks`, `session-status`, `project-icons`, `workflows` (and `quick-task` → replaced by `command-palette`).
- **Un-wire:** `+layout.svelte` (QuickTaskModal/quickTask → command palette); the legacy import in `settings/+page.svelte`; the **"Legacy" nav link** in `app-shell` (its `/projects` target is gone).
- **Repo-root cruft:** delete the orphaned `management-api/` directory — a leftover from the Turborepo restructure (the API became `apps/hub`); it's not a workspace member, isn't referenced anywhere, and holds only two stale OpenCode-era test files (`agent-auth.test.ts`, `agent-session.test.ts`). (Verify no other root-level orphans in the plan.)

**Keep (hard boundary):** `page-header`, all `ui/*`, `app-shell`, `stores/{auth,connection,settings}`, `api/client`, routes `nodes`/`login`/`admin`/`settings`/`setup`, and all P4/fleet code.

## 6. Testing

- Existing `apps/console` vitest suites stay green; the deleted code's tests are removed with it; new components (CommandPalette, ActivityTicker) get unit tests (palette: filters + selecting an item navigates/acts; ticker: renders items, hidden when empty).
- Hub: `/api/activity` test (returns the caller's recent audit, owner-scoped, sanitized, bounded; cross-user excluded).
- `pnpm check` + `pnpm build` clean (no dangling imports after deletion — the un-wiring must be complete).
- Final visual pass: Cmd-K palette, the ticker on the home, the connect banner/empty state.

## 7. Risks & Open Items

- **Dangling imports after deletion** — the highest risk; a deleted store/component still imported somewhere breaks the build. Mitigation: delete + un-wire in the same task; `pnpm check`/`build` gate each deletion.
- **`lib/voice` ownership** — verify it's chat-only before deleting (the plan checks importers).
- **`settings/+page.svelte` legacy import** — identify the exact legacy symbol it pulls and either drop the feature or re-point it; must not break settings.
- **Command palette data volume** — fetch nodes/stations lazily/on-open; cap the list; don't block the UI.
- **Activity ticker scope** — `/api/activity` is the only backend; keep it small + owner-scoped + sanitized (no content/token leakage), mirroring the per-station audit route.
- **Scope discipline** — no hub-side deletions in this phase (only the `/api/activity` add); no net-new features beyond the three repurposes.
