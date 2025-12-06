# OpenCode Configuration Architecture

This document describes the architecture for managing OpenCode configurations across the platform, enabling full customization of agents, commands, tools, plugins, permissions, and settings.

## Overview

OpenCode supports a hierarchical configuration system where settings are merged from multiple sources. We leverage this to provide:

1. **Platform Defaults** - Secure baseline configuration
2. **Project Config** - Project-specific settings stored in git
3. **User Global Config** - User preferences applied across all their projects

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Configuration Hierarchy                           │
│                                                                      │
│  Priority (Low → High):                                              │
│                                                                      │
│  1. Platform Defaults     ~/.config/opencode/     (Docker image)    │
│  2. Project Config        .opencode/ in repo      (Git repository)  │
│  3. User Settings JSON    OPENCODE_CONFIG         (Management API)  │
│  4. User Config Directory OPENCODE_CONFIG_DIR     (Management API)  │
│                                                                      │
│  Merge Behavior: Deep merge, later configs override conflicting keys │
└─────────────────────────────────────────────────────────────────────┘
```

## Configuration Layers

### Layer 1: Platform Defaults (Docker Image)

Baked into the Docker image at `~/.config/opencode/`. Provides secure baseline settings.

**Location:** `~/.config/opencode/opencode.json`

```json
{
  "$schema": "https://opencode.ai/config.json",
  "autoupdate": false,
  "share": "disabled",
  "permission": {
    "bash": "ask",
    "write": "ask",
    "edit": "allow",
    "webfetch": "ask",
    "mcp": "ask",
    "doom_loop": "ask",
    "external_directory": "ask"
  }
}
```

**Purpose:**
- Ensure secure defaults for all containers
- Disable auto-update (containers are immutable)
- Disable sharing (not needed in container context)
- Require approval for potentially dangerous operations

**Can be modified by:** No one (read-only in image)

---

### Layer 2: Project Config (Git Repository)

Stored in the project's git repository under `.opencode/` directory.

**Location:** `/workspace/.opencode/` (cloned from git)

```
.opencode/
├── opencode.json       # Project-specific settings
├── AGENTS.md           # Project instructions/rules
├── agent/              # Project-specific agents
│   ├── reviewer.md
│   └── tester.md
├── command/            # Project-specific commands
│   ├── deploy.md
│   └── test.md
├── tool/               # Project-specific custom tools
│   └── database.ts
└── plugin/             # Project-specific plugins
    └── notify.ts
```

**Purpose:**
- Project-specific agents, commands, tools, plugins
- Project-specific permission overrides
- AGENTS.md for project context and rules
- Shared with team via git

**Can be modified by:** OpenCode agent (changes committed to git on manual trigger)

---

### Layer 3: User Settings JSON (OPENCODE_CONFIG)

User's global opencode.json settings stored in Management API database.

**Loaded via:** `OPENCODE_CONFIG=/app/user-config.json` environment variable

```json
{
  "$schema": "https://opencode.ai/config.json",
  "theme": "dracula",
  "model": "anthropic/claude-sonnet-4-5",
  "small_model": "anthropic/claude-haiku-4-5",
  "keybinds": {
    "submit": "ctrl+enter"
  },
  "permission": {
    "bash": {
      "git status": "allow",
      "git diff": "allow"
    }
  }
}
```

**Purpose:**
- User's preferred theme, model, keybinds
- User's permission preferences
- Applied across all user's projects

**Can be modified by:** User via mobile app (not by agent)

---

### Layer 4: User Config Directory (OPENCODE_CONFIG_DIR)

User's global agents, commands, tools, and plugins stored in Management API database.

**Loaded via:** `OPENCODE_CONFIG_DIR=/app/user-config-dir` environment variable

```
/app/user-config-dir/
├── opencode.json       # Additional settings (optional)
├── AGENTS.md           # User's global instructions
├── agent/              # User's global agents
│   └── my-helper.md
├── command/            # User's global commands
│   └── my-deploy.md
├── tool/               # User's global tools
│   └── my-tool.ts
└── plugin/             # User's global plugins
    └── my-plugin.ts
```

**Purpose:**
- User's personal agents available in all projects
- User's personal commands available everywhere
- User's custom tools and plugins
- Highest priority (overrides project and platform)

**Can be modified by:** User via mobile app (not by agent)

---

## Data Flow

### Container Startup

```
┌────────────────────────────────────────────────────────────────────┐
│                      Container Entrypoint                           │
│                                                                     │
│  1. Fetch user config from Management API                           │
│     GET /users/:userId/opencode/config.json                         │
│     GET /users/:userId/opencode/files                               │
│                                                                     │
│  2. Write to container filesystem                                   │
│     /app/user-config.json        ← User's opencode.json            │
│     /app/user-config-dir/        ← User's agents, commands, etc.   │
│                                                                     │
│  3. Set environment variables                                       │
│     OPENCODE_CONFIG=/app/user-config.json                          │
│     OPENCODE_CONFIG_DIR=/app/user-config-dir                       │
│                                                                     │
│  4. Git clone project repository                                    │
│     /workspace/.opencode/        ← Project config from git         │
│                                                                     │
│  5. Start OpenCode                                                  │
│     opencode serve --hostname 0.0.0.0 --port 4096                  │
│                                                                     │
└────────────────────────────────────────────────────────────────────┘
```

### Runtime: Agent Modifies Project Config

```
┌────────────────────────────────────────────────────────────────────┐
│  User: "Add a /deploy command that runs npm run deploy"            │
│                                                                     │
│  Agent:                                                             │
│  1. Writes to /workspace/.opencode/command/deploy.md               │
│  2. File is created in git working directory                       │
│                                                                     │
│  Later (manual trigger via mobile app):                             │
│  3. User triggers "Commit config changes"                           │
│  4. Management API calls git commit + push                          │
│  5. Changes are persisted in git repository                         │
│                                                                     │
│  On container restart:                                              │
│  6. Fresh git clone includes new command                            │
└────────────────────────────────────────────────────────────────────┘
```

### Runtime: User Modifies Global Config

```
┌────────────────────────────────────────────────────────────────────┐
│  User (via mobile app): Changes theme to "dracula"                  │
│                                                                     │
│  1. Mobile app calls PUT /users/:userId/opencode/config.json       │
│  2. Management API updates database                                 │
│  3. Mobile app shows: "Restart container to apply changes"         │
│                                                                     │
│  On container restart:                                              │
│  4. Entrypoint fetches updated config                               │
│  5. New theme is applied                                            │
└────────────────────────────────────────────────────────────────────┘
```

---

## Storage Schema

### Management API Database

```sql
-- User's OpenCode configuration
CREATE TABLE user_opencode_config (
  id TEXT PRIMARY KEY DEFAULT (uuid()),
  user_id TEXT NOT NULL UNIQUE,
  
  -- opencode.json content (Layer 3)
  settings JSONB NOT NULL DEFAULT '{}',
  
  -- AGENTS.md content
  agents_md TEXT,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User's config files (agents, commands, tools, plugins) (Layer 4)
CREATE TABLE user_opencode_files (
  id TEXT PRIMARY KEY DEFAULT (uuid()),
  user_id TEXT NOT NULL,
  
  type TEXT NOT NULL CHECK (type IN ('agent', 'command', 'tool', 'plugin')),
  name TEXT NOT NULL,           -- Filename without extension
  extension TEXT NOT NULL,      -- 'md', 'ts', 'js'
  content TEXT NOT NULL,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(user_id, type, name)
);

-- Indexes
CREATE INDEX idx_user_opencode_files_user ON user_opencode_files(user_id);
CREATE INDEX idx_user_opencode_files_type ON user_opencode_files(user_id, type);
```

### File Backup Storage

In addition to database, files are backed up to filesystem:

```
/data/user-configs/
└── {user_id}/
    ├── opencode.json
    ├── AGENTS.md
    ├── agent/
    │   └── *.md
    ├── command/
    │   └── *.md
    ├── tool/
    │   └── *.ts
    └── plugin/
        └── *.ts
```

---

## API Endpoints

### User OpenCode Config

```
# Get user's opencode.json settings
GET /users/:userId/opencode/config.json
Response: { settings: {...}, agents_md: "..." }

# Update user's opencode.json settings
PUT /users/:userId/opencode/config.json
Body: { settings: {...} }

# Get user's AGENTS.md
GET /users/:userId/opencode/agents-md
Response: { content: "..." }

# Update user's AGENTS.md
PUT /users/:userId/opencode/agents-md
Body: { content: "..." }
```

### User Config Files

```
# List all user's config files
GET /users/:userId/opencode/files
Response: {
  files: [
    { type: "agent", name: "reviewer", extension: "md", content: "..." },
    { type: "command", name: "deploy", extension: "md", content: "..." }
  ]
}

# Get specific file
GET /users/:userId/opencode/files/:type/:name
Response: { type: "agent", name: "reviewer", extension: "md", content: "..." }

# Create/update file
PUT /users/:userId/opencode/files/:type/:name
Body: { extension: "md", content: "..." }

# Delete file
DELETE /users/:userId/opencode/files/:type/:name
```

### Project Config (via Git)

Project config is managed through the existing Forgejo integration:

```
# List project config files
GET /projects/:projectId/files?path=.opencode

# Get specific file
GET /projects/:projectId/files?path=.opencode/agent/reviewer.md

# Update file (creates commit)
PUT /projects/:projectId/files?path=.opencode/agent/reviewer.md
Body: { content: "...", message: "Update reviewer agent" }

# Commit pending changes (for agent modifications)
POST /projects/:projectId/git/commit
Body: { message: "Update OpenCode configuration" }
```

---

## Container Environment Variables

| Variable | Source | Purpose |
|----------|--------|---------|
| `OPENCODE_CONFIG` | Set by entrypoint | Path to user's opencode.json |
| `OPENCODE_CONFIG_DIR` | Set by entrypoint | Path to user's config directory |
| `MANAGEMENT_API_URL` | Coolify env var | Management API base URL |
| `USER_ID` | Coolify env var | Current user's ID |
| `PROJECT_ID` | Coolify env var | Current project's ID |
| `AUTH_TOKEN` | Coolify env var | JWT for authenticating to Management API |
| `ANTHROPIC_API_KEY` | Coolify env var | LLM provider credentials |
| `OPENAI_API_KEY` | Coolify env var | LLM provider credentials |

---

## Entrypoint Script

```bash
#!/bin/bash
set -e

CONFIG_DIR="/app/user-config-dir"
CONFIG_FILE="/app/user-config.json"

# Create directory structure
mkdir -p "$CONFIG_DIR"/{agent,command,tool,plugin}

# Fetch user config from Management API (with retry)
fetch_config() {
  local max_retries=5
  local retry_delay=2
  
  for i in $(seq 1 $max_retries); do
    if curl -sf "$MANAGEMENT_API_URL/users/$USER_ID/opencode/config.json" \
        -H "Authorization: Bearer $AUTH_TOKEN" \
        -o "$CONFIG_FILE.tmp"; then
      
      # Extract settings to config file
      jq -r '.settings // {}' "$CONFIG_FILE.tmp" > "$CONFIG_FILE"
      
      # Write AGENTS.md if present
      AGENTS_MD=$(jq -r '.agents_md // empty' "$CONFIG_FILE.tmp")
      if [ -n "$AGENTS_MD" ]; then
        echo "$AGENTS_MD" > "$CONFIG_DIR/AGENTS.md"
      fi
      
      rm "$CONFIG_FILE.tmp"
      return 0
    fi
    
    echo "Retry $i/$max_retries: Failed to fetch config, waiting ${retry_delay}s..."
    sleep $retry_delay
    retry_delay=$((retry_delay * 2))
  done
  
  echo "Failed to fetch user config, using defaults"
  echo '{}' > "$CONFIG_FILE"
  return 1
}

# Fetch user config files
fetch_files() {
  curl -sf "$MANAGEMENT_API_URL/users/$USER_ID/opencode/files" \
    -H "Authorization: Bearer $AUTH_TOKEN" | \
    jq -r '.files[]? | "\(.type)/\(.name).\(.extension)\t\(.content)"' | \
    while IFS=$'\t' read -r path content; do
      echo "$content" > "$CONFIG_DIR/$path"
    done
}

# Main
if [ -n "$MANAGEMENT_API_URL" ] && [ -n "$USER_ID" ]; then
  echo "Fetching OpenCode configuration..."
  fetch_config
  fetch_files || true
  echo "Configuration loaded."
else
  echo "No Management API configured, using platform defaults."
  echo '{}' > "$CONFIG_FILE"
fi

export OPENCODE_CONFIG="$CONFIG_FILE"
export OPENCODE_CONFIG_DIR="$CONFIG_DIR"

# Start OpenCode
cd /workspace
exec opencode serve --hostname 0.0.0.0 --port 4096
```

---

## Configuration Examples

### Default Platform Config

```json
{
  "$schema": "https://opencode.ai/config.json",
  "autoupdate": false,
  "share": "disabled",
  "permission": {
    "bash": "ask",
    "write": "ask",
    "edit": "allow",
    "webfetch": "ask",
    "mcp": "ask",
    "doom_loop": "ask",
    "external_directory": "ask"
  }
}
```

### Example User Global Config

```json
{
  "$schema": "https://opencode.ai/config.json",
  "theme": "dracula",
  "model": "anthropic/claude-sonnet-4-5",
  "small_model": "anthropic/claude-haiku-4-5",
  "keybinds": {
    "submit": "ctrl+enter",
    "cancel": "escape"
  },
  "permission": {
    "bash": {
      "git status": "allow",
      "git diff": "allow",
      "git log*": "allow",
      "npm test": "allow",
      "npm run build": "allow"
    }
  },
  "mcp": {
    "context7": {
      "type": "remote",
      "url": "https://mcp.context7.com/mcp"
    }
  }
}
```

### Example User Global Agent

```markdown
---
description: My personal code reviewer
mode: subagent
model: anthropic/claude-sonnet-4-5
temperature: 0.1
tools:
  write: false
  edit: false
permission:
  bash: ask
---

You are my personal code reviewer. Focus on:

- Code quality and best practices
- Security vulnerabilities
- Performance implications
- Maintainability

Provide constructive feedback without making changes.
```

### Example Project Config

```json
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "bash": {
      "npm run deploy": "ask",
      "docker *": "deny"
    }
  },
  "instructions": ["CONTRIBUTING.md", "docs/coding-standards.md"]
}
```

---

## Implementation Checklist

### Phase 1: Platform Defaults
- [ ] Update Docker image with default `~/.config/opencode/opencode.json`
- [ ] Test container starts with secure defaults

### Phase 2: User Config Storage
- [ ] Add database tables for user config
- [ ] Implement file backup storage
- [ ] Add API endpoints for user config CRUD

### Phase 3: Container Integration
- [ ] Update entrypoint script to fetch user config
- [ ] Add retry with backoff for API failures
- [ ] Set OPENCODE_CONFIG and OPENCODE_CONFIG_DIR

### Phase 4: Project Config via Git
- [ ] Verify agent can write to `.opencode/` in workspace
- [ ] Add API endpoint to trigger git commit
- [ ] Test end-to-end flow

### Phase 5: Mobile App Integration
- [ ] Add user settings UI for global config
- [ ] Add file browser for global agents/commands
- [ ] Add "Commit config changes" action for projects

---

## Security Considerations

1. **Platform defaults are immutable** - Cannot be modified by agent or user
2. **User config requires authentication** - JWT with user claims
3. **Project config via git** - Follows git permissions
4. **Sensitive data in env vars** - API keys never in config files
5. **Permission defaults are secure** - Dangerous operations require approval

---

## Future Enhancements

1. **Onboarding Agent** - AI agent that gathers requirements and sets up initial config
2. **Config Templates** - Pre-built configurations for common project types
3. **Config Sharing** - Share agents/commands between users
4. **Config Versioning** - Track changes to user global config
5. **Hot Reload** - Apply config changes without container restart (if OpenCode supports)
