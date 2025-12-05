# Phase 4: Technical Notes

## Architecture Decisions

### Connection Flow
```
Desktop App (Tauri) → Management API → OpenCode Container
```

- **Desktop App**: Only connects to Management API
- **Management API**: Proxies requests to OpenCode containers, stores session metadata
- **OpenCode Container**: One per project, isolated workspace

### API Routing Decision
- Use **global OpenCode APIs** (`/session`, `/file`, etc.)
- Each container is already project-scoped by nature
- Management API adds project context via routing

### Authentication
- Management API handles all auth (API key)
- OpenCode containers are on private Docker network
- No auth needed between Management API and OpenCode

---

## Technology Choices

### Syntax Highlighting: Shiki
**Why Shiki over Prism:**
- More accurate (uses VS Code's TextMate grammars)
- Better theme support (native VS Code themes)
- First-class markdown integration packages
- Easy light/dark mode switching

**Packages:**
```bash
pnpm add shiki marked
```

**Usage for Markdown with code highlighting:**
```typescript
import { marked } from 'marked';
import { codeToHtml, createHighlighter } from 'shiki';

// Create highlighter once
const highlighter = await createHighlighter({
  themes: ['github-dark', 'github-light'],
  langs: ['typescript', 'javascript', 'python', 'rust', 'bash', 'json', 'markdown']
});

// Custom renderer for code blocks
marked.use({
  async: true,
  renderer: {
    code(code: string, lang: string) {
      return highlighter.codeToHtml(code, { 
        lang: lang || 'text', 
        theme: 'github-dark' 
      });
    }
  }
});

// Render markdown with highlighted code
const html = await marked.parse(markdownContent);
```

### SSE Implementation: reqwest with manual parsing
**Approach:** Use reqwest's `bytes_stream()` with manual SSE parsing

**Why not external crates:**
- SSE format is simple (`data: {...}\n\n`)
- Reduces dependencies
- Full control over reconnection logic

```rust
use futures_util::StreamExt;
use reqwest::Client;
use tauri::{AppHandle, Emitter};

pub async fn subscribe_to_events(
    app: AppHandle,
    base_url: &str,
    project_id: &str,
) -> Result<(), String> {
    let client = Client::new();
    let response = client
        .get(format!("{}/event", base_url))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    
    let mut stream = response.bytes_stream();
    let mut buffer = String::new();
    
    while let Some(chunk) = stream.next().await {
        let bytes = chunk.map_err(|e| e.to_string())?;
        buffer.push_str(&String::from_utf8_lossy(&bytes));
        
        // Parse complete SSE messages
        while let Some(pos) = buffer.find("\n\n") {
            let message = buffer[..pos].to_string();
            buffer = buffer[pos + 2..].to_string();
            
            for line in message.lines() {
                if let Some(data) = line.strip_prefix("data: ") {
                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                        app.emit(&format!("opencode:{}", project_id), json)
                            .map_err(|e| e.to_string())?;
                    }
                }
            }
        }
    }
    
    Ok(())
}
```

---

## Routing Structure

```
src/routes/
├── +layout.svelte           # App shell, connection guard
├── +layout.ts               # SSR disabled
├── +page.svelte             # Root redirect
├── setup/
│   └── +page.svelte         # Connection setup
├── projects/
│   ├── +page.svelte         # Project list
│   ├── new/
│   │   └── +page.svelte     # Create project
│   └── [id]/
│       ├── +layout.svelte   # Project header + tabs
│       ├── +page.svelte     # Redirect to chat
│       ├── chat/
│       │   └── +page.svelte # Chat interface
│       ├── files/
│       │   └── +page.svelte # File browser
│       └── sync/
│           └── +page.svelte # Sync settings
├── settings/
│   └── +page.svelte         # Settings
└── activity/
    └── +page.svelte         # Activity feed (optional)
```

---

## Additional shadcn Components Needed

```bash
# Install additional components
pnpm dlx shadcn-svelte@next add dialog tabs scroll-area separator avatar dropdown-menu
pnpm add sonner  # For toast notifications
```

---

## SSE Event Streaming

### Rust SSE Client

```rust
// src-tauri/src/services/sse.rs

use futures_util::StreamExt;
use reqwest_eventsource::{Event, EventSource};
use tauri::{AppHandle, Emitter};

pub async fn subscribe_to_events(
    app: AppHandle,
    base_url: &str,
    project_id: &str,
) -> Result<(), String> {
    let url = format!("{}/event", base_url);
    
    let mut es = EventSource::get(&url);
    
    while let Some(event) = es.next().await {
        match event {
            Ok(Event::Open) => {
                println!("SSE connection opened");
            }
            Ok(Event::Message(message)) => {
                // Parse and emit to frontend
                if let Ok(data) = serde_json::from_str::<serde_json::Value>(&message.data) {
                    app.emit(&format!("opencode:{}", project_id), data)
                        .map_err(|e| e.to_string())?;
                }
            }
            Err(e) => {
                eprintln!("SSE error: {:?}", e);
                break;
            }
        }
    }
    
    Ok(())
}
```

### Frontend Event Listener

```typescript
// src/lib/stores/chat.ts

import { listen } from '@tauri-apps/api/event';
import { writable, get } from 'svelte/store';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  parts: MessagePart[];
  status: 'pending' | 'streaming' | 'complete';
}

export interface MessagePart {
  type: 'text' | 'tool_call' | 'tool_result';
  content: string;
}

export const messages = writable<Message[]>([]);
export const isStreaming = writable(false);

let unsubscribe: (() => void) | null = null;

export async function subscribeToProject(projectId: string) {
  // Unsubscribe from previous
  if (unsubscribe) {
    unsubscribe();
  }
  
  unsubscribe = await listen(`opencode:${projectId}`, (event) => {
    const data = event.payload as any;
    
    switch (data.type) {
      case 'message.updated':
        updateMessage(data.properties);
        break;
      case 'message.part.updated':
        updateMessagePart(data.properties);
        break;
      case 'session.status':
        handleSessionStatus(data.properties);
        break;
    }
  });
}

function updateMessage(props: any) {
  messages.update((msgs) => {
    const index = msgs.findIndex((m) => m.id === props.id);
    if (index >= 0) {
      msgs[index] = { ...msgs[index], ...props };
    } else {
      msgs.push(props);
    }
    return msgs;
  });
}
```

---

## Chat Components

### Message Component

```svelte
<!-- src/lib/components/Message.svelte -->
<script lang="ts">
  import type { Message } from '$lib/stores/chat';
  import CodeBlock from './CodeBlock.svelte';
  import ToolCall from './ToolCall.svelte';
  
  export let message: Message;
  
  $: isUser = message.role === 'user';
</script>

<div class="message" class:user={isUser} class:assistant={!isUser}>
  <div class="content">
    {#each message.parts as part}
      {#if part.type === 'text'}
        <p>{part.content}</p>
      {:else if part.type === 'tool_call'}
        <ToolCall {part} />
      {/if}
    {/each}
    
    {#if message.status === 'streaming'}
      <span class="cursor">▊</span>
    {/if}
  </div>
</div>

<style>
  .message {
    padding: 0.75rem 1rem;
    margin: 0.5rem 0;
    border-radius: 12px;
    max-width: 85%;
  }
  
  .user {
    background: #007aff;
    color: white;
    margin-left: auto;
  }
  
  .assistant {
    background: #e9e9eb;
    color: black;
    margin-right: auto;
  }
  
  .cursor {
    animation: blink 1s infinite;
  }
  
  @keyframes blink {
    50% { opacity: 0; }
  }
</style>
```

### Chat Input Component

```svelte
<!-- src/lib/components/ChatInput.svelte -->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  
  export let disabled = false;
  
  let value = '';
  let textArea: HTMLTextAreaElement;
  
  const dispatch = createEventDispatcher();
  
  function handleSubmit() {
    if (!value.trim() || disabled) return;
    
    dispatch('send', { text: value.trim() });
    value = '';
    adjustHeight();
  }
  
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }
  
  function adjustHeight() {
    if (textArea) {
      textArea.style.height = 'auto';
      textArea.style.height = Math.min(textArea.scrollHeight, 150) + 'px';
    }
  }
  
  function handleFileRef() {
    dispatch('fileref');
  }
</script>

<div class="input-bar">
  <button class="file-btn" on:click={handleFileRef} {disabled}>
    @
  </button>
  
  <textarea
    bind:this={textArea}
    bind:value
    on:input={adjustHeight}
    on:keydown={handleKeydown}
    placeholder="Type a message..."
    rows="1"
    {disabled}
  />
  
  <button 
    class="send-btn" 
    on:click={handleSubmit}
    disabled={!value.trim() || disabled}
  >
    ↑
  </button>
</div>

<style>
  .input-bar {
    display: flex;
    align-items: flex-end;
    gap: 0.5rem;
    padding: 0.75rem;
    background: white;
    border-top: 1px solid #e0e0e0;
  }
  
  textarea {
    flex: 1;
    padding: 0.75rem;
    border: 1px solid #e0e0e0;
    border-radius: 20px;
    resize: none;
    font-size: 1rem;
    line-height: 1.4;
    max-height: 150px;
  }
  
  button {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: none;
    font-size: 1.2rem;
    cursor: pointer;
  }
  
  .file-btn {
    background: #e9e9eb;
    color: #666;
  }
  
  .send-btn {
    background: #007aff;
    color: white;
  }
  
  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
```

---

## File Browser

### File Tree Component

```svelte
<!-- src/lib/components/FileBrowser.svelte -->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import FileIcon from './FileIcon.svelte';
  
  interface FileNode {
    name: string;
    type: 'file' | 'directory';
    path: string;
    children?: FileNode[];
  }
  
  export let tree: FileNode;
  export let depth = 0;
  
  const dispatch = createEventDispatcher();
  
  let expanded: Record<string, boolean> = {};
  
  function toggle(path: string) {
    expanded[path] = !expanded[path];
  }
  
  function selectFile(path: string) {
    dispatch('select', { path });
  }
</script>

<ul class="file-tree" style="--depth: {depth}">
  {#each tree.children || [] as node}
    <li>
      {#if node.type === 'directory'}
        <button class="folder" on:click={() => toggle(node.path)}>
          <span class="icon">{expanded[node.path] ? '📂' : '📁'}</span>
          <span class="name">{node.name}</span>
        </button>
        {#if expanded[node.path] && node.children}
          <svelte:self tree={node} depth={depth + 1} on:select />
        {/if}
      {:else}
        <button class="file" on:click={() => selectFile(node.path)}>
          <FileIcon filename={node.name} />
          <span class="name">{node.name}</span>
        </button>
      {/if}
    </li>
  {/each}
</ul>

<style>
  .file-tree {
    list-style: none;
    padding-left: calc(var(--depth) * 1rem);
    margin: 0;
  }
  
  li {
    margin: 0.25rem 0;
  }
  
  button {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.5rem;
    border: none;
    background: none;
    text-align: left;
    font-size: 0.9rem;
    cursor: pointer;
    border-radius: 4px;
  }
  
  button:hover {
    background: #f0f0f0;
  }
  
  .icon {
    font-size: 1rem;
  }
</style>
```

### File Viewer with Syntax Highlighting

```svelte
<!-- src/lib/components/FileViewer.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { codeToHtml } from 'shiki';
  
  export let path: string;
  export let content: string;
  export let language: string = 'text';
  
  let html = '';
  
  onMount(async () => {
    html = await codeToHtml(content, {
      lang: language,
      theme: 'github-light',
    });
  });
  
  function copyPath() {
    navigator.clipboard.writeText(path);
  }
</script>

<div class="file-viewer">
  <header>
    <span class="path">{path}</span>
    <button on:click={copyPath}>Copy Path</button>
  </header>
  
  <div class="code">
    {#if html}
      {@html html}
    {:else}
      <pre>{content}</pre>
    {/if}
  </div>
</div>

<style>
  .file-viewer {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1rem;
    background: #f5f5f5;
    border-bottom: 1px solid #e0e0e0;
  }
  
  .path {
    font-family: monospace;
    font-size: 0.85rem;
    color: #666;
  }
  
  .code {
    flex: 1;
    overflow: auto;
    padding: 1rem;
  }
  
  .code :global(pre) {
    margin: 0;
    font-size: 0.85rem;
    line-height: 1.5;
  }
</style>
```

---

## OpenCode Commands

```rust
// src-tauri/src/commands/opencode.rs

use serde::{Deserialize, Serialize};
use crate::services::api::ApiClient;

#[derive(Serialize, Deserialize)]
pub struct Session {
    pub id: String,
    pub status: String,
    pub created_at: String,
}

#[derive(Serialize, Deserialize)]
pub struct Message {
    pub id: String,
    pub role: String,
    pub content: String,
}

// Get OpenCode endpoint for a project
async fn get_opencode_url(project_id: &str, state: &AppState) -> Result<String, String> {
    let client = get_client(state)?;
    let project: Project = client
        .get(&format!("/api/projects/{}", project_id))
        .await
        .map_err(|e| e.to_string())?;
    
    // Construct OpenCode URL from project info
    Ok(format!("http://{}:{}", 
        state.server_ip.lock().unwrap().clone().unwrap_or_default(),
        project.container_port
    ))
}

#[tauri::command]
pub async fn opencode_list_sessions(
    state: State<'_, AppState>,
    project_id: String,
) -> Result<Vec<Session>, String> {
    let url = get_opencode_url(&project_id, &state).await?;
    let client = reqwest::Client::new();
    
    let response = client
        .get(format!("{}/session", url))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    
    response.json().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn opencode_create_session(
    state: State<'_, AppState>,
    project_id: String,
) -> Result<Session, String> {
    let url = get_opencode_url(&project_id, &state).await?;
    let client = reqwest::Client::new();
    
    let response = client
        .post(format!("{}/session", url))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    
    response.json().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn opencode_send_prompt(
    state: State<'_, AppState>,
    project_id: String,
    session_id: String,
    prompt: String,
) -> Result<(), String> {
    let url = get_opencode_url(&project_id, &state).await?;
    let client = reqwest::Client::new();
    
    #[derive(Serialize)]
    struct PromptRequest {
        parts: Vec<PromptPart>,
    }
    
    #[derive(Serialize)]
    struct PromptPart {
        r#type: String,
        text: String,
    }
    
    client
        .post(format!("{}/session/{}/message", url, session_id))
        .json(&PromptRequest {
            parts: vec![PromptPart {
                r#type: "text".to_string(),
                text: prompt,
            }],
        })
        .send()
        .await
        .map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
pub async fn opencode_get_files(
    state: State<'_, AppState>,
    project_id: String,
    path: Option<String>,
) -> Result<serde_json::Value, String> {
    let url = get_opencode_url(&project_id, &state).await?;
    let client = reqwest::Client::new();
    
    let mut request_url = format!("{}/find", url);
    if let Some(p) = path {
        request_url = format!("{}?path={}", request_url, p);
    }
    
    let response = client
        .get(request_url)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    
    response.json().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn opencode_get_file(
    state: State<'_, AppState>,
    project_id: String,
    path: String,
) -> Result<serde_json::Value, String> {
    let url = get_opencode_url(&project_id, &state).await?;
    let client = reqwest::Client::new();
    
    let response = client
        .get(format!("{}/file?path={}", url, path))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    
    response.json().await.map_err(|e| e.to_string())
}
```

---

## Project Detail Page

```svelte
<!-- src/routes/projects/[id]/+page.svelte -->
<script lang="ts">
  import { page } from '$app/stores';
  import { onMount, onDestroy } from 'svelte';
  import { api } from '$lib/api/tauri';
  import Chat from '$lib/components/Chat.svelte';
  import FileBrowser from '$lib/components/FileBrowser.svelte';
  import FileViewer from '$lib/components/FileViewer.svelte';
  
  const projectId = $page.params.id;
  
  let project: any = null;
  let activeTab: 'chat' | 'files' | 'sync' = 'chat';
  let selectedFile: string | null = null;
  let fileContent: any = null;
  
  onMount(async () => {
    project = await api.getProject(projectId);
  });
  
  async function handleFileSelect(event: CustomEvent<{ path: string }>) {
    selectedFile = event.detail.path;
    fileContent = await invoke('opencode_get_file', {
      projectId,
      path: selectedFile,
    });
  }
</script>

<div class="project-detail">
  {#if project}
    <header>
      <h1>{project.name}</h1>
      <span class="status {project.status}">{project.status}</span>
    </header>
    
    <nav class="tabs">
      <button 
        class:active={activeTab === 'chat'}
        on:click={() => activeTab = 'chat'}
      >
        Chat
      </button>
      <button 
        class:active={activeTab === 'files'}
        on:click={() => activeTab = 'files'}
      >
        Files
      </button>
      <button 
        class:active={activeTab === 'sync'}
        on:click={() => activeTab = 'sync'}
      >
        Sync
      </button>
    </nav>
    
    <main>
      {#if activeTab === 'chat'}
        <Chat {projectId} />
      {:else if activeTab === 'files'}
        <div class="file-panel">
          {#if selectedFile && fileContent}
            <FileViewer 
              path={selectedFile}
              content={fileContent.content}
              language={fileContent.language}
            />
          {:else}
            <FileBrowser {projectId} on:select={handleFileSelect} />
          {/if}
        </div>
      {:else if activeTab === 'sync'}
        <p>Sync settings coming soon...</p>
      {/if}
    </main>
  {:else}
    <p>Loading...</p>
  {/if}
</div>
```
