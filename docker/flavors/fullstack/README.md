# AgentPod Full-Stack Flavor

JavaScript, TypeScript, and Python development environment for full-stack web applications.

## Languages

- JavaScript (ES2024)
- TypeScript
- Python 3.12

## Included Tools

### JavaScript/TypeScript
- npm, pnpm, yarn, bun
- typescript, tsx, esbuild
- vite, turbo
- prettier, eslint

### Python
- pip, uv, poetry
- ruff, black, mypy
- pytest, httpie

### Database
- postgresql-client

### DevOps
- docker CLI

## Frameworks Supported

### Frontend
- React, Vue, Svelte
- Next.js, Nuxt, SvelteKit

### Backend (Node.js)
- Express, Fastify, Hono
- Nest.js

### Backend (Python)
- Django, Flask
- FastAPI, Starlette

## Usage

```bash
docker run -it agentpod-fullstack:latest
```

### Typical Project Structure

```
myproject/
├── frontend/          # React/Vue/Svelte
│   ├── package.json
│   └── src/
├── backend/           # FastAPI/Django
│   ├── pyproject.toml
│   └── app/
└── docker-compose.yml
```

### Running Both Services

```bash
# Terminal 1: Frontend
cd frontend && pnpm dev

# Terminal 2: Backend
cd backend && uvicorn app:main --reload
```

## Building

```bash
./docker/scripts/build-flavor.sh fullstack
```

## Default Flavor

This is the **default flavor** for new projects as it covers the most common use cases.
