# AgentPod v0.1.0 — Release Checklist

First tagged release of AgentPod **as the fleet/facilities console** for agent runtimes (the OpenCode era is frozen at `v0.0.4-opencode`). Source of truth: `develop` (P0–P4 + UI unification + legacy-retirement Phase 1). This checklist covers **code gates → docs → deployment → verification → tag**.

> Status legend: `[ ]` todo · `[~]` optional-for-v0.1.0 · `[x]` done.

## 0. Scope of v0.1.0

**In:** attach-first node-agent (dial-out WSS, reconnect, systemd) · inventory/health/logs/filesystem · write ops + durable terminal · config edit (backup/diff) · lifecycle + cleanup · per-harness descriptors (Hermes, OpenClaw, Claude Code, Codex, **OpenCode**) · remote/hosted (subdomain cookies) + Matrix identity (level A) · **provisioning** (Docker + Cloudflare drivers; Docker dogfood-proven; harness-preloaded OpenCode + auto-adopt) · unified responsive console (fleet-first IA, Cmd-K palette, activity ticker, connect banner).

**Single-operator (tenant-of-one).** v0.1.0 targets the operator's own fleet, one admin account. The data model carries owner/tenant scope (multi-tenant *ready*), but multi-tenancy — org management, tenant-isolation enforcement, signup/onboarding for others, billing/quotas — is **out of v0.1.0** and a deliberate post-release effort.

**Out / deferred (documented as known limitations):** **multi-tenancy** (single-operator only — see above) · Phase 2 cleanup (#135–139: hub OpenCode backend, `docker/`, `cloudflare/worker`, Tauri removal, `config/`) · Cloudflare provisioning **live-unverified** · provisioning repo-clone / credential-injection.

## 1. Pre-release code gates

- [x] **#133** — provisioned containers re-run `enroll` on every start → fail on restart (one-time token). *Fixed `4f4f722`: `enroll` idempotent via `alreadyEnrolled` guard; entrypoints restart-safe.*
- [x] **#114** — map session `role` into the auth store so the Admin nav appears for admins. *Fixed `e762518`: role mapped in initAuth/login/signUp.*
- [~] **#90** — surface FileBrowser tree-mutation errors (UX polish).
- [~] **#134** — regression test for `registerEnabledProvisioners` (locks the provisioner-startup wiring).
- [ ] Full suites green on `develop`: `cd packages/contract && bun test` · `cd apps/hub && bun test` (Postgres :5434) · `cd apps/node-agent && go test ./... -race` · `cd apps/console && pnpm check && pnpm test && pnpm build`.

## 2. Docs

- [ ] **README.md** — replace the "being redesigned" banner with the shipped product: what AgentPod is (fleet/facilities console), the three tiers (Go node-agent → Bun/Hono hub → Svelte console), a 5-line quickstart (run hub, build console, enroll a node), link the design spec + this release doc. Keep the `v0.0.4-opencode` note.
- [ ] **`docs/DEPLOYMENT.md`** (new, or extend `deploy/README-deploy.md`) — the full prod deploy (see §3) incl. the **P4 provisioning env** + the node-agent image build. Supersede the P3-only runbook.
- [ ] **`docs/OPERATING.md`** (new) — operator guide: enroll a node (`scripts/install-node-agent.sh` + `agentpod-node.service`), adopt stations, drive fs/logs/terminal, provision a runtime (New runtime / Cmd-K), destroy. Note the harnesses detected.
- [ ] **`CHANGELOG.md`** (new) — v0.1.0 highlights (the §0 "In" list) + known limitations (§0 "Out").
- [~] **Docs hygiene** — `docs/` has ~191 files, many OpenCode-era. Confirm OpenCode docs are under `docs/archive/` (the README claims so); move any stragglers. Not a blocker.

## 3. Deployment mechanics (prod: `<HUB_HOST>`, `hub.agentpod.dev` / `console.agentpod.dev` (Cloudflare Pages))

**Constraints (from P3):** additive only · **never touch Synapse / the `id.agentpod.dev` vhost** · `nginx -t` before every reload · operator-gated remote steps.

- [ ] **Prereqs on the box:** Docker available (for the Docker provisioner) · Postgres + pgvector (P3) · bun · the Synapse box's existing nginx/certbot.
- [ ] **Build the node-agent images** (on the prod Docker host, repo-rooted context):
  `docker build -t agentpod-node:local -f apps/node-agent/deploy/Dockerfile apps/node-agent`
  `docker build -t agentpod-node-opencode:local -f apps/node-agent/deploy/Dockerfile.opencode apps/node-agent`
- [ ] **Hub** — deploy the `develop` build; `EnvironmentFile=/etc/agentpod/hub.env` (systemd unit `deploy/agentpod-hub.service`) with: `DATABASE_URL`, `PORT=3001`, `BETTER_AUTH_SECRET` (**≥32 chars**), `ENCRYPTION_KEY` (**exactly 32**), `API_TOKEN`, `METAMCP_ENABLED=false`, `ENABLE_OPENCODE_SYNC=false`, `ENABLE_ACTIVITY_ARCHIVAL` (as desired), and **provisioning**: `ENABLE_DOCKER_PROVISIONING=true`, `NODE_AGENT_IMAGE=agentpod-node:local`, `NODE_AGENT_OPENCODE_IMAGE=agentpod-node-opencode:local`, `PROVISIONING_HUB_URL=https://hub.agentpod.dev` (container-reachable), `ENABLE_CLOUDFLARE_SANDBOXES` (off unless CF verified). Run drizzle migrations (hub auto-migrates on start; or `bun run db:migrate`). `systemctl restart agentpod-hub`; confirm health + startup log **"Provisioners registered: docker…"**.
- [ ] **Console** — build static with `PUBLIC_HUB_URL=https://hub.agentpod.dev` (`pnpm --filter @agentpod/console build`, adapter-static, output `apps/console/build/`); deploy to **Cloudflare Pages** (Git integration or `wrangler pages deploy apps/console/build`); set the **custom domain `console.agentpod.dev`** (Pages → Custom domains); confirm **SPA fallback** (`_redirects: /* /index.html 200`) is in place. Do **not** open the raw `*.pages.dev` URL — the session cookie is not same-site there and auth breaks.
- [ ] **nginx** — **hub vhost only** (`hub.agentpod.dev`, WS upgrade headers + long timeouts) per `deploy/nginx/hub.agentpod.dev.conf`; `nginx -t` → reload. No console vhost needed — the console is on Cloudflare Pages.
- [ ] **Smoke the deploy** (§4).

## 4. Post-deploy verification (real fleet)

- [ ] `console.agentpod.dev` (custom domain, not `*.pages.dev`) loads; sign in; session cookie is `Domain=.agentpod.dev; Secure; SameSite=Lax`. Confirm that opening the raw `*.pages.dev` URL redirects or is documented as broken-by-design (cookie won't be sent cross-site).
- [ ] **Enroll a real node** (a server, e.g. buddhimaan) via `scripts/install-node-agent.sh` against `wss://hub.agentpod.dev` → shows **online, no tunnel**; survives a reconnect.
- [ ] Adopt a station; drive **terminal + fs + logs-tail + config** over the public path; confirm the **Matrix ID** + `matrix.to` deep-link on a Hermes station. *(closes #88)*
- [ ] **Provision (Docker)** on the prod host: New runtime → OpenCode → container → auto-enroll online → auto-adopted `/workspace` station → drive → **destroy**. *(P4 prod smoke)*
- [ ] Cmd-K palette, activity ticker, connect banner render; legacy routes (`/projects`,`/workflows`) are gone.

## 5. Release / tag mechanics

- [ ] Merge `develop` → `main` (`--no-ff`) — the fleet console becomes mainline (`main` is currently 167 commits behind, still the OpenCode product). Resolve any artifacts; OpenCode stays recoverable at `v0.0.4-opencode`.
- [ ] Tag **`v0.1.0`** on the merge commit; push `main` + tags.
- [ ] GitHub Release for `v0.1.0` from `CHANGELOG.md`.
- [ ] Close milestone work; move Phase 2 (#135–139) + backlog to a post-v0.1.0 milestone.

## 6. Post-release (not blocking)

Phase 2 hub/infra retirement (#135–139) · Cloudflare provisioning live-verify · provisioning repo-clone/cred-injection · more harnesses (Claude Code/Hermes preload) · k8s driver · deferred polish (#47/#48/#64/#65).
