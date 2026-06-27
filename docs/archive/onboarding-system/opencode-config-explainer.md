# OpenCode Configuration Explained in Plain English

This guide explains all OpenCode configuration options in simple, non-technical terms. For the complete technical reference, see [architecture.md](./architecture.md).

---

## Table of Contents

1. [The Main Config File](#the-main-config-file-opencodejson)
2. [Model Settings](#1-model-settings)
3. [Agents](#2-agents)
4. [Commands](#3-commands-slash-commands)
5. [Tools](#4-tools)
6. [Custom Tools](#5-custom-tools)
7. [Plugins](#6-plugins)
8. [MCP Servers](#7-mcp-servers)
9. [Permissions](#8-permissions)
10. [Formatters](#9-formatters)
11. [Instructions](#10-instructions-rules)
12. [Variable Substitution](#11-variable-substitution)
13. [UI Settings](#12-share-autoupdate-theme-tui-keybinds)
14. [Quick Reference](#quick-reference-where-things-live)

---

## The Main Config File: `opencode.json`

Think of `opencode.json` as the **settings file** for your AI coding assistant. It's like the preferences panel on your phone - it controls how everything works.

---

## 1. Model Settings

### `model`
**What it is:** The main AI brain you're using.

**Analogy:** Like choosing which chef cooks your food - Claude Sonnet is a skilled all-rounder, GPT-4 is another option, etc.

```json
"model": "anthropic/claude-sonnet-4-20250514"
```

### `small_model`
**What it is:** A faster, cheaper AI for simple tasks like generating titles.

**Analogy:** Like having a junior assistant handle quick errands while the senior person focuses on important work.

---

## 2. Agents

**What they are:** Specialized AI personalities you can create for specific jobs.

**Analogy:** Imagine having different employees:
- A **code reviewer** who only looks at code quality
- An **architect** who plans big-picture designs
- A **tester** who focuses on finding bugs

### Agent Options Explained:

| Option | Plain English |
|--------|---------------|
| `description` | The job title shown in menus |
| `mode` | "primary" = main assistant, "subagent" = helper that works in the background |
| `model` | Which AI brain this agent uses |
| `temperature` | How creative vs predictable (0 = robotic/consistent, 1 = creative/varied) |
| `maxSteps` | How many actions before it stops and gives an answer |
| `tools` | What abilities it has (can it read files? edit them? run commands?) |
| `permission` | What's blocked or allowed for this agent |

**Example in plain English:**
```
"reviewer" agent:
- Description: "Reviews code for quality"
- Mode: Helper (runs separately)
- Temperature: 0.1 (very consistent, not creative)
- Can: read files, search code
- Cannot: edit files, run commands
```

### Defining Agents

You can define agents in two places:

**1. In `opencode.json`** (good for simple agents):
```json
{
  "agent": {
    "reviewer": {
      "description": "Reviews code for quality",
      "mode": "subagent",
      "temperature": 0.1
    }
  }
}
```

**2. In `.opencode/agent/*.md` files** (better for complex agents with detailed instructions):
```markdown
---
description: Reviews code for quality
mode: subagent
temperature: 0.1
---

You are a code reviewer. Check for:
1. Code quality
2. Security issues
3. Performance problems
```

---

## 3. Commands (Slash Commands)

**What they are:** Shortcuts you type like `/test` or `/review` to trigger pre-written instructions.

**Analogy:** Like speed dial on a phone - instead of typing "run all tests and analyze failures", you just type `/test`.

### Command Options Explained:

| Option | Plain English |
|--------|---------------|
| `description` | What shows up when you start typing the command |
| `template` | The actual instructions sent to the AI |
| `agent` | Which agent runs this command |
| `subtask` | If true, runs in the background without cluttering your main chat |
| `model` | Override the default AI model for this command |

### Special Variables in Commands:

| Variable | What it does | Example |
|----------|--------------|---------|
| `$ARGUMENTS` | Everything typed after the command | `/test login page` → "login page" |
| `$1`, `$2`, `$3` | Individual arguments | `/create Button src` → $1="Button", $2="src" |
| `` !`command` `` | Run a shell command and include output | `` !`npm test` `` |
| `@filename` | Include contents of a file | `@src/Button.tsx` |

### Defining Commands

**In `opencode.json`:**
```json
{
  "command": {
    "test": {
      "description": "Run tests",
      "template": "Run the test suite: $ARGUMENTS"
    }
  }
}
```

**In `.opencode/command/*.md` files:**
```markdown
---
description: Run tests and analyze failures
agent: build
---

Run the test suite for this project.
$ARGUMENTS

Analyze any failures and suggest fixes.
```

---

## 4. Tools

**What they are:** The actual abilities the AI has to interact with your computer.

**Analogy:** Like apps on your phone - each tool does one specific thing.

### Built-in Tools:

| Tool | What it does | Default |
|------|--------------|---------|
| `bash` | Run terminal commands (like `npm install`) | Enabled |
| `edit` | Change parts of existing files | Enabled |
| `write` | Create new files or replace entire files | Enabled |
| `read` | Look at file contents | Enabled |
| `grep` | Search inside files using patterns | Enabled |
| `glob` | Find files by name patterns (like `*.js`) | Enabled |
| `list` | Show what's in a folder | Enabled |
| `patch` | Apply code changes/diffs | Enabled |
| `todowrite` | Track tasks during a session | Enabled |
| `todoread` | Check current task list | Enabled |
| `webfetch` | Download and read web pages | Enabled |

### Enabling/Disabling Tools:

```json
{
  "tools": {
    "bash": true,      // Can run commands
    "webfetch": false, // Cannot fetch websites
    "mymcp_*": false   // Disable all tools from "mymcp" server
  }
}
```

The `*` wildcard lets you control groups of tools at once.

---

## 5. Custom Tools

**What they are:** Your own tools that you write in TypeScript.

**Analogy:** Building your own phone app that does exactly what you need.

**Location:** `.opencode/tool/*.ts`

**Key rule:** The filename becomes the tool name (`database.ts` → tool named `database`)

**Example - A database query tool:**
```typescript
import { tool } from "@opencode-ai/plugin";

export default tool({
  description: "Execute a read-only SQL query",
  args: {
    query: tool.schema.string().describe("The SQL query")
  },
  async execute(args) {
    // Only allow SELECT statements for safety
    if (!/^\s*SELECT/i.test(args.query)) {
      throw new Error("Only SELECT queries allowed");
    }
    const results = await db.query(args.query);
    return JSON.stringify(results);
  }
});
```

### Multiple Tools in One File

Export multiple tools, and they become `filename_exportname`:

```typescript
// math.ts
export const add = tool({ ... });      // → math_add
export const multiply = tool({ ... }); // → math_multiply
```

---

## 6. Plugins

**What they are:** Code that reacts to events in OpenCode.

**Analogy:** Like automation rules - "When X happens, do Y":
- When a session ends → Send a notification
- Before reading any file → Check if it's a secret file and block it
- After any edit → Auto-format the code

**Location:** `.opencode/plugin/*.ts`

### Common Plugin Uses:

| Use Case | What it does |
|----------|--------------|
| **Logging** | Track everything the AI does |
| **Protection** | Prevent reading `.env` files with secrets |
| **Notifications** | Alert you when tasks finish |
| **Auto-actions** | Auto-commit changes, track costs |

### Plugin Events You Can React To:

| Event Category | Events |
|----------------|--------|
| **Session** | created, idle, error, completed, deleted |
| **Tool** | before execution, after execution |
| **File** | edited, watched file changed |
| **Message** | updated, removed |
| **Permission** | user replied, setting changed |

### Example - Block reading secret files:
```typescript
export const EnvProtection: Plugin = async () => {
  return {
    "tool.execute.before": async (input, output) => {
      if (input.tool === "read" && output.args.filePath?.includes(".env")) {
        throw new Error("Cannot read .env files!");
      }
    }
  };
};
```

---

## 7. MCP Servers

**What they are:** External services that give the AI more abilities.

**Analogy:** Like plugins for your browser - they add new features by connecting to outside services.

### Two Types:

#### Local MCP (runs on your computer):
```json
{
  "mcp": {
    "filesystem": {
      "type": "local",
      "command": ["npx", "server-filesystem", "/path"],
      "timeout": 5000
    }
  }
}
```
*Like installing a program that runs locally*

#### Remote MCP (connects to an internet service):
```json
{
  "mcp": {
    "context7": {
      "type": "remote", 
      "url": "https://mcp.context7.com/mcp"
    }
  }
}
```
*Like using a web API*

### MCP Options:

| Option | What it does |
|--------|--------------|
| `type` | "local" or "remote" |
| `command` | (local only) How to start the server |
| `url` | (remote only) Server address |
| `enabled` | Turn on/off |
| `headers` | Authentication tokens |
| `timeout` | How long to wait before giving up (ms) |
| `environment` | Environment variables to set |
| `oauth` | Login credentials for protected servers |

---

## 8. Permissions

**What they are:** Rules about what the AI can do without asking you first.

**Analogy:** Like parental controls - some things are always allowed, some always blocked, some require asking.

### Permission Values:

| Value | What it means |
|-------|---------------|
| `"allow"` | Do it without asking |
| `"deny"` | Never do it, ever |
| `"ask"` | Ask me every time |

### Permission Types:

| Permission | What it controls | Default |
|------------|------------------|---------|
| `edit` | Editing files | allow |
| `bash` | Running terminal commands | allow |
| `webfetch` | Fetching web pages | allow |
| `doom_loop` | Repeating same action 3+ times | ask |
| `external_directory` | Touching files outside project | ask |

### Fine-Grained Bash Permissions:

You can be specific about which commands are allowed:

```json
{
  "permission": {
    "bash": {
      "npm *": "allow",       // npm commands are fine
      "git *": "allow",       // git commands are fine  
      "rm -rf *": "deny",     // NEVER delete recursively
      "sudo *": "deny",       // No admin commands
      "*": "ask"              // Anything else, ask first
    }
  }
}
```

**Pattern matching:**
- `*` matches anything
- `?` matches one character
- `npm test` matches exactly "npm test"
- `npm *` matches "npm install", "npm run build", etc.

---

## 9. Formatters

**What they are:** Auto-prettifiers for your code.

**Analogy:** Like auto-correct and grammar check, but for code - fixes spacing, indentation, etc.

### Built-in Formatters:
OpenCode automatically detects and uses: Prettier, Black, gofmt, rustfmt, ruff, etc.

### Custom Formatter:
```json
{
  "formatter": {
    "prettier": {
      "command": ["npx", "prettier", "--write", "$FILE"],
      "extensions": [".ts", ".js", ".json"],
      "environment": { "NODE_ENV": "development" }
    }
  }
}
```

**`$FILE`** gets replaced with the actual file path.

### Disable Formatters:
```json
// Disable all formatters
{ "formatter": false }

// Disable just one
{ "formatter": { "prettier": { "disabled": true } } }
```

---

## 10. Instructions (Rules)

**What they are:** Files that tell the AI how to behave in your project.

**Analogy:** Like an employee handbook - "Here's how we do things around here."

```json
{
  "instructions": [
    "AGENTS.md",
    ".opencode/rules/*.md",
    ".cursor/rules/*.md"
  ]
}
```

The `*` wildcard lets you include multiple files.

### What to put in instructions:
- Coding style preferences
- Project conventions
- Things to avoid
- Architecture decisions
- Common patterns to use

---

## 11. Variable Substitution

**What it is:** Placeholders that get replaced with actual values.

### Environment Variables:
```json
{
  "headers": {
    "Authorization": "Bearer {env:MY_API_KEY}"
  }
}
```
**Means:** Replace `{env:MY_API_KEY}` with the value of the `MY_API_KEY` environment variable.

If the variable doesn't exist, it becomes an empty string.

### File Contents:
```json
{
  "agent": {
    "reviewer": {
      "prompt": "{file:./prompts/reviewer.txt}"
    }
  }
}
```
**Means:** Replace with the contents of that file.

**Paths can be:**
- Relative: `./prompts/file.txt`
- Absolute: `/home/user/file.txt`
- Home directory: `~/.secrets/key`

**Why useful:**
- Keep secrets out of config files (store in separate files)
- Reuse content across multiple configs
- Keep config files clean by moving long prompts elsewhere

---

## 12. Share, Autoupdate, Theme, TUI, Keybinds

These control the user interface and experience:

| Setting | What it does | Options |
|---------|--------------|---------|
| `share` | Session sharing behavior | "manual", "auto", "disabled" |
| `autoupdate` | Auto-update OpenCode | true, false, "notify" |
| `theme` | Color scheme | Theme name |
| `tui` | Terminal UI settings | scroll_speed, scroll_acceleration |
| `keybinds` | Custom keyboard shortcuts | Key-action mappings |
| `disabled_providers` | AI providers to skip | Array of provider IDs |

---

## Quick Reference: Where Things Live

| What | Config Location | File Location |
|------|-----------------|---------------|
| Main settings | `opencode.json` | - |
| Custom agents | `opencode.json` → `agent` | `.opencode/agent/*.md` |
| Custom commands | `opencode.json` → `command` | `.opencode/command/*.md` |
| Custom tools | - | `.opencode/tool/*.ts` |
| Plugins | - | `.opencode/plugin/*.ts` |
| Project rules | `opencode.json` → `instructions` | `AGENTS.md` or custom files |
| MCP servers | `opencode.json` → `mcp` | - |
| Permissions | `opencode.json` → `permission` | - |
| Formatters | `opencode.json` → `formatter` | - |

---

## Summary

Think of OpenCode configuration as setting up a highly customizable AI assistant:

1. **Choose its brain** (`model`) - Which AI powers your assistant
2. **Create specialized helpers** (`agent`) - Experts for specific tasks
3. **Set up shortcuts** (`command`) - Quick triggers for common tasks
4. **Give it abilities** (`tools` + `mcp`) - What it can do
5. **Set boundaries** (`permission`) - What requires approval
6. **Add automation** (`plugins`) - React to events automatically
7. **Define house rules** (`instructions`) - Project-specific guidance
8. **Keep secrets safe** (`{env:}`, `{file:}`) - Variable substitution

---

## Related Documentation

- [Architecture Reference](./architecture.md) - Complete technical specification
- [Automation Strategy](./automation-strategy.md) - Doc sync and template generation
- [Implementation Phases](./implementation-phases.md) - How to build the onboarding system
