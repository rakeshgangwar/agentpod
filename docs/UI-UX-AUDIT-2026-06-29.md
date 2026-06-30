# AgentPod Console — UI/UX Audit (2026-06-29)

Live audit of `console.agentpod.dev` (post Phase-2 cleanup) across desktop (1440×900) + mobile (390×844), plus code-level review. Severity: **P0** broken · **P1** should-fix · **P2** polish.

## Summary

The console has a coherent identity (mono type, `[bracket]`/`//` cyber motifs, teal accents) and **good responsiveness** (desktop sidebar → mobile bottom-tab bar; content reflows cleanly). The biggest issues are **OpenCode-era vestiges surviving inside the "kept" components** — Phase 2 removed the OpenCode *backend* and most console code, but Settings and Admin still carry legacy UI. Those are the highest-value fixes. No true P0 (the app works), but several P1s undercut onboarding + trust.

**Recurring theme:** the survivors of the OpenCode era (Settings theme customizer, Admin sub-app, the empty-state enroll command) weren't fully re-aligned to the fleet console. A focused "vestige sweep" closes most of this.

## Remediation status (fix sweep, 2026-06-30)

**Fixed + deployed** (`main` `61a85bb`; spec/plan `…/2026-06-30-ui-fix-sweep*`):
- **F15** — status badges → theme-robust **outline** pattern (`statusBadgeClass` helper across Health/fleet/station-tree/Terminal/LogTail/ActivityPanel); verified legible under Cyberpunk dark.
- **F2/F5** — connect-banner → curl one-liner; **copy button** on the generated token.
- **F9–F12** — **admin re-skinned** to the app-shell (PageHeader; removed the hero/theme-toggle/collapse chrome + Agents tab + `routes/admin/agents/` + Sandboxes column + "resource limits" copy); all admin functions intact; verified live.
- **F1** — global **401 → `/login`** redirect (`handleUnauthorized` in client.ts + admin.ts, loop-guarded).

**Still open (P2 polish, not yet swept):** F3 (empty-state command contrast), F4 (empty-fleet dead space), F6 (token-result placement), F8 (settings column width), F13 (mobile top padding), F14 (a11y pass), F16 (health "—" metrics), F17 (path tooltip), F18 (no Config tab).

## Findings

### P1 — should-fix
- **F1 · Stale-session render.** With an invalidated session the app renders the authenticated shell + fires 4 API calls that 401, instead of redirecting to `/login` (or showing a "session expired" state). Reproduced live after the DB wipe. → The auth guard should treat a 401 from the session/data calls as unauthenticated and redirect.
- **F2 · Conflicting install commands.** The fleet **empty-state banner** shows the *old* `agentpod-node enroll --hub <hub-url> --token <token>`, while the **generated token** shows the correct `curl -fsSL …/install.sh | sudo bash -s -- <hub> <token>`. After generating, *both* are on screen at once — contradictory onboarding. → Update `connect-banner.svelte` to the curl one-liner (single source of truth).
- **F5 · No copy button** for the generated enroll command / token. It's a long wrapping string you must hand-select. → Add a copy-to-clipboard button (the #1 onboarding action).
- **F7 · Settings → Appearance theme customizer.** ~~Recommended reducing to light/dark/system.~~ **RESOLVED (decision: keep + wire it properly):** the 20-scheme + font customizer is kept. It was only *half-wired* (it set standard tokens but the app used a separate fixed `--cyber-*` palette, so accents didn't retint). Fixed via the **theme-token migration** (commits `f8e2fa7`/`e83ccf3`): all ~427 `--cyber-*` usages + effect classes migrated to design tokens, `--cyber-*` deleted — selecting any scheme now retints the **whole** app (light + dark), verified live (Cyberpunk/Neutral). Spec/plan: `docs/superpowers/{specs,plans}/2026-06-29-theme-token-migration*`.
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

## Station capability panels — AUDITED 2026-06-30 (on `superchotu`, 13 OpenClaw stations)

**Core product UX works live on the real fleet** ✅ — node detail → detect→adopt → station panels all functional:
- **Node detail:** clean detect→adopt (Adopt / Adopt all; "detected" vs "adopted" sections); 13 OpenClaw composite stations enumerated.
- **Health:** metric grid (status/PID/CPU/mem/disk/uptime/activity/note) + Start/Stop/Restart lifecycle.
- **Terminal:** **live PTY** — `openclaw@superchotu:~/.openclaw/workspace/agent-workspaces/hanuman$` in the correct workspace, over the tunnel. The signature capability is solid.
- **Files:** real workspace tree (folders + `AGENTS.md`/`SOUL.md`/`IDENTITY.md`…), split-pane preview, New File/Folder.
- (Logs / Cleanup / Activity tabs present, same panel pattern — consistent; not individually screenshotted.)

**Findings:**
- **F15** [P1] — **status badges render invisible text.** The Health "Running" status pill and the Terminal connection chip use a chart-color background with **no contrasting `-foreground`**, so the label is the same color as the badge (unreadable). Root cause is the token-migration status-color theming; fix by pairing every status badge with `*-foreground` (or add semantic `--success`/`--warning` tokens). Strengthens the case for the A+C status-color option.
- **F16** [P2] — Health shows many `—` metrics (PID/CPU/Memory/Uptime/Last Activity) for composite OpenClaw stations; the "gateway process shared across all subagents" note explains it, but a panel of dashes reads unfinished — hide N/A rows or group them.
- **F17** [P2] — node-detail: 13 near-identical `openclaw composite` cards with **CSS-truncated workspace paths** and no `title`/tooltip — hard to tell apart; add a `title` attr or surface the distinguishing path segment.
- **F18** [P2] — no **Config** tab for OpenClaw stations (the capability set is harness-dependent); confirm config editing is reachable for harnesses that expose config.

**Still not audited live:** the **New Runtime provision→drive→destroy** flow (Docker provisioning) — needs a provisioned runtime; lower priority since P4 was dogfood-proven.

## Recommended fix order

1. **Vestige sweep (P1):** F2 (banner command) + F7 (theme settings) + F10 (Agents tab) + F9/F11/F12 (admin cleanup) — finishes the OpenCode de-vestige.
2. **Onboarding polish:** F5 (copy button) + F6/F4/F3 (token flow + empty state).
3. **Auth robustness:** F1 (session-expiry redirect).
4. **Core-panels audit** (after a node is connected) → its own findings pass.
5. **A11y pass:** F14 + F13.
