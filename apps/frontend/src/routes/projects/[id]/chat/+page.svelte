<script lang="ts">
  import { page } from "$app/stores";
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
  import SandboxNotRunning from "$lib/components/sandbox-not-running.svelte";
  import { X, Menu, RefreshCw, CornerDownRight } from "@lucide/svelte";
  import { sandboxes } from "$lib/stores/sandboxes.svelte";
import {
    sandboxOpencodeListSessions,
    sandboxOpencodeCreateSession,
    sandboxOpencodeDeleteSession,
    sandboxOpencodeFindFiles,
    sandboxOpencodeGetAgents,
    sandboxOpencodeGetProviders,
    type Session,
    type ModelSelection,
    type OpenCodeAgent,
    type OpenCodeProvider,
  } from "$lib/api/tauri";
  import { confirm } from "@tauri-apps/plugin-dialog";
  import { toast } from "svelte-sonner";
import {
    onboarding,
    fetchOnboardingSession,
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

  // Get sandbox and check if running
  let sandbox = $derived(projectId ? sandboxes.list.find(s => s.id === projectId) : undefined);
  let isRunning = $derived(sandbox?.status === "running");

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

  // Agents list (loaded at page level for keyboard shortcut cycling)
  let agents = $state<OpenCodeAgent[]>([]);
  let agentAnimationTrigger = $state(0);

  // Filter to primary agents only
  let primaryAgents = $derived(
    agents.filter(agent => agent.mode === "primary" || agent.mode === "all")
  );

  // Load agents when project changes
  async function loadAgents() {
    if (!projectId) return;
    try {
      agents = await sandboxOpencodeGetAgents(projectId);
      // Auto-select default agent if none selected
      if (!selectedAgent && primaryAgents.length > 0) {
        const buildAgent = primaryAgents.find(a => a.name.toLowerCase() === "build");
        selectedAgent = buildAgent?.name ?? primaryAgents[0].name;
      }
    } catch (err) {
      console.error("Failed to load agents:", err);
    }
  }

  // Providers list (loaded at page level for keyboard shortcut model cycling)
  let providers = $state<OpenCodeProvider[]>([]);
  let modelAnimationTrigger = $state(0);

  // Flattened list of all models for easy cycling
  let allModels = $derived(
    providers.flatMap(provider =>
      provider.models.map(model => ({
        providerId: provider.id,
        modelId: model.id,
        displayName: `${provider.name} / ${model.name}`,
      }))
    )
  );

  // Load providers when project changes
  async function loadProviders() {
    if (!projectId) return;
    try {
      providers = await sandboxOpencodeGetProviders(projectId);
      // Auto-select first model if none selected
      if (!selectedModel && providers.length > 0 && providers[0].models.length > 0) {
        selectedModel = {
          providerId: providers[0].id,
          modelId: providers[0].models[0].id,
        };
      }
    } catch (err) {
      console.error("Failed to load providers:", err);
    }
  }

  // Pending onboarding message to send via RuntimeProvider
  // Includes the target sessionId to prevent sending to wrong session
  let pendingOnboardingMessage = $state<{ text: string; agent?: string; sessionId: string } | undefined>(undefined);

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

  // Load sessions, onboarding status, agents, and providers when project changes
  $effect(() => {
    if (projectId) {
      // Reset banner dismissed state when project changes
      onboardingBannerDismissed = false;

      // Use untrack to prevent state updates inside these async functions
      // from causing the effect to re-run
      untrack(() => {
        loadSessions();
        loadAgents();
        loadProviders();
        fetchOnboardingSession(projectId);
      });
    }
  });

  // Local state to track if banner has been dismissed (for immediate UX feedback)
  let onboardingBannerDismissed = $state(false);

  // Onboarding handlers with toast notifications
  async function handleStartOnboarding() {
    // Dismiss banner immediately (local state for instant UX feedback)
    onboardingBannerDismissed = true;

    // Set pending message to be sent by RuntimeProvider when it's ready
    if (selectedSessionId) {
      const onboardingAgent = "manage";
      pendingOnboardingMessage = {
        text: "Start the workspace setup and help me configure this project.",
        agent: onboardingAgent,
        sessionId: selectedSessionId, // Track which session this message is for
      };
      // Update the agent dropdown to reflect the agent being used
      selectedAgent = onboardingAgent;
      toast.info("Setup started", {
        description: "The onboarding assistant is ready to help configure your workspace.",
      });

      // Mark as skipped in backend (non-blocking)
      skipOnboarding(projectId);
    } else {
      toast.info("Setup ready", {
        description: "Create a session first, then click 'Start Setup' again.",
      });
    }
  }

  // Callback when pending onboarding message has been sent
  function handlePendingOnboardingMessageSent() {
    pendingOnboardingMessage = undefined;
  }

  async function handleSkipOnboarding() {
    // Dismiss banner immediately (local state for instant UX feedback)
    onboardingBannerDismissed = true;

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
      console.log("[Chat] Created new session:", session.id);

      // Check if session was already added by SSE event (race condition)
      const alreadyExists = sessions.some(s => s.id === session.id);
      if (!alreadyExists) {
        sessions = [session, ...sessions];
      } else {
        console.log("[Chat] Session already in list from SSE event");
      }

      // Always select the new session
      selectedSessionId = session.id;
      console.log("[Chat] Selected session:", selectedSessionId);
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
      // When collapsing, check if a child session is currently selected
      const childSessions = childSessionsMap[sessionId] ?? [];
      const isChildSelected = childSessions.some(child => child.id === selectedSessionId);

      // If a child is selected, switch to the parent session before collapsing
      if (isChildSelected) {
        selectedSessionId = sessionId;
      }

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

  // Handler for when a new session is created (e.g., child session from task tool)
  // This updates the sessions list in real-time without needing a manual refresh
  // We use setTimeout to defer the update to avoid race conditions
  function handleSessionCreated(newSession: Session) {
    // Defer update to next tick to avoid race conditions
    setTimeout(() => {
      // Check if session already exists (avoid duplicates)
      if (sessions.some(s => s.id === newSession.id)) {
        return;
      }

      console.log("[Chat] New session created:", newSession.id, newSession.title);

      // Add the new session to the list
      sessions = [newSession, ...sessions];

      // If it's a child session, auto-expand the parent
      if (newSession.parentID && !expandedSessions.has(newSession.parentID)) {
        expandedSessions = new Set([...expandedSessions, newSession.parentID]);
      }
    }, 0);
  }

  // Handler for when a session is updated (e.g., title changed)
  // This updates the sessions list in real-time without needing a manual refresh
  // NOTE: This should only UPDATE existing sessions, not add new ones.
  // New sessions are handled by createNewSession (manual) or handleSessionCreated (child sessions)
  // We use setTimeout to defer the update to avoid race conditions with createNewSession
  function handleSessionUpdated(updatedSession: Session) {
    // Defer update to next tick to avoid race conditions with createNewSession
    setTimeout(() => {
      console.log("[Chat] Session updated:", updatedSession.id, updatedSession.title);

      // Only update if session exists - don't add new sessions here
      // This prevents race conditions with createNewSession
      const sessionExists = sessions.some(s => s.id === updatedSession.id);

      if (sessionExists) {
        // Update existing session
        sessions = sessions.map(s =>
          s.id === updatedSession.id
            ? { ...s, ...updatedSession }
            : s
        );
      } else {
        // Session not in list - this is expected for newly created sessions
        // The session will be added by createNewSession or handleSessionCreated
        console.log("[Chat] Session update received for unknown session (will be added by creator):", updatedSession.id);
      }
    }, 0);
  }

  // Agent cycling with keyboard shortcuts (Cmd+, for previous, Cmd+. for next)
  function cycleAgent(direction: 1 | -1) {
    if (primaryAgents.length === 0) return;

    const currentIndex = primaryAgents.findIndex(a => a.name === selectedAgent);
    let newIndex: number;

    if (currentIndex === -1) {
      newIndex = 0;
    } else {
      newIndex = (currentIndex + direction + primaryAgents.length) % primaryAgents.length;
    }

    selectedAgent = primaryAgents[newIndex].name;
    agentAnimationTrigger++; // Trigger animation in AgentSelector
  }

  // Model cycling with keyboard shortcuts (Alt+, for previous, Alt+. for next)
  function cycleModel(direction: 1 | -1) {
    if (allModels.length === 0) return;

    // Find current model index
    const currentIndex = allModels.findIndex(m =>
      m.providerId === selectedModel?.providerId && m.modelId === selectedModel?.modelId
    );
    let newIndex: number;

    if (currentIndex === -1) {
      newIndex = 0;
    } else {
      newIndex = (currentIndex + direction + allModels.length) % allModels.length;
    }

    const newModel = allModels[newIndex];
    selectedModel = {
      providerId: newModel.providerId,
      modelId: newModel.modelId,
    };
    modelAnimationTrigger++; // Trigger animation in ModelSelector
  }

  function handleGlobalKeyDown(e: KeyboardEvent) {
    // Handle model cycling with Alt+, and Alt+.
    // On Mac, Alt+, produces '≤' and Alt+. produces '≥', so we check for both
    if (e.altKey && !e.metaKey && !e.ctrlKey) {
      if ((e.key === ',' || e.key === '≤') && allModels.length > 0) {
        e.preventDefault();
        cycleModel(-1); // Previous model
        return;
      } else if ((e.key === '.' || e.key === '≥') && allModels.length > 0) {
        e.preventDefault();
        cycleModel(1); // Next model
        return;
      }
    }

    // Handle agent cycling with Cmd/Ctrl+, and Cmd/Ctrl+.
    // Only handle if we have agents and agent switching is not disabled
    if (primaryAgents.length === 0) return;
    if (isChildSession) return; // Agent switching disabled for child sessions

    const isMeta = e.metaKey || e.ctrlKey; // Support both Mac (Cmd) and Windows/Linux (Ctrl)

    if (isMeta && e.key === ',') {
      e.preventDefault();
      cycleAgent(-1); // Previous agent
    } else if (isMeta && e.key === '.') {
      e.preventDefault();
      cycleAgent(1); // Next agent
    }
  }

  // Sidebar collapse state
  let sidebarCollapsed = $state(false);
</script>

<svelte:window on:keydown={handleGlobalKeyDown} />

{#if projectId}
  {#if !sandbox}
    <!-- Loading State -->
    <div class="h-[calc(100vh-140px)] min-h-[500px] flex items-center justify-center animate-fade-in">
      <div class="text-center animate-fade-in-up">
        <div class="relative mx-auto w-16 h-16">
          <div class="absolute inset-0 rounded-full border-2 border-[var(--cyber-cyan)]/20"></div>
          <div class="absolute inset-0 rounded-full border-2 border-transparent border-t-[var(--cyber-cyan)] animate-spin"></div>
          <div class="absolute inset-0 flex items-center justify-center">
            <div class="w-2 h-2 rounded-full bg-[var(--cyber-cyan)] animate-pulse-dot"></div>
          </div>
        </div>
        <p class="mt-6 text-sm font-mono text-muted-foreground tracking-wider uppercase">
          Loading sandbox<span class="typing-cursor"></span>
        </p>
      </div>
    </div>
  {:else if !isRunning}
    <SandboxNotRunning {sandbox} icon="💬" actionText="use the chat" />
  {:else}
    <div class="flex h-[calc(100vh-140px)] min-h-[500px] animate-fade-in">
    <!-- Session Sidebar -->
    <aside class="w-64 border-r border-border/30 bg-background/50 backdrop-blur-sm flex flex-col animate-fade-in-up stagger-1
                  {sidebarCollapsed ? 'hidden sm:flex' : 'flex'}">
      <!-- Sidebar Header -->
      <div class="p-3 border-b border-border/30">
        <div class="flex items-center justify-between gap-2">
          <h3 class="font-mono text-xs uppercase tracking-wider text-muted-foreground">Sessions</h3>
          <Button
            size="sm"
            onclick={createNewSession}
            disabled={isCreating}
            class="h-7 px-3 font-mono text-xs uppercase tracking-wider
                   bg-[var(--cyber-cyan)] hover:bg-[var(--cyber-cyan)]/90 text-black"
          >
            {isCreating ? "..." : "+ New"}
          </Button>
        </div>
      </div>

      <!-- Session List -->
      <div class="flex-1 overflow-y-auto scrollbar-thin">
        {#if isLoading}
          <div class="p-3 space-y-2">
            {#each [1, 2, 3] as i}
              <div class="animate-fade-in-up stagger-{i}">
                <Skeleton class="h-14 w-full bg-muted/30" />
              </div>
            {/each}
          </div>
        {:else if error}
          <div class="p-3">
            <div class="p-3 rounded border border-[var(--cyber-red)]/50 bg-[var(--cyber-red)]/5">
              <span class="text-sm text-[var(--cyber-red)]">{error}</span>
            </div>
          </div>
        {:else if sessions.length === 0}
          <div class="p-6 text-center">
            <div class="font-mono text-3xl text-[var(--cyber-cyan)]/20 mb-3">[ ]</div>
            <p class="text-sm font-mono text-muted-foreground">No sessions yet</p>
            <p class="text-xs font-mono text-muted-foreground/70 mt-1">Click "+ New" to start</p>
          </div>
        {:else}
          <div class="p-2 space-y-1">
            {#each topLevelSessions as session (session.id)}
              <!-- Parent/Top-level Session -->
              <div class="animate-fade-in">
                <div
                  class="w-full text-left p-2.5 rounded transition-all group cursor-pointer
                    {selectedSessionId === session.id
                      ? 'bg-[var(--cyber-cyan)]/10 border border-[var(--cyber-cyan)]/30'
                      : 'hover:bg-muted/50 border border-transparent'}"
                  onclick={() => (selectedSessionId = session.id)}
                  ondblclick={() => hasChildren(session.id) && toggleSessionExpanded(session.id)}
                  onkeydown={(e) => e.key === 'Enter' && (selectedSessionId = session.id)}
                  role="button"
                  tabindex="0"
                >
                  <div class="flex items-start justify-between gap-2">
                    <!-- Expand/Collapse button for sessions with children -->
                    {#if hasChildren(session.id)}
                      <button
                        class="p-0.5 -ml-1 rounded hover:bg-black/10 dark:hover:bg-white/10 flex-shrink-0 mt-0.5
                          {selectedSessionId === session.id ? 'text-[var(--cyber-cyan)]' : 'text-muted-foreground'}"
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
                      <div class="font-medium text-sm truncate flex items-center gap-1
                                  {selectedSessionId === session.id ? 'text-[var(--cyber-cyan)]' : 'text-foreground'}">
                        {getSessionTitle(session)}
                        {#if hasChildren(session.id)}
                          <span class="text-xs opacity-60 font-mono">({getChildCount(session.id)})</span>
                        {/if}
                      </div>
                      <div class="text-xs font-mono truncate text-muted-foreground mt-0.5">
                        {formatDate(session.time?.updated || session.time?.created)}
                      </div>
                    </div>
                    <button
                      class="opacity-0 group-hover:opacity-100 p-1 rounded text-xs
                             text-muted-foreground hover:text-[var(--cyber-red)] hover:bg-[var(--cyber-red)]/10
                             transition-all"
                      onclick={(e) => {
                        e.stopPropagation();
                        deleteSession(session.id);
                      }}
                      title="Delete session"
                    >
                      <X class="h-3 w-3" />
                    </button>
                  </div>
                </div>

                <!-- Child Sessions (nested) -->
                {#if hasChildren(session.id) && expandedSessions.has(session.id)}
                  <div class="ml-3 pl-2 border-l border-[var(--cyber-cyan)]/20 space-y-1 mt-1">
                    {#each childSessionsMap[session.id] as childSession (childSession.id)}
                      <div
                        class="w-full text-left p-2 rounded transition-all group text-sm cursor-pointer
                          {selectedSessionId === childSession.id
                            ? 'bg-[var(--cyber-cyan)]/10 border border-[var(--cyber-cyan)]/30'
                            : 'hover:bg-muted/50 border border-transparent'}"
                        onclick={() => (selectedSessionId = childSession.id)}
                        onkeydown={(e) => e.key === 'Enter' && (selectedSessionId = childSession.id)}
                        role="button"
                        tabindex="0"
                      >
                        <div class="flex items-start justify-between gap-2">
                          <div class="min-w-0 flex-1">
                            <div class="font-medium truncate flex items-center gap-1
                                        {selectedSessionId === childSession.id ? 'text-[var(--cyber-cyan)]' : 'text-foreground'}">
                              <CornerDownRight class="h-3 w-3 text-[var(--cyber-cyan)]/50" />
                              {getSessionTitle(childSession)}
                            </div>
                            <div class="text-xs font-mono truncate text-muted-foreground">
                              {formatDate(childSession.time?.updated || childSession.time?.created)}
                            </div>
                          </div>
                          <button
                            class="opacity-0 group-hover:opacity-100 p-1 rounded text-xs
                                   text-muted-foreground hover:text-[var(--cyber-red)] hover:bg-[var(--cyber-red)]/10
                                   transition-all"
                            onclick={(e) => {
                              e.stopPropagation();
                              deleteSession(childSession.id);
                            }}
                            title="Delete session"
                          >
                            <X class="h-3 w-3" />
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

      <!-- Sidebar Footer -->
      <div class="p-2 border-t border-border/30">
        <Button
          size="sm"
          variant="ghost"
          class="w-full h-8 font-mono text-xs text-muted-foreground hover:text-foreground flex items-center justify-center gap-2"
          onclick={loadSessions}
          disabled={isLoading}
        >
          {#if isLoading}
            Loading...
          {:else}
            <RefreshCw class="h-3 w-3" />
            Refresh
          {/if}
        </Button>
      </div>
    </aside>

    <!-- Mobile sidebar toggle -->
    <button
      class="sm:hidden fixed bottom-4 left-4 z-50 w-10 h-10 rounded-lg
             bg-[var(--cyber-cyan)] text-black flex items-center justify-center
             shadow-lg shadow-[var(--cyber-cyan)]/20"
      onclick={() => sidebarCollapsed = !sidebarCollapsed}
    >
      {#if sidebarCollapsed}
        <Menu class="h-5 w-5" />
      {:else}
        <X class="h-5 w-5" />
      {/if}
    </button>

    <!-- Chat Area -->
    <div class="flex-1 flex flex-col min-w-0 animate-fade-in-up stagger-2">
      {#if selectedSessionId}
        <!-- Model & Agent Selector Header -->
        <div class="border-b border-border/30 px-4 py-2.5 flex items-center justify-between bg-background/50 backdrop-blur-sm">
          <div class="flex items-center gap-4 flex-wrap">
            <div class="flex items-center gap-2">
              <span class="text-xs font-mono text-muted-foreground uppercase tracking-wider">Model:</span>
              <ModelSelector
                {projectId}
                bind:selectedModel
                compact={true}
                {providers}
                animateTrigger={modelAnimationTrigger}
              />
            </div>
            <div class="flex items-center gap-2">
              <span class="text-xs font-mono text-muted-foreground uppercase tracking-wider">Agent:</span>
              <AgentSelector
                {projectId}
                bind:selectedAgent
                compact={true}
                disabled={isChildSession}
                agents={primaryAgents}
                animateTrigger={agentAnimationTrigger}
              />
              {#if isChildSession}
                <span class="text-xs font-mono text-[var(--cyber-amber)] italic">(subagent)</span>
              {/if}
            </div>
          </div>

          <!-- Keyboard hints -->
          <div class="hidden lg:flex items-center gap-3 text-xs font-mono text-muted-foreground/50">
            <span>Alt+,/. model</span>
            <span>Cmd+,/. agent</span>
          </div>
        </div>

        <!-- Onboarding Banner -->
        {@const onboardingStatus = onboarding.getStatus(projectId)}
        {#if onboardingStatus && !onboarding.isComplete(projectId) && !onboardingBannerDismissed}
          <div class="px-4 py-2 border-b border-border/30 bg-background/30">
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
            onSessionCreated={handleSessionCreated}
            onSessionUpdated={handleSessionUpdated}
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
        <!-- No session selected state -->
        <div class="flex-1 flex items-center justify-center">
          <div class="text-center animate-fade-in-up cyber-card corner-accent p-12">
            <div class="font-mono text-4xl text-[var(--cyber-cyan)]/20 mb-4">💬</div>
            <p class="text-lg font-medium font-heading">
              No session selected
            </p>
            <p class="text-sm font-mono text-muted-foreground mt-2">
              Create a new session to start chatting
            </p>
            <Button
              class="mt-6 font-mono text-xs uppercase tracking-wider
                     bg-[var(--cyber-cyan)] hover:bg-[var(--cyber-cyan)]/90 text-black"
              onclick={createNewSession}
              disabled={isCreating}
            >
              {isCreating ? "Creating..." : "+ Create Session"}
            </Button>
          </div>
        </div>
      {/if}
    </div>
  </div>
  {/if}
{/if}

<!-- File Picker Modal -->
<FilePickerModal
  {projectId}
  open={filePickerOpen}
  onOpenChange={(open) => (filePickerOpen = open)}
  onSelect={handleFileSelect}
/>
