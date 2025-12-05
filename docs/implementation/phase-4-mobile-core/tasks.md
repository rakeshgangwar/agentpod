# Phase 4: Tasks

## 1. Project List UI

### 1.1 Project List Screen
- [ ] Create `src/routes/projects/+page.svelte`
- [ ] Display projects in card format
- [ ] Show status indicator (running/stopped/error)
- [ ] Pull-to-refresh functionality
- [ ] Empty state with "Create Project" CTA

### 1.2 Project Card Component
- [ ] Create `src/lib/components/ProjectCard.svelte`
- [ ] Display: name, description, status, last activity
- [ ] Quick actions: start/stop toggle
- [ ] Tap to open project detail

### 1.3 Status Indicators
- [ ] 🟢 Running (green dot)
- [ ] 🔴 Stopped (red dot)
- [ ] 🟡 Starting/Stopping (yellow, animated)
- [ ] ⚪ Unknown (gray)

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
- [ ] Create `src/routes/projects/[id]/+page.svelte`
- [ ] Header: project name, settings button, sync button
- [ ] Tab bar: Chat | Files | Sync

### 3.2 Tab Navigation
- [ ] Implement tab switching
- [ ] Preserve tab state when switching
- [ ] Deep linking support (`/projects/123/files`)

---

## 4. Chat Interface

### 4.1 Session List
- [ ] Create `src/lib/components/SessionList.svelte`
- [ ] List previous sessions with:
  - Title/first message preview
  - Date/time
  - Status (complete/active)
- [ ] "New Session" button

### 4.2 Chat View
- [ ] Create `src/lib/components/Chat.svelte`
- [ ] Message list (scrollable)
- [ ] Input bar at bottom
- [ ] Send button

### 4.3 Message Components
- [ ] Create `src/lib/components/Message.svelte`
- [ ] User message style (right aligned, blue)
- [ ] Assistant message style (left aligned, gray)
- [ ] Tool call display (expandable)
- [ ] Code block rendering with syntax highlighting

### 4.4 Input Bar
- [ ] Create `src/lib/components/ChatInput.svelte`
- [ ] Multi-line text input (auto-grow)
- [ ] File reference button (@)
- [ ] Send button (disabled when empty)
- [ ] Loading state while sending

---

## 5. Real-time Streaming (SSE)

### 5.1 SSE Client in Rust
- [ ] Add `eventsource-client` crate
- [ ] Create `src/services/sse.rs`
- [ ] Implement event stream subscription

### 5.2 Tauri Event Bridge
- [ ] Emit events from Rust to frontend
- [ ] Event types:
  - `message:update` - New message content
  - `message:part` - Streaming chunk
  - `session:status` - Session state change
  - `session:idle` - Task complete

### 5.3 Frontend Event Handling
- [ ] Create `src/lib/stores/chat.ts`
- [ ] Subscribe to Tauri events
- [ ] Update message store on events
- [ ] Handle reconnection

### 5.4 Streaming UI
- [ ] Show "thinking" indicator
- [ ] Render message as it streams
- [ ] Smooth scroll to bottom
- [ ] Handle stream completion

---

## 6. OpenCode API Integration

### 6.1 Rust Commands for OpenCode
- [ ] Create `src/commands/opencode.rs`
- [ ] Commands:
  - `opencode_list_sessions(project_id)`
  - `opencode_get_session(project_id, session_id)`
  - `opencode_create_session(project_id)`
  - `opencode_send_prompt(project_id, session_id, prompt)`
  - `opencode_abort_session(project_id, session_id)`
  - `opencode_subscribe_events(project_id)`

### 6.2 Direct OpenCode Connection
- [ ] Get container endpoint from project
- [ ] Connect directly to OpenCode API
- [ ] Handle authentication if needed

---

## 7. File Browser

### 7.1 File Tree Component
- [ ] Create `src/lib/components/FileBrowser.svelte`
- [ ] Fetch file tree from OpenCode API
- [ ] Display folder structure
- [ ] Expand/collapse folders
- [ ] File icons by type

### 7.2 File Viewer
- [ ] Create `src/lib/components/FileViewer.svelte`
- [ ] Fetch file contents from OpenCode API
- [ ] Syntax highlighting (use Shiki or Prism)
- [ ] Line numbers
- [ ] Copy path button
- [ ] "Use in Chat" button

### 7.3 File Reference Picker
- [ ] Create `src/lib/components/FileReferencePicker.svelte`
- [ ] Triggered by @ in chat input
- [ ] Search/filter files
- [ ] Select to insert reference

---

## 8. Container Management

### 8.1 Status Display
- [ ] Show container status on project detail
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

## 10. Testing

- [ ] Test project creation flow end-to-end
- [ ] Test chat with real OpenCode container
- [ ] Test file browser navigation
- [ ] Test SSE streaming
- [ ] Test on iOS/Android device

---

## Notes

- Consider offline caching for project list
- Implement optimistic UI updates where possible
- Add error boundaries for graceful failures
