<script lang="ts">
  import { page } from "$app/stores";
  import { onMount } from "svelte";
  import { untrack } from "svelte";
  import { sveltify } from "svelte-preprocess-react";
  import { RuntimeProvider } from "$lib/chat/RuntimeProvider";
  import { ChatThread } from "$lib/chat/ChatThread";
  import { Button } from "$lib/components/ui/button";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import FilePickerModal from "$lib/components/file-picker-modal.svelte";
  import ModelSelector from "$lib/components/model-selector.svelte";
  import AgentSelector from "$lib/components/agent-selector.svelte";
  import OnboardingBanner from "$lib/components/onboarding-banner.svelte";
  import {
    sandboxOpencodeListSessions,
    sandboxOpencodeCreateSession,
    sandboxOpencodeDeleteSession,
    sandboxOpencodeFindFiles,
    type Session,
    type ModelSelection,
  } from "$lib/api/tauri";
  import { confirm } from "@tauri-apps/plugin-dialog";
  import { toast } from "svelte-sonner";
import {
    onboarding,
    fetchOnboardingSession,
    startOnboarding,
    skipOnboarding,
    clearError,
  } from "$lib/stores/onboarding.svelte";

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

  // Agent selection state
  let selectedAgent = $state<string | undefined>(undefined);
  
  // Track which session's agent we've loaded to avoid re-detecting
  let agentLoadedForSession = $state<string | null>(null);
  
  // Pending onboarding message to send via RuntimeProvider
  let pendingOnboardingMessage = $state<{ text: string; agent?: string } | undefined>(undefined);
  
  // Reset agent when session changes so it can be detected from the new session's messages
  // For child sessions, use the agent extracted from the session title
  $effect(() => {
    if (selectedSessionId && selectedSessionId !== agentLoadedForSession) {
      // New session selected, reset agent to allow detection
      selectedAgent = undefined;
      agentLoadedForSession = null;
    }
  });

  // For child sessions, set agent from title immediately when session data is available
  $effect(() => {
    if (isChildSession && childSessionAgent && agentLoadedForSession !== selectedSessionId) {
      selectedAgent = childSessionAgent;
      agentLoadedForSession = selectedSessionId;
    }
  });
  
  // Callback when RuntimeProvider detects agent from existing session messages
  function handleSessionAgentDetected(agent: string) {
    // Only update if we haven't already loaded agent for this session
    // and it's not a child session (child sessions get agent from title)
    if (selectedSessionId && agentLoadedForSession !== selectedSessionId && !isChildSession) {
      selectedAgent = agent;
      agentLoadedForSession = selectedSessionId;
    }
  }

  // Load sessions and onboarding status when project changes
  $effect(() => {
    if (projectId) {
      // Use untrack to prevent state updates inside these async functions
      // from causing the effect to re-run
      untrack(() => {
        loadSessions();
        fetchOnboardingSession(projectId);
      });
    }
  });

  // Onboarding handlers with toast notifications
  async function handleStartOnboarding() {
    const success = await startOnboarding(projectId);
    if (success) {
      // Set pending message to be sent by RuntimeProvider when it's ready
      if (selectedSessionId) {
        const onboardingAgent = "manage";
        pendingOnboardingMessage = {
          text: "Start the workspace setup and help me configure this project.",
          agent: onboardingAgent,
        };
        // Update the agent dropdown to reflect the agent being used
        selectedAgent = onboardingAgent;
        toast.info("Setup started", {
          description: "The onboarding assistant is ready to help configure your workspace.",
        });
      } else {
        toast.info("Setup ready", {
          description: "Create a session first, then click 'Start Setup' again.",
        });
      }
    }
  }
  
  // Callback when pending onboarding message has been sent
  function handlePendingOnboardingMessageSent() {
    pendingOnboardingMessage = undefined;
  }

  async function handleSkipOnboarding() {
    const success = await skipOnboarding(projectId);
    if (success) {
      toast.success("Setup skipped", {
        description: "You can configure your workspace anytime in settings.",
      });
    }
  }

  function handleDismissError() {
    clearError(projectId);
  }

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

  // Hierarchical session organization
  // Top-level sessions are those without a parentID
  let topLevelSessions = $derived(
    sessions.filter(s => !s.parentID)
  );

  // Get the currently selected session object
  let selectedSession = $derived(
    selectedSessionId ? sessions.find(s => s.id === selectedSessionId) : undefined
  );

  // Check if current session is a child (subagent) session
  let isChildSession = $derived(!!selectedSession?.parentID);

  // Extract agent from session title pattern like "... (@agentname subagent)"
  // Returns undefined if no agent pattern found
  function extractAgentFromTitle(title?: string): string | undefined {
    if (!title) return undefined;
    // Match pattern like (@onboarding subagent) or (@build) at end of title
    const match = title.match(/@(\w+)(?:\s+subagent)?\s*\)?$/i);
    return match?.[1]?.toLowerCase();
  }

  // For child sessions, extract agent from title
  let childSessionAgent = $derived(
    isChildSession ? extractAgentFromTitle(selectedSession?.title) : undefined
  );

  // Map of parent session ID to its child sessions
  let childSessionsMap = $derived(
    sessions.reduce((acc, s) => {
      if (s.parentID) {
        if (!acc[s.parentID]) {
          acc[s.parentID] = [];
        }
        acc[s.parentID].push(s);
      }
      return acc;
    }, {} as Record<string, Session[]>)
  );

  // Track which parent sessions are expanded (show children)
  let expandedSessions = $state<Set<string>>(new Set());

  function toggleSessionExpanded(sessionId: string) {
    if (expandedSessions.has(sessionId)) {
      expandedSessions = new Set([...expandedSessions].filter(id => id !== sessionId));
    } else {
      expandedSessions = new Set([...expandedSessions, sessionId]);
    }
  }

  function hasChildren(sessionId: string): boolean {
    return (childSessionsMap[sessionId]?.length ?? 0) > 0;
  }

  function getChildCount(sessionId: string): number {
    return childSessionsMap[sessionId]?.length ?? 0;
  }

  // Get child sessions for the currently selected session (for ChatThread to match task tool calls)
  let currentSessionChildren = $derived(
    selectedSessionId 
      ? (childSessionsMap[selectedSessionId] ?? []).map(s => ({
          id: s.id,
          title: s.title,
          createdAt: s.time?.created,
        }))
      : []
  );

  // Auto-expand parent when selecting a child session
  $effect(() => {
    if (selectedSessionId) {
      const selectedSession = sessions.find(s => s.id === selectedSessionId);
      if (selectedSession?.parentID && !expandedSessions.has(selectedSession.parentID)) {
        expandedSessions = new Set([...expandedSessions, selectedSession.parentID]);
      }
    }
  });

  // Handler for navigating to a session from chat (e.g., clicking on task tool result)
  function handleSessionSelect(sessionId: string) {
    selectedSessionId = sessionId;
    // The $effect above will auto-expand the parent if needed
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
            {#each topLevelSessions as session (session.id)}
              <!-- Parent/Top-level Session -->
              <div>
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
                    <!-- Expand/Collapse button for sessions with children -->
                    {#if hasChildren(session.id)}
                      <button
                        class="p-0.5 -ml-1 rounded hover:bg-black/10 dark:hover:bg-white/10 flex-shrink-0 mt-0.5
                          {selectedSessionId === session.id ? 'text-primary-foreground' : 'text-muted-foreground'}"
                        onclick={(e) => {
                          e.stopPropagation();
                          toggleSessionExpanded(session.id);
                        }}
                        title={expandedSessions.has(session.id) ? "Collapse" : "Expand"}
                      >
                        <span class="text-xs inline-block transition-transform {expandedSessions.has(session.id) ? 'rotate-90' : ''}">
                          ▶
                        </span>
                      </button>
                    {/if}
                    <div class="min-w-0 flex-1">
                      <div class="font-medium truncate flex items-center gap-1">
                        {getSessionTitle(session)}
                        {#if hasChildren(session.id)}
                          <span class="text-xs opacity-60">({getChildCount(session.id)})</span>
                        {/if}
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

                <!-- Child Sessions (nested) -->
                {#if hasChildren(session.id) && expandedSessions.has(session.id)}
                  <div class="ml-3 pl-2 border-l border-muted-foreground/20 space-y-1 mt-1">
                    {#each childSessionsMap[session.id] as childSession (childSession.id)}
                      <div
                        class="w-full text-left p-2 rounded-md text-sm transition-colors group cursor-pointer
                          {selectedSessionId === childSession.id
                            ? 'bg-primary text-primary-foreground'
                            : 'hover:bg-muted'}"
                        onclick={() => (selectedSessionId = childSession.id)}
                        onkeydown={(e) => e.key === 'Enter' && (selectedSessionId = childSession.id)}
                        role="button"
                        tabindex="0"
                      >
                        <div class="flex items-start justify-between gap-2">
                          <div class="min-w-0 flex-1">
                            <div class="font-medium truncate flex items-center gap-1">
                              <span class="text-xs opacity-60">↳</span>
                              {getSessionTitle(childSession)}
                            </div>
                            <div
                              class="text-xs truncate
                                {selectedSessionId === childSession.id
                                  ? 'text-primary-foreground/70'
                                  : 'text-muted-foreground'}"
                            >
                              {formatDate(childSession.time?.updated || childSession.time?.created)}
                            </div>
                          </div>
                          <button
                            class="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/20 text-xs
                              {selectedSessionId === childSession.id
                                ? 'text-primary-foreground hover:text-destructive'
                                : 'text-muted-foreground hover:text-destructive'}"
                            onclick={(e) => {
                              e.stopPropagation();
                              deleteSession(childSession.id);
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
        <!-- Model & Agent Selector Header -->
        <div class="border-b px-4 py-2 flex items-center justify-between bg-muted/30">
          <div class="flex items-center gap-4">
            <div class="flex items-center gap-2">
              <span class="text-xs text-muted-foreground">Model:</span>
              <ModelSelector 
                {projectId}
                bind:selectedModel
                compact={true}
              />
            </div>
            <div class="flex items-center gap-2">
              <span class="text-xs text-muted-foreground">Agent:</span>
              <AgentSelector 
                {projectId}
                bind:selectedAgent
                compact={true}
                disabled={isChildSession}
              />
              {#if isChildSession}
                <span class="text-xs text-muted-foreground italic">(subagent)</span>
              {/if}
            </div>
          </div>
        </div>
        
        <!-- Onboarding Banner -->
        {@const onboardingStatus = onboarding.getStatus(projectId)}
        {#if onboardingStatus && !onboarding.isComplete(projectId)}
          <div class="px-4 py-2 border-b">
            <OnboardingBanner
              status={onboardingStatus}
              isLoading={onboarding.isLoading(projectId)}
              error={onboarding.getError(projectId)}
              onStart={handleStartOnboarding}
              onSkip={handleSkipOnboarding}
              onDismissError={handleDismissError}
            />
          </div>
        {/if}
        
        {#key selectedSessionId}
          <react.RuntimeProvider 
            {projectId} 
            sessionId={selectedSessionId} 
            {selectedModel}
            {selectedAgent}
            onSessionModelDetected={handleSessionModelDetected}
            onSessionAgentDetected={handleSessionAgentDetected}
            pendingMessage={pendingOnboardingMessage}
            onPendingMessageSent={handlePendingOnboardingMessageSent}
          >
            <react.ChatThread 
              {projectId} 
              {findFiles} 
              onFilePickerRequest={handleFilePickerRequest}
              {pendingFilePath}
              onPendingFilePathClear={clearPendingFilePath}
              onSessionSelect={handleSessionSelect}
              childSessions={currentSessionChildren}
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
{/if}

<!-- File Picker Modal -->
<FilePickerModal
  {projectId}
  open={filePickerOpen}
  onOpenChange={(open) => (filePickerOpen = open)}
  onSelect={handleFileSelect}
/>
