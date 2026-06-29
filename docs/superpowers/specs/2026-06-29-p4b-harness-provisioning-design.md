# P4 slice B — Harness-Preloaded Provisioning + Auto-Adopt (Design Spec)

**Status:** Approved (brainstorm 2026-06-29). Builds directly on **P4 slice A** (generic node-agent provisioning).
**Branch:** `redesign/fleet-console`.

## 1. Goal & Scope

Slice A provisions a *generic* node-agent host that you then detect/adopt manually. **Slice B** provisions a runtime with a **chosen harness pre-installed + an initialized workspace**, and **auto-adopts** the resulting station — so one action yields a ready, runtime-linked, drivable station.

**This slice = OpenCode, baked image, empty workspace, creds deferred.**

**In scope:**
- `harness` on the provision request/record (`none` | `opencode`).
- A baked **`agentpod-node-opencode`** image (node-agent + `opencode` + an entrypoint that registers `/workspace` as an OpenCode project).
- **Image-by-harness** resolution in the runtime service (driver stays image-agnostic).
- **Auto-adopt**: on node-online, detect + adopt the harness's station, linked to the runtime.
- Console New-runtime harness picker + harness display.

**Out of scope (explicit):**
- **Repo clone** into the workspace (empty workspace only — `git clone` via the station terminal afterward). Immediate follow-up.
- **Credential injection** — AgentPod manages the *environment*; the station is adopted + fully manageable (fs/terminal/logs/config) and the operator adds API keys via the config capability, then starts it. No secrets injected into containers.
- Harnesses **beyond OpenCode** (Claude Code, Hermes/composite), **Cloudflare** harness *live* verification (the `harness` param flows to the CF driver but is Docker-verified only), k8s, multi-tenant.

## 2. Architecture & Flow

1. Console New-runtime dialog → `POST /api/runtimes { provider, name, resourceTier, harness: "opencode" }`.
2. `createRuntime` (slice A) persists `harness` on the row + mints the token (unchanged), but the **service resolves a harness-specific image** and passes it in the `ProvisionSpec`.
3. The driver provisions a container from `agentpod-node-opencode`. Its entrypoint: **register `/workspace` as an OpenCode project** → `enroll` (env, slice A) → `run`.
4. The node connects over the gateway → marked online → `enrollNode` already linked `nodeId`→runtime (slice A).
5. **Auto-adopt** fires on the gateway on-open hook: for a provisioned node whose runtime has a `harness` and no adopted station yet, the hub `broker.request(nodeId,"detect")`, picks the detected station matching the harness, and `adoptStations(...)`. The runtime now points at a ready, adopted station.

Failure paths: detect/adopt failure is best-effort + logged — the node is still online and manually adoptable (graceful degradation to slice-A behavior). The image-registration failing → no matching station detected → auto-adopt no-ops (logged); the runtime is still a usable node.

## 3. Contract + Schema

- `packages/contract/src/runtime.ts`: `RuntimeHarness = z.enum(["none","opencode"])`; `ProvisionRequest.harness = RuntimeHarness.default("none")`; `ProvisionedRuntime.harness: RuntimeHarness`.
- `apps/hub/src/db/schema/nodes.ts`: `provisionedRuntimes.harness text("harness").notNull().default("none")`; Drizzle migration (0022).

## 4. Image-by-Harness

- `ProvisionSpec` (provisioner/types.ts) gains `image: string`.
- The **runtime service** resolves the image from `harness` (single source of truth): `"opencode"` → `process.env.NODE_AGENT_OPENCODE_IMAGE ?? "agentpod-node-opencode:local"`; `"none"` → `process.env.NODE_AGENT_IMAGE ?? "agentpod-node:local"` (slice A). It passes `image` in the spec; the Docker + Cloudflare drivers **use `spec.image`** instead of reading the env themselves (small refactor of slice A's driver, which currently reads `NODE_AGENT_IMAGE`).
- Docker is the build + dogfood path for B. The CF driver receives `spec.image` too but stays live-unverified.

## 5. The OpenCode Image

`apps/node-agent/deploy/Dockerfile.opencode` (separate from the slice-A `Dockerfile`):
- Build the node-agent binary (as slice A) + a runtime base that has `opencode` installed (needs `bun`/`node` — opencode is a JS CLI; pick a base with a JS runtime, e.g. an `oven/bun` or `node` base, and add the static node-agent binary + `ca-certificates`).
- `deploy/node-opencode-entrypoint.sh`: create `/workspace`; **register it as an OpenCode project** so the descriptor detects it (run `opencode` headlessly in `/workspace`, or seed `~/.local/share/opencode/{opencode.db,project/}`); then `agentpod-node enroll` (reads `AGENTPOD_HUB_URL`/`AGENTPOD_ENROLL_TOKEN` env, slice A) → `exec agentpod-node run`.
- **Risk / required verification:** the OpenCode descriptor (P4 #103) detects projects from `opencode.db` worktree rows (primary) + the sanitized `project/` dir (fallback). The entrypoint MUST make `/workspace` appear in one of those. The implementing task must **prove the descriptor detects `/workspace`** in the built image (run `agentpod-node detect` inside the container) before relying on auto-adopt — if `opencode` can't be driven headlessly to register a project, seed `opencode.db` directly.

## 6. Auto-Adopt

`autoAdoptProvisionedHarness(nodeId): Promise<void>` (new, e.g. `apps/hub/src/services/runtime-autoadopt.ts`):
1. Look up the `provisionedRuntimes` row by `nodeId`; return if none, if `harness === "none"`, or if the node already has an adopted station (idempotent).
2. `broker.request(nodeId, "detect", {}, { timeoutMs })`; parse with `VERB_RESULTS.detect`.
3. Choose the detected station with `harness === runtime.harness` (prefer one whose `workspacePath` is `/workspace`).
4. `adoptStations(runtime.userId, nodeId, [station])`.
- **Best-effort + logged** (never throws into the gateway). Triggered from `gateway.ts` on-open after `register` + `setNodeStatus(online)`, with a short retry/delay so the freshly-connected node can answer `detect`.

## 7. Console UI

`NewRuntimeDialog.svelte` gains a harness `ui/select` (Generic / OpenCode; default Generic). The provisioning card + node detail show the harness (e.g. a badge), and that an OpenCode runtime auto-adopts its station. Client `provisionRuntime` includes `harness`.

## 8. Testing

- **contract** — `harness` parse/default/round-trip.
- **hub** — schema/migration applies; service resolves image-by-harness (opencode vs none, env overrides); **auto-adopt** unit test with a faked `broker.request` returning detected stations → adopts the matching one; idempotent (already-adopted → no-op); no-op when `harness === "none"` or no matching station; runs under the right `userId`.
- **node-agent / image** — the implementing task verifies `agentpod-node detect` inside the built `agentpod-node-opencode` container lists a `/workspace` opencode station (gates the whole feature).
- **console** — New-runtime dialog includes the harness select + posts it; harness shown on the card.
- **Deferred dogfood** (when Docker is healthy, with P4 A's #125): new OpenCode runtime → container → `/workspace` registered → node online → **auto-adopted** → drive the station (terminal/fs/logs) end-to-end.

## 9. Risks & Open Items

- **`/workspace` registration** (§5) is the keystone risk — if OpenCode can't be headlessly coaxed to register a project, seed `opencode.db` directly; the descriptor-detect-in-container check gates the feature.
- **Auto-adopt timing** — the node may not answer `detect` the instant it connects; use a short retry. Auto-adopt is best-effort, so a miss degrades to manual adopt, not a failure.
- **Docker still required** for the image build + the live dogfood; both remain blocked until this Mac's Colima/Docker is healthy (per slice A). B's code is verifiable without Docker (units + the image-detect check is the one Docker-gated piece, deferred with the dogfood).
- **Image size** — a JS-runtime base + opencode is larger than the slice-A alpine image; acceptable, note it.
- **Driver refactor** — moving image selection from the driver (slice A reads `NODE_AGENT_IMAGE`) to the service (`spec.image`) touches slice-A driver code + its tests; keep slice A's behavior intact (generic provisioning still works).
