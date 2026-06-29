# P2a — Console OpenCode/Tauri Purge (Design Spec)

**Status:** Approved (brainstorm 2026-06-29). First of three Phase-2 sub-projects.
**Branch:** `develop` (work on `redesign/fleet-console`, merge to `develop`→`main`).
**Context:** v0.1.0 shipped, but the console still carries OpenCode-era code coupled to a dead **Tauri** layer (`$lib/api/tauri.ts`, 2,009 lines). Its `invoke()` is `undefined` in the web build, so every legacy page that touches it throws `Cannot read properties of undefined (reading 'invoke')`. The fleet core (nodes/stations/terminal/fs/logs/runtimes/admin-user-list) is already web-clean; this purge removes the rest.

## 1. Goal & Scope

Make the console **fully web-safe** — zero Tauri `invoke` landmines, no OpenCode-era UI — while keeping the fleet console 100% working.

**In scope (console only):**
1. Delete the dead Tauri layer + OpenCode-era api/stores/components.
2. Rewrite `/settings` as a **minimal fleet Settings** page.
3. Rewrite `/admin/users/[id]` to use the web admin client (no Tauri).

**Out of scope (later Phase-2 sub-projects):** P2b hub OpenCode backend retirement (#135), P2c infra (`docker/`, `cloudflare/worker`, Tauri rust/`tauri-plugin-mcp`, `config/`) (#136–139). This sub-project does **not** touch the hub or repo-root infra. The OpenCode hub routes keep running (unused) until P2b.

**Recoverability:** everything deleted is in git history + the `v0.0.4-opencode` tag.

## 2. Delete — dead Tauri layer + OpenCode-era console code

Verified: **no fleet/station/route code that survives imports any of these** (only the OpenCode `/settings` page + `/admin/users/[id]`, both rewritten here, reference them).

- **api:** `lib/api/tauri.ts`, `lib/api/browser-sse.ts`, `lib/api/mcp.ts`, `lib/api/onboarding.ts`.
- **stores:** `lib/stores/{git,preview,terminals,onboarding,settings}.svelte.ts` (OpenCode local-terminal/git/preview/onboarding + the OpenCode settings store).
- **components:** `addon-selector`, `agent-selector`, `agent-team-selector`, `animated-icon-picker`, `file-picker-modal`, `flavor-selector`, `llm-provider-selector`, `llm-providers-settings`, `mcp-settings`, `model-agent-sheet`, `model-selector`, `provider-config-modal`, `provider-selector`, `resource-tier-selector`, `voice-settings`, `wakeword-toggle`.

## 3. Rewrite — `/settings` (minimal fleet Settings)

Replace `routes/settings/+page.svelte` (OpenCode: LLM providers / global instructions / sandbox files) with a minimal page composed only of **existing fleet stores/components**:
- **Appearance** — reuse the existing theme mechanism (`theme-settings.svelte` / the theme store used in `+layout.svelte`).
- **Connection** — show the connected hub URL (from the `connection` store) + a "Use different server" action (→ `/setup`), mirroring the login screen.
- **Account** — current user email/name (from the `auth` store) + **Sign out** (existing `auth` sign-out). Account deletion/export is deferred (hub `account` route is Phase-2-pending).

No new OpenCode-coupled imports. The page must not import any §2 deletion.

## 4. Rewrite — `/admin/users/[id]`

`routes/admin/users/[id]/+page.svelte` imports `$lib/api/tauri` (line 28). Re-point all its data calls to `lib/api/admin.ts` (already migrated to web fetch + cookie auth in `60a8802`); remove the Tauri import. The admin user-list (`/admin`, `/admin/users`) already works — this completes the admin section.

## 5. Keep — hard boundary (the fleet console)

- **api:** `client.ts`, `connection-web.ts`, `terminal.ts`, `admin.ts`.
- **stores:** `app-state`, `auth`, `command-palette`, `connection`, `nodes`, `stations`, `unseen-completions`.
- **components:** `app-shell`, `command-palette`, `error-alert`, `file-icon`, `page-header`, `theme-*` (picker/settings/toggle), `lottie-icon`, all `fleet/*`, all `stations/*`.
- **routes:** `/` (+page/+layout), `nodes`, `login`, `setup`, `admin` (+ the rewritten `admin/users/[id]`), the rewritten `settings`.

## 6. Risks & verification

- **Dangling imports** (the top risk, as in LR Phase 1): a kept file importing a deleted one breaks the build. Mitigation — delete + rewrite (§3/§4) in the same change; **`pnpm check` (0 errors) + `pnpm build` gate**. Resolve any straggler importer the grep didn't predict before completing.
- **`setup` route deps:** verify `routes/setup` (the hub-connect screen) does **not** import the deleted `onboarding` store/api; if it does, re-point to the `connection` store. `setup` is fleet (kept).
- **`+layout.svelte`:** confirm it imports no §2 deletion (it referenced a Tauri MCP-debug dynamic import behind `__TAURI_INTERNALS__` — that dead branch may be removed too; it's already gated off in the web build).
- **Tests:** existing `apps/console` vitest suites stay green (deleted code's tests removed with it); a focused test for the new minimal Settings (renders theme/connection/account, no crash). `pnpm check` + `pnpm test` + `pnpm build` all clean.
- **Live E2E (post-merge/deploy):** the proven fleet flow still works — sign in, fleet loads, enroll/drive a station, **`/settings` renders**, **`/admin` + `/admin/users/[id]` load** with no console `invoke` errors.

## 7. Success criteria

`grep -rn "tauri" apps/console/src` returns only inert references (no value imports / `invoke` calls reachable from the app); `pnpm check`/`test`/`build` green; the live console has zero `invoke` errors on every reachable route.
