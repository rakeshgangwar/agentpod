# P1 End-to-End Verification Runbook

Verified on: 2026-06-27
Branch: `redesign/fleet-console`
Result: **PASS** — detect (20 stations), adopt, health, file-browse, and log-tail all confirmed working read-only through the REAL hub.

> **Bug fixed during verification:** `VERB_RESULTS.detect` in `packages/contract/src/protocol.ts` was typed as `z.array(DetectedStation)` (requiring `adopted: boolean` from the node). The node correctly returns plain `Station[]`; the hub adds `adopted` from its DB. Fixed to `z.array(Station)`.

---

## Automated Path (no browser required)

### Prerequisites

- Docker container `agentpod-test-postgres` running on `localhost:5434` (user/pw `agentpod`/`agentpod-dev-password`)
- Go 1.21+ installed
- Bun installed
- `pgvector` extension available in the postgres image

### Step 1: Create fresh database and run migrations

```bash
# Drop and recreate the p1e2e test database
docker exec agentpod-test-postgres psql -U agentpod -c 'DROP DATABASE IF EXISTS p1e2e;'
docker exec agentpod-test-postgres psql -U agentpod -c 'CREATE DATABASE p1e2e;'

# Enable pgvector extension (required by knowledge_documents migration)
docker exec agentpod-test-postgres psql -U agentpod -d p1e2e -c 'CREATE EXTENSION IF NOT EXISTS vector;'

# Run all migrations
cd apps/hub
DATABASE_URL=postgres://agentpod:agentpod-dev-password@localhost:5434/p1e2e bun run db:migrate
```

Expected: `[✓] migrations applied successfully!`

### Step 2: Start the hub

```bash
cd apps/hub
DATABASE_URL=postgres://agentpod:agentpod-dev-password@localhost:5434/p1e2e \
  PORT=3001 \
  API_TOKEN=e2e-test-token \
  bun run start &

# Wait until listening:
until curl -s http://localhost:3001/health > /dev/null 2>&1; do sleep 2; done
curl http://localhost:3001/health
```

Expected: `{"status":"ok","timestamp":"..."}`

> **Note:** The hub waits up to 30 s for MetaMCP tables (retries 10x × 3 s). It proceeds once it exhausts retries — typically ~30 s after startup.

### Step 3: Auth — create a user and get a session token

AgentPod uses Better Auth with email/password enabled in dev. Use the HTTP API:

```bash
# Sign up (first user becomes admin)
SIGNUP=$(curl -s -X POST http://localhost:3001/api/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -d '{"email":"e2e-test@agentpod.local","password":"e2ePassword123!","name":"E2E Test User"}')

SESSION_TOKEN=$(echo "$SIGNUP" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
echo "Session token: $SESSION_TOKEN"
```

Expected: a `{"token":"...","user":{...}}` JSON response. Extract the `token` field.

To sign in on subsequent runs (user already exists):

```bash
SIGNIN=$(curl -s -X POST http://localhost:3001/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -d '{"email":"e2e-test@agentpod.local","password":"e2ePassword123!"}')
SESSION_TOKEN=$(echo "$SIGNIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
```

### Step 4: Mint an enrollment token

```bash
ENR=$(curl -s -X POST http://localhost:3001/api/enrollment-tokens \
  -H "Authorization: Bearer $SESSION_TOKEN" \
  -H "Content-Type: application/json")
ENROLL_TOKEN=$(echo "$ENR" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
echo "Enrollment token: $ENROLL_TOKEN"
```

Expected: `{"token":"enr_...","expiresAt":"..."}` — the token is valid for 1 hour.

### Step 5: Build the Go node-agent

```bash
cd apps/node-agent
go build -o /tmp/agentpod-node ./cmd/agentpod-node
```

Expected: exits 0, binary at `/tmp/agentpod-node`.

### Step 6: Enroll and run the node-agent

```bash
# Enroll (one-shot, stores credentials in ~/.config/agentpod-node/config.json)
/tmp/agentpod-node enroll --hub http://localhost:3001 --token "$ENROLL_TOKEN"
# Expected output: enrolled: node_<id>

# Run (background — connects via WebSocket gateway)
/tmp/agentpod-node run &
# Expected: "connecting to http://localhost:3001 as node_<id>"
```

### Step 7: Confirm node is online

```bash
curl -s http://localhost:3001/api/nodes \
  -H "Authorization: Bearer $SESSION_TOKEN" | python3 -m json.tool
```

Expected (real output):
```json
[{
  "id": "node_dd6079b445684b6892bb",
  "name": "Rakeshs-MacBook-Pro.local",
  "hostname": "Rakeshs-MacBook-Pro.local",
  "os": "darwin",
  "arch": "arm64",
  "cpuCount": 8,
  "status": "online",
  "lastSeenAt": "2026-06-27T15:58:59.889Z",
  "createdAt": "2026-06-27T15:56:20.279Z"
}]
```

Extract the node ID:
```bash
NODE_ID=$(curl -s http://localhost:3001/api/nodes \
  -H "Authorization: Bearer $SESSION_TOKEN" | \
  python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])")
echo "Node ID: $NODE_ID"
```

### Step 8: Detect Claude Code stations

```bash
curl -s "http://localhost:3001/api/nodes/$NODE_ID/detected" \
  -H "Authorization: Bearer $SESSION_TOKEN" | python3 -c "
import sys,json
data=json.load(sys.stdin)
print(f'Total detected: {len(data)}')
for s in data:
    print(f'  {s[\"harness\"]:12} {s[\"key\"]:30} {s[\"displayName\"]}')
"
```

Real output from this laptop (20 stations — 19 Claude Code + 1 OpenClaw):
```
Total detected: 20
  openclaw     openclaw                       OpenClaw
  claude-code  claude-code:18be38ff           agentpod
  claude-code  claude-code:1e0eaf51           periscope-claude-template
  claude-code  claude-code:f87879b0           kaambaan
  claude-code  claude-code:6fd60a3a           homeassistant
  claude-code  claude-code:c2c9f8e2           periscope
  claude-code  claude-code:570fa980           discord-bot
  claude-code  claude-code:a8b199ad           buddhimaan
  claude-code  claude-code:37aa52a1           openclaw
  claude-code  claude-code:4a1482de           research
  claude-code  claude-code:45fe9a27           Claude
  claude-code  claude-code:8a5edab2           /
  claude-code  claude-code:3d1b82ff           ClaudeWorkspace
  claude-code  claude-code:44cb06df           drip_pilot
  claude-code  claude-code:bf9947fa           erpnext-mcp-server
  claude-code  claude-code:6801f54b           superchotu
  claude-code  claude-code:aca66223           rakeshgangwar
  claude-code  claude-code:7bfd248e           periscope-workspace
  claude-code  claude-code:48c62ea7           .claude
  claude-code  claude-code:a1326559           demo
```

> **Note:** Codex sessions directory exists (`~/.codex/sessions`) but project-history mapping is not yet implemented; Codex leaf stations must be added via declaration. This is expected behavior.

Extract the agentpod station key:
```bash
STATION_KEY=$(curl -s "http://localhost:3001/api/nodes/$NODE_ID/detected" \
  -H "Authorization: Bearer $SESSION_TOKEN" | \
  python3 -c "import sys,json; data=json.load(sys.stdin); print([s['key'] for s in data if s['displayName']=='agentpod'][0])")
echo "Station key: $STATION_KEY"
# claude-code:18be38ff
```

### Step 9: Adopt a station

```bash
ADOPT=$(curl -s -X POST "http://localhost:3001/api/nodes/$NODE_ID/stations/adopt" \
  -H "Authorization: Bearer $SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"keys\":[\"$STATION_KEY\"]}")
echo "$ADOPT" | python3 -m json.tool

STATION_ID=$(echo "$ADOPT" | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])")
echo "Station ID: $STATION_ID"
```

Expected (real output):
```json
[{
  "id": "station_09244921-5f54-4274-80f3-361ad0209626",
  "userId": "hguYExC2hTUBy2o6LPU5sGAXfejdLelz",
  "nodeId": "node_dd6079b445684b6892bb",
  "harness": "claude-code",
  "stationKey": "claude-code:18be38ff",
  "kind": "leaf",
  "parentStationId": null,
  "displayName": "agentpod",
  "workspacePath": "/Users/rakeshgangwar/Projects/agentpod",
  "capabilities": ["health", "logs", "fs.read"],
  "adoptedAt": "2026-06-27T15:59:28.417Z",
  "createdAt": "2026-06-27T15:59:28.417Z"
}]
```

### Step 10: Health check

```bash
curl -s "http://localhost:3001/api/stations/$STATION_ID/health" \
  -H "Authorization: Bearer $SESSION_TOKEN" | python3 -m json.tool
```

Real output:
```json
{
  "running": false,
  "pid": null,
  "cpuPct": null,
  "memBytes": null,
  "diskBytes": 3182053828,
  "uptimeSec": null,
  "lastActivity": "2026-06-27T15:59:32Z",
  "note": null
}
```

`running: false` means no active Claude Code session at query time (expected — no session was open). `diskBytes` and `lastActivity` confirm the station's workspace is accessible.

### Step 11: File browse

```bash
# List project root
curl -s "http://localhost:3001/api/stations/$STATION_ID/files?path=." \
  -H "Authorization: Bearer $SESSION_TOKEN" | \
  python3 -c "import sys,json; [print(e['type'],e['name']) for e in json.load(sys.stdin)[:10]]"
```

Real output (first 10 of 43 entries):
```
file .DS_Store
dir  .conductor
file .env
file .env.example
dir  .forgejo
dir  .git
dir  .github
file .gitignore
dir  .idea
dir  .opencode
```

### Step 12: File read

```bash
# Read a specific file
curl -si "http://localhost:3001/api/stations/$STATION_ID/file?path=.gitignore" \
  -H "Authorization: Bearer $SESSION_TOKEN"
```

Real output:
```
HTTP/1.1 200 OK
Content-Type: text/plain; charset=utf-8
X-Truncated: false
...

# OS
.DS_Store

# Dependencies
node_modules
...
```

`X-Truncated: false` confirms the file was not capped.

### Step 13: Log tail (SSE stream)

```bash
# Stream log events (Ctrl-C to stop, or --max-time N for auto-stop)
curl -s --max-time 5 "http://localhost:3001/api/stations/$STATION_ID/logs" \
  -H "Authorization: Bearer $SESSION_TOKEN" \
  -H "Accept: text/event-stream"
```

Real output (first event, truncated for readability):
```
data: {"parentUuid":null,"isSidechain":true,"promptId":"7867d19a-...","type":"user","message":{"role":"user","content":"You are reviewing..."}}

data: {"type":"assistant","message":{"role":"assistant","content":[...]}}
...
```

The stream returned all Claude Code session JSONL events for the agentpod project (17.8 MB of log data). The hub forwards chunks as SSE `data:` events. Cancellation works when the client disconnects.

### Step 14: Teardown

```bash
# Kill hub and node-agent
kill $(lsof -ti:3001) 2>/dev/null
kill $(cat /tmp/node-agent-p1e2e.pid) 2>/dev/null

# Drop the test database
docker exec agentpod-test-postgres psql -U agentpod -c 'DROP DATABASE IF EXISTS p1e2e;'
```

---

## Via the UI (Console Walkthrough)

The SvelteKit console reads `PUBLIC_HUB_URL` at **build time** (default `http://localhost:3001`).

### Start the console

```bash
cd apps/console
PUBLIC_HUB_URL=http://localhost:3001 bun run dev
# Open http://localhost:5173 (or whatever port Vite picks)
```

### Sign in

- Navigate to the login page
- Sign in with `e2e-test@agentpod.local` / `e2ePassword123!`

### Navigate to the fleet

1. In the sidebar, click **Nodes** (or navigate to `/nodes`)
2. You should see `Rakeshs-MacBook-Pro.local` with status **online**
3. Click the node to open its detail view
4. The **Detected** tab lists all 20 stations from the node-agent's `detect` verb

### Adopt a station

1. On the node detail page, find `agentpod` in the station list
2. Click **Adopt** (or the adopt toggle)
3. The station moves to the **Adopted** tab

### Observe the station

Click the adopted `agentpod` station to open its panel:

| Panel | What it shows |
|-------|---------------|
| **Health** | `running: false`, `diskBytes: ~3GB`, `lastActivity` timestamp |
| **Files** | Directory tree of `/Users/rakeshgangwar/Projects/agentpod` — click to navigate subdirs, click a file to preview content |
| **Logs** | SSE stream of the session JSONL — auto-scrolls as new events arrive |

All panels are **read-only** — no write or exec operations are exposed.

---

## Known Limitations / Follow-up

| Item | Status |
|------|--------|
| Codex leaf stations | Not yet detected (project-history mapping not implemented); logs at `WARN` level |
| `running: true` detection on macOS | Uses `ps aux | grep` which may miss short-lived sessions; degrades gracefully to `running: false` |
| VPS fleet (Hermes/OpenClaw) | Not verified in this runbook — requires Tailscale connectivity and a separate node enrollment against the production hub |
| Console `PUBLIC_HUB_URL` | Build-time variable; changing hub URL requires a `bun run build` or dev-server restart |

---

## Contract Bug Fixed

During verification, `VERB_RESULTS.detect` in `packages/contract/src/protocol.ts` was found to use `z.array(DetectedStation)` (requiring `adopted: boolean` in the node's response). The node correctly returns `Station[]` without `adopted`; the hub annotates `adopted` from its DB. The schema was corrected to `z.array(Station)`. This fix is included in this commit.
