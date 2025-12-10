# Daytona POC - OpenCode Sandbox

Proof of Concept for running OpenCode in self-hosted Daytona sandboxes.

## Status: ✅ Working

The POC successfully demonstrates:
- Self-hosted Daytona running via Docker Compose
- Sandbox creation and lifecycle management
- Background sessions with async command execution
- SDK integration for programmatic sandbox control

## Overview

This POC validates Daytona as a sandbox provider for running OpenCode agents. Key capabilities tested:

1. **Self-hosting Daytona** via Docker Compose (9 services)
2. **Sandbox creation** with custom images
3. **Background processes** via Sessions API (`async: true`)
4. **Preview URLs** for external access to sandbox services

## Prerequisites

- Docker & Docker Compose
- Node.js 20+
- pnpm

## Quick Start

### 1. Start Daytona Stack

```bash
cd docker
docker compose up -d

# Wait for all services to be healthy (~30 seconds)
docker compose ps
```

Services available at:
- **Daytona Dashboard**: http://localhost:3000
- **Dex (OIDC)**: http://localhost:5556
- **Registry**: http://localhost:6000
- **MinIO Console**: http://localhost:9001

### 2. Login and Configure

1. Open http://localhost:3000
2. Login with `dev@daytona.io` / `password`
3. Go to **Settings → Regions** and set a default region
4. Go to **Settings → API Keys** and create a new key

### 3. Configure Environment

```bash
cp .env.example .env
# Edit .env with your API key:
# DAYTONA_API_KEY=dtn_your_key_here
# DAYTONA_API_URL=http://localhost:3000/api
```

### 4. Install Dependencies

```bash
pnpm install
```

### 5. Create a Sandbox

```bash
pnpm create-sandbox
```

### 6. Cleanup

```bash
pnpm cleanup
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Docker Compose Stack                        │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────────────────┐ │
│  │   API   │  │  Proxy  │  │  Runner │  │    SSH Gateway      │ │
│  │  :3000  │  │  :4000  │  │  :3003  │  │       :2222         │ │
│  └────┬────┘  └────┬────┘  └────┬────┘  └─────────────────────┘ │
│       │            │            │                                │
│       │            │            ▼                                │
│       │            │     ┌──────────────┐                        │
│       │            │     │   Sandboxes  │  (Docker-in-Docker)    │
│       │            │     │   ┌──────┐   │                        │
│       │            │     │   │ App  │   │                        │
│       │            │     │   └──────┘   │                        │
│       │            │     └──────────────┘                        │
│       │            │                                             │
├───────┴────────────┴─────────────────────────────────────────────┤
│  ┌──────┐  ┌───────┐  ┌─────┐  ┌──────────┐  ┌───────┐          │
│  │  DB  │  │ Redis │  │ Dex │  │ Registry │  │ MinIO │          │
│  └──────┘  └───────┘  └─────┘  └──────────┘  └───────┘          │
└─────────────────────────────────────────────────────────────────┘
```

## Project Structure

```
daytona-poc/
├── docker/
│   ├── docker-compose.yml        # Daytona stack (9 services)
│   ├── dex/
│   │   └── config.yaml           # OIDC configuration
│   └── opencode-sandbox/
│       └── Dockerfile            # Custom OpenCode image (optional)
├── scripts/
│   ├── build-image.sh            # Build & push custom image
│   └── setup-dns.sh              # DNS setup for proxy URLs
├── src/
│   ├── config.ts                 # Configuration with dotenv
│   ├── daytona-client.ts         # Daytona SDK wrapper
│   ├── create-sandbox.ts         # Create sandbox + run commands
│   ├── test-connection.ts        # Test sandbox connectivity
│   └── cleanup.ts                # Delete sandbox
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

## Key Technical Details

### Background Sessions (Critical Feature)

Daytona supports background sessions via the Sessions API:

```typescript
// Create a session
await sandbox.process.createSession('my-session');

// Run command asynchronously (doesn't block!)
const result = await sandbox.process.executeSessionCommand('my-session', {
  command: 'opencode serve --port 4096 --hostname 0.0.0.0',
  async: true,  // Key: don't wait for completion
});

console.log(result.cmdId);  // Track the command
```

This enables long-running processes like `opencode serve` to persist in the background.

### Docker-in-Docker Considerations

The self-hosted setup runs sandboxes inside the runner container (DinD). Key fixes applied:

1. **Cgroup Mode**: `cgroup: host` on runner for proper cgroup management
2. **Availability Score**: Set threshold to 0 to accept runners with failing metrics
3. **Skip Validation**: Needed for snapshots when cgroups aren't fully functional

### SDK Version Notes (v0.11.3)

```typescript
// Create sandbox
const sandbox = await daytona.create({ image: 'your-image' }, timeoutSeconds);

// Execute command
const result = await sandbox.process.executeCommand('echo hello');

// Preview URL (returns string, not object)
const url = sandbox.getPreviewLink(port);  // string
```

## Troubleshooting

### Runner Not Accepting Sandboxes

Check runner health:
```bash
docker compose logs runner | grep -i error
```

Common fix: Set `RUNNER_AVAILABILITY_SCORE_THRESHOLD=0` in API environment.

### Sandbox Creation Fails with Cgroup Error

Ensure runner has `cgroup: host` in docker-compose.yml.

### "Snapshot is error" State

Reset the snapshot in the database:
```bash
docker compose exec db psql -U user -d daytona -c \
  "UPDATE snapshot SET state = 'pending', \"errorReason\" = NULL, \"skipValidation\" = true WHERE name = 'your-image';"
```

### Cannot Connect to API

1. Check API health: `curl http://localhost:3000/api/health`
2. Verify API key is correct
3. Ensure URL includes `/api` suffix

## Next Steps

1. **Custom Image**: Build image with OpenCode pre-installed
2. **Integration**: Add Daytona provider to management-api
3. **Production**: Deploy with proper TLS and domain configuration
4. **Scaling**: Configure multiple runners for load distribution

## References

- [Daytona Documentation](https://www.daytona.io/docs)
- [Daytona GitHub](https://github.com/daytonaio/daytona)
- [Daytona SDK](https://www.npmjs.com/package/@daytonaio/sdk)
- [OpenCode SDK](https://www.npmjs.com/package/@opencode-ai/sdk)
