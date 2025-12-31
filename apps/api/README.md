# Management API

Backend service for the Portable Command Center that orchestrates project lifecycle, container management, and credential handling.

## Features

- **Project Management**: Create, delete, start, stop projects
- **Container Orchestration**: Manage OpenCode containers via Coolify API
- **Repository Management**: Create and manage repos via Forgejo API
- **Credential Management**: Store and inject LLM credentials into containers
- **GitHub Sync**: Import from and sync with GitHub repositories

## Tech Stack

- **Runtime**: [Bun](https://bun.sh)
- **Framework**: [Hono](https://hono.dev) (SST team's choice)
- **Validation**: [Zod](https://zod.dev) with @hono/zod-validator
- **Database**: PostgreSQL via Drizzle ORM

## Quick Start

```bash
# Install dependencies
bun install

# Copy and configure environment
cp .env.example .env
# Edit .env with your values

# Start development server (with hot reload)
bun run dev

# Or start production server
bun run start
```

## API Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/health` | Health check | No |
| GET | `/api/info` | API information | No |
| GET | `/api/projects` | List all projects | Yes |
| POST | `/api/projects` | Create new project | Yes |
| GET | `/api/projects/:id` | Get project details | Yes |
| DELETE | `/api/projects/:id` | Delete project | Yes |
| POST | `/api/projects/:id/start` | Start container | Yes |
| POST | `/api/projects/:id/stop` | Stop container | Yes |
| GET | `/api/providers` | List LLM providers | Yes |
| POST | `/api/providers/:id/configure` | Configure provider | Yes |

## Authentication

Protected endpoints require Bearer token authentication:

```bash
curl -H "Authorization: Bearer your-token" http://localhost:3001/api/projects
```

## Development

```bash
# Run with hot reload
bun run dev

# Type checking
bun run typecheck

# Run tests
bun test
```

## Docker

```bash
# Build image
docker build -t management-api .

# Run container
docker run -p 3001:3001 --env-file .env management-api
```

## Related Documentation

- [Phase 2 Implementation Guide](../docs/implementation/phase-2-management-api/)
- [Technical Architecture](../docs/technical-architecture.md)
