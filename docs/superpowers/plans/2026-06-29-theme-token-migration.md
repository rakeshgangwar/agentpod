# Theme Token Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Migrate the ~427 `--cyber-*` color usages + the cyber effect classes onto the standard design tokens (already theme-driven by `applyTheme()`), and delete the `--cyber-*` palette — so the 20-scheme customizer retints the entire console.

**Architecture:** Mechanical find-replace per a fixed mapping (`[var(--cyber-X)]`→Tailwind token utility; bare `var(--cyber-X)`→`var(--token)`), then migrate `app.css` effect classes + delete the `--cyber-*` defs, then a visual-regression pass across schemes. Tailwind 4 `@theme inline` already exposes every token (incl. `chart-1..5`) as utilities — no Tailwind config change.

**Tech Stack:** SvelteKit (Svelte 5), Tailwind 4 (`@theme inline`), `lib/themes/` store.

**Spec:** `docs/superpowers/specs/2026-06-29-theme-token-migration-design.md`.

## Global Constraints

- Console dir: `apps/console`. Gate: `pnpm check` 0 errors + `pnpm build` clean.
- **The mapping (apply everywhere):**
  | `--cyber-…` | → token |
  |---|---|
  | `cyan` | `primary` |
  | `cyan-dim` | `primary/70` |
  | `cyan-foreground` | `primary-foreground` |
  | `red` / `red-foreground` | `destructive` / `destructive-foreground` |
  | `emerald` / `emerald-foreground` | `chart-2` |
  | `amber` / `amber-foreground` / `yellow` | `chart-4` |
  | `magenta` / `magenta-foreground` | `chart-5` |
  | `orange` | `chart-1` |
  | `glow` / `glow-emerald` | `var(--primary)` / `var(--chart-2)` (effects) |
- Utility form: `bg-[var(--cyber-cyan)]/10` → `bg-primary/10`; `text-[var(--cyber-cyan)]` → `text-primary`; `border-[var(--cyber-red)]/30` → `border-destructive/30`; `ring-[var(--cyber-cyan)]` → `ring-primary`; chart tokens use the same utility form (`bg-chart-2`, `text-chart-4`).
- **Keep** the cyber *aesthetic* (effects, mono type, `[bracket]`/`//` motifs) — only the color source changes.
- Always pair accent backgrounds with the matching `-foreground` for contrast.
- Recoverable from git history.

---

### Task 1: Migrate component usages (`apps/console/src`, excl. `app.css`)

**Files:** all `.svelte`/`.ts` under `apps/console/src` that contain `--cyber-` (NOT `app.css` — that's T2). The `--cyber-*` defs stay in `app.css` during this task, so any missed usage still renders.

- [ ] **Step 1 — baseline.** Note the current default-scheme look is the reference (T3 compares against it). List the files: `grep -rl "\-\-cyber-" apps/console/src --include=*.svelte --include=*.ts | grep -v app.css`.
- [ ] **Step 2 — bulk replace the Tailwind-utility usages** per the mapping. For each `--cyber-X`, replace `(bg|text|border|ring|fill|stroke|from|to|via|shadow|outline|decoration|caret|accent)-\[var\(--cyber-X\)\]` → `\1-TOKEN` (preserving any trailing `/NN` opacity). Do this per var (cyan→primary first — 261×, then red→destructive, emerald→chart-2, amber/yellow→chart-4, magenta→chart-5, orange→chart-1, the `-foreground`s, `cyan-dim`→`primary/70`). A scripted `sed`/`perl` per pattern is fine; review the diff.
- [ ] **Step 3 — bare `var(--cyber-X)`** in `style="…"`, inline styles, or `.svelte` `<style>` blocks → `var(--token)` per the mapping (`var(--cyber-cyan)`→`var(--primary)`, etc.).
- [ ] **Step 4 — verify no usage missed in components:** `grep -rn "\-\-cyber-" apps/console/src --include=*.svelte --include=*.ts | grep -v app.css` → empty (only `app.css` should still reference `--cyber-*`).
- [ ] **Step 5 — gate:** `pnpm check` 0 errors + `pnpm build` clean.
- [ ] **Step 6 — commit:** `refactor(console): migrate --cyber-* color usages to design tokens (theme migration T1)`

---

### Task 2: Migrate effect classes + delete the `--cyber-*` palette (`app.css`)

**Files:** `apps/console/src/app.css`.

- [ ] **Step 1 — effect classes:** in `grid-bg`, `mesh-gradient`, `scanlines`, `noise-overlay`, `cyber-card`, and the keyframes (`pulse-glow`, `border-glow`, `glow-sweep`, etc.), replace `--cyber-*` references with the mapped `var(--token)` (e.g. glow cyan → `var(--primary)`, glow-emerald → `var(--chart-2)`). Keep the effects + their structure; only swap the color source. Tune alpha if a token makes an effect too strong (keep it subtle).
- [ ] **Step 2 — delete the defs:** remove every `--cyber-*` custom-property definition from both the light (`:root`) and `.dark` blocks of `app.css`.
- [ ] **Step 3 — verify zero remain:** `grep -rn "\-\-cyber-" apps/console/src` → **empty** (defs + usages all gone).
- [ ] **Step 4 — gate:** `pnpm check` 0 + `pnpm build` clean.
- [ ] **Step 5 — commit:** `refactor(console): migrate effect classes to tokens + delete --cyber-* palette (theme migration T2)`

---

### Task 3: Visual-regression verification across schemes (driver-run, not a subagent)

Done by the lead via Playwright on a local `pnpm dev` (or the live console after deploy):
- [ ] For **Neutral (default), Cyberpunk, Rose Gold** × **light + dark**, screenshot the key screens: **login, fleet (empty + populated), a station capability panel, settings, admin, a dialog, the Cmd-K palette**.
- [ ] Confirm: each scheme retints the **whole** UI incl. accents/buttons/headings/effects; text stays legible (foreground pairings); status (error red via destructive) reads correctly; effects are subtle not garish.
- [ ] Fix any regression (wrong token, missing `-foreground`, broken effect) — small follow-up commits `fix(console): theme migration regression — <what>`.
- [ ] Default (Neutral) scheme visually matches the pre-migration baseline (no unintended base changes).

## Self-review

- **Spec coverage:** §2 mapping → Global Constraints; §3 usages → T1, effects+delete → T2, Tailwind utilities confirmed (no config change needed); §4 status colors → mapping (red→destructive, success/warning→chart); §5 verification → T3. ✓
- **Ordering:** T1 (usages, defs still present so nothing breaks) → T2 (effects + delete defs, now grep must be zero) → T3 (visual). ✓
- **Placeholders:** the mapping + replacement patterns are exact; the per-var replace is mechanical. ✓
