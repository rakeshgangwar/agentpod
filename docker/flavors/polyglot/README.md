# AgentPod Polyglot Flavor

Multi-language development environment with JavaScript, TypeScript, Python, Go, and Rust.

## Languages

- JavaScript (ES2024) / TypeScript
- Python 3.12
- Go 1.22
- Rust (stable)

## Included Tools

### JavaScript/TypeScript
- npm, pnpm, yarn, bun
- typescript, tsx, ts-node, esbuild
- vite, turbo
- prettier, eslint, biome
- Deno runtime

### Python
- pip, uv, poetry
- ruff, black, mypy
- pytest, pytest-cov
- httpie, jupyterlab, ipython

### Go
- go 1.22.4
- gopls (language server)
- delve (debugger)
- golangci-lint
- air (hot reload)

### Rust
- rustc, cargo (stable toolchain)
- clippy, rustfmt, rust-analyzer
- cargo-watch, cargo-edit
- bacon, just

### Database
- postgresql-client
- redis-tools

### DevOps
- docker CLI
- GitHub CLI (gh)

## Frameworks Supported

### Frontend (JS/TS)
- React, Vue, Svelte
- Next.js, Nuxt, SvelteKit

### Backend (Node.js)
- Express, Fastify, Hono
- Nest.js

### Backend (Python)
- Django, Flask
- FastAPI, Starlette

### Backend (Go)
- Gin, Echo, Fiber
- Chi, Gorilla

### Backend (Rust)
- Actix-web, Axum
- Rocket, Warp

## Usage

```bash
docker run -it codeopen-polyglot:latest
```

### Typical Multi-Language Project

```
myproject/
├── frontend/          # React/Vue/Svelte
│   ├── package.json
│   └── src/
├── api-gateway/       # Go (Gin/Fiber)
│   ├── go.mod
│   └── main.go
├── ml-service/        # Python (FastAPI)
│   ├── pyproject.toml
│   └── app/
├── auth-service/      # Rust (Axum)
│   ├── Cargo.toml
│   └── src/
└── docker-compose.yml
```

### Running Multiple Services

```bash
# Terminal 1: Frontend
cd frontend && pnpm dev

# Terminal 2: API Gateway (Go)
cd api-gateway && air

# Terminal 3: ML Service (Python)
cd ml-service && uvicorn app:main --reload

# Terminal 4: Auth Service (Rust)
cd auth-service && cargo watch -x run
```

## Building

```bash
./docker/scripts/build-flavor.sh polyglot
```

## Image Size

This is the largest flavor (~3GB on top of base) as it includes all language toolchains. Use this when:

- Working with microservices in different languages
- Learning multiple languages
- Projects that genuinely require multiple runtimes

For simpler projects, consider using a single-language flavor like `js`, `python`, `go`, or `rust`.
