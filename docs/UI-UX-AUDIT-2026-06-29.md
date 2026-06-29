# AgentPod Console — UI/UX Audit (2026-06-29)

Live audit of `console.agentpod.dev` (post Phase-2 cleanup) across desktop (1440×900) + mobile (390×844), plus code-level review. Severity: **P0** broken · **P1** should-fix · **P2** polish.

## Summary

The console has a coherent identity (mono type, `[bracket]`/`//` cyber motifs, teal accents) and **good responsiveness** (desktop sidebar → mobile bottom-tab bar; content reflows cleanly). The biggest issues are **OpenCode-era vestiges surviving inside the "kept" components** — Phase 2 removed the OpenCode *backend* and most console code, but Settings and Admin still carry legacy UI. Those are the highest-value fixes. No true P0 (the app works), but several P1s undercut onboarding + trust.

**Recurring theme:** the survivors of the OpenCode era (Settings theme customizer, Admin sub-app, the empty-state enroll command) weren't fully re-aligned to the fleet console. A focused "vestige sweep" closes most of this.

## Findings

### P1 — should-fix
- **F1 · Stale-session render.** With an invalidated session the app renders the authenticated shell + fires 4 API calls that 401, instead of redirecting to `/login` (or showing a "session expired" state). Reproduced live after the DB wipe. → The auth guard should treat a 401 from the session/data calls as unauthenticated and redirect.
- **F2 · Conflicting install commands.** The fleet **empty-state banner** shows the *old* `agentpod-node enroll --hub <hub-url> --token <token>`, while the **generated token** shows the correct `curl -fsSL …/install.sh | sudo bash -s -- <hub> <token>`. After generating, *both* are on screen at once — contradictory onboarding. → Update `connect-banner.svelte` to the curl one-liner (single source of truth).
- **F5 · No copy button** for the generated enroll command / token. It's a long wrapping string you must hand-select. → Add a copy-to-clipboard button (the #1 onboarding action).
- **F7 · Settings → Appearance is over-scoped.** It's the OpenCode theme customizer: **20 color schemes** (Catppuccin, Twitter, Rose Gold, Cyberpunk…) + font pairings + "save combinations." Off-brand and a maintenance liability for a fleet console. → Reduce to **light / dark / system** (drop the scheme/font/save UI).
- **F10 · Admin "Agents" tab is dead.** Agents were retired in P2b; the tab will hit removed endpoints and error. → Remove the Agents tab.

### P2 — polish
- **F3 · Low-contrast command text** in the empty-state banner (light gray on white) — fails contrast. → Darken / use the code-block treatment.
- **F4 · Empty-fleet dead space.** The empty state is a full-width card pinned top-left; the rest of the viewport is blank. → Center/constrain the empty state or add next-step guidance.
- **F6 · Token-result placement.** The generated command appears *above* the card that triggered it, and the banner doesn't collapse/update — disorienting. → Render the result in/replacing the banner, with the copy button.
- **F8 · Settings layout inconsistency.** Settings content sits in a narrower, left-margined column vs the full-width Fleet/Admin pages. → Align the page container width across routes.
- **F9 · Stale Admin copy.** Subtitle reads "Manage users, **resource limits**, and system settings" — resource limits were removed (P2b). → Update copy.
- **F11 · Vestigial "Sandboxes" column** in the Admin user table (always 0). → Remove the column.
- **F12 · Admin is a visually distinct sub-app.** It has its own large header, a *second* theme-toggle, and a "collapse header" control — different chrome from the Fleet/Settings shell. → Re-skin Admin to the standard app-shell (sidebar + simple top bar); drop the duplicate theme toggle.
- **F13 · Mobile top padding.** The page header is flush to the top edge on mobile (no safe-area/top padding).
- **F14 · A11y.** 3 pre-existing `autofocus` warnings (svelte-check); plus do a keyboard-nav + focus-ring + aria pass (command palette, dialogs, the station panels).

### Strengths (keep)
- Responsive sidebar→bottom-nav; clean empty states with guidance; consistent cyber aesthetic on Fleet/Login; the login page is well-composed; Cmd-K palette.

## Not yet audited — needs a connected node (re-enroll `superchotu`)

The **core product UX was not auditable live** (empty fleet): the **node detail + station capability panels** — terminal, filesystem, logs, config editor, health, lifecycle, cleanup, activity — and the **New Runtime provision→drive→destroy** flow. These are the heart of the console and deserve their own deep pass. **Next step:** re-enroll a node (`superchotu`) and continue the audit on the populated states.

## Recommended fix order

1. **Vestige sweep (P1):** F2 (banner command) + F7 (theme settings) + F10 (Agents tab) + F9/F11/F12 (admin cleanup) — finishes the OpenCode de-vestige.
2. **Onboarding polish:** F5 (copy button) + F6/F4/F3 (token flow + empty state).
3. **Auth robustness:** F1 (session-expiry redirect).
4. **Core-panels audit** (after a node is connected) → its own findings pass.
5. **A11y pass:** F14 + F13.
