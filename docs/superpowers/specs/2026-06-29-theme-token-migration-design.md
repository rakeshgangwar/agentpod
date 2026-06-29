# Theme Token Migration — wire the 20-scheme customizer into the whole UI (Design Spec)

**Status:** Approved (brainstorm 2026-06-29). Approach **B** (migrate to standard tokens).
**Branch:** `develop` (merge `develop`→`main`).
**Context:** The console keeps the 20-scheme + font-pairing theme customizer (`lib/themes/`, `theme-settings.svelte`). `applyTheme()` already writes each scheme's **standard design tokens** (`--background`/`--primary`/`--muted`/`--card`/`--border`/`--ring`/`--chart-*`…) onto `:root`. But the app's signature accents use a **separate, fixed `--cyber-*` palette** (`app.css`, **427 usages**) that `applyTheme()` never touches — so picking a scheme recolors the base but the accents stay teal. This migrates the `--cyber-*` usages onto the standard tokens so the customizer drives the *entire* UI.

**Decision (locked):** Approach B — migrate to existing standard/chart tokens; delete `--cyber-*`. Keep the cyber *aesthetic* (effects, mono type, `[bracket]`/`//` motifs); only the color *source* changes. Recoverable from git history.

## 1. Goal & Scope

Selecting any color scheme (or font pairing) retints the **whole** console — accents, buttons, headings, status, the grid/glow/scanline effects — in both light and dark mode, with no remaining fixed `--cyber-*` colors.

**In scope:** the console only — the ~427 `var(--cyber-*)` usages across `apps/console/src`, the cyber effect classes in `app.css`, the `--cyber-*` definitions, and the Tailwind config if chart-token utilities are needed. **Out of scope:** the theme store's apply mechanism (already works), the scheme/font data, the node-agent/hub.

## 2. The mapping

| cyber var | → token | notes |
|---|---|---|
| `--cyber-cyan` | `--primary` | main accent (261×) |
| `--cyber-cyan-dim` | `--primary` w/ opacity (`/70`) or `--accent` | dim accent |
| `--cyber-cyan-foreground` | `--primary-foreground` | |
| `--cyber-red` (+`-foreground`) | `--destructive` (+ `--destructive-foreground`) | errors (68×) |
| `--cyber-emerald` (+`-foreground`) | `--chart-2` | success/secondary (35×) |
| `--cyber-amber` (+`-foreground`) / `--cyber-yellow` | `--chart-4` | warning/highlight (35× / 6× undefined) |
| `--cyber-magenta` (+`-foreground`) | `--chart-5` | tertiary (15×) |
| `--cyber-orange` | `--chart-1` | (6×, undefined) |
| `--cyber-glow` / `--cyber-glow-emerald` | derived from `--primary` / `--chart-2` | glow effect colors |

`--cyber-yellow`/`--cyber-orange` are currently **undefined** (latent bug) — folded into the mapping above.

## 3. Approach

1. **Usages → Tailwind token utilities** where a utility exists: `bg-[var(--cyber-cyan)]`→`bg-primary`, `text-[var(--cyber-cyan)]/10`→`text-primary/10`, `border-[var(--cyber-cyan)]`→`border-primary`, `bg-[var(--cyber-red)]`→`bg-destructive`, etc. For chart tokens lacking a utility, use the arbitrary form `bg-[var(--chart-2)]` (or add `chart-*` utilities to the Tailwind theme — see step 4).
2. **Bare `var(--cyber-*)`** in `style=""` / CSS → the mapped `var(--token)`.
3. **Effect classes** in `app.css` (`grid-bg`, `mesh-gradient`, `scanlines`, `pulse-glow`/`border-glow`/`glow-sweep` keyframes, `cyber-card`, `noise-overlay`) → replace their `--cyber-*` references with the mapped tokens. The effects stay; they recolor with the theme.
4. **Tailwind config:** confirm `bg-/text-/border-{primary,destructive,accent,muted,chart-1..5}` utilities resolve (shadcn config). If `chart-*` utilities are missing, either add them to the Tailwind `@theme`/config or use `[var(--chart-N)]` arbitraries (pick one, apply consistently).
5. **Delete** all `--cyber-*` definitions from `app.css` (both `:root`/light and `.dark` blocks). One token system remains.

## 4. Status colors (documented choice within B)

No standard `success`/`warning` token exists, so: **error → `--destructive`** (red-ish across schemes); **success → `--chart-2`, warning → `--chart-4`** — i.e. status colors follow the active scheme (green "success" not guaranteed under every scheme). This is the pure-B tradeoff (chosen over A+C). If undesirable later, add `--success`/`--warning` tokens to each scheme — a small follow-up, not in this scope.

## 5. Risks & verification

- **Visual regression — the top risk.** 427 usages across many components; a wrong map or missed usage = broken color. Mitigation: migrate by mapping (mechanical + reviewable), then **verify visually** with Playwright across **3 representative schemes** (Neutral, Cyberpunk, Rose Gold) × **light + dark** × **key screens** (login, fleet empty + populated, a station panel, settings, admin, a dialog, the Cmd-K palette). Compare against a pre-migration screenshot baseline of the default scheme to catch unintended base changes.
- **Contrast:** confirm `*-foreground` pairings are used so text stays legible on accent backgrounds under every scheme (don't hardcode white on `--primary`).
- **Tailwind utility gaps:** chart-token utilities may not exist → step 4 resolves this consistently before bulk replace.
- **Effects legibility:** grid/glow/scanline opacities tuned for cyan may need minor alpha tweaks once token-driven (verify they're subtle, not garish, under saturated schemes).
- **Gate:** `grep -rn "cyber-" apps/console/src` → zero (no `--cyber-*` refs or defs); `pnpm check` 0 + `pnpm build` clean; the live verification pass above; the theme picker visibly retints the whole app incl. accents.

## 6. Success criteria

`grep -rE "\-\-cyber-" apps/console/src` returns nothing (defs + usages gone); selecting any of the 20 schemes (and toggling light/dark) retints the **entire** console including accents/buttons/headings/effects; `*-foreground` keeps text legible; build clean; no visual regressions in the Playwright pass. The cyber aesthetic (effects, type, motifs) is preserved — only the color source changed.
