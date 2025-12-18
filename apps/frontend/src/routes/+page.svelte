<script lang="ts">
  import { goto } from "$app/navigation";
  import { onMount, onDestroy } from "svelte";
  import { connection } from "$lib/stores/connection.svelte";
  import { auth, logout } from "$lib/stores/auth.svelte";
  import {
    sandboxes,
    fetchSandboxes,
    startSandbox,
    stopSandbox,
    checkDockerHealth
  } from "$lib/stores/sandboxes.svelte";
  import { subscribeToActivityChanges, getBusySandboxIds } from "$lib/stores/session-activity.svelte";
  import { 
    markAsUnseen,
    markAsSeen,
    getUnseenCompletionIds,
    subscribeToUnseenChanges 
  } from "$lib/stores/unseen-completions.svelte";
  import { projectIcons, parseIconId } from "$lib/stores/project-icons.svelte";
  import { getProjectIcon } from "$lib/utils/project-icons";
  import { getAnimatedIcon } from "$lib/utils/animated-icons";
  import LottieIcon from "$lib/components/lottie-icon.svelte";
  import PendingActions from "$lib/components/pending-actions.svelte";
  import NewsTicker from "$lib/components/news-ticker.svelte";
  import { Button } from "$lib/components/ui/button";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import { Avatar, AvatarFallback } from "$lib/components/ui/avatar";
  import { Skeleton } from "$lib/components/ui/skeleton";

  // Icons
  import PlusIcon from "@lucide/svelte/icons/plus";
  import SettingsIcon from "@lucide/svelte/icons/settings";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import PlayIcon from "@lucide/svelte/icons/play";
  import SquareIcon from "@lucide/svelte/icons/square";
  import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
  import SparklesIcon from "@lucide/svelte/icons/sparkles";
  import RocketIcon from "@lucide/svelte/icons/rocket";
  import ZapIcon from "@lucide/svelte/icons/zap";
  import CheckCircleIcon from "@lucide/svelte/icons/check-circle";

  // Track if we're on mobile (for FAB visibility)
  let isMobile = $state(false);

  $effect(() => {
    if (typeof window === "undefined") return;
    
    function checkMobile() {
      isMobile = window.innerWidth < 768; // md breakpoint
    }
    
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  });

  // =============================================================================
  // State
  // =============================================================================
  
  let busySandboxIds = $state<Set<string>>(new Set());
  let unseenIds = $state<Set<string>>(new Set());
  let unsubscribeActivity: (() => void) | undefined;
  let unsubscribeUnseen: (() => void) | undefined;
  
  // Track previous active sandbox IDs to detect completions
  let previousActiveSandboxIds = $state<Set<string>>(new Set());

  // Derived stats
  let totalProjects = $derived(sandboxes.list.length);
  let runningCount = $derived(sandboxes.list.filter(s => s.status === "running").length);
  let activeSessionsCount = $derived(busySandboxIds.size);

  // Check if user has any projects
  let hasProjects = $derived(totalProjects > 0);

  // Active AI sessions (needs attention - AI is working)
  let activeSandboxes = $derived(
    sandboxes.list.filter(s => busySandboxIds.has(s.id) && s.status === "running")
  );

  // Get IDs of active sandboxes for filtering
  let activeSandboxIds = $derived(new Set(activeSandboxes.map(s => s.id)));

  // Recent projects (sorted by lastAccessedAt or createdAt, limited to 5)
  // Excludes sandboxes shown in "Needs Attention" section to avoid duplication
  let recentProjects = $derived(
    [...sandboxes.list]
      .filter(s => !activeSandboxIds.has(s.id)) // exclude ones shown in active section
      .sort((a, b) => {
        const aDate = a.lastAccessedAt || a.createdAt;
        const bDate = b.lastAccessedAt || b.createdAt;
        return new Date(bDate).getTime() - new Date(aDate).getTime();
      })
      .slice(0, 5)
  );

  // Build ticker items - mix of tips and contextual info
  let tickerItems = $derived(() => {
    const items: string[] = [];
    
    // Static tips
    const tips = [
      "💡 Pro tip: Your AI assistant remembers context between sessions",
      "⌨️ Shortcut: Use keyboard navigation to quickly switch between tabs",
      "🤖 AI agents can read your AGENTS.md file for project context",
      "📦 Tip: Use different container flavors for different tech stacks",
      "🔄 Your changes are automatically saved to the Git repository",
      "🎯 Define clear project descriptions to help AI understand your goals",
      "⚡ Containers start in seconds with pre-built development environments",
      "🔐 All your code stays on your machine - nothing leaves your Docker",
      "🔀 Use the Sync tab to manage branches and view file changes",
      "📝 Check the Logs tab to see container output and debug issues",
    ];
    
    // Add contextual items based on user state
    if (totalProjects === 0) {
      items.push("🚀 Welcome! Create your first project to get started with AI-powered development");
    } else if (totalProjects === 1) {
      items.push(`📂 You have 1 project — ready to build something amazing?`);
    } else {
      items.push(`📂 Managing ${totalProjects} projects — you're on a roll!`);
    }
    
    if (runningCount > 0) {
      items.push(`🟢 ${runningCount} container${runningCount > 1 ? 's' : ''} running and ready for action`);
    }
    
    if (activeSessionsCount > 0) {
      items.push(`⚡ ${activeSessionsCount} AI session${activeSessionsCount > 1 ? 's' : ''} actively working on your code`);
    }
    
    if (sandboxes.dockerHealthy) {
      items.push("🐳 Docker is online and ready to spin up new sandboxes");
    }
    
    // Add random tips
    items.push(...tips);
    
    return items;
  });

  // Build inline stats text
  let statsText = $derived(() => {
    const parts: string[] = [];
    
    if (totalProjects === 1) {
      parts.push("1 project");
    } else {
      parts.push(`${totalProjects} projects`);
    }
    
    if (runningCount > 0) {
      parts.push(`${runningCount} running`);
    }
    
    if (activeSessionsCount > 0) {
      parts.push(`${activeSessionsCount} active`);
    }
    
    return parts.join(" · ");
  });

  // =============================================================================
  // Lifecycle
  // =============================================================================

  let staleCheckInterval: ReturnType<typeof setInterval> | undefined;

  function refreshBusyIds() {
    const newBusyIds = getBusySandboxIds();
    const newBusySet = new Set(newBusyIds);
    
    // Detect sessions that just completed (were busy, now not busy)
    for (const id of previousActiveSandboxIds) {
      if (!newBusySet.has(id)) {
        // This session just completed - mark as unseen
        markAsUnseen(id);
      }
    }
    
    // Update previous for next check
    previousActiveSandboxIds = newBusySet;
    
    // Only update busySandboxIds if actually changed
    const currentIds = Array.from(busySandboxIds).sort().join(',');
    const newIds = newBusyIds.sort().join(',');
    if (currentIds !== newIds) {
      busySandboxIds = new Set(newBusyIds);
    }
  }
  
  function refreshUnseenIds() {
    unseenIds = new Set(getUnseenCompletionIds());
  }

  onMount(() => {
    // Subscribe to activity changes (for immediate updates from chat pages)
    unsubscribeActivity = subscribeToActivityChanges(() => {
      refreshBusyIds();
    });
    
    // Subscribe to unseen completions changes
    unsubscribeUnseen = subscribeToUnseenChanges(() => {
      refreshUnseenIds();
    });
    
    // Initial refresh
    refreshBusyIds();
    refreshUnseenIds();
    
    // Periodically check for stale sessions (every 3 seconds)
    // This handles the case where AI completes while user is on homepage.
    // The session-activity store has a 10s stale threshold, so sessions
    // that haven't been updated will automatically be considered inactive.
    // Combined: max ~13 seconds delay when AI finishes while on homepage.
    staleCheckInterval = setInterval(() => {
      refreshBusyIds();
    }, 3000);
  });

  onDestroy(() => {
    unsubscribeActivity?.();
    unsubscribeUnseen?.();
    if (staleCheckInterval) {
      clearInterval(staleCheckInterval);
    }
  });

  // Redirect if not connected or not authenticated
  $effect(() => {
    if (!connection.isConnected) {
      goto("/login");
    }
  });

  // Check Docker health and load sandboxes when connected
  $effect(() => {
    if (connection.isConnected) {
      checkDockerHealth();
      fetchSandboxes();
    }
  });

  // =============================================================================
  // Handlers
  // =============================================================================

  async function handleLogout() {
    goto("/login");
    await logout();
  }

  async function handleStart(e: MouseEvent, sandboxId: string) {
    e.stopPropagation();
    e.preventDefault();
    startSandbox(sandboxId);
  }

  async function handleStop(e: MouseEvent, sandboxId: string) {
    e.stopPropagation();
    e.preventDefault();
    stopSandbox(sandboxId);
  }

  function handleRefresh() {
    fetchSandboxes();
    checkDockerHealth();
  }

  // =============================================================================
  // Helpers
  // =============================================================================

  function getStatusClass(status: string): string {
    switch (status) {
      case "running": return "status-running";
      case "starting":
      case "stopping": return "status-starting";
      case "created":
      case "stopped": return "status-stopped";
      case "error":
      case "unknown": return "status-error";
      default: return "status-stopped";
    }
  }

  function formatRelativeTime(dateStr?: string): string {
    if (!dateStr) return "---";
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
  }

  function getSandboxIconData(sandbox: { id: string; name: string }) {
    const iconId = projectIcons.getIconId(sandbox.id, sandbox.name);
    const { isAnimated, id } = parseIconId(iconId);

    if (isAnimated) {
      const animatedIcon = getAnimatedIcon(id);
      if (animatedIcon) {
        return { type: "animated" as const, path: animatedIcon.path };
      }
    }

    const staticIcon = getProjectIcon(isAnimated ? "code" : id);
    if (staticIcon) {
      return { type: "static" as const, component: staticIcon.component };
    }

    return null;
  }

  function checkSandboxBusy(sandboxId: string): boolean {
    return busySandboxIds.has(sandboxId);
  }
  
  function checkHasUnseenCompletion(sandboxId: string): boolean {
    return unseenIds.has(sandboxId);
  }
</script>

<!-- Noise overlay for atmosphere -->
<div class="noise-overlay"></div>

<main class="flex flex-col grid-bg mesh-gradient overflow-hidden h-full md:h-screen -mb-16 md:mb-0">
  <!-- Fixed Header Section -->
  <div class="shrink-0 px-4 sm:px-6 pt-6 sm:pt-8 pb-4 sm:pb-6 max-w-7xl mx-auto w-full">
    <header class="animate-fade-in-up relative">
      <!-- Mobile Top-Right Actions (visible only on mobile) -->
      <div class="absolute top-0 right-0 flex items-center gap-2 md:hidden">
        <Button
          variant="ghost"
          size="icon"
          onclick={handleRefresh}
          disabled={sandboxes.isLoading}
          class="h-9 w-9"
          title="Refresh"
        >
          <RefreshCwIcon class="h-4 w-4 {sandboxes.isLoading ? 'animate-spin' : ''}" />
        </Button>

        <!-- User Menu (Mobile) -->
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            <Button variant="ghost" size="icon" class="rounded-sm h-9 w-9 border border-border/50">
              <Avatar class="h-6 w-6">
                <AvatarFallback class="text-xs font-mono bg-[var(--cyber-cyan)]/10 text-[var(--cyber-cyan)]">
                  {auth.initials}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="end" class="w-56 font-mono">
            <DropdownMenu.Label>
              <div class="flex flex-col space-y-1">
                <p class="text-sm font-medium leading-none">{auth.displayName}</p>
                {#if auth.user?.email}
                  <p class="text-xs leading-none text-muted-foreground">{auth.user.email}</p>
                {/if}
              </div>
            </DropdownMenu.Label>
            <DropdownMenu.Separator />
            <DropdownMenu.Item onclick={() => goto("/projects")}>
              <span class="text-[var(--cyber-cyan)] mr-2">&gt;</span> All Projects
            </DropdownMenu.Item>
            <DropdownMenu.Item onclick={() => goto("/settings")}>
              <span class="text-[var(--cyber-cyan)] mr-2">&gt;</span> Settings
            </DropdownMenu.Item>
            <DropdownMenu.Separator />
            <DropdownMenu.Item onclick={handleLogout} class="text-destructive focus:text-destructive">
              <span class="mr-2">&gt;</span> Disconnect
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </div>

      <div class="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 sm:gap-6">

        <!-- Title Area -->
        <div class="space-y-3 sm:space-y-4 pr-24 md:pr-0">
          <div class="flex items-center gap-3">
            <span class="text-xs font-mono text-muted-foreground tracking-widest uppercase">
              // command_center
            </span>
          </div>

          <h1 class="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight glitch-hover">
            <span class="text-foreground">AgentPod</span>
            <span class="typing-cursor"></span>
          </h1>

          <div class="flex flex-wrap items-center gap-3 sm:gap-4 text-sm font-mono">
            <div class="flex items-center gap-2 text-muted-foreground min-w-0 flex-1 md:flex-none">
              <span class="text-[var(--cyber-cyan)] flex-shrink-0">@</span>
              <span class="truncate md:max-w-[200px] lg:max-w-[300px]">{connection.apiUrl?.replace(/^https?:\/\//, '')}</span>
            </div>

            {#if sandboxes.dockerHealthy !== null}
              <div class="health-indicator {sandboxes.dockerHealthy ? 'healthy' : 'unhealthy'} flex-shrink-0">
                <span class="status-dot {sandboxes.dockerHealthy ? 'animate-pulse-dot' : ''}"
                      style="background: currentColor;"></span>
                <span>docker: {sandboxes.dockerHealthy ? "online" : "offline"}</span>
              </div>
            {/if}
          </div>
        </div>

        <!-- Desktop Actions Area (hidden on mobile) -->
        <div class="hidden md:flex items-center gap-2 sm:gap-3">
          <Button
            variant="ghost"
            size="icon"
            onclick={handleRefresh}
            disabled={sandboxes.isLoading}
            class="h-10 w-10"
            title="Refresh"
          >
            <RefreshCwIcon class="h-4 w-4 {sandboxes.isLoading ? 'animate-spin' : ''}" />
          </Button>

          <Button
            onclick={() => goto("/projects/new")}
            class="cyber-btn-primary px-4 sm:px-6 h-10 font-mono text-xs uppercase tracking-wider"
          >
            <PlusIcon class="h-4 w-4 mr-2" /> New Project
          </Button>

          <Button
            variant="ghost"
            onclick={() => goto("/settings")}
            class="font-mono text-xs uppercase tracking-wider h-10"
          >
            <SettingsIcon class="h-4 w-4 mr-2" /> Settings
          </Button>

          <!-- User Menu (Desktop) -->
          <DropdownMenu.Root>
            <DropdownMenu.Trigger>
              <Button variant="ghost" size="icon" class="rounded-sm h-10 w-10 border border-border/50">
                <Avatar class="h-7 w-7">
                  <AvatarFallback class="text-xs font-mono bg-[var(--cyber-cyan)]/10 text-[var(--cyber-cyan)]">
                    {auth.initials}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Content align="end" class="w-56 font-mono">
              <DropdownMenu.Label>
                <div class="flex flex-col space-y-1">
                  <p class="text-sm font-medium leading-none">{auth.displayName}</p>
                  {#if auth.user?.email}
                    <p class="text-xs leading-none text-muted-foreground">{auth.user.email}</p>
                  {/if}
                </div>
              </DropdownMenu.Label>
              <DropdownMenu.Separator />
              <DropdownMenu.Item onclick={() => goto("/projects")}>
                <span class="text-[var(--cyber-cyan)] mr-2">&gt;</span> All Projects
              </DropdownMenu.Item>
              <DropdownMenu.Item onclick={() => goto("/settings")}>
                <span class="text-[var(--cyber-cyan)] mr-2">&gt;</span> Settings
              </DropdownMenu.Item>
              <DropdownMenu.Separator />
              <DropdownMenu.Item onclick={handleLogout} class="text-destructive focus:text-destructive">
                <span class="mr-2">&gt;</span> Disconnect
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        </div>
      </div>
    </header>
  </div>
  
  <!-- News Ticker - matches header width -->
  <div class="shrink-0 px-4 sm:px-6 pb-4">
    <div class="max-w-7xl mx-auto">
      <NewsTicker items={tickerItems()} />
    </div>
  </div>

  <!-- Scrollable Content Area -->
  <div class="flex-1 overflow-y-auto px-4 sm:px-6 pb-6">
    <div class="max-w-3xl mx-auto space-y-6">
      
      <!-- Error/Warning Display -->
      {#if sandboxes.error}
        <div class="animate-fade-in-up cyber-card p-4 border-[var(--cyber-red)]/50">
          <div class="flex items-center gap-3 text-[var(--cyber-red)]">
            <span class="font-mono text-xs uppercase tracking-wider">[error]</span>
            <span class="text-sm">{sandboxes.error}</span>
          </div>
        </div>
      {/if}

      {#if sandboxes.dockerHealthy === false}
        <div class="animate-fade-in-up cyber-card p-4 border-[var(--cyber-amber)]/50">
          <div class="flex items-center gap-3 text-[var(--cyber-amber)]">
            <span class="font-mono text-xs uppercase tracking-wider">[warning]</span>
            <span class="text-sm">Docker daemon is not accessible. Please ensure Docker is running.</span>
          </div>
        </div>
      {/if}

      <!-- Pending Actions Section (shows permission requests needing user attention) -->
      <PendingActions />

      <!-- Loading State -->
      {#if sandboxes.isLoading && sandboxes.list.length === 0}
        <div class="space-y-4 animate-fade-in-up">
          <Skeleton class="h-5 w-40" />
          <div class="cyber-card p-4 space-y-3">
            {#each [1, 2, 3] as _}
              <div class="flex items-center gap-3">
                <Skeleton class="h-10 w-10 rounded" />
                <div class="flex-1 space-y-2">
                  <Skeleton class="h-4 w-1/3" />
                  <Skeleton class="h-3 w-1/2" />
                </div>
              </div>
            {/each}
          </div>
        </div>
      {:else if !hasProjects}
        <!-- Empty State - Playful Welcome -->
        <div class="animate-fade-in-up py-8 sm:py-12">
          <div class="cyber-card p-8 sm:p-12 text-center relative overflow-hidden">
            <!-- Decorative background elements -->
            <div class="absolute inset-0 opacity-5">
              <div class="absolute top-4 left-8 text-6xl">🚀</div>
              <div class="absolute bottom-8 right-12 text-5xl">✨</div>
              <div class="absolute top-1/2 left-4 text-4xl">🤖</div>
            </div>
            
            <div class="relative z-10">
              <!-- Fun animated icon -->
              <div class="mb-6 flex justify-center">
                <div class="relative">
                  <div class="w-20 h-20 rounded-2xl bg-gradient-to-br from-[var(--cyber-cyan)]/20 to-[var(--cyber-magenta)]/20 
                              flex items-center justify-center border border-[var(--cyber-cyan)]/30
                              shadow-[0_0_30px_var(--cyber-cyan)/20]">
                    <RocketIcon class="w-10 h-10 text-[var(--cyber-cyan)]" />
                  </div>
                  <div class="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-[var(--cyber-amber)] 
                              flex items-center justify-center animate-bounce">
                    <SparklesIcon class="w-3 h-3 text-black" />
                  </div>
                </div>
              </div>
              
              <h2 class="text-2xl sm:text-3xl font-bold mb-3">
                Ready for liftoff! 
              </h2>
              
              <p class="text-muted-foreground mb-2 max-w-md mx-auto">
                Create your first AI sandbox and let the magic begin.
              </p>
              <p class="text-sm text-muted-foreground/70 font-mono mb-8">
                // isolated environments + AI coding agents = 🔥
              </p>
              
              <Button
                onclick={() => goto("/projects/new")}
                class="cyber-btn-primary px-8 h-12 font-mono text-sm uppercase tracking-wider"
              >
                <PlusIcon class="h-5 w-5 mr-2" /> Create First Project
              </Button>
              
              <!-- Feature hints -->
              <div class="mt-10 pt-8 border-t border-border/30">
                <p class="text-xs font-mono text-muted-foreground/60 mb-4 uppercase tracking-wider">What you'll get</p>
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                  <div class="flex items-center gap-2 justify-center text-muted-foreground">
                    <ZapIcon class="w-4 h-4 text-[var(--cyber-amber)]" />
                    <span>AI-powered coding</span>
                  </div>
                  <div class="flex items-center gap-2 justify-center text-muted-foreground">
                    <SquareIcon class="w-4 h-4 text-[var(--cyber-emerald)]" />
                    <span>Isolated containers</span>
                  </div>
                  <div class="flex items-center gap-2 justify-center text-muted-foreground">
                    <SparklesIcon class="w-4 h-4 text-[var(--cyber-magenta)]" />
                    <span>Git integration</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      {:else}
        <!-- Has Projects - Show Content -->
        <div class="space-y-6 animate-fade-in-up">
          
          <!-- Inline Stats -->
          <div class="flex items-center justify-between">
            <p class="text-sm font-mono text-muted-foreground">
              {statsText()}
            </p>
            <Button
              variant="ghost"
              size="sm"
              onclick={() => goto("/projects")}
              class="font-mono text-xs text-muted-foreground hover:text-foreground"
            >
              View All <ChevronRightIcon class="h-4 w-4 ml-1" />
            </Button>
          </div>
          
          <!-- Active Sessions (AI is working) - Only shown if there are active sessions -->
          {#if activeSandboxes.length > 0}
            <div class="space-y-3">
              <h2 class="text-sm font-mono uppercase tracking-wider text-[var(--cyber-amber)] flex items-center gap-2">
                <span class="w-2 h-2 rounded-full bg-[var(--cyber-amber)] animate-pulse"></span>
                Needs Attention
              </h2>
              
              <div class="cyber-card divide-y divide-border/30 border-[var(--cyber-amber)]/30">
                {#each activeSandboxes as sandbox (sandbox.id)}
                  {@const iconData = getSandboxIconData(sandbox)}
                  <button
                    onclick={() => goto(`/projects/${sandbox.id}/chat`)}
                    class="w-full p-4 flex items-center gap-4 hover:bg-[var(--cyber-amber)]/5 transition-colors text-left"
                  >
                    <!-- Icon -->
                    <div class="relative">
                      {#if iconData}
                        {#if iconData.type === "animated"}
                          <LottieIcon src={iconData.path} size={24} loop autoplay />
                        {:else}
                          {@const IconComponent = iconData.component}
                          <div class="text-[var(--cyber-cyan)]">
                            <IconComponent class="w-6 h-6" />
                          </div>
                        {/if}
                      {/if}
                      <span class="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-[var(--cyber-amber)] animate-pulse"></span>
                    </div>

                    <!-- Info -->
                    <div class="flex-1 min-w-0">
                      <p class="font-medium truncate">{sandbox.name}</p>
                      <p class="text-xs font-mono text-[var(--cyber-amber)]">AI is working...</p>
                    </div>

                    <!-- Arrow -->
                    <ChevronRightIcon class="h-5 w-5 text-muted-foreground" />
                  </button>
                {/each}
              </div>
            </div>
          {/if}
          
          <!-- Your Projects - Combined list -->
          <div class="space-y-3">
            <h2 class="text-sm font-mono uppercase tracking-wider text-muted-foreground">
              {activeSandboxes.length > 0 ? 'Other Projects' : 'Your Projects'}
            </h2>
            
            <div class="cyber-card divide-y divide-border/30">
              {#each recentProjects as sandbox (sandbox.id)}
                {@const iconData = getSandboxIconData(sandbox)}
                {@const isBusy = checkSandboxBusy(sandbox.id)}
                {@const isRunning = sandbox.status === "running"}
                {@const hasUnseen = checkHasUnseenCompletion(sandbox.id)}
                <button
                  onclick={() => goto(`/projects/${sandbox.id}`)}
                  class="w-full p-4 flex items-center gap-4 hover:bg-muted/30 transition-colors text-left group
                         {hasUnseen ? 'bg-[var(--cyber-emerald)]/5' : ''}"
                >
                  <!-- Icon with unseen indicator -->
                  <div class="relative">
                    {#if iconData}
                      {#if iconData.type === "animated"}
                        <LottieIcon src={iconData.path} size={20} loop autoplay />
                      {:else}
                        {@const IconComponent = iconData.component}
                        <div class="text-[var(--cyber-cyan)]">
                          <IconComponent class="w-5 h-5" />
                        </div>
                      {/if}
                    {/if}
                    {#if hasUnseen}
                      <span class="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-[var(--cyber-emerald)] 
                                   flex items-center justify-center">
                        <CheckCircleIcon class="w-2 h-2 text-black" />
                      </span>
                    {/if}
                  </div>

                  <!-- Info -->
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                      <p class="font-medium truncate group-hover:text-[var(--cyber-cyan)] transition-colors">
                        {sandbox.name}
                      </p>
                      {#if hasUnseen}
                        <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--cyber-emerald)]/20 
                                     text-[var(--cyber-emerald)] font-mono uppercase tracking-wider">
                          Done
                        </span>
                      {:else if isBusy}
                        <span class="session-activity-badge">
                          <span class="activity-dot-small"></span>
                        </span>
                      {/if}
                    </div>
                    <p class="text-xs font-mono text-muted-foreground">
                      {hasUnseen ? 'AI task completed' : formatRelativeTime(sandbox.lastAccessedAt || sandbox.createdAt)}
                    </p>
                  </div>

                  <!-- Status & Actions -->
                  <div class="flex items-center gap-2">
                    <div class="status-indicator {getStatusClass(sandbox.status)} text-xs py-0.5 px-2">
                      <span class="status-dot {isRunning ? 'animate-pulse-dot' : ''}" style="width: 6px; height: 6px;"></span>
                      <span class="hidden sm:inline">{sandbox.status === 'created' ? 'ready' : sandbox.status}</span>
                    </div>
                    
                    {#if sandbox.status === "stopped" || sandbox.status === "created"}
                      <Button
                        size="sm"
                        variant="ghost"
                        onclick={(e: MouseEvent) => handleStart(e, sandbox.id)}
                        disabled={sandboxes.isLoading}
                        class="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Start"
                      >
                        <PlayIcon class="h-4 w-4 text-[var(--cyber-emerald)]" />
                      </Button>
                    {:else if isRunning}
                      <Button
                        size="sm"
                        variant="ghost"
                        onclick={(e: MouseEvent) => handleStop(e, sandbox.id)}
                        disabled={sandboxes.isLoading}
                        class="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Stop"
                      >
                        <SquareIcon class="h-4 w-4 text-muted-foreground" />
                      </Button>
                    {/if}
                  </div>
                </button>
              {/each}
              
              {#if recentProjects.length === 0 && activeSandboxes.length > 0}
                <div class="p-6 text-center text-muted-foreground text-sm font-mono">
                  All your projects are currently active above ↑
                </div>
              {/if}
            </div>
          </div>
        </div>
      {/if}

    </div>
  </div>
  
  <!-- Sticky Footer (hidden on mobile where bottom nav is shown) -->
  <div class="hidden md:block shrink-0 px-4 sm:px-6 py-3 border-t border-border/30 bg-background/80 backdrop-blur-sm">
    <div class="max-w-7xl mx-auto">
      <div class="flex flex-wrap items-center justify-between gap-4 text-xs font-mono text-muted-foreground">
        <div class="flex items-center gap-4">
          <span>AgentPod v0.1.0</span>
          <span class="text-border">|</span>
          <span>AI Sandbox Environment</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="w-2 h-2 rounded-full bg-[var(--cyber-emerald)] animate-pulse-dot"></span>
          <span>System operational</span>
        </div>
      </div>
    </div>
  </div>

  <!-- Mobile FAB (Floating Action Button) for New Project -->
  {#if isMobile}
    <button
      onclick={() => goto("/projects/new")}
      class="fixed right-4 bottom-20 z-50 flex items-center justify-center w-14 h-14 
             rounded-full shadow-lg cyber-btn-primary touch-manipulation
             active:scale-95 transition-transform safe-area-mb"
      aria-label="New Project"
    >
      <PlusIcon class="h-6 w-6" />
    </button>
  {/if}
</main>
