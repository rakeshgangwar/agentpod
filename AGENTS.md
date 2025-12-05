# AGENTS.md

## Build & Development Commands
- `pnpm dev` - Start Vite dev server (port 1420)
- `pnpm build` - Production build
- `pnpm check` - TypeScript/Svelte type checking
- `pnpm tauri dev` - Run full Tauri app in dev mode
- `pnpm tauri build` - Build desktop/mobile app
- `cargo test` - Run Rust tests (in src-tauri/)
- `cargo test <test_name>` - Run single Rust test

## Code Style
- **TypeScript**: Strict mode, ES modules, double quotes, semicolons
- **Svelte**: Use Svelte 5 runes (`$state`, `$derived`), `<script lang="ts">`
- **Rust**: Edition 2021, `#[tauri::command]` for IPC, snake_case functions
- **Imports**: Use `@tauri-apps/api/core` for invoke, absolute paths preferred
- **Formatting**: 2-space indent (TS/Svelte), 4-space indent (Rust)

## Architecture
- Frontend: SvelteKit + TypeScript in `src/`
- Backend: Tauri v2 + Rust in `src-tauri/`
- Static adapter (SSG), no SSR (`ssr = false` in layout)
- Commands exposed via `invoke()` from frontend to Rust

## MCP Servers
- When you need to search documentation (e.g., Tauri, Svelte, Rust), use `context7` tools
