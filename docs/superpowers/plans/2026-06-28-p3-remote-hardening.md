# P3 — Remote/Hosted Hardening + Matrix Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run AgentPod for the real fleet over the public internet (no SSH tunnel) — hub hosted behind nginx at `hub.agentpod.dev`, console at `app.agentpod.dev`, node-agents dialing `wss://` as systemd services — and surface each station's Matrix identity.

**Architecture:** Same-site subdomains (`app.`/`hub.` of `agentpod.dev`) make the Better Auth cookie work cross-subdomain, closing #71 without `SameSite=None`/bearer. The node-agent (already dial-out) gains TLS + reconnect + a service unit. Descriptors read each agent's Matrix mxid (never its token) into `Station.matrixId`, shown in the console with a `matrix.to` deep-link. Folds in #70 (logs tailing) and #89 (origin-list unification). The hub deploys onto the existing Matrix box (`178.105.68.68`) additively — its own Postgres + nginx vhost, never touching Synapse.

**Tech Stack:** TS + zod (contract); Go (node-agent); Bun + Hono + Drizzle + Better Auth + Postgres (hub); SvelteKit + Svelte 5 (console); nginx + systemd + certbot (deploy).

**Spec:** `docs/superpowers/specs/2026-06-28-p3-remote-hardening-design.md`.

## Global Constraints

- **Branch:** `redesign/fleet-console`. Frequent commits.
- **Single-tenant** — one admin / the operator's own fleet. No org/multi-user work.
- **Matrix is display-only (level A):** read the mxid from the agent's config, show it + a `matrix.to` deep-link. The node reads ONLY the `user_id`/mxid — NEVER the access token or any secret. The hub holds NO Matrix credentials. Missing/unparseable Matrix identity ⇒ `matrixId = null`, never a crash.
- **Auth via same-site cookie:** cookie `Domain=.agentpod.dev; SameSite=Lax; Secure; HttpOnly` in prod; **environment-driven** so local dev over `http://localhost` stays working (no `Secure`, no `Domain`). One unified origin allowlist for CORS + CSRF + WS (closes #89), including `https://app.agentpod.dev`.
- **Do not disturb Synapse:** the deploy is additive — a new `hub.agentpod.dev` nginx server block + the hub's own Postgres DB. Never touch Synapse's sqlite (`/var/lib/matrix-synapse/homeserver.db`) or the `id.agentpod.dev` vhost. Always `nginx -t` before reload.
- **Tests:** Go `go test ./... -race`; hub vitest with `ensurePgMigrations()` on local docker postgres `:5434` (never the SSH-tunnel DBs); console vitest. Deploy/verify tasks are manual runbooks with explicit validation gates, operator-gated (they touch the production server).

---

## File Structure

**contract** — `packages/contract/src/station.ts` (add `matrixId`), `station.test.ts`.

**node-agent** —
- `internal/descriptor/matrix.go` (create) — mxid extraction helper.
- `internal/descriptor/{descriptor.go,hermes.go,openclaw.go}` (modify) — `Station.MatrixId`, populate in Detect; Hermes lifecycle via `systemctl --user`.
- `internal/gateway/*.go` (modify) — wss scheme + reconnect/backoff/heartbeat.
- descriptor `logs.tail` path (modify) — last-N bounding.
- `scripts/install-node-agent.sh`, `deploy/agentpod-node.service` (create).

**hub** —
- `src/config.ts` (modify) — one `allowedOrigins` list + cookie env config.
- `src/auth/drizzle-auth.ts` (modify) — cookie `Domain`/`SameSite`/`Secure`, `trustedOrigins`.
- `src/middleware/csrf.ts`, `src/index.ts` (cors), `src/config.ts` `isAllowedOrigin` (modify) — consume the one list.
- `src/db/schema/stations.ts` + a migration (modify/create) — `matrix_id` column.
- `src/services/station-registry.ts` (modify) — persist + return `matrixId`.

**console** —
- `src/lib/components/stations/HealthPanel.svelte` (modify) — show Matrix ID + deep-link.
- `src/lib/components/stations/LogTail.svelte` (modify) — cap rendered lines.
- `src/lib/api/client.ts` `StationRow` (modify) — `matrixId`.

**deploy** —
- `deploy/nginx/hub.agentpod.dev.conf`, `deploy/agentpod-hub.service`, `deploy/README-deploy.md` (create).
- `docs/superpowers/plans/p3-remote-e2e.md` (create) — verification runbook.

---

## Task 1: Contract — `Station.matrixId`

**Files:** Modify `packages/contract/src/station.ts`; test `packages/contract/src/station.test.ts`.

**Interfaces — Produces:** `Station` gains `matrixId: z.string().nullable().optional()`. `DetectedStation` inherits it.

- [ ] **Step 1: Failing test** — in `station.test.ts`:
```ts
import { describe, it, expect } from "bun:test"; // match the package's runner
import { Station } from "./station";
it("Station accepts an optional nullable matrixId", () => {
  expect(Station.parse({ key:"k", harness:"hermes", kind:"leaf", displayName:"d", parentKey:null, workspacePath:null, capabilities:[], matrixId:"@a:id.agentpod.dev" }).matrixId).toBe("@a:id.agentpod.dev");
  expect(Station.parse({ key:"k", harness:"hermes", kind:"leaf", displayName:"d", parentKey:null, workspacePath:null, capabilities:[] }).matrixId).toBeUndefined();
  expect(Station.parse({ key:"k", harness:"hermes", kind:"leaf", displayName:"d", parentKey:null, workspacePath:null, capabilities:[], matrixId:null }).matrixId).toBeNull();
});
```
- [ ] **Step 2: Run → FAIL** — `cd packages/contract && bun test`.
- [ ] **Step 3: Implement** — add `matrixId: z.string().nullable().optional(),` to the `Station` object in `station.ts`.
- [ ] **Step 4: Run → PASS**; ensure the contract still builds for dependents.
- [ ] **Step 5: Commit** — `feat(contract): Station.matrixId (P3)`

---

## Task 2: node — Matrix mxid discovery in descriptors

**Files:** Create `apps/node-agent/internal/descriptor/matrix.go`, `matrix_test.go`; modify `descriptor.go` (Station struct), `hermes.go`/`openclaw.go` (populate in Detect).

**Interfaces — Produces:**
- `Station` Go struct gains `MatrixId *string \`json:"matrixId"\``.
- `func MatrixIDFromProfile(profileDir, homeserver string) *string` — reads the agent's mxid from its config; returns nil if not found. NEVER reads/returns an access token.

**Interfaces — Consumes:** the per-agent config dir (Hermes: `<home>/profiles/<name>/`; OpenClaw analogously).

- [ ] **Step 1: Failing test** — `matrix_test.go` with fixture files in `t.TempDir()`:
```go
func TestMatrixIDFromProfile(t *testing.T) {
    dir := t.TempDir()
    // auth.json holds user_id + a token; we must extract ONLY user_id.
    os.WriteFile(filepath.Join(dir,"auth.json"), []byte(`{"user_id":"@analyst-echo:id.agentpod.dev","access_token":"SECRET"}`), 0600)
    got := MatrixIDFromProfile(dir, "id.agentpod.dev")
    if got == nil || *got != "@analyst-echo:id.agentpod.dev" { t.Fatalf("want mxid, got %v", got) }
    // a profile with no matrix config → nil
    if MatrixIDFromProfile(t.TempDir(), "id.agentpod.dev") != nil { t.Fatal("want nil for no-matrix profile") }
}
func TestMatrixIDNeverReturnsToken(t *testing.T) {
    dir := t.TempDir()
    os.WriteFile(filepath.Join(dir,"auth.json"), []byte(`{"user_id":"@x:id.agentpod.dev","access_token":"SECRET-TOKEN"}`), 0600)
    got := MatrixIDFromProfile(dir, "id.agentpod.dev")
    if got == nil || strings.Contains(*got, "SECRET") { t.Fatalf("token leaked: %v", got) }
}
```
- [ ] **Step 2: Run → FAIL** — `cd apps/node-agent && go test ./internal/descriptor/ -run Matrix`.
- [ ] **Step 3: Implement** — `matrix.go`: parse `auth.json` (then `config.yaml` as fallback) extracting ONLY a `user_id`/`mxid` field matching `^@[^:]+:.+$`; ignore all other keys. Add `MatrixId` to the `Station` struct (`descriptor.go`). In `hermes.go` Detect, for each profile set `MatrixId: MatrixIDFromProfile(profileDir, "id.agentpod.dev")`; same in `openclaw.go` for its agents. (Homeserver may be a node-config value; default `id.agentpod.dev`.)
- [ ] **Step 4: Run → PASS** — `go test ./internal/descriptor/... -race`; `go build ./...`.
- [ ] **Step 5: Commit** — `feat(node): read Matrix mxid into Station (never tokens) (P3)`

---

## Task 3: node — WAN robustness (wss + reconnect/backoff/heartbeat)

**Files:** Modify `apps/node-agent/internal/gateway/*.go` (the dial/serve loop); test `gateway/reconnect_test.go`.

**Interfaces — Produces:** the gateway `Run` loop derives `wss://` from an `https://` hub URL, and reconnects with exponential backoff + jitter (cap ~30s) on any disconnect; sends a periodic ping; exits only on context cancel.

- [ ] **Step 1: Failing test** — a fake dialer that fails the first N dials then succeeds; assert `Run` retries with increasing backoff and eventually connects (use an injected clock/backoff seam so the test is fast + deterministic — do NOT sleep real seconds). Assert scheme derivation: `https://hub.x` → `wss://hub.x/...`, `http://localhost:3001` → `ws://...`.
- [ ] **Step 2: Run → FAIL** — `go test ./internal/gateway/ -run Reconnect`.
- [ ] **Step 3: Implement** — wrap the existing connect logic in a backoff loop (`backoff = min(cap, base*2^n) + jitter`), reset on a successful connect; add a ping ticker; derive ws scheme from the hub URL scheme. Keep cancel-on-context.
- [ ] **Step 4: Run → PASS** — `go test ./internal/gateway/... -race`.
- [ ] **Step 5: Commit** — `feat(node): wss + reconnecting gateway with backoff/heartbeat (P3)`

---

## Task 4: node + console — logs.tail last-N bounding (#70)

**Files:** Modify the descriptor `logs.tail` implementation (`apps/node-agent/internal/descriptor/*` where TailLogs reads the file) + `apps/console/src/lib/components/stations/LogTail.svelte`; tests on both.

**Interfaces — Produces:** `TailLogs` starts from the **last N lines** (default 500) / last ~256 KB of the log, not byte 0, before following; `LogTail.svelte` keeps at most `MAX_LINES` (e.g. 2000) in the DOM (drop oldest).

- [ ] **Step 1: Failing test (node)** — write a log file with 5000 lines; assert the initial emission contains the LAST 500 (not line 1). (console) — feed 5000 lines into LogTail; assert rendered line count is capped at MAX_LINES.
- [ ] **Step 2: Run → FAIL** — `go test ./internal/descriptor/ -run Tail`; `cd apps/console && pnpm test LogTail`.
- [ ] **Step 3: Implement** — node: seek to the last-N-lines offset before streaming (read backwards or tail-style); console: ring-buffer the lines array (`if (lines.length > MAX) lines = lines.slice(-MAX)`).
- [ ] **Step 4: Run → PASS** (both).
- [ ] **Step 5: Commit** — `fix(node,console): bound logs.tail to last N lines (#70, P3)`

---

## Task 5: node — systemd service + install script

**Files:** Create `apps/node-agent/deploy/agentpod-node.service`, `apps/node-agent/scripts/install-node-agent.sh`; test: a shellcheck/dry-run + a unit-file lint.

**Interfaces — Produces:**
- `agentpod-node.service` — `Restart=always`, `ExecStart=/usr/local/bin/agentpod-node run`, `After=network-online.target`.
- `install-node-agent.sh HUB_URL TOKEN` — installs the binary to `/usr/local/bin`, runs `enroll`, installs + `systemctl enable --now` the unit. Idempotent.

- [ ] **Step 1: Failing test** — a bats/shell test (or a Go test invoking the script with a fake `agentpod-node` on PATH + a fake `systemctl`) asserting: binary copied, `enroll` called with the args, unit installed + enabled. At minimum, `shellcheck scripts/install-node-agent.sh` passes and `systemd-analyze verify deploy/agentpod-node.service` is clean (run in CI/local where available).
- [ ] **Step 2: Run → FAIL** (script/unit absent).
- [ ] **Step 3: Implement** the unit + script (guard for non-root, existing-install upgrade).
- [ ] **Step 4: Run → PASS** — shellcheck + verify clean.
- [ ] **Step 5: Commit** — `feat(node): systemd unit + install script (P3)`

---

## Task 6: node — Hermes lifecycle via `systemctl --user` (opportunistic)

**Files:** Modify `apps/node-agent/internal/descriptor/hermes.go` (Lifecycle); test `hermes_lifecycle_systemd_test.go`.

**Interfaces — Produces:** Hermes `Start`/`Stop`/`Restart` prefer `systemctl --user {start,stop,restart} hermes-gateway-<profile>.service` when that unit exists; fall back to the P2 pgrep/SIGTERM path otherwise.

- [ ] **Step 1: Failing test** — with a fake `systemctl` on PATH (a script logging its args), assert Stop invokes `systemctl --user stop hermes-gateway-<profile>.service`; when the fake reports the unit absent, assert the pgrep/signal fallback runs.
- [ ] **Step 2: Run → FAIL**.
- [ ] **Step 3: Implement** — detect the unit (`systemctl --user list-unit-files` / `is-enabled`), branch accordingly.
- [ ] **Step 4: Run → PASS** — `go test ./internal/descriptor/... -race`.
- [ ] **Step 5: Commit** — `feat(node): Hermes lifecycle via systemctl --user when available (P3)`

---

## Task 7: hub — same-site cookie config + unified origin allowlist (#71, #89)

**Files:** Modify `apps/hub/src/config.ts`, `apps/hub/src/auth/drizzle-auth.ts`, `apps/hub/src/middleware/csrf.ts`, `apps/hub/src/index.ts` (cors); test `apps/hub/src/auth/cookie-config.test.ts`, extend an origins test.

**Interfaces — Produces:**
- `config.ts`: a single `allowedOrigins: string[]` (env `ALLOWED_ORIGINS` + sane defaults incl. `https://app.agentpod.dev` and `http://localhost:1420`) and `isAllowedOrigin(origin)`. Cookie config from env: `COOKIE_DOMAIN` (e.g. `.agentpod.dev`, unset in dev), `COOKIE_SECURE` (true in prod). CORS, CSRF, and the WS Origin check ALL consume `isAllowedOrigin`.
- Better Auth (`drizzle-auth.ts`): `advanced.crossSubDomainCookies`/cookie attributes set `Domain=COOKIE_DOMAIN`, `SameSite=Lax`, `Secure=COOKIE_SECURE`; `trustedOrigins` = `allowedOrigins`.

- [ ] **Step 1: Failing test** — `cookie-config.test.ts`: with `COOKIE_DOMAIN=.agentpod.dev COOKIE_SECURE=true`, the Better Auth cookie options include `domain:".agentpod.dev"`, `sameSite:"lax"`, `secure:true`; with them unset (dev), `domain` is undefined and `secure` false. Origins test: `isAllowedOrigin("https://app.agentpod.dev")===true`, random origin false; assert CORS + CSRF + WS all import the same helper (no second list).
- [ ] **Step 2: Run → FAIL** — `cd apps/hub && bun test src/auth/cookie-config.test.ts`.
- [ ] **Step 3: Implement** — unify the lists; env-drive the cookie. Keep dev (`http://localhost`) working (no Secure/Domain).
- [ ] **Step 4: Run → PASS**; run the existing auth/terminal/origin tests to confirm no regression (local docker pg `:5434`).
- [ ] **Step 5: Commit** — `feat(hub): same-site cookie config + unified origin allowlist (#71,#89,P3)`

---

## Task 8: hub — persist + return `matrixId`

**Files:** Modify `apps/hub/src/db/schema/stations.ts` (+ a Drizzle migration), `apps/hub/src/services/station-registry.ts`; test `station-registry.test.ts` (extend).

**Interfaces — Consumes:** `Station.matrixId` from the node (Task 2 over the wire). **Produces:** the `stations` table gains a nullable `matrix_id text`; adopt persists it; detect annotation + the station read APIs include `matrixId`.

- [ ] **Step 1: Failing test** — adopt a station whose detect payload includes `matrixId:"@a:id.agentpod.dev"`; assert the stored + returned row has `matrixId` set; a station without it → null. (Apply migrations via `ensurePgMigrations()`.)
- [ ] **Step 2: Run → FAIL**.
- [ ] **Step 3: Implement** — add the column + generate the migration; thread `matrixId` through adopt + the station serializers.
- [ ] **Step 4: Run → PASS** — against fresh local docker pg `:5434`.
- [ ] **Step 5: Commit** — `feat(hub): persist + return station matrixId (P3)`

---

## Task 9: console — Matrix ID display + deep-link

**Files:** Modify `apps/console/src/lib/api/client.ts` (`StationRow.matrixId`), `apps/console/src/lib/components/stations/HealthPanel.svelte`; test `HealthPanel.svelte.test.ts` (extend).

**Interfaces — Consumes:** `StationRow.matrixId`. **Produces:** when `matrixId` is set, the Health panel shows it with a link to `https://matrix.to/#/<matrixId>` (target `_blank`, `rel="noopener"`); when null, the row is omitted.

- [ ] **Step 1: Failing test** — render HealthPanel with a station having `matrixId:"@a:id.agentpod.dev"` → a link with `href="https://matrix.to/#/@a:id.agentpod.dev"` is present; with null → no Matrix row.
- [ ] **Step 2: Run → FAIL** — `cd apps/console && pnpm test HealthPanel`.
- [ ] **Step 3: Implement** — add `matrixId` to `StationRow`; render the row + link. (HealthPanel already receives `stationId`; pass the station's `matrixId` via the station object the page already loads, or fetch it — match the existing data flow.)
- [ ] **Step 4: Run → PASS**; `pnpm check`; `pnpm build`.
- [ ] **Step 5: Commit** — `feat(console): show station Matrix ID + matrix.to deep-link (P3)`

---

## Task 10: deploy — hub onto the Matrix box (PRODUCTION, operator-gated)

**Files:** Create `deploy/nginx/hub.agentpod.dev.conf`, `deploy/agentpod-hub.service`, `deploy/README-deploy.md`. **No app-code changes** — this task produces deployment artifacts + a runbook. The actual server changes are operator-gated and run during execution, not authored blind.

**Interfaces — Produces:**
- `hub.agentpod.dev.conf` — nginx server block: `server_name hub.agentpod.dev;`, TLS (certbot), `location /` → `proxy_pass http://127.0.0.1:3001;` with **WS upgrade** headers (`proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade"; proxy_read_timeout 3600s;`) and `X-Forwarded-*`.
- `agentpod-hub.service` — runs `bun run start` from the hub dir, `Restart=always`, `Environment=DATABASE_URL=… PORT=3001 COOKIE_DOMAIN=.agentpod.dev COOKIE_SECURE=true ALLOWED_ORIGINS=https://app.agentpod.dev PUBLIC_URL=https://hub.agentpod.dev`.
- `README-deploy.md` — the exact, additive sequence (every server step gated): create DNS A-records (`hub`,`app`→178.105.68.68); `apt install postgresql` + create `agentpod` DB + `CREATE EXTENSION vector` (or pgvector pkg); copy the hub build + the service unit; run Drizzle migrations; drop in the nginx vhost, `nginx -t`, `certbot --nginx -d hub.agentpod.dev -d app.agentpod.dev`, reload; build the console with `PUBLIC_HUB_URL=https://hub.agentpod.dev` and serve `app.agentpod.dev` from nginx. **Never** edit the `id.agentpod.dev` vhost or Synapse's sqlite.

- [ ] **Step 1: Author artifacts** — write the nginx conf, the systemd unit, and the runbook with exact commands + the additive/safety guardrails.
- [ ] **Step 2: Lint** — `nginx -t` against the conf in a local nginx container if available; `systemd-analyze verify` the unit; shellcheck any snippets.
- [ ] **Step 3: Execute deploy (operator-gated)** — run the runbook on `178.105.68.68`, confirming `nginx -t` before each reload and that Synapse + `id.agentpod.dev` stay up throughout.
- [ ] **Step 4: Validate** — `curl https://hub.agentpod.dev/health` returns ok over TLS; `https://app.agentpod.dev` serves the console; `id.agentpod.dev` (Matrix) still responds.
- [ ] **Step 5: Commit** — `chore(deploy): hub nginx vhost + systemd unit + runbook (P3)`

---

## Task 11: staged remote verification (runbook + screenshots)

**Files:** Create `docs/superpowers/plans/p3-remote-e2e.md`.

- [ ] **Step 1:** With the hub live, open `https://app.agentpod.dev`, sign in; confirm in devtools the session cookie is `Domain=.agentpod.dev; Secure; SameSite=Lax`.
- [ ] **Step 2:** On **buddhimaan**, install the node-agent as a service: `install-node-agent.sh https://hub.agentpod.dev <token>`; confirm it shows **online with NO tunnel**, and survives `systemctl restart agentpod-node` + a network blip (reconnect).
- [ ] **Step 3:** Adopt a Hermes station; confirm Health shows the **Matrix ID** (`@…:id.agentpod.dev`) + the `matrix.to` link; drive **terminal**, **fs read**, and **logs.tail** (now bounded) end-to-end over the public `wss://` path.
- [ ] **Step 4:** Reboot the box (or restart the service) → agent auto-starts + reconnects. Roll out to the remaining fleet hosts.
- [ ] **Step 5:** Write the verified runbook + screenshots; commit (`docs: P3 remote E2E runbook`).

---

## Self-Review

- **Spec coverage:** topology/deploy (T10), Postgres (T10), auth same-site cookie + #71 (T7), #89 origin unify (T7), node wss+reconnect (T3), node systemd/install (T5), Matrix level-A: contract (T1) → node read-mxid-not-token (T2) → hub persist/return (T8) → console show+deep-link (T9), #70 logs tail (T4), Hermes systemctl lifecycle (T6), staged verification (T11). All spec §1–§8 map to tasks.
- **Placeholder scan:** none — each task has concrete files, interfaces, test code, commands. T10/T11 are explicitly deployment/manual runbooks (no unit tests possible) with validation gates, marked operator-gated.
- **Type consistency:** `matrixId` (contract camelCase) ↔ `MatrixId *string` (Go) ↔ `matrix_id` (DB column) ↔ `StationRow.matrixId` (console) — mappings stated per task. `isAllowedOrigin`/`allowedOrigins` used consistently (T7 defines, CORS/CSRF/WS consume). `MatrixIDFromProfile` signature consistent (T2 defines, descriptors consume).
- **Safety:** Matrix token-never-leaked is a dedicated test (T2); deploy additivity/Synapse-untouched is a guardrail in T10.
