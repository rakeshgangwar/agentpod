# P0 — Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enroll a Go node-agent on a host and see it appear **online** (with host facts) in the AgentPod web console — the first end-to-end slice across all three tiers — plus the transition scaffolding (rename apps, archive stale docs, tag legacy, contract package).

**Architecture:** Three tiers. A **hub** (refactor of `apps/api`, Bun + Hono + Drizzle/Postgres) exposes an enrollment REST API, a node-gateway WebSocket endpoint, and a node registry. A **node-agent** (new Go binary, `apps/node-agent`) enrolls over HTTPS then dials **out** to the gateway over WSS, sends host facts, and heartbeats. A **console** (refactor of `apps/frontend`, SvelteKit web) lists nodes and mints enrollment tokens. The node↔hub wire protocol is defined once in `packages/contract` (zod) and mirrored by Go structs.

**Tech Stack:** Bun, Hono ^4.6, `hono/bun` `createBunWebSocket`, Drizzle ORM ^0.45 + postgres-js, Better Auth ^1.4, zod ^3.25, SvelteKit ^2.9 + Svelte 5 runes + Vite ^6, Go (1.22+) with `github.com/coder/websocket`, Turborepo + pnpm.

## Global Constraints

- **Branch:** all work on `redesign/fleet-console`. Frequent commits.
- **No vendor lock-in / self-hostable:** hub runs on Bun; no Cloudflare/k8s dependency in P0.
- **Single-operator, multi-tenant-ready:** every new table carries `userId` (owner) FK to `user.id`, even though one operator is assumed.
- **TDD:** write the failing test first, watch it fail, implement minimally, watch it pass, commit.
- **Package naming:** TS packages are `@agentpod/*`. Hub = `@agentpod/hub`, console = `@agentpod/console`, contract = `@agentpod/contract`.
- **TypeScript:** `~5.6.2`, ESM, strict, double quotes, semicolons. Svelte 5 runes (`$state`/`$derived`).
- **Node-agent module path:** `github.com/rakeshgangwar/agentpod/node-agent`.
- **Wire-protocol parity:** Go structs in `apps/node-agent` MUST match the zod schemas in `packages/contract`. Each is a JSON message with a `type` discriminator.

---

## File Structure

**New:**
- `packages/contract/` — `@agentpod/contract`: zod schemas + types for the node↔hub wire protocol and shared entities (Node, HostInfo, enrollment, gateway messages).
- `apps/node-agent/` — Go binary `agentpod-node` (`cmd/agentpod-node/main.go`, `internal/config`, `internal/host`, `internal/enroll`, `internal/gateway`).
- `apps/hub/src/db/schema/nodes.ts` — `nodes` + `enrollment_tokens` tables.
- `apps/hub/src/services/node-registry.ts` — CRUD over nodes.
- `apps/hub/src/services/enrollment.ts` — mint/validate tokens, enroll a node.
- `apps/hub/src/services/connection-manager.ts` — `NodeConnectionManager` interface + in-memory impl.
- `apps/hub/src/routes/enrollment-tokens.ts` — `POST /api/enrollment-tokens` (authed).
- `apps/hub/src/routes/nodes.ts` — `GET /api/nodes` (authed), `POST /api/nodes/enroll` (token-auth), `GET /api/nodes/gateway` (WSS, node-credential auth).
- `apps/console/src/lib/api/client.ts` — fetch-based hub client (replaces Tauri `invoke`).
- `apps/console/src/lib/stores/nodes.svelte.ts` — node-list store (runes).
- `apps/console/src/routes/nodes/+page.svelte` — node-list page.
- `docs/archive/` — relocated stale docs.

**Renamed (Task 2):** `apps/api` → `apps/hub` (`@agentpod/api` → `@agentpod/hub`); `apps/frontend` → `apps/console` (`@agentpod/frontend` → `@agentpod/console`).

**Modified:** `apps/hub/src/index.ts` (mount new routes + gateway websocket), `apps/hub/src/db/schema/index.ts` (export nodes), `apps/hub/drizzle.config.ts` (unchanged path), `pnpm-workspace.yaml`, `turbo.json`, root `package.json` (filters), `README.md` + `docs/README.md` (banners).

---

## Task 1: Transition chores — tag legacy, archive docs, README banners

**Files:**
- Create: `docs/archive/` (via `git mv`)
- Modify: `README.md`, `docs/README.md`

**Interfaces:**
- Consumes: nothing.
- Produces: a clean docs tree + a recoverable legacy tag `v0.0.4-opencode`.

- [ ] **Step 1: Tag the pre-redesign snapshot**

Run (the commit before the first redesign commit is the merge `18ce6a3`):
```bash
git tag -a v0.0.4-opencode 18ce6a3 -m "OpenCode-era AgentPod, frozen as legacy before fleet-console redesign"
git push origin v0.0.4-opencode
```
Expected: `* [new tag] v0.0.4-opencode -> v0.0.4-opencode`.

- [ ] **Step 2: Archive stale product docs**

Run:
```bash
mkdir -p docs/archive
git mv docs/architecture docs/archive/architecture
git mv docs/implementation docs/archive/implementation
git mv docs/features docs/archive/features
git mv docs/agents docs/archive/agents
git mv docs/onboarding-system docs/archive/onboarding-system
```
Expected: `git status` shows the five dirs renamed under `docs/archive/`.

- [ ] **Step 3: Add a redesign banner to both READMEs**

Prepend to `README.md` and `docs/README.md`:
```markdown
> ⚠️ **AgentPod is being redesigned** into a fleet/facilities console for agent runtimes.
> The current source of truth is the design spec:
> [`docs/superpowers/specs/2026-06-21-agentpod-fleet-console-design.md`](./docs/superpowers/specs/2026-06-21-agentpod-fleet-console-design.md).
> Docs describing the previous OpenCode product are under [`docs/archive/`](./docs/archive/). The OpenCode era is tagged `v0.0.4-opencode`.
```
(Adjust the relative path for `docs/README.md` to `./superpowers/specs/...` and `./archive/`.)

- [ ] **Step 4: Verify nothing else references the moved dirs**

Run: `grep -rIl -e "docs/architecture" -e "docs/implementation" -e "docs/features/" -e "docs/agents" -e "docs/onboarding-system" . | grep -v node_modules | grep -v docs/archive`
Expected: only `docs/README.md` (now updated) or no output. Fix any stragglers.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: archive OpenCode-era docs, add redesign banners (P0)"
```

---

## Task 2: Rename apps — `api`→`hub`, `frontend`→`console`

**Files:**
- Rename: `apps/api` → `apps/hub`, `apps/frontend` → `apps/console`
- Modify: `apps/hub/package.json`, `apps/console/package.json`, `pnpm-workspace.yaml`, `turbo.json`, root `package.json`

**Interfaces:**
- Consumes: nothing.
- Produces: the canonical `apps/hub` (`@agentpod/hub`) and `apps/console` (`@agentpod/console`) used by all later tasks.

- [ ] **Step 1: Move the directories**

```bash
git mv apps/api apps/hub
git mv apps/frontend apps/console
```

- [ ] **Step 2: Rename the packages**

In `apps/hub/package.json` set `"name": "@agentpod/hub"`. In `apps/console/package.json` set `"name": "@agentpod/console"`.

- [ ] **Step 3: Update root scripts that filtered the old names**

In root `package.json`, replace `--filter=@agentpod/api` → `--filter=@agentpod/hub` and `--filter=@agentpod/frontend` → `--filter=@agentpod/console`. Rename the scripts `dev:api`→`dev:hub`, `dev:frontend`→`dev:console`.

- [ ] **Step 4: Update workspace consumers of the old package name**

Run: `grep -rIl --include=package.json "@agentpod/frontend\|@agentpod/api" . | grep -v node_modules`
For each hit, update the dependency key to the new name. (`apps/console` depends on `@agentpod/types` already; no change there.)

- [ ] **Step 5: Reinstall and verify the workspace resolves**

Run: `pnpm install`
Then: `pnpm typecheck`
Expected: install succeeds; typecheck runs against `@agentpod/hub` and `@agentpod/console` (pre-existing errors unrelated to the rename are acceptable here — the point is the rename resolved).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: rename apps/api->apps/hub, apps/frontend->apps/console (P0)"
```

---

## Task 3: Scaffold `packages/contract`

**Files:**
- Create: `packages/contract/package.json`, `packages/contract/tsconfig.json`, `packages/contract/src/index.ts`, `packages/contract/tests/smoke.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `@agentpod/contract` package importable by the hub and console; `bun test` works in it.

- [ ] **Step 1: Write the failing smoke test**

`packages/contract/tests/smoke.test.ts`:
```typescript
import { test, expect } from "bun:test";
import { CONTRACT_VERSION } from "../src/index";

test("contract exposes a version", () => {
  expect(CONTRACT_VERSION).toBe("0.0.1");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/contract && bun test`
Expected: FAIL — cannot resolve `../src/index`.

- [ ] **Step 3: Create the package files**

`packages/contract/package.json`:
```json
{
  "name": "@agentpod/contract",
  "version": "0.1.0",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "test": "bun test", "typecheck": "tsc --noEmit" },
  "dependencies": { "zod": "^3.25.76" },
  "devDependencies": { "@types/bun": "latest", "typescript": "~5.6.2" }
}
```
`packages/contract/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "bundler",
    "strict": true, "declaration": true, "rootDir": "./src", "noEmit": true,
    "verbatimModuleSyntax": true, "skipLibCheck": true
  },
  "include": ["src/**/*", "tests/**/*"]
}
```
`packages/contract/src/index.ts`:
```typescript
export const CONTRACT_VERSION = "0.0.1";
```

- [ ] **Step 4: Install and verify the test passes**

Run: `pnpm install && cd packages/contract && bun test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(contract): scaffold @agentpod/contract package (P0)"
```

---

## Task 4: Contract — wire types (host info, enrollment, gateway messages)

**Files:**
- Create: `packages/contract/src/node.ts`, `packages/contract/src/gateway.ts`, `packages/contract/tests/node.test.ts`
- Modify: `packages/contract/src/index.ts`

**Interfaces:**
- Produces (zod schemas + inferred types):
  - `HostInfo` = `{ hostname: string; os: string; arch: string; cpuCount: number }`
  - `EnrollRequest` = `{ token: string; hostInfo: HostInfo }`
  - `EnrollResponse` = `{ nodeId: string; nodeSecret: string }`
  - `NodeSummary` = `{ id; name; hostname; os; arch; cpuCount; status: "online"|"offline"; lastSeenAt: string|null; createdAt: string }`
  - Gateway messages (discriminated on `type`): `HelloMsg` `{type:"hello"; hostInfo}`, `HeartbeatMsg` `{type:"heartbeat"; ts:number}`, `AckMsg` `{type:"ack"; ts:number}`.
  - `GatewayClientMessage` (node→hub) = `HelloMsg | HeartbeatMsg`; `GatewayServerMessage` (hub→node) = `AckMsg`.

- [ ] **Step 1: Write failing tests**

`packages/contract/tests/node.test.ts`:
```typescript
import { test, expect } from "bun:test";
import { HostInfo, EnrollRequest, GatewayClientMessage } from "../src/index";

test("HostInfo parses a valid payload", () => {
  const v = HostInfo.parse({ hostname: "vps1", os: "linux", arch: "amd64", cpuCount: 4 });
  expect(v.hostname).toBe("vps1");
});

test("EnrollRequest rejects a missing token", () => {
  expect(() => EnrollRequest.parse({ hostInfo: { hostname: "x", os: "linux", arch: "amd64", cpuCount: 1 } })).toThrow();
});

test("GatewayClientMessage accepts a heartbeat and rejects unknown type", () => {
  expect(GatewayClientMessage.parse({ type: "heartbeat", ts: 1 }).type).toBe("heartbeat");
  expect(() => GatewayClientMessage.parse({ type: "nope" })).toThrow();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd packages/contract && bun test tests/node.test.ts`
Expected: FAIL — exports not found.

- [ ] **Step 3: Implement the schemas**

`packages/contract/src/node.ts`:
```typescript
import { z } from "zod";

export const HostInfo = z.object({
  hostname: z.string().min(1),
  os: z.string().min(1),
  arch: z.string().min(1),
  cpuCount: z.number().int().positive(),
});
export type HostInfo = z.infer<typeof HostInfo>;

export const EnrollRequest = z.object({ token: z.string().min(1), hostInfo: HostInfo });
export type EnrollRequest = z.infer<typeof EnrollRequest>;

export const EnrollResponse = z.object({ nodeId: z.string(), nodeSecret: z.string() });
export type EnrollResponse = z.infer<typeof EnrollResponse>;

export const NodeStatus = z.enum(["online", "offline"]);
export const NodeSummary = z.object({
  id: z.string(), name: z.string(), hostname: z.string(), os: z.string(),
  arch: z.string(), cpuCount: z.number().int(),
  status: NodeStatus, lastSeenAt: z.string().nullable(), createdAt: z.string(),
});
export type NodeSummary = z.infer<typeof NodeSummary>;
```
`packages/contract/src/gateway.ts`:
```typescript
import { z } from "zod";
import { HostInfo } from "./node";

export const HelloMsg = z.object({ type: z.literal("hello"), hostInfo: HostInfo });
export const HeartbeatMsg = z.object({ type: z.literal("heartbeat"), ts: z.number() });
export const AckMsg = z.object({ type: z.literal("ack"), ts: z.number() });

export const GatewayClientMessage = z.discriminatedUnion("type", [HelloMsg, HeartbeatMsg]);
export type GatewayClientMessage = z.infer<typeof GatewayClientMessage>;
export const GatewayServerMessage = z.discriminatedUnion("type", [AckMsg]);
export type GatewayServerMessage = z.infer<typeof GatewayServerMessage>;
```
Append to `packages/contract/src/index.ts`:
```typescript
export * from "./node";
export * from "./gateway";
```

- [ ] **Step 4: Run to verify pass**

Run: `cd packages/contract && bun test`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(contract): node + gateway wire schemas (P0)"
```

---

## Task 5: Hub — `nodes` + `enrollment_tokens` schema & migration

**Files:**
- Create: `apps/hub/src/db/schema/nodes.ts`
- Modify: `apps/hub/src/db/schema/index.ts`
- Test: `apps/hub/tests/unit/nodes-schema.test.ts`

**Interfaces:**
- Produces tables: `nodes` (id, userId, name, hostname, os, arch, cpuCount, secretHash, status `node_status` enum, lastSeenAt, createdAt) and `enrollmentTokens` (id, userId, tokenHash, expiresAt, usedAt, createdAt). Exported Drizzle table objects `nodes`, `enrollmentTokens`.

- [ ] **Step 1: Write the failing test**

`apps/hub/tests/unit/nodes-schema.test.ts`:
```typescript
import { test, expect } from "bun:test";
import { nodes, enrollmentTokens } from "../../src/db/schema/nodes";

test("nodes table has expected columns", () => {
  expect(Object.keys(nodes)).toContain("secretHash");
  expect(Object.keys(nodes)).toContain("status");
});
test("enrollmentTokens table has tokenHash", () => {
  expect(Object.keys(enrollmentTokens)).toContain("tokenHash");
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/hub && bun test tests/unit/nodes-schema.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the schema module**

`apps/hub/src/db/schema/nodes.ts`:
```typescript
import { pgTable, text, integer, timestamp, index, pgEnum } from "drizzle-orm/pg-core";
import { user } from "./auth";

export const nodeStatusEnum = pgEnum("node_status", ["online", "offline"]);

export const nodes = pgTable("nodes", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  hostname: text("hostname").notNull(),
  os: text("os").notNull(),
  arch: text("arch").notNull(),
  cpuCount: integer("cpu_count").notNull().default(0),
  secretHash: text("secret_hash").notNull(),
  status: nodeStatusEnum("status").notNull().default("offline"),
  lastSeenAt: timestamp("last_seen_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("nodes_user_id_idx").on(t.userId)]);

export const enrollmentTokens = pgTable("enrollment_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("enrollment_tokens_user_id_idx").on(t.userId)]);
```
Add to `apps/hub/src/db/schema/index.ts`: `export * from "./nodes";`

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/hub && bun test tests/unit/nodes-schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Generate the migration**

Run: `cd apps/hub && bun run db:generate`
Expected: a new SQL file under `src/db/drizzle-migrations/` creating `node_status`, `nodes`, `enrollment_tokens`. Inspect it.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(hub): nodes + enrollment_tokens schema and migration (P0)"
```

---

## Task 6: Hub — enrollment service, node registry, REST routes

**Files:**
- Create: `apps/hub/src/services/node-registry.ts`, `apps/hub/src/services/enrollment.ts`, `apps/hub/src/routes/nodes.ts`, `apps/hub/src/routes/enrollment-tokens.ts`
- Modify: `apps/hub/src/index.ts`
- Test: `apps/hub/tests/unit/enrollment.test.ts`

**Interfaces:**
- Consumes: `nodes`, `enrollmentTokens` (Task 5); `db` (`src/db/drizzle.ts`); `HostInfo`, `EnrollResponse`, `NodeSummary` (Task 4); `c.get("user")` (Better Auth).
- Produces:
  - `mintEnrollmentToken(userId: string, ttlMs?: number): Promise<{ token: string; expiresAt: Date }>`
  - `enrollNode(token: string, hostInfo: HostInfo): Promise<EnrollResponse>` (throws on invalid/expired/used token)
  - `verifyNodeCredential(nodeId: string, nodeSecret: string): Promise<boolean>`
  - `listNodes(userId: string): Promise<NodeSummary[]>`
  - Routes: `POST /api/enrollment-tokens` (authed) → `{token, expiresAt}`; `POST /api/nodes/enroll` (no session; token in body) → `EnrollResponse`; `GET /api/nodes` (authed) → `NodeSummary[]`.

- [ ] **Step 1: Write the failing test (token mint→enroll→list round trip)**

`apps/hub/tests/unit/enrollment.test.ts`:
```typescript
import { test, expect } from "bun:test";
import { mintEnrollmentToken, enrollNode, verifyNodeCredential, listNodes } from "../../src/services/enrollment";

const USER = "test-user-id"; // a seeded test user id (see tests/setup)

test("mint -> enroll -> verify -> list", async () => {
  const { token } = await mintEnrollmentToken(USER);
  const { nodeId, nodeSecret } = await enrollNode(token, { hostname: "vps1", os: "linux", arch: "amd64", cpuCount: 4 });
  expect(await verifyNodeCredential(nodeId, nodeSecret)).toBe(true);
  expect(await verifyNodeCredential(nodeId, "wrong")).toBe(false);
  const list = await listNodes(USER);
  expect(list.find((n) => n.id === nodeId)?.hostname).toBe("vps1");
});

test("a token cannot be reused", async () => {
  const { token } = await mintEnrollmentToken(USER);
  await enrollNode(token, { hostname: "a", os: "linux", arch: "amd64", cpuCount: 1 });
  await expect(enrollNode(token, { hostname: "b", os: "linux", arch: "amd64", cpuCount: 1 })).rejects.toThrow();
});
```
(If the test DB needs a seeded user, follow the existing pattern in `apps/hub/tests/` setup; reuse the helper that creates a Better Auth user.)

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/hub && bun test tests/unit/enrollment.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the registry**

`apps/hub/src/services/node-registry.ts`:
```typescript
import { eq } from "drizzle-orm";
import { db } from "../db/drizzle";
import { nodes } from "../db/schema/nodes";
import type { NodeSummary } from "@agentpod/contract";

export async function listNodes(userId: string): Promise<NodeSummary[]> {
  const rows = await db.select().from(nodes).where(eq(nodes.userId, userId));
  return rows.map((n) => ({
    id: n.id, name: n.name, hostname: n.hostname, os: n.os, arch: n.arch,
    cpuCount: n.cpuCount, status: n.status,
    lastSeenAt: n.lastSeenAt ? n.lastSeenAt.toISOString() : null,
    createdAt: n.createdAt.toISOString(),
  }));
}

export async function setNodeStatus(nodeId: string, status: "online" | "offline") {
  await db.update(nodes).set({ status, lastSeenAt: new Date() }).where(eq(nodes.id, nodeId));
}
```

- [ ] **Step 4: Implement enrollment (hash with Bun.password)**

`apps/hub/src/services/enrollment.ts`:
```typescript
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db/drizzle";
import { nodes, enrollmentTokens } from "../db/schema/nodes";
import type { HostInfo, EnrollResponse } from "@agentpod/contract";

const id = (p: string) => `${p}_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
const sha256 = async (s: string) =>
  Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))).toString("hex");

export async function mintEnrollmentToken(userId: string, ttlMs = 60 * 60 * 1000) {
  const token = id("enr") + crypto.randomUUID().replace(/-/g, "");
  const expiresAt = new Date(Date.now() + ttlMs);
  await db.insert(enrollmentTokens).values({ id: id("etk"), userId, tokenHash: await sha256(token), expiresAt });
  return { token, expiresAt };
}

export async function enrollNode(token: string, hostInfo: HostInfo): Promise<EnrollResponse> {
  const hash = await sha256(token);
  const [row] = await db.select().from(enrollmentTokens)
    .where(and(eq(enrollmentTokens.tokenHash, hash), isNull(enrollmentTokens.usedAt)));
  if (!row || row.expiresAt.getTime() < Date.now()) throw new Error("invalid or expired enrollment token");
  await db.update(enrollmentTokens).set({ usedAt: new Date() }).where(eq(enrollmentTokens.id, row.id));

  const nodeId = id("node");
  const nodeSecret = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  await db.insert(nodes).values({
    id: nodeId, userId: row.userId, name: hostInfo.hostname, hostname: hostInfo.hostname,
    os: hostInfo.os, arch: hostInfo.arch, cpuCount: hostInfo.cpuCount,
    secretHash: await Bun.password.hash(nodeSecret), status: "offline",
  });
  return { nodeId, nodeSecret };
}

export async function verifyNodeCredential(nodeId: string, nodeSecret: string): Promise<boolean> {
  const [row] = await db.select().from(nodes).where(eq(nodes.id, nodeId));
  if (!row) return false;
  return Bun.password.verify(nodeSecret, row.secretHash);
}
```

- [ ] **Step 5: Run to verify pass**

Run: `cd apps/hub && bun test tests/unit/enrollment.test.ts`
Expected: PASS.

- [ ] **Step 6: Add the routes**

`apps/hub/src/routes/enrollment-tokens.ts`:
```typescript
import { Hono } from "hono";
import { mintEnrollmentToken } from "../services/enrollment";

export const enrollmentTokenRoutes = new Hono()
  .post("/", async (c) => {
    const user = c.get("user");
    const { token, expiresAt } = await mintEnrollmentToken(user.id);
    return c.json({ token, expiresAt: expiresAt.toISOString() });
  });
```
`apps/hub/src/routes/nodes.ts`:
```typescript
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { EnrollRequest } from "@agentpod/contract";
import { enrollNode } from "../services/enrollment";
import { listNodes } from "../services/node-registry";

// Authed: list nodes for the current user.
export const nodeRoutes = new Hono()
  .get("/", async (c) => c.json(await listNodes(c.get("user").id)));

// Public (token-authenticated in body): node enrollment.
export const nodeEnrollRoutes = new Hono()
  .post("/enroll", zValidator("json", EnrollRequest), async (c) => {
    const { token, hostInfo } = c.req.valid("json");
    try {
      return c.json(await enrollNode(token, hostInfo));
    } catch (e) {
      return c.json({ error: (e as Error).message }, 401);
    }
  });
```

- [ ] **Step 7: Mount the routes**

In `apps/hub/src/index.ts`: mount `nodeEnrollRoutes` and `enrollmentTokenRoutes`/`nodeRoutes`. Enrollment is unauthenticated, so mount it on a path NOT under the `/api/*` auth middleware, e.g. `.route("/api/nodes", nodeEnrollRoutes)` BEFORE `.use("/api/*", authMiddleware)` is applied — or expose enrollment at `/enroll` outside `/api`. Concretely, add the enroll route on a public prefix:
```typescript
.route("/public/nodes", nodeEnrollRoutes)   // POST /public/nodes/enroll  (no session)
// ...after .use("/api/*", authMiddleware):
.route("/api/enrollment-tokens", enrollmentTokenRoutes)  // authed
.route("/api/nodes", nodeRoutes)                          // authed (GET /api/nodes)
```

- [ ] **Step 8: Run the full hub unit suite + typecheck**

Run: `cd apps/hub && bun test tests/unit && bun run typecheck`
Expected: PASS (new tests green; typecheck clean for new files).

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat(hub): enrollment + node registry + REST routes (P0)"
```

---

## Task 7: Hub — node-gateway WSS + connection manager

**Files:**
- Create: `apps/hub/src/services/connection-manager.ts`, `apps/hub/src/routes/gateway.ts`
- Modify: `apps/hub/src/index.ts` (mount gateway upgrade + export `websocket`)
- Test: `apps/hub/tests/unit/connection-manager.test.ts`, `apps/hub/tests/integration/gateway.test.ts`

**Interfaces:**
- Consumes: `verifyNodeCredential`, `setNodeStatus`; `GatewayClientMessage`, `AckMsg` (contract); `createBunWebSocket` from `hono/bun`.
- Produces:
  - `interface NodeConnectionManager { register(nodeId, send): void; unregister(nodeId): void; isOnline(nodeId): boolean; onlineNodeIds(): string[]; send(nodeId, msg): boolean }`
  - `connectionManager` (in-memory singleton implementing it).
  - `gatewayRoutes` (Hono) exposing `GET /public/nodes/gateway` (WSS).
  - `gatewayWebsocket` (the Bun websocket handler) merged into the root `export default`.

- [ ] **Step 1: Write the failing unit test for the manager**

`apps/hub/tests/unit/connection-manager.test.ts`:
```typescript
import { test, expect } from "bun:test";
import { InMemoryConnectionManager } from "../../src/services/connection-manager";

test("register/isOnline/unregister + send routes to the registered sink", () => {
  const cm = new InMemoryConnectionManager();
  const sent: unknown[] = [];
  cm.register("node_1", (m) => sent.push(m));
  expect(cm.isOnline("node_1")).toBe(true);
  expect(cm.send("node_1", { type: "ack", ts: 1 })).toBe(true);
  expect(sent).toEqual([{ type: "ack", ts: 1 }]);
  cm.unregister("node_1");
  expect(cm.isOnline("node_1")).toBe(false);
  expect(cm.send("node_1", { type: "ack", ts: 2 })).toBe(false);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/hub && bun test tests/unit/connection-manager.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the connection manager**

`apps/hub/src/services/connection-manager.ts`:
```typescript
import type { GatewayServerMessage } from "@agentpod/contract";

export type Send = (msg: GatewayServerMessage) => void;

export interface NodeConnectionManager {
  register(nodeId: string, send: Send): void;
  unregister(nodeId: string): void;
  isOnline(nodeId: string): boolean;
  onlineNodeIds(): string[];
  send(nodeId: string, msg: GatewayServerMessage): boolean;
}

export class InMemoryConnectionManager implements NodeConnectionManager {
  private conns = new Map<string, Send>();
  register(nodeId: string, send: Send) { this.conns.set(nodeId, send); }
  unregister(nodeId: string) { this.conns.delete(nodeId); }
  isOnline(nodeId: string) { return this.conns.has(nodeId); }
  onlineNodeIds() { return [...this.conns.keys()]; }
  send(nodeId: string, msg: GatewayServerMessage) {
    const s = this.conns.get(nodeId);
    if (!s) return false;
    s(msg); return true;
  }
}

// Swap target later (Redis pub/sub or Durable Object) without touching callers.
export const connectionManager: NodeConnectionManager = new InMemoryConnectionManager();
```

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/hub && bun test tests/unit/connection-manager.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement the gateway route (WSS)**

`apps/hub/src/routes/gateway.ts`:
```typescript
import { Hono } from "hono";
import { createBunWebSocket } from "hono/bun";
import { GatewayClientMessage } from "@agentpod/contract";
import { verifyNodeCredential } from "../services/enrollment";
import { setNodeStatus } from "../services/node-registry";
import { connectionManager } from "../services/connection-manager";

export const { upgradeWebSocket, websocket: gatewayWebsocket } = createBunWebSocket();

// Node connects with `Authorization: Bearer <nodeId>:<nodeSecret>`.
export const gatewayRoutes = new Hono().get(
  "/gateway",
  upgradeWebSocket((c) => {
    const auth = c.req.header("Authorization") ?? "";
    const [nodeId, nodeSecret] = auth.replace(/^Bearer\s+/, "").split(":");
    let authed: string | null = null;
    return {
      async onOpen(_e, ws) {
        if (!nodeId || !nodeSecret || !(await verifyNodeCredential(nodeId, nodeSecret))) {
          ws.close(1008, "unauthorized"); return;
        }
        authed = nodeId;
        connectionManager.register(nodeId, (m) => ws.send(JSON.stringify(m)));
        await setNodeStatus(nodeId, "online");
      },
      async onMessage(evt, ws) {
        if (!authed) return;
        const parsed = GatewayClientMessage.safeParse(JSON.parse(String(evt.data)));
        if (!parsed.success) return;
        if (parsed.data.type === "heartbeat") {
          await setNodeStatus(authed, "online");
          ws.send(JSON.stringify({ type: "ack", ts: Date.now() }));
        }
      },
      async onClose() { if (authed) { connectionManager.unregister(authed); await setNodeStatus(authed, "offline"); } },
    };
  }),
);
```

- [ ] **Step 6: Mount the gateway and merge the websocket handler**

In `apps/hub/src/index.ts`:
- mount the route (public, no session middleware): `.route("/public/nodes", gatewayRoutes)` → `GET /public/nodes/gateway`.
- merge the Bun websocket handlers. The existing default export already has `websocket: terminalWebsocket`. Combine both handlers so each upgrade uses its own. Simplest: since both come from `createBunWebSocket()`, create ONE shared instance in a small module `apps/hub/src/ws.ts` exporting `{ upgradeWebSocket, websocket }`, import it in both `terminal.ts` and `gateway.ts`, and export that single `websocket` in `index.ts`.
```typescript
// apps/hub/src/ws.ts
import { createBunWebSocket } from "hono/bun";
export const { upgradeWebSocket, websocket } = createBunWebSocket();
```
Update `gateway.ts` and `terminal.ts` to `import { upgradeWebSocket } from "../ws"` and `index.ts` to `import { websocket } from "./ws"` then `export default { port, fetch: app.fetch, websocket };`.

- [ ] **Step 7: Write the integration test (simulated node connection)**

`apps/hub/tests/integration/gateway.test.ts`:
```typescript
import { test, expect } from "bun:test";
import { mintEnrollmentToken, enrollNode } from "../../src/services/enrollment";
import app from "../../src/index"; // the Bun server object { port, fetch, websocket }

test("a node that connects to the gateway shows online via GET /api/nodes", async () => {
  const server = Bun.serve(app);
  try {
    const { token } = await mintEnrollmentToken("test-user-id");
    const { nodeId, nodeSecret } = await enrollNode(token, { hostname: "ws-host", os: "linux", arch: "amd64", cpuCount: 2 });
    const ws = new WebSocket(`ws://localhost:${server.port}/public/nodes/gateway`, {
      headers: { Authorization: `Bearer ${nodeId}:${nodeSecret}` },
    } as any);
    await new Promise<void>((res, rej) => { ws.onopen = () => res(); ws.onerror = () => rej(new Error("ws error")); });
    ws.send(JSON.stringify({ type: "hello", hostInfo: { hostname: "ws-host", os: "linux", arch: "amd64", cpuCount: 2 } }));
    await new Promise((r) => setTimeout(r, 200));
    const { listNodes } = await import("../../src/services/node-registry");
    const list = await listNodes("test-user-id");
    expect(list.find((n) => n.id === nodeId)?.status).toBe("online");
    ws.close();
  } finally { server.stop(true); }
});
```

- [ ] **Step 8: Run unit + integration + typecheck**

Run: `cd apps/hub && bun test tests/unit tests/integration && bun run typecheck`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat(hub): node-gateway WSS + in-memory connection manager (P0)"
```

---

## Task 8: node-agent — Go module, config, host info, `enroll`

**Files:**
- Create: `apps/node-agent/go.mod`, `apps/node-agent/cmd/agentpod-node/main.go`, `apps/node-agent/internal/config/config.go`, `apps/node-agent/internal/host/host.go`, `apps/node-agent/internal/enroll/enroll.go`
- Test: `apps/node-agent/internal/config/config_test.go`, `apps/node-agent/internal/enroll/enroll_test.go`

**Interfaces:**
- Produces:
  - `config.Config { Hub string; NodeID string; NodeSecret string }`; `config.Load(path) (Config, error)`; `config.Save(path, Config) error`; `config.DefaultPath() string`.
  - `host.Info() HostInfo` where `HostInfo { Hostname, OS, Arch string; CPUCount int }` with JSON tags matching the contract (`hostname`, `os`, `arch`, `cpuCount`).
  - `enroll.Enroll(hubURL, token string, hi host.HostInfo) (nodeID, nodeSecret string, err error)` → POSTs `/public/nodes/enroll`.
  - `main.go` dispatches subcommands `enroll` and `run`.

- [ ] **Step 1: Initialize the module**

Run:
```bash
cd apps/node-agent && go mod init github.com/rakeshgangwar/agentpod/node-agent && go get github.com/coder/websocket
```

- [ ] **Step 2: Write the failing config test**

`apps/node-agent/internal/config/config_test.go`:
```go
package config
import ("path/filepath"; "testing")
func TestSaveLoadRoundTrip(t *testing.T) {
  p := filepath.Join(t.TempDir(), "config.json")
  want := Config{Hub: "http://h", NodeID: "node_1", NodeSecret: "s"}
  if err := Save(p, want); err != nil { t.Fatal(err) }
  got, err := Load(p)
  if err != nil { t.Fatal(err) }
  if got != want { t.Fatalf("got %+v want %+v", got, want) }
}
```

- [ ] **Step 3: Run to verify failure**

Run: `cd apps/node-agent && go test ./internal/config/`
Expected: FAIL — undefined `Config`/`Save`/`Load`.

- [ ] **Step 4: Implement config**

`apps/node-agent/internal/config/config.go`:
```go
package config
import ("encoding/json"; "os"; "path/filepath")
type Config struct {
  Hub        string `json:"hub"`
  NodeID     string `json:"nodeId"`
  NodeSecret string `json:"nodeSecret"`
}
func DefaultPath() string {
  d, _ := os.UserConfigDir()
  return filepath.Join(d, "agentpod-node", "config.json")
}
func Save(path string, c Config) error {
  if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil { return err }
  b, err := json.MarshalIndent(c, "", "  "); if err != nil { return err }
  return os.WriteFile(path, b, 0o600)
}
func Load(path string) (Config, error) {
  var c Config
  b, err := os.ReadFile(path); if err != nil { return c, err }
  return c, json.Unmarshal(b, &c)
}
```

- [ ] **Step 5: Run to verify pass**

Run: `cd apps/node-agent && go test ./internal/config/`
Expected: PASS.

- [ ] **Step 6: Implement host info**

`apps/node-agent/internal/host/host.go`:
```go
package host
import ("os"; "runtime")
type HostInfo struct {
  Hostname string `json:"hostname"`
  OS       string `json:"os"`
  Arch     string `json:"arch"`
  CPUCount int    `json:"cpuCount"`
}
func Info() HostInfo {
  h, _ := os.Hostname()
  return HostInfo{Hostname: h, OS: runtime.GOOS, Arch: runtime.GOARCH, CPUCount: runtime.NumCPU()}
}
```

- [ ] **Step 7: Write the failing enroll test (httptest)**

`apps/node-agent/internal/enroll/enroll_test.go`:
```go
package enroll
import ("encoding/json"; "net/http"; "net/http/httptest"; "testing"
  "github.com/rakeshgangwar/agentpod/node-agent/internal/host")
func TestEnrollPostsAndParses(t *testing.T) {
  srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
    if r.URL.Path != "/public/nodes/enroll" { t.Fatalf("path %s", r.URL.Path) }
    json.NewEncoder(w).Encode(map[string]string{"nodeId": "node_9", "nodeSecret": "sek"})
  }))
  defer srv.Close()
  id, sec, err := Enroll(srv.URL, "tok", host.Info())
  if err != nil { t.Fatal(err) }
  if id != "node_9" || sec != "sek" { t.Fatalf("got %s/%s", id, sec) }
}
```

- [ ] **Step 8: Run to verify failure, then implement**

Run: `cd apps/node-agent && go test ./internal/enroll/` → FAIL (undefined `Enroll`).
`apps/node-agent/internal/enroll/enroll.go`:
```go
package enroll
import ("bytes"; "encoding/json"; "fmt"; "net/http"
  "github.com/rakeshgangwar/agentpod/node-agent/internal/host")
type req struct { Token string `json:"token"`; HostInfo host.HostInfo `json:"hostInfo"` }
type resp struct { NodeID string `json:"nodeId"`; NodeSecret string `json:"nodeSecret"`; Error string `json:"error"` }
func Enroll(hubURL, token string, hi host.HostInfo) (string, string, error) {
  body, _ := json.Marshal(req{Token: token, HostInfo: hi})
  r, err := http.Post(hubURL+"/public/nodes/enroll", "application/json", bytes.NewReader(body))
  if err != nil { return "", "", err }
  defer r.Body.Close()
  var out resp
  if err := json.NewDecoder(r.Body).Decode(&out); err != nil { return "", "", err }
  if r.StatusCode != 200 { return "", "", fmt.Errorf("enroll failed: %s", out.Error) }
  return out.NodeID, out.NodeSecret, nil
}
```

- [ ] **Step 9: Implement the CLI dispatch (enroll wired; run stubbed)**

`apps/node-agent/cmd/agentpod-node/main.go`:
```go
package main
import ("flag"; "fmt"; "os"
  "github.com/rakeshgangwar/agentpod/node-agent/internal/config"
  "github.com/rakeshgangwar/agentpod/node-agent/internal/enroll"
  "github.com/rakeshgangwar/agentpod/node-agent/internal/host")
func main() {
  if len(os.Args) < 2 { fmt.Println("usage: agentpod-node <enroll|run>"); os.Exit(2) }
  switch os.Args[1] {
  case "enroll":
    fs := flag.NewFlagSet("enroll", flag.ExitOnError)
    hub := fs.String("hub", "", "hub base URL"); token := fs.String("token", "", "enrollment token")
    fs.Parse(os.Args[2:])
    id, sec, err := enroll.Enroll(*hub, *token, host.Info())
    if err != nil { fmt.Fprintln(os.Stderr, err); os.Exit(1) }
    if err := config.Save(config.DefaultPath(), config.Config{Hub: *hub, NodeID: id, NodeSecret: sec}); err != nil {
      fmt.Fprintln(os.Stderr, err); os.Exit(1) }
    fmt.Println("enrolled:", id)
  case "run":
    runCmd() // implemented in Task 9
  default:
    fmt.Println("unknown command:", os.Args[1]); os.Exit(2)
  }
}
```
Add a temporary `apps/node-agent/cmd/agentpod-node/run.go` with `func runCmd() { panic("implemented in Task 9") }` so it compiles.

- [ ] **Step 10: Run all node-agent tests + build**

Run: `cd apps/node-agent && go test ./... && go build ./...`
Expected: PASS + build succeeds.

- [ ] **Step 11: Commit**

```bash
git add -A && git commit -m "feat(node-agent): Go module, config, host info, enroll command (P0)"
```

---

## Task 9: node-agent — `run` (dial WSS, hello, heartbeat, reconnect)

**Files:**
- Create: `apps/node-agent/internal/gateway/client.go`, `apps/node-agent/internal/gateway/client_test.go`
- Modify: `apps/node-agent/cmd/agentpod-node/run.go`

**Interfaces:**
- Consumes: `config.Config`, `host.Info()`, `github.com/coder/websocket`.
- Produces: `gateway.Run(ctx context.Context, cfg config.Config) error` — dials `ws(s)://<hub>/public/nodes/gateway` with `Authorization: Bearer <nodeId>:<nodeSecret>`, sends a `hello`, then a `heartbeat` every 15s; reconnects with backoff on drop.

- [ ] **Step 1: Write the failing client test (httptest WS echo)**

`apps/node-agent/internal/gateway/client_test.go`:
```go
package gateway
import ("context"; "net/http"; "net/http/httptest"; "strings"; "testing"; "time"
  "github.com/coder/websocket"
  "github.com/rakeshgangwar/agentpod/node-agent/internal/config")
func TestRunSendsHello(t *testing.T) {
  got := make(chan string, 1)
  srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
    if !strings.HasPrefix(r.Header.Get("Authorization"), "Bearer node_1:") { t.Error("missing auth") }
    c, err := websocket.Accept(w, r, nil); if err != nil { return }
    defer c.Close(websocket.StatusNormalClosure, "")
    _, data, err := c.Read(context.Background()); if err != nil { return }
    got <- string(data)
  }))
  defer srv.Close()
  ctx, cancel := context.WithCancel(context.Background()); defer cancel()
  cfg := config.Config{Hub: srv.URL, NodeID: "node_1", NodeSecret: "s"}
  go Run(ctx, cfg)
  select {
  case msg := <-got:
    if !strings.Contains(msg, `"type":"hello"`) { t.Fatalf("first msg = %s", msg) }
  case <-time.After(2 * time.Second): t.Fatal("no hello received")
  }
}
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/node-agent && go test ./internal/gateway/`
Expected: FAIL — undefined `Run`.

- [ ] **Step 3: Implement the client**

`apps/node-agent/internal/gateway/client.go`:
```go
package gateway
import ("context"; "encoding/json"; "strings"; "time"
  "github.com/coder/websocket"
  "github.com/rakeshgangwar/agentpod/node-agent/internal/config"
  "github.com/rakeshgangwar/agentpod/node-agent/internal/host")
func wsURL(hub string) string {
  u := strings.Replace(strings.Replace(hub, "http://", "ws://", 1), "https://", "wss://", 1)
  return u + "/public/nodes/gateway"
}
func Run(ctx context.Context, cfg config.Config) error {
  backoff := time.Second
  for ctx.Err() == nil {
    if err := connectOnce(ctx, cfg); err != nil {
      t := time.NewTimer(backoff); select { case <-ctx.Done(): t.Stop(); return ctx.Err(); case <-t.C: }
      if backoff < 30*time.Second { backoff *= 2 }
      continue
    }
    backoff = time.Second
  }
  return ctx.Err()
}
func connectOnce(ctx context.Context, cfg config.Config) error {
  c, _, err := websocket.Dial(ctx, wsURL(cfg.Hub), &websocket.DialOptions{
    HTTPHeader: map[string][]string{"Authorization": {"Bearer " + cfg.NodeID + ":" + cfg.NodeSecret}},
  })
  if err != nil { return err }
  defer c.Close(websocket.StatusNormalClosure, "")
  hello, _ := json.Marshal(map[string]any{"type": "hello", "hostInfo": host.Info()})
  if err := c.Write(ctx, websocket.MessageText, hello); err != nil { return err }
  ticker := time.NewTicker(15 * time.Second); defer ticker.Stop()
  for {
    select {
    case <-ctx.Done(): return ctx.Err()
    case <-ticker.C:
      hb, _ := json.Marshal(map[string]any{"type": "heartbeat", "ts": time.Now().UnixMilli()})
      if err := c.Write(ctx, websocket.MessageText, hb); err != nil { return err }
    }
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/node-agent && go test ./internal/gateway/`
Expected: PASS.

- [ ] **Step 5: Wire `run` to load config and call `gateway.Run`**

Replace `apps/node-agent/cmd/agentpod-node/run.go`:
```go
package main
import ("context"; "fmt"; "os"; "os/signal"; "syscall"
  "github.com/rakeshgangwar/agentpod/node-agent/internal/config"
  "github.com/rakeshgangwar/agentpod/node-agent/internal/gateway")
func runCmd() {
  cfg, err := config.Load(config.DefaultPath())
  if err != nil { fmt.Fprintln(os.Stderr, "not enrolled; run `agentpod-node enroll` first:", err); os.Exit(1) }
  ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM); defer stop()
  fmt.Println("connecting to", cfg.Hub, "as", cfg.NodeID)
  gateway.Run(ctx, cfg)
}
```

- [ ] **Step 6: Run all tests + build**

Run: `cd apps/node-agent && go test ./... && go build -o /tmp/agentpod-node ./cmd/agentpod-node`
Expected: PASS + binary builds.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(node-agent): run command — WSS dial, hello, heartbeat, reconnect (P0)"
```

---

## Task 10: console — hub client, node store, node-list page

**Files:**
- Create: `apps/console/src/lib/api/client.ts`, `apps/console/src/lib/stores/nodes.svelte.ts`, `apps/console/src/routes/nodes/+page.svelte`
- Test: `apps/console/src/lib/stores/nodes.svelte.test.ts`, `apps/console/vitest.config.ts`
- Modify: `apps/console/package.json` (add vitest + test script)

**Interfaces:**
- Consumes: `NodeSummary` (`@agentpod/contract`); the hub at `PUBLIC_HUB_URL` (env, default `http://localhost:3000`).
- Produces: `api.listNodes(): Promise<NodeSummary[]>`, `api.createEnrollmentToken(): Promise<{token; expiresAt}>`; a `nodes` runes store with `{ get list, get isLoading, get error }` + `fetchNodes()`; a `/nodes` page.

- [ ] **Step 1: Add vitest and a failing store test**

In `apps/console/package.json` add devDeps `"vitest": "^2.1.0"`, `"@testing-library/svelte": "^5.2.0"`, `"jsdom": "^25.0.0"` and script `"test": "vitest run"`.
`apps/console/vitest.config.ts`:
```typescript
import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";
export default defineConfig({ plugins: [svelte({ hot: false })], test: { environment: "jsdom" } });
```
`apps/console/src/lib/stores/nodes.svelte.test.ts`:
```typescript
import { test, expect, vi, beforeEach } from "vitest";
import * as api from "$lib/api/client";
import { nodes, fetchNodes } from "./nodes.svelte";

beforeEach(() => vi.restoreAllMocks());

test("fetchNodes populates the list", async () => {
  vi.spyOn(api, "listNodes").mockResolvedValue([
    { id: "node_1", name: "vps1", hostname: "vps1", os: "linux", arch: "amd64", cpuCount: 4, status: "online", lastSeenAt: null, createdAt: "2026-06-22T00:00:00Z" },
  ]);
  await fetchNodes();
  expect(nodes.list).toHaveLength(1);
  expect(nodes.list[0].status).toBe("online");
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/console && pnpm install && pnpm test`
Expected: FAIL — `$lib/api/client` / `./nodes.svelte` not found.

- [ ] **Step 3: Implement the hub client**

`apps/console/src/lib/api/client.ts`:
```typescript
import type { NodeSummary } from "@agentpod/contract";

const HUB = import.meta.env.PUBLIC_HUB_URL ?? "http://localhost:3000";

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${HUB}${path}`, { credentials: "include", ...init });
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

export const listNodes = () => http<NodeSummary[]>("/api/nodes");
export const createEnrollmentToken = () =>
  http<{ token: string; expiresAt: string }>("/api/enrollment-tokens", { method: "POST" });
```

- [ ] **Step 4: Implement the store**

`apps/console/src/lib/stores/nodes.svelte.ts`:
```typescript
import type { NodeSummary } from "@agentpod/contract";
import * as api from "$lib/api/client";

let list = $state<NodeSummary[]>([]);
let isLoading = $state(false);
let error = $state<string | null>(null);

export const nodes = {
  get list() { return list; },
  get isLoading() { return isLoading; },
  get error() { return error; },
};

export async function fetchNodes(): Promise<void> {
  isLoading = true; error = null;
  try { list = await api.listNodes(); }
  catch (e) { error = e instanceof Error ? e.message : "failed to load nodes"; }
  finally { isLoading = false; }
}
```

- [ ] **Step 5: Run to verify the store test passes**

Run: `cd apps/console && pnpm test`
Expected: PASS.

- [ ] **Step 6: Implement the page**

`apps/console/src/routes/nodes/+page.svelte`:
```svelte
<script lang="ts">
  import { onMount } from "svelte";
  import { nodes, fetchNodes } from "$lib/stores/nodes.svelte";
  import { createEnrollmentToken } from "$lib/api/client";
  let lastToken = $state<string | null>(null);
  onMount(fetchNodes);
  async function mint() { lastToken = (await createEnrollmentToken()).token; }
</script>

<h1>Nodes</h1>
<button onclick={mint}>Create enrollment token</button>
{#if lastToken}<code>agentpod-node enroll --hub http://localhost:3000 --token {lastToken}</code>{/if}

{#if nodes.isLoading}<p>Loading…</p>
{:else if nodes.error}<p class="error">{nodes.error}</p>
{:else}
  <ul>
    {#each nodes.list as n (n.id)}
      <li><strong>{n.hostname}</strong> — {n.os}/{n.arch} · {n.cpuCount} CPU · <em>{n.status}</em></li>
    {/each}
  </ul>
{/if}
```

- [ ] **Step 7: Typecheck + test**

Run: `cd apps/console && pnpm check && pnpm test`
Expected: PASS (new files clean; pre-existing Tauri-related errors elsewhere are out of scope for this task).

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat(console): hub client, node store, node-list page (P0)"
```

---

## Task 11: End-to-end verification (real node → online in console)

**Files:**
- Create: `docs/superpowers/plans/p0-e2e-checklist.md` (the runbook)

**Interfaces:**
- Consumes: everything above.
- Produces: a documented, repeatable manual E2E proving the P0 outcome.

- [ ] **Step 1: Bring up infra + hub**

Run:
```bash
docker compose up -d postgres
cd apps/hub && bun run db:migrate && bun run dev   # hub on its configured port
```
Expected: migrations apply (incl. `nodes`, `enrollment_tokens`); hub starts.

- [ ] **Step 2: Start the console and sign in**

Run: `cd apps/console && pnpm dev` → open `http://localhost:1420/nodes`, authenticate (existing Better Auth flow).
Expected: the Nodes page renders with an empty list.

- [ ] **Step 3: Mint a token and enroll the node-agent**

Click **Create enrollment token**, copy the printed command, then:
```bash
cd apps/node-agent && go build -o /tmp/agentpod-node ./cmd/agentpod-node
/tmp/agentpod-node enroll --hub http://localhost:3000 --token <PASTED_TOKEN>
/tmp/agentpod-node run
```
Expected: `enrolled: node_…` then `connecting to … as node_…`.

- [ ] **Step 4: Confirm the node shows online**

Reload `/nodes` (or it polls): the host appears with status **online**, correct os/arch/cpu. Stop the node-agent (Ctrl-C) and reload: status flips to **offline**.

- [ ] **Step 5: Capture the runbook and commit**

Write the verified steps into `docs/superpowers/plans/p0-e2e-checklist.md`, then:
```bash
git add -A && git commit -m "docs: P0 end-to-end verification runbook (P0)"
```

---

## Self-Review

- **Spec coverage (P0 scope from spec §13 + §16):** contract pkg (T3–T4) ✓, hub node-gateway + enrollment + registry (T5–T7) ✓, Go node-agent skeleton + enroll + run (T8–T9) ✓, console node-list (T10) ✓, transition: tag legacy + restructure apps + archive docs + scaffold (T1–T3) ✓, broker behind interface (T7 `NodeConnectionManager`) ✓. Cubicle enumeration/descriptors correctly deferred to P1.
- **Type consistency:** `HostInfo`/`EnrollRequest`/`EnrollResponse`/`NodeSummary`/`GatewayClientMessage`/`AckMsg` defined in T4 and consumed verbatim in T6/T7/T10; Go structs in T8 carry matching JSON tags (`hostname`,`os`,`arch`,`cpuCount`,`nodeId`,`nodeSecret`,`type`,`ts`). Gateway path `/public/nodes/gateway` consistent across T7 (server) and T9 (client). Enroll path `/public/nodes/enroll` consistent across T6 (server) and T8 (client).
- **Placeholders:** none — every code/command/test step is concrete. The only deliberate stub (`run.go` panic in T8) is replaced in T9.
- **Known assumptions to confirm during execution:** (1) the hub's dev port — code/tests use `http://localhost:3000`; align with `apps/hub` config. (2) test DB user seeding — reuse the existing `apps/hub/tests` helper for a Better Auth user (`test-user-id`). (3) mounting the public (unauthenticated) `/public/nodes/*` routes before the `/api/*` auth middleware.
