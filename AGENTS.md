# AGENTS.md

## Monorepo Structure
This is a Turborepo monorepo with the following structure:
- `apps/frontend` - Tauri desktop app (SvelteKit + Rust)
- `apps/api` - Management API (Bun + Hono)
- `packages/types` - Shared TypeScript types (`@agentpod/types`)
- `packages/ui` - Shared UI components (`@agentpod/ui`)
- `packages/tsconfig` - Shared TypeScript configs (`@agentpod/tsconfig`)
- `packages/eslint-config` - Shared ESLint configs (`@agentpod/eslint-config`)
- `docker/` - Container definitions for CLI and Desktop environments

## Build & Development Commands
- `pnpm dev` - Start all apps in dev mode (via Turbo)
- `pnpm dev:frontend` - Start frontend only
- `pnpm dev:api` - Start API only
- `pnpm build` - Production build all packages
- `pnpm check` - TypeScript/Svelte type checking
- `pnpm tauri dev` - Run full Tauri app in dev mode
- `pnpm tauri build` - Build desktop/mobile app
- `cargo test` - Run Rust tests (in apps/frontend/src-tauri/)

## Code Style
- **TypeScript**: Strict mode, ES modules, double quotes, semicolons
- **Svelte**: Use Svelte 5 runes (`$state`, `$derived`), `<script lang="ts">`
- **Rust**: Edition 2021, `#[tauri::command]` for IPC, snake_case functions
- **Imports**: Use `@tauri-apps/api/core` for invoke, `$lib` for Svelte paths
- **Formatting**: 2-space indent (TS/Svelte), 4-space indent (Rust)

## Architecture
- Frontend: SvelteKit + TypeScript in `apps/frontend/src/`
- Backend (Tauri): Rust in `apps/frontend/src-tauri/`
- Backend (API): Bun + Hono in `apps/api/src/`
- Static adapter (SSG), no SSR (`ssr = false` in layout)
- Commands exposed via `invoke()` from frontend to Rust

## MCP Servers
- When you need to search documentation (e.g., Tauri, Svelte, Rust), use `context7` tools
