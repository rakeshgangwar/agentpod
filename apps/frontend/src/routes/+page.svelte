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
  import { projectIcons, parseIconId } from "$lib/stores/project-icons.svelte";
  import { getProjectIcon } from "$lib/utils/project-icons";
  import { getAnimatedIcon } from "$lib/utils/animated-icons";
  import LottieIcon from "$lib/components/lottie-icon.svelte";
  import { Button } from "$lib/components/ui/button";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import { Avatar, AvatarFallback } from "$lib/components/ui/avatar";
  import { Skeleton } from "$lib/components/ui/skeleton";

  // Icons
  import PlusIcon from "@lucide/svelte/icons/plus";
  import SettingsIcon from "@lucide/svelte/icons/settings";
  import FolderIcon from "@lucide/svelte/icons/folder";
  import ActivityIcon from "@lucide/svelte/icons/activity";
  import ServerIcon from "@lucide/svelte/icons/server";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import PlayIcon from "@lucide/svelte/icons/play";
  import SquareIcon from "@lucide/svelte/icons/square";
  import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";

  // =============================================================================
  // State
  // =============================================================================
  
  let busySandboxIds = $state<Set<string>>(new Set());
  let unsubscribeActivity: (() => void) | undefined;

  // Derived stats
  let totalProjects = $derived(sandboxes.list.length);
  let runningCount = $derived(sandboxes.list.filter(s => s.status === "running").length);
  let stoppedCount = $derived(sandboxes.list.filter(s => s.status === "stopped" || s.status === "created").length);
  let activeSessionsCount = $derived(busySandboxIds.size);

  // Recent projects (sorted by lastAccessedAt or createdAt, limited to 5)
  let recentProjects = $derived(
    [...sandboxes.list]
      .sort((a, b) => {
        const aDate = a.lastAccessedAt || a.createdAt;
        const bDate = b.lastAccessedAt || b.createdAt;
        return new Date(bDate).getTime() - new Date(aDate).getTime();
      })
      .slice(0, 5)
  );

  // Active/busy sandboxes
  let activeSandboxes = $derived(
    sandboxes.list.filter(s => busySandboxIds.has(s.id) && s.status === "running")
  );

  // Running sandboxes (for quick access)
  let runningSandboxes = $derived(
    sandboxes.list.filter(s => s.status === "running")
  );

  // =============================================================================
  // Lifecycle
  // =============================================================================

  function refreshBusyIds() {
    busySandboxIds = new Set(getBusySandboxIds());
  }

  onMount(() => {
    // Subscribe to activity changes
    unsubscribeActivity = subscribeToActivityChanges(() => {
      refreshBusyIds();
    });
    
    // Initial refresh
    refreshBusyIds();
  });

  onDestroy(() => {
    unsubscribeActivity?.();
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

  function getStatusLabel(status: string): string {
    switch (status) {
      case "created": return "ready";
      default: return status;
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
</script>

<!-- Noise overlay for atmosphere -->
<div class="noise-overlay"></div>

<main class="h-screen flex flex-col grid-bg mesh-gradient overflow-hidden">
  <!-- Fixed Header Section -->
  <div class="shrink-0 px-4 sm:px-6 pt-6 sm:pt-8 pb-4 sm:pb-6 max-w-7xl mx-auto w-full">
    <header class="animate-fade-in-up">
      <div class="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 sm:gap-6">

        <!-- Title Area -->
        <div class="space-y-3 sm:space-y-4">
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
            <div class="flex items-center gap-2 text-muted-foreground">
              <span class="text-[var(--cyber-cyan)]">@</span>
              <span class="truncate max-w-[150px] sm:max-w-[200px]">{connection.apiUrl}</span>
            </div>

            {#if sandboxes.dockerHealthy !== null}
              <div class="health-indicator {sandboxes.dockerHealthy ? 'healthy' : 'unhealthy'}">
                <span class="status-dot {sandboxes.dockerHealthy ? 'animate-pulse-dot' : ''}"
                      style="background: currentColor;"></span>
                <span>docker: {sandboxes.dockerHealthy ? "online" : "offline"}</span>
              </div>
            {/if}
          </div>
        </div>

        <!-- Actions Area -->
        <div class="flex items-center gap-2 sm:gap-3">
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
            class="font-mono text-xs uppercase tracking-wider h-10 hidden sm:flex"
          >
            <SettingsIcon class="h-4 w-4 mr-2" /> Settings
          </Button>

          <!-- User Menu -->
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

  <!-- Scrollable Content Area -->
  <div class="flex-1 overflow-y-auto px-4 sm:px-6 pb-8">
    <div class="max-w-7xl mx-auto space-y-6 sm:space-y-8">
      
      <!-- Stats Cards -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 animate-fade-in-up stagger-1">
        <!-- Total Projects -->
        <div class="cyber-card p-4 sm:p-5">
          <div class="flex items-center gap-3">
            <div class="p-2 rounded bg-[var(--cyber-cyan)]/10">
              <FolderIcon class="h-5 w-5 text-[var(--cyber-cyan)]" />
            </div>
            <div>
              <p class="text-2xl sm:text-3xl font-bold">{totalProjects}</p>
              <p class="text-xs font-mono text-muted-foreground">projects</p>
            </div>
          </div>
        </div>

        <!-- Running -->
        <div class="cyber-card p-4 sm:p-5">
          <div class="flex items-center gap-3">
            <div class="p-2 rounded bg-[var(--cyber-emerald)]/10">
              <ServerIcon class="h-5 w-5 text-[var(--cyber-emerald)]" />
            </div>
            <div>
              <p class="text-2xl sm:text-3xl font-bold text-[var(--cyber-emerald)]">{runningCount}</p>
              <p class="text-xs font-mono text-muted-foreground">running</p>
            </div>
          </div>
        </div>

        <!-- Active Sessions -->
        <div class="cyber-card p-4 sm:p-5">
          <div class="flex items-center gap-3">
            <div class="p-2 rounded bg-[var(--cyber-amber)]/10">
              <ActivityIcon class="h-5 w-5 text-[var(--cyber-amber)]" />
            </div>
            <div>
              <p class="text-2xl sm:text-3xl font-bold text-[var(--cyber-amber)]">{activeSessionsCount}</p>
              <p class="text-xs font-mono text-muted-foreground">active</p>
            </div>
          </div>
        </div>

        <!-- Stopped -->
        <div class="cyber-card p-4 sm:p-5">
          <div class="flex items-center gap-3">
            <div class="p-2 rounded bg-muted/50">
              <SquareIcon class="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p class="text-2xl sm:text-3xl font-bold text-muted-foreground">{stoppedCount}</p>
              <p class="text-xs font-mono text-muted-foreground">stopped</p>
            </div>
          </div>
        </div>
      </div>

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

      <!-- Main Content Grid -->
      <div class="grid lg:grid-cols-3 gap-4 sm:gap-6">
        
        <!-- Active Sessions Section -->
        <div class="lg:col-span-2 space-y-4 animate-fade-in-up stagger-2">
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-semibold flex items-center gap-2">
              <ActivityIcon class="h-5 w-5 text-[var(--cyber-amber)]" />
              Active Sessions
            </h2>
          </div>

          {#if sandboxes.isLoading && sandboxes.list.length === 0}
            <div class="cyber-card p-6 space-y-4">
              {#each [1, 2] as i}
                <div class="flex items-center gap-4">
                  <Skeleton class="h-10 w-10 rounded" />
                  <div class="flex-1 space-y-2">
                    <Skeleton class="h-4 w-1/3" />
                    <Skeleton class="h-3 w-1/2" />
                  </div>
                </div>
              {/each}
            </div>
          {:else if activeSandboxes.length === 0}
            <div class="cyber-card p-6 sm:p-8 text-center">
              <div class="font-mono text-4xl text-[var(--cyber-cyan)]/20 mb-3">[ ]</div>
              <p class="text-muted-foreground text-sm font-mono">No active sessions</p>
              <p class="text-muted-foreground/60 text-xs font-mono mt-1">
                Start a sandbox and open a chat to begin
              </p>
            </div>
          {:else}
            <div class="cyber-card divide-y divide-border/30">
              {#each activeSandboxes as sandbox (sandbox.id)}
                {@const iconData = getSandboxIconData(sandbox)}
                <button
                  onclick={() => goto(`/projects/${sandbox.id}/chat`)}
                  class="w-full p-4 flex items-center gap-4 hover:bg-muted/30 transition-colors text-left"
                >
                  <!-- Icon -->
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

                  <!-- Info -->
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                      <p class="font-medium truncate">{sandbox.name}</p>
                      <span class="session-activity-badge">
                        <span class="activity-dot-small"></span>
                      </span>
                    </div>
                    <p class="text-xs font-mono text-muted-foreground">AI is working...</p>
                  </div>

                  <!-- Arrow -->
                  <ChevronRightIcon class="h-5 w-5 text-muted-foreground" />
                </button>
              {/each}
            </div>
          {/if}

          <!-- Running Sandboxes (if no active sessions but some running) -->
          {#if activeSandboxes.length === 0 && runningSandboxes.length > 0}
            <div class="mt-4">
              <h3 class="text-sm font-mono text-muted-foreground mb-3 flex items-center gap-2">
                <span class="w-2 h-2 rounded-full bg-[var(--cyber-emerald)] animate-pulse-dot"></span>
                Running Sandboxes
              </h3>
              <div class="cyber-card divide-y divide-border/30">
                {#each runningSandboxes.slice(0, 3) as sandbox (sandbox.id)}
                  {@const iconData = getSandboxIconData(sandbox)}
                  <button
                    onclick={() => goto(`/projects/${sandbox.id}`)}
                    class="w-full p-4 flex items-center gap-4 hover:bg-muted/30 transition-colors text-left"
                  >
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

                    <div class="flex-1 min-w-0">
                      <p class="font-medium truncate text-sm">{sandbox.name}</p>
                    </div>

                    <div class="status-indicator status-running text-xs">
                      <span class="status-dot animate-pulse-dot"></span>
                      <span>running</span>
                    </div>
                  </button>
                {/each}
              </div>
            </div>
          {/if}
        </div>

        <!-- Recent Projects Section -->
        <div class="space-y-4 animate-fade-in-up stagger-3">
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-semibold flex items-center gap-2">
              <FolderIcon class="h-5 w-5 text-[var(--cyber-cyan)]" />
              Recent Projects
            </h2>
            <Button
              variant="ghost"
              size="sm"
              onclick={() => goto("/projects")}
              class="font-mono text-xs"
            >
              View All <ChevronRightIcon class="h-4 w-4 ml-1" />
            </Button>
          </div>

          {#if sandboxes.isLoading && sandboxes.list.length === 0}
            <div class="cyber-card p-4 space-y-3">
              {#each [1, 2, 3, 4, 5] as i}
                <div class="flex items-center gap-3">
                  <Skeleton class="h-8 w-8 rounded" />
                  <div class="flex-1 space-y-1">
                    <Skeleton class="h-3 w-2/3" />
                    <Skeleton class="h-2 w-1/3" />
                  </div>
                </div>
              {/each}
            </div>
          {:else if recentProjects.length === 0}
            <div class="cyber-card p-6 text-center">
              <div class="font-mono text-3xl text-[var(--cyber-cyan)]/20 mb-3">[ ]</div>
              <p class="text-muted-foreground text-sm font-mono">No projects yet</p>
              <Button
                onclick={() => goto("/projects/new")}
                class="mt-4 cyber-btn-primary font-mono text-xs uppercase tracking-wider"
              >
                <PlusIcon class="h-4 w-4 mr-2" /> Create First Project
              </Button>
            </div>
          {:else}
            <div class="cyber-card divide-y divide-border/30">
              {#each recentProjects as sandbox (sandbox.id)}
                {@const iconData = getSandboxIconData(sandbox)}
                {@const isBusy = checkSandboxBusy(sandbox.id)}
                <button
                  onclick={() => goto(`/projects/${sandbox.id}`)}
                  class="w-full p-3 flex items-center gap-3 hover:bg-muted/30 transition-colors text-left group"
                >
                  <!-- Icon -->
                  {#if iconData}
                    {#if iconData.type === "animated"}
                      <LottieIcon src={iconData.path} size={18} loop autoplay />
                    {:else}
                      {@const IconComponent = iconData.component}
                      <div class="text-[var(--cyber-cyan)]">
                        <IconComponent class="w-[18px] h-[18px]" />
                      </div>
                    {/if}
                  {/if}

                  <!-- Info -->
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                      <p class="font-medium truncate text-sm group-hover:text-[var(--cyber-cyan)] transition-colors">
                        {sandbox.name}
                      </p>
                      {#if isBusy}
                        <span class="session-activity-badge">
                          <span class="activity-dot-small"></span>
                        </span>
                      {/if}
                    </div>
                    <p class="text-xs font-mono text-muted-foreground">
                      {formatRelativeTime(sandbox.lastAccessedAt || sandbox.createdAt)}
                    </p>
                  </div>

                  <!-- Status & Actions -->
                  <div class="flex items-center gap-2">
                    <div class="status-indicator {getStatusClass(sandbox.status)} text-xs py-0.5 px-1.5">
                      <span class="status-dot {sandbox.status === 'running' ? 'animate-pulse-dot' : ''}" style="width: 5px; height: 5px;"></span>
                    </div>
                    
                    {#if sandbox.status === "stopped" || sandbox.status === "created"}
                      <Button
                        size="sm"
                        variant="ghost"
                        onclick={(e: MouseEvent) => handleStart(e, sandbox.id)}
                        disabled={sandboxes.isLoading}
                        class="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Start"
                      >
                        <PlayIcon class="h-4 w-4 text-[var(--cyber-emerald)]" />
                      </Button>
                    {:else if sandbox.status === "running"}
                      <Button
                        size="sm"
                        variant="ghost"
                        onclick={(e: MouseEvent) => handleStop(e, sandbox.id)}
                        disabled={sandboxes.isLoading}
                        class="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Stop"
                      >
                        <SquareIcon class="h-4 w-4 text-muted-foreground" />
                      </Button>
                    {/if}
                  </div>
                </button>
              {/each}
            </div>
          {/if}
        </div>
      </div>

      <!-- Quick Actions / Announcements Placeholder -->
      <div class="animate-fade-in-up stagger-4">
        <div class="cyber-card p-4 sm:p-6 border-dashed">
          <div class="flex items-center gap-3 text-muted-foreground">
            <div class="p-2 rounded bg-muted/30">
              <ActivityIcon class="h-5 w-5" />
            </div>
            <div>
              <p class="text-sm font-medium">Announcements</p>
              <p class="text-xs font-mono text-muted-foreground/70">Coming soon - changelog, updates, and system status</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <footer class="pt-8 border-t border-border/30 animate-fade-in-up" style="animation-delay: 0.5s; opacity: 0;">
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
      </footer>
    </div>
  </div>
</main>
