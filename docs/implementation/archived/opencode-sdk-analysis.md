# OpenCode SDK Analysis

This document analyzes the `@opencode-ai/sdk` (v1.0.144) coverage in Agentpod and identifies opportunities for enhanced functionality.

> **Last Updated:** December 2024
> **SDK Version:** 1.0.144 (upgraded from 1.0.134)

## Overview

The OpenCode SDK provides a comprehensive API for interacting with OpenCode containers. Our Management API (`apps/api/src/services/opencode.ts`) acts as a proxy layer between the mobile app and OpenCode containers, using the SDK for communication.

**Current Status:** We've implemented ~30% of the SDK's available functionality, focusing on core session and file operations.

---

## Implementation Status

### Legend
- ✅ Implemented
- ❌ Not implemented
- ⚠️ Partially implemented

---

### Session Management

The core of AI interaction - managing chat sessions and messages.

| SDK Method | Our Method | Status | Description |
|------------|------------|--------|-------------|
| `session.list()` | `listSessions()` | ✅ | List all sessions |
| `session.create()` | `createSession()` | ✅ | Create new session |
| `session.get()` | `getSession()` | ✅ | Get session details |
| `session.delete()` | `deleteSession()` | ✅ | Delete a session |
| `session.abort()` | `abortSession()` | ✅ | Abort running session |
| `session.messages()` | `listMessages()` | ✅ | List session messages |
| `session.prompt()` | `sendMessage()` | ✅ | Send message to session |
| `session.message()` | `getMessage()` | ✅ | Get specific message |
| `session.status()` | - | ❌ | Get session status (running/idle/etc.) |
| `session.update()` | - | ❌ | Update session properties (title, etc.) |
| `session.children()` | - | ❌ | Get session's child sessions |
| `session.todo()` | - | ❌ | Get AI-generated todo list |
| `session.init()` | - | ❌ | Analyze app and create AGENTS.md |
| `session.fork()` | - | ❌ | Fork session at specific message |
| `session.share()` | - | ❌ | Share session publicly |
| `session.unshare()` | - | ❌ | Remove public sharing |
| `session.diff()` | - | ❌ | Get code changes/diff for session |
| `session.summarize()` | - | ❌ | Generate session summary |
| `session.promptAsync()` | - | ❌ | Send message and return immediately |
| `session.command()` | - | ❌ | Execute slash command |
| `session.shell()` | - | ❌ | Run shell command |
| `session.revert()` | - | ❌ | Revert a message |
| `session.unrevert()` | - | ❌ | Restore reverted messages |

**Coverage: 8/22 (36%)**

---

### File Operations

File system access within the project.

| SDK Method | Our Method | Status | Description |
|------------|------------|--------|-------------|
| `file.list()` | `listFiles()` | ✅ | List files in directory |
| `file.read()` | `getFileContent()` | ✅ | Read file content |
| `file.status()` | - | ❌ | Get file modification status |

**Coverage: 2/3 (67%)**

---

### Search/Find Operations

Code search and navigation.

| SDK Method | Our Method | Status | Description |
|------------|------------|--------|-------------|
| `find.files()` | `findFiles()` | ✅ | Find files by pattern |
| `find.text()` | - | ❌ | Search text in files (grep) |
| `find.symbols()` | - | ❌ | Find code symbols (functions, classes) |

**Coverage: 1/3 (33%)**

---

### Configuration

Application and provider configuration.

| SDK Method | Our Method | Status | Description |
|------------|------------|--------|-------------|
| `config.get()` | `getAppInfo()` | ⚠️ | Get app config (partial) |
| `config.providers()` | `getProviders()` | ✅ | List configured providers |
| `config.update()` | - | ❌ | Update configuration |

**Coverage: 1.5/3 (50%)**

---

### Project Information

OpenCode project/workspace details.

| SDK Method | Our Method | Status | Description |
|------------|------------|--------|-------------|
| `project.list()` | - | ❌ | List all projects |
| `project.current()` | `getAppInfo()` | ⚠️ | Get current project (partial) |

**Coverage: 0.5/2 (25%)**

---

### Events (SSE)

Real-time event streaming.

| SDK Method | Our Method | Status | Description |
|------------|------------|--------|-------------|
| `event.subscribe()` | `subscribeToEvents()` | ✅ | Subscribe to SSE events |

**Coverage: 1/1 (100%)**

---

### Permissions

Permission request handling.

| SDK Method | Our Method | Status | Description |
|------------|------------|--------|-------------|
| `postSessionIdPermissionsPermissionId()` | `respondToPermission()` | ✅ | Respond to permission request |

**Coverage: 1/1 (100%)**

---

### PTY (Terminal)

Pseudo-terminal for remote shell access.

| SDK Method | Our Method | Status | Description |
|------------|------------|--------|-------------|
| `pty.list()` | - | ❌ | List PTY sessions |
| `pty.create()` | - | ❌ | Create new PTY session |
| `pty.remove()` | - | ❌ | Remove PTY session |
| `pty.get()` | - | ❌ | Get PTY session info |
| `pty.update()` | - | ❌ | Update PTY session |
| `pty.connect()` | - | ❌ | Connect to PTY (WebSocket) |

**Coverage: 0/6 (0%)**

---

### Tool Management

AI tool/function management.

| SDK Method | Our Method | Status | Description |
|------------|------------|--------|-------------|
| `tool.ids()` | - | ❌ | List all tool IDs |
| `tool.list()` | - | ❌ | List tools with JSON schema |

**Coverage: 0/2 (0%)**

---

### Command Management

Slash command management.

| SDK Method | Our Method | Status | Description |
|------------|------------|--------|-------------|
| `command.list()` | - | ❌ | List available commands |

**Coverage: 0/1 (0%)**

---

### Provider Management

LLM provider configuration within OpenCode.

| SDK Method | Our Method | Status | Description |
|------------|------------|--------|-------------|
| `provider.list()` | - | ❌ | List all providers |
| `provider.auth()` | - | ❌ | Get provider auth methods |
| `provider.oauth.authorize()` | - | ❌ | Start OAuth flow |
| `provider.oauth.callback()` | - | ❌ | Handle OAuth callback |

**Coverage: 0/4 (0%)**

---

### App Utilities

Application-level utilities.

| SDK Method | Our Method | Status | Description |
|------------|------------|--------|-------------|
| `app.log()` | - | ❌ | Write to server logs |
| `app.agents()` | - | ❌ | List available agents |

**Coverage: 0/2 (0%)**

---

### MCP (Model Context Protocol)

MCP server management. **Enhanced in v1.0.144** with OAuth support.

| SDK Method | Our Method | Status | Description |
|------------|------------|--------|-------------|
| `mcp.status()` | - | ❌ | Get MCP server status |
| `mcp.add()` | - | ❌ | Add MCP server dynamically |
| `mcp.connect()` | - | ❌ | Connect an MCP server (new in v1.0.144) |
| `mcp.disconnect()` | - | ❌ | Disconnect an MCP server (new in v1.0.144) |
| `mcp.auth.remove()` | - | ❌ | Remove OAuth credentials (new in v1.0.144) |
| `mcp.auth.start()` | - | ❌ | Start OAuth flow (new in v1.0.144) |
| `mcp.auth.callback()` | - | ❌ | Complete OAuth callback (new in v1.0.144) |
| `mcp.auth.authenticate()` | - | ❌ | Full OAuth flow with browser (new in v1.0.144) |

**Coverage: 0/8 (0%)**

---

### Development Tools Status

IDE-like tooling status.

| SDK Method | Our Method | Status | Description |
|------------|------------|--------|-------------|
| `lsp.status()` | - | ❌ | Get LSP server status |
| `formatter.status()` | - | ❌ | Get formatter status |

**Coverage: 0/2 (0%)**

---

### Version Control

Git/VCS integration.

| SDK Method | Our Method | Status | Description |
|------------|------------|--------|-------------|
| `vcs.get()` | - | ❌ | Get VCS info (git status, branch, etc.) |

**Coverage: 0/1 (0%)**

---

### Path Information

Working directory information.

| SDK Method | Our Method | Status | Description |
|------------|------------|--------|-------------|
| `path.get()` | - | ❌ | Get current working path |

**Coverage: 0/1 (0%)**

---

### Instance Management

OpenCode instance lifecycle.

| SDK Method | Our Method | Status | Description |
|------------|------------|--------|-------------|
| `instance.dispose()` | - | ❌ | Dispose/shutdown instance |

**Coverage: 0/1 (0%)**

---

### Authentication

Credential management within OpenCode.

| SDK Method | Our Method | Status | Description |
|------------|------------|--------|-------------|
| `auth.set()` | - | ❌ | Set authentication credentials |

**Coverage: 0/1 (0%)**

> **Note:** MCP-specific auth methods (`mcp.auth.*`) are listed under the MCP section above.

---

### TUI (Terminal UI)

Methods for controlling OpenCode's terminal UI. **Not applicable** for mobile app - these are for terminal-based interfaces.

| SDK Method | Status | Description |
|------------|--------|-------------|
| `tui.appendPrompt()` | N/A | Append to TUI prompt |
| `tui.openHelp()` | N/A | Open help dialog |
| `tui.openSessions()` | N/A | Open sessions dialog |
| `tui.openThemes()` | N/A | Open themes dialog |
| `tui.openModels()` | N/A | Open models dialog |
| `tui.submitPrompt()` | N/A | Submit the prompt |
| `tui.clearPrompt()` | N/A | Clear the prompt |
| `tui.executeCommand()` | N/A | Execute TUI command |
| `tui.showToast()` | N/A | Show toast notification |
| `tui.publish()` | N/A | Publish TUI event |
| `tui.control.next()` | N/A | Get next TUI request |
| `tui.control.response()` | N/A | Submit TUI response |

**Note:** TUI methods are excluded from coverage calculations as they're terminal-specific.

---

## Overall Coverage Summary

| Category | Implemented | Total | Coverage |
|----------|-------------|-------|----------|
| Session | 8 | 22 | 36% |
| File | 2 | 3 | 67% |
| Find | 1 | 3 | 33% |
| Config | 1.5 | 3 | 50% |
| Project | 0.5 | 2 | 25% |
| Event | 1 | 1 | 100% |
| Permissions | 1 | 1 | 100% |
| PTY | 0 | 6 | 0% |
| Tool | 0 | 2 | 0% |
| Command | 0 | 1 | 0% |
| Provider | 0 | 4 | 0% |
| App | 0 | 2 | 0% |
| MCP | 0 | 8 | 0% |
| LSP/Formatter | 0 | 2 | 0% |
| VCS | 0 | 1 | 0% |
| Path | 0 | 1 | 0% |
| Instance | 0 | 1 | 0% |
| Auth | 0 | 1 | 0% |
| **Total** | **15** | **64** | **23%** |

*Excluding TUI methods (12) which are not applicable*

### SDK v1.0.144 Changes (from v1.0.134)

New methods added:
- `mcp.connect()` - Connect an MCP server
- `mcp.disconnect()` - Disconnect an MCP server
- `mcp.auth.remove()` - Remove OAuth credentials for MCP
- `mcp.auth.start()` - Start OAuth flow for MCP
- `mcp.auth.callback()` - Handle OAuth callback for MCP
- `mcp.auth.authenticate()` - Full OAuth flow with browser

---

## Priority Implementation Recommendations

### High Priority (Core Mobile Features)

These features would significantly enhance the mobile command center experience:

#### 1. PTY (Terminal Access)
**Value:** Very High | **Effort:** High

Remote terminal access is a killer feature for a mobile command center. Users could run commands, view logs, and debug directly from their phone.

```typescript
// Example usage
await opencode.createPty(projectId);
await opencode.connectPty(projectId, ptyId); // WebSocket connection
```

**Required methods:**
- `pty.list()` - Show active terminals
- `pty.create()` - Create new terminal
- `pty.connect()` - Connect via WebSocket
- `pty.remove()` - Close terminal

#### 2. Session Status & Insights
**Value:** High | **Effort:** Low

Better visibility into what the AI is doing.

```typescript
// Get real-time session status
const status = await opencode.getSessionStatus(projectId, sessionId);
// { status: 'running', tool: 'bash', progress: 45 }

// Get session diff (what changed)
const diff = await opencode.getSessionDiff(projectId, sessionId);

// Get session summary
const summary = await opencode.summarizeSession(projectId, sessionId);
```

**Required methods:**
- `session.status()` - Is AI running? What tool?
- `session.diff()` - What files changed?
- `session.summarize()` - TL;DR of session

#### 3. Todo List
**Value:** High | **Effort:** Low

Track AI-generated tasks from the mobile app.

```typescript
const todos = await opencode.getSessionTodos(projectId, sessionId);
// [{ id: '1', content: 'Fix login bug', status: 'completed' }, ...]
```

**Required methods:**
- `session.todo()` - Get todo list

#### 4. VCS Integration
**Value:** High | **Effort:** Medium

Git status and operations from mobile.

```typescript
const vcs = await opencode.getVcsInfo(projectId);
// { branch: 'main', ahead: 2, behind: 0, modified: ['src/app.ts'], staged: [] }
```

**Required methods:**
- `vcs.get()` - Git status

### Medium Priority (Enhanced Features)

#### 5. Code Search
**Value:** Medium | **Effort:** Low

Search code from mobile.

```typescript
// Search for text in files
const results = await opencode.findText(projectId, 'TODO');

// Find symbols (functions, classes)
const symbols = await opencode.findSymbols(projectId, 'handleSubmit');
```

**Required methods:**
- `find.text()` - Grep-like search
- `find.symbols()` - Symbol search

#### 6. Session Fork/Revert
**Value:** Medium | **Effort:** Low

Undo/redo and branching conversations.

```typescript
// Fork session at a specific message
const newSession = await opencode.forkSession(projectId, sessionId, messageId);

// Revert a message
await opencode.revertMessage(projectId, sessionId, messageId);
```

**Required methods:**
- `session.fork()` - Branch conversation
- `session.revert()` - Undo message
- `session.unrevert()` - Redo message

#### 7. Command/Tool Discovery
**Value:** Medium | **Effort:** Low

Show available commands and tools.

```typescript
// List available slash commands
const commands = await opencode.listCommands(projectId);
// [{ name: '/compact', description: 'Summarize conversation' }, ...]

// List available tools
const tools = await opencode.listTools(projectId);
```

**Required methods:**
- `command.list()` - List slash commands
- `tool.ids()` - List tool IDs
- `tool.list()` - List tools with schema

#### 8. MCP Server Management
**Value:** Medium | **Effort:** Medium

Manage MCP servers from mobile.

```typescript
// Check MCP status
const status = await opencode.getMcpStatus(projectId);

// Add new MCP server
await opencode.addMcpServer(projectId, { name: 'github', config: {...} });
```

**Required methods:**
- `mcp.status()` - MCP status
- `mcp.add()` - Add MCP server

### Lower Priority (Nice to Have)

#### 9. Session Sharing
**Value:** Low | **Effort:** Low

Share sessions publicly.

**Required methods:**
- `session.share()` - Create share link
- `session.unshare()` - Remove sharing

#### 10. Config Updates
**Value:** Low | **Effort:** Low

Update OpenCode config from mobile.

**Required methods:**
- `config.update()` - Update configuration

#### 11. Development Tool Status
**Value:** Low | **Effort:** Low

Show LSP/formatter status.

**Required methods:**
- `lsp.status()` - LSP status
- `formatter.status()` - Formatter status

#### 12. Agent Discovery
**Value:** Low | **Effort:** Low

List available AI agents.

**Required methods:**
- `app.agents()` - List agents

---

## Implementation Roadmap

### Phase 1: Quick Wins (Low Effort, High Value)
1. `session.status()` - Real-time status
2. `session.todo()` - Todo tracking
3. `session.diff()` - Change tracking
4. `session.summarize()` - Session summaries
5. `vcs.get()` - Git status

### Phase 2: Enhanced Search & Navigation
1. `find.text()` - Text search
2. `find.symbols()` - Symbol search
3. `file.status()` - File status
4. `command.list()` - Command discovery
5. `tool.list()` - Tool discovery

### Phase 3: Advanced Session Management
1. `session.fork()` - Fork sessions
2. `session.revert()` - Revert messages
3. `session.unrevert()` - Restore messages
4. `session.update()` - Update properties
5. `session.share()` / `session.unshare()` - Sharing

### Phase 4: Terminal Access (Major Feature)
1. `pty.list()` - List terminals
2. `pty.create()` - Create terminal
3. `pty.connect()` - WebSocket connection
4. `pty.remove()` - Close terminal
5. `pty.update()` - Resize, etc.

### Phase 5: Configuration & Tools
1. `mcp.status()` / `mcp.add()` - MCP management
2. `config.update()` - Config updates
3. `app.agents()` - Agent listing
4. `lsp.status()` / `formatter.status()` - Dev tools

---

## Notes

### Not Implementing
- **TUI methods** - Terminal UI specific, not applicable for mobile
- **`instance.dispose()`** - Container lifecycle managed by Coolify
- **`auth.set()`** - Credentials managed by Management API

### Architecture Consideration
Our Management API acts as a proxy, so some SDK features may need adaptation:
- PTY WebSocket connections need proxying
- SSE events already have a proxy endpoint
- Some features may need UI support in the mobile app first

---

## References

- SDK Package: `@opencode-ai/sdk@1.0.144`
- SDK Source: `/node_modules/.pnpm/@opencode-ai+sdk@1.0.144/`
- Our Implementation: `/apps/api/src/services/opencode.ts`
- OpenCode Docs: https://opencode.ai/docs

## Changelog

### 2024-12-11
- Updated SDK from v1.0.134 to v1.0.144
- Added documentation for new MCP OAuth methods
- Replaced 3 manual `fetch()` calls with SDK methods:
  - `listFiles()` now uses `client.file.list()`
  - `getProviders()` now uses `client.config.providers()`
  - `respondToPermission()` now uses `client.postSessionIdPermissionsPermissionId()`
