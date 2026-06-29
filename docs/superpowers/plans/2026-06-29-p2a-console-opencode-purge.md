# P2a — Console OpenCode/Tauri Purge — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all OpenCode-era / Tauri-coupled code from the console so every reachable route is web-safe (no `invoke` landmines), while keeping the fleet console 100% working.

**Architecture:** Rewrite the two reachable importers (`/settings`, `/admin/users/[id]`) as minimal fleet pages **first** (so nothing live imports the legacy), **then** delete the dead Tauri layer + orphaned OpenCode api/stores/components. Mirrors the LR Phase-1 ordering (rewrite/un-wire → delete → gate on check/build).

**Tech Stack:** SvelteKit (Svelte 5 runes), adapter-static SPA, bits-ui, Tailwind 4, vitest.

**Spec:** `docs/superpowers/specs/2026-06-29-p2a-console-opencode-purge-design.md`

## Global Constraints

- Console dir: `apps/console`. Run tooling from there: `pnpm check`, `pnpm test`, `pnpm build`.
- **Hard keep-boundary (never delete/break):** `lib/api/{client,connection-web,terminal,admin}.ts`; `lib/stores/{app-state,auth,command-palette,connection,nodes,stations,unseen-completions}.svelte.ts`; `lib/components/{app-shell,command-palette,error-alert,file-icon,page-header,theme-picker,theme-settings,theme-toggle,lottie-icon}.svelte` + all `lib/components/fleet/*` + all `lib/components/stations/*`; routes `/`,`nodes`,`login`,`setup`,`admin`.
- Auth via cookie; no Tauri, no Bearer. Web fetch only (`credentials: "include"`), per `lib/api/client.ts` / `lib/api/admin.ts`.
- Each task ends green: `pnpm check` **0 errors** (3 pre-existing autofocus warnings OK) + relevant `pnpm test`.
- Recoverable from git history + the `v0.0.4-opencode` tag.

---

### Task 1: Rewrite `/settings` as a minimal fleet Settings page

**Files:**
- Rewrite: `apps/console/src/routes/settings/+page.svelte` (currently OpenCode: LLM providers / instructions / files / voice / mcp tabs).
- Test: `apps/console/src/routes/settings/page.svelte.test.ts` (create).

**Interfaces (use these, all already exist):**
- `import { auth, logout } from "$lib/stores/auth.svelte"` — `auth.user` = `{ id, email, name, role } | null`; `logout(): Promise<void>`.
- `import { connection, disconnect } from "$lib/stores/connection.svelte"` — `connection.apiUrl: string|null`, `connection.isConnected: boolean`; `disconnect(): Promise<void>`.
- `import ThemeSettings from "$lib/components/theme-settings.svelte"` — render as `<ThemeSettings />` (keep).
- `import PageHeader from "$lib/components/page-header.svelte"`, `Button`, `Label` from `$lib/components/ui/*`, `goto` from `$app/navigation`.

**Must NOT import** any §2 deletion (no `llm-providers-settings`, `voice-settings`, `mcp-settings`, `lib/stores/settings`, `lib/api/tauri`, etc.).

**Page content (three sections, simple cards/sections — match the cyber theme + login-page style):**
1. **Appearance** — `<ThemeSettings />`.
2. **Connection** — show `connection.apiUrl` ("Connected: …"); a **Use different server** button → `disconnect()` then `goto("/setup")`.
3. **Account** — show `auth.user?.name` / `auth.user?.email` / `auth.user?.role`; a **Sign out** button → `logout()` then `goto("/login")`.

- [ ] **Step 1 — failing test.** Create `settings/page.svelte.test.ts`: mock `$lib/stores/auth.svelte` (`auth.user = {email:'a@b.c',name:'A',role:'admin'}`, `logout` vi.fn) + `$lib/stores/connection.svelte` (`connection.apiUrl='https://hub.x'`, `disconnect` vi.fn) + `$app/navigation` (`goto` vi.fn); render the page; assert it shows the email `a@b.c`, the hub URL `https://hub.x`, and a "Sign out" button. Run `pnpm test settings` → FAIL (page still OpenCode / imports removed deps).
- [ ] **Step 2 — rewrite the page** per the content above. Delete all OpenCode imports/markup; keep only the three sections.
- [ ] **Step 3 — green.** `pnpm test settings` PASS; `pnpm check` 0 errors.
- [ ] **Step 4 — commit.** `feat(console): minimal fleet Settings (appearance + connection + account) — drop OpenCode settings (P2a T1)`

---

### Task 2: Rewrite `/admin/users/[id]` as a minimal fleet user-detail

**Files:**
- Rewrite: `apps/console/src/routes/admin/users/[id]/+page.svelte` (currently OpenCode: user sandboxes + resource-tier limits via `listResourceTiers` from `$lib/api/tauri`).
- Test: `apps/console/src/routes/admin/users/[id]/page.svelte.test.ts` (create).

**Interfaces (web admin client — already migrated to fetch+cookie in `60a8802`):**
- `import { getUser, banUser, unbanUser, updateUserRole } from "$lib/api/admin"` — verify exact exported names in `lib/api/admin.ts`; `getUser(id)` → `{ user: AdminUserView }`, `banUser(id, reason?)`, `unbanUser(id)`, `updateUserRole(id, role)`. Use only functions that exist there; do NOT import `$lib/api/tauri` or `listResourceTiers`.
- `AdminUserView`, `UserRole` from `@agentpod/types`.
- `page` from `$app/state` for the `[id]` param.

**Page content (minimal):** user name/email/role/status (banned?), created date; a **role toggle** (user↔admin via `updateUserRole`); **Ban/Unban** (via `banUser`/`unbanUser`); a back link to `/admin`. **Drop** the sandboxes list + resource-tier limits sections entirely (OpenCode; the hub routes go in P2b).

- [ ] **Step 1 — failing test.** Create the test: mock `$lib/api/admin` (`getUser` resolves `{user:{id:'u1',email:'u@x',name:'U',role:'user',banned:false,createdAt:...}}`, `updateUserRole`/`banUser`/`unbanUser` vi.fn) + `$app/state` (`page.params.id='u1'`); render; assert it shows `u@x` and a Ban + a role control; assert it does NOT import tauri. Run `pnpm test "users"` → FAIL.
- [ ] **Step 2 — rewrite the page** per the content; remove the `$lib/api/tauri` import + sandbox/resource-tier sections.
- [ ] **Step 3 — green.** `pnpm test "users/\[id\]"` (or the file path) PASS; `pnpm check` 0 errors.
- [ ] **Step 4 — commit.** `feat(console): minimal fleet admin user-detail (info/role/ban) — drop OpenCode sandboxes/tiers (P2a T2)`

---

### Task 3: Delete the dead Tauri layer + orphaned OpenCode console code

**Pre-check (Step 1):** with T1/T2 merged, grep confirms nothing kept still imports the delete list.

```bash
cd apps/console
# Each of these must now return ZERO hits from KEEP files before deleting:
grep -rn "api/tauri\|browser-sse\|api/mcp\|api/onboarding" src --include=*.svelte --include=*.ts | grep -v -E "src/lib/api/(tauri|browser-sse|mcp|onboarding)"
grep -rn "stores/(git|preview|terminals|onboarding|settings)\b" src
grep -rnE "(addon|agent|agent-team|model|model-agent|flavor|llm-provider|resource-tier|provider|provider-config)-?selector|llm-providers-settings|mcp-settings|voice-settings|wakeword-toggle|animated-icon-picker|file-picker-modal|provider-config-modal" src --include=*.svelte | grep -vE "src/lib/components/"
```
Any straggler importer → fix it (re-point to a kept module or remove the usage) before proceeding.

**Files to delete (`git rm`):**
- api: `lib/api/tauri.ts`, `lib/api/browser-sse.ts`, `lib/api/mcp.ts`, `lib/api/onboarding.ts`
- stores: `lib/stores/git.svelte.ts`, `lib/stores/preview.svelte.ts`, `lib/stores/terminals.svelte.ts`, `lib/stores/onboarding.svelte.ts`, `lib/stores/settings.svelte.ts` (+ any `*.test.ts` for these)
- components: `lib/components/{addon-selector,agent-selector,agent-team-selector,animated-icon-picker,file-picker-modal,flavor-selector,llm-provider-selector,llm-providers-settings,mcp-settings,model-agent-sheet,model-selector,provider-config-modal,provider-selector,resource-tier-selector,voice-settings,wakeword-toggle}.svelte`

**Un-wire stragglers:**
- `routes/+layout.svelte`: remove the dead `initMcpDebugTools()` / `import("tauri-plugin-mcp")` branch (gated on `__TAURI_INTERNALS__`, dead in web).
- `routes/setup/+page.svelte`: verify it imports no deleted `onboarding`/`tauri` module; re-point to the `connection` store if it does.

- [ ] **Step 1** — run the pre-check greps; fix any straggler importer.
- [ ] **Step 2** — `git rm` the delete list; remove the `+layout.svelte` Tauri-debug branch.
- [ ] **Step 3** — `pnpm check` → resolve every dangling import until **0 errors**.
- [ ] **Step 4** — `pnpm test` (full) green + `pnpm build` clean.
- [ ] **Step 5** — confirm `grep -rn "tauri" src` shows only inert refs (no value import / reachable `invoke`; `@xterm`/comments OK).
- [ ] **Step 6 — commit.** `chore(console): delete dead Tauri layer + orphaned OpenCode components/stores/api (P2a T3)`

---

### Task 4: Live verification (post-merge + deploy)

After T1–T3 merge to `develop`→`main` and the console is rebuilt + redeployed to Cloudflare Pages:
- [ ] Sign in at `console.agentpod.dev`; **fleet loads**; enroll/drive a station still works.
- [ ] `/settings` renders the three sections; "Sign out" + "Use different server" work.
- [ ] `/admin` user-list loads; `/admin/users/<id>` (View) loads with role/ban controls.
- [ ] Browser console shows **no `invoke` / "reading 'invoke'" errors** on any route.

## Self-review

- **Spec coverage:** §2 delete → T3; §3 settings rewrite → T1; §4 admin-detail → T2 (upgraded to minimal rebuild since it's OpenCode-heavy); §5 keep-boundary → Global Constraints; §6 risks (dangling imports, setup deps, +layout) → T3 Steps 1–2 + un-wire; verification → T4. ✓
- **Ordering:** T1/T2 (rewrite importers) precede T3 (delete) so nothing live imports a deletion. ✓
- **Type consistency:** admin client function names (`getUser`/`banUser`/`unbanUser`/`updateUserRole`) must be verified against `lib/api/admin.ts` exact exports in T2 Step 2 (noted). ✓
