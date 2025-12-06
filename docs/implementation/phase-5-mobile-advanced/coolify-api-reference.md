# Coolify API Reference for CodeOpen

This document lists the verified Coolify API endpoints used by CodeOpen's Management API.

## API Base URL

```
${COOLIFY_URL}/api/v1
```

## Authentication

All requests require Bearer token authentication:
```
Authorization: Bearer ${COOLIFY_TOKEN}
```

---

## Verified Endpoints (Tested Dec 2024)

### Applications

| Method | Endpoint | Description | Response |
|--------|----------|-------------|----------|
| `GET` | `/applications` | List all applications | `Application[]` |
| `GET` | `/applications/{uuid}` | Get application details | `Application` |
| `GET` | `/applications/{uuid}/start` | Start application | `void` |
| `GET` | `/applications/{uuid}/stop` | Stop application | `void` |
| `GET` | `/applications/{uuid}/restart` | Restart application | `void` |
| `GET` | `/applications/{uuid}/logs` | Get container logs | `{ logs: string }` |
| `GET` | `/applications/{uuid}/logs?lines=N` | Get N lines of logs | `{ logs: string }` |
| `POST` | `/applications/dockerfile` | Create app from Dockerfile | `{ uuid: string }` |
| `PATCH` | `/applications/{uuid}` | Update application settings | `void` |
| `DELETE` | `/applications/{uuid}` | Delete application | `void` |

### Deploy

| Method | Endpoint | Description | Response |
|--------|----------|-------------|----------|
| `GET` | `/deploy?uuid={uuid}` | Trigger deployment | `{ deployments: Deployment[] }` |
| `GET` | `/deploy?uuid={uuid}&force=true` | Force deployment | `{ deployments: Deployment[] }` |

### Deployments

| Method | Endpoint | Description | Response |
|--------|----------|-------------|----------|
| `GET` | `/deployments` | List all deployments | `Deployment[]` |

**Note:** The `/deployments` endpoint returns an empty array when there are no recent/active deployments. Deployment history is not persisted long-term.

### Environment Variables

| Method | Endpoint | Description | Response |
|--------|----------|-------------|----------|
| `GET` | `/applications/{uuid}/envs` | List env vars | `EnvVar[]` |
| `POST` | `/applications/{uuid}/envs` | Create env var | `{ uuid: string }` |
| `PATCH` | `/applications/{uuid}/envs/bulk` | Bulk update env vars | `void` |
| `DELETE` | `/applications/{uuid}/envs/{envUuid}` | Delete env var | `void` |

### Servers & Projects

| Method | Endpoint | Description | Response |
|--------|----------|-------------|----------|
| `GET` | `/servers` | List all servers | `Server[]` |
| `GET` | `/servers/{uuid}` | Get server details | `Server` |
| `GET` | `/projects` | List Coolify projects | `CoolifyProject[]` |

---

## Endpoints NOT Available

These endpoints do not exist in the tested Coolify version:

| Endpoint | Status | Alternative |
|----------|--------|-------------|
| `GET /applications/{uuid}/deployments` | 404 | Use `GET /deployments` and filter |
| `GET /deployments/{uuid}` | Not tested | N/A |
| `GET /deployments/{uuid}/logs` | Not tested | N/A |
| `DELETE /deployments/{uuid}` | Not tested | N/A |
| `GET /applications/{uuid}/status` | 404 | Status is in application details |

---

## Type Definitions

### Application

```typescript
interface Application {
  uuid: string;
  name: string;
  description: string | null;
  status: string;  // "running:healthy", "stopped", "building", etc.
  fqdn: string | null;
  build_pack: string;
  base_directory: string | null;
  ports_exposes: string;
  git_repository: string | null;
  git_branch: string | null;
  created_at: string;
  updated_at: string;
  // Many more fields...
}
```

### Deployment (from /deploy response)

```typescript
interface DeploymentResponse {
  deployments: Array<{
    message: string;
    resource_uuid: string;
    deployment_uuid: string;
  }>;
}
```

### LogsResponse

```typescript
interface LogsResponse {
  logs: string;  // Newline-separated log entries
}
```

---

## Implementation Notes

1. **Logs Endpoint**: Returns all container stdout/stderr. The `lines` parameter limits output but may not work in all Coolify versions.

2. **Deploy Endpoint**: Uses GET method (not POST). Returns deployment UUIDs that can theoretically be tracked.

3. **Status Field**: Application status includes health info, e.g., "running:healthy", "stopped", "building", "exited".

4. **Deployment Tracking**: Coolify doesn't persist deployment history via API for long. For build logs, you'd need to query during the build.

---

## Endpoints to Implement in Management API

Based on the verified Coolify API, these endpoints should be added to the Management API:

### Already Implemented
- `POST /api/projects/:id/start`
- `POST /api/projects/:id/stop`
- `POST /api/projects/:id/restart`

### To Add
- `GET /api/projects/:id/logs` → Proxies to Coolify logs endpoint
- `GET /api/projects/:id/logs?lines=N` → With line limit
- `POST /api/projects/:id/deploy` → Triggers rebuild via Coolify deploy endpoint

### Deferred (Limited Coolify Support)
- Deployment history (Coolify doesn't persist this well)
- Deployment logs (requires tracking active deployments)
- Cancel deployment (not verified)
