# P2 — Write Operations E2E Runbook (verified)

End-to-end verification of the P2 write-ops phase against the **real node-agent + real filesystem** on this laptop, driven at the API/WebSocket level (the Playwright MCP browser was unavailable this session — see "Browser screenshots" below).

## Stack
```bash
# DB (local docker postgres :5434) — CREATE must be its own statement
docker exec agentpod-test-postgres psql -U agentpod -d agentpod -v ON_ERROR_STOP=1 -c 'DROP DATABASE IF EXISTS p2e2e'
docker exec agentpod-test-postgres psql -U agentpod -d agentpod -v ON_ERROR_STOP=1 -c 'CREATE DATABASE p2e2e'
docker exec agentpod-test-postgres psql -U agentpod -d p2e2e -c 'CREATE EXTENSION IF NOT EXISTS vector'
# hub :3001 (self-migrates — incl. 0019 station_audit)
( cd apps/hub && DATABASE_URL=postgres://agentpod:agentpod-dev-password@localhost:5434/p2e2e PORT=3001 bun run start & )
# console :1420
( cd apps/console && PUBLIC_HUB_URL=http://localhost:3001 pnpm dev & )
# node-agent
( cd apps/node-agent && go build -o /tmp/agentpod-node ./cmd/agentpod-node )
```
Note: shell here is **zsh**, which does NOT word-split unquoted variables — pass `-H` headers inline, not via a `$VAR`.

## Verified flow (all against the real node-agent + FS)
1. **Auth** — `POST /api/auth/sign-up/email` (first account bootstraps as admin even with public signup disabled) → session cookie. ✅
2. **Enroll** — `POST /api/enrollment-tokens` → `agentpod-node enroll` → `run`. Node shows **online**. ✅
3. **Capabilities (the E2E caught + fixed a gap):** the agentpod station now advertises `[health, logs, fs.read, fs.write, terminal, cleanup]` — `fs.write`/`terminal`/`cleanup` were missing from descriptor `detect` output (the gateway handled the verbs but the UI gated them off); fixed in `f8223c4`. Capabilities persist through **adopt**. ✅
4. **fs.write** — `POST /api/stations/:id/fs/write {path,content,encoding}` → `{bytesWritten:22}`, file present on disk with correct content. ✅
5. **Config edit + backup** — write v1, then write v2 with `backup:true` → response returns `backupPath`; on disk the `.bak` holds the OLD `{"v":1}` and the file holds `{"v":2}`. ✅
6. **fs.delete** — `POST .../fs/delete {path}` → files removed from disk. ✅
7. **cleanup.plan** — `POST .../cleanup/plan` → `{items:[], totalBytes:0}` for this workspace (the conservative per-harness enumeration finds nothing cleanable in the agentpod repo — ran cleanly, dry-run only; apply NOT exercised on the real repo). ✅
8. **Terminal** — `ws://…/api/stations/:id/terminal` with the session **Cookie** + `Origin: http://localhost:1420` (passes auth + the CSWSH Origin check) → `resize` + `input(base64("echo …\n"))` → PTY echo streamed back as base64 `{t:"data"}` → marker received. Round-trip works. ✅
9. **Activity / audit** — `GET /api/stations/:id/activity` → 6 rows, newest-first: `fs.delete×2, cleanup.plan, fs.write×3`, each `result:ok` with a **safe paramsSummary** (`path`/`backup`/`encoding` — never `content`). ✅

## Not exercised live (intentional)
- **Lifecycle stop/restart** — would kill the operator's real Hermes/OpenClaw daemon. Covered by node unit tests (`stopProcess` kills a real `sleep`, restart=stop+start) + hub route tests (capability-gate/audit). Defer to a safe-target fleet run.
- **cleanup.apply** — dry-run plan only on the real repo (apply is unit-tested incl. off-plan/escape refusal in `cleanup_test.go`).

## Browser screenshots
The Playwright MCP server disconnected earlier in this session (during the P2.0 visual run) and was not available for P2. The shell/nodes/station UI was visually verified in P2.0 (`docs/superpowers/plans/p2.0-web-shell-e2e.md`); the new P2 panels (Terminal/Cleanup/Activity tabs, writable file browser, config diff editor, lifecycle controls) are covered by component vitest suites and are now reachable (capabilities advertised). A browser screenshot pass can be run in a fresh session.

## Teardown
```bash
kill $(lsof -ti:3001) $(lsof -ti:1420); pkill -f agentpod-node
docker exec agentpod-test-postgres psql -U agentpod -d agentpod -c 'DROP DATABASE IF EXISTS p2e2e'
rm -f ~/.config/agentpod-node/config.json
```
