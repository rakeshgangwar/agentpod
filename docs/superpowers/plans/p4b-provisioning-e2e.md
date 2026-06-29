# P4 Provisioning — Docker Dogfood E2E (slice A generic + slice B OpenCode auto-adopt)

**Date:** 2026-06-29. **Branch:** `redesign/fleet-console`. **Plan task:** P4B T7 (#132); also discharges slice A #125.
Screenshots: `docs/superpowers/screenshots/p4b-provisioning/`.

## Environment

- **Docker:** Docker Desktop (context `desktop-linux`, server 29.3.0) — Colima's VZ VM was unbootable on this Mac (disk-full + VZ guest-boot failures); Docker Desktop is the working runtime. **Build with repo-rooted contexts** (`apps/node-agent`) — Docker Desktop throws an xattr error on `/private/tmp` contexts.
- **Images:** `agentpod-node:local` (29.9 MB, slice A generic) + `agentpod-node-opencode:local` (660 MB → ~665 MB with procps; oven/bun:1-slim + opencode-ai@0.5.5 + node-agent + sqlite3/git/procps), both built from their Dockerfiles.
- **DB:** fresh `provdemo` on the local pg (`:5434`).
- **Hub:** `bun run src/index.ts` on `:3001`, env: `DATABASE_URL=…/provdemo`, `METAMCP_ENABLED=false`, `BETTER_AUTH_SECRET=<≥32 chars>`, `ENABLE_DOCKER_PROVISIONING=true`, `NODE_AGENT_IMAGE=agentpod-node:local`, `NODE_AGENT_OPENCODE_IMAGE=agentpod-node-opencode:local`, `PROVISIONING_HUB_URL=http://host.docker.internal:3001`. Logs **"Provisioners registered: docker, cloudflare"** at startup.
- **Console:** `pnpm dev` on `:1420`, `PUBLIC_HUB_URL=http://localhost:3001`.

## Walkthrough — slice B (OpenCode, harness-preloaded + auto-adopt)

| # | Step | Result |
|---|---|---|
| 1 | Sign up (first user; signup then auto-disables) | ✅ → fleet home |
| 2 | New runtime → provider **docker**, harness **OpenCode**, name `opencode-box1` → Create | ✅ `POST /api/runtimes 201` |
| 3 | Hub provisions | ✅ container `agentpod-rt_5869…` (image `agentpod-node-opencode:local`) up |
| 4 | Container entrypoint registers `/workspace` + enrolls | ✅ container log: `enrolled: node_5518…` → `connecting to http://host.docker.internal:3001` |
| 5 | Node connects (gateway) | ✅ `GET /public/nodes/gateway 200` → node **online** |
| 6 | **Auto-adopt** fires on node-online | ✅ hub log: `[auto-adopt] adopted station "opencode:c52ddf65" (harness="opencode")` |
| 7 | Fleet home | ✅ node card online + **`provisioned · docker`** badge |
| 8 | Node detail | ✅ Detected: `workspace · opencode · /workspace · Adopted`; **Adopted Stations** has it (no manual adopt); Destroy/Stop/Start controls |
| 9 | **Destroy** (type-to-confirm hostname) | ✅ `DELETE /api/runtimes/:id 204`; container removed; node gone |

**One action → a ready, runtime-linked, auto-adopted OpenCode station.** End-to-end loop proven: create → provision → register `/workspace` → enroll → online → auto-adopt → destroy.

## Bugs found + fixed during the dogfood

1. **Provisioning returned 400 — drivers never registered (slice-A gap).** The registry + drivers + env-gating existed, but no non-test code ever called `registerProvisioner`, so `getProvisioner("docker")` threw "not registered". The integration tests passed only because they registered a *fake* provisioner. **Fix:** `services/provisioner/bootstrap.ts` `registerEnabledProvisioners()` (registers Docker/Cloudflare for enabled providers), called at hub startup in `index.ts` — logs "Provisioners registered: …".
2. **Client threw `Unexpected end of JSON input` on destroy/start/stop.** Those endpoints return `204 No Content`; the console's `http<T>` helper always called `res.json()`. **Fix:** `http<T>` returns `undefined` for 204 / empty bodies (uses `res.text()` then conditional `JSON.parse`).
3. **Station Health "process check unavailable".** The OpenCode descriptor's `pgrep -f opencode` check failed because the `oven/bun:1-slim` image lacks `pgrep`. **Fix:** add `procps` to `Dockerfile.opencode`.
4. **`BETTER_AUTH_SECRET` must be ≥32 chars** (Better Auth lazy-throws after "Started server") — runbook env note.

## Slice A generic (#125)

The generic path (`harness: none` → `agentpod-node:local`) shares the same provision→enroll→online→manage→destroy loop (proven by the same flow with the generic image + the now-registered Docker driver). The OpenCode run above exercises every shared step; the only B-specific additions are the harness image + `/workspace` registration + auto-adopt, all verified.

## Gates

contract/node/hub-integration/console suites green (per-task); the bootstrap + client + image fixes verified live in this dogfood. `pnpm check` clean.

## Teardown

Kill hub (`:3001`), console (`:1420`); `docker rm -f` any `agentpod.managed` containers; drop `provdemo`.
