# UI Fix Sweep — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Remediate the P1 + high-value UI/UX audit findings: theme-robust outline status badges, onboarding fixes (curl command + copy button), a full admin re-skin to the app-shell, and a session-expiry redirect.

**Architecture:** Three independent fix tasks (different file sets → parallelizable) + a driver-run visual verification. T1 stations/fleet/onboarding, T2 admin re-skin, T3 auth-401.

**Tech Stack:** SvelteKit (Svelte 5 runes), Tailwind 4 (`@theme inline` tokens), vitest.

**Spec:** `docs/superpowers/specs/2026-06-30-ui-fix-sweep-design.md`. **Audit:** `docs/UI-UX-AUDIT-2026-06-29.md`.

## Global Constraints

- Console dir: `apps/console`. Gate each task: `pnpm check` 0 errors (3 pre-existing autofocus warnings OK) + relevant `pnpm test` + `pnpm build`.
- **Outline badge pattern:** `text-<token> border-<token> bg-<token>/10` (colored text+border, subtle tint) — never bg+text the same token, never hardcoded `text-black/white` on a token bg.
- Status→token map: running/online/healthy → `chart-2`; error/unhealthy → `destructive`; starting/stopping/warning → `chart-4`; sleeping → `chart-5`; stopped/offline → `muted-foreground`.
- Keep the cyber aesthetic + `[bracket]`/`//` motifs; match Fleet/Settings chrome.
- No API/contract changes (chrome + client only).

---

### Task 1: Outline status badges + onboarding (Groups A + B)

**Files:**
- Create: `apps/console/src/lib/utils/status-badge.ts` (the helper) + test `…/status-badge.test.ts`.
- Modify: `lib/components/stations/HealthPanel.svelte` (line ~119), `lib/components/fleet/NodesOverview.svelte` (status badge ~229 + the create-token output), `lib/components/stations/StationTree.svelte`, `lib/components/stations/Terminal.svelte` (connection chip), `lib/components/fleet/connect-banner.svelte`.

**1a — badge helper (A):**
- [ ] **Step 1 — failing test.** `status-badge.test.ts`: `statusBadgeClass('running')` → contains `text-chart-2 border-chart-2 bg-chart-2/10`; `statusBadgeClass('error')` → `destructive`; `statusBadgeClass('stopped')` → `muted-foreground`. Run `pnpm test status-badge` → FAIL.
- [ ] **Step 2 — implement** `export function statusBadgeClass(status: string): string` mapping per the Global status→token map (normalize synonyms: online/running/healthy→chart-2, offline/stopped→muted-foreground, error/unhealthy→destructive, starting/stopping/warning→chart-4, sleeping→chart-5; default muted). Each returns `"text-<t> border-<t> bg-<t>/10"`.
- [ ] **Step 3 — green** `pnpm test status-badge`.
- [ ] **Step 4 — apply** the helper at every status pill: HealthPanel:119 (replace `bg-chart-2 text-chart-2 …`), NodesOverview node-status (~229, replace `bg-chart-2 text-black`), StationTree station status, Terminal connection chip. Remove hardcoded fills.

**1b — onboarding (B):**
- [ ] **Step 5 — F2:** in `connect-banner.svelte` replace the line `agentpod-node enroll --hub <hub-url> --token <token>` with `curl -fsSL https://github.com/rakeshgangwar/agentpod/releases/latest/download/install.sh | sudo bash -s -- <hub-url> <token>`.
- [ ] **Step 6 — F5:** in `NodesOverview.svelte` add a copy button beside the generated enroll command — `onclick={() => navigator.clipboard.writeText(cmd)}` with a 2s "copied ✓" state. (A small `CopyButton` inline is fine.)
- [ ] **Step 7 — gate:** `pnpm check` 0 + `pnpm test` green + `pnpm build` clean.
- [ ] **Step 8 — commit:** `fix(console): outline status badges (legible across schemes) + onboarding curl command + copy button (sweep T1)`

---

### Task 2: Full admin re-skin to the app-shell (Group C, F9–F12)

**Files:** `apps/console/src/routes/admin/+page.svelte`, `apps/console/src/routes/admin/+layout.svelte`, `apps/console/src/routes/admin/users/[id]/+page.svelte`; **delete** `apps/console/src/routes/admin/agents/` (whole dir).

- [ ] **Step 1 — survey:** read the three admin pages + `lib/components/page-header.svelte` + a reference page (`routes/settings/+page.svelte`) for the standard chrome/section pattern.
- [ ] **Step 2 — re-skin `admin/+page.svelte`:** replace the bespoke "Admin Panel" hero + the duplicate theme-toggle row + "collapse header" control with the standard `page-header` (title "Admin" + `// user management` subtitle), rendered in the normal sidebar app-shell like Settings. Remove the **Agents tab** (and the tab bar if Users is the only section); remove the **"Sandboxes" column** from the user table; drop "resource limits" from any subtitle/copy. Style the table/search/filter/create-user/signup-toggle/audit with the standard card/section + `[bracket]` styling. **Keep all functionality** (search, role change, ban/unban, create-user, signup toggle, audit log) — no API changes.
- [ ] **Step 3 — `admin/+layout.svelte`:** keep the `checkIsAdmin` guard + the loading/access-denied states, but ensure children render in the standard shell (no bespoke admin chrome leaking in).
- [ ] **Step 4 — `admin/users/[id]/+page.svelte`:** align its header/sections to the same `page-header`/card pattern (it's already minimal from P2a).
- [ ] **Step 5 — delete** `routes/admin/agents/`; `grep -rn "admin/agents\|/agents" apps/console/src/routes/admin` → no dangling refs (remove any nav link to it).
- [ ] **Step 6 — gate:** `pnpm check` 0 + `pnpm test` green + `pnpm build` clean.
- [ ] **Step 7 — commit:** `feat(console): re-skin admin to the app-shell; remove Agents tab/route + Sandboxes column + stale copy (sweep T2)`

---

### Task 3: Session-expiry → /login redirect (Group D, F1)

**Files:** `apps/console/src/lib/api/client.ts`, `apps/console/src/lib/api/admin.ts`, and the auth store / `routes/+layout.svelte` guard as needed.

- [ ] **Step 1 — failing test** (`client.test.ts` or new): mock `fetch` returning `{ ok:false, status:401 }`; mock `$app/navigation` `goto` + `clearAuthSession`; call a client `http()` → asserts it clears the session + navigates to `/login` (and does NOT when already on `/login`).
- [ ] **Step 2 — implement:** in `client.ts` `http()` and `admin.ts` `apiRequest()`, on `res.status === 401`: call `clearAuthSession()` (from `lib/stores/auth.svelte`) and `goto('/login')` — guarded so it no-ops when `window.location.pathname` starts with `/login` or `/setup` (avoid loops). Still throw so callers stop.
- [ ] **Step 3 — green** the test.
- [ ] **Step 4 — gate:** `pnpm check` 0 + `pnpm test` green + `pnpm build` clean.
- [ ] **Step 5 — commit:** `fix(console): redirect to /login on 401 (session expiry) (sweep T3)`

---

### Task 4: Visual verification (driver-run)

After T1–T3 merge `develop`→`main` + redeploy:
- [ ] Playwright on **Neutral + a dark scheme (e.g. Cyberpunk)** × the changed screens: fleet (badge), station **Health** + **Terminal** (badges legible), **admin** (re-skinned, matches Settings chrome, no Agents/Sandboxes), connect-banner (curl command + copy works).
- [ ] Status badge labels readable under both schemes.
- [ ] Expired-session check: hit a page with no/invalid session → lands on `/login` once (no loop).
- [ ] Admin functions smoke: search, view user, role toggle, signup toggle render/work.
- [ ] Fix any regression → `fix(console): sweep regression — <what>`.

## Self-review

- **Spec coverage:** §2 badges → T1a; §3 onboarding → T1b; §4 admin re-skin → T2; §5 auth → T3; §6 P2s → fold into T1/T2 if cheap (noted, optional); §7 verification → T4. ✓
- **Parallelism:** T1 (stations/fleet/connect-banner), T2 (routes/admin), T3 (lib/api + layout) touch disjoint files → run in parallel; T1 owns NodesOverview (both A+B). ✓
- **Placeholders:** badge pattern + status map + exact strings given; admin re-skin gives the reference (settings) + the keep-list. ✓
