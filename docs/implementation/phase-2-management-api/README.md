# Phase 2: Management API

## Status: COMPLETE ✅

Build the backend service that orchestrates project lifecycle, container management, and credential handling.

**Deployed at**: https://api.superchotu.com

## Objectives

1. ✅ Set up Bun/TypeScript project structure with Hono
2. ✅ Implement Coolify API client
3. ✅ Implement Forgejo API client
4. ✅ Create project lifecycle endpoints
5. ✅ Implement credential management
6. ✅ Deploy to Coolify

## Prerequisites

- Phase 1 complete ✅
- Coolify API token ✅
- Forgejo API token ✅
- Bun installed locally (or Node.js 20+) ✅

## Duration

**Estimated:** 3-5 days
**Actual:** ~4 days (including debugging Coolify API issues)

## Deliverables

- [x] Management API deployed on VPS
- [x] Can create projects (Forgejo repo + OpenCode container)
- [x] Can start/stop containers via API
- [x] LLM credentials stored and injected into containers
- [x] GitHub import working (via Forgejo mirror)

## Success Criteria

1. ✅ `POST /api/projects` creates repo in Forgejo and container in Coolify
2. ✅ `POST /api/projects/:id/start` starts the container
3. ✅ `GET /api/projects` returns list of all projects with status
4. ✅ Credentials are properly injected into containers
5. ✅ Container reaches `running:healthy` status

## Tech Stack

- **Runtime**: Bun (or Node.js 20)
- **Language**: TypeScript
- **Framework**: Hono (ultrafast, multi-runtime, SST team's choice)
- **Validation**: Zod with @hono/zod-validator
- **Database**: SQLite (simple, file-based)
- **Deployment**: Docker via Coolify

### Why Hono?

Hono is the framework used by the SST team (creators of OpenCode). Key benefits:
- **Ultrafast** - Uses `RegExpRouter` for high-performance routing
- **Multi-runtime** - Same code runs on Bun, Node.js, Deno, Cloudflare Workers
- **Lightweight** - ~14KB with no external dependencies
- **Type-safe RPC** - Hono Client (`hc`) for type-safe API calls from mobile app
- **Built-in middleware** - CORS, validation, auth, etc.

## Key Technical Decisions

### Embedded Dockerfile Approach

Instead of using Coolify's git-based deployment (which had issues with self-hosted Forgejo URLs), we embed the Dockerfile directly:

1. Dockerfile content is base64 encoded and sent to `/applications/dockerfile`
2. No git cloning during Docker build
3. Container clones Forgejo repo at startup via entrypoint script
4. This bypasses Coolify's URL-stripping behavior

### URL Transformation

Forgejo returns clone URLs with internal port (`:3000`), but containers need public HTTPS:
- Internal: `https://forgejo.superchotu.com:3000/owner/repo.git`
- Public: `https://forgejo.superchotu.com/owner/repo.git`

## Files in This Phase

- [tasks.md](./tasks.md) - Detailed task breakdown with completion status
- [technical-notes.md](./technical-notes.md) - API design, code snippets, and critical bug fixes

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/api/info` | API info |
| GET | `/api/projects` | List projects |
| POST | `/api/projects` | Create project |
| GET | `/api/projects/:id` | Get project with status |
| DELETE | `/api/projects/:id` | Delete project |
| POST | `/api/projects/:id/start` | Start container |
| POST | `/api/projects/:id/stop` | Stop container |
| GET | `/api/providers` | List LLM providers |
| POST | `/api/providers/:id/configure` | Set API key |

## Next Phase

Phase 3: Mobile Foundation - Set up Tauri + Svelte mobile app structure.
