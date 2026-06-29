# P0 End-to-End Verification Runbook

Verified on: 2026-06-27  
Branch: `redesign/fleet-console`  
Result: **PASS** — node enrolled, went online, went offline.

---

## Automated Path (no browser required)

### Prerequisites

- Docker container `agentpod-test-postgres` running on `localhost:5434` (user/pw `agentpod`/`agentpod-dev-password`)
- Go 1.21+ installed
- Bun installed
- `pgvector` extension available in the postgres image (the `agentpod-test-postgres` container has it)

### Step 1: Create fresh database and run migrations

```bash
# Drop and recreate the p0e2e test database
docker exec agentpod-test-postgres psql -U agentpod -c 'DROP DATABASE IF EXISTS p0e2e'
docker exec agentpod-test-postgres psql -U agentpod -c 'CREATE DATABASE p0e2e'

# Enable pgvector extension (required by knowledge_documents migration)
docker exec agentpod-test-postgres psql -U agentpod -d p0e2e -c 'CREATE EXTENSION IF NOT EXISTS vector;'

# Run all migrations
cd apps/hub
DATABASE_URL=postgres://agentpod:agentpod-dev-password@localhost:5434/p0e2e bun run db:migrate
```

Expected: `[✓] migrations applied successfully!`

> **Note**: The `vector` extension must be created before running migrations because the `knowledge_documents` table uses `vector(1536)`. The docker test postgres image has pgvector installed.

### Step 2: Start the hub

```bash
cd apps/hub
DATABASE_URL=postgres://agentpod:agentpod-dev-password@localhost:5434/p0e2e PORT=3001 bun run start &
```

Wait for the server to start (~5 seconds), then verify:

```bash
curl http://localhost:3001/health
# Expected: {"status":"ok","timestamp":"..."}
```

### Step 3: Mint an enrollment token (no browser)

Create a one-off bun script (e.g., `/tmp/mint-token.ts`):

```typescript
process.env.DATABASE_URL = "postgres://agentpod:agentpod-dev-password@localhost:5434/p0e2e";

import { db } from "./src/db/drizzle.ts";
import { user } from "./src/db/schema/auth.ts";
import { mintEnrollmentToken } from "./src/services/enrollment.ts";

const TEST_USER_ID = "e2e-test-user-p0";

await db.insert(user).values({
  id: TEST_USER_ID,
  name: "E2E Test User",
  email: "e2e-test@agentpod.local",
  emailVerified: true,
  role: "user",
  createdAt: new Date(),
  updatedAt: new Date(),
}).onConflictDoNothing();

const { token, expiresAt } = await mintEnrollmentToken(TEST_USER_ID);
console.log("Enrollment token:", token);
console.log("Expires at:", expiresAt.toISOString());
process.exit(0);
```

Run it from `apps/hub/`:

```bash
DATABASE_URL=postgres://agentpod:agentpod-dev-password@localhost:5434/p0e2e bun run /tmp/mint-token.ts
```

Expected output:
```
Test user ensured: e2e-test-user-p0
Enrollment token: enr_<...>
Expires at: <1h from now>
```

### Step 4: Build the Go node-agent

```bash
cd apps/node-agent
go build -o /tmp/agentpod-node ./cmd/agentpod-node
```

Expected: exits 0, binary at `/tmp/agentpod-node`.

### Step 5: Enroll the node-agent

```bash
/tmp/agentpod-node enroll --hub http://localhost:3001 --token <TOKEN_FROM_STEP_3>
```

Expected output:
```
enrolled: node_<20-char-id>
```

This posts to `POST /public/nodes/enroll` (unauthenticated), which:
1. Validates and consumes the one-time token
2. Creates a `nodes` row with `status=offline`
3. Returns `nodeId` + `nodeSecret`
4. Saves credentials to `~/.config/agentpod-node/config.json`

### Step 6: Run the node-agent

```bash
/tmp/agentpod-node run &
NODE_AGENT_PID=$!
```

Expected output:
```
connecting to http://localhost:3001 as node_<id>
```

This connects via WebSocket to `GET /public/nodes/gateway`, sends a `hello` message with `hostInfo`, and the hub flips the node row to `status=online`.

### Step 7: Verify ONLINE status

```bash
sleep 3
docker exec agentpod-test-postgres psql -U agentpod -d p0e2e \
  -c "SELECT id, hostname, os, arch, status, last_seen_at FROM nodes;"
```

Expected:
```
            id             |         hostname          |   os   | arch  | status | last_seen_at
---------------------------+---------------------------+--------+-------+--------+-------------
 node_<id>                 | <your-hostname>           | darwin | arm64 | online | <timestamp>
```

### Step 8: Verify OFFLINE status after stopping

```bash
pkill -f "agentpod-node run"
sleep 4
docker exec agentpod-test-postgres psql -U agentpod -d p0e2e \
  -c "SELECT id, hostname, os, arch, status, last_seen_at FROM nodes;"
```

Expected:
```
            id             | hostname | os     | arch  | status  | last_seen_at
---------------------------+----------+--------+-------+---------+-------------
 node_<id>                 | ...      | darwin | arm64 | offline | <timestamp>
```

### Step 9: Teardown

```bash
# Stop hub
pkill -f "bun run src/index.ts"

# Drop the test database
docker exec agentpod-test-postgres psql -U agentpod -c 'DROP DATABASE IF EXISTS p0e2e'
```

---

## Via the UI

> **Note**: There is a known port mismatch — the console code defaults to `http://localhost:3000` but the hub runs on `3001`. Always start the console with the explicit `PUBLIC_HUB_URL`.

```bash
# Terminal 1: Start the hub (using p0e2e or your dev DB)
cd apps/hub
DATABASE_URL=postgres://agentpod:agentpod-dev-password@localhost:5434/p0e2e PORT=3001 bun run start

# Terminal 2: Start the console with the correct hub URL
cd apps/console
PUBLIC_HUB_URL=http://localhost:3001 pnpm dev
```

1. Open `http://localhost:1420` (Tauri) or `http://localhost:5173` (browser)
2. Sign in with an existing account (or create one at `/api/auth/sign-up/email`)
3. Navigate to **Nodes** (`/nodes`)
4. Click **Create enrollment token**
5. Copy the printed command — it should contain `--hub http://localhost:3001` (NOT `3000`)
6. Run the command in a terminal — expect `enrolled: node_…`
7. Run `/tmp/agentpod-node run`
8. Reload `/nodes` — the node should appear as **online** with correct os/arch/cpu
9. Stop the node-agent; reload — status flips to **offline**

---

## Concerns

1. **Port mismatch (P1 fix needed)**: The console code defaults `HUB_URL` to `http://localhost:3000` but the hub runs on port `3001`. The enrollment token UI will print a command with the wrong port unless `PUBLIC_HUB_URL=http://localhost:3001` is set at console startup. This should be fixed so the default matches.

2. **pgvector required for migration**: Running `db:migrate` on a fresh database requires the `vector` extension. The test docker image has it installed. In CI or new environments, the postgres must be `pgvector`-enabled. This is not documented in the hub README.

3. **No psql client on the host**: The host machine may not have `psql` installed. Use `docker exec agentpod-test-postgres psql ...` as a workaround.

---

## Verified Results (2026-06-27 run)

| Step | Command | Result |
|------|---------|--------|
| DB create | `docker exec ... CREATE DATABASE p0e2e` | `CREATE DATABASE` |
| DB extension | `CREATE EXTENSION IF NOT EXISTS vector` | `CREATE EXTENSION` |
| Migrations | `bun run db:migrate` | Exit 0, `[✓] migrations applied successfully!` |
| Hub start | `bun run start` | Listening on 3001 |
| Token mint | bun script | `enr_5027b9865d284cdeacda423eea52558a46dab7ebbbe1dde1744e` |
| Go build | `go build ./cmd/agentpod-node` | Exit 0 |
| Enroll | `agentpod-node enroll --hub ... --token ...` | `enrolled: node_823107f1467d4912be02` |
| Run agent | `agentpod-node run` | `connecting to http://localhost:3001 as node_823107f1467d4912be02` |
| Online check | `SELECT ... FROM nodes` | `status=online`, `hostname=Rakeshs-MacBook-Pro.local`, `os=darwin`, `arch=arm64` |
| Offline check | after `pkill` + 4s | `status=offline` |
| Teardown | `DROP DATABASE p0e2e` | `DROP DATABASE` |
