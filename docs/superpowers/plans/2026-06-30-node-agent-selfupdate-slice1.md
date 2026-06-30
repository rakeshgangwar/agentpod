# Node-agent Self-Update Slice 1 (Version + Integrity) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Make the agent's version visible end-to-end (binary→hub→console) and publish release `SHA256SUMS`.

**Architecture:** T1 = node-agent build version + `version` cmd + version in the gateway hello frame + release workflow (ldflags + SHA256SUMS). T2 = hub ingests the hello version → `nodes.agent_version` + contract + console display. T1 (Go + yaml) and T2 (TS hub/console/contract) touch disjoint files + disjoint test toolchains → **parallel-safe**. T3 = driver-run tag `v0.1.1` + live verify.

**Tech Stack:** Go node-agent; Bun/Hono/Drizzle hub; SvelteKit console; GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-06-30-node-agent-selfupdate-slice1-design.md`.

## Global Constraints

- Node-agent `apps/node-agent` (gate: `go vet ./...` + `go test ./... -race` + `go build ./...`). Hub `apps/hub` (gate: `bun test`). Console `apps/console` (gate: `pnpm check` 0/0 + `pnpm test` + `pnpm build`). Contract `packages/contract`.
- **Wire interface (shared by T1+T2):** the gateway **hello frame** JSON gains a field **`"version": string`** (the agent's build version, e.g. `"v0.1.1"` or `"dev"`). The hub reads it; absence → treat as null.
- Version var path is **`main.version`** (package `main`, `cmd/agentpod-node`); ldflags `-X main.version=<tag>`.
- Additive only: `nodes.agent_version` nullable; old agents → null → console "unknown".

---

### Task 1: Node-agent version + hello reporting + release workflow

**Files:** `apps/node-agent/cmd/agentpod-node/main.go` (+ wherever subcommands are dispatched), `apps/node-agent/internal/gateway/client.go` (hello frame), the gateway options/`Run` signature as needed, `.github/workflows/release-node-agent.yml`; tests in `apps/node-agent/internal/gateway/` + a cmd test.

**Interfaces:**
- Produces: the hello frame includes `"version": <string>`; binary supports `agentpod-node version`.

- [ ] **Step 1 — version var + subcommand.** In `main.go` add package-level `var version = "dev"`. Add a `version` subcommand (match the existing subcommand dispatch — `enroll`/`run` style) that prints `fmt.Printf("agentpod-node %s %s/%s\n", version, runtime.GOOS, runtime.GOARCH)`.
- [ ] **Step 2 — thread version to the gateway.** Find where `main` constructs/starts the gateway client (the `run` path). Pass `version` into the gateway client (add a `Version string` field to its options/struct, or a param). Read `client.go` first to match the existing wiring.
- [ ] **Step 3 — hello frame test (RED).** In `apps/node-agent/internal/gateway/` add/extend a test asserting the hello frame the client sends includes `"version":"<the configured version>"`. Run `go test ./internal/gateway/ -run Hello` → FAIL.
- [ ] **Step 4 — add version to hello (GREEN).** In `connectOnce` (or where the hello struct is built) add the `Version` field (json tag `version`) set from the client's configured version. Run the test → PASS.
- [ ] **Step 5 — release ldflags.** In `.github/workflows/release-node-agent.yml`, change the build step's `go build` to include `-ldflags "-s -w -X main.version=${GITHUB_REF_NAME}"` (the tag). Keep existing GOOS/GOARCH matrix. (Verify the var path by a local `go build -ldflags "-X main.version=test" -o /tmp/an ./cmd/agentpod-node && /tmp/an version` → prints `test`.)
- [ ] **Step 6 — SHA256SUMS in the workflow.** Add a step after the binaries are built + the static assets (install.sh, agentpod-node.service) are staged: compute `sha256sum <each asset> > SHA256SUMS` (or `shasum -a 256`), and upload `SHA256SUMS` as a release asset alongside the others. Match the workflow's existing upload mechanism (`gh release upload` / `softprops/action-gh-release` files list).
- [ ] **Step 7 — gate + commit.** `cd apps/node-agent && go vet ./... && go test ./... -race && go build ./...`; YAML sanity (the workflow parses). Commit: `feat(node): build version (-X main.version) + 'version' cmd + report version in hello; publish SHA256SUMS (self-update slice 1)`

---

### Task 2: Hub ingest + contract + console display

**Files:** `packages/contract/src/node.ts`, `apps/hub/src/db/schema/nodes.ts` (+ generated migration in `apps/hub/src/db/drizzle-migrations`), `apps/hub/src/routes/gateway.ts` (read hello version), `apps/hub/src/services/node-registry.ts` (return agentVersion), `apps/console/src/lib/components/fleet/NodesOverview.svelte` + `apps/console/src/routes/nodes/[id]/+page.svelte`; hub + console tests.

**Interfaces:**
- Consumes: hello frame field `"version": string` (see Global Constraints).
- Produces: `NodeSummary.agentVersion: string | null` in the nodes API.

- [ ] **Step 1 — contract.** In `packages/contract/src/node.ts` add `agentVersion: z.string().nullable()` to `NodeSummary` (and any node-detail schema that mirrors it). 
- [ ] **Step 2 — schema + migration.** In `apps/hub/src/db/schema/nodes.ts` add `agentVersion: text("agent_version")` (nullable). Generate the migration: `cd apps/hub && bunx drizzle-kit generate` → **review** the new SQL in `src/db/drizzle-migrations` touches only `nodes` (adds the column; no drops).
- [ ] **Step 3 — gateway ingest test (RED).** In the hub gateway test, simulate a hello with `version:"v0.1.1"` → assert the node row's `agentVersion` is persisted. Run `cd apps/hub && bun test` (the gateway test) → FAIL.
- [ ] **Step 4 — ingest (GREEN).** In `routes/gateway.ts` where the hello is parsed + the node marked online, read `version` and write it to `node.agentVersion` (update on each connect). Run the test → PASS.
- [ ] **Step 5 — expose in API.** In `services/node-registry.ts` `listNodes` (+ node detail) include `agentVersion` in the returned shape. Add/extend a test asserting `agentVersion` is returned.
- [ ] **Step 6 — console display.** In `NodesOverview.svelte` node card + `routes/nodes/[id]/+page.svelte` header, show the version as a subtle chip near the status: `node.agentVersion ?? "unknown"`, `text-muted-foreground text-xs`. 
- [ ] **Step 7 — gate + commit.** `cd apps/hub && bun test` green; `cd apps/console && pnpm check` (0/0) + `pnpm test` + `pnpm build`. Commit: `feat(hub)+console: ingest + display node agent version (self-update slice 1)`

---

### Task 3: Tag v0.1.1 + live verification (driver-run)

- [ ] Merge `develop`→`main`. Apply the `agent_version` migration is automatic on hub startup (migrate() on boot) — redeploy/restart the hub (systemd on the VPS).
- [ ] **Cut tag `v0.1.1`** on `main` → the release workflow builds all 4 binaries with `-X main.version=v0.1.1` + publishes `SHA256SUMS`. Verify the release has the `SHA256SUMS` asset and the hashes match (`shasum -c`).
- [ ] Re-install the agent on superchotu from `v0.1.1` (`apn` re-install) → `apn version` prints `v0.1.1`.
- [ ] Redeploy the console; verify the fleet/node-detail shows superchotu's `v0.1.1` (and was "unknown" before the re-install / for any old agent).
- [ ] Hub restarted cleanly with the migration applied (node enroll/online still works).

## Self-review

- **Spec coverage:** §2 version embed/cmd/ldflags → T1 s1,s2,s5; §3 reporting (hello + hub + schema + contract + API) → T1 s3-4 + T2 s1-5; §4 console → T2 s6; §5 SHA256SUMS → T1 s6; §6 verification → T3. ✓
- **Parallelism:** T1 (Go + .github) vs T2 (TS hub/console/contract) — disjoint files + go vs bun/pnpm gates → parallel-safe; shared interface = hello `version` field, defined in Global Constraints + both Interfaces blocks. ✓
- **Type consistency:** `main.version` (var), hello json `version`, `NodeSummary.agentVersion` / `nodes.agent_version` — consistent across tasks. ✓
- **No placeholders:** exact files, the version-cmd print, the ldflags, the migration command + review. ✓
