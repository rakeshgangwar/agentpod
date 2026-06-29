# P2c — Infra Cleanup (Design Spec)

**Status:** Approved (brainstorm 2026-06-29). Third + final Phase-2 sub-project (after P2a console purge, P2b hub backend retirement). Issues #136/#137/#138/#139.
**Branch:** `develop` (merge `develop`→`main`).
**Context:** The console (P2a) and hub (P2b) are OpenCode-free. P2c removes the repo-root infra leftovers so the *repo* matches: the OpenCode Docker sandbox stack, the Tauri desktop shell, and OpenCode observability config. **Cloudflare provisioning is KEPT** (a P4 feature — the CF driver posts to `cloudflare/worker`).

**Decision (locked):** keep CF provisioning. Recoverable from git history + `v0.0.4-opencode`.

## 1. Goal & Scope

Delete the unused OpenCode/Tauri repo-root infrastructure with zero impact on the running fleet (hub on VPS, console on Cloudflare Pages, node-agent installs, P4 Docker + CF provisioning).

## 2. Remove

- **#136 — Docker sandbox stack:** the `docker/` dir (base/codeopen-base/flavors/addons/sso/opencode/scripts/README/VERSION) + root `docker-compose.yml` + `docker-compose.prod.yml`. *(Not the node-agent images — those build from `apps/node-agent/deploy/Dockerfile*`, which stay.)*
- **#138 — Tauri desktop shell:** root `Cargo.toml` + `Cargo.lock`; `apps/console/src-tauri/` (the Tauri crate + `tauri.conf.json`); `tauri-plugin-mcp/` (the plugin package); the `tauri-plugin-mcp` entry in `pnpm-workspace.yaml`; any `@tauri-apps/*` dependencies still listed in `apps/console/package.json` (P2a removed all Tauri *imports*, so these are now unused); the `tauri-plugin-mcp` build-caveat comments in `.github/workflows/ci.yml`.
- **#139 — OpenCode observability:** the `config/` dir (`loki/`, `fluent-bit/`).

## 3. Keep — Cloudflare provisioning (#137)

`cloudflare/worker/` is the target the **P4 CF provisioner** (`apps/hub/src/services/provisioner/cloudflare.ts`) posts to via `CLOUDFLARE_WORKER_URL`. It is a **standalone** project (own `package.json`/`package-lock.json`/`wrangler.toml`, not a pnpm-workspace member, no imports from the hub), so there is no entanglement to reconcile — **keep it as-is** as the documented CF-provisioning deploy target. Also keep (already in place from P2b): `provisioner/cloudflare.ts`, the `cloudflare-webhook` route, the `cloudflare` schema (`cloudflare_sandboxes`, `agent_tasks`), and the `ENABLE_CLOUDFLARE_SANDBOXES` flag. The #137 "reconcile" reduces to: confirm `cloudflare/worker` is standalone + exposes only the create/lifecycle endpoints the CF driver calls; add a one-line README note that it's the CF-provisioning target. No code changes expected.

## 4. Keep — hard boundary

Everything under `apps/` (hub, console, node-agent), `packages/` (`contract`, `types`, `ui`, `agents`, `eslint-config`, `tsconfig` — minus nothing here; tauri-plugin-mcp is a top-level dir, not under packages/), `deploy/`, `docs/`, `cloudflare/`, and the node-agent Dockerfiles. The console must still build web-only (adapter-static) after the `@tauri-apps/*` deps are dropped.

## 5. Risks & verification

- **Console build after dropping `@tauri-apps/*`:** P2a removed all Tauri imports, so the deps are unused — but verify: `pnpm install` (workspace resolves without `tauri-plugin-mcp`), then `cd apps/console && pnpm check && pnpm build` clean.
- **pnpm workspace integrity:** removing the `tauri-plugin-mcp` workspace member + dir must not break `pnpm install` for the other workspaces (hub/console/packages). Verify a clean `pnpm install`.
- **No live reference to the removed dirs:** grep that nothing in `apps/`, `deploy/`, `.github/`, root `package.json`/`turbo.json` references `docker/`, `config/`, `src-tauri`, `tauri-plugin-mcp`, or the root `docker-compose*.yml` (other than the deletions themselves). The prod hub deploy uses `deploy/` + `apps/node-agent/deploy/`, not these.
- **CI still green:** `ci.yml` (rewritten in #151) builds contract/hub/node/console — none depend on the removed infra; confirm the tauri-comment removal leaves valid YAML.
- **Rust toolchain:** with `Cargo.*` + both crates gone, there's no Rust in the repo; confirm nothing (CI, scripts) invokes cargo.
- **No deploy impact:** this is repo-only cleanup. The running hub/console/node-agent are unaffected (nothing deployed references these dirs). A post-merge `pnpm install && pnpm -r build`-equivalent (hub `bun test`, console `pnpm build`) is the gate; no redeploy needed for the removed infra, though the console can be rebuilt+redeployed to confirm.

## 6. Success criteria

`docker/`, `config/`, `src-tauri/`, `tauri-plugin-mcp/`, `Cargo.*`, root `docker-compose*.yml` are gone; `pnpm install` clean; `apps/console` builds web-only; hub `bun test` green; `cloudflare/` retained + documented as the CF target; no repo reference to any removed path. Repo is now fleet-console-only end to end (console + hub + infra).
