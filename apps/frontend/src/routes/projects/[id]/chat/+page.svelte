<script lang="ts">
  import { page } from "$app/stores";
  import { sveltify } from "svelte-preprocess-react";
  import { RuntimeProvider } from "$lib/chat/RuntimeProvider";
  import { ChatThread } from "$lib/chat/ChatThread";
  import { Button } from "$lib/components/ui/button";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import FilePickerModal from "$lib/components/file-picker-modal.svelte";
  import ModelSelector from "$lib/components/model-selector.svelte";
  import AssistantPicker from "$lib/components/assistant-picker.svelte";
  import ModePicker from "$lib/components/mode-picker.svelte";
  import {
    sandboxOpencodeListSessions,
    sandboxOpencodeCreateSession,
    sandboxOpencodeDeleteSession,
    sandboxOpencodeFindFiles,
    type Session,
    type ModelSelection,
  } from "$lib/api/tauri";
  import { assistantsStore } from "$lib/stores/assistants.svelte";
  import { confirm } from "@tauri-apps/plugin-dialog";

  // File finder wrapper for ChatThread (uses sandboxId, same as projectId in URL)
  async function findFiles(sandboxId: string, pattern: string): Promise<string[]> {
    try {
      return await sandboxOpencodeFindFiles(sandboxId, pattern);
    } catch (err) {
      console.error("Failed to find files:", err);
      return [];
    }
  }

  // File picker modal state
  let filePickerOpen = $state(false);
  let pendingFilePath = $state<string | null>(null);

  function handleFilePickerRequest() {
    filePickerOpen = true;
  }

  function handleFileSelect(filePath: string) {
    pendingFilePath = filePath;
  }

  function clearPendingFilePath() {
    pendingFilePath = null;
  }

  // Wrap React components for use in Svelte
  const react = sveltify({ RuntimeProvider, ChatThread });

  // Get project ID from route params
  let projectId = $derived($page.params.id ?? "");

  // Check for file param in URL (from "Use in Chat" button in file browser)
  $effect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const fileParam = urlParams.get("file");
    if (fileParam && !pendingFilePath) {
      pendingFilePath = fileParam;
      // Clean up the URL
      window.history.replaceState({}, "", window.location.pathname);
    }
  });

  // Session state
  let sessions = $state<Session[]>([]);
  let selectedSessionId = $state<string | null>(null);
  let isLoading = $state(true);
  let isCreating = $state(false);
  let error = $state<string | null>(null);

  // Model selection state
  let selectedModel = $state<ModelSelection | undefined>(undefined);
  
  // Track which session's model we've loaded to avoid re-detecting
  let modelLoadedForSession = $state<string | null>(null);
  
  // AI Assistant selection state
  let selectedAssistantId = $state<string>(assistantsStore.defaultId || "opencode");
  let selectedModeId = $state<string>("default");
  
  // Reset model when session changes so it can be detected from the new session's messages
  $effect(() => {
    if (selectedSessionId && selectedSessionId !== modelLoadedForSession) {
      // New session selected, reset model to allow detection
      selectedModel = undefined;
      modelLoadedForSession = null;
    }
  });
  
  // Callback when RuntimeProvider detects model from existing session messages
  function handleSessionModelDetected(model: ModelSelection) {
    // Only update if we haven't already loaded model for this session
    if (selectedSessionId && modelLoadedForSession !== selectedSessionId) {
      selectedModel = model;
      modelLoadedForSession = selectedSessionId;
    }
  }

  // Load sessions when project changes
  $effect(() => {
    if (projectId) {
      loadSessions();
    }
  });

  async function loadSessions() {
    isLoading = true;
    error = null;
    try {
      // projectId is actually sandboxId in v2 API
      sessions = await sandboxOpencodeListSessions(projectId);
      // Auto-select the most recent session if none selected
      if (!selectedSessionId && sessions.length > 0) {
        selectedSessionId = sessions[0].id;
      }
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to load sessions";
      console.error("Failed to load sessions:", err);
    } finally {
      isLoading = false;
    }
  }

  async function createNewSession() {
    isCreating = true;
    try {
      // projectId is actually sandboxId in v2 API
      const session = await sandboxOpencodeCreateSession(projectId);
      sessions = [session, ...sessions];
      selectedSessionId = session.id;
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to create session";
      console.error("Failed to create session:", err);
    } finally {
      isCreating = false;
    }
  }

  async function deleteSession(sessionId: string) {
    const shouldDelete = await confirm("Delete this session? This cannot be undone.", {
      title: "Delete Session",
      kind: "warning",
    });
    
    if (!shouldDelete) return;

    try {
      // projectId is actually sandboxId in v2 API
      await sandboxOpencodeDeleteSession(projectId, sessionId);
      sessions = sessions.filter((s) => s.id !== sessionId);
      // If we deleted the selected session, select another
      if (selectedSessionId === sessionId) {
        selectedSessionId = sessions.length > 0 ? sessions[0].id : null;
      }
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to delete session";
      console.error("Failed to delete session:", err);
    }
  }

  function formatDate(timestamp?: number): string {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }

  function getSessionTitle(session: Session): string {
    if (session.title) return session.title;
    // Fallback to truncated ID
    return `Session ${session.id.slice(-6)}`;
  }
</script>

{#if projectId}
  <div class="flex h-[calc(100vh-200px)] min-h-[400px]">
    <!-- Session Sidebar -->
    <div class="w-64 border-r bg-muted/30 flex flex-col">
      <!-- Header -->
      <div class="p-3 border-b flex items-center justify-between">
        <h3 class="font-semibold text-sm">Sessions</h3>
        <Button
          size="sm"
          variant="outline"
          onclick={createNewSession}
          disabled={isCreating}
        >
          {isCreating ? "..." : "+ New"}
        </Button>
      </div>

      <!-- Session List -->
      <div class="flex-1 overflow-y-auto">
        {#if isLoading}
          <div class="p-3 space-y-2">
            {#each [1, 2, 3] as _}
              <Skeleton class="h-14 w-full" />
            {/each}
          </div>
        {:else if error}
          <div class="p-3 text-sm text-destructive">{error}</div>
        {:else if sessions.length === 0}
          <div class="p-3 text-sm text-muted-foreground text-center">
            <p>No sessions yet</p>
            <p class="mt-1">Click "+ New" to start</p>
          </div>
        {:else}
          <div class="p-2 space-y-1">
            {#each sessions as session (session.id)}
              <div
                class="w-full text-left p-2 rounded-md text-sm transition-colors group cursor-pointer
                  {selectedSessionId === session.id
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted'}"
                onclick={() => (selectedSessionId = session.id)}
                onkeydown={(e) => e.key === 'Enter' && (selectedSessionId = session.id)}
                role="button"
                tabindex="0"
              >
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0 flex-1">
                    <div class="font-medium truncate">
                      {getSessionTitle(session)}
                    </div>
                    <div
                      class="text-xs truncate
                        {selectedSessionId === session.id
                          ? 'text-primary-foreground/70'
                          : 'text-muted-foreground'}"
                    >
                      {formatDate(session.time?.updated || session.time?.created)}
                    </div>
                  </div>
                  <button
                    class="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/20 text-xs
                      {selectedSessionId === session.id
                        ? 'text-primary-foreground hover:text-destructive'
                        : 'text-muted-foreground hover:text-destructive'}"
                    onclick={(e) => {
                      e.stopPropagation();
                      deleteSession(session.id);
                    }}
                    title="Delete session"
                  >
                    ✕
                  </button>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Footer with refresh -->
      <div class="p-2 border-t">
        <Button
          size="sm"
          variant="ghost"
          class="w-full text-xs"
          onclick={loadSessions}
          disabled={isLoading}
        >
          {isLoading ? "Loading..." : "Refresh"}
        </Button>
      </div>
    </div>

    <!-- Chat Area -->
    <div class="flex-1 flex flex-col">
      {#if selectedSessionId}
        <!-- Chat Header with Assistant, Mode, and Model Selectors -->
        <div class="border-b px-4 py-2 flex items-center justify-between bg-muted/30">
          <div class="flex items-center gap-4">
            <!-- AI Assistant Selector -->
            <div class="flex items-center gap-2">
              <span class="text-xs text-muted-foreground">AI:</span>
              <AssistantPicker
                bind:value={selectedAssistantId}
                compact={true}
              />
            </div>
            
            <!-- Mode Selector -->
            <div class="flex items-center gap-2">
              <span class="text-xs text-muted-foreground">Mode:</span>
              <ModePicker
                assistantId={selectedAssistantId}
                sandboxId={projectId}
                bind:value={selectedModeId}
                compact={true}
              />
            </div>
            
            <!-- Separator -->
            <div class="h-4 w-px bg-border"></div>
            
            <!-- Model Selector -->
            <div class="flex items-center gap-2">
              <span class="text-xs text-muted-foreground">Model:</span>
              <ModelSelector 
                {projectId}
                bind:selectedModel
                compact={true}
              />
            </div>
          </div>
        </div>
        
        {#key selectedSessionId}
          <react.RuntimeProvider 
            {projectId} 
            sessionId={selectedSessionId} 
            {selectedModel}
            onSessionModelDetected={handleSessionModelDetected}
          >
            <react.ChatThread 
              {projectId} 
              {findFiles} 
              onFilePickerRequest={handleFilePickerRequest}
              {pendingFilePath}
              onPendingFilePathClear={clearPendingFilePath}
            />
          </react.RuntimeProvider>
        {/key}
      {:else}
        <div class="flex-1 flex items-center justify-center">
          <div class="text-center text-muted-foreground">
            <p class="text-lg">No session selected</p>
            <p class="text-sm mt-1">Create a new session to start chatting</p>
            <Button class="mt-4" onclick={createNewSession} disabled={isCreating}>
              {isCreating ? "Creating..." : "Create Session"}
            </Button>
          </div>
        </div>
      {/if}
    </div>
  </div>
{:else}
  <div class="flex items-center justify-center h-[calc(100vh-200px)]">
    <p class="text-muted-foreground">Loading...</p>
  </div>
{/if}

<!-- File Picker Modal -->
<FilePickerModal
  {projectId}
  open={filePickerOpen}
  onOpenChange={(open) => (filePickerOpen = open)}
  onSelect={handleFileSelect}
/>
