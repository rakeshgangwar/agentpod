# UI Fix Sweep — audit findings remediation (Design Spec)

**Status:** Approved (brainstorm 2026-06-30).
**Branch:** `develop` (merge `develop`→`main`).
**Context:** Remediate the P1 + high-value findings from `docs/UI-UX-AUDIT-2026-06-29.md`. Decisions: **outline status badges** (theme-robust) and a **full admin re-skin to the app-shell**.

## 1. Goal & Scope

Fix the audit's should-fix issues so the console is consistent, legible across all 20 schemes, and free of remaining OpenCode vestiges. Console only.

## 2. Group A — Status badges → outline pattern (F15)

Today status badges hardcode fills (e.g. `HealthPanel.svelte:119` = `bg-chart-2 text-chart-2` → invisible; `NodesOverview:229` = `bg-chart-2 text-black` → not robust on dark schemes). Standardize **all** status badges to a **theme-robust outline pattern**: colored text + colored border + subtle tint bg, e.g. `text-chart-2 border-chart-2 bg-chart-2/10`. The label (colored text on the page background) stays legible under every scheme.
- **Add a single helper** `statusBadgeClass(status)` (in `lib/utils` or a small `status-badge` component) mapping status → token: running/online/healthy → `chart-2`; error/unhealthy → `destructive`; starting/stopping/warning → `chart-4`; sleeping → `chart-5`; stopped/offline → `muted-foreground`. Use it in: `HealthPanel`, `NodesOverview`, `StationTree`, the **Terminal** connection chip, and any other status pill. No hardcoded `text-black/white` on token bgs.

## 3. Group B — Onboarding (F2, F5)

- **F2:** `connect-banner.svelte` — replace the stale `agentpod-node enroll --hub <hub-url> --token <token>` line with the curl one-liner: `curl -fsSL https://github.com/rakeshgangwar/agentpod/releases/latest/download/install.sh | sudo bash -s -- <hub-url> <token>` (single source of truth with the generated-token flow).
- **F5:** add a **copy-to-clipboard button** on the generated enrollment command/token (in `NodesOverview` create-token output) — `navigator.clipboard.writeText` + a brief "copied" confirmation. (Optionally also on the banner's example.)

## 4. Group C — Full admin re-skin to the app-shell (F9–F12)

Rebuild the admin pages to match the Fleet/Settings chrome + design language (sidebar app-shell + `page-header` + `[bracket]`/`//` motifs + the standard card/section styling). Specifically:
- **Drop the admin's bespoke header** (the big "Admin Panel" hero, the duplicate theme-toggle row, the "collapse header" control). Use the standard `page-header` pattern like Settings (title + `// …` subtitle).
- **Remove the Agents tab + delete `routes/admin/agents/`** (agents retired in P2b). With Agents gone, drop the tab bar (Users is the view) — or keep a minimal in-page nav only if another section (audit log) warrants it.
- **Remove the "Sandboxes" column** from the user table (vestigial, always 0).
- **Fix copy:** subtitle no longer mentions "resource limits."
- **Keep** all functional admin: user list (search/filter), role change, ban/unban, create-user, public-signup toggle, admin audit log; and the already-minimal `admin/users/[id]` (align its chrome to the re-skin too).

## 5. Group D — Auth: session-expiry redirect (F1)

A 401 from a data call (expired/invalidated session) must send the user to `/login`, not render the shell + errors. Add **global 401 handling**: in `api/client.ts`'s `http()` (and `api/admin.ts`'s `apiRequest`), on `res.status === 401` clear the auth session and redirect to `/login` (e.g. throw a typed `UnauthorizedError` that a single handler — or the fetch wrappers — turns into `clearAuthSession()` + `goto('/login')`). Avoid redirect loops on the `/login` + `/setup` public routes.

## 6. Optional P2 quick wins (fold in if cheap)

- **F4:** center/constrain the empty-fleet state (less dead space).
- **F6:** render the generated token result in/replacing the banner (not above it).
- **F13:** add mobile top padding to page headers.
- **F17:** `title` attr (tooltip) on truncated workspace paths in node-detail cards.

## 7. Risks & verification

- **Visual regression** across the changed screens + the 20 schemes — verify the outline badges + admin re-skin via Playwright on **Neutral + a dark scheme** × the changed screens (fleet, station health/terminal, admin, connect-banner). Badges legible under both.
- **401 redirect loop** — must exclude `/login`/`/setup`; test by hitting a page with an expired session → lands on `/login` once.
- **Admin functionality intact** — user list/role/ban/create/signup-toggle/audit still work after the re-skin (no API changes; chrome only). `routes/admin/agents` deletion leaves no dangling import.
- **Gate:** `pnpm check` 0 + `pnpm test` green + `pnpm build` clean; `grep -rn "agents" apps/console/src/routes/admin` clean of the removed route; live Playwright pass.

## 8. Success criteria

All status badges legible under every scheme (outline pattern); connect-banner shows the curl one-liner + a working copy button; admin looks like the rest of the console (no bespoke header / theme-toggle / Agents tab / Sandboxes column / "resource limits" copy) with all admin functions intact; an expired session redirects to `/login`; check/test/build green; no visual regressions.
