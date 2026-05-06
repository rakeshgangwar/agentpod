# OpenCode Plugins, Skills & MCP Servers

Research findings for enhancing AgentPod development with OpenCode ecosystem tools.

## Recommended Additions to opencode.json

### High-Value MCP Servers

```jsonc
{
  "mcp": {
    // Already configured
    "tauri-mcp": { ... },
    "context7": { ... },
    "gh_grep": { ... },
    "assistant-ui": { ... },
    "chrome-devtools": { ... },

    // Recommended additions:

    // GitHub integration - PRs, issues, repo management
    "github": {
      "type": "local",
      "command": ["npx", "-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}" }
    },

    // PostgreSQL - direct DB access for debugging
    "postgres": {
      "type": "local",
      "command": ["npx", "-y", "@modelcontextprotocol/server-postgres", "${DATABASE_URL}"]
    },

    // Playwright - browser automation & E2E testing
    "playwright": {
      "type": "local",
      "command": ["npx", "-y", "@playwright/mcp@latest"]
    },

    // shadcn/ui - component registry for UI development
    "shadcn": {
      "type": "local",
      "command": ["npx", "-y", "shadcn@latest", "mcp"]
    },

    // DeepWiki - documentation lookup
    "deepwiki": {
      "type": "local",
      "command": ["npx", "-y", "deepwiki-mcp"]
    }
  }
}
```

## Useful Skills to Create

### 1. `tui-developer` Skill
For developing the AgentPod TUI with ratatui patterns.

**Location:** `.opencode/skills/tui-developer/SKILL.md`

```markdown
---
name: tui-developer
description: Rust TUI development with ratatui, crossterm, and tokio async patterns
---

# TUI Developer Skill

## When to Use
- Building or modifying the AgentPod TUI (`apps/tui/`)
- Working with ratatui widgets, layouts, and event handling
- Implementing async patterns (SSE streaming, WebSocket, tokio channels)

## Key Patterns
1. **Event Loop**: tokio::select! with crossterm events + mpsc channel + tick interval
2. **State Management**: Single App struct with view-specific state enums
3. **View Routing**: Tab enum dispatching to view-specific render functions
4. **Async Bridge**: mpsc channels from background tasks to event loop
5. **SSE Streaming**: reqwest bytes_stream + line-by-line parsing
6. **WebSocket**: tokio-tungstenite split (read/write tasks)

## References
- ratatui docs: https://ratatui.rs
- Async patterns: https://ratatui.rs/concepts/backends/crossterm/
- AgentPod TUI plan: docs/v2/phase-6-tui/README.md
```

### 2. `sandbox-debugger` Skill
For debugging sandbox container issues.

**Location:** `.opencode/skills/sandbox-debugger/SKILL.md`

```markdown
---
name: sandbox-debugger
description: Debug AgentPod sandbox containers, Docker issues, and orchestrator problems
---

# Sandbox Debugger Skill

## When to Use
- Sandbox fails to start or crashes
- Container networking issues
- OpenCode server not responding inside sandbox
- Resource limit problems

## Debugging Steps
1. Check sandbox status: GET /api/v2/sandboxes/:id
2. Get container logs: GET /api/v2/sandboxes/:id/logs
3. Check resource stats: GET /api/v2/sandboxes/:id/stats
4. Exec into container: POST /api/v2/sandboxes/:id/exec
5. Check Docker health: docker ps, docker logs, docker inspect
6. Verify network: docker network inspect agentpod-net
```

### 3. `api-explorer` Skill
For exploring and testing the AgentPod API.

**Location:** `.opencode/skills/api-explorer/SKILL.md`

```markdown
---
name: api-explorer
description: Explore, test, and debug the AgentPod Management API endpoints
---

# API Explorer Skill

## When to Use
- Testing new API endpoints
- Debugging API issues
- Understanding request/response formats

## How to Use
1. API runs at http://localhost:3001 (default)
2. Auth: Bearer token in Authorization header
3. See docs/v2/phase-6-tui/README.md for full API surface
4. Use curl or the TUI to test endpoints
```

## Recommended OpenCode Plugins

### 1. oh-my-openagent
**Repo:** https://github.com/code-yeongyu/oh-my-openagent

Massive plugin with 26 tools and 52 hooks:
- `grep` — Fast ripgrep-based content search
- `hashline-edit` — Line-precise file editing
- `task-list` — Task management
- `look-at` — Multimodal file analysis
- Background tasks, context recovery

### 2. ocx (OpenCode Component Registry)
**Repo:** https://github.com/kdcokenny/ocx

Community registry of agents, skills, plugins, commands, and tools for OpenCode.

### 3. everything-claude-code
**Repo:** https://github.com/affaan-m/everything-claude-code

Cross-agent toolkit with useful tools:
- `git-summary` — Git branch/status/commit summary
- `format-code` — Auto-detect formatter
- `lint-check` — Auto-detect linter
- `changed-files` — Show changed files as tree
- `check-coverage` — Test coverage threshold
- `security-audit` — Dependency/secrets scan

### 4. superpowers
**Repo:** https://github.com/obra/superpowers

Skills for advanced Git workflows:
- Git worktrees management
- Branch finishing
- Subagent development
- Plan execution

## MCP Server Reference

### Development & Code
| Server | Purpose | Install |
|--------|---------|---------|
| `@modelcontextprotocol/server-github` | GitHub PRs, issues, repos | `npx -y @modelcontextprotocol/server-github` |
| `@modelcontextprotocol/server-git` | Git repo interaction | `uvx mcp-server-git` |
| `@modelcontextprotocol/server-filesystem` | Filesystem access | `npx @modelcontextprotocol/server-filesystem` |

### Browser & Testing
| Server | Purpose | Install |
|--------|---------|---------|
| `@playwright/mcp` | Browser automation, E2E testing | `npx @playwright/mcp@latest` |
| `chrome-devtools` | Chrome DevTools | Built-in to OpenCode |

### Databases
| Server | Purpose | Install |
|--------|---------|---------|
| `@modelcontextprotocol/server-postgres` | PostgreSQL | `npx -y @modelcontextprotocol/server-postgres "$PG_URL"` |
| `mongodb-js/mongodb-mcp-server` | MongoDB | See repo |

### Documentation & Knowledge
| Server | Purpose | Install |
|--------|---------|---------|
| `@upstash/context7-mcp` | Live library docs | `npx -y @upstash/context7-mcp` |
| `deepwiki-mcp` | DeepWiki docs | `npx -y deepwiki-mcp` |

### Design & UI
| Server | Purpose | Install |
|--------|---------|---------|
| `shadcn@latest mcp` | shadcn/ui components | `npx shadcn@latest mcp` |

## Skill Structure Reference

```
.opencode/skills/
├── tui-developer/
│   └── SKILL.md
├── sandbox-debugger/
│   └── SKILL.md
└── api-explorer/
    └── SKILL.md
```

SKILL.md format:
```markdown
---
name: skill-name
description: One-line description (1024 chars max)
---

# Skill Title

## When to Use
...

## How It Works
...

## Examples
...
```

## Custom Commands Reference

Add to `opencode.json` under `"command"`:

```jsonc
{
  "command": {
    "tui-build": {
      "template": "Build the AgentPod TUI:\n\ncd apps/tui && cargo build --release\n\nReport any compilation errors.",
      "description": "Build the TUI application",
      "agent": "tauri-frontend"
    },
    "tui-test": {
      "template": "Run TUI tests:\n\ncd apps/tui && cargo test\n\nReport test results.",
      "description": "Run TUI tests",
      "agent": "tauri-frontend"
    },
    "sandbox-logs": {
      "template": "Get sandbox logs for debugging:\n\ncurl -s http://localhost:3001/api/v2/sandboxes/$ARGUMENTS/logs | jq .\n\nAnalyze the logs and identify any issues.",
      "description": "Fetch and analyze sandbox logs",
      "agent": "plan"
    }
  }
}
```
