# P3 — Remote/Hosted Hardening + Matrix Identity (Design Spec)

**Status:** Approved (brainstorm 2026-06-28). Single phase.
**Builds on:** P0–P2 (attach + read + write, all on `develop`) and P2.0 (web console shell).
**Branch:** `redesign/fleet-console`.

## 1. Goal & Scope

Make AgentPod manage the **real, remote fleet over the public internet — no SSH tunnel** — and surface each station's **Matrix identity**. The P2 verification could only reach the remote fleet via a hand-built `ssh -R` tunnel because the console↔hub↔node path was localhost-only; P3 removes that wall.

**In scope:**
1. **Hosted deployment** — hub on the Matrix box (`<HUB_HOST>`) behind nginx at `hub.agentpod.dev` (TLS); console at `app.agentpod.dev`; node-agents dial `wss://hub.agentpod.dev` directly.
2. **Cross-site auth (#71)** — solved by the same-site subdomain topology + cookie config.
3. **node-agent WAN robustness** — TLS dial, reconnect/backoff/heartbeat, and a systemd unit + install script so agents run as services and survive reboots.
4. **Matrix identity mapping (level A)** — each station carries its agent's Matrix mxid (read from the agent's own config), shown in the console with a `matrix.to` deep-link.
5. **Folded consolidation** — #70 (logs tailing), #89 (unified origin allowlist), and an opportunistic refinement of Hermes lifecycle to `systemctl --user`.

**Out of scope (explicit):**
- **Multi-tenant SaaS** (orgs, multiple users). P3 is single-tenant — the operator's own fleet, one admin account.
- **Matrix level B** (login to AgentPod via Matrix as IdP) and **level C** (fleet events → Matrix room). Identity *display* only.
- **Provisioning** (creating runtimes) — that is P4.
- Changing Synapse — its sqlite DB and config are left untouched; the hub installs its own Postgres alongside.

## 2. Architecture & Topology

- **Hub:** a `bun` process listening on `127.0.0.1:3001` on `<HUB_HOST>`, fronted by the existing **nginx** as a new server block **`hub.agentpod.dev`** — TLS via the same certbot/Let's Encrypt setup that serves `id.agentpod.dev`, with WebSocket upgrade headers proxied (`Upgrade`/`Connection`, long read timeouts for the gateway + terminal WS). Runs under a **systemd unit** (`agentpod-hub.service`).
- **Database:** install **PostgreSQL + pgvector** locally on the box for the hub (`DATABASE_URL=postgres://…@localhost:5432/agentpod`). Synapse's sqlite is independent and untouched. 7.6 GiB RAM is shared with Synapse — acceptable for a single fleet; Postgres tuned conservatively (small shared_buffers).
- **Console:** the static SPA (`adapter-static` build) served at **`app.agentpod.dev`** by nginx on the same box (one TLS setup, no separate build pipeline). Built with `PUBLIC_HUB_URL=https://hub.agentpod.dev`.
- **node-agents:** dial **`wss://hub.agentpod.dev/public/nodes/gateway`** and enroll against `https://hub.agentpod.dev`. Already dial-out/attach-first — this is a URL + TLS change, not an architecture change.
- **DNS:** `hub.agentpod.dev` and `app.agentpod.dev` A-records → `<HUB_HOST>` (Cloudflare DNS; proxied or DNS-only — DNS-only is simplest so nginx terminates TLS and the WS isn't subject to CF's WS quirks).

## 3. Auth — resolves #71

`app.agentpod.dev` and `hub.agentpod.dev` share the registrable domain `agentpod.dev` ⇒ **same-site**. Therefore:
- Better Auth session cookie is set **`Domain=.agentpod.dev; SameSite=Lax; Secure; HttpOnly`** so it is sent on cross-subdomain `fetch`, SSE, and the WS upgrade.
- Hub **CORS** allows `https://app.agentpod.dev` with `credentials`; Better Auth **`trustedOrigins`** includes it; the **terminal-WS Origin allowlist** includes it.
- These three lists are unified into **one config source** (`config.ts`) — closing **#89** (today CSRF and CORS keep separate lists that can drift).
- Local dev keeps working: the cookie config is environment-driven (`COOKIE_DOMAIN` unset / `SameSite=Lax` without `Secure` on `http://localhost`).

No `SameSite=None`, no bearer-token rework. **#71 is closed by topology + cookie config.**

## 4. node-agent WAN robustness

- **TLS:** the gateway client dials `wss://` when the hub URL is `https://` (derive scheme from the enroll URL). No code-path change beyond scheme handling + system root CAs (the static Go binary uses the OS trust store).
- **Reconnect:** exponential backoff with jitter on disconnect; a periodic heartbeat/ping so dead connections are detected and re-dialed. The agent must survive WAN blips and hub restarts without manual restart.
- **Service install:** ship `scripts/install-node-agent.sh` + a `agentpod-node.service` systemd unit template (enroll once, then `systemctl enable --now`). The agent runs as a service, restarts on failure (`Restart=always`), and survives reboots. (Hermes itself already uses per-profile `systemctl --user` units — the node-agent gets a system or user unit per host.)

## 5. Matrix identity mapping (level A)

- **Discovery (node):** the descriptor reads the agent's Matrix **mxid** (`@<localpart>:id.agentpod.dev`) from the agent's own config — Hermes: a profile's `config.yaml`/`auth.json` `user_id`; OpenClaw: the analogous field. It reads **only** the `user_id`/mxid (+ optionally the home room id), **never** the access token or any secret. If no Matrix identity is found, `matrixId` is null.
- **Contract:** `Station` gains optional **`matrixId: string | null`** (and optional `matrixHomeserver` derived from the mxid domain).
- **Hub:** persists `matrixId` on the station (adopt + detect annotate) and returns it via the station APIs.
- **Console:** shows the Matrix ID on the station header/Health, with a **deep-link** to `https://matrix.to/#/<mxid>` (client-side; the hub holds no Matrix credentials). Stations without a Matrix identity simply omit it.

## 6. Folded consolidation

- **#70 — logs tailing:** the node `logs.tail` returns the **last N lines/bytes** (bounded) instead of streaming a whole multi-MB session file from the start; `LogTail.svelte` caps rendered lines (ring-buffer the DOM). Critical now that logs stream over WAN.
- **#89 — origin allowlist:** one source of truth for CORS + CSRF + WS Origin checks.
- **Opportunistic — Hermes lifecycle:** prefer `systemctl --user hermes-gateway-<profile>.service` (start/stop/restart) when present, falling back to the P2 pgrep/SIGTERM path. Cleaner + matches how the fleet actually runs Hermes.

## 7. Testing

- **contract** — `Station.matrixId` parse/round-trip.
- **node-agent (Go)** — mxid extraction from sample Hermes/OpenClaw config fixtures (and the no-Matrix → null case; never emits a token); reconnect/backoff unit test (fake transport drops → re-dials with backoff); `logs.tail` last-N bounding; `systemctl --user` lifecycle path with a fake.
- **hub** — cookie attributes set correctly per environment (Domain/SameSite/Secure); unified origin allowlist accepts `app.agentpod.dev` and rejects others (CORS + WS); `matrixId` persisted + returned.
- **console** — station UI renders the Matrix ID + correct `matrix.to` link; LogTail caps lines.
- **staged deployment verification** (manual runbook, like P2's E2E):
  1. Deploy hub on the box (postgres, nginx vhost, TLS, systemd unit, DNS) — **touches the production Matrix server; requires operator go-ahead at execution and must not disturb Synapse/nginx's existing `id.agentpod.dev` vhost.**
  2. `app.agentpod.dev` loads; sign in; cookie is `Domain=.agentpod.dev; Secure`.
  3. Install + enroll the node-agent on **buddhimaan** as a systemd service pointing at `wss://hub.agentpod.dev`; it shows online with **no tunnel**.
  4. Drive a station end-to-end remotely (terminal, fs, logs-tail) over the public path; confirm the Matrix ID + deep-link appear; reboot the box / drop the network and confirm the agent reconnects.
  5. Roll out to the remaining fleet hosts.

## 8. Risks & Open Items

- **Production-server deploy.** Installing Postgres + an nginx vhost + a systemd service on the live Matrix box is the riskiest step. Constraints: do not touch Synapse's sqlite or its `id.agentpod.dev` vhost; add only a new `hub.agentpod.dev` server block; validate `nginx -t` before reload. Each remote step is operator-gated.
- **Resource pressure.** Postgres + hub + Synapse on 7.6 GiB. Tune Postgres small; monitor.
- **mxid discovery variance.** The exact field/file differs per harness and possibly per version; the descriptor must be defensive (missing/renamed → null, never crash, never leak a token).
- **WS through TLS/proxy.** nginx must proxy `Upgrade`/`Connection` and use long timeouts for the gateway + terminal WS; verify the terminal still works over `wss://` + nginx.
- **Cookie/secure in dev.** The cookie config must stay `http://localhost`-friendly (no `Secure` locally) so local dev and tests don't break.
- **Cross-site cookie residual.** If the console is ever hosted off `agentpod.dev` (e.g. a raw `*.pages.dev`), the same-site assumption breaks — keep it under `agentpod.dev`.
