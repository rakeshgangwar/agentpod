# Phase 4: Tasks

## Priority Order

1. **Routing Structure Refactor** - Proper SvelteKit routing
2. **Project Detail View** - Tabs and navigation
3. **Chat Interface** - Core feature with OpenCode integration
4. **File Browser** - Browse and view project files
5. **SSE Streaming** - Real-time updates
6. **Settings & Deferred Items** - From Phase 3

---

## 0. Prerequisites & Setup

### 0.1 Install Additional Dependencies
- [x] Install Shiki for syntax highlighting: `pnpm add shiki`
- [x] Install marked for markdown: `pnpm add marked`
- [ ] Install additional shadcn components:
  ```bash
  pnpm dlx shadcn-svelte@next add dialog tabs scroll-area separator avatar dropdown-menu
  ```
- [ ] Install sonner for toast notifications: `pnpm add sonner`

### 0.2 Management API Updates
- [x] Add OpenCode proxy endpoints to Management API:
  - `GET /api/projects/:id/opencode/session` - List sessions
  - `POST /api/projects/:id/opencode/session` - Create session
  - `GET /api/projects/:id/opencode/session/:sid` - Get session
  - `POST /api/projects/:id/opencode/session/:sid/message` - Send message
  - `GET /api/projects/:id/opencode/session/:sid/message` - List messages
  - `POST /api/projects/:id/opencode/session/:sid/abort` - Abort session
  - `GET /api/projects/:id/opencode/event` - SSE stream (proxy)
  - `GET /api/projects/:id/opencode/file` - List files
  - `GET /api/projects/:id/opencode/file/content` - Read file

---

## 1. Routing Structure Refactor

### 1.1 Base Layout Updates
- [x] Update `src/routes/+layout.svelte` for connection guard
- [x] Create root redirect logic in `src/routes/+page.svelte`

### 1.2 Setup Route
- [x] Create `src/routes/setup/+page.svelte`
- [x] Move connection form from current +page.svelte
- [x] Redirect to /projects after successful connection

### 1.3 Projects Routes
- [x] Create `src/routes/projects/+page.svelte` (project list)
- [x] Create `src/routes/projects/new/+page.svelte` (create project)
- [x] Create `src/routes/projects/[id]/+layout.svelte` (project shell)
- [x] Create `src/routes/projects/[id]/+page.svelte` (redirect to chat)
- [x] Create `src/routes/projects/[id]/chat/+page.svelte`
- [x] Create `src/routes/projects/[id]/files/+page.svelte`
- [x] Create `src/routes/projects/[id]/sync/+page.svelte`

### 1.4 Settings Route
- [x] Create `src/routes/settings/+page.svelte`
- [x] Move settings content from current +page.svelte

---

## 2. Project List UI

### 1.1 Project List Screen
- [x] Create `src/routes/projects/+page.svelte`
- [x] Display projects in card format
- [x] Show status indicator (running/stopped/error)
- [ ] Pull-to-refresh functionality
- [x] Empty state with "Create Project" CTA

### 1.2 Project Card Component
- [x] Create `src/lib/components/ProjectCard.svelte`
- [x] Display: name, description, status, last activity
- [ ] Quick actions: start/stop toggle
- [x] Tap to open project detail

### 1.3 Status Indicators
- [x] Running (green dot)
- [x] Stopped (red dot)
- [x] Starting/Stopping (yellow, animated)
- [x] Unknown (gray)

---

## 2. Create Project Flow

### 2.1 New Project Modal/Screen
- [ ] Create `src/routes/projects/new/+page.svelte`
- [ ] Tabs: "From Scratch" / "Import from GitHub"

### 2.2 From Scratch Form
- [ ] Project name input
- [ ] Description input (optional)
- [ ] LLM provider selector (default or override)
- [ ] Create button

### 2.3 GitHub Import Form
- [ ] Repository URL input
- [ ] URL validation (GitHub/GitLab format)
- [ ] Sync options:
  - Enable sync toggle
  - Sync direction selector
- [ ] Import button

### 2.4 Creation Progress
- [ ] Show progress steps:
  1. Creating repository...
  2. Setting up container...
  3. Starting OpenCode...
- [ ] Success → redirect to project
- [ ] Error → show message, retry option

---

## 3. Project Detail View

### 3.1 Project Screen with Tabs
- [x] Create `src/routes/projects/[id]/+page.svelte`
- [x] Header: project name, settings button, sync button
- [x] Tab bar: Chat | Files | Sync

### 3.2 Tab Navigation
- [x] Implement tab switching
- [x] Preserve tab state when switching
- [x] Deep linking support (`/projects/123/files`)

---

## 4. Chat Interface

### 4.1 Session List
- [x] Create `src/lib/components/SessionList.svelte`
- [x] List previous sessions with:
  - Title/first message preview
  - Date/time
  - Status (complete/active)
- [x] "New Session" button

### 4.2 Chat View
- [x] Create `src/lib/components/Chat.svelte`
- [x] Message list (scrollable)
- [x] Input bar at bottom
- [x] Send button

### 4.3 Message Components
- [x] Create `src/lib/components/Message.svelte`
- [x] User message style (right aligned, blue)
- [x] Assistant message style (left aligned, gray)
- [ ] Tool call display (expandable) - partial
- [x] Code block rendering with syntax highlighting

### 4.4 Input Bar
- [x] Create `src/lib/components/ChatInput.svelte`
- [x] Multi-line text input (auto-grow)
- [ ] File reference button (@)
- [x] Send button (disabled when empty)
- [x] Loading state while sending

---

## 5. Real-time Streaming (SSE)

### 5.1 SSE Client in Rust
- [x] Use `reqwest` with `stream` feature (no external crate needed)
- [x] Create `src-tauri/src/services/sse.rs`
- [x] Implement SSE parsing with manual `data:` line parsing
- [x] Handle reconnection logic

### 5.2 Tauri Event Bridge
- [x] Emit events from Rust to frontend via `app.emit()`
- [x] Event types (from OpenCode):
  - `session.updated` - Session status/cost changed
  - `message.part.updated` - Streaming text chunk
  - `tool.execute` - Tool being executed
  - `tool.result` - Tool execution completed
  - `file.edited` - File was modified

### 5.3 Frontend Event Handling
- [x] Create `src/lib/stores/chat.ts`
- [x] Subscribe to Tauri events
- [x] Update message store on events
- [x] Handle reconnection

### 5.4 Streaming UI
- [x] Show "thinking" indicator
- [ ] Render message as it streams - partial (events received but display issues)
- [x] Smooth scroll to bottom
- [x] Handle stream completion

---

## 6. OpenCode API Integration

### 6.1 Rust Commands for OpenCode (via Management API)
- [x] Create `src-tauri/src/commands/opencode.rs`
- [x] Commands (all proxy through Management API):
  - `opencode_list_sessions(project_id)`
  - `opencode_get_session(project_id, session_id)`
  - `opencode_create_session(project_id)`
  - `opencode_send_prompt(project_id, session_id, prompt)`
  - `opencode_abort_session(project_id, session_id)`
  - `opencode_subscribe_events(project_id)`
  - `opencode_list_files(project_id, path)` - with lazy loading support
  - `opencode_get_file(project_id, path)`

### 6.2 Frontend API Wrapper
- [x] Update `src/lib/api/tauri.ts` with OpenCode commands
- [x] Type definitions for Session, Message, FileNode

---

## 7. File Browser

### 7.1 File Tree Component
- [x] Create `src/lib/components/FileBrowser.svelte`
- [x] Fetch file tree from OpenCode API
- [x] Display folder structure
- [x] Expand/collapse folders (with lazy-loading)
- [x] File icons by type

### 7.2 File Viewer
- [x] Create `src/lib/components/FileViewer.svelte`
- [x] Fetch file contents via Management API -> OpenCode
- [x] Syntax highlighting with Shiki (30+ languages, dual theme)
- [x] Line numbers
- [ ] Copy path button
- [ ] "Use in Chat" button

### 7.3 Markdown Rendering
- [x] Create `src/lib/components/ui/markdown/` component
- [x] Render markdown with marked (GFM support)
- [x] Syntax-highlighted code blocks within markdown
- [x] Raw/Preview toggle (defaults to raw)

### 7.4 File Reference Picker
- [ ] Create `src/lib/components/FileReferencePicker.svelte`
- [ ] Triggered by @ in chat input
- [ ] Search/filter files
- [ ] Select to insert reference

---

## 8. Container Management

### 8.1 Status Display
- [x] Show container status on project detail
- [ ] Auto-refresh status periodically

### 8.2 Start/Stop Controls
- [ ] Start button (when stopped)
- [ ] Stop button (when running)
- [ ] Confirmation for stop
- [ ] Loading state during operation

### 8.3 Error Handling
- [ ] Show error state if container crashed
- [ ] "View Logs" option (future)
- [ ] "Restart" option

---

## 9. Navigation & Polish

### 9.1 Bottom Navigation
- [ ] Create `src/lib/components/BottomNav.svelte`
- [ ] Tabs: Projects | Activity | Settings
- [ ] Active state indicator

### 9.2 Transitions
- [ ] Page transitions
- [ ] Tab transitions
- [ ] List item animations

### 9.3 Loading States
- [ ] Skeleton loaders for lists
- [ ] Spinner for actions
- [ ] Progress indicators

---

## 10. Deferred Items from Phase 3

### 10.1 Settings Store & Commands
- [ ] Create `src/lib/stores/settings.svelte.ts`
- [ ] Create `src-tauri/src/commands/settings.rs`
- [ ] Implement commands:
  - `get_settings()` - Get app settings
  - `save_settings(settings)` - Save settings
  - `get_providers()` - List LLM providers from API

### 10.2 OAuth Integration Skeleton
- [ ] Add `tauri-plugin-oauth` to Tauri builder
- [ ] Configure permissions: `oauth:allow-start`, `oauth:allow-cancel`
- [ ] Create `src-tauri/src/services/oauth.rs`
- [ ] Implement OAuth commands:
  - `initiate_oauth(provider)` - Start OAuth server, return port
  - `complete_oauth(provider, auth_url)` - Handle callback
- [ ] Enable GitHub Connect button in settings
- [ ] Enable LLM Provider Configure button in settings

### 10.3 Additional shadcn Components
- [ ] Dialog - for modals and confirmations
- [ ] Tabs - for project detail view
- [ ] ScrollArea - for chat scrolling
- [ ] Separator - UI dividers
- [ ] Avatar - user/AI indicators
- [ ] DropdownMenu - session selection, actions
- [ ] Toast/Sonner - notifications

---

## 11. Testing

- [x] Test project creation flow end-to-end
- [x] Test chat with real OpenCode container
- [x] Test file browser navigation
- [x] Test SSE streaming
- [x] Test routing and navigation
- [ ] Test settings persistence

---

## Notes

### Architecture Decisions
- All OpenCode communication goes through Management API (proxy pattern)
- Management API stores session metadata for future features
- SSE implemented with reqwest + manual parsing (no external crate)
- Shiki for syntax highlighting (VS Code quality)
- marked for markdown rendering

### Dependencies to Add
```bash
# Frontend
pnpm add shiki marked sonner

# shadcn components
pnpm dlx shadcn-svelte@next add dialog tabs scroll-area separator avatar dropdown-menu
```

### Rust Dependencies
```toml
# Cargo.toml additions (if needed)
futures-util = "0.3"  # For stream handling
```

### Future Considerations
- Offline caching for project list
- Optimistic UI updates
- Error boundaries for graceful failures
- Session history persistence in Management API database
