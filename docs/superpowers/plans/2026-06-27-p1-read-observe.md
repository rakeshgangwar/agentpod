# P1 — Read/Observe the Fleet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On any host where the node-agent runs, auto-**detect** the installed harnesses (Hermes, OpenClaw, Claude Code, Codex), let the operator **adopt** their stations, and for any adopted station view **health**, **tail logs** live, and **browse files** (read-only) — surfaced as a station tree in the console.

**Architecture:** Builds on P0's online node. Three new capabilities cut across all tiers: (1) a **bidirectional request/response/stream protocol** over the existing gateway WebSocket (P0 was node→hub hello/heartbeat only); (2) a **descriptor** layer in the Go node-agent that detects harnesses and reads their stations; (3) a **broker** in the hub that correlates requests/streams to a node, plus **station** persistence (adopt) and read-capability routes; and the console **station tree + panels**.

**Tech Stack:** As P0 — zod contract, Bun+Hono+Drizzle hub, Go (`coder/websocket`) node-agent, SvelteKit/Svelte-5 console. New: SSE for log streaming hub→console.

## Global Constraints

- **Branch:** `redesign/fleet-console`. Frequent commits.
- **Entity name is `station`** (not "cubicle"/"pod") everywhere — contract type, API paths (`/api/.../stations`), UI.
- **Read-only in P1:** filesystem is list/read/download only. NO write/exec/lifecycle/config-edit (those are P2).
- **Descriptors auto-detect** wherever the node-agent runs; detected stations are **candidates** the operator **adopts** before they are managed/persisted. Manual declaration is a fallback (not required in P1).
- **Wire-protocol parity:** Go structs in `apps/node-agent` MUST match the zod schemas in `packages/contract` (JSON field names exact).
- **Streaming:** request-id correlation over the **existing** gateway WS (no second socket). hub→node `req`/`cancel`; node→hub `res`/`stream`.
- **Multi-tenant-ready:** the `stations` table carries `userId`.
- **DB for tests:** local docker postgres on `localhost:5434` (NOT the SSH tunnels on 5432/5433). Hub port **3001**.
- **TDD throughout.** TS tests `bun test`; Go `go test ./...`; console `vitest`.

---

## File Structure

**Contract (`packages/contract/src/`):**
- `station.ts` (new) — `Station`, `Capability`, `StationKind`, `StationHealth`, `FsEntry`, `DetectedStation`.
- `protocol.ts` (new) — `RequestMsg`, `ResponseMsg`, `StreamMsg`, `CancelMsg`, the P1 verb param/result schemas, updated `GatewayClientMessage`/`GatewayServerMessage` unions.
- `index.ts` — export the new modules.

**node-agent (`apps/node-agent/internal/`):**
- `gateway/client.go` (modify) — inbound message read-loop + dispatcher wiring.
- `gateway/dispatch.go` (new) — verb dispatcher (unary + streaming), writes `res`/`stream`.
- `descriptor/descriptor.go` (new) — `Descriptor` interface, types, `Registry`.
- `descriptor/hermes.go`, `descriptor/openclaw.go`, `descriptor/claudecode.go`, `descriptor/codex.go` (new).
- `descriptor/*_test.go` with fixture homes under `internal/descriptor/testdata/`.

**hub (`apps/hub/src/`):**
- `db/schema/stations.ts` (new) — `stations` table.
- `services/broker.ts` (new) — `request()`/`stream()` with id correlation; pending/stream registries.
- `services/connection-manager.ts` (modify) — `Send` type widens to `GatewayServerMessage` (already), expose nothing new; broker uses `connectionManager.send`.
- `routes/gateway.ts` (modify) — route inbound `res`/`stream` to the broker.
- `routes/stations.ts` (new) — detect / adopt / list / health / files / file / logs(SSE).
- `services/station-registry.ts` (new) — adopted-station CRUD.
- `index.ts` (modify) — mount station routes.

**console (`apps/console/src/`):**
- `lib/api/client.ts` (modify) — station endpoints.
- `lib/stores/stations.svelte.ts` (new) — detected + adopted tree + per-station state.
- `routes/nodes/[id]/+page.svelte` (new) — detected+adopt+station tree.
- `routes/nodes/[id]/stations/[stationId]/+page.svelte` (new) — health + logs + files panels.
- `lib/components/stations/*` (new) — `StationTree.svelte`, `HealthPanel.svelte`, `LogTail.svelte`, `FileBrowser.svelte` (adapt existing `file-picker-modal`/`ConsolePanel`/`code-block`).

---

## Task 1: Contract — Station + observe types

**Files:** Create `packages/contract/src/station.ts`, `packages/contract/tests/station.test.ts`; modify `src/index.ts`.

**Interfaces — Produces (zod + inferred types):**
- `Capability = z.enum(["inventory","health","logs","fs.read"])`
- `StationKind = z.enum(["composite","leaf"])`
- `Station = { key:string; harness:string; kind:StationKind; displayName:string; parentKey:string|null; workspacePath:string|null; capabilities:Capability[] }`
- `StationHealth = { running:boolean; pid:number|null; cpuPct:number|null; memBytes:number|null; diskBytes:number|null; uptimeSec:number|null; lastActivity:string|null; note:string|null }`
- `FsEntry = { name:string; path:string; type:z.enum(["file","dir"]); size:number|null; modified:string|null }`
- `DetectedStation = Station & { adopted:boolean }`

- [ ] **Step 1: Failing test** — `packages/contract/tests/station.test.ts`:
```typescript
import { test, expect } from "bun:test";
import { Station, StationHealth, FsEntry, Capability } from "../src/index";
test("Station parses with a capability list", () => {
  const s = Station.parse({ key:"hermes:coder-kai", harness:"hermes", kind:"composite",
    displayName:"coder-kai", parentKey:"hermes", workspacePath:"/root/.hermes/profiles/coder-kai",
    capabilities:["health","logs","fs.read"] });
  expect(s.capabilities).toContain("logs");
});
test("Capability rejects an unknown verb", () => {
  expect(() => Capability.parse("exec")).toThrow();
});
test("FsEntry requires a type of file|dir", () => {
  expect(() => FsEntry.parse({ name:"x", path:"/x", type:"socket", size:null, modified:null })).toThrow();
});
```

- [ ] **Step 2: Run → FAIL** — `cd packages/contract && bun test tests/station.test.ts` (exports missing).

- [ ] **Step 3: Implement** — `packages/contract/src/station.ts`:
```typescript
import { z } from "zod";
export const Capability = z.enum(["inventory","health","logs","fs.read"]);
export type Capability = z.infer<typeof Capability>;
export const StationKind = z.enum(["composite","leaf"]);
export const Station = z.object({
  key: z.string().min(1), harness: z.string().min(1), kind: StationKind,
  displayName: z.string(), parentKey: z.string().nullable(),
  workspacePath: z.string().nullable(), capabilities: z.array(Capability),
});
export type Station = z.infer<typeof Station>;
export const DetectedStation = Station.extend({ adopted: z.boolean() });
export type DetectedStation = z.infer<typeof DetectedStation>;
export const StationHealth = z.object({
  running: z.boolean(), pid: z.number().nullable(), cpuPct: z.number().nullable(),
  memBytes: z.number().nullable(), diskBytes: z.number().nullable(),
  uptimeSec: z.number().nullable(), lastActivity: z.string().nullable(), note: z.string().nullable(),
});
export type StationHealth = z.infer<typeof StationHealth>;
export const FsEntry = z.object({
  name: z.string(), path: z.string(), type: z.enum(["file","dir"]),
  size: z.number().nullable(), modified: z.string().nullable(),
});
export type FsEntry = z.infer<typeof FsEntry>;
```
Append to `src/index.ts`: `export * from "./station";`

- [ ] **Step 4: Run → PASS** — `cd packages/contract && bun test`.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(contract): station + observe types (P1)"`

---

## Task 2: Contract — request/response/stream protocol

**Files:** Create `packages/contract/src/protocol.ts`, `packages/contract/tests/protocol.test.ts`; modify `src/index.ts` and `src/gateway.ts` (re-export unions).

**Interfaces — Produces:**
- `RequestMsg = { type:"req"; id:string; verb:string; params:unknown }` (hub→node)
- `ResponseMsg = { type:"res"; id:string; ok:boolean; data?:unknown; error?:string }` (node→hub)
- `StreamMsg = { type:"stream"; id:string; seq:number; chunk:string|null; eof:boolean }` (node→hub)
- `CancelMsg = { type:"cancel"; id:string }` (hub→node)
- Updated unions:
  - `GatewayClientMessage` (node→hub) = `Hello | Heartbeat | ResponseMsg | StreamMsg`
  - `GatewayServerMessage` (hub→node) = `Ack | RequestMsg | CancelMsg`
- Verb result schemas (for runtime validation of `data`): `VerbResults = { detect: DetectedStation[]; health: StationHealth; "fs.list": FsEntry[]; "fs.read": {content:string; encoding:"utf8"|"base64"; truncated:boolean} }` and param schemas `VerbParams = { detect:{}; health:{key}; "fs.list":{key,path}; "fs.read":{key,path,maxBytes?}; "logs.tail":{key,follow} }`. Export as zod objects `VERB_PARAMS`/`VERB_RESULTS` maps keyed by verb string.

- [ ] **Step 1: Failing test** — `packages/contract/tests/protocol.test.ts`:
```typescript
import { test, expect } from "bun:test";
import { GatewayServerMessage, GatewayClientMessage, RequestMsg, StreamMsg } from "../src/index";
test("server→node union includes req", () => {
  const m = GatewayServerMessage.parse({ type:"req", id:"r1", verb:"detect", params:{} });
  expect(m.type).toBe("req");
});
test("node→hub union includes stream + res, still accepts heartbeat", () => {
  expect(GatewayClientMessage.parse({ type:"stream", id:"r1", seq:0, chunk:"x", eof:false }).type).toBe("stream");
  expect(GatewayClientMessage.parse({ type:"res", id:"r1", ok:true, data:[] }).type).toBe("res");
  expect(GatewayClientMessage.parse({ type:"heartbeat", ts:1 }).type).toBe("heartbeat");
});
test("RequestMsg requires id+verb", () => {
  expect(() => RequestMsg.parse({ type:"req", verb:"detect", params:{} })).toThrow();
});
```

- [ ] **Step 2: Run → FAIL** — `cd packages/contract && bun test tests/protocol.test.ts`.

- [ ] **Step 3: Implement** — `packages/contract/src/protocol.ts`:
```typescript
import { z } from "zod";
import { DetectedStation, StationHealth, FsEntry } from "./station";
export const RequestMsg = z.object({ type: z.literal("req"), id: z.string(), verb: z.string(), params: z.unknown() });
export const ResponseMsg = z.object({ type: z.literal("res"), id: z.string(), ok: z.boolean(), data: z.unknown().optional(), error: z.string().optional() });
export const StreamMsg = z.object({ type: z.literal("stream"), id: z.string(), seq: z.number().int(), chunk: z.string().nullable(), eof: z.boolean() });
export const CancelMsg = z.object({ type: z.literal("cancel"), id: z.string() });
export type RequestMsg = z.infer<typeof RequestMsg>;
export type ResponseMsg = z.infer<typeof ResponseMsg>;
export type StreamMsg = z.infer<typeof StreamMsg>;

export const VERB_PARAMS = {
  "detect": z.object({}),
  "health": z.object({ key: z.string() }),
  "fs.list": z.object({ key: z.string(), path: z.string() }),
  "fs.read": z.object({ key: z.string(), path: z.string(), maxBytes: z.number().int().optional() }),
  "logs.tail": z.object({ key: z.string(), follow: z.boolean() }),
} as const;
export const VERB_RESULTS = {
  "detect": z.array(DetectedStation),
  "health": StationHealth,
  "fs.list": z.array(FsEntry),
  "fs.read": z.object({ content: z.string(), encoding: z.enum(["utf8","base64"]), truncated: z.boolean() }),
} as const;
```
In `src/gateway.ts`, extend the unions (import the new msgs):
```typescript
import { RequestMsg, ResponseMsg, StreamMsg, CancelMsg } from "./protocol";
export const GatewayClientMessage = z.discriminatedUnion("type", [HelloMsg, HeartbeatMsg, ResponseMsg, StreamMsg]);
export const GatewayServerMessage = z.discriminatedUnion("type", [AckMsg, RequestMsg, CancelMsg]);
```
Append to `src/index.ts`: `export * from "./protocol";`

- [ ] **Step 4: Run → PASS** — `cd packages/contract && bun test` (all suites, incl. P0's gateway/node tests).
- [ ] **Step 5: Commit** — `git commit -am "feat(contract): req/res/stream protocol + verb schemas (P1)"`

---

## Task 3: node-agent — inbound request dispatcher

**Files:** Create `apps/node-agent/internal/gateway/dispatch.go`, `dispatch_test.go`; modify `gateway/client.go`.

**Interfaces:**
- Consumes: the gateway WS conn.
- Produces:
  - `type Handler interface { Handle(ctx context.Context, verb string, params json.RawMessage, emit func(seq int, chunk string, eof bool) error) (any, bool, error) }` — returns `(result, streamed, error)`; if `streamed==true` the handler used `emit` and the dispatcher sends final `{type:"stream",eof:true}` instead of a `res`.
  - `func serve(ctx, c *websocket.Conn, h Handler)` — the read-loop: on `{type:"req"}` dispatch (in a goroutine), write `{type:"res",...}` or stream frames; track cancellations via `{type:"cancel",id}`.

- [ ] **Step 1: Failing test** — `dispatch_test.go`: an httptest WS server sends `{"type":"req","id":"1","verb":"ping","params":{}}`; a stub `Handler` returns `{ "pong": true }`; assert the agent writes `{"type":"res","id":"1","ok":true,"data":{"pong":true}}`.
```go
func TestDispatchUnaryResponse(t *testing.T) {
  got := make(chan string,1)
  srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request){
    c,_ := websocket.Accept(w,r,nil); defer c.Close(websocket.StatusNormalClosure,"")
    c.Write(context.Background(), websocket.MessageText, []byte(`{"type":"req","id":"1","verb":"ping","params":{}}`))
    _, data, _ := c.Read(context.Background()); got <- string(data)
  }))
  defer srv.Close()
  c,_,_ := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(srv.URL,"http"), nil)
  go serve(context.Background(), c, HandlerFunc(func(ctx context.Context, verb string, p json.RawMessage, emit func(int,string,bool) error)(any,bool,error){
    return map[string]bool{"pong":true}, false, nil
  }))
  select {
  case m := <-got:
    if !strings.Contains(m,`"type":"res"`) || !strings.Contains(m,`"pong":true`) { t.Fatalf("got %s", m) }
  case <-time.After(2*time.Second): t.Fatal("no response")
  }
}
```

- [ ] **Step 2: Run → FAIL** — `cd apps/node-agent && go test ./internal/gateway/ -run TestDispatch`.

- [ ] **Step 3: Implement `dispatch.go`** — `serve` reads messages; for `req`, decode `{id,verb,params}`, run `h.Handle` in a goroutine with a per-id cancellable context (stored in a `map[string]context.CancelFunc` guarded by a mutex); write `res` (unary) or rely on the handler's `emit` (which writes `stream` frames) then a final `eof` frame; on `cancel`, cancel the stored context. Provide `HandlerFunc` adapter. Writes must be serialized (a `sync.Mutex` around `c.Write`).

- [ ] **Step 4: Wire into `client.go`** — `connectOnce` currently only writes hello + heartbeats. Refactor so that after `hello`, it starts `go serve(ctx, c, handler)` (handler passed into `Run`), and the heartbeat ticker continues. Change `Run(ctx, cfg)` → `Run(ctx, cfg, handler Handler)`; update `cmd/agentpod-node/run.go` to build the handler (Task 4 supplies the real one; for now pass a handler that returns `("",false,fmt.Errorf("no handler"))` — replaced in Task 4). Ensure the existing hello-first test still passes.

- [ ] **Step 5: Run → PASS** — `cd apps/node-agent && go test ./internal/gateway/ && go build ./...`.
- [ ] **Step 6: Commit** — `git commit -am "feat(node-agent): inbound request/stream dispatcher (P1)"`

---

## Task 4: node-agent — descriptor interface, registry, verb handler

**Files:** Create `apps/node-agent/internal/descriptor/descriptor.go`, `registry.go`, `handler.go`, `*_test.go`; modify `cmd/agentpod-node/run.go`.

**Interfaces — Produces:**
```go
type Station struct {
  Key string `json:"key"`; Harness string `json:"harness"`; Kind string `json:"kind"`
  DisplayName string `json:"displayName"`; ParentKey *string `json:"parentKey"`
  WorkspacePath *string `json:"workspacePath"`; Capabilities []string `json:"capabilities"`
}
type Health struct { Running bool `json:"running"`; PID *int `json:"pid"`; CpuPct *float64 `json:"cpuPct"`;
  MemBytes *int64 `json:"memBytes"`; DiskBytes *int64 `json:"diskBytes"`; UptimeSec *int64 `json:"uptimeSec"`;
  LastActivity *string `json:"lastActivity"`; Note *string `json:"note"` }
type FsEntry struct { Name string `json:"name"`; Path string `json:"path"`; Type string `json:"type"`;
  Size *int64 `json:"size"`; Modified *string `json:"modified"` }
type Descriptor interface {
  Harness() string
  Detect() ([]Station, error)
  Health(key string) (Health, error)
  ListDir(key, path string) ([]FsEntry, error)
  ReadFile(key, path string, maxBytes int64) (content []byte, encoding string, truncated bool, err error)
  TailLogs(ctx context.Context, key string, follow bool, emit func([]byte) error) error
}
type Registry struct { /* harness -> Descriptor */ }
func (r *Registry) DetectAll() []Station
func (r *Registry) For(key string) (Descriptor, error)   // resolves by harness prefix "harness:..."
```
- `handler.go`: `NewHandler(reg *Registry) gateway.Handler` implementing the verbs `detect`, `health`, `fs.list`, `fs.read`, `logs.tail` (the last streams via `emit`). JSON field names MUST match the contract.

- [ ] **Step 1: Failing test** — `registry_test.go`: register a fake descriptor (harness `fake`) returning one station `fake:s1`; assert `DetectAll()` includes it and `For("fake:s1")` resolves it; `handler_test.go`: a `detect` request returns the station list; an `fs.list` request routes to the fake's `ListDir`.

- [ ] **Step 2: Run → FAIL** — `go test ./internal/descriptor/`.

- [ ] **Step 3: Implement** descriptor types, `Registry` (`map[string]Descriptor`, `For` splits key on first `:`), and `handler.go` mapping verbs → registry calls. Path-jail: `ListDir`/`ReadFile` resolve against the station's workspace root and reject `..` escapes (a shared helper `safeJoin(root, rel)` returning error on escape — define it here, used by all descriptors).

- [ ] **Step 4: Wire real handler** — in `cmd/agentpod-node/run.go`, build the `Registry` with the four descriptors (Tasks 5–7 add them; for now register whichever exist) and pass `descriptor.NewHandler(reg)` to `gateway.Run`.

- [ ] **Step 5: Run → PASS** — `go test ./internal/descriptor/ && go build ./...`.
- [ ] **Step 6: Commit** — `git commit -am "feat(node-agent): descriptor interface + registry + verb handler (P1)"`

---

## Task 5: node-agent — Hermes descriptor

**Files:** Create `apps/node-agent/internal/descriptor/hermes.go`, `hermes_test.go`, fixtures under `internal/descriptor/testdata/hermes/.hermes/profiles/{coder-kai,research-ray}/`.

**Interfaces:** Produces `NewHermes(home string) Descriptor` (home defaults to `~/.hermes`; injectable for tests). Keys are `hermes:<profile>`; the root runtime station is `hermes` (composite, parentKey nil); each profile is `hermes:<name>` (composite/leaf, parentKey `hermes`, workspacePath `<home>/profiles/<name>`). Capabilities `["health","logs","fs.read"]`.

- [ ] **Step 1: Failing test** — `hermes_test.go`: point `NewHermes(testdata)` at the fixture; assert `Detect()` returns the `hermes` root + two profile stations with correct keys/workspacePaths; `ListDir("hermes:coder-kai","")` lists the fixture files; `ReadFile` returns content; `ReadFile` with `..` escape errors.

- [ ] **Step 2: Run → FAIL** — `go test ./internal/descriptor/ -run Hermes`.

- [ ] **Step 3: Implement** — `Detect()`: if `<home>` exists, emit the `hermes` root, then one station per dir under `<home>/profiles/`. `Health(key)`: best-effort — check the process table for `hermes -p <profile> gateway` (via `pgrep`/reading `/proc` is Linux-only; on darwin use `ps`); fall back to `Running:false, Note:"process check unavailable"`. Compute `DiskBytes` of the workspace (walk). `ListDir`/`ReadFile`: operate under the profile workspace via `safeJoin`. `TailLogs`: tail files under `<home>/logs` (and per-profile if present) — read existing then, if `follow`, poll for appends. Prefer the `hermes` CLI when on PATH for richer data, but fixtures must work without it.

- [ ] **Step 4: Run → PASS** — `go test ./internal/descriptor/ && go build ./...`.
- [ ] **Step 5: Commit** — `git commit -am "feat(node-agent): Hermes descriptor (P1)"`

---

## Task 6: node-agent — OpenClaw descriptor

**Files:** Create `descriptor/openclaw.go`, `openclaw_test.go`, fixtures `testdata/openclaw/.openclaw/{agents/{hanuman,kubera},workspace/agent-workspaces/{hanuman,kubera}}`.

**Interfaces:** `NewOpenClaw(home string) Descriptor`. Root `openclaw` (composite); subagents `openclaw:<name>` with workspacePath `<home>/workspace/agent-workspaces/<name>` (fallback `<home>/agents/<name>` if the nested workspace is absent). Capabilities `["health","logs","fs.read"]`.

- [ ] **Step 1: Failing test** — fixture-based: `Detect()` returns root + two subagents; `ListDir`/`ReadFile` work against the nested workspace; `..` rejected.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — `Detect()`: if `<home>` exists, emit `openclaw` root + one station per dir under `<home>/agents/`. `Health`: check `openclaw … gateway` process / user systemd unit (best-effort, else `Note`); workspace disk. `ListDir`/`ReadFile` under the agent workspace. `TailLogs`: files under `<home>/logs`.
- [ ] **Step 4: Run → PASS** — `go test ./internal/descriptor/`.
- [ ] **Step 5: Commit** — `git commit -am "feat(node-agent): OpenClaw descriptor (P1)"`

---

## Task 7: node-agent — Claude Code + Codex (leaf) descriptors

**Files:** Create `descriptor/claudecode.go`, `descriptor/codex.go`, tests + fixtures `testdata/claude/.claude/{projects/-Users-me-proj/...}` and a `~/.claude.json` fixture with a `projects` map; `testdata/codex/.codex/...`.

**Interfaces:** `NewClaudeCode(home string)` / `NewCodex(home string)`. Leaf stations: key `claude-code:<hash-or-index>` with `displayName` = the project dir basename, `kind:"leaf"`, `parentKey:null`, `workspacePath` = the project dir, capabilities `["health","logs","fs.read"]`.

- [ ] **Step 1: Failing test** — Claude: given a fixture `~/.claude.json` listing two project paths (that exist in testdata), `Detect()` returns two leaf stations with those workspacePaths; `ListDir` lists the project dir; `Health` reports `Running:false` (no live process) with a workspace `DiskBytes`; `TailLogs` reads the session `.jsonl` under `~/.claude/projects/<enc>/`. Codex: analogous against `~/.codex` (enumerate from its history/sessions dir; if none, return empty — document that declaration is the fallback).

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** — Claude `Detect()`: parse `<home>/.claude.json` `projects` keys (or list `<home>/projects/*` decoding the sanitized path) → leaf stations for paths that still exist. `Health`: `Running` = is a `claude` process cwd'd in that dir (best-effort; else false), `DiskBytes` of the workspace, `LastActivity` = newest mtime in the session dir. `ListDir`/`ReadFile`: under the project dir (`safeJoin`). `TailLogs`: the project's session `.jsonl`. Codex: same shape against `~/.codex` layout; if no project history is recorded, `Detect()` returns `[]` (leaf stations come via declaration later) — `log` that clearly.

- [ ] **Step 4: Register all four** — confirm `cmd/agentpod-node/run.go` registers Hermes, OpenClaw, ClaudeCode, Codex (each `NewX("")` → default home). Run `go test ./... && go build -o /tmp/agentpod-node ./cmd/agentpod-node`.
- [ ] **Step 5: Commit** — `git commit -am "feat(node-agent): Claude Code + Codex leaf descriptors (P1)"`

---

## Task 8: hub — stations schema & migration

**Files:** Create `apps/hub/src/db/schema/stations.ts`; modify `db/schema/index.ts`; test `tests/unit/stations-schema.test.ts`.

**Interfaces:** Table `stations`: `id` (text pk), `userId` (FK user, cascade), `nodeId` (FK nodes, cascade), `harness`, `stationKey` (the node-local key), `kind`, `parentStationId` (text nullable, self-FK), `displayName`, `workspacePath` (nullable), `capabilities` (jsonb text[]), `adoptedAt`, `createdAt`. Unique on `(nodeId, stationKey)`. Index on `nodeId`, `userId`.

- [ ] **Step 1: Failing test** — assert `stations` table exposes `stationKey`, `parentStationId`, `capabilities`.
- [ ] **Step 2: Run → FAIL** — `cd apps/hub && bun test tests/unit/stations-schema.test.ts`.
- [ ] **Step 3: Implement** the Drizzle module (follow `nodes.ts` patterns); export from `schema/index.ts`.
- [ ] **Step 4: Generate migration** — `cd apps/hub && bun run db:generate`; inspect the new SQL (CREATE `stations` + unique + indexes). Confirm it does NOT renumber/duplicate prior migrations.
- [ ] **Step 5: Run → PASS** + commit — `git commit -am "feat(hub): stations schema + migration (P1)"`

---

## Task 9: hub — broker (request/stream correlation)

**Files:** Create `apps/hub/src/services/broker.ts`, `tests/unit/broker.test.ts`, `tests/integration/broker-gateway.test.ts`; modify `routes/gateway.ts`.

**Interfaces — Produces:**
- `request(nodeId:string, verb:string, params:unknown, opts?:{timeoutMs?:number}): Promise<{ok:boolean; data?:unknown; error?:string}>`
- `stream(nodeId:string, verb:string, params:unknown, onChunk:(seq:number, chunk:string|null, eof:boolean)=>void): { cancel():void }`
- `handleNodeMessage(nodeId:string, msg: ResponseMsg | StreamMsg): void` — called by `gateway.ts` onMessage to resolve pending requests / feed streams.
- Generates `id` via `crypto.randomUUID()`; sends `{type:"req",...}` / `{type:"cancel",id}` via `connectionManager.send(nodeId, …)`; pending map `id→{resolve,reject,timer}`; stream map `id→onChunk`.

- [ ] **Step 1: Failing unit test** — `broker.test.ts`: stub `connectionManager.send` to capture the outgoing `req`; call `request("n","detect",{})`; feed a matching `handleNodeMessage("n",{type:"res",id,ok:true,data:[]})`; assert the promise resolves with `{ok:true,data:[]}`. Timeout test: no response → rejects after `timeoutMs`.

- [ ] **Step 2: Run → FAIL** — `cd apps/hub && bun test tests/unit/broker.test.ts`.

- [ ] **Step 3: Implement `broker.ts`** — module-level `Map`s for pending + streams; `request` creates id, registers resolver + timeout, sends req, returns promise; `stream` registers onChunk, sends req, returns `{cancel}` that sends a `cancel` and drops the handler; `handleNodeMessage` routes `res`→pending (resolve+clear timer), `stream`→onChunk (and drop on `eof`). Guard unknown ids.

- [ ] **Step 4: Wire `gateway.ts`** — in `onMessage`, after `safeParse`, for `res`/`stream` call `broker.handleNodeMessage(authed, parsed.data)` (keep heartbeat handling). The `GatewayClientMessage` union already includes these (Task 2).

- [ ] **Step 5: Integration test** — `broker-gateway.test.ts`: start the gateway (minimal Hono app like the P0 gateway test) on a random port + local docker DB; connect a fake node WS that, on receiving a `req` with `verb:"detect"`, replies `{type:"res",id,ok:true,data:[{...DetectedStation}]}`; call `broker.request(nodeId,"detect",{})` and assert the data round-trips. (Enroll a real node first, as the P0 gateway test does.)

- [ ] **Step 6: Run → PASS** — `cd apps/hub && DATABASE_URL=...5434/agentpod bun test tests/unit/broker.test.ts tests/integration/broker-gateway.test.ts`.
- [ ] **Step 7: Commit** — `git commit -am "feat(hub): broker request/stream correlation over gateway (P1)"`

---

## Task 10: hub — detect / adopt / list station routes

**Files:** Create `apps/hub/src/services/station-registry.ts`, `routes/stations.ts`; modify `index.ts`; test `tests/integration/stations.test.ts`.

**Interfaces — Produces:**
- `station-registry.ts`: `adoptStations(userId, nodeId, detected: DetectedStation[]): Promise<Station[]>` (upsert rows; map parentKey→parentStationId), `listAdopted(userId, nodeId): Promise<StationRow[]>`, `getStation(userId, stationId)`, `unadopt(userId, stationId)`.
- Routes (authed): `GET /api/nodes/:nodeId/detected` → `broker.request(nodeId,"detect",{})` validated with `VERB_RESULTS.detect`, marking `adopted` per existing rows; `POST /api/nodes/:nodeId/stations/adopt` body `{keys:string[]}` → adopt; `GET /api/nodes/:nodeId/stations` → adopted tree; `DELETE /api/stations/:stationId` → unadopt. All scoped by `c.get("user").id` and verifying the node belongs to the user.

- [ ] **Step 1: Failing integration test** — enroll a node + connect a fake node WS that answers `detect`; `GET /api/nodes/:id/detected` returns the detected list; `POST …/stations/adopt {keys}` then `GET …/stations` returns the adopted tree with parent links resolved. (Use the authed-request test helper pattern from the P0 enrollment test for the session/user.)
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** registry + routes; mount in `index.ts` under the authed `/api` prefix. Validate node ownership before brokering.
- [ ] **Step 4: Run → PASS** (with DB override) + commit — `git commit -am "feat(hub): detect/adopt/list station routes (P1)"`

---

## Task 11: hub — read-capability routes (health, files, logs SSE)

**Files:** Modify `routes/stations.ts`; test `tests/integration/station-observe.test.ts`.

**Interfaces — Produces (authed, station ownership checked):**
- `GET /api/stations/:id/health` → `broker.request(nodeId,"health",{key})` → `StationHealth`.
- `GET /api/stations/:id/files?path=` → `broker.request(nodeId,"fs.list",{key,path})` → `FsEntry[]`.
- `GET /api/stations/:id/file?path=` → `broker.request(nodeId,"fs.read",{key,path})` → streams/returns the decoded content (set content-type best-effort; cap size).
- `GET /api/stations/:id/logs` → **SSE**: `broker.stream(nodeId,"logs.tail",{key,follow:true}, …)` piping each chunk as an SSE `data:` event; close on client disconnect (call the returned `cancel`).

- [ ] **Step 1: Failing integration test** — fake node answers `health`, `fs.list`, `fs.read`, and `logs.tail` (emits 2 stream frames + eof). Assert: health JSON; file list; file content; and the SSE endpoint yields the two chunks then ends. (For SSE, read the response body stream and assert the `data:` lines.)
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** the four routes. Use Hono's streaming for SSE (`streamSSE`); ensure `cancel` is called on abort.
- [ ] **Step 4: Run → PASS** (with DB override) + commit — `git commit -am "feat(hub): station health/files/logs(SSE) routes (P1)"`

---

## Task 12: console — station API client + store

**Files:** Modify `apps/console/src/lib/api/client.ts`; create `lib/stores/stations.svelte.ts`, `lib/stores/stations.svelte.test.ts`.

**Interfaces — Produces:**
- client: `listDetected(nodeId)`, `adoptStations(nodeId, keys:string[])`, `listStations(nodeId)`, `stationHealth(stationId)`, `listFiles(stationId, path)`, `readFile(stationId, path)`, and `logsUrl(stationId)` (returns the SSE URL for an `EventSource`).
- store `stations.svelte.ts` (runes): `detected` list, `adopted` tree, `loadDetected(nodeId)`, `adopt(nodeId, keys)`, `loadAdopted(nodeId)` — mirroring the P0 `nodes.svelte.ts` getter pattern.

- [ ] **Step 1: Failing test** — mock `api.listDetected`/`api.adoptStations`; `loadDetected` populates `detected`; `adopt` then `loadAdopted` reflects adopted. (Follow the P0 `nodes.svelte.test.ts` spy pattern; `$lib` alias already wired in `vitest.config.ts`.)
- [ ] **Step 2: Run → FAIL** — `cd apps/console && pnpm test`.
- [ ] **Step 3: Implement** client methods (reuse the `http<T>` helper) + the store.
- [ ] **Step 4: Run → PASS** + commit — `git commit -am "feat(console): station client + store (P1)"`

---

## Task 13: console — node detail page (detected + adopt + station tree)

**Files:** Create `apps/console/src/routes/nodes/[id]/+page.svelte`, `lib/components/stations/StationTree.svelte`; modify `routes/nodes/+page.svelte` (link node → detail).

**Interfaces:** `StationTree.svelte` props `{ stations: Station[]; nodeId: string }` — renders the adopted tree (recursive, using the parentKey/parentStationId relationships and the existing disclosure/`collapsible` pattern from `SessionForkTree.svelte`), each leaf linking to the station panel route.

- [ ] **Step 1: Failing test** — a `vitest` + `@testing-library/svelte` render test for `StationTree` asserting it renders a parent with its child station names. (Now `@testing-library/svelte` earns its keep.)
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** the detail page: on mount `loadDetected` + `loadAdopted`; show detected candidates with an **Adopt** button each (and adopt-all); render `StationTree` for adopted. Make `routes/nodes/+page.svelte` rows link to `/nodes/<id>`.
- [ ] **Step 4: Run → PASS** + `pnpm check` (new files clean) + commit — `git commit -am "feat(console): node detail — detect/adopt/station tree (P1)"`

---

## Task 14: console — station panels (health, logs, files)

**Files:** Create `routes/nodes/[id]/stations/[stationId]/+page.svelte`, `lib/components/stations/{HealthPanel,LogTail,FileBrowser}.svelte`.

**Interfaces:** `HealthPanel{stationId}` (fetch + render `StationHealth`); `LogTail{stationId}` (open `EventSource(api.logsUrl(stationId))`, append lines, reuse `ConsolePanel` styling, close on destroy); `FileBrowser{stationId}` (browse via `listFiles`, lazy-expand dirs like `file-picker-modal`, preview a file via `readFile` rendered with `code-block`).

- [ ] **Step 1: Failing test** — render test for `FileBrowser` with a mocked `listFiles` returning two entries; assert both names render and clicking a dir calls `listFiles` again. (`HealthPanel` similar with mocked `stationHealth`.)
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** the three panels + the station page that tabs/stacks them. `LogTail` uses `EventSource`; guard SSR (`onMount` only). Read-only — no write/delete affordances.
- [ ] **Step 4: Run → PASS** + `pnpm check` + commit — `git commit -am "feat(console): station panels — health/logs/files (P1)"`

---

## Task 15: E2E — detect → adopt → observe (the laptop fleet)

**Files:** Create `docs/superpowers/plans/p1-e2e-checklist.md`.

- [ ] **Step 1: Fresh DB + hub** — `CREATE DATABASE p1e2e` on docker pg:5434; `DATABASE_URL=...p1e2e bun run db:migrate`; start hub `PORT=3001`.
- [ ] **Step 2: Build + enroll + run** the node-agent on this laptop (`go build`, mint a token via the service script as in P0, `enroll --hub http://localhost:3001`, `run`).
- [ ] **Step 3: Detect** — `GET /api/nodes/:id/detected` (or via the console with `PUBLIC_HUB_URL=http://localhost:3001`): confirm Claude Code project stations (and Codex if present) are detected on the laptop.
- [ ] **Step 4: Adopt + observe** — adopt a Claude Code station; confirm **health** (running=false/true, disk), **file browse** (lists the project dir), and **log tail** (streams the session jsonl) — all read-only.
- [ ] **Step 5: (if reachable) repeat against the VPS** Hermes/OpenClaw over Tailscale, or note it as manual.
- [ ] **Step 6: Write the runbook** with the exact verified commands + a UI walkthrough; commit `docs: P1 end-to-end runbook`.

---

## Self-Review

- **Spec coverage (P1 = read/observe + descriptors):** inventory/station-tree (T1,T8,T10,T13) ✓, health (T1,T4–7,T11,T14) ✓, logs tail stream (T2,T4–7,T11,T14) ✓, filesystem read (T1,T4–7,T11,T14) ✓, four descriptors incl. Claude/Codex (T5–T7) ✓, auto-detect + adopt (T4,T7,T10,T13) ✓, bidirectional streaming protocol (T2,T3,T9) ✓, station naming throughout ✓, read-only enforced (no write/exec verbs defined) ✓.
- **Type consistency:** `Station`/`StationHealth`/`FsEntry`/`DetectedStation` defined in T1, mirrored as Go structs in T4 (matching JSON tags), consumed in hub T10/T11 and console T12–T14. Protocol msgs (`req`/`res`/`stream`/`cancel`) defined T2, produced/consumed by node dispatcher T3 + hub broker T9. Verb strings (`detect`,`health`,`fs.list`,`fs.read`,`logs.tail`) consistent across T2/T4/T9/T10/T11.
- **Placeholders:** none — concrete code/tests/commands. Temporary stub handler in T3 is replaced in T4.
- **Assumptions to confirm in execution:** (1) per-harness `Health` process checks are best-effort and OS-specific (Linux `/proc` vs darwin `ps`) — degrade to `Note` rather than failing; (2) the node-agent's user must be able to read the harness home dirs (privilege note from P0 — Hermes-as-root on the VPS may need the node-agent to run as root or with access); (3) Codex project-history location is uncertain — `Detect()` returns empty if absent (declaration is the fallback), logged clearly; (4) DB tests use the `localhost:5434` docker override and a seeded Better-Auth user (P0 helper).
