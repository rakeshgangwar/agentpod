# Node-agent Self-Update — Slice 3: Hub-Orchestrated One-Click Update (Design Spec)

**Status:** Approved (brainstorm 2026-06-30). Final slice (milestone #12; #181). Builds on Slice 1 (version + SHA256SUMS) + Slice 2 (`selfupdate` package).
**Branch:** `develop` (merge `develop`→`main`).
**Context:** Update any node from the console — no SSH. The console shows "update available" per node + an **Update** button; the hub sends an `update` verb over the gateway; the running agent self-updates in-process and restarts.

## 1. Goal & Scope

Per-node, one-click update from the console. **Update-all is out of scope** (a trivial later add). Reuses the Slice 2 `selfupdate` package on the agent.

## 2. Hub: latest-version resolution

- New `apps/hub/src/services/agent-version.ts`: `getLatestAgentVersion(): Promise<string | null>` — GETs the GitHub releases-latest API (`https://api.github.com/repos/rakeshgangwar/agentpod/releases/latest`), returns `tag_name`, **cached in-memory with a ~1h TTL** (avoid rate limits; null on fetch failure, never throws). Overridable base URL for tests.
- Expose it: `listNodes` (services/node-registry.ts) annotates each node with `latestVersion` (the cached latest) + `updateAvailable: boolean` (`agentVersion != null && latestVersion != null && agentVersion !== latestVersion`). Contract `NodeSummary` (packages/contract/src/node.ts) gains `latestVersion: z.string().nullable()` + `updateAvailable: z.boolean()`.

## 3. Hub: update endpoint

- `POST /api/nodes/:id/update` (apps/hub/src/routes/nodes.ts) — **operator-authed** (same session/auth middleware as other `/api/*` routes). Calls `broker.request(nodeId, "update", {})` (the existing RPC). Returns the agent's response (`{ ok, updating, tag }` / error). If the node is offline → 409/`{ok:false, error:"node offline"}` (broker.request already returns `{ok:false,error:"node offline"}`). The verb carries **no version** — the agent resolves latest itself.

## 4. Agent: `update` verb handler

- Refactor `internal/selfupdate`: extract `Apply(ctx, opts) (Result, error)` = resolve latest → download → verify SHA256 → atomic swap (the Slice-2 logic **without** restart). `Update` (the CLI path) becomes `Apply` + `restartService`.
- New handler layer (e.g. `gateway/update_handler.go`) wrapping the chain in `run.go`: `h = gateway.NewUpdateHandler(h, version)`. On `verb == "update"`: call `selfupdate.Apply(...)`; **return the response** (`{ok:true, updating:true, tag:<latest>}` or an error result) so the gateway serve loop flushes it; then **schedule a clean exit** (a goroutine: short delay ~1s to let the response flush over the WS, then `os.Exit(0)`). `Restart=always` (present in both system + `--user` units) restarts the agent ~5s later on the new binary; it reconnects and reports the new version. Non-`update` verbs delegate to the inner handler unchanged.
- Make the exit injectable for tests (a package/struct `exit func(int)` defaulting to `os.Exit`).

## 5. Console UX

- `apps/console/src/lib/api/client.ts`: `updateNode(id): Promise<...>` → `POST /api/nodes/:id/update`.
- Node card (`NodesOverview.svelte`) + node detail (`routes/nodes/[id]/+page.svelte`): when `updateAvailable`, show "update available: `<agentVersion>` → `<latestVersion>`" + an **Update** button. Click → `updateNode` → an **"updating…"** state on the card; the node goes offline→online (the existing status flow) and re-reports the new version, clearing the state. Errors (offline/failed) surface a toast.

## 6. Risks & verification

- **Response-before-exit:** the agent must flush the verb response before exiting; the ~1s delayed exit handles it. Worst case the response is missed but the update still applies + the node reconnects (console reflects the new version regardless).
- **`authReady` (prior bug):** the `update` verb arrives post-auth (it's hub-initiated after the node is connected), so it's not subject to the hello race — but the handler chain runs under the same authed `onMessage`; no special handling beyond the existing fix.
- **Swap safety:** reuses Slice-2 verify-before-swap + `.bak`; a bad download never replaces the live binary; if the new binary fails to start, `Restart=always` keeps retrying the (broken) binary — mitigated because the swap only happens after checksum-verify, and `.bak` allows manual rollback.
- **Rate limits:** the 1h cache keeps GitHub API calls minimal even with many nodes / frequent console loads.
- **Testing:** agent — `Apply` (reuse Slice-2 httptest fixtures, no-restart path), `update_handler` (verb routing + injected `Apply`/`exit`: asserts response returned + exit scheduled; other verbs delegate). Hub — `getLatestAgentVersion` (httptest + cache TTL), `listNodes` annotation (`updateAvailable` logic), `POST /:id/update` (authed → broker.request; offline path). Console — Update button visibility (updateAvailable) + click POSTs. Gates: `go vet`/`go test -race`/`go build`; hub `bun test`; console `pnpm check`/`test`/`build`.
- **Live:** cut `v0.1.3`; superchotu (on v0.1.2) shows **update available → v0.1.3**; click **Update** → it self-updates, blips offline, returns online on **v0.1.3** — no SSH. This is the end-to-end proof of the whole program.

## 7. Success criteria

The console shows "update available" for an outdated node + an Update button; clicking it updates that node over the gateway with no SSH; the node returns online on the new version; offline nodes report a clean error; checksum-verify-before-swap + `.bak` preserved; all unit tests + gates green. Completes milestone #12.
