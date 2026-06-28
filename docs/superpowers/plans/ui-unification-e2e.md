# Console UI Unification — Visual + Responsive E2E (runbook)

**Date:** 2026-06-28. **Branch:** `redesign/fleet-console`. **Plan task:** UI.10 (#113).
Screenshots: `docs/superpowers/screenshots/ui-unification/`.

## Stack brought up

- **DB:** fresh `uidemo2` on the local pg container (`:5434`) + `vector` extension. (`docker exec` was failing with a host runc I/O error, so the DB was created over the network via a bun `postgres` script.)
- **Hub:** `bun run src/index.ts` on `:3001`, `DATABASE_URL=…/uidemo2`, `METAMCP_ENABLED=false`, `NODE_ENV=development`. Healthy; signup open.
- **Console:** `pnpm dev` on `:1420`, `PUBLIC_HUB_URL=http://localhost:3001` (Vite/HMR — exercises the re-skinned source live).
- **Node-agent:** rebuilt at the branch head, enrolled against `http://localhost:3001`, `run` — dialed the gateway, showed online. Detected this laptop's harnesses incl. **OpenCode** (the new #103 descriptor).

## Walkthrough (all green)

| # | Step | Result |
|---|---|---|
| 1 | Sign up (fresh DB, first user) on the cyber-card login | ✅ redirected to `/` |
| 2 | Fleet home `/` — empty state | ✅ "No nodes yet" + Create-token CTA |
| 3 | Responsive shell — desktop (1440) | ✅ full sidebar w/ labels (Fleet active, Settings, Legacy) |
| 4 | Create enrollment token | ✅ token + `agentpod-node enroll …` command shown inline |
| 5 | Node-agent connects | ✅ node card "Rakeshs-MacBook-Pro.local · online · arm64 · 8 CPU · darwin" |
| 6 | Node detail (detect/adopt) | ✅ 8 **opencode** leaf stations + claude-code + openclaw composite, harness/kind badges, Adopt / Adopt-all |
| 7 | Adopt the `agentpod` opencode station | ✅ moves to Adopted Stations, links to station page |
| 8 | Station page — Health | ✅ OPENCODE badge, icon tab bar, `<dl>` stat grid (Status=Running green badge, Disk 2.99 GB) |
| 9 | Station — Files | ✅ toolbar + folder-icon tree + preview pane |
| 10 | Station — Terminal | ✅ framed panel, green **Connected** badge, **live PTY** (`agentpod git:(redesign/fleet-console)`) |
| 11 | Responsive — mobile (390) | ✅ BottomNav (Fleet/Settings), sidebar hidden, cards + tabs reflow (icon-only tabs, 1-col stat grid) |
| 12 | Responsive — tablet (768) | ✅ `md` breakpoint → icon-only sidebar rail |
| 13 | Demote-but-routable | ✅ `/nodes` → redirects to `/`; `/projects` (legacy) still loads by direct URL |

## Bugs found + fixed during the pass

1. **Home rendered with no AppShell/nav (real regression).** `+layout.svelte` computed the route imperatively (`currentPath = window.location.pathname`), which went stale across the post-signup `goto("/")` — so `isPublicRoute` stuck at `true` and the primary page lost its nav (and the nav wrongly showed on `/login`). **Fix:** derive the path from SvelteKit's reactive `page` state (`$app/state`), matching `app-shell.svelte`. The headline responsive-nav feature now works on every route.
2. **Terminal hover-lift (deferred from UI.6).** The live terminal sat on `.cyber-card`, which lifts 2px on hover — jarring for an interactive viewport. **Fix:** a `.cyber-card.no-lift:hover { transform: none }` opt-out, applied to the Terminal frame (keeps the glow/border animation).

## Gates after fixes

`pnpm check` 0 errors (8 pre-existing warnings) · `pnpm test` **95 passed (15 files)** · `pnpm build` (adapter-static) clean.

## Teardown

Kill the hub (`:3001`), console (`:1420`), and node-agent processes; drop `uidemo2` when done.
