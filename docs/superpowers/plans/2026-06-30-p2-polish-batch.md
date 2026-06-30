# P2 Polish Batch — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Land the remaining P2 audit fixes — 7 small console-polish items + the F16 gateway-metrics enhancement (node-agent + console).

**Architecture:** T1 console-only polish; T2 node-agent descriptor change + a small console label. Sequential (both run the console `check`/`build` gate). T3 = driver-run deploy + live verify.

**Tech Stack:** SvelteKit (Svelte 5, Tailwind 4) console; Go node-agent.

**Spec:** `docs/superpowers/specs/2026-06-30-p2-polish-batch-design.md`. **Audit:** `docs/UI-UX-AUDIT-2026-06-29.md`.

## Global Constraints

- Console dir `apps/console`; node-agent `apps/node-agent`. Gate console: `pnpm check` (target **0 warnings** for the autofocus ones) + `pnpm test` + `pnpm build`. Gate node-agent: `go vet ./...` + `go test ./... -race` + `go build`.
- Keep the cyber aesthetic + token-based colors (use `statusBadgeClass`/tokens, no hardcoded colors).
- F16 is additive (only fills previously-null health fields); no contract change.

---

### Task 1: Console polish (F3, F4, F6, F8, F13, F14, F17)

**Files:** `lib/components/fleet/connect-banner.svelte`, `lib/components/fleet/NodesOverview.svelte`, `routes/settings/+page.svelte`, `lib/components/page-header.svelte`, `lib/components/stations/FileBrowser.svelte`, `routes/nodes/[id]/+page.svelte`; maybe a tiny `lib/actions/autofocus.ts`.

- [ ] **F3** — `connect-banner.svelte`: change the command line class `text-muted-foreground/60` → `text-muted-foreground` (legible); keep `font-mono`.
- [ ] **F4** — `NodesOverview.svelte` empty state: wrap the connect card in `max-w-2xl mx-auto` and center it in the main area (e.g. a flex column centered) instead of a full-width top-pinned card.
- [ ] **F6** — `NodesOverview.svelte`: render the generated enrollment command **in place** (inside/replacing the connect card area) with the copy button, not as a separate line above the card; the stale example collapses once a token is generated.
- [ ] **F8** — `routes/settings/+page.svelte`: wrap the page content in `<div class="container mx-auto px-4 sm:px-6 max-w-7xl">` (matching `page-header.svelte:143`) so it aligns with Fleet/Admin width.
- [ ] **F13** — `page-header.svelte`: on the sticky header container add top padding for mobile safe-area — `pt-[env(safe-area-inset-top,0px)]` (or a small `pt-2 sm:pt-0`) so the title isn't flush to the viewport top on phones.
- [ ] **F14** — `FileBrowser.svelte`: create `lib/actions/autofocus.ts` exporting `export function autofocus(node: HTMLElement) { node.focus(); }`; replace the two `autofocus` attributes (~lines 291, 354) with `use:autofocus`. Add `aria-label`s to icon-only buttons in FileBrowser (+ any obvious nearby). Then `pnpm check` should report **0 autofocus warnings**.
- [ ] **F17** — `routes/nodes/[id]/+page.svelte`: add `title={<workspacePath>}` to the truncated `<code>` path element in each detected/adopted station card.
- [ ] **Gate:** `pnpm check` (0 errors, 0 autofocus warnings) + `pnpm test` (green; update any snapshot/test touching the changed markup) + `pnpm build` clean.
- [ ] **Commit:** `fix(console): P2 polish — banner contrast, empty-fleet centering, token-in-place, settings width, mobile header, FileBrowser a11y, path tooltips (P2 batch T1)`

---

### Task 2: F16 — gateway metrics for composite OpenClaw stations

**Files:** `apps/node-agent/internal/descriptor/openclaw.go` (+ a test file), `apps/console/src/lib/components/stations/HealthPanel.svelte`.

**2a — node-agent (`openclaw.go`):**
- [ ] **Add a parser helper** `parsePsMetrics(out string) (cpuPct float64, rssKB int64, uptimeSec int64, err error)` that parses one line of `ps -p <pid> -o %cpu=,rss=,etime=` output (whitespace-split; `etime` formats `MM:SS`, `HH:MM:SS`, `D-HH:MM:SS`). Plus a test `openclaw_health_test.go` covering those etime formats + a normal line. RED→GREEN (`go test ./internal/descriptor/ -run Ps`).
- [ ] **In `Health()`** for a composite/subagent station, when the gateway is running: `pid, err := openclawGatewayPID()`; if ok, run `exec.Command("ps", "-p", strconv.Itoa(pid), "-o", "%cpu=,rss=,etime=").Output()`, parse via the helper, and set `Health.Pid=pid`, `CpuPct`, `Memory` (RSS bytes = rssKB*1024), `Uptime` (uptimeSec); set `Note = "shared gateway (PID <n>)"`. On any error, fall back to the current null metrics + the existing note (best-effort, no crash). Keep `Disk` as-is.
- [ ] **Gate:** `go vet ./...` + `go test ./internal/descriptor/ -race` (green) + `go build ./...`.

**2b — console (`HealthPanel.svelte`):**
- [ ] When the station is composite (or `health.note` contains "gateway"), render a subtle "(gateway)" suffix/`text-muted-foreground` label next to the PID/CPU/Memory/Uptime values so users know they're the shared process. No layout change.
- [ ] **Gate:** `pnpm check` 0 + `pnpm test` green + `pnpm build` clean.
- [ ] **Commit:** `feat(node)+console: report shared-gateway PID/CPU/mem/uptime for composite OpenClaw stations (F16)`

---

### Task 3: Deploy + live verification (driver-run)

- [ ] Merge `develop`→`main`. **Re-release the node-agent** (tag a patch OR rebuild+`--clobber` the `agentpod-node-linux-amd64` asset on the release) so superchotu can pick up F16; **re-install on superchotu** (`apn` re-install + `systemctl --user restart agentpod-node`). Rebuild+redeploy the console.
- [ ] Playwright (Neutral + a dark scheme): connect-banner contrast; empty-fleet centering (needs a 0-node view — check on a fresh state or note); token in-place + copy works; Settings width matches Fleet; mobile header has top padding (resize 390); FileBrowser focus works (no console autofocus warning).
- [ ] Station Health on a composite OpenClaw station (hanuman) shows the **gateway PID/CPU/memory/uptime** with the "(gateway)" label.
- [ ] Fix regressions → `fix(console): P2 polish regression — <what>`.

## Self-review

- **Spec coverage:** §1 console F3/F4/F6/F8/F13/F14/F17 → T1; §2 F16 node-agent+console → T2; F18 dropped (not in plan); §3 verification → T3. ✓
- **Ordering:** T1 then T2 (both touch the console `check`/`build` gate → sequential). T3 after both + node-agent re-release. ✓
- **No placeholders:** exact files/classes/parser-helper signature given. ✓
