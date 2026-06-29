# P2c — Infra Cleanup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`).

**Goal:** Remove the OpenCode Docker sandbox stack, the Tauri desktop shell, and OpenCode observability config from the repo root — keeping Cloudflare provisioning — with zero impact on the running fleet.

**Architecture:** Two deletion tasks: (T1) the unreferenced dirs (`docker/`, `config/`, root `docker-compose*.yml`) + a Cloudflare README note; (T2) the Tauri footprint (Cargo, the crate, the plugin, and the now-unused `@tauri-apps` deps/scripts/config), gated on a clean `pnpm install` + a web-only console build.

**Tech Stack:** pnpm workspace, Bun/Hono hub, SvelteKit (adapter-static) console.

**Spec:** `docs/superpowers/specs/2026-06-29-p2c-infra-cleanup-design.md`.

## Global Constraints

- Repo-only cleanup — no redeploy needed (nothing running references these paths). Verify after.
- **KEEP:** all of `apps/`, `packages/`, `deploy/`, `docs/`, `cloudflare/`, the node-agent Dockerfiles (`apps/node-agent/deploy/Dockerfile*`), and the P4 CF path (`provisioner/cloudflare.ts`, `cloudflare-webhook` route, `cloudflare` schema, `ENABLE_CLOUDFLARE_SANDBOXES`).
- Gates: `pnpm install` resolves clean; `cd apps/console && pnpm check && pnpm build` clean (web-only); `cd apps/hub && bun test` green (:5434).
- Recoverable from git history + `v0.0.4-opencode`.

---

### Task 1: Remove the Docker sandbox stack + observability config; note the CF worker

**Files:**
- `git rm -r`: `docker/`, `config/`
- `git rm`: `docker-compose.yml`, `docker-compose.prod.yml` (repo root)
- Modify (optional tidy): `apps/hub/.dockerignore` (line ~50 `docker-compose*.yml` pattern), `apps/hub/scripts/build.sh` (the "Or use docker-compose:" comment), `apps/hub/Dockerfile` (the docker-compose comment) — only the now-stale mentions; harmless to leave but tidy if trivial.
- Modify: `cloudflare/worker/README.md` — add one line noting this worker is the **AgentPod P4 Cloudflare-provisioning target** (the hub's `provisioner/cloudflare.ts` posts here via `CLOUDFLARE_WORKER_URL`).

- [ ] **Step 1** — `git rm -r docker config && git rm docker-compose.yml docker-compose.prod.yml`.
- [ ] **Step 2** — grep nothing in `apps/`/`deploy/`/`.github/` references the removed paths in a way that breaks (build/runtime): `grep -rnE "(^|[^a-z/])docker/|config/(loki|fluent-bit)|docker-compose" apps deploy .github --include=*.ts --include=*.json --include=*.yml --include=*.sh 2>/dev/null` → remaining hits must be comments/dockerignore only; tidy the trivial ones.
- [ ] **Step 3** — add the `cloudflare/worker/README.md` note.
- [ ] **Step 4** — sanity: `pnpm install` still resolves (these dirs aren't workspaces); `cd apps/hub && bun test` unaffected (quick: `bun test routes/runtimes`).
- [ ] **Step 5 — commit:** `chore(repo): remove OpenCode docker/ stack + config/ observability; note CF worker as P4 target (P2c T1)`

---

### Task 2: Remove the Tauri desktop shell

**Files:**
- `git rm`: `Cargo.toml`, `Cargo.lock` (repo root)
- `git rm -r`: `apps/console/src-tauri/`, `tauri-plugin-mcp/`
- Modify `pnpm-workspace.yaml`: remove the `- "tauri-plugin-mcp"` line (keep `apps/*`, `packages/*`).
- Modify `apps/console/package.json`: remove the `tauri`/`tauri:dev`/`tauri:build` scripts and the deps `@tauri-apps/api`, `@tauri-apps/plugin-dialog`, `@tauri-apps/plugin-fs`, `@tauri-apps/plugin-notification`, `@tauri-apps/plugin-opener`, `@tauri-apps/plugin-os`, `@tauri-apps/cli`. (P2a removed all `@tauri-apps` *imports* from `src` — verified zero remain — so these are unused.)
- Modify root `package.json`: remove the `"tauri": "pnpm --filter @agentpod/console tauri"` script.
- Modify `apps/console/vite.config.js`: remove the Tauri-specific config — the `**/src-tauri/**` watch-ignore (lines ~51–52) and any tauri-related server/host/envPrefix block tied to it. Keep the rest of the vite/sveltekit config intact.
- Modify `.github/workflows/ci.yml`: remove the two `tauri-plugin-mcp` build-caveat comment blocks (lines ~75, ~129). Leave the install steps working.

- [ ] **Step 1** — apply all the removals/edits above.
- [ ] **Step 2** — `pnpm install` at the repo root → resolves clean with no `tauri-plugin-mcp` workspace + no `@tauri-apps` deps (report the lockfile delta is sane).
- [ ] **Step 3** — `cd apps/console && pnpm check` (0 errors) + `pnpm build` (web-only, adapter-static, clean). This is the key gate — proves the console needs no Tauri.
- [ ] **Step 4** — `cd apps/hub && bun test` green (unaffected); confirm `grep -rn "tauri\|src-tauri\|Cargo" apps packages .github package.json pnpm-workspace.yaml` shows no live references (only `docs/` history is fine).
- [ ] **Step 5** — confirm no Rust remains: `find . -name Cargo.toml -not -path "*/node_modules/*"` → empty.
- [ ] **Step 6 — commit:** `chore(repo): remove Tauri desktop shell (Cargo/src-tauri/tauri-plugin-mcp + @tauri-apps deps) (P2c T2)`

---

### Task 3: Final verification (repo is fleet-only)

- [ ] `pnpm install` clean from a fresh state; `cd apps/console && pnpm build` (web) + `cd apps/hub && bun test` green.
- [ ] `git ls-files | grep -E "^(docker|config)/|docker-compose|Cargo|src-tauri|tauri-plugin-mcp"` → empty.
- [ ] `cloudflare/` retained (`ls cloudflare/worker`), CF driver/webhook/schema intact in the hub.
- [ ] (No deploy required — repo-only. Optionally rebuild+redeploy the console to confirm the web build deploys; the running fleet is unaffected.)

## Self-review

- **Spec coverage:** §2 docker (#136) → T1; §2 config (#139) → T1; §2 Tauri (#138) → T2; §3 cloudflare keep (#137) → README note in T1 + keep-boundary; §5 risks (console build after `@tauri-apps`, pnpm integrity, no live refs, CI, no Rust, no deploy impact) → T2 Steps 2–5 + T1 Step 2 + T3. ✓
- **Placeholder scan:** delete lists are exact paths; the only "optional tidy" (comments/dockerignore) is explicitly optional, not a placeholder. ✓
- **Ordering:** T1 (independent dirs) and T2 (Tauri) are independent; do T1 then T2. Each ends green. ✓
