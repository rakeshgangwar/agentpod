# Quick AI Task Feature

> **Status:** 🚧 In Progress  
> **Created:** December 2025  
> **Priority:** P0 (High Impact, Low Effort)  
> **Estimated Effort:** 3-5 days  
> **Related:** [Cloudflare Use Cases](../ideas/opencode-cloudflare-use-cases.md), [Cloudflare Integration](../ideas/cloudflare-sandbox-integration.md)

## Overview

The Quick AI Task feature enables users to run AI-powered tasks instantly without creating a full sandbox. It's accessible via a global keyboard shortcut (`Cmd+K` / `Ctrl+K`) or quick action buttons throughout the app.

### Why This Feature?

Based on research of successful AI automation platforms (Vercel AI SDK, Replit Agent, Buffer AI, n8n):

1. **Immediate Value**: Users can get AI assistance without setup friction
2. **Streaming UX**: Real-time response display (not waiting 30+ seconds)
3. **Foundation for More**: Same pattern powers all use cases from the Cloudflare doc
4. **Cost-Effective**: Cloudflare sandboxes hibernate when idle (pay-per-use)

### User Stories

- As a user, I want to quickly ask AI a question without creating a sandbox
- As a user, I want to see AI responses stream in real-time
- As a user, I want to copy or export AI responses easily
- As a user, I want to use preset templates for common tasks
- As a user, I want to see my recent quick tasks for reference

---

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                    Frontend (SvelteKit + Tauri)                │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │              QuickTaskModal Component                     │ │
│  │                                                           │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │ │
│  │  │  Templates  │  │   Input     │  │  History    │       │ │
│  │  │  Sidebar    │  │   Area      │  │  Sidebar    │       │ │
│  │  └─────────────┘  └─────────────┘  └─────────────┘       │ │
│  │                                                           │ │
│  │  ┌─────────────────────────────────────────────────────┐ │ │
│  │  │           Streaming Response Display                 │ │ │
│  │  │  (EventSource → real-time text rendering)           │ │ │
│  │  └─────────────────────────────────────────────────────┘ │ │
│  └──────────────────────────────────────────────────────────┘ │
│                              │                                 │
│                              │ EventSource (SSE)               │
└──────────────────────────────┼─────────────────────────────────┘
                               │
                               ▼
┌────────────────────────────────────────────────────────────────┐
│                    API Layer (Bun + Hono)                      │
│                                                                │
│  POST /api/v2/agents/task          (existing - sync)          │
│  POST /api/v2/agents/task/stream   (NEW - SSE streaming)      │
│  GET  /api/v2/agents/tasks         (NEW - task history)       │
│  GET  /api/v2/agents/templates     (NEW - preset templates)   │
│                                                                │
│  Implementation:                                               │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  streamSSE(c, async (stream) => {                        │ │
│  │    const sandbox = await provider.createSandbox(...)     │ │
│  │    const client = await provider.getOpenCodeClient(...)  │ │
│  │    for await (const chunk of response) {                 │ │
│  │      await stream.writeSSE({ data: chunk })              │ │
│  │    }                                                      │ │
│  │  })                                                       │ │
│  └──────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌────────────────────────────────────────────────────────────────┐
│              Sandbox Layer (Docker or Cloudflare)              │
│                                                                │
│  Docker Provider:                                              │
│  • Full sandbox with OpenCode server                          │
│  • Persistent workspace                                        │
│  • Good for: complex tasks, file operations                   │
│                                                                │
│  Cloudflare Provider:                                          │
│  • Lightweight edge execution                                  │
│  • Auto-hibernation (10 min)                                  │
│  • Good for: quick questions, text generation                 │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Core Infrastructure (Day 1-2)

#### 1.1 Streaming API Endpoint

**File:** `apps/api/src/routes/agents.ts`

```typescript
// Add streaming endpoint to existing agents routes
.post("/task/stream", zValidator("json", taskSchema), async (c) => {
  const body = c.req.valid("json");
  const userId = getAuthenticatedUserId(c);
  
  return streamSSE(c, async (stream) => {
    try {
      // Send start event
      await stream.writeSSE({ 
        data: JSON.stringify({ type: "start", taskId: nanoid() }),
        event: "message"
      });
      
      // Create/reuse sandbox and execute
      const provider = selectProvider({ provider: body.provider });
      const sandbox = await provider.createSandbox({ ... });
      const client = await provider.getOpenCodeClient(sandbox.id);
      
      // Stream response chunks
      for await (const chunk of response) {
        await stream.writeSSE({
          data: JSON.stringify({ type: "chunk", content: chunk }),
          event: "message"
        });
      }
      
      // Send completion
      await stream.writeSSE({
        data: JSON.stringify({ type: "done" }),
        event: "message"
      });
    } catch (error) {
      await stream.writeSSE({
        data: JSON.stringify({ type: "error", message: error.message }),
        event: "message"
      });
    }
  });
})
```

#### 1.2 Task History Storage

**File:** `apps/api/src/db/schema/tasks.ts`

```typescript
import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";

export const quickTasks = pgTable("quick_tasks", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  message: text("message").notNull(),
  response: text("response"),
  status: text("status").notNull().default("pending"), // pending, running, completed, failed
  provider: text("provider").default("cloudflare"),
  sandboxId: text("sandbox_id"),
  sessionId: text("session_id"),
  templateId: text("template_id"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});
```

#### 1.3 Templates Table

**File:** `apps/api/src/db/schema/templates.ts`

```typescript
export const taskTemplates = pgTable("task_templates", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  icon: text("icon"), // emoji or icon name
  category: text("category").notNull(), // content, code, data, social
  prompt: text("prompt").notNull(), // Template with {{placeholders}}
  placeholders: jsonb("placeholders"), // [{ name: "topic", label: "Topic", type: "text" }]
  isSystem: boolean("is_system").default(false),
  userId: text("user_id").references(() => users.id), // null for system templates
  createdAt: timestamp("created_at").defaultNow(),
});
```

---

### Phase 2: Frontend Components (Day 2-3)

#### 2.1 Quick Task Store

**File:** `apps/frontend/src/lib/stores/quick-task.svelte.ts`

```typescript
/**
 * Quick Task Store
 * 
 * Manages the global quick task modal state and task execution.
 * Uses Svelte 5 runes for reactive state management.
 */

import { nanoid } from "nanoid";

// Types
export interface QuickTask {
  id: string;
  message: string;
  response: string;
  status: "pending" | "streaming" | "completed" | "failed";
  provider: "docker" | "cloudflare";
  templateId?: string;
  createdAt: Date;
  completedAt?: Date;
}

export interface TaskTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  prompt: string;
  placeholders: Array<{
    name: string;
    label: string;
    type: "text" | "textarea" | "select";
    options?: string[];
  }>;
}

// State
let isOpen = $state(false);
let isStreaming = $state(false);
let currentResponse = $state("");
let currentTask = $state<QuickTask | null>(null);
let history = $state<QuickTask[]>([]);
let templates = $state<TaskTemplate[]>([]);
let error = $state<string | null>(null);

// EventSource reference for cleanup
let eventSource: EventSource | null = null;

// Actions
export const quickTask = {
  // Getters
  get isOpen() { return isOpen; },
  get isStreaming() { return isStreaming; },
  get currentResponse() { return currentResponse; },
  get currentTask() { return currentTask; },
  get history() { return history; },
  get templates() { return templates; },
  get error() { return error; },
  
  // Modal control
  open() {
    isOpen = true;
    error = null;
  },
  
  close() {
    isOpen = false;
    this.cancel();
  },
  
  // Task execution
  async run(message: string, options?: { provider?: "docker" | "cloudflare"; templateId?: string }) {
    const taskId = nanoid();
    const provider = options?.provider ?? "cloudflare";
    
    // Create task record
    currentTask = {
      id: taskId,
      message,
      response: "",
      status: "pending",
      provider,
      templateId: options?.templateId,
      createdAt: new Date(),
    };
    
    isStreaming = true;
    currentResponse = "";
    error = null;
    
    try {
      // Start SSE stream
      const params = new URLSearchParams({
        message,
        provider,
        ...(options?.templateId && { templateId: options.templateId }),
      });
      
      eventSource = new EventSource(`/api/v2/agents/task/stream?${params}`);
      
      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        switch (data.type) {
          case "start":
            currentTask = { ...currentTask!, status: "streaming" };
            break;
            
          case "chunk":
            currentResponse += data.content;
            break;
            
          case "done":
            currentTask = {
              ...currentTask!,
              status: "completed",
              response: currentResponse,
              completedAt: new Date(),
            };
            history = [currentTask!, ...history.slice(0, 49)]; // Keep last 50
            isStreaming = false;
            eventSource?.close();
            eventSource = null;
            break;
            
          case "error":
            error = data.message;
            currentTask = { ...currentTask!, status: "failed" };
            isStreaming = false;
            eventSource?.close();
            eventSource = null;
            break;
        }
      };
      
      eventSource.onerror = () => {
        error = "Connection lost. Please try again.";
        isStreaming = false;
        eventSource?.close();
        eventSource = null;
      };
      
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to start task";
      isStreaming = false;
    }
  },
  
  // Cancel current task
  cancel() {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    isStreaming = false;
    if (currentTask?.status === "streaming") {
      currentTask = { ...currentTask, status: "failed" };
    }
  },
  
  // Load templates
  async loadTemplates() {
    try {
      const response = await fetch("/api/v2/agents/templates");
      templates = await response.json();
    } catch (e) {
      console.error("Failed to load templates:", e);
    }
  },
  
  // Load history
  async loadHistory() {
    try {
      const response = await fetch("/api/v2/agents/tasks?limit=50");
      const data = await response.json();
      history = data.tasks;
    } catch (e) {
      console.error("Failed to load history:", e);
    }
  },
  
  // Use a template
  applyTemplate(template: TaskTemplate, values: Record<string, string>): string {
    let prompt = template.prompt;
    for (const [key, value] of Object.entries(values)) {
      prompt = prompt.replace(new RegExp(`{{${key}}}`, "g"), value);
    }
    return prompt;
  },
  
  // Clear current response
  clear() {
    currentResponse = "";
    currentTask = null;
    error = null;
  },
};
```

#### 2.2 Quick Task Modal Component

**File:** `apps/frontend/src/lib/components/quick-task-modal.svelte`

```svelte
<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { Textarea } from "$lib/components/ui/textarea";
  import { quickTask, type TaskTemplate } from "$lib/stores/quick-task.svelte";
  import { cn } from "$lib/utils";
  
  // Icons
  import SparklesIcon from "@lucide/svelte/icons/sparkles";
  import SendIcon from "@lucide/svelte/icons/send";
  import CopyIcon from "@lucide/svelte/icons/copy";
  import XIcon from "@lucide/svelte/icons/x";
  import HistoryIcon from "@lucide/svelte/icons/history";
  import ZapIcon from "@lucide/svelte/icons/zap";
  import FileTextIcon from "@lucide/svelte/icons/file-text";
  import CodeIcon from "@lucide/svelte/icons/code";
  import ShareIcon from "@lucide/svelte/icons/share";
  import BarChartIcon from "@lucide/svelte/icons/bar-chart";
  
  // State
  let message = $state("");
  let showHistory = $state(false);
  let selectedTemplate = $state<TaskTemplate | null>(null);
  let copied = $state(false);
  
  // Template categories with icons
  const categoryIcons: Record<string, typeof SparklesIcon> = {
    content: FileTextIcon,
    code: CodeIcon,
    social: ShareIcon,
    data: BarChartIcon,
  };
  
  // Keyboard shortcut handler
  function handleKeydown(e: KeyboardEvent) {
    // Cmd/Ctrl+Enter to submit
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !quickTask.isStreaming) {
      e.preventDefault();
      handleSubmit();
    }
    // Escape to close
    if (e.key === "Escape") {
      quickTask.close();
    }
  }
  
  // Submit handler
  async function handleSubmit() {
    if (!message.trim() || quickTask.isStreaming) return;
    
    await quickTask.run(message, {
      templateId: selectedTemplate?.id,
    });
  }
  
  // Copy to clipboard
  async function copyResponse() {
    await navigator.clipboard.writeText(quickTask.currentResponse);
    copied = true;
    setTimeout(() => copied = false, 2000);
  }
  
  // Use template
  function useTemplate(template: TaskTemplate) {
    selectedTemplate = template;
    // If template has no placeholders, use it directly
    if (!template.placeholders?.length) {
      message = template.prompt;
    } else {
      // Show placeholder inputs (simplified: just use the prompt as-is for now)
      message = template.prompt;
    }
  }
  
  // Load from history
  function loadFromHistory(task: typeof quickTask.history[0]) {
    message = task.message;
    showHistory = false;
  }
  
  // Load templates on mount
  onMount(() => {
    quickTask.loadTemplates();
    quickTask.loadHistory();
  });
</script>

<Dialog.Root bind:open={quickTask.isOpen}>
  <Dialog.Content 
    class="max-w-3xl max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden"
    onkeydown={handleKeydown}
  >
    <!-- Header -->
    <div class="flex items-center justify-between px-6 py-4 border-b border-border/50">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--cyber-cyan)]/20 to-[var(--cyber-magenta)]/20 
                    flex items-center justify-center border border-[var(--cyber-cyan)]/30">
          <SparklesIcon class="w-4 h-4 text-[var(--cyber-cyan)]" />
        </div>
        <div>
          <Dialog.Title class="text-lg font-semibold">Quick AI Task</Dialog.Title>
          <Dialog.Description class="text-xs text-muted-foreground">
            Run AI tasks instantly • Powered by Cloudflare Edge
          </Dialog.Description>
        </div>
      </div>
      
      <div class="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          class="h-8 w-8"
          onclick={() => showHistory = !showHistory}
          title="Task History"
        >
          <HistoryIcon class="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          class="h-8 w-8"
          onclick={() => quickTask.close()}
        >
          <XIcon class="h-4 w-4" />
        </Button>
      </div>
    </div>
    
    <!-- Main Content -->
    <div class="flex flex-1 overflow-hidden">
      <!-- Left: Templates (optional sidebar) -->
      {#if quickTask.templates.length > 0 && !showHistory}
        <div class="w-48 border-r border-border/30 p-3 overflow-y-auto hidden md:block">
          <p class="text-xs font-mono uppercase text-muted-foreground mb-3 px-2">
            Templates
          </p>
          
          {#each quickTask.templates as template}
            {@const CategoryIcon = categoryIcons[template.category] || ZapIcon}
            <button
              onclick={() => useTemplate(template)}
              class={cn(
                "w-full text-left px-3 py-2 rounded-md text-sm mb-1 transition-colors",
                "hover:bg-muted/50",
                selectedTemplate?.id === template.id && "bg-[var(--cyber-cyan)]/10 text-[var(--cyber-cyan)]"
              )}
            >
              <div class="flex items-center gap-2">
                <span class="text-base">{template.icon}</span>
                <span class="truncate">{template.name}</span>
              </div>
            </button>
          {/each}
        </div>
      {/if}
      
      <!-- History Sidebar (toggle) -->
      {#if showHistory}
        <div class="w-64 border-r border-border/30 p-3 overflow-y-auto">
          <p class="text-xs font-mono uppercase text-muted-foreground mb-3 px-2">
            Recent Tasks
          </p>
          
          {#if quickTask.history.length === 0}
            <p class="text-sm text-muted-foreground px-2">No tasks yet</p>
          {:else}
            {#each quickTask.history as task}
              <button
                onclick={() => loadFromHistory(task)}
                class="w-full text-left p-2 rounded-md hover:bg-muted/50 mb-1"
              >
                <p class="text-xs font-mono text-muted-foreground mb-1">
                  {new Date(task.createdAt).toLocaleTimeString()}
                </p>
                <p class="text-sm truncate">{task.message}</p>
                <div class="flex items-center gap-2 mt-1">
                  <span class={cn(
                    "w-1.5 h-1.5 rounded-full",
                    task.status === "completed" && "bg-[var(--cyber-emerald)]",
                    task.status === "failed" && "bg-[var(--cyber-red)]",
                    task.status === "streaming" && "bg-[var(--cyber-amber)] animate-pulse"
                  )}></span>
                  <span class="text-[10px] text-muted-foreground">{task.provider}</span>
                </div>
              </button>
            {/each}
          {/if}
        </div>
      {/if}
      
      <!-- Center: Main Area -->
      <div class="flex-1 flex flex-col p-4 overflow-hidden">
        <!-- Input Area -->
        <div class="space-y-2 mb-4">
          <Textarea
            bind:value={message}
            placeholder="What do you need help with? (e.g., 'Write a tweet about...', 'Debug this error...', 'Analyze this data...')"
            rows={4}
            class="font-mono text-sm resize-none"
            disabled={quickTask.isStreaming}
          />
          <div class="flex items-center justify-between text-xs text-muted-foreground font-mono">
            <span>
              {#if selectedTemplate}
                Using: {selectedTemplate.name}
                <button onclick={() => selectedTemplate = null} class="ml-1 text-[var(--cyber-cyan)]">
                  (clear)
                </button>
              {:else}
                Cmd+Enter to send
              {/if}
            </span>
            <span>{message.length} chars</span>
          </div>
        </div>
        
        <!-- Response Area -->
        <div class="flex-1 overflow-y-auto min-h-0">
          {#if quickTask.error}
            <div class="cyber-card p-4 border-[var(--cyber-red)]/50 mb-4">
              <div class="flex items-center gap-2 text-[var(--cyber-red)]">
                <XIcon class="h-4 w-4" />
                <span class="text-sm">{quickTask.error}</span>
              </div>
            </div>
          {/if}
          
          {#if quickTask.currentResponse || quickTask.isStreaming}
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <h4 class="text-xs font-mono uppercase tracking-wider text-[var(--cyber-cyan)]">
                    Response
                  </h4>
                  {#if quickTask.isStreaming}
                    <span class="flex items-center gap-1 text-xs text-[var(--cyber-amber)]">
                      <span class="w-1.5 h-1.5 rounded-full bg-[var(--cyber-amber)] animate-pulse"></span>
                      Streaming...
                    </span>
                  {/if}
                </div>
                
                {#if quickTask.currentResponse}
                  <Button
                    size="sm"
                    variant="ghost"
                    onclick={copyResponse}
                    class="h-7 text-xs"
                  >
                    <CopyIcon class="h-3 w-3 mr-1" />
                    {copied ? "Copied!" : "Copy"}
                  </Button>
                {/if}
              </div>
              
              <div class="cyber-card p-4 max-h-64 overflow-y-auto">
                <pre class="text-sm font-mono whitespace-pre-wrap">{quickTask.currentResponse}{#if quickTask.isStreaming}<span class="typing-cursor"></span>{/if}</pre>
              </div>
            </div>
          {:else}
            <!-- Empty State -->
            <div class="flex flex-col items-center justify-center h-32 text-muted-foreground">
              <ZapIcon class="h-8 w-8 mb-2 opacity-30" />
              <p class="text-sm">Ask anything, get instant AI assistance</p>
            </div>
          {/if}
        </div>
      </div>
    </div>
    
    <!-- Footer -->
    <div class="flex items-center justify-between px-6 py-4 border-t border-border/50 bg-muted/30">
      <p class="text-xs text-muted-foreground font-mono">
        ⚡ Edge-powered • Auto-hibernates when idle
      </p>
      
      <div class="flex gap-2">
        {#if quickTask.isStreaming}
          <Button variant="destructive" onclick={() => quickTask.cancel()}>
            <XIcon class="h-4 w-4 mr-2" />
            Cancel
          </Button>
        {:else}
          <Button variant="ghost" onclick={() => quickTask.close()}>
            Close
          </Button>
          <Button 
            onclick={handleSubmit}
            disabled={!message.trim()}
            class="cyber-btn-primary"
          >
            <SendIcon class="h-4 w-4 mr-2" />
            Run Task
          </Button>
        {/if}
      </div>
    </div>
  </Dialog.Content>
</Dialog.Root>
```

#### 2.3 Global Keyboard Shortcut

**File:** `apps/frontend/src/routes/+layout.svelte` (modification)

Add to the existing layout:

```svelte
<script lang="ts">
  // ... existing imports ...
  import { quickTask } from "$lib/stores/quick-task.svelte";
  import QuickTaskModal from "$lib/components/quick-task-modal.svelte";
  
  // ... existing code ...
  
  onMount(async () => {
    // ... existing initialization ...
    
    // Global keyboard shortcut: Cmd/Ctrl+K for Quick Task
    function handleGlobalKeydown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        quickTask.open();
      }
    }
    
    window.addEventListener("keydown", handleGlobalKeydown);
    
    return () => {
      window.removeEventListener("keydown", handleGlobalKeydown);
    };
  });
</script>

<!-- Add modal to layout -->
<QuickTaskModal />
```

---

### Phase 3: Integration & Polish (Day 3-5)

#### 3.1 Homepage Quick Ask Button

**File:** `apps/frontend/src/routes/+page.svelte` (modification)

Add alongside the "New Project" button in header:

```svelte
<Button
  onclick={() => quickTask.open()}
  variant="outline"
  class="font-mono text-xs uppercase tracking-wider h-10"
>
  <SparklesIcon class="h-4 w-4 mr-2" /> Quick Ask
</Button>
```

#### 3.2 Bottom Nav Quick Action (Mobile)

**File:** `apps/frontend/src/lib/components/app-shell.svelte` (modification)

```svelte
<BottomNav>
  <BottomNavItem href="/" icon={Home} label="Home" badge={attentionCount} />
  <BottomNavItem onclick={() => quickTask.open()} icon={Sparkles} label="Ask" />
  <BottomNavItem href="/projects" icon={FolderKanban} label="Projects" />
  <BottomNavItem href="/settings" icon={Settings} label="Settings" />
</BottomNav>
```

#### 3.3 Default Templates (Seed Data)

```typescript
const defaultTemplates = [
  {
    id: "social-post",
    name: "Social Post",
    description: "Generate social media posts for different platforms",
    icon: "📱",
    category: "social",
    prompt: `Write social media posts about: {{topic}}

Create versions for:
- Twitter: Witty, under 280 characters, 1-2 hashtags
- LinkedIn: Professional tone, 2-3 paragraphs
- Mastodon: Community-focused, conversational`,
    placeholders: [{ name: "topic", label: "Topic", type: "text" }],
    isSystem: true,
  },
  {
    id: "code-review",
    name: "Code Review",
    description: "Get AI feedback on your code",
    icon: "🔍",
    category: "code",
    prompt: `Review this code and provide feedback:

\`\`\`
{{code}}
\`\`\`

Please check for:
- Bugs and potential issues
- Performance improvements
- Best practices
- Security concerns`,
    placeholders: [{ name: "code", label: "Code", type: "textarea" }],
    isSystem: true,
  },
  {
    id: "debug-error",
    name: "Debug Error",
    description: "Get help debugging an error",
    icon: "🐛",
    category: "code",
    prompt: `Help me debug this error:

{{error}}

Context: {{context}}

Please explain:
1. What's causing the error
2. How to fix it
3. How to prevent it in the future`,
    placeholders: [
      { name: "error", label: "Error message", type: "textarea" },
      { name: "context", label: "Context (optional)", type: "text" },
    ],
    isSystem: true,
  },
  {
    id: "summarize",
    name: "Summarize",
    description: "Summarize text or documents",
    icon: "📝",
    category: "content",
    prompt: `Summarize this content:

{{content}}

Provide:
- Key points (3-5 bullet points)
- Main takeaways
- Action items (if any)`,
    placeholders: [{ name: "content", label: "Content", type: "textarea" }],
    isSystem: true,
  },
  {
    id: "explain-concept",
    name: "Explain Concept",
    description: "Get a clear explanation of any concept",
    icon: "💡",
    category: "content",
    prompt: `Explain {{concept}} in simple terms.

Include:
- A clear definition
- An analogy or real-world example
- When/why it's used
- Common misconceptions`,
    placeholders: [{ name: "concept", label: "Concept", type: "text" }],
    isSystem: true,
  },
];
```

---

## Testing Checklist

### Unit Tests

- [ ] Quick task store state management
- [ ] Template placeholder substitution
- [ ] History management (max 50 items)
- [ ] SSE event parsing

### Integration Tests

- [ ] Streaming endpoint returns valid SSE
- [ ] Task history persists to database
- [ ] Template loading from API
- [ ] Error handling and recovery

### E2E Tests

- [ ] Cmd+K opens modal
- [ ] Message submission starts streaming
- [ ] Response displays in real-time
- [ ] Copy button works
- [ ] Cancel stops streaming
- [ ] History shows recent tasks
- [ ] Templates populate input

### Manual Testing

- [ ] Modal responsive on mobile
- [ ] Keyboard navigation works
- [ ] Loading states are smooth
- [ ] Error messages are helpful
- [ ] Performance is acceptable

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Time to first response | < 2s | Performance monitoring |
| Task completion rate | > 90% | Task status tracking |
| Daily active users using Quick Task | > 30% of DAU | Analytics |
| Template usage | > 50% of tasks | Task metadata |
| User satisfaction | > 4/5 | Optional feedback prompt |

---

## Future Enhancements

### Phase 2 (Week 2)
- [ ] File upload support (drag & drop)
- [ ] Send response to sandbox
- [ ] Custom templates (user-created)
- [ ] Response formatting (markdown)

### Phase 3 (Week 3)
- [ ] Snapshot/rollback for safety
- [ ] Job queue for long tasks
- [ ] Scheduled tasks (cron)
- [ ] Multi-step workflows

### Phase 4 (Month 2)
- [ ] Voice input (mobile)
- [ ] Share task results
- [ ] Team templates
- [ ] Usage analytics dashboard

---

## References

- [Cloudflare Use Cases](../ideas/opencode-cloudflare-use-cases.md)
- [Cloudflare Integration](../ideas/cloudflare-sandbox-integration.md)
- [Vercel AI SDK Streaming](https://sdk.vercel.ai/docs)
- [Hono SSE](https://hono.dev/helpers/streaming)
- [Svelte 5 Runes](https://svelte-5-preview.vercel.app/docs/runes)
