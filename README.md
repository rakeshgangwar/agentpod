# AgentPod

AgentPod is a **fleet/facilities console for agent runtimes** — a single place to manage the environments that AI agents live in, wherever they run. For each runtime it manages the **filesystem, logs, terminal, config, health, lifecycle, cleanup, and provisioning**, across machines, harnesses, and network boundaries. It is **attach-first**: you point it at runtimes you already run, or let it provision new ones.

## Architecture — three tiers

```
   Operator (Svelte web console)
            │  HTTPS + WSS
            ▼
   ┌──────────────────────────┐     outbound WSS tunnels (NAT-friendly)
   │      AgentPod Hub         │◄──────────┬──────────────┬───────────────┐
   │   (Bun + Hono + Postgres) │           │              │               │
   │ • node/station registry   │       node-agent     node-agent      node-agent
   │ • connection broker       │       (VPS/server)  (laptop)       (provisioned)
   │ • enrollment + auth       │       ├ Hermes          ├ Claude Code
   │ • provisioning drivers    │       │  ├ coder-kai     └ Codex
   │ • audit + activity log    │       └ OpenClaw
   └──────────────────────────┘          ├ hanuman
                                         └ kubera
```

| Tier | Technology | Role |
|------|-----------|------|
| **node-agent** | Go (static binary) | Installed per host; dials *out* to the hub over WSS. Runs harness descriptors, executes contract verbs locally. No inbound ports — works behind NAT/CGNAT. |
| **hub** | Bun + Hono, Drizzle + Postgres | Registry, connection broker, enrollment, auth (Better Auth), audit, provisioning drivers. Self-hostable. |
| **console** | SvelteKit (adapter-static SPA) | Fleet-first UI: node list → station tree → capability panels (filesystem, logs, terminal, config, health, lifecycle, cleanup). |

## Harnesses detected (v0.1.0)

AgentPod ships descriptors for: **Hermes**, **OpenClaw**, **Claude Code**, **Codex**, **OpenCode**.

Each descriptor wraps the harness's native CLI/API to enumerate runtimes, locate config/logs/workspace, and implement lifecycle — without reinventing each harness's introspection.

## Quickstart

> Full instructions: [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) (production) · [docs/OPERATING.md](./docs/OPERATING.md) (day-2 ops)

**1. Run the hub**

```bash
# Prereqs: Postgres + bun
cd apps/hub
cp .env.example .env   # fill in DATABASE_URL, BETTER_AUTH_SECRET, ENCRYPTION_KEY, API_TOKEN
bun run src/index.ts   # auto-migrates on first start
```

**2. Build + serve the console**

```bash
cd apps/console
PUBLIC_HUB_URL=https://<your-hub> pnpm build   # emits apps/console/build/
# Serve build/ with nginx (adapter-static SPA; nginx try_files $uri /index.html)
```

**3. Build + enroll a node-agent**

```bash
# Build the binary (requires Go):
cd apps/node-agent
go build -o agentpod-node ./cmd/agentpod-node

# On the target host, enroll and run as a systemd service:
sudo bash scripts/install-node-agent.sh https://<your-hub> <token-from-console>
systemctl status agentpod-node   # node appears online in the console
```

See [docs/OPERATING.md](./docs/OPERATING.md) for enrolling nodes, adopting stations, driving terminals/files/logs, and provisioning runtimes.

## Status

**v0.1.0** — single-operator (one admin account; signup closes after the first user). Multi-tenancy (orgs, tenant isolation, billing) is a deliberate post-release effort targeting v0.2.0.

## Legacy / OpenCode era

The previous OpenCode-based product is frozen at tag **`v0.0.4-opencode`**. Archived docs are under [`docs/archive/`](./docs/archive/).

## License

MIT
