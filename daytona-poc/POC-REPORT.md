# Daytona Self-Hosted POC Report

**Date**: December 10, 2025  
**Status**: ✅ Successful  
**Objective**: Validate Daytona as a sandbox provider for running OpenCode agents

---

## Executive Summary

This POC successfully demonstrates that **Daytona can run as a self-hosted sandbox platform** for OpenCode agents. After resolving several Docker-in-Docker (DinD) related issues, we achieved:

- ✅ Full Daytona stack running via Docker Compose
- ✅ Sandbox creation and lifecycle management
- ✅ Background process execution (critical for `opencode serve`)
- ✅ SDK integration for programmatic control

**Recommendation**: Proceed with Daytona integration for the hybrid sandbox architecture.

---

## Background

### Why Daytona?

We evaluated several sandbox providers for running OpenCode agents:

| Option | Pros | Cons |
|--------|------|------|
| **Daytona** | Open source, self-hosted, background sessions | More complex setup |
| E2B | Simple API, fast startup | Cloud-only, vendor lock-in |
| Modal | Great DX, GPUs | Cloud-only, expensive |

Daytona was selected for its **self-hosted capability** and **open-source license** (AGPL-3.0).

---

## Technical Implementation

### Stack Components

The self-hosted Daytona stack consists of 9 services:

| Service | Image | Purpose |
|---------|-------|---------|
| API | `daytonaio/daytona-api` | Main control plane |
| Proxy | `daytonaio/daytona-proxy` | Preview URL routing |
| Runner | `daytonaio/daytona-runner` | Sandbox host (DinD) |
| SSH Gateway | `daytonaio/daytona-ssh-gateway` | SSH access to sandboxes |
| Database | `postgres:18` | Persistent storage |
| Redis | `redis:latest` | Caching/sessions |
| Dex | `dexidp/dex:v2.42.0` | OIDC authentication |
| Registry | `registry:2.8.2` | Docker image storage |
| MinIO | `minio/minio:latest` | Object storage (snapshots) |

### Issues Encountered & Solutions

#### 1. API Crash Loop at Startup

**Symptom**: API container exiting with code 1 after "Default snapshot not found, creating..."

**Root Cause**: OTEL collector not present, causing initialization failure.

**Solution**: Set `OTEL_ENABLED=false` in API environment.

#### 2. Runner Not Registering with API

**Symptom**: API logs showing "No available runners" despite runner being healthy.

**Root Cause**: Runner reports `-1` for CPU/memory/disk metrics in DinD environment, causing availability score of 0. API default threshold is 60.

**Solution**: Set API environment variables:
```yaml
RUNNER_AVAILABILITY_SCORE_THRESHOLD=0
RUNNER_DECLARATIVE_BUILD_SCORE_THRESHOLD=0
```

#### 3. Sandbox Creation Fails with Cgroup Error

**Symptom**: 
```
failed to write 755: write /sys/fs/cgroup/docker/.../cgroup.procs: no such file or directory
```

**Root Cause**: Docker-in-Docker cannot manage cgroups when running in a nested container with private cgroup namespace.

**Solution**: Add `cgroup: host` to runner service in docker-compose.yml:
```yaml
runner:
  image: daytonaio/daytona-runner
  cgroup: host  # Use host cgroup namespace
  privileged: true
  volumes:
    - /sys/fs/cgroup:/sys/fs/cgroup:rw
```

#### 4. Snapshot in Error State

**Symptom**: Snapshot validation fails with cgroup errors.

**Solution**: Reset snapshot with validation skipped:
```sql
UPDATE snapshot SET state = 'pending', "errorReason" = NULL, "skipValidation" = true 
WHERE name = 'daytonaio/sandbox:0.5.0-slim';
```

---

## Validation Results

### Test: Sandbox Creation
```
✅ Sandbox created: 0b056399-78e2-4b42-bbc4-5da02ca1c6b0
✅ Sandbox started and running
```

### Test: Command Execution
```
✅ sandbox.process.executeCommand() works
✅ Commands execute inside sandbox environment
```

### Test: Background Sessions
```
✅ sandbox.process.createSession() works
✅ sandbox.process.executeSessionCommand({ async: true }) works
✅ Long-running processes persist after command returns
```

### Test: Preview URLs
```
✅ sandbox.getPreviewLink(port) returns accessible URL
```

---

## SDK Usage Notes

### Daytona SDK v0.11.3

```typescript
import { Daytona } from '@daytonaio/sdk';

// Initialize client
const daytona = new Daytona({
  apiKey: process.env.DAYTONA_API_KEY,
  apiUrl: 'http://localhost:3000/api',  // Note: include /api
});

// Create sandbox
const sandbox = await daytona.create(
  { image: 'daytonaio/sandbox:0.5.0-slim' },
  120  // timeout in seconds
);

// Execute command
const result = await sandbox.process.executeCommand('echo hello');
console.log(result.result);  // "hello"

// Background session (critical for long-running processes)
await sandbox.process.createSession('my-session');
await sandbox.process.executeSessionCommand('my-session', {
  command: 'opencode serve --port 4096',
  async: true,  // Don't wait for completion
});

// Preview URL
const url = sandbox.getPreviewLink(4096);  // returns string directly

// Cleanup
await sandbox.delete();
```

---

## Production Considerations

### What Works in Self-Hosted Mode

- ✅ Basic sandbox lifecycle (create, start, stop, delete)
- ✅ Command execution and sessions
- ✅ Preview URLs (with proper DNS setup)
- ✅ Custom Docker images
- ✅ SDK integration

### Known Limitations

1. **Cgroup Metrics**: Runner can't report accurate CPU/memory metrics in DinD
2. **Resource Limits**: Not enforceable in DinD without host cgroup access
3. **Observability**: Disabled OTEL means no distributed tracing
4. **DNS**: Requires wildcard DNS or /etc/hosts for preview URLs

### Recommended for Production

1. **Run runner on bare metal** (not in Docker) for proper cgroup support
2. **Use external PostgreSQL** for reliability
3. **Configure TLS** with proper certificates
4. **Set up wildcard DNS** for `*.your-domain.com`
5. **Enable OTEL** with proper collector infrastructure

---

## Hybrid Architecture Fit

This POC validates Daytona for the **lightweight sandbox tier** in our hybrid architecture:

```
┌─────────────────────────────────────────────────────────────┐
│                    Management API                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────┐    ┌─────────────────────────────┐ │
│  │   Daytona Sandboxes │    │     Coolify Workloads      │ │
│  │   (Lightweight)     │    │      (Heavy)               │ │
│  ├─────────────────────┤    ├─────────────────────────────┤ │
│  │ • Quick startup     │    │ • Databases                │ │
│  │ • OpenCode agents   │    │ • Long-running services    │ │
│  │ • Ephemeral tasks   │    │ • Persistent workloads     │ │
│  │ • Auto-cleanup      │    │ • GPU workloads            │ │
│  └─────────────────────┘    └─────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Next Steps

1. **Build Custom OpenCode Image**: Create image with OpenCode pre-installed
2. **Management API Integration**: Add Daytona as sandbox provider
3. **Production Deployment**: Deploy with proper infrastructure
4. **Mobile App Integration**: Connect to sandboxes from mobile app

---

## Files Modified/Created

```
daytona-poc/
├── docker/
│   └── docker-compose.yml    # Updated with cgroup fixes
├── src/
│   ├── config.ts             # Added dotenv import
│   └── create-sandbox.ts     # Updated for SDK v0.11.3
├── .env                      # API key configuration
├── README.md                 # Updated documentation
└── POC-REPORT.md             # This report
```

---

## Conclusion

The Daytona self-hosted POC is **successful**. Despite initial challenges with Docker-in-Docker cgroup management, all core functionality works:

- Sandboxes can be created and managed programmatically
- Background processes persist (solving the Cloudflare Containers limitation)
- The SDK provides a clean interface for integration

**Recommendation**: Proceed with Daytona integration for the management API.
