# Phase 6: AgentPod TUI (Terminal User Interface)

## Overview

A full-featured terminal UI for AgentPod built with **Rust + ratatui**, providing command-line access to all sandbox management, AI chat, terminal, git, file browsing, provider configuration, workflow execution, and admin features.

## Decision Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Language** | Rust | Existing Rust expertise from Tauri backend, shared `tokio` runtime, single binary output |
| **TUI Framework** | ratatui + crossterm | Mature ecosystem, async support, active community |
| **Feature Scope** | Full parity | All desktop app features: sandboxes, chat, terminal, git, files, providers, workflows, admin |
| **Project Location** | `apps/tui/` in monorepo | Follows existing convention, can share types from `packages/types` |
| **Config Location** | `~/.agentpod/config.toml` | XDG standard, separate from desktop app config |
| **Terminal Mode** | Dual (external + embedded) | External (tmux) by default for full fidelity, embedded (VT100 via `vte`) as opt-in via `--embedded-terminal` flag |
| **Distribution** | cargo-dist CI | Cross-platform binaries via GitHub Actions (Linux, macOS, Windows) |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        AgentPod TUI                         │
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │Dashboard │  │   Chat   │  │ Terminal │  │   Git    │   │
│  │  View    │  │   View   │  │   View   │  │   View   │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘   │
│       │              │              │              │         │
│  ┌────┴──────────────┴──────────────┴──────────────┴─────┐  │
│  │                    App State Machine                   │  │
│  │           (event dispatch, view routing)               │  │
│  └────┬──────────────┬──────────────┬──────────────┬─────┘  │
│       │              │              │              │         │
│  ┌────┴─────┐  ┌─────┴────┐  ┌─────┴────┐  ┌─────┴────┐   │
│  │ crossterm│  │  reqwest │  │tokio-tung│  │  config  │   │
│  │  events  │  │  HTTP    │  │stenite WS│  │  (toml)  │   │
│  └──────────┘  └─────┬────┘  └─────┬────┘  └──────────┘   │
│                      │              │                       │
└──────────────────────┼──────────────┼───────────────────────┘
                       │              │
                       ▼              ▼
              ┌──────────────┐ ┌──────────────┐
              │ Management   │ │   Sandbox    │
              │     API      │ │  Container   │
              │  (Bun+Hono)  │ │   (Docker)   │
              └──────────────┘ └──────────────┘
```

## Project Structure

```
apps/tui/
├── Cargo.toml
├── release.toml                 # cargo-dist config
├── src/
│   ├── main.rs                  # Entry point, CLI args, terminal setup/teardown
│   ├── app.rs                   # App state machine, event dispatch, view routing
│   ├── config.rs                # ~/.agentpod/config.toml (connection, defaults, ui)
│   ├── cli.rs                   # clap CLI args (--api-url, --token, --embedded-terminal)
│   ├── event.rs                 # Event loop: crossterm + tick + mpsc from async tasks
│   ├── api/
│   │   ├── mod.rs               # reqwest client wrapper with auth headers
│   │   ├── auth.rs              # POST /api/auth/sign-in/email, GET /api/auth/session
│   │   ├── sandboxes.rs         # CRUD + lifecycle + exec + stats + logs
│   │   ├── chat.rs              # Sessions, messages, SSE streaming, permissions, fork/revert
│   │   ├── terminal.rs          # WebSocket client (tokio-tungstenite)
│   │   ├── git.rs               # Status, log, commit, branches, diff
│   │   ├── files.rs             # OpenCode file endpoints (list, content, find)
│   │   ├── providers.rs         # List, configure, default, OAuth flow
│   │   ├── workflows.rs         # CRUD, execute, poll status
│   │   └── admin.rs             # Users, stats, audit log
│   ├── terminal/
│   │   ├── mod.rs               # Terminal mode abstraction trait
│   │   ├── external.rs          # tmux launcher (spawn tmux attach -t <id>)
│   │   └── embedded.rs          # VT100 renderer (vte crate + ratatui canvas)
│   ├── types.rs                 # Rust serde structs matching @agentpod/types
│   ├── ui/
│   │   ├── mod.rs               # Root renderer, layout splitter
│   │   ├── theme.rs             # Color schemes (dark, light, custom)
│   │   ├── widgets/
│   │   │   ├── mod.rs
│   │   │   ├── status_bar.rs    # Bottom: connection, sandbox name, key hints
│   │   │   ├── tab_bar.rs       # Top: view tabs with badges
│   │   │   ├── input.rs         # Multi-line text input with cursor
│   │   │   ├── modal.rs         # Centered modal with actions
│   │   │   ├── spinner.rs       # Braille/loading spinners
│   │   │   ├── table.rs         # Sortable, selectable table
│   │   │   ├── tree.rs          # File tree widget
│   │   │   └── diff.rs          # Unified/side-by-side diff viewer
│   │   └── views/
│   │       ├── mod.rs           # View trait + enum dispatch
│   │       ├── login.rs         # Email/password or bearer token input
│   │       ├── dashboard.rs     # Sandbox list with status icons, quick actions
│   │       ├── create_sandbox.rs# Multi-step sandbox creation wizard
│   │       ├── sandbox_detail.rs# Tabs: overview, resources, logs
│   │       ├── chat.rs          # Session list + message area + input + streaming
│   │       ├── terminal.rs      # Terminal view (delegates to external/embedded)
│   │       ├── files.rs         # Tree view + file content preview
│   │       ├── git.rs           # Status, diff viewer, commit form, branches
│   │       ├── providers.rs     # Provider list, config forms, OAuth flow
│   │       ├── workflows.rs     # Workflow list, execution history
│   │       ├── settings.rs      # Connection, defaults, theme, keybindings
│   │       └── admin.rs         # Users table, stats dashboard, audit log
│   └── util.rs                  # Helpers (format bytes, format duration, etc.)
```

## Dependencies

```toml
[package]
name = "agentpod-tui"
version = "0.1.0"
edition = "2021"
description = "Terminal UI for AgentPod"

[dependencies]
# TUI
ratatui = "0.29"
crossterm = { version = "0.28", features = ["event-stream"] }

# Async runtime
tokio = { version = "1", features = ["full"] }
tokio-stream = "0.1"

# HTTP / API
reqwest = { version = "0.12", features = ["json", "stream", "native-tls"] }
futures-util = "0.3"

# WebSocket (terminal)
tokio-tungstenite = { version = "0.24", features = ["native-tls"] }

# Embedded terminal (VT100)
vte = "0.13"

# Serialization
serde = { version = "1", features = ["derive"] }
serde_json = "1"
toml = "0.8"

# CLI
clap = { version = "4", features = ["derive"] }

# Config / paths
dirs = "5"

# Error handling
anyhow = "1"
thiserror = "2"

# Logging
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }

# Utilities
textwrap = "0.16"
chrono = { version = "0.4", features = ["serde"] }
unicode-width = "0.2"
```

## Event Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     main.rs                             │
│  tokio::select! {                                       │
│    crossterm events  → event_tx.send(TerminalEvent)     │
│    tick interval     → event_tx.send(Tick)              │
│    mpsc receiver     → handle AppEvent                  │
│  }                                                     │
└─────────────────┬───────────────────────────────────────┘
                  │
    ┌─────────────┴─────────────┐
    │        AppEvent           │
    ├───────────────────────────┤
    │ Terminal(KeyEvent)        │ ← keyboard input
    │ Tick                      │ ← 60fps render trigger
    │ ApiResult(Result<...>)    │ ← HTTP response
    │ ChatToken(String)         │ ← SSE streaming token
    │ ChatComplete(String)      │ ← SSE stream done
    │ ChatError(String)         │ ← SSE stream error
    │ TerminalOutput(Vec<u8>)   │ ← WebSocket terminal data
    │ TerminalExit              │ ← terminal session ended
    │ PermissionRequest(Perm)   │ ← AI needs approval
    │ ConnectionStatus(bool)    │ ← API health check
    └───────────────────────────┘
```

## API Surface

### Auth
- `POST /api/auth/sign-in/email` — Email/password sign-in
- `GET /api/auth/session` — Get current session
- Bearer token via `Authorization: Bearer <token>`

### Sandboxes
- `GET /api/v2/sandboxes` — List all sandboxes
- `POST /api/v2/sandboxes` — Create sandbox
- `GET /api/v2/sandboxes/:id` — Get sandbox details
- `DELETE /api/v2/sandboxes/:id` — Delete sandbox
- `POST /api/v2/sandboxes/:id/start` — Start sandbox
- `POST /api/v2/sandboxes/:id/stop` — Stop sandbox
- `POST /api/v2/sandboxes/:id/restart` — Restart sandbox
- `POST /api/v2/sandboxes/:id/pause` — Pause sandbox
- `POST /api/v2/sandboxes/:id/unpause` — Unpause sandbox
- `GET /api/v2/sandboxes/:id/logs` — Get container logs
- `GET /api/v2/sandboxes/:id/stats` — Get resource stats
- `POST /api/v2/sandboxes/:id/exec` — Execute command

### OpenCode (AI Chat)
- `GET /api/v2/sandboxes/:id/opencode/session` — List sessions
- `POST /api/v2/sandboxes/:id/opencode/session` — Create session
- `DELETE /api/v2/sandboxes/:id/opencode/session/:sid` — Delete session
- `POST /api/v2/sandboxes/:id/opencode/session/:sid/message` — Send message
- `GET /api/v2/sandboxes/:id/opencode/event` — SSE event stream
- `POST /api/v2/sandboxes/:id/opencode/session/:sid/permissions/:pid` — Respond to permission
- `POST /api/v2/sandboxes/:id/opencode/session/:sid/fork` — Fork session
- `POST /api/v2/sandboxes/:id/opencode/session/:sid/revert` — Revert message

### Terminal (WebSocket)
- `WS /api/v2/sandboxes/:id/terminal` — Interactive terminal
  - Client → Server: `{type: "input", data: "..."}` or `{type: "resize", cols: N, rows: N}`
  - Server → Client: `{type: "output", data: "..."}` or `{type: "connected", shell: "..."}` or `{type: "exit"}`

### Git
- `GET /api/v2/sandboxes/:id/git/status` — Git status
- `GET /api/v2/sandboxes/:id/git/log` — Commit log
- `POST /api/v2/sandboxes/:id/git/commit` — Commit changes
- `GET /api/v2/sandboxes/:id/git/branches` — List branches
- `POST /api/v2/sandboxes/:id/git/branches` — Create branch
- `POST /api/v2/sandboxes/:id/git/checkout` — Checkout branch
- `GET /api/v2/sandboxes/:id/git/diff` — Diff summary
- `GET /api/v2/sandboxes/:id/git/diff/file` — File diff

### Providers
- `GET /api/providers` — List all providers
- `GET /api/providers/configured` — List configured providers
- `POST /api/providers/:id/configure` — Configure API key
- `POST /api/providers/:id/set-default` — Set default
- `POST /api/providers/:id/oauth/init` — Start OAuth flow
- `POST /api/providers/:id/oauth/poll` — Poll OAuth status

### Workflows
- `GET /api/workflows` — List workflows
- `POST /api/workflows` — Create workflow
- `POST /api/workflows/:id/execute` — Execute workflow
- `GET /api/workflows/:id/executions` — List executions

### Admin
- `GET /api/admin/users` — List users
- `GET /api/admin/stats` — System stats
- `GET /api/admin/audit-log` — Audit log

## Implementation Phases

### Phase 1: Foundation
**Files:** `main.rs`, `app.rs`, `config.rs`, `cli.rs`, `event.rs`, `api/mod.rs`, `api/auth.rs`, `ui/mod.rs`, `ui/theme.rs`, `ui/views/login.rs`, `ui/views/dashboard.rs`, `ui/widgets/status_bar.rs`, `ui/widgets/tab_bar.rs`

- [x] Scaffold `apps/tui/` with Cargo.toml
- [ ] Basic event loop with crossterm + tokio::select!
- [ ] App state machine with tab navigation
- [ ] Config file support (`~/.agentpod/config.toml`)
- [ ] Login screen (email/password or bearer token)
- [ ] HTTP client wrapper with auth headers
- [ ] Dashboard view — list sandboxes with status indicators
- [ ] Status bar with connection info and key hints

### Phase 2: Sandbox Management
**Files:** `api/sandboxes.rs`, `ui/views/create_sandbox.rs`, `ui/views/sandbox_detail.rs`, `ui/widgets/modal.rs`, `ui/widgets/spinner.rs`, `ui/widgets/table.rs`

- [ ] Sandbox lifecycle — start/stop/restart/pause/unpause
- [ ] Create sandbox flow — name, flavor, tier, addons selection
- [ ] Delete sandbox with confirmation modal
- [ ] Sandbox detail view — status, resource stats, logs
- [ ] Loading states and spinners

### Phase 3: AI Chat
**Files:** `api/chat.rs`, `ui/views/chat.rs`, `ui/widgets/input.rs`

- [ ] Session management — list, create, delete sessions
- [ ] Message display — scrollable chat history with role colors
- [ ] SSE streaming — real-time token-by-token rendering
- [ ] Permission prompts — approve/reject AI actions
- [ ] Model/agent cycling (Alt+,/.)
- [ ] Session forking and message revert

### Phase 4: Terminal
**Files:** `terminal/mod.rs`, `terminal/external.rs`, `terminal/embedded.rs`, `api/terminal.rs`, `ui/views/terminal.rs`

- [ ] Terminal mode abstraction trait
- [ ] External tmux launcher (default)
- [ ] WebSocket connection to sandbox terminal
- [ ] Terminal resize handling
- [ ] Multiple terminal sessions per sandbox
- [ ] Embedded VT100 renderer (opt-in via `--embedded-terminal`)

### Phase 5: Files + Git
**Files:** `api/files.rs`, `api/git.rs`, `ui/views/files.rs`, `ui/views/git.rs`, `ui/widgets/tree.rs`, `ui/widgets/diff.rs`

- [ ] File tree browser with expand/collapse
- [ ] File content preview with syntax highlighting
- [ ] File search (find by name)
- [ ] Git status view — staged/unstaged changes
- [ ] Git diff viewer — unified format
- [ ] Git commit flow — stage, message, commit
- [ ] Git branch management — list, create, checkout, delete

### Phase 6: Providers + Workflows
**Files:** `api/providers.rs`, `api/workflows.rs`, `ui/views/providers.rs`, `ui/views/workflows.rs`

- [ ] Provider list — configured vs available
- [ ] Provider configuration — API key input
- [ ] OAuth device flow (init → poll → complete)
- [ ] Default provider/model selection
- [ ] Workflow list — name, status, last execution
- [ ] Workflow execution — trigger, poll status, view output

### Phase 7: Admin + Polish
**Files:** `api/admin.rs`, `ui/views/admin.rs`, `ui/views/settings.rs`

- [ ] Admin dashboard — user count, sandbox stats
- [ ] Admin user management — list, create, ban
- [ ] Admin audit log viewer
- [ ] Settings view — connection, defaults, theme
- [ ] Theme system — multiple color schemes
- [ ] Keybinding help screen (`?`)
- [ ] Error handling + user-friendly messages
- [ ] Config export/import
- [ ] cargo-dist release configuration

## Key Bindings

| Key | Action |
|-----|--------|
| `Tab` / `Shift+Tab` | Cycle views |
| `1-9` | Jump to view directly |
| `q` | Quit (from dashboard) |
| `?` | Help screen |
| `n` | New sandbox / New session |
| `Enter` | Select / Confirm |
| `Esc` | Back / Cancel / Close modal |
| `Ctrl+C` | Force quit |
| `/` | Search / Filter |
| `:` | Command palette |
| `Alt+,` / `Alt+.` | Cycle models |
| `Ctrl+,` / `Ctrl+.` | Cycle agents |

## Config File Format

```toml
# ~/.agentpod/config.toml

[connection]
api_url = "http://localhost:3001"
api_token = "your-bearer-token"

[defaults]
flavor = "fullstack"
resource_tier = "builder"

[ui]
theme = "dark"
scroll_speed = 3
embedded_terminal = false
```

## Monorepo Integration

### pnpm-workspace.yaml
Add `apps/tui` to the workspace packages list.

### turbo.json
Add TUI-specific tasks:
```json
{
  "tui:build": { "dependsOn": [], "outputs": ["target/release/agentpod-tui"] },
  "tui:dev": { "cache": false, "persistent": true }
}
```

### CI/CD
Add GitHub Actions workflow for cargo-dist:
- Build cross-platform binaries (Linux x86_64, macOS x86_64/aarch64, Windows x86_64)
- Create GitHub releases with binaries
- Optional: Homebrew tap formula

## Technical References

### SSE Streaming Pattern (reqwest)
```rust
let response = client.get(url).send().await?;
let mut stream = response.bytes_stream();
while let Some(chunk) = stream.next().await {
    let text = String::from_utf8_lossy(&chunk?);
    for line in text.lines() {
        if let Some(data) = line.strip_prefix("data: ") {
            tx.send(AppEvent::ChatToken(data.to_string())).await?;
        }
    }
}
```

### WebSocket Terminal Pattern (tokio-tungstenite)
```rust
let (ws_stream, _) = connect_async(url).await;
let (mut write, mut read) = ws_stream.split();
// Read task: forward output to mpsc channel
tokio::spawn(async move {
    while let Some(Ok(msg)) = read.next().await {
        tx.send(AppEvent::TerminalOutput(msg.into_data())).await?;
    }
});
// Write task: forward keyboard input to WebSocket
```

### Async-to-TUI Bridge Pattern
```rust
tokio::select! {
    // Terminal input (keyboard, mouse)
    event = event_stream.next() => {
        if let Some(Ok(event)) = event {
            app.handle_terminal_event(event).await;
        }
    }
    // API/async events via mpsc
    event = event_rx.recv() => {
        if let Some(event) = event {
            app.handle_app_event(event).await;
        }
    }
    // Render tick (60fps)
    _ = interval.tick() => {
        terminal.draw(|f| app.render(f))?;
    }
}
```

## Related Documents

- [v2 Architecture](../architecture.md)
- [ACP Protocol](../acp-protocol.md)
- [Modular Containers](../modular-containers.md)
- [Authentication](../authentication.md)
- [Technical Architecture](../../technical-architecture.md)
