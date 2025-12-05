# Phase 2: Management API

Build the backend service that orchestrates project lifecycle, container management, and credential handling.

## Objectives

1. Set up Bun/TypeScript project structure with Hono
2. Implement Coolify API client
3. Implement Forgejo API client
4. Create project lifecycle endpoints
5. Implement credential management
6. Deploy to Coolify

## Prerequisites

- Phase 1 complete
- Coolify API token
- Forgejo API token
- Bun installed locally (or Node.js 20+)

## Duration

**Estimated:** 3-5 days

## Deliverables

- [ ] Management API deployed on VPS
- [ ] Can create projects (Forgejo repo + OpenCode container)
- [ ] Can start/stop containers via API
- [ ] LLM credentials stored and injected into containers
- [ ] GitHub import working

## Success Criteria

1. `POST /api/projects` creates repo in Forgejo and container in Coolify
2. `POST /api/projects/:id/start` starts the container
3. `GET /api/projects` returns list of all projects with status
4. Credentials are properly injected into containers

## Tech Stack

- **Runtime**: Bun (or Node.js 20)
- **Language**: TypeScript
- **Framework**: Hono (ultrafast, multi-runtime, SST team's choice)
- **Validation**: Zod with @hono/zod-validator
- **Database**: SQLite (simple, file-based) or PostgreSQL
- **Deployment**: Docker via Coolify

### Why Hono?

Hono is the framework used by the SST team (creators of OpenCode). Key benefits:
- **Ultrafast** - Uses `RegExpRouter` for high-performance routing
- **Multi-runtime** - Same code runs on Bun, Node.js, Deno, Cloudflare Workers
- **Lightweight** - ~14KB with no external dependencies
- **Type-safe RPC** - Hono Client (`hc`) for type-safe API calls from mobile app
- **Built-in middleware** - CORS, validation, auth, etc.

## Files in This Phase

- [tasks.md](./tasks.md) - Detailed task breakdown
- [technical-notes.md](./technical-notes.md) - API design, code snippets
