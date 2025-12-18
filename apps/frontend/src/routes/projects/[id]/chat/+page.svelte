<script lang="ts">
  import { page } from "$app/stores";
  import { untrack } from "svelte";
  import { sveltify } from "svelte-preprocess-react";
  import { RuntimeProvider, PermissionProvider } from "$lib/chat/RuntimeProvider";
  import { ChatThread } from "$lib/chat/ChatThread";
  import { Button } from "$lib/components/ui/button";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import * as Sheet from "$lib/components/ui/sheet";
  import FilePickerModal from "$lib/components/file-picker-modal.svelte";
  import ModelSelector from "$lib/components/model-selector.svelte";
  import AgentSelector from "$lib/components/agent-selector.svelte";
  import ModelAgentSheet from "$lib/components/model-agent-sheet.svelte";
  import OnboardingBanner from "$lib/components/onboarding-banner.svelte";
  import SandboxNotRunning from "$lib/components/sandbox-not-running.svelte";
  import { X, Menu, RefreshCw, CornerDownRight, MessageSquare } from "@lucide/svelte";
  import WakewordToggle from "$lib/components/wakeword-toggle.svelte";
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
  const react = sveltify({ RuntimeProvider, ChatThread, PermissionProvider });

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

  // Track session ID from URL parameter (from pending actions navigation)
  // This is read once on page load and cleared after use
  let urlSessionId = $state<string | null>(null);

  // Read session param from URL immediately (before loadSessions runs)
  // This needs to happen synchronously on page load
  if (typeof window !== "undefined") {
    const urlParams = new URLSearchParams(window.location.search);
    const sessionParam = urlParams.get("session");
    if (sessionParam) {
      urlSessionId = sessionParam;
      // Clean up the URL immediately
      window.history.replaceState({}, "", window.location.pathname);
    }
  }

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

  // Filter to primary agents only, excluding hidden agents
  let primaryAgents = $derived(
    agents.filter(agent => (agent.mode === "primary" || agent.mode === "all") && !agent.hidden)
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
      
      // Priority for session selection:
      // 1. URL session parameter (from pending actions or direct link)
      // 2. Already selected session (preserve current selection)
      // 3. Most recent session (default)
      if (urlSessionId) {
        // Check if the URL session exists in the list
        const urlSession = sessions.find(s => s.id === urlSessionId);
        if (urlSession) {
          selectedSessionId = urlSessionId;
          console.log("[Chat] Selected session from URL:", urlSessionId);
        } else {
          console.warn("[Chat] URL session not found, falling back to recent:", urlSessionId);
          if (!selectedSessionId && sessions.length > 0) {
            selectedSessionId = sessions[0].id;
          }
        }
        // Clear the URL session ID after using it
        urlSessionId = null;
      } else if (!selectedSessionId && sessions.length > 0) {
        // Auto-select the most recent session if none selected
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

  // Mobile sidebar sheet state (replaces simple collapse toggle)
  let mobileSidebarOpen = $state(false);

  // Close mobile sidebar when a session is selected
  function selectSessionAndCloseMobile(sessionId: string) {
    selectedSessionId = sessionId;
    mobileSidebarOpen = false;
  }
</script>

<svelte:window on:keydown={handleGlobalKeyDown} />

{#if projectId}
  {#if !sandbox}
    <!-- Loading State -->
    <div class="flex-1 min-h-0 flex items-center justify-center animate-fade-in">
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
    <div class="flex flex-col md:flex-row flex-1 min-h-0 animate-fade-in">
      <!-- Mobile Header (visible only on mobile, sticky) -->
      <div class="md:hidden sticky top-0 z-10 border-b border-border/30 bg-background/95 backdrop-blur-sm">
        <!-- Top row: Menu, Session title, New button -->
        <div class="flex items-center gap-2 px-2 py-2">
          <Button
            variant="ghost"
            size="icon"
            class="h-8 w-8 shrink-0"
            onclick={() => mobileSidebarOpen = true}
            aria-label="Open sessions menu"
          >
            <Menu class="h-4 w-4" />
          </Button>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium truncate">
              {selectedSession ? getSessionTitle(selectedSession) : "No session"}
            </p>
          </div>
          <WakewordToggle />
          <Button
            size="sm"
            onclick={createNewSession}
            disabled={isCreating}
            class="h-7 px-2 font-mono text-[10px] uppercase tracking-wider shrink-0"
          >
            {isCreating ? "..." : "+ New"}
          </Button>
        </div>
        <!-- Bottom row: Model/Agent selector -->
        <div class="flex items-center justify-center px-2 pb-2">
          <ModelAgentSheet
            bind:selectedModel
            bind:selectedAgent
            {providers}
            agents={primaryAgents}
            {isChildSession}
          />
        </div>
      </div>

      <!-- Mobile Session Sidebar (Sheet) -->
      <Sheet.Root bind:open={mobileSidebarOpen}>
        <Sheet.Content side="left" class="w-[280px] p-0 flex flex-col">
          <Sheet.Header class="p-3 border-b border-border/30">
            <Sheet.Title class="font-mono text-xs uppercase tracking-wider text-muted-foreground">
              Sessions
            </Sheet.Title>
          </Sheet.Header>

          <!-- Session List (Mobile) -->
          <div class="flex-1 overflow-y-auto">
            {#if isLoading}
              <div class="p-3 space-y-2">
                {#each [1, 2, 3] as i}
                  <Skeleton class="h-14 w-full bg-muted/30" />
                {/each}
              </div>
            {:else if error}
              <div class="p-3">
                <div class="p-3 rounded border border-destructive/50 bg-destructive/5">
                  <span class="text-sm text-destructive">{error}</span>
                </div>
              </div>
            {:else if sessions.length === 0}
              <div class="p-6 text-center">
                <MessageSquare class="h-8 w-8 mx-auto text-muted-foreground/30 mb-3" />
                <p class="text-sm font-mono text-muted-foreground">No sessions yet</p>
                <p class="text-xs text-muted-foreground/70 mt-1">Create one to start chatting</p>
              </div>
            {:else}
              <div class="p-2 space-y-1">
                {#each topLevelSessions as session (session.id)}
                  <div>
                    <button
                      class="w-full text-left p-2.5 rounded transition-all group
                        {selectedSessionId === session.id
                          ? 'bg-primary/10 border border-primary/30'
                          : 'hover:bg-muted/50 border border-transparent'}"
                      onclick={() => selectSessionAndCloseMobile(session.id)}
                    >
                      <div class="flex items-start gap-2">
                        {#if hasChildren(session.id)}
                          <button
                            class="p-0.5 -ml-1 rounded hover:bg-accent flex-shrink-0 mt-0.5 text-muted-foreground"
                            onclick={(e) => {
                              e.stopPropagation();
                              toggleSessionExpanded(session.id);
                            }}
                          >
                            <span class="text-xs inline-block transition-transform {expandedSessions.has(session.id) ? 'rotate-90' : ''}">▶</span>
                          </button>
                        {/if}
                        <div class="min-w-0 flex-1">
                          <div class="font-medium text-sm truncate {selectedSessionId === session.id ? 'text-primary' : ''}">
                            {getSessionTitle(session)}
                            {#if hasChildren(session.id)}
                              <span class="text-xs opacity-60 font-mono">({getChildCount(session.id)})</span>
                            {/if}
                          </div>
                          <div class="text-xs font-mono text-muted-foreground mt-0.5">
                            {formatDate(session.time?.updated || session.time?.created)}
                          </div>
                        </div>
                      </div>
                    </button>

                    {#if hasChildren(session.id) && expandedSessions.has(session.id)}
                      <div class="ml-3 pl-2 border-l border-primary/20 space-y-1 mt-1">
                        {#each childSessionsMap[session.id] as childSession (childSession.id)}
                          <button
                            class="w-full text-left p-2 rounded transition-all text-sm
                              {selectedSessionId === childSession.id
                                ? 'bg-primary/10 border border-primary/30'
                                : 'hover:bg-muted/50 border border-transparent'}"
                            onclick={() => selectSessionAndCloseMobile(childSession.id)}
                          >
                            <div class="flex items-center gap-1 font-medium truncate {selectedSessionId === childSession.id ? 'text-primary' : ''}">
                              <CornerDownRight class="h-3 w-3 text-primary/50" />
                              {getSessionTitle(childSession)}
                            </div>
                            <div class="text-xs font-mono text-muted-foreground">
                              {formatDate(childSession.time?.updated || childSession.time?.created)}
                            </div>
                          </button>
                        {/each}
                      </div>
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}
          </div>

          <!-- Sidebar Footer (Mobile) -->
          <div class="p-2 border-t border-border/30 mt-auto">
            <Button
              size="sm"
              variant="ghost"
              class="w-full h-8 font-mono text-xs text-muted-foreground hover:text-foreground flex items-center justify-center gap-2"
              onclick={loadSessions}
              disabled={isLoading}
            >
              <RefreshCw class="h-3 w-3" />
              Refresh
            </Button>
          </div>
        </Sheet.Content>
      </Sheet.Root>

      <!-- Desktop Session Sidebar (hidden on mobile) -->
      <aside class="hidden md:flex w-64 border-r border-border/30 bg-background/50 backdrop-blur-sm flex-col animate-fade-in-up stagger-1">
        <!-- Sidebar Header -->
        <div class="p-3 border-b border-border/30">
          <div class="flex items-center justify-between gap-2">
            <h3 class="font-mono text-xs uppercase tracking-wider text-muted-foreground">Sessions</h3>
            <Button
              size="sm"
              onclick={createNewSession}
              disabled={isCreating}
              class="h-7 px-3 font-mono text-xs uppercase tracking-wider
                     bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {isCreating ? "..." : "+ New"}
            </Button>
          </div>
        </div>

        <!-- Session List (Desktop) -->
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
              <div class="p-3 rounded border border-destructive/50 bg-destructive/5">
                <span class="text-sm text-destructive">{error}</span>
              </div>
            </div>
          {:else if sessions.length === 0}
            <div class="p-6 text-center">
              <MessageSquare class="h-8 w-8 mx-auto text-muted-foreground/30 mb-3" />
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
                        ? 'bg-primary/10 border border-primary/30'
                        : 'hover:bg-muted/50 border border-transparent'}"
                    onclick={() => (selectedSessionId = session.id)}
                    ondblclick={() => hasChildren(session.id) && toggleSessionExpanded(session.id)}
                    onkeydown={(e) => e.key === 'Enter' && (selectedSessionId = session.id)}
                    role="button"
                    tabindex="0"
                  >
                    <div class="flex items-start justify-between gap-2">
                      {#if hasChildren(session.id)}
                        <button
                          class="p-0.5 -ml-1 rounded hover:bg-accent flex-shrink-0 mt-0.5
                            {selectedSessionId === session.id ? 'text-primary' : 'text-muted-foreground'}"
                          onclick={(e) => {
                            e.stopPropagation();
                            toggleSessionExpanded(session.id);
                          }}
                          title={expandedSessions.has(session.id) ? "Collapse" : "Expand"}
                        >
                          <span class="text-xs inline-block transition-transform {expandedSessions.has(session.id) ? 'rotate-90' : ''}">▶</span>
                        </button>
                      {/if}
                      <div class="min-w-0 flex-1">
                        <div class="font-medium text-sm truncate flex items-center gap-1
                                    {selectedSessionId === session.id ? 'text-primary' : 'text-foreground'}">
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
                               text-muted-foreground hover:text-destructive hover:bg-destructive/10
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
                    <div class="ml-3 pl-2 border-l border-primary/20 space-y-1 mt-1">
                      {#each childSessionsMap[session.id] as childSession (childSession.id)}
                        <div
                          class="w-full text-left p-2 rounded transition-all group text-sm cursor-pointer
                            {selectedSessionId === childSession.id
                              ? 'bg-primary/10 border border-primary/30'
                              : 'hover:bg-muted/50 border border-transparent'}"
                          onclick={() => (selectedSessionId = childSession.id)}
                          onkeydown={(e) => e.key === 'Enter' && (selectedSessionId = childSession.id)}
                          role="button"
                          tabindex="0"
                        >
                          <div class="flex items-start justify-between gap-2">
                            <div class="min-w-0 flex-1">
                              <div class="font-medium truncate flex items-center gap-1
                                          {selectedSessionId === childSession.id ? 'text-primary' : 'text-foreground'}">
                                <CornerDownRight class="h-3 w-3 text-primary/50" />
                                {getSessionTitle(childSession)}
                              </div>
                              <div class="text-xs font-mono truncate text-muted-foreground">
                                {formatDate(childSession.time?.updated || childSession.time?.created)}
                              </div>
                            </div>
                            <button
                              class="opacity-0 group-hover:opacity-100 p-1 rounded text-xs
                                     text-muted-foreground hover:text-destructive hover:bg-destructive/10
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

        <!-- Sidebar Footer (Desktop) -->
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

      <!-- Chat Area -->
    <div class="flex-1 flex flex-col min-w-0 min-h-0 animate-fade-in-up stagger-2">
      {#if selectedSessionId}
        <!-- Model & Agent Selector Header (desktop only - hidden on mobile) -->
        <div class="hidden md:block sticky top-0 z-10 border-b border-border/30 px-4 py-2.5 bg-background/95 backdrop-blur-sm">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-4 flex-wrap min-w-0">
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
                  <span class="text-xs font-mono text-amber-500 italic">(subagent)</span>
                {/if}
              </div>
            </div>

            <!-- Wake word toggle and keyboard hints (desktop only) -->
            <div class="hidden lg:flex items-center gap-3 text-xs font-mono text-muted-foreground/50 flex-shrink-0">
              <WakewordToggle />
              <span class="border-l border-border/30 h-4"></span>
              <span>Alt+,/. model</span>
              <span>Cmd+,/. agent</span>
            </div>
          </div>
        </div>

        <!-- Mobile Model & Agent Selector (shown below input via ChatThread) -->
        <!-- These selectors are passed to ChatThread and rendered in the composer area on mobile -->

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

        <!-- Chat content wrapper -->
        <div class="flex-1 min-h-0 flex flex-col relative">
          <!-- PermissionProvider wraps OUTSIDE the {#key} so permissions persist across session switches -->
          <react.PermissionProvider {projectId}>
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
          </react.PermissionProvider>
        </div>
      {:else}
        <!-- No session selected state -->
        <div class="flex-1 flex items-center justify-center p-4">
          <div class="text-center animate-fade-in-up cyber-card corner-accent p-8 md:p-12 max-w-sm">
            <MessageSquare class="h-12 w-12 mx-auto text-primary/20 mb-4" />
            <p class="text-lg font-medium font-heading">
              No session selected
            </p>
            <p class="text-sm font-mono text-muted-foreground mt-2">
              Create a new session to start chatting
            </p>
            <Button
              class="mt-6 font-mono text-xs uppercase tracking-wider"
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
