# P2 Polish Batch (Design Spec)

**Status:** Approved (brainstorm 2026-06-30).
**Branch:** `develop` (merge `develop`→`main`).
**Context:** Remaining P2 findings from `docs/UI-UX-AUDIT-2026-06-29.md` after the P1 sweep. Two streams: **console polish** (7 small fixes) + **F16 gateway-metrics** (node-agent + console). **F18 dropped** — config edit is already reachable via the Files tab's `ConfigEditor` (capability-gated on `fs.write`), by design.

## 1. Console polish (apps/console)

- **F3 — banner contrast.** `connect-banner.svelte`: the example command line is `text-muted-foreground/60` (too faint). Change to `text-muted-foreground` (drop `/60`) or wrap in the standard code-block treatment for legible mono text.
- **F4 — empty-fleet dead space.** `NodesOverview.svelte` empty state: constrain/center it (e.g. `max-w-2xl mx-auto` + vertical centering in the main area) instead of a full-width card pinned top-left.
- **F6 — token result placement.** `NodesOverview.svelte`: render the generated enrollment command **in place** (in/replacing the connect area) with the copy button, not as a line *above* the triggering card. After generating, the command + copy button appear where the action was, and the stale example collapses.
- **F8 — Settings width.** `routes/settings/+page.svelte`: wrap content in the same container as the rest (`container mx-auto px-4 sm:px-6 max-w-7xl`, matching `page-header.svelte:143`) so it's not a narrower/left-margined column vs Fleet/Admin.
- **F13 — mobile header padding.** `page-header.svelte` (the `sticky top-0` header): add top padding on mobile (e.g. `pt-[env(safe-area-inset-top)]` or a small `pt-` at the `sm` breakdown) so the title isn't flush to the viewport top.
- **F14 — a11y.** `FileBrowser.svelte`: replace the two `autofocus` attributes (lines ~291, ~354) with a Svelte action (`use:autofocusAction` that calls `el.focus()` on mount) to clear the 3 svelte-check warnings while keeping the focus behavior. Add `aria-label`s to icon-only buttons in the changed components (and the obvious ones nearby).
- **F17 — path tooltip.** `routes/nodes/[id]/+page.svelte` detected/adopted station cards: add a `title={workspacePath}` (HTML tooltip) on the CSS-truncated `<code>` path so the full path is reachable on hover.

## 2. F16 — gateway metrics for composite stations (node-agent + console)

Composite OpenClaw stations currently report null PID/CPU/Memory/Uptime (shared gateway → not per-agent). Surface the **shared gateway process's** real metrics instead.

- **Node-agent — `apps/node-agent/internal/descriptor/openclaw.go` `Health()`:** for a composite/subagent station, when the gateway is running, get the PID via the existing `openclawGatewayPID()` and read the process's CPU%/RSS/elapsed with `ps -p <pid> -o %cpu=,rss=,etime=` (POSIX; Linux fleet). Populate `Health.pid`, `cpuPct`, `memory` (RSS), `uptime` (parse `etime`) from the gateway; set the note to `shared gateway (PID <n>)`. Best-effort: if `ps` fails, fall back to the current null + note. Keep `disk` (workspace size) as-is. Add a unit test for the `etime`/`ps`-output parsing helper.
- **Console — `HealthPanel.svelte`:** when the station is composite (or the note indicates a shared gateway), label the PID/CPU/Memory/Uptime values with a subtle "(gateway)" suffix/badge so it's clear they're the shared process. No layout change otherwise.
- **Contract:** `StationHealth` already has `pid`/`cpuPct`/`memory`/`uptime` (nullable) — no contract change.
- **Deploy:** F16 needs a node-agent **re-release** (publish the linux/amd64 binary) + **re-install on `superchotu`** (`apn` re-install + restart) to verify live.

## 3. Risks & verification

- **Console polish:** low-risk CSS/markup. Gate: `pnpm check` 0 + `pnpm test` green + `pnpm build` clean. Visual spot-check (Neutral + a dark scheme) of: connect-banner (contrast), empty fleet (centering — needs a 0-node view; check on a fresh/empty state), token flow (copy in place), Settings width, mobile header, a station Files panel (FileBrowser focus). Re-run svelte-check → autofocus warnings gone (0 warnings ideal).
- **F16:** `go test ./... -race` + `go vet` for the descriptor (incl. the new ps/etime parser test); `go build` for linux/amd64. Console `pnpm check`/`build`. Live: re-release + re-install on superchotu → station Health shows the gateway PID/CPU/mem/uptime with the "(gateway)" label; non-OpenClaw / leaf stations unaffected. If `ps` flags differ on the target, the fallback keeps it null (no crash).
- **No redirect/contract changes**; node-agent change is additive (only fills previously-null fields).

## 4. Success criteria

Banner command legible; empty fleet centered; generated token shown in-place with a working copy; Settings matches the standard width; mobile header has top padding; `svelte-check` autofocus warnings cleared + icon buttons labeled; truncated paths have tooltips. Composite OpenClaw station Health shows the **gateway process's** PID/CPU/memory/uptime labeled "(gateway)" (verified live on superchotu). check/test/build green; no regressions.
