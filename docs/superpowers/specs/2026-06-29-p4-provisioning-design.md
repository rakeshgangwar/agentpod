# P4 — Provisioning (Design Spec)

**Status:** Approved (brainstorm 2026-06-29). Single phase, **first vertical slice** of provisioning.
**Builds on:** P0–P3 (attach + read/write + remote + Matrix) and Console UI Unification (the fleet-first UI provisioning lands in).
**Branch:** `redesign/fleet-console`.

## 1. Goal & Scope

Let the operator **create agent runtimes from the console**, which then join the fleet and are managed by everything P0–P3 already built. In the fleet-console model a runtime is a host running the **node-agent** that dials out and enrolls — so **provisioning = create-then-attach**: spin up a container with the node-agent baked in + an enrollment token injected; it auto-enrolls and appears as an online node.

**This slice = model "A": a generic node-agent host.** The provisioner produces a host that joins the fleet; the operator then **detects/adopts** harnesses on it exactly as today. Two drivers built + verified: **Docker** and **Cloudflare Sandbox**.

**In scope:** a fleet-era `RuntimeProvisioner` interface; Docker + Cloudflare drivers (reusing existing container mechanics); a node-agent Docker image + env-var auto-enroll; a `provisioned_runtimes` table + token→node linking; the "New runtime" + destroy console UI; contract types; tests + a Docker dogfood verification.

**Out of scope (explicit):**
- **Model "B" — harness-specific runtimes** (preload OpenCode/Claude Code/Hermes + auto-adopt). The next slice.
- **k8s / agent-sandbox** driver; **multi-tenant**, quotas, billing.
- Reusing the **legacy OpenCode** `sandboxes` table/routes/UI (frozen/demoted) — P4 adds clean fleet-era tables/routes.

## 2. Architecture & Flow

1. Console **"New runtime"** → `POST /api/runtimes { provider, name, resourceTier }` (authenticated).
2. Hub creates a `provisioned_runtimes` row (status `provisioning`) and **mints a one-time enrollment token** (existing `mintEnrollmentToken`) **tagged with that runtime id**.
3. Hub calls the selected **driver**'s `provision(spec)`: it creates a container/sandbox running the **node-agent image** with `AGENTPOD_HUB_URL` + `AGENTPOD_ENROLL_TOKEN` injected. The entrypoint runs `agentpod-node enroll … && agentpod-node run`.
4. The node-agent **auto-enrolls** (`POST /public/nodes/enroll`) and dials back over WSS.
5. On enroll, the hub sees the token was tagged with a runtime id → sets `runtime.nodeId = <new node>` + status `online`.
6. The node now appears in the fleet as a normal online node — detect/adopt, fs, logs, terminal, lifecycle, cleanup all work (P0–P3).

Failure paths: driver create fails → runtime `error` (token left to expire). Enroll never arrives within a TTL → runtime `error` (reconciled).

## 3. Provisioner Interface + Drivers

New **fleet-era** interface (separate from the legacy OpenCode `SandboxProvider`, which is OpenCode-coupled — `opencodeUrl`/flavors):

```ts
interface RuntimeProvisioner {
  readonly provider: RuntimeProvider;            // "docker" | "cloudflare"
  provision(spec: ProvisionSpec): Promise<{ externalId: string; status: RuntimeStatus }>;
  destroy(externalId: string): Promise<void>;
  status(externalId: string): Promise<RuntimeStatus>;
  start?(externalId: string): Promise<void>;     // optional (Docker)
  stop?(externalId: string): Promise<void>;      // optional (Docker)
}
```
- **DockerRuntimeProvisioner** — runs the node-agent image via the existing orchestrator (`apps/hub/src/services/orchestrator/docker.ts`). Local Docker socket by default, `DOCKER_HOST` override for a remote host. Persistent; supports `start`/`stop`/`destroy`. Labels containers `agentpod.runtime.id`, `agentpod.managed=true`.
- **CloudflareRuntimeProvisioner** — creates a CF Sandbox via the existing worker path (`cloudflare-provider` mechanics) with the node-agent + token; `destroy` supported. Ephemeral by nature (no durable `start`/`stop`) — documented caveat.
- A registry resolves driver by `provider`; only **enabled** drivers are offered (`ENABLE_CLOUDFLARE_SANDBOXES` already exists; add `ENABLE_DOCKER_PROVISIONING`). The injected token + hub URL are the only secrets passed to the container; the token is one-time.

## 4. node-agent Image + Auto-enroll

- **`apps/node-agent/deploy/Dockerfile`** — a small image (e.g. distroless/alpine) containing the Go binary + an **entrypoint** that reads `AGENTPOD_HUB_URL` and `AGENTPOD_ENROLL_TOKEN` from env, runs `agentpod-node enroll --hub "$AGENTPOD_HUB_URL" --token "$AGENTPOD_ENROLL_TOKEN"`, then `agentpod-node run`.
- **node-agent change:** `enroll` accepts the hub/token from **env vars as a fallback** to the `--hub`/`--token` flags (so the entrypoint can be flag-free; flags still win). Tiny, tested.
- **Image delivery:** Docker pulls a published image (default: build locally for dogfooding; document pushing to a registry — the repo already has a Forgejo registry config). CF delivers the same binary into the sandbox (image or setup step, following the existing CF provider pattern).

## 5. Data Model + Linking

- New table **`provisioned_runtimes`**: `id` (prefixed `rt_`), `ownerId`, `provider`, `externalId` (containerId/sandboxId, null until created), `status` (`provisioning|online|stopped|error|destroyed`), `nodeId` (FK to `nodes`, null until enrolled), `spec` (jsonb: name, resourceTier), `createdAt`, `updatedAt`. Migration via the hub's Drizzle flow.
- **Linking:** add nullable `provisionedRuntimeId` to the `enrollment_tokens` row. `mintEnrollmentToken` accepts an optional runtime id; `enrollNode`, when consuming a token that carries one, sets that runtime's `nodeId` + status `online` in the same transaction. This is also how **provisioned** nodes are distinguished from **attached** ones (a node has a runtime row iff provisioned).

## 6. Lifecycle

- **Destroy** (provisioned nodes): driver `destroy(externalId)` → mark runtime `destroyed` → remove/mark the linked node. Type-to-confirm in the UI.
- **Stop/Start** (Docker only): driver `stop`/`start` → runtime `stopped`/`online`.
- **Provisioned vs attached:** a `provisioned` badge (with provider) on provisioned nodes; attached nodes unchanged.
- **Orphans:** a runtime stuck in `provisioning` past a TTL is reconciled to `error` (a lightweight check, not a new service if avoidable).

## 7. Console UI

- Fleet home: a **"New runtime"** action beside "Create enrollment token" → dialog (design-system): **provider** picker (only enabled drivers) + **name** + **resource tier** → `POST /api/runtimes`; the runtime renders as a **provisioning** card that becomes a normal online node card once it enrolls (poll/refresh).
- **Destroy** action (type-to-confirm) on provisioned nodes; **Stop/Start** for Docker-provisioned. Provisioned badge.
- Reuses the unified design system (Card/Button/Badge/Dialog/TypeToConfirmDialog).

## 8. Contract

`packages/contract`: `RuntimeProvider` enum (`docker|cloudflare`), `RuntimeStatus` enum, `ProvisionRequest` (`provider, name, resourceTier`), `ProvisionedRuntime` (the persisted shape returned by the API), `ResourceTier` enum. Round-trip tested.

## 9. Testing

- **contract** — provision request/result parse + round-trip.
- **hub** — `POST /api/runtimes` mints a runtime-tagged token + calls the driver + persists `provisioning` (fake driver); `enrollNode` with a runtime-tagged token links `nodeId` + flips `online`; `destroy` calls driver + marks destroyed; capability/auth gates. Driver unit tests against a **faked** Docker orchestrator / CF worker (no real cloud in CI).
- **node-agent (Go)** — `enroll` reads hub/token from env when flags absent; flags override env; missing both → error.
- **console** — New-runtime dialog posts the right body; provisioning→online card transition; destroy type-to-confirm calls the API.
- **Verification (dogfood, like prior phases):** Docker driver end-to-end on a real Docker daemon — New runtime → container starts → node **auto-enrolls + online** → adopt a station on it → **destroy** removes it. CF driver smoke-tested if a sandbox is reachable; else driver-unit-level only (note the gap).

## 10. Risks & Open Items

- **Docker reachability.** Local `docker exec` was throwing a host runc I/O error during the UI phase; `docker run`/create is a different path, but if local Docker is unreliable, verify against a remote `DOCKER_HOST` on a server. Image build may need that host too.
- **node-agent in a container dialing the hub.** From a container the hub URL must be reachable (host networking / `host.docker.internal` for local; the public `wss://hub.agentpod.dev` for real). The injected `AGENTPOD_HUB_URL` handles this; document the local value.
- **CF Sandbox ephemerality.** CF sandboxes may not persist like a VM; a provisioned CF node may drop offline when the sandbox recycles. Acceptable for the slice; surfaced as a driver caveat (no durable stop/start).
- **Token-in-env.** The one-time enrollment token is passed via container env — acceptable (single-use, short TTL); never logged.
- **Reuse boundary.** Reuse the orchestrator/CF-worker **mechanics**, not the OpenCode `SandboxProvider` shape; do not entangle P4 with the legacy sandboxes tables/routes.
- **Image hosting.** First slice builds the node-agent image locally for dogfooding; a published registry image is documented but a registry-publish pipeline is out of scope.
