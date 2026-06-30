# Node-agent Self-Update — Slice 1: Version + Integrity Foundation (Design Spec)

**Status:** Approved (brainstorm 2026-06-30). First of three slices (milestone #12; #179). Slices 2 (`apn update` core) + 3 (hub-orchestrated) follow.
**Branch:** `develop` (merge `develop`→`main`).
**Context:** The node-agent has **no version** (build or runtime), doesn't report one, and releases publish **no checksums** — so there's no way to know what's running or to safely fetch a new binary. This slice adds the foundation: a build version, version reporting to the hub, console display, and published `SHA256SUMS` (the integrity primitive Slice 2's downloader will verify).

## 1. Goal & Scope

Make the agent's version **visible end-to-end** (binary → hub → console) and make releases **verifiable**. No update action yet (Slice 2).

## 2. Version embedding (node-agent)

- Add `var version = "dev"` in `apps/node-agent/cmd/agentpod-node/main.go` (package `main`).
- Add an `apn version` / `agentpod-node version` subcommand printing `version` (+ os/arch).
- **Release workflow** `.github/workflows/release-node-agent.yml`: pass `-ldflags "-s -w -X main.version=${GITHUB_REF_NAME}"` so the published binary's `version` is the git tag (e.g. `v0.1.1`). Local/dev builds stay `"dev"`. This means **node-agent releases are now tagged** (`v0.1.x`) — the tag is the version source of truth.

## 3. Version reporting (agent → hub)

- **Agent:** include `version` in the gateway **hello frame** (`apps/node-agent/internal/gateway/client.go` `connectOnce`, where the hello is sent). Also include it in the enroll request body (`enroll`) as a convenience, but the hello is the live source.
- **Hub:** the gateway handler (`apps/hub/src/routes/gateway.ts`) reads `version` from the hello and persists it to `node.agentVersion` on connect/online. Add schema column `nodes.agent_version text` (nullable; Drizzle migration). The nodes API (`services/node-registry.ts` `listNodes` + the node detail) returns `agentVersion`. Contract (`packages/contract/src/node.ts`): add `agentVersion: z.string().nullable()` to `NodeSummary`.
- Old agents that don't send `version` → `agentVersion` stays null → console shows "unknown".

## 4. Console display

- `NodesOverview.svelte` node card + `routes/nodes/[id]/+page.svelte` header: show the agent version (e.g. a subtle `v0.1.1` chip near the node status, `text-muted-foreground`), "unknown" when null. No "update available" comparison yet — that lands with Slice 3 (when there's an action + a known-latest to compare against).

## 5. Checksums (release integrity)

- `.github/workflows/release-node-agent.yml`: after building the 4 binaries + before/with the `static-assets` upload, compute `sha256sum` of every release asset (the 4 `agentpod-node-<os>-<arch>` binaries + `install.sh` + `agentpod-node.service`) into a **`SHA256SUMS`** file and upload it as a release asset. (Use `shasum -a 256` / `sha256sum` on the runner.) Slice 2's downloader will fetch + verify against this.

## 6. Risks & verification

- **ldflags var path:** `-X main.version=` must match the actual package/var path (`main.version`); verify `apn version` prints the tag after a tagged build (test in the workflow or a local `go build -ldflags`).
- **Hello-frame compat:** adding `version` to the hello must not break the hub's existing parse (additive field; the hub tolerates its absence for old agents). Verify enroll/online still works for an agent without the field.
- **Migration safety:** `agent_version` is an additive nullable column (no data risk); the drop-migration discipline from P2b applies (review the generated migration touches only `nodes`).
- **Gate:** node-agent `go vet` + `go test ./... -race` + `go build`; hub `bun test` (gateway/nodes) green; console `pnpm check`/`test`/`build`. Live (after a tagged release + re-install): the console shows superchotu's version; the release has a `SHA256SUMS` asset whose hashes match the binaries.
- This slice **requires cutting a real tag** (`v0.1.1`) to exercise the version-injection + checksums end-to-end (also resolves the "binary clobbered without a version" hygiene note).

## 7. Success criteria

`apn version` prints the release tag; the hub stores + the console shows each node's agent version; `release-node-agent.yml` publishes `SHA256SUMS` covering all assets; old agents degrade to "unknown"; check/test/build green. Foundation ready for Slice 2 (verified self-update).
