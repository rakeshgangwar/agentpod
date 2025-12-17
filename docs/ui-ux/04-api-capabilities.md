# API Capabilities Matrix

**Application:** AgentPod  
**Date:** December 2024

Comprehensive documentation of all API capabilities available in the system.

---

## Architecture Overview

AgentPod has a **3-layer API architecture**:

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (Svelte)                         │
│  - Uses typed wrappers from src/lib/api/tauri.ts                │
│  - Calls invoke() for Tauri commands                            │
│  - Listens to events via listen() for SSE                       │
└───────────────────────────┬─────────────────────────────────────┘
                            │ invoke()
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Tauri Backend (Rust)                         │
│  - Commands in src-tauri/src/commands/                          │
│  - ApiClient in src-tauri/src/services/api.rs                   │
│  - Local storage: keyring + ~/.config/codeopen/                 │
└───────────────────────────┬─────────────────────────────────────┘
                            │ HTTP/REST
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Management API (Hono)                          │
│  - REST endpoints in management-api/src/routes/                 │
│  - Proxies to OpenCode containers                               │
│  - Orchestrates Coolify, Forgejo, Models.dev                    │
└───────────────────────────┬─────────────────────────────────────┘
                            │ HTTP Proxy
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    OpenCode Containers                           │
│  - Running on Coolify                                           │
│  - Per-project AI coding assistants                             │
│  - SSE streaming for real-time updates                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## 1. Tauri Commands (src-tauri/src/commands/)

### Connection Commands (`connection.rs`)

| Command | Parameters | Return Type | UI Purpose |
|---------|------------|-------------|------------|
| `connect` | `api_url: String`, `api_key: Option<String>` | `ConnectionStatus` | Initial setup - connect to Management API |
| `disconnect` | - | `()` | Remove stored connection config |
| `test_connection` | - | `ConnectionStatus` | Health check with live API test |
| `get_connection_status` | - | `ConnectionStatus` | Get cached connection status (no API call) |

### Project Commands (`projects.rs`)

| Command | Parameters | Return Type | UI Purpose |
|---------|------------|-------------|------------|
| `list_projects` | - | `Vec<Project>` | Display project list |
| `get_project` | `id: String` | `Project` | Project detail view with live status |
| `create_project` | `name`, `description?`, `github_url?`, `llm_provider_id?`, `llm_model_id?`, `container_tier_id?` | `Project` | New project wizard |
| `delete_project` | `id: String`, `delete_repo: Option<bool>` | `()` | Remove project and optionally Forgejo repo |
| `start_project` | `id: String` | `Project` | Start container |
| `stop_project` | `id: String` | `Project` | Stop container |
| `restart_project` | `id: String` | `Project` | Restart container |
| `get_project_logs` | `id: String`, `lines: Option<u32>` | `String` | View container logs |
| `deploy_project` | `id: String`, `force: Option<bool>` | `DeployResponse` | Trigger rebuild/redeploy |
| `list_container_tiers` | - | `Vec<ContainerTier>` | Show tier selection in project creation |
| `get_default_container_tier` | - | `ContainerTier` | Default tier for new projects |

### OpenCode Commands (`opencode.rs`)

#### App Info & Health

| Command | Parameters | Return Type | UI Purpose |
|---------|------------|-------------|------------|
| `opencode_get_app_info` | `project_id: String` | `AppInfo` | Display OpenCode version |
| `opencode_health_check` | `project_id: String` | `OpenCodeHealth` | Check if container is responsive |
| `opencode_get_providers` | `project_id: String` | `serde_json::Value` | Show available LLM models in container |

#### Sessions

| Command | Parameters | Return Type | UI Purpose |
|---------|------------|-------------|------------|
| `opencode_list_sessions` | `project_id: String` | `Vec<Session>` | Session list/history |
| `opencode_create_session` | `project_id: String` | `Session` | Start new chat session |
| `opencode_get_session` | `project_id`, `session_id` | `Session` | Session details |
| `opencode_delete_session` | `project_id`, `session_id` | `()` | Delete chat history |
| `opencode_abort_session` | `project_id`, `session_id` | `()` | Cancel running LLM operation |

#### Messages

| Command | Parameters | Return Type | UI Purpose |
|---------|------------|-------------|------------|
| `opencode_list_messages` | `project_id`, `session_id` | `Vec<Message>` | Load chat history |
| `opencode_send_message` | `project_id`, `session_id`, `text`, `provider_id?`, `model_id?` | `Message` | Send user message to AI |
| `opencode_send_message_with_files` | `project_id`, `session_id`, `text`, `files: Vec<String>`, `provider_id?`, `model_id?` | `Message` | Send message with file attachments |
| `opencode_get_message` | `project_id`, `session_id`, `message_id` | `Message` | Get specific message details |

#### Permissions

| Command | Parameters | Return Type | UI Purpose |
|---------|------------|-------------|------------|
| `opencode_respond_permission` | `project_id`, `session_id`, `permission_id`, `response: "once"\|"always"\|"reject"` | `bool` | Approve/deny tool execution |

#### Files

| Command | Parameters | Return Type | UI Purpose |
|---------|------------|-------------|------------|
| `opencode_list_files` | `project_id`, `path: Option<String>` | `Vec<FileNode>` | Browse project files |
| `opencode_get_file_content` | `project_id`, `path` | `FileContent` | View file content |
| `opencode_find_files` | `project_id`, `pattern` | `Vec<String>` | Search files by pattern |

#### SSE Streaming

| Command | Parameters | Return Type | UI Purpose |
|---------|------------|-------------|------------|
| `opencode_connect_stream` | `app: AppHandle`, `project_id` | `StreamConnection` | Connect to real-time event stream |
| `opencode_disconnect_stream` | `app: AppHandle`, `stream_id` | `()` | Disconnect from stream |

**Events Emitted:**
- `opencode:event` - Real-time events (message updates, tool execution, etc.)
- `opencode:stream-status` - Connection status changes

### Settings Commands (`settings.rs`)

#### Local Settings

| Command | Parameters | Return Type | UI Purpose |
|---------|------------|-------------|------------|
| `get_settings` | - | `AppSettings` | Load local preferences |
| `save_settings` | `settings: AppSettings` | `()` | Save local preferences |
| `export_settings` | - | `String` (JSON) | Backup settings for transfer |
| `import_settings` | `json: String` | `AppSettings` | Restore settings from backup |

#### LLM Providers

| Command | Parameters | Return Type | UI Purpose |
|---------|------------|-------------|------------|
| `list_providers` | - | `Vec<Provider>` | Legacy provider list |
| `list_providers_with_models` | `popular_only: Option<bool>` | `Vec<ProviderWithModels>` | Full provider + model list from Models.dev |
| `list_configured_providers` | - | `Vec<ProviderWithModels>` | Only providers with credentials |
| `get_default_provider` | - | `Option<Provider>` | Current default provider |
| `configure_provider_api_key` | `provider_id`, `api_key` | `()` | Add API key for provider |
| `set_default_provider` | `provider_id` | `()` | Set as default |
| `remove_provider_credentials` | `provider_id` | `()` | Remove stored credentials |

#### OAuth Flow

| Command | Parameters | Return Type | UI Purpose |
|---------|------------|-------------|------------|
| `init_oauth_flow` | `provider_id` | `OAuthFlowInit` | Start device flow (GitHub Copilot) |
| `poll_oauth_flow` | `provider_id`, `state_id` | `OAuthFlowStatus` | Check OAuth completion |
| `cancel_oauth_flow` | `provider_id`, `state_id` | `()` | Abort OAuth flow |

#### User OpenCode Config

| Command | Parameters | Return Type | UI Purpose |
|---------|------------|-------------|------------|
| `get_user_opencode_config` | `user_id: Option<String>` | `UserOpencodeConfig` | Load user's global config |
| `update_user_opencode_settings` | `user_id?`, `settings` | `UserOpencodeSettings` | Update OpenCode settings |
| `update_user_agents_md` | `user_id?`, `content` | `()` | Edit global AGENTS.md |
| `list_user_opencode_files` | `user_id?`, `file_type?` | `Vec<UserOpencodeFile>` | List agents/commands/tools/plugins |
| `upsert_user_opencode_file` | `user_id?`, `file_type`, `name`, `content`, `extension?` | `UserOpencodeFile` | Create/update config file |
| `delete_user_opencode_file` | `user_id?`, `file_type`, `name` | `()` | Delete config file |

---

## 2. Management API REST Endpoints

### Health Routes (`health.ts`)

| Method | Endpoint | Response | Purpose |
|--------|----------|----------|---------|
| GET | `/health` | `{ status, timestamp }` | Health check |
| GET | `/api/info` | `{ name, version, description, status }` | API info |

### Project Routes (`projects.ts`)

| Method | Endpoint | Body/Query | Response | Purpose |
|--------|----------|------------|----------|---------|
| GET | `/api/projects` | - | `{ projects: Project[] }` | List all projects |
| GET | `/api/projects/:id` | - | `{ project: Project }` | Get project with live status |
| GET | `/api/projects/:id/logs` | `?lines=100` | `{ logs, lines }` | Container logs |
| POST | `/api/projects` | `{ name, description?, ... }` | `{ project }` | Create project |
| PATCH | `/api/projects/:id` | `{ name?, description?, ... }` | `{ project }` | Update metadata |
| DELETE | `/api/projects/:id` | `{ deleteRepo?: boolean }` | `{ success, message }` | Delete project |
| POST | `/api/projects/:id/start` | - | `{ project, message }` | Start container |
| POST | `/api/projects/:id/stop` | - | `{ project, message }` | Stop container |
| POST | `/api/projects/:id/restart` | - | `{ project, message }` | Restart container |
| POST | `/api/projects/:id/credentials` | `{ providerId? }` | `{ project, message }` | Update LLM credentials |
| POST | `/api/projects/:id/deploy` | `{ force?: boolean }` | `{ success, message, deploymentId }` | Trigger rebuild |

### OpenCode Proxy Routes (`opencode.ts`)

#### App & Health

| Method | Endpoint | Response | Purpose |
|--------|----------|----------|---------|
| GET | `/api/projects/:id/opencode/app` | `AppInfo` | OpenCode container info |
| GET | `/api/projects/:id/opencode/health` | `{ healthy, projectId, error? }` | Container health |
| GET | `/api/projects/:id/opencode/providers` | Provider/model data | Configured LLMs in container |

#### Sessions

| Method | Endpoint | Body | Response | Purpose |
|--------|----------|------|----------|---------|
| GET | `/api/projects/:id/opencode/session` | - | `Session[]` | List sessions |
| POST | `/api/projects/:id/opencode/session` | - | `Session` | Create session |
| GET | `/api/projects/:id/opencode/session/:sessionId` | - | `Session` | Get session |
| DELETE | `/api/projects/:id/opencode/session/:sessionId` | - | `{ success }` | Delete session |
| POST | `/api/projects/:id/opencode/session/:sessionId/abort` | - | `{ success }` | Abort running session |

#### Messages

| Method | Endpoint | Body | Response | Purpose |
|--------|----------|------|----------|---------|
| GET | `/api/projects/:id/opencode/session/:sessionId/message` | - | `Message[]` | List messages |
| POST | `/api/projects/:id/opencode/session/:sessionId/message` | `{ parts, model? }` | `Message` | Send message |
| GET | `/api/projects/:id/opencode/session/:sessionId/message/:messageId` | - | `Message` | Get message |

#### Permissions

| Method | Endpoint | Body | Response | Purpose |
|--------|----------|------|----------|---------|
| POST | `/api/projects/:id/opencode/session/:sessionId/permissions/:permissionId` | `{ response }` | `{ success }` | Respond to permission request |

#### Files

| Method | Endpoint | Query | Response | Purpose |
|--------|----------|-------|----------|---------|
| GET | `/api/projects/:id/opencode/file` | `?path=/` | `FileNode[]` | List directory |
| GET | `/api/projects/:id/opencode/file/content` | `?path=...` | `FileContent` | Get file content |
| GET | `/api/projects/:id/opencode/find/file` | `?query=...` | `string[]` | Search files |

#### SSE Streaming

| Method | Endpoint | Response | Purpose |
|--------|----------|----------|---------|
| GET | `/api/projects/:id/opencode/event` | SSE Stream | Real-time events |

### Provider Routes (`providers.ts`)

| Method | Endpoint | Body/Query | Response | Purpose |
|--------|----------|------------|----------|---------|
| GET | `/api/providers` | `?popularOnly=true` | `{ providers, totalCount?, popularCount }` | List providers with models |
| GET | `/api/providers/configured` | - | `{ providers }` | Only configured providers |
| GET | `/api/providers/default` | - | `{ provider }` | Default provider |
| GET | `/api/providers/:id` | - | `{ provider }` | Provider details + models |
| POST | `/api/providers/:id/configure` | `{ apiKey }` | `{ success, provider }` | Configure API key |
| POST | `/api/providers/:id/set-default` | - | `{ success, provider }` | Set as default |
| DELETE | `/api/providers/:id` | - | `{ success }` | Remove credentials |
| POST | `/api/providers/:id/oauth/init` | - | `{ stateId, userCode, verificationUri, ... }` | Start OAuth flow |
| POST | `/api/providers/:id/oauth/poll` | `{ stateId }` | `{ status, error?, isConfigured }` | Poll OAuth status |
| GET | `/api/providers/:id/oauth/status/:stateId` | - | `{ status, error? }` | Get OAuth status |
| DELETE | `/api/providers/:id/oauth/:stateId` | - | `{ success }` | Cancel OAuth |
| POST | `/api/providers/refresh-cache` | - | `{ success, providerCount }` | Refresh Models.dev cache |

### User Config Routes (`users.ts`)

| Method | Endpoint | Body | Response | Purpose |
|--------|----------|------|----------|---------|
| GET | `/api/users/:userId/opencode/config` | - | Full config | Get all user config |
| GET | `/api/users/:userId/opencode/settings` | - | `{ settings }` | Get settings only |
| PUT | `/api/users/:userId/opencode/settings` | `{ settings }` | `{ success, settings }` | Update settings |
| GET | `/api/users/:userId/opencode/agents-md` | - | `{ content }` | Get AGENTS.md |
| PUT | `/api/users/:userId/opencode/agents-md` | `{ content }` | `{ success, content }` | Update AGENTS.md |
| GET | `/api/users/:userId/opencode/files` | `?type=...` | `{ files }` | List config files |
| GET | `/api/users/:userId/opencode/files/:type/:name` | - | `{ type, name, ... }` | Get specific file |
| PUT | `/api/users/:userId/opencode/files/:type/:name` | `{ content, extension? }` | `{ success, ... }` | Create/update file |
| DELETE | `/api/users/:userId/opencode/files/:type/:name` | - | `{ success }` | Delete file |
| POST | `/api/users/:userId/opencode/init` | - | `{ success, settings }` | Initialize new user |

### Container Tier Routes (`container-tiers.ts`)

| Method | Endpoint | Response | Purpose |
|--------|----------|----------|---------|
| GET | `/api/container-tiers` | `{ tiers }` | List all tiers |
| GET | `/api/container-tiers/default` | Tier object | Get default tier |
| GET | `/api/container-tiers/:id` | Tier object | Get specific tier |

### Sync Routes (`sync.ts`)

| Method | Endpoint | Body | Response | Purpose |
|--------|----------|------|----------|---------|
| GET | `/api/projects/:id/sync/status` | - | Sync status | Get GitHub sync status |
| POST | `/api/projects/:id/sync/config` | `{ githubUrl?, ... }` | `{ project }` | Configure sync |
| POST | `/api/projects/:id/sync` | - | `{ success, message, lastSyncAt }` | Trigger sync |
| POST | `/api/projects/:id/sync/commit-config` | `{ message?, push? }` | `{ success, details }` | Commit .opencode/ changes |

---

## 3. Frontend API Layer (src/lib/api/tauri.ts)

### TypeScript Types

#### Core Types
- `Project` - Full project data with URLs, status, sync settings
- `ConnectionStatus` - API connection state
- `ContainerTier` - Container resource tier
- `AppSettings` - Local app preferences (theme, notifications)

#### OpenCode Types
- `Session` - Chat session with metadata
- `Message` - Message with info and parts
- `MessagePart` - Text, tool invocation, file, etc.
- `FileNode` - File system entry
- `FileContent` - File content with MIME type
- `PermissionRequest` - Tool permission request
- `OpenCodeEvent` - SSE stream event

#### Provider Types
- `ProviderWithModels` - Provider with model list from Models.dev
- `ModelInfo` - Model capabilities and pricing
- `OAuthFlowInit` / `OAuthFlowStatus` - OAuth flow state

#### User Config Types
- `UserOpencodeConfig` - Full user configuration
- `UserOpencodeSettings` - Permissions, theme, provider settings
- `UserOpencodeFile` - Custom agents, commands, tools, plugins

### Helper Classes

```typescript
// OpenCodeStream - Manages SSE connection with automatic cleanup
class OpenCodeStream {
  constructor(projectId: string)
  async connect(onEvent, onStatus?): Promise<void>
  async disconnect(): Promise<void>
  get isConnected(): boolean
}
```

---

## 4. Key Capabilities by Feature Area

### Project Management
- CRUD operations for projects
- Container lifecycle (start/stop/restart/deploy)
- Container logs viewing
- GitHub sync configuration (API ready, UI pending)
- Container tier selection (lite/standard/pro/desktop)

### AI Chat
- Session management (create/delete/abort)
- Message sending with optional file attachments
- Model selection per message
- Real-time streaming via SSE
- Permission approval flow for tool execution

### File Browsing
- Directory listing
- File content viewing
- File search by pattern

### LLM Provider Management
- API key configuration
- OAuth device flow (GitHub Copilot)
- Default provider selection
- Model listing from Models.dev

### User Configuration
- Global OpenCode settings (theme, permissions)
- Custom AGENTS.md
- Custom agents, commands, tools, plugins
- Settings import/export

### Local App Settings
- Theme (light/dark/system)
- Auto-refresh interval
- Notification preferences

---

## 5. Unused API Capabilities

The following API capabilities exist but are not fully utilized in the current UI:

| Capability | API Location | Current Status |
|------------|--------------|----------------|
| GitHub Sync | `/api/projects/:id/sync/*` | Placeholder UI only |
| Project Restart | `restart_project` | Not exposed in UI |
| Commit Config | `/api/projects/:id/sync/commit-config` | Not used |
| Provider OAuth Status | `/api/providers/:id/oauth/status/:stateId` | Polling used instead |
| File Search in UI | `opencode_find_files` | Only used in chat file picker |
| Batch Permission Actions | - | Single permission only |

---

*Document generated: December 2024*
