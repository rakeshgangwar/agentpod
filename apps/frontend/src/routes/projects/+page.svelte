<script lang="ts">
  import { goto } from "$app/navigation";
  import { onMount, onDestroy } from "svelte";
  import { confirm } from "@tauri-apps/plugin-dialog";
  import { connection } from "$lib/stores/connection.svelte";
  import {
    sandboxes,
    fetchSandboxes,
    startSandbox,
    stopSandbox,
    deleteSandbox,
    checkDockerHealth
  } from "$lib/stores/sandboxes.svelte";
  import { isSandboxBusy, subscribeToActivityChanges } from "$lib/stores/session-activity.svelte";
  import { projectIcons, parseIconId } from "$lib/stores/project-icons.svelte";
  import { getProjectIcon } from "$lib/utils/project-icons";
  import { getAnimatedIcon } from "$lib/utils/animated-icons";
  import LottieIcon from "$lib/components/lottie-icon.svelte";
  import PageHeader from "$lib/components/page-header.svelte";
  import { Button } from "$lib/components/ui/button";

  // Icons
  import ListIcon from "@lucide/svelte/icons/list";
  import LayoutGridIcon from "@lucide/svelte/icons/layout-grid";
  import Grid3x3Icon from "@lucide/svelte/icons/grid-3x3";
  import Trash2Icon from "@lucide/svelte/icons/trash-2";
  import ArrowRightIcon from "@lucide/svelte/icons/arrow-right";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import FolderIcon from "@lucide/svelte/icons/folder";
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";

  // Back navigation helper
  function goBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
    } else {
      goto("/");
    }
  }

  // View mode types
  type ViewMode = "cards" | "compact" | "list";

  // View mode state - persisted to localStorage
  let viewMode = $state<ViewMode>("cards");
  
  // Track busy sandbox IDs - updated via subscription, not derived
  // This avoids Svelte reactivity issues that caused cards to disappear
  let busySandboxIds = $state<Set<string>>(new Set());
  
  // Helper to check if a sandbox is busy (reads from local state)
  function checkSandboxBusy(sandboxId: string): boolean {
    return busySandboxIds.has(sandboxId);
  }
  
  // Update busy IDs from the activity store
  function refreshBusyIds() {
    const newBusyIds = new Set<string>();
    for (const sandbox of sandboxes.list) {
      if (isSandboxBusy(sandbox.id)) {
        newBusyIds.add(sandbox.id);
      }
    }
    busySandboxIds = newBusyIds;
  }

  // Load view preference on mount, with responsive defaults
  let unsubscribeActivity: (() => void) | undefined;
  
  onMount(() => {
    const saved = localStorage.getItem("projects-view-mode");
    if (saved && ["cards", "compact", "list"].includes(saved)) {
      viewMode = saved as ViewMode;
    } else {
      // Responsive defaults: compact for mobile, cards for tablet+
      const isMobile = window.innerWidth < 768;
      viewMode = isMobile ? "compact" : "cards";
    }
    
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

  // Save view preference when changed
  function setViewMode(mode: ViewMode) {
    viewMode = mode;
    localStorage.setItem("projects-view-mode", mode);
  }

  // Redirect if not connected
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

  function handleSandboxClick(e: MouseEvent, sandboxId: string) {
    const target = e.target as HTMLElement;
    if (target.closest("button")) {
      return;
    }
    goto(`/projects/${sandboxId}`);
  }

  function getSandboxDisplayName(sandbox: { name: string }): string {
    return sandbox.name;
  }

  function getSandboxSlug(sandbox: { slug?: string; labels?: Record<string, string> }): string {
    return sandbox.slug || sandbox.labels?.["agentpod.sandbox.slug"] || "";
  }

  function formatDate(dateStr?: string): string {
    if (!dateStr) return "---";
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(dateStr));
  }

  function formatDateShort(dateStr?: string): string {
    if (!dateStr) return "---";
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric"
    }).format(new Date(dateStr));
  }

  function getImageShortName(image?: string): string {
    if (!image) return "---";
    const parts = image.split("/");
    const name = parts[parts.length - 1];
    return name.split(":")[0];
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

  async function handleStart(e: MouseEvent, sandboxId: string) {
    e.stopPropagation();
    startSandbox(sandboxId);
  }

  async function handleStop(e: MouseEvent, sandboxId: string) {
    e.stopPropagation();
    stopSandbox(sandboxId);
  }

  async function handleDelete(e: MouseEvent, sandbox: { id: string; name: string }) {
    e.stopPropagation();
    const displayName = getSandboxDisplayName(sandbox);
    const shouldDelete = await confirm(`Delete project "${displayName}"?`, {
      title: "Confirm Delete",
      kind: "warning",
    });
    if (shouldDelete) {
      deleteSandbox(sandbox.id);
    }
  }
</script>

<!-- Noise overlay for atmosphere -->
<div class="noise-overlay"></div>

<main class="h-screen flex flex-col grid-bg mesh-gradient overflow-hidden">
  <!-- Page Header -->
  <PageHeader
    title="All Projects"
    icon={FolderIcon}
    subtitle="Manage your AI coding sandboxes"
  >
    {#snippet leading()}
      <Button
        variant="ghost"
        size="icon"
        onclick={goBack}
        class="h-8 w-8 border border-border/30 hover:border-[var(--cyber-cyan)] hover:text-[var(--cyber-cyan)]"
      >
        <ArrowLeftIcon class="h-4 w-4" />
      </Button>
    {/snippet}
    
    {#snippet actions()}
      <!-- View Mode Toggle -->
      {#if sandboxes.list.length > 0}
        <div class="flex items-center border border-border/50 rounded-sm overflow-hidden">
          <!-- List View -->
          <button
            onclick={() => setViewMode("list")}
            class="p-2 h-9 w-9 flex items-center justify-center transition-colors {viewMode === 'list' ? 'bg-[var(--cyber-cyan)]/20 text-[var(--cyber-cyan)]' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}"
            title="List view"
          >
            <ListIcon size={16} />
          </button>
          <!-- Card View -->
          <button
            onclick={() => setViewMode("cards")}
            class="p-2 h-9 w-9 flex items-center justify-center border-l border-border/50 transition-colors {viewMode === 'cards' ? 'bg-[var(--cyber-cyan)]/20 text-[var(--cyber-cyan)]' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}"
            title="Card view"
          >
            <LayoutGridIcon size={16} />
          </button>
          <!-- Compact View -->
          <button
            onclick={() => setViewMode("compact")}
            class="p-2 h-9 w-9 flex items-center justify-center border-l border-border/50 transition-colors {viewMode === 'compact' ? 'bg-[var(--cyber-cyan)]/20 text-[var(--cyber-cyan)]' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}"
            title="Compact view"
          >
            <Grid3x3Icon size={16} />
          </button>
        </div>
      {/if}

      <Button
        onclick={() => goto("/projects/new")}
        class="cyber-btn-primary px-4 h-9 font-mono text-xs uppercase tracking-wider"
      >
        <PlusIcon class="h-4 w-4 mr-2" /> New Project
      </Button>
    {/snippet}
  </PageHeader>

  <!-- Scrollable Content Area -->
  <div class="flex-1 overflow-y-auto px-4 sm:px-6 pb-8">
    <div class="max-w-7xl mx-auto pt-6">
      <!-- Error Display -->
      {#if sandboxes.error}
        <div class="mb-6 animate-fade-in-up cyber-card p-4 border-[var(--cyber-red)]/50">
          <div class="flex items-center gap-3 text-[var(--cyber-red)]">
            <span class="font-mono text-xs uppercase tracking-wider">[error]</span>
            <span class="text-sm">{sandboxes.error}</span>
          </div>
        </div>
      {/if}

      <!-- Docker Health Warning -->
      {#if sandboxes.dockerHealthy === false}
        <div class="mb-6 animate-fade-in-up cyber-card p-4 border-[var(--cyber-amber)]/50">
          <div class="flex items-center gap-3 text-[var(--cyber-amber)]">
            <span class="font-mono text-xs uppercase tracking-wider">[warning]</span>
            <span class="text-sm">Docker daemon is not accessible. Please ensure Docker is running.</span>
          </div>
        </div>
      {/if}

      <!-- Stats Bar -->
      {#if sandboxes.list.length > 0}
        <div class="mb-6 flex flex-wrap gap-4 sm:gap-6 text-sm font-mono animate-fade-in-up">
          <div class="flex items-center gap-2">
            <span class="text-muted-foreground">total:</span>
            <span class="text-foreground font-semibold">{sandboxes.list.length}</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-muted-foreground">running:</span>
            <span class="text-[var(--cyber-emerald)] font-semibold">
              {sandboxes.list.filter(s => s.status === "running").length}
            </span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-muted-foreground">stopped:</span>
            <span class="text-muted-foreground font-semibold">
              {sandboxes.list.filter(s => s.status === "stopped" || s.status === "created").length}
            </span>
          </div>
        </div>
      {/if}

      <!-- Projects Content -->
    {#if sandboxes.isLoading && sandboxes.list.length === 0}
      <!-- Loading State -->
      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {#each [1, 2, 3] as i}
          <div class="cyber-card p-6 animate-fade-in-up stagger-{i}">
            <div class="space-y-4">
              <div class="h-6 bg-muted/50 rounded w-3/4 animate-pulse"></div>
              <div class="h-4 bg-muted/30 rounded w-1/2 animate-pulse"></div>
              <div class="h-4 bg-muted/20 rounded w-full animate-pulse"></div>
              <div class="flex gap-2 pt-2">
                <div class="h-8 bg-muted/30 rounded w-16 animate-pulse"></div>
                <div class="h-8 bg-muted/30 rounded w-16 animate-pulse"></div>
              </div>
            </div>
          </div>
        {/each}
      </div>
    {:else if sandboxes.list.length === 0}
      <!-- Empty State -->
      <div class="cyber-card corner-accent p-12 text-center animate-fade-in-up">
        <div class="max-w-md mx-auto space-y-6">
          <div class="font-mono text-6xl text-[var(--cyber-cyan)]/20">[ ]</div>
          <div class="space-y-2">
            <h2 class="text-xl font-semibold">No sandboxes initialized</h2>
            <p class="text-muted-foreground text-sm font-mono">
              Create your first AI coding environment to get started.
            </p>
          </div>
          <Button
            onclick={() => goto("/projects/new")}
            class="cyber-btn-primary px-8 h-11 font-mono text-xs uppercase tracking-wider"
          >
            <span class="mr-2">+</span> Initialize Project
          </Button>
        </div>
      </div>
    {:else}
      <!-- ============================================
           LIST VIEW
           ============================================ -->
      {#if viewMode === "list"}
        <div class="cyber-card overflow-hidden animate-fade-in-up">
          <!-- Table Header -->
          <div class="hidden md:grid md:grid-cols-[1fr_100px_120px_140px_140px] gap-4 px-4 py-3 border-b border-border/30 text-xs font-mono text-muted-foreground uppercase tracking-wider">
            <div>Project</div>
            <div>Status</div>
            <div>Image</div>
            <div>Created</div>
            <div class="text-right">Actions</div>
          </div>

          <!-- Table Rows -->
          {#each sandboxes.list as sandbox (sandbox.id)}
            {@const iconData = getSandboxIconData(sandbox)}
            {@const isBusy = checkSandboxBusy(sandbox.id)}
            <div
              class="grid md:grid-cols-[1fr_100px_120px_140px_140px] gap-4 px-4 py-3 border-b border-border/20 last:border-b-0 hover:bg-muted/30 cursor-pointer transition-colors group items-center {isBusy ? 'bg-[var(--cyber-amber)]/5' : ''}"
              onclick={(e: MouseEvent) => handleSandboxClick(e, sandbox.id)}
              role="button"
              tabindex="0"
              onkeydown={(e: KeyboardEvent) => e.key === "Enter" && goto(`/projects/${sandbox.id}`)}
            >
              <!-- Project Name -->
              <div class="flex items-center gap-3 min-w-0">
                {#if iconData}
                  {#if iconData.type === "animated"}
                    <div class="shrink-0">
                      <LottieIcon src={iconData.path} size={20} loop autoplay />
                    </div>
                  {:else}
                    {@const IconComponent = iconData.component}
                    <div class="shrink-0 text-[var(--cyber-cyan)]">
                      <IconComponent class="w-5 h-5" />
                    </div>
                  {/if}
                {/if}
                <div class="min-w-0 flex items-center gap-2">
                  <p class="font-medium truncate group-hover:text-[var(--cyber-cyan)] transition-colors">
                    {getSandboxDisplayName(sandbox)}
                  </p>
                  {#if isBusy}
                    <span class="session-activity-badge" title="AI is working">
                      <span class="activity-dot-small"></span>
                    </span>
                  {/if}
                  <p class="text-xs text-muted-foreground truncate font-mono md:hidden">
                    {getSandboxSlug(sandbox) || "---"}
                  </p>
                </div>
              </div>

              <!-- Status -->
              <div class="flex items-center gap-2">
                {#if isBusy}
                  <span class="text-xs font-mono text-[var(--cyber-amber)] hidden md:inline">AI</span>
                {/if}
                <div class="status-indicator {getStatusClass(sandbox.status)} text-xs">
                  <span class="status-dot {sandbox.status === 'running' ? 'animate-pulse-dot' : ''}"></span>
                  <span>{getStatusLabel(sandbox.status)}</span>
                </div>
              </div>

              <!-- Image -->
              <div class="hidden md:block text-xs font-mono text-muted-foreground truncate" title={sandbox.image}>
                {getImageShortName(sandbox.image)}
              </div>

              <!-- Created -->
              <div class="hidden md:block text-xs font-mono text-muted-foreground">
                {formatDate(sandbox.createdAt)}
              </div>

              <!-- Actions -->
              <div class="flex items-center justify-end gap-1">
                {#if sandbox.status === "stopped" || sandbox.status === "created"}
                  <Button
                    size="sm"
                    onclick={(e: MouseEvent) => handleStart(e, sandbox.id)}
                    disabled={sandboxes.isLoading}
                    class="font-mono text-xs uppercase tracking-wider h-7 px-3 bg-[var(--cyber-emerald)] hover:bg-[var(--cyber-emerald)]/90 text-black"
                  >
                    Start
                  </Button>
                {:else if sandbox.status === "running"}
                  <Button
                    size="sm"
                    variant="secondary"
                    onclick={(e: MouseEvent) => handleStop(e, sandbox.id)}
                    disabled={sandboxes.isLoading}
                    class="font-mono text-xs uppercase tracking-wider h-7 px-3"
                  >
                    Stop
                  </Button>
                {:else if sandbox.status === "starting" || sandbox.status === "stopping"}
                  <Button
                    size="sm"
                    disabled={true}
                    class="font-mono text-xs uppercase tracking-wider h-7 px-3"
                  >
                    {sandbox.status === "starting" ? "..." : "..."}
                  </Button>
                {/if}

                <Button
                  size="sm"
                  variant="ghost"
                  onclick={(e: MouseEvent) => handleDelete(e, sandbox)}
                  disabled={sandboxes.isLoading}
                  class="font-mono text-xs h-7 w-7 p-0 text-[var(--cyber-red)] hover:text-[var(--cyber-red)] hover:bg-[var(--cyber-red)]/10"
                >
                  <Trash2Icon class="h-4 w-4" />
                </Button>
              </div>
            </div>
          {/each}
        </div>

      <!-- ============================================
           CARD VIEW (Original)
           ============================================ -->
      {:else if viewMode === "cards"}
        <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {#each sandboxes.list as sandbox, i (sandbox.id)}
            {@const iconData = getSandboxIconData(sandbox)}
            <div
              class="cyber-card corner-accent cursor-pointer group animate-fade-in-up stagger-{Math.min(i + 1, 8)}"
              onclick={(e: MouseEvent) => handleSandboxClick(e, sandbox.id)}
              role="button"
              tabindex="0"
              onkeydown={(e: KeyboardEvent) => e.key === "Enter" && goto(`/projects/${sandbox.id}`)}
            >
              <!-- Card Header -->
              <div class="p-5 pb-4 border-b border-border/30">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0 flex-1 flex items-center gap-3">
                    {#if iconData}
                      {#if iconData.type === "animated"}
                        <div class="shrink-0">
                          <LottieIcon src={iconData.path} size={24} loop autoplay />
                        </div>
                      {:else}
                        {@const IconComponent = iconData.component}
                        <div class="shrink-0 text-[var(--cyber-cyan)]">
                          <IconComponent class="w-6 h-6" />
                        </div>
                      {/if}
                    {/if}
                    <div class="min-w-0 flex-1">
                      <h3 class="font-semibold text-lg truncate group-hover:text-[var(--cyber-cyan)] transition-colors">
                        {getSandboxDisplayName(sandbox)}
                      </h3>
                      <p class="text-xs font-mono text-muted-foreground truncate mt-1">
                        {getSandboxSlug(sandbox) || "---"}
                      </p>
                    </div>
                  </div>

                  <div class="flex items-center gap-2">
                    {#if checkSandboxBusy(sandbox.id)}
                      <div class="session-activity-indicator" title="AI is working">
                        <span class="activity-dot"></span>
                        <span class="text-xs font-mono text-[var(--cyber-amber)]">working</span>
                      </div>
                    {/if}
                    <div class="status-indicator {getStatusClass(sandbox.status)}">
                      <span class="status-dot {sandbox.status === 'running' ? 'animate-pulse-dot' : ''}"></span>
                      <span>{getStatusLabel(sandbox.status)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Card Body -->
              <div class="p-5 pt-4 space-y-4">
                <div class="grid grid-cols-2 gap-3 text-xs font-mono">
                  <div>
                    <span class="text-muted-foreground block mb-1">image</span>
                    <span class="text-foreground truncate block" title={sandbox.image}>
                      {getImageShortName(sandbox.image)}
                    </span>
                  </div>
                  <div>
                    <span class="text-muted-foreground block mb-1">created</span>
                    <span class="text-foreground">
                      {formatDate(sandbox.createdAt)}
                    </span>
                  </div>
                </div>

                <div class="flex items-center gap-2 pt-2">
                  {#if sandbox.status === "stopped" || sandbox.status === "created"}
                    <Button
                      size="sm"
                      onclick={(e: MouseEvent) => handleStart(e, sandbox.id)}
                      disabled={sandboxes.isLoading}
                      class="font-mono text-xs uppercase tracking-wider h-8 px-4 bg-[var(--cyber-emerald)] hover:bg-[var(--cyber-emerald)]/90 text-black"
                    >
                      Start
                    </Button>
                  {:else if sandbox.status === "running"}
                    <Button
                      size="sm"
                      variant="secondary"
                      onclick={(e: MouseEvent) => handleStop(e, sandbox.id)}
                      disabled={sandboxes.isLoading}
                      class="font-mono text-xs uppercase tracking-wider h-8 px-4"
                    >
                      Stop
                    </Button>
                  {:else if sandbox.status === "starting" || sandbox.status === "stopping"}
                    <Button
                      size="sm"
                      disabled={true}
                      class="font-mono text-xs uppercase tracking-wider h-8 px-4"
                    >
                      {sandbox.status === "starting" ? "Starting..." : "Stopping..."}
                    </Button>
                  {/if}

                <Button
                  size="sm"
                  variant="ghost"
                  onclick={(e: MouseEvent) => handleDelete(e, sandbox)}
                  disabled={sandboxes.isLoading}
                  class="font-mono text-xs uppercase tracking-wider h-8 px-4 text-[var(--cyber-red)] hover:text-[var(--cyber-red)] hover:bg-[var(--cyber-red)]/10"
                >
                  <Trash2Icon class="h-4 w-4 mr-1" />
                  Delete
                </Button>

                  <div class="flex-1"></div>

                  <span class="text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity font-mono flex items-center gap-1">
                    open <ArrowRightIcon class="h-3 w-3" />
                  </span>
                </div>
              </div>
            </div>
          {/each}
        </div>

      <!-- ============================================
           COMPACT VIEW
           ============================================ -->
      {:else if viewMode === "compact"}
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {#each sandboxes.list as sandbox, i (sandbox.id)}
            {@const iconData = getSandboxIconData(sandbox)}
            <div
              class="cyber-card cursor-pointer group animate-fade-in-up stagger-{Math.min(i + 1, 8)} hover:border-[var(--cyber-cyan)]/50 transition-colors"
              onclick={(e: MouseEvent) => handleSandboxClick(e, sandbox.id)}
              role="button"
              tabindex="0"
              onkeydown={(e: KeyboardEvent) => e.key === "Enter" && goto(`/projects/${sandbox.id}`)}
            >
              <div class="p-4">
                <!-- Header Row -->
                <div class="flex items-center gap-3 mb-3">
                  {#if iconData}
                    {#if iconData.type === "animated"}
                      <div class="shrink-0">
                        <LottieIcon src={iconData.path} size={18} loop autoplay />
                      </div>
                    {:else}
                      {@const IconComponent = iconData.component}
                      <div class="shrink-0 text-[var(--cyber-cyan)]">
                        <IconComponent class="w-[18px] h-[18px]" />
                      </div>
                    {/if}
                  {/if}
                  <h3 class="font-medium text-sm truncate flex-1 group-hover:text-[var(--cyber-cyan)] transition-colors">
                    {getSandboxDisplayName(sandbox)}
                  </h3>
                  <div class="flex items-center gap-1">
                    {#if checkSandboxBusy(sandbox.id)}
                      <span class="session-activity-badge" title="AI is working">
                        <span class="activity-dot-small"></span>
                      </span>
                    {/if}
                    <div class="status-indicator {getStatusClass(sandbox.status)} text-xs py-0.5 px-1.5">
                      <span class="status-dot {sandbox.status === 'running' ? 'animate-pulse-dot' : ''}" style="width: 5px; height: 5px;"></span>
                      <span class="hidden sm:inline">{getStatusLabel(sandbox.status)}</span>
                    </div>
                  </div>
                </div>

                <!-- Meta Row -->
                <div class="flex items-center justify-between text-xs font-mono text-muted-foreground mb-3">
                  <span class="truncate" title={sandbox.image}>{getImageShortName(sandbox.image)}</span>
                  <span>{formatDateShort(sandbox.createdAt)}</span>
                </div>

                <!-- Actions Row - shown on hover -->
                <div class="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  {#if sandbox.status === "stopped" || sandbox.status === "created"}
                    <Button
                      size="sm"
                      onclick={(e: MouseEvent) => handleStart(e, sandbox.id)}
                      disabled={sandboxes.isLoading}
                      class="font-mono text-xs uppercase tracking-wider h-7 px-3 flex-1 bg-[var(--cyber-emerald)] hover:bg-[var(--cyber-emerald)]/90 text-black"
                    >
                      Start
                    </Button>
                  {:else if sandbox.status === "running"}
                    <Button
                      size="sm"
                      variant="secondary"
                      onclick={(e: MouseEvent) => handleStop(e, sandbox.id)}
                      disabled={sandboxes.isLoading}
                      class="font-mono text-xs uppercase tracking-wider h-7 px-3 flex-1"
                    >
                      Stop
                    </Button>
                  {:else if sandbox.status === "starting" || sandbox.status === "stopping"}
                    <Button
                      size="sm"
                      disabled={true}
                      class="font-mono text-xs uppercase tracking-wider h-7 px-3 flex-1"
                    >
                      ...
                    </Button>
                  {/if}

                <Button
                  size="sm"
                  variant="ghost"
                  onclick={(e: MouseEvent) => handleDelete(e, sandbox)}
                  disabled={sandboxes.isLoading}
                  class="font-mono text-xs h-7 w-7 p-0 text-[var(--cyber-red)] hover:text-[var(--cyber-red)] hover:bg-[var(--cyber-red)]/10"
                >
                  <Trash2Icon class="h-4 w-4" />
                </Button>
                </div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    {/if}

      <!-- Footer -->
      <footer class="mt-16 pt-8 border-t border-border/30 animate-fade-in-up" style="animation-delay: 0.5s; opacity: 0;">
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
