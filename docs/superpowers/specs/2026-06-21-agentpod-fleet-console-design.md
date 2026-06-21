# AgentPod Redesign — Fleet Console for Agent Runtimes

> **Date:** 2026-06-21
> **Status:** Design — pending review
> **Branch:** `redesign/fleet-console`
> **Author:** Rakesh Gangwar (with Claude)

---

## 1. Summary

AgentPod is being repositioned from an **OpenCode-only sandbox application** into a
**facilities console for an agent workforce**: a single place to manage the runtimes —
"cubicles" — that AI agents live in, *wherever they run* (provisioned by AgentPod, or
**attached** on a VPS, laptop, or phone). For each cubicle it manages the **filesystem,
logs, terminal, config, health, lifecycle, and cleanup**.

AgentPod is the **runtime/operations** complement to **kaambaan** (the **work** control
plane — "Linear for agents"). The two are independent products that may share a contract
package:

| | AgentPod | kaambaan |
|---|---|---|
| Concern | Runtime / facilities | Work / orchestration |
| Question it answers | "Is this agent's *environment* healthy? Manage its files/logs/config." | "What should this agent *do*? Track it through stages with gates." |
| Tagline | Facilities management for an agent workforce | A Kanban board / Linear for agents |
| Domain | `agentpod.dev` | `kaambaan.dev` |

AgentPod **does not orchestrate work** and **does not chat** (conversational driving moves
to a separate dedicated chat-client product).

---

## 2. Background & motivation

The current AgentPod (dormant since Jan 2026) fused two things — a rich cross-platform
client and a Docker sandbox substrate — and hard-wired **OpenCode** as *the* agent
(~2,300 `opencode` references; OpenCode-specific DB tables, routes, config sync, and a base
image that bakes in the OpenCode CLI).

Since then the harness ecosystem exploded (Claude Code, Codex, Gemini CLI, Goose, Aider,
Cline/Roo, plus always-on personal runtimes like Hermes and OpenClaw). Agents now run
*everywhere* — on laptops, VPSes, and in the cloud — under many harnesses. There is no
unified place to **manage those runtimes**: their filesystems, logs, configs, health, and
maintenance. That gap is AgentPod's new wedge.

The codebase already contains a partial multi-harness abstraction: an **ACP (Agent Client
Protocol) gateway** whose registry lists `opencode`, `claude-code`, `gemini-cli`,
`qwen-code`, and `codex`. The redesign generalizes that idea from "run an agent" to
"manage an agent's runtime."

### Ground truth from the live fleet

Three servers were inspected directly (all run `tailscaled`):

- **Hermes** (`molt-bot`, `ubuntu-16gb-hel1-1`): install at `/usr/local/lib/hermes-agent`,
  CLI `/usr/local/bin/hermes`. Each profile is its **own OS process**
  (`hermes -p <name> gateway run --replace`), supervised by a main gateway (**not** systemd;
  uses `gateway.pid` + `processes.json`). Home `~/.hermes` holds `profiles/<name>/`,
  `sessions/`, `logs/`, `config.yaml`, `auth.json`, and even a `kanban.db`. Rich CLI:
  `hermes status|profile|logs|kanban|acp|mcp|dashboard|backup`. Speaks ACP and MCP.
- **OpenClaw** (`superchotu`): `openclaw@2026.4.27` (node), a **single gateway** on `:18789`
  managed by a **user systemd unit** (`openclaw-gateway.service`). Home `~/.openclaw` holds
  `openclaw.json` (main config, frequently clobbered/backed-up), `agents/<name>/` (subagents),
  and `workspace/agent-workspaces/<name>/` (per-subagent workspaces **nested** in the main
  workspace). Disk at **96%**.

Three facts this locks in: (1) the cubicle model must be a **recursive tree**;
(2) **lifecycle differs per harness** (Hermes = supervised process tree, OpenClaw = user
systemd, Claude Code/Codex = ephemeral CLI); (3) descriptors should **wrap each harness's
native CLI/API** rather than reinvent introspection. Real maintenance pain (96% disk,
clobbered configs) makes cleanup and config-backup day-one features.

### Complementary substrates (not competitors)

`kubernetes-sigs/agent-sandbox` (SIG Apps, ~2.9k★, Apache-2.0) provides a Kubernetes
`Sandbox` CRD for *"isolated, stateful, singleton workloads, ideal for AI agent runtimes"*
(stable identity, persistent storage, pause/resume/hibernate, warm pools) — and ships
first-party **Hermes and OpenClaw** examples. It *provisions* sandboxes in Kubernetes; it does
**not** *attach* to runtimes it didn't create. So it is complementary: a **provisioning
driver** for AgentPod (§6.5) and validation of the pod/cubicle abstraction — not a competitor
to the attach-first console.

---

## 3. Goals & non-goals

### Goals
- Manage agent runtimes the operator **did not create** ("attach"), across hosts behind NAT.
- A uniform **management contract** — filesystem, logs, exec/PTY, config, health, lifecycle,
  cleanup — that every harness exposes via an adapter ("descriptor").
- Reuse the parts of the current codebase that earn their keep; retire the OpenCode/chat
  coupling.
- Self-hostable, no vendor lock-in. Single-operator now; **multi-tenant-ready** in the model.
- Aggregate heterogeneous harnesses into **one** console (not reinvent each one's UI).

### Non-goals
- **Not** a work orchestrator (no task assignment, pipelines, or approval gates — that is
  kaambaan).
- **Not** a chat app (separate product).
- **Not** the agent's "brain" — AgentPod never runs the model or the agent loop; the harness
  runs itself, AgentPod observes and operates its environment.
- **Not** multi-tenant *deployment* in v1 (the model is ready; the hardening is later).

---

## 4. Core concepts (domain model)

- **Node** — a host running the AgentPod node-agent (a VPS, a laptop, or a provisioned pod).
- **Cubicle** — a managed `(workspace, agent-identity)` unit, **recursively nestable**.
  - *Composite* cubicle: contains child cubicles (Hermes runtime → its profiles; OpenClaw
    runtime → its subagents).
  - *Leaf* cubicle: no children (a Claude Code / Codex project workspace).
- **Harness descriptor** — a per-harness adapter that knows how to detect/enumerate cubicles,
  locate workspace/config/logs, perform lifecycle, and report which capabilities each cubicle
  supports. **Wraps the harness's native CLI/API.**
- **Capability** — a contract verb a cubicle supports, **advertised per cubicle** (e.g. a
  Hermes profile is a stoppable process; an OpenClaw subagent is stopped via the gateway).
- **Operator / Tenant** — the human. v1 is single-operator, modeled as a *tenant-of-one* so
  multi-tenancy is a later toggle, not a rewrite. Every entity carries an owner/tenant scope.

---

## 5. Architecture

```
   Operator (Svelte web console; optional Tauri desktop wrapper)
            │  HTTPS + WSS
            ▼
   ┌──────────────────────────┐     outbound WSS tunnels (NAT-friendly)
   │      AgentPod Hub         │◄──────────┬──────────────┬───────────────┐
   │   (Bun + Hono, refactor)  │           │              │               │
   │ • node/cubicle registry   │       node-agent     node-agent      node-agent
   │   (Drizzle + Postgres)    │       (your VPS)    (your laptop)  (provisioned pod)
   │ • connection manager +    │       ├ Hermes #1   ├ Claude Code   └ OpenCode
   │   broker (iface)          │       │  ├ coder-kai├ Codex            (auto-enrolled)
   │ • enrollment / auth       │       │  └ research-ray
   │   (Better Auth)           │       └ OpenClaw
   │ • health + audit          │          ├ hanuman
   └──────────────────────────┘          └ kubera
```

Three tiers:

1. **node-agent** (Go) — installed per host, dials *out* to the hub, runs descriptors,
   executes the contract locally.
2. **hub** (Bun + Hono, refactored from `apps/api`) — registry, live connections, broker,
   enrollment, auth, audit. Self-hostable; Cloudflare a *possible later* deployment.
3. **console** (Svelte web SPA, refactored from `apps/frontend`) — renders nodes → cubicle
   tree → capability panels.

Plus a **contract package** defining the shared types once.

---

## 6. Components

### 6.1 node-agent (Go)

- **Form:** a single static binary. Go chosen as the genre convention (Tailscale, Coder,
  Portainer edge agent).
- **Install & enroll:** `agentpod-node enroll --hub <url> --token <token>`. Registers host
  facts (hostname, OS, arch, CPU/RAM/disk), receives a long-lived scoped credential, opens
  the tunnel. Heartbeats; auto-reconnect with backoff.
- **Connectivity:** one persistent **outbound** WSS to the hub (no inbound ports → works
  behind NAT/CGNAT). Optional **Tailscale** direct fast-path for heavy I/O (terminal, file
  transfer, web-preview) when node and hub share a tailnet.
- **Responsibilities:** load descriptors → enumerate cubicles → advertise per-cubicle
  capabilities → execute contract verbs locally, **jailed to cubicle roots**, **least
  privilege** (run as the harness's OS user where possible, not blanket root).
- **State:** minimal. Real state lives on the host; the hub holds registry + audit. A
  reinstall is cheap.
- **Descriptors live here**, but contain zero hub logic — they are thin adapters over each
  harness's native surface (see §8).

### 6.2 hub (Bun + Hono — refactored, not replaced)

The current `apps/api` (Hono ^4.6 on Bun, Drizzle + Postgres, Better Auth) **becomes the
hub**. It keeps the reusable essentials and gains a node gateway.

- **Keeps:** Better Auth (operator auth + multi-tenant seam), Drizzle + Postgres (registry,
  enrollment tokens, audit, health history — **drop pgvector**), admin/audit, observability
  (Loki/Grafana), and the provisioning backends (now generalized behind a driver interface —
  see §6.5).
- **Gains:**
  - **Node gateway** — a WSS endpoint holding the live connection from every node-agent.
  - **Broker** — routes a console request to the right node's socket and streams the response
    back (log frames, PTY frames, fs chunks). Built behind a small interface:
    `registerNode`, `routeToNode(nodeId, msg)`, `streamFromNode(...)`, `dropNode`.
    The v1 implementation is **in-process** (an in-memory `node → socket` map), which is fine
    for single-operator. The interface lets a future implementation swap to **Redis pub/sub**
    (self-hosted scale) or a **Durable-Object-per-node** (Cloudflare) without touching the
    rest of the hub. *We do not build the second implementation now.*
  - **Enrollment** — mint/validate node tokens; tenant/owner scoping.
- **Sheds:** OpenCode/chat/sandbox-coupled routes & schema (see §10).

### 6.3 console (Svelte web — refactored from `apps/frontend`)

- **Web-first SPA** served by the hub (SvelteKit static/SPA build), reusing existing Svelte
  components: file browser, xterm terminal wrapper, log viewer, config editor (Shiki).
- **Drops** the Tauri `src-tauri` Rust backend and the `invoke()` IPC layer (those calls were
  the Docker/OpenCode-coupled code being retired); replaced by `fetch`/WebSocket-to-hub.
- **Mobile** via responsive web / PWA (not native Tauri mobile).
- **Optional later:** a Tauri *desktop* wrapper around the same web build, for users who want
  a native window / tray / OS-keychain token storage. Not required for v1.
- **No chat UI** (assistant-ui removed).

### 6.4 contract package

A workspace package defining the management contract **once**: entities (Node, Cubicle,
Capability), verbs, a normalized **event/activity envelope** (for streaming logs, PTY, fs,
health), and capability flags. Candidate to be shared with kaambaan (kaambaan already
isolates a `packages/contract`).

### 6.5 Provisioner drivers (the *provision* path)

Provisioning is **pluggable**. A `provisioner` interface (`create` / `destroy` / `pause` /
`resume` / `status`) has multiple drivers; whichever is used, the provisioned host runs the
node-agent (baked in / injected) and **auto-enrolls** — so the management contract is identical
to an attached host. Provisioning is simply *attach where AgentPod created the host.*

| Driver | Target | Status | Notes |
|---|---|---|---|
| **Docker** | local / self-host | exists (`orchestrator/docker.ts` + `traefik.ts`) | simplest; default for solo/self-host |
| **Cloudflare Sandbox** | Cloudflare edge | exists (`cloudflare/worker` + `cloudflare-webhook.ts`) | uses the Cloudflare Sandbox SDK; cloud, no servers to run |
| **Kubernetes (agent-sandbox)** | k8s cluster | new (P3) | wraps `kubernetes-sigs/agent-sandbox`'s `Sandbox` CRD — stable identity, persistent storage, pause/resume/hibernate, warm pools. **Optional** (only where k8s exists) so "no lock-in" holds |
| **…more** | E2B, Daytona, Fly, raw VM | future | the interface is open |

This keeps the attach-first core **k8s-free** while letting heavier backends slot in. See §14.

---

## 7. The management contract (v1 = all capabilities)

Each capability is advertised **per cubicle**; the console greys out unsupported verbs.

| Capability | Operations |
|---|---|
| **inventory** | enumerate cubicles (recursively) + their advertised capabilities + metadata |
| **filesystem** | list / read / write / move / delete, upload / download, watch — **jailed to the cubicle root** |
| **logs** | tail + live-follow + history (process / container / file streams) |
| **exec / PTY** | one-off commands + interactive shell (xterm.js ↔ PTY); **durable & reattachable** — survives console/network drops (see note below) |
| **config** | read/edit known config files, secret/env injection, **backup / restore / diff / clobber-detection** |
| **health** | status (running/stopped/crashed), CPU/RAM/disk, uptime, restart count, last activity |
| **lifecycle** | start / stop / restart — whole runtime, and per-cubicle where supported |
| **cleanup** | per-cubicle disk usage, prune caches/workspaces, rotate logs, reclaim space |

Streaming verbs (logs, exec, fs-watch) flow over the node tunnel as framed messages in the
normalized envelope; large blobs (file download, big diffs) go via chunked transfer (and an
object store later).

**Terminal durability.** Interactive terminals survive console/network disconnects. The
node-agent backs each cubicle terminal with **tmux** (or lighter `dtach`) when present — the
operator's PTY is a *client attached* to a host-side session, so a dropped connection leaves
the session (and any running command) alive to re-attach, scrollback intact. When tmux/`dtach`
is absent it falls back to an **in-daemon PTY keepalive** (the node-agent holds the PTY master
and buffers scrollback) — resilient to network blips, though not to a node-agent restart. tmux
*secondarily* hosts AgentPod-**launched** runs (provisioned cubicles / leaf CLI harnesses) so an
operator can attach and watch a live run. It is **optional** (never required), Unix-only, used
only for AgentPod-initiated terminals — never retrofitted onto already-running *attached*
runtimes (observe those via native logs/CLI). Orphaned sessions are reaped by **cleanup**.

---

## 8. Harness descriptors (concrete, from ground truth)

A descriptor declares: detection, child enumeration, path resolution (workspace/config/logs),
lifecycle implementation, and per-cubicle capabilities. It prefers the harness's **native
CLI/API**.

| Harness | Enumerate children | Workspace | Config | Logs | Lifecycle | Notes |
|---|---|---|---|---|---|---|
| **Hermes** | `hermes profile` / `ls ~/.hermes/profiles/` | `~/.hermes/profiles/<name>/` | `~/.hermes/config.yaml`, `auth.json` | `hermes logs` / `~/.hermes/logs/` | per-profile **process** (`hermes -p <name> gateway …`); main gateway supervises | composite; speaks ACP + MCP; has own `kanban.db` |
| **OpenClaw** | `ls ~/.openclaw/agents/` | `~/.openclaw/workspace/agent-workspaces/<name>/` (nested) | `~/.openclaw/openclaw.json` | `~/.openclaw/logs/` | whole runtime via **user systemd** (`systemctl --user … openclaw-gateway`); per-subagent via gateway | composite; single gateway `:18789`; own control-ui + node/device pairing |
| **Claude Code** | n/a (leaf) | the project dir | `.claude/`, `~/.claude/settings.json` | session/stdout | ephemeral CLI (no persistent process) | leaf; MCP via `.mcp.json` |
| **Codex** | n/a (leaf) | the project dir | `~/.codex/` config | session/stdout | ephemeral CLI | leaf |

Adding a harness = adding a descriptor, **not** changing the daemon.

---

## 9. Connectivity & security

- **Universal transport:** node-agent dials **out** to the hub over WSS. No inbound ports;
  multi-tenant-safe; works on any machine.
- **Accelerator:** Tailscale direct path when available (the fleet already runs `tailscaled`).
  Enables immediate dogfooding over the existing tailnet while the WSS path matures.
- **Trust (single-operator v1):** enrollment tokens, TLS, **path-jailed** access scoped to
  declared cubicle roots, least-privilege execution, full **audit** of every operation.
- **Multi-tenant-ready:** every registry entity carries an owner/tenant scope (defaults to the
  single operator). Authz is computed centrally at the hub; node-agents trust the hub's
  decision. Hardening (token audience validation, per-tenant isolation tests, scoping UI) is a
  later phase but the schema and code paths assume it from day one.

---

## 10. Reuse vs retire (mapped to the current codebase)

**Reuse / refactor:**
- `apps/frontend` Svelte components (file browser, xterm, log viewer, config editor) → web console.
- `apps/api` (Bun + Hono, Drizzle, Better Auth) → hub.
- Provisioning backends → `provisioner` drivers (§6.5): the **Docker orchestrator**
  (`apps/api/src/services/orchestrator`, `sandbox-manager`) and the existing **Cloudflare
  Sandbox** integration (`cloudflare/worker`, `cloudflare-webhook.ts`) both become drivers;
  Kubernetes/agent-sandbox is a new one. (Provision = attach where AgentPod created the host;
  node-agent baked in / injected, auto-enrolls.)
- ACP gateway + `agent-registry` → seed for harness descriptors.
- Provider/secret sync → the `config` capability (generalized beyond OpenCode).
- Admin / audit / observability → hub ops.

**Retire:**
- assistant-ui chat (React) → separate chat product.
- Tauri `src-tauri` Rust backend + `invoke()` IPC + `tauri-plugin-mcp` (native system access no
  longer needed by the client).
- "OpenCode *is* the agent" assumptions; OpenCode-specific DB tables (`user_opencode_config`,
  `opencode_agents`), `/api/*/opencode/*` routes, chat-persistence schema, pgvector.

---

## 11. Key data flows

- **Enroll:** operator mints a token → `agentpod-node enroll` → node registers + opens WSS →
  appears in the console with its enumerated cubicles.
- **Observe (logs):** console requests cubicle logs → hub routes to the node → descriptor tails
  via native CLI/file → frames stream back to the console.
- **Exec (PTY):** console opens a terminal → hub brokers a PTY channel to the node → descriptor
  spawns a shell jailed to the cubicle root → bidirectional frames.
- **Lifecycle:** console "restart coder-kai" → hub → node → descriptor runs the Hermes
  process command → health updates broadcast.
- **Provision:** "new pod" → orchestrator creates a container with the node-agent baked in →
  it auto-enrolls → identical management UX.

---

## 12. Testing strategy

- **Contract-conformance suite** (kaambaan-style): a descriptor passes iff it implements every
  capability it advertises.
- **node-agent:** unit tests per capability (fs-jail, exec, log-tail, cleanup) + **per-descriptor**
  integration tests (Hermes, OpenClaw, Claude Code, Codex) against fixture homes.
- **hub:** enrollment, authz, broker routing, audit. **Multi-tenant isolation tests run even
  while shipping single-operator** (guarding the future).
- **E2E:** enroll a node → enumerate cubicles → exercise all 8 capabilities against a live
  Hermes profile and an OpenClaw subagent (dogfood on the real fleet over Tailscale).

---

## 13. Phasing

| Phase | Scope |
|---|---|
| **P0** | contract package + node-agent skeleton + enrollment + WSS + hub registry + console node-list |
| **P1** | read/observe capabilities (inventory, health, logs, filesystem) + Hermes & OpenClaw descriptors |
| **P2** | exec/PTY + config (backup/restore/diff) + lifecycle + cleanup (the write/dangerous ops) |
| **P3** | provisioning-as-attach via the `provisioner` interface (Docker + Cloudflare Sandbox today; Kubernetes/agent-sandbox new) + Tailscale fast-path + Claude Code / Codex leaf descriptors |
| **P4** | multi-tenant hardening + Cloudflare hub option + optional kaambaan work-plane bridge |

---

## 14. Open questions & risks

- **Connection state at scale.** In-process broker is fine for single-operator; the
  Redis/DO swap is deferred behind the broker interface. Risk: the interface must be designed
  carefully so the swap is real, not aspirational.
- **node-agent privilege.** Running as the harness's user vs. a dedicated `agentpod` user with
  scoped sudo — to be decided per install mode. Security-sensitive (remote fs+exec).
- **Terminal durability mechanism.** tmux vs lighter `dtach` vs in-daemon PTY keepalive (likely
  a hybrid: keepalive by default, tmux when available). Decide in P2 with the exec/PTY work.
- **Descriptor brittleness.** Wrapping native CLIs couples to their output formats; prefer
  structured/JSON CLI modes where available, snapshot-test parsing.
- **Tailscale assumption.** Great for the operator's own fleet; must never be *required*
  (WSS is the floor).
- **kaambaan contract sharing.** Decide whether to extract a shared package now or let each
  product keep its own contract and converge later.
- **Provisioning scope.** The `provisioner` interface (§6.5) unifies Docker, Cloudflare
  Sandbox, and Kubernetes/agent-sandbox; how much of the existing Docker/Cloudflare code is
  reused vs. rebuilt around node-agent auto-enrollment is scoped in P3.
- **agent-sandbox alignment.** Track `kubernetes-sigs/agent-sandbox` — its Hermes/OpenClaw
  examples, its in-progress portable-backend proto, and its planned MCP server + fs/exec SDK —
  as both a provisioning driver *and* a possible transport for k8s-provisioned cubicles.

---

## 15. Decisions locked in this round

- Name **AgentPod** retained (`agentpod.dev`); kaambaan is the sibling (`kaambaan.dev`).
- Work on a **new branch** (`redesign/fleet-console`) in the existing repo (heavy refactor).
- Console: **Svelte web-first**, optional Tauri desktop wrapper later, responsive/PWA mobile.
- Backend: **Bun + Hono hub** (refactor `apps/api`, not replace); broker behind an interface.
- node-agent: **Go**, attach-first, descriptors wrap native CLIs, Tailscale as accelerator.
- v1 capabilities: **all eight**. Trust: **single-operator**, multi-tenant-ready model.
- Provisioning is **pluggable** (a `provisioner` interface): **Docker** and **Cloudflare
  Sandbox** exist today, **Kubernetes/agent-sandbox** is added, more (E2B/Daytona/VM) later.
  agent-sandbox is optional (k8s only) so "no lock-in" holds.
