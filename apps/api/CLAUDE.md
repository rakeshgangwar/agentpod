# Management API

## Overview

Backend service for Portable Command Center that orchestrates:
- Project lifecycle (create, delete, start, stop)
- Container management via Coolify API
- Repository management via Forgejo API
- LLM credential management

## Tech Stack

- **Runtime**: Bun
- **Framework**: Hono (SST team's choice)
- **Validation**: Zod with @hono/zod-validator
- **Database**: PostgreSQL via Drizzle ORM

## Development Commands

```bash
bun run dev      # Start with hot reload
bun run start    # Start production server
bun run typecheck # Run TypeScript type checking
bun test         # Run tests
```

## Project Structure

```
src/
├── index.ts        # Hono app entry point
├── config.ts       # Environment configuration
├── routes/         # API route handlers
├── services/       # Business logic & external API clients
├── models/         # Data models & database operations
├── db/             # Database schema & migrations
└── utils/          # Shared utilities
```

## API Routes

- `GET /health` - Health check (public)
- `GET /api/info` - API information (public)
- `GET /api/projects` - List all projects (auth required)
- `POST /api/projects` - Create new project (auth required)
- `DELETE /api/projects/:id` - Delete project (auth required)
- `POST /api/projects/:id/start` - Start container (auth required)
- `POST /api/projects/:id/stop` - Stop container (auth required)

## Authentication

Uses Bearer token authentication. Set `API_TOKEN` in `.env`.

```bash
curl -H "Authorization: Bearer your-token" http://localhost:3001/api/projects
```

## Environment

Copy `.env.example` to `.env` and fill in the values.

## Code Style

- Use Hono's chained route syntax for type-safe RPC
- Export `AppType` from index.ts for Hono Client
- Use Zod schemas for request validation
- Keep routes thin, business logic in services
