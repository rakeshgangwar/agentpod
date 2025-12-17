<script lang="ts">
  import { page } from "$app/stores";
  import { toast } from "svelte-sonner";
  import { sandboxes, fetchSandbox, getSandboxStats, startSandbox, stopSandbox, restartSandbox } from "$lib/stores/sandboxes.svelte";
  import type { SandboxStats, SandboxInfo } from "$lib/api/tauri";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import * as Dialog from "$lib/components/ui/dialog";
  import { onMount } from "svelte";
  import { openServiceWindow, type ServiceType } from "$lib/utils/service-window";
  import ProjectIconPicker from "$lib/components/project-icon-picker.svelte";
  import { projectIcons } from "$lib/stores/project-icons.svelte";
  
  // Icons
  import PlayIcon from "@lucide/svelte/icons/play";
  import SquareIcon from "@lucide/svelte/icons/square";
  import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";

  // Get current sandbox ID from route params
  let sandboxId = $derived($page.params.id ?? "");

  // Local state for sandbox info
  let sandboxInfo = $state<SandboxInfo | null>(null);
  let stats = $state<SandboxStats | null>(null);
  let isLoadingStats = $state(false);
  
  // Container control state
  let isRestarting = $state(false);
  let restartError = $state<string | null>(null);
  let showRestartDialog = $state(false);

  async function handleStart() {
    if (!sandboxId) return;
    await startSandbox(sandboxId);
  }

  async function handleStop() {
    if (!sandboxId) return;
    await stopSandbox(sandboxId);
  }

  async function handleRestart() {
    if (!sandboxId) return;
    
    isRestarting = true;
    restartError = null;
    
    try {
      await restartSandbox(sandboxId);
      showRestartDialog = false;
      
      toast.success("Container restarted", {
        description: "The sandbox container has been restarted.",
      });
      
      // Refresh sandbox info
      await fetchSandbox(sandboxId);
    } catch (e) {
      restartError = e instanceof Error ? e.message : "Restart failed";
      toast.error("Restart failed", {
        description: restartError,
      });
    } finally {
      isRestarting = false;
    }
  }

  // Get current sandbox from list (quick access)
  let sandbox = $derived(sandboxInfo?.sandbox ?? sandboxes.list.find(s => s.id === sandboxId));

  // Get the current icon ID for the project (from store)
  function getCurrentIconId(): string {
    return projectIcons.getIconId(sandboxId, sandbox?.name);
  }
  
  // Handle icon selection - save to store
  function handleIconSelect(iconId: string) {
    projectIcons.setIcon(sandboxId, iconId);
  }

  // Load sandbox info on mount
  onMount(() => {
    if (sandboxId) {
      loadSandboxInfo();
    }
  });

  async function loadSandboxInfo() {
    const info = await fetchSandbox(sandboxId);
    if (info) {
      sandboxInfo = info;
    }
  }

  async function refreshStats() {
    if (!sandboxId || sandbox?.status !== "running") return;
    isLoadingStats = true;
    try {
      stats = await getSandboxStats(sandboxId);
    } catch (e) {
      console.error("Failed to get stats:", e);
    } finally {
      isLoadingStats = false;
    }
  }

  // Refresh stats when sandbox is running
  $effect(() => {
    if (sandbox?.status === "running") {
      refreshStats();
    } else {
      stats = null;
    }
  });

  function getStatusColor(status: string | undefined): string {
    switch (status) {
      case "running": return "var(--cyber-emerald)";
      case "paused": 
      case "starting":
      case "stopping": return "var(--cyber-amber)";
      case "exited":
      case "dead": return "var(--cyber-red)";
      default: return "var(--cyber-cyan)";
    }
  }

  // Format bytes to human readable
  function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  }

  // Open service URL in-app (desktop) or system browser (mobile)
  function openService(url: string | null | undefined, title: string, serviceType: ServiceType) {
    if (url && sandbox) {
      openServiceWindow({
        url,
        title: `${title} - ${sandbox.name}`,
        serviceType,
        projectId: sandbox.id,
      });
    }
  }
</script>

<div class="flex-1 min-h-0 overflow-y-auto">
  <div class="space-y-6 animate-fade-in">
    <h2 class="text-xl font-bold">
      Settings
    </h2>

  <!-- Container Control Section (Primary on mobile) -->
  <div class="cyber-card corner-accent overflow-hidden">
    <div class="py-3 px-4 border-b border-border/30 bg-background/30 backdrop-blur-sm">
      <div class="flex items-center justify-between">
        <h3 class="font-mono text-xs uppercase tracking-wider text-[var(--cyber-cyan)]">
          [container_control]
        </h3>
        <span class="px-2 py-0.5 rounded text-xs font-mono" 
              style="color: {getStatusColor(sandbox?.status)}; 
                     background: color-mix(in oklch, {getStatusColor(sandbox?.status)} 10%, transparent); 
                     border: 1px solid color-mix(in oklch, {getStatusColor(sandbox?.status)} 30%, transparent);">
          {sandbox?.status ?? "Unknown"}
        </span>
      </div>
    </div>
    
    <div class="p-4">
      <p class="text-xs text-muted-foreground font-mono mb-4">
        Control the sandbox container lifecycle
      </p>
      
      <div class="flex flex-wrap gap-3">
        {#if sandbox?.status === "stopped" || sandbox?.status === "created"}
          <Button 
            onclick={handleStart}
            disabled={sandboxes.isLoading}
            class="flex-1 sm:flex-none h-10 px-6 font-mono text-xs uppercase tracking-wider
                   bg-[var(--cyber-emerald)] hover:bg-[var(--cyber-emerald)]/90 text-black"
          >
            <PlayIcon class="h-4 w-4 mr-2" />
            Start Container
          </Button>
        {:else if sandbox?.status === "running"}
          <Button 
            variant="secondary"
            onclick={handleStop}
            disabled={sandboxes.isLoading}
            class="flex-1 sm:flex-none h-10 px-6 font-mono text-xs uppercase tracking-wider"
          >
            <SquareIcon class="h-4 w-4 mr-2" />
            Stop Container
          </Button>
        {:else if sandbox?.status === "starting" || sandbox?.status === "stopping"}
          <Button 
            disabled={true}
            class="flex-1 sm:flex-none h-10 px-6 font-mono text-xs uppercase tracking-wider"
          >
            <RefreshCwIcon class="h-4 w-4 mr-2 animate-spin" />
            {sandbox?.status === "starting" ? "Starting..." : "Stopping..."}
          </Button>
        {/if}
        
        <Button 
          variant="outline" 
          onclick={() => showRestartDialog = true}
          disabled={sandbox?.status !== "running" || sandboxes.isLoading}
          class="flex-1 sm:flex-none h-10 px-6 font-mono text-xs uppercase tracking-wider border-border/50
                 hover:border-[var(--cyber-amber)]/50 hover:text-[var(--cyber-amber)]
                 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCwIcon class="h-4 w-4 mr-2" />
          Restart
        </Button>
      </div>
      
      {#if sandbox?.status !== "running"}
        <p class="text-xs text-muted-foreground/70 font-mono mt-3">
          Start the container to access chat, terminal, and other features.
        </p>
      {/if}
    </div>
  </div>

  <!-- Project Info Section -->
  <div class="cyber-card corner-accent overflow-hidden">
    <div class="py-3 px-4 border-b border-border/30 bg-background/30 backdrop-blur-sm">
      <h3 class="font-mono text-xs uppercase tracking-wider text-[var(--cyber-cyan)]">
        [project_info]
      </h3>
    </div>
    
    <div class="p-4 space-y-4">
      <!-- Icon & Name -->
      <div class="flex items-start gap-4">
        <div class="space-y-2">
          <Label class="font-mono text-xs uppercase tracking-wider text-muted-foreground">
            Icon
          </Label>
          <ProjectIconPicker
            value={getCurrentIconId()}
            onSelect={handleIconSelect}
            size="lg"
          />
        </div>
        <div class="flex-1 space-y-2">
          <Label class="font-mono text-xs uppercase tracking-wider text-muted-foreground">
            Name
          </Label>
          <Input
            value={sandbox?.name ?? ""}
            disabled
            class="font-mono bg-background/30 border-border/30 text-muted-foreground"
          />
          <p class="text-xs font-mono text-muted-foreground/70">
            Project name cannot be changed after creation.
          </p>
        </div>
      </div>
      
      <!-- Description (if any) -->
      {#if sandbox?.description}
        <div class="space-y-2">
          <Label class="font-mono text-xs uppercase tracking-wider text-muted-foreground">
            Description
          </Label>
          <p class="text-sm text-muted-foreground">{sandbox.description}</p>
        </div>
      {/if}
    </div>
  </div>

  <!-- Service URLs Section -->
  <div class="cyber-card corner-accent overflow-hidden">
    <div class="py-3 px-4 border-b border-border/30 bg-background/30 backdrop-blur-sm">
      <h3 class="font-mono text-xs uppercase tracking-wider text-[var(--cyber-cyan)]">
        [service_urls]
      </h3>
    </div>
    
    <div class="p-4 space-y-3">
      <!-- Homepage URL -->
      {#if sandbox?.urls?.homepage}
        <div class="flex items-center justify-between p-3 rounded bg-background/30 border border-border/30">
          <div class="min-w-0 flex-1">
            <div class="font-mono text-xs uppercase tracking-wider text-muted-foreground">Homepage</div>
            <div class="text-sm font-mono truncate mt-0.5 text-foreground">
              {sandbox.urls.homepage}
            </div>
          </div>
          <Button 
            size="sm" 
            variant="outline" 
            onclick={() => openService(sandbox?.urls?.homepage, "Homepage", "opencode")}
            class="h-7 px-3 font-mono text-xs border-border/50 hover:border-[var(--cyber-cyan)]/50 hover:text-[var(--cyber-cyan)]"
          >
            Open
          </Button>
        </div>
      {/if}

      <!-- OpenCode API -->
      <div class="flex items-center justify-between p-3 rounded bg-background/30 border border-border/30">
        <div class="min-w-0 flex-1">
          <div class="font-mono text-xs uppercase tracking-wider text-muted-foreground">OpenCode API</div>
          <div class="text-sm font-mono truncate mt-0.5 {sandbox?.urls?.opencode ? 'text-foreground' : 'text-muted-foreground'}">
            {sandbox?.urls?.opencode ?? "Not configured"}
          </div>
        </div>
        {#if sandbox?.urls?.opencode}
          <Button 
            size="sm" 
            variant="outline" 
            onclick={() => openService(sandbox?.urls?.opencode, "OpenCode", "opencode")}
            class="h-7 px-3 font-mono text-xs border-border/50 hover:border-[var(--cyber-cyan)]/50 hover:text-[var(--cyber-cyan)]"
          >
            Open
          </Button>
        {/if}
      </div>

      <!-- Code Server -->
      <div class="flex items-center justify-between p-3 rounded bg-background/30 border border-border/30">
        <div class="min-w-0 flex-1">
          <div class="font-mono text-xs uppercase tracking-wider text-muted-foreground">Code Server</div>
          <div class="text-sm font-mono truncate mt-0.5 {sandbox?.urls?.codeServer ? 'text-foreground' : 'text-muted-foreground'}">
            {sandbox?.urls?.codeServer ?? "Not configured"}
          </div>
        </div>
        {#if sandbox?.urls?.codeServer}
          <Button 
            size="sm" 
            variant="outline" 
            onclick={() => openService(sandbox?.urls?.codeServer, "Code Server", "code-server")}
            class="h-7 px-3 font-mono text-xs border-border/50 hover:border-[var(--cyber-magenta)]/50 hover:text-[var(--cyber-magenta)]"
          >
            Open
          </Button>
        {/if}
      </div>

      <!-- VNC/Desktop -->
      {#if sandbox?.urls?.vnc}
        <div class="flex items-center justify-between p-3 rounded bg-background/30 border border-border/30">
          <div class="min-w-0 flex-1">
            <div class="font-mono text-xs uppercase tracking-wider text-muted-foreground">Desktop (VNC)</div>
            <div class="text-sm font-mono truncate mt-0.5 text-foreground">
              {sandbox.urls.vnc}
            </div>
          </div>
          <Button 
            size="sm" 
            variant="outline" 
            onclick={() => openService(sandbox?.urls?.vnc, "Desktop", "vnc")}
            class="h-7 px-3 font-mono text-xs border-border/50 hover:border-[var(--cyber-amber)]/50 hover:text-[var(--cyber-amber)]"
          >
            Open
          </Button>
        </div>
      {/if}
    </div>
  </div>

  <!-- Container Status Section -->
  <div class="cyber-card corner-accent overflow-hidden animate-fade-in-up stagger-1">
    <div class="py-3 px-4 border-b border-border/30 bg-background/30 backdrop-blur-sm">
      <div class="flex items-center justify-between">
        <h3 class="font-mono text-xs uppercase tracking-wider text-[var(--cyber-cyan)]">
          [container_status]
        </h3>
        <span class="px-2 py-0.5 rounded text-xs font-mono" 
              style="color: {getStatusColor(sandbox?.status)}; 
                     background: color-mix(in oklch, {getStatusColor(sandbox?.status)} 10%, transparent); 
                     border: 1px solid color-mix(in oklch, {getStatusColor(sandbox?.status)} 30%, transparent);">
          {sandbox?.status ?? "Unknown"}
        </span>
      </div>
    </div>
    
    <div class="p-4">
      {#if sandbox?.status !== "running"}
        <div class="text-center py-8">
          <div class="font-mono text-3xl text-[var(--cyber-amber)]/30 mb-3">⚡</div>
          <p class="text-sm font-mono text-muted-foreground">
            Start the sandbox to view resource usage
          </p>
        </div>
      {:else}
        <div class="space-y-3">
          {#if stats}
            <!-- CPU Usage -->
            <div class="flex items-center justify-between p-3 rounded bg-background/30 border border-border/30">
              <div>
                <div class="font-mono text-xs uppercase tracking-wider text-muted-foreground">CPU Usage</div>
                <div class="text-xs font-mono text-muted-foreground/70 mt-0.5">Current utilization</div>
              </div>
              <div class="text-right">
                <div class="font-mono text-lg" style="color: {stats.cpuPercent > 80 ? 'var(--cyber-red)' : stats.cpuPercent > 50 ? 'var(--cyber-amber)' : 'var(--cyber-emerald)'}">
                  {stats.cpuPercent.toFixed(1)}%
                </div>
              </div>
            </div>
            
            <!-- Memory Usage -->
            <div class="flex items-center justify-between p-3 rounded bg-background/30 border border-border/30">
              <div>
                <div class="font-mono text-xs uppercase tracking-wider text-muted-foreground">Memory</div>
                <div class="text-xs font-mono text-muted-foreground/70 mt-0.5">
                  {formatBytes(stats.memoryUsage)} / {formatBytes(stats.memoryLimit)}
                </div>
              </div>
              <div class="text-right">
                <div class="font-mono text-lg" style="color: {stats.memoryPercent > 80 ? 'var(--cyber-red)' : stats.memoryPercent > 50 ? 'var(--cyber-amber)' : 'var(--cyber-emerald)'}">
                  {stats.memoryPercent.toFixed(1)}%
                </div>
              </div>
            </div>

            <!-- Network I/O -->
            <div class="flex items-center justify-between p-3 rounded bg-background/30 border border-border/30">
              <div>
                <div class="font-mono text-xs uppercase tracking-wider text-muted-foreground">Network I/O</div>
                <div class="text-xs font-mono text-muted-foreground/70 mt-0.5">Received / Transmitted</div>
              </div>
              <div class="text-right font-mono text-sm text-[var(--cyber-cyan)]">
                {formatBytes(stats.networkRx)} / {formatBytes(stats.networkTx)}
              </div>
            </div>

            <!-- Block I/O -->
            <div class="flex items-center justify-between p-3 rounded bg-background/30 border border-border/30">
              <div>
                <div class="font-mono text-xs uppercase tracking-wider text-muted-foreground">Disk I/O</div>
                <div class="text-xs font-mono text-muted-foreground/70 mt-0.5">Read / Write</div>
              </div>
              <div class="text-right font-mono text-sm text-[var(--cyber-magenta)]">
                {formatBytes(stats.blockRead)} / {formatBytes(stats.blockWrite)}
              </div>
            </div>
          {:else if isLoadingStats}
            <div class="text-center py-6">
              <div class="relative mx-auto w-8 h-8">
                <div class="absolute inset-0 rounded-full border-2 border-[var(--cyber-cyan)]/20"></div>
                <div class="absolute inset-0 rounded-full border-2 border-transparent border-t-[var(--cyber-cyan)] animate-spin"></div>
              </div>
              <p class="mt-3 text-xs font-mono text-muted-foreground">Loading stats...</p>
            </div>
          {/if}
          
          <Button 
            size="sm" 
            variant="outline" 
            onclick={refreshStats} 
            disabled={isLoadingStats}
            class="w-full h-8 font-mono text-xs uppercase tracking-wider border-border/50
                   hover:border-[var(--cyber-cyan)]/50 hover:text-[var(--cyber-cyan)]"
          >
            {isLoadingStats ? "Refreshing..." : "↻ Refresh Stats"}
          </Button>
        </div>
      {/if}
    </div>
  </div>

  <!-- Container Info Section -->
  <div class="cyber-card corner-accent overflow-hidden animate-fade-in-up stagger-2">
    <div class="py-3 px-4 border-b border-border/30 bg-background/30 backdrop-blur-sm">
      <h3 class="font-mono text-xs uppercase tracking-wider text-[var(--cyber-cyan)]">
        [container_info]
      </h3>
    </div>
    
    <div class="p-4">
      <div class="grid grid-cols-2 gap-4 text-sm">
        <div>
          <div class="font-mono text-xs uppercase tracking-wider text-muted-foreground">Container ID</div>
          <div class="font-mono truncate mt-0.5 text-[var(--cyber-cyan)]" title={sandbox?.containerId}>
            {sandbox?.containerId?.slice(0, 12) ?? "N/A"}
          </div>
        </div>
        <div>
          <div class="font-mono text-xs uppercase tracking-wider text-muted-foreground">Image</div>
          <div class="font-mono truncate mt-0.5" title={sandbox?.image}>
            {sandbox?.image ?? "N/A"}
          </div>
        </div>
        <div>
          <div class="font-mono text-xs uppercase tracking-wider text-muted-foreground">Created</div>
          <div class="font-mono mt-0.5">
            {sandbox?.createdAt ? new Date(sandbox.createdAt).toLocaleString() : "N/A"}
          </div>
        </div>
        <div>
          <div class="font-mono text-xs uppercase tracking-wider text-muted-foreground">Started</div>
          <div class="font-mono mt-0.5">
            {sandbox?.startedAt ? new Date(sandbox.startedAt).toLocaleString() : "N/A"}
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Repository Info Section -->
  {#if sandboxInfo?.repository}
    <div class="cyber-card corner-accent overflow-hidden animate-fade-in-up stagger-3">
      <div class="py-3 px-4 border-b border-border/30 bg-background/30 backdrop-blur-sm">
        <h3 class="font-mono text-xs uppercase tracking-wider text-[var(--cyber-cyan)]">
          [repository_info]
        </h3>
      </div>
      
      <div class="p-4">
        <div class="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div class="font-mono text-xs uppercase tracking-wider text-muted-foreground">Name</div>
            <div class="font-mono mt-0.5">{sandboxInfo.repository.name}</div>
          </div>
          <div>
            <div class="font-mono text-xs uppercase tracking-wider text-muted-foreground">Branch</div>
            <div class="font-mono mt-0.5 text-[var(--cyber-magenta)]">{sandboxInfo.repository.currentBranch}</div>
          </div>
          <div>
            <div class="font-mono text-xs uppercase tracking-wider text-muted-foreground">Path</div>
            <div class="font-mono truncate mt-0.5" title={sandboxInfo.repository.path}>
              {sandboxInfo.repository.path}
            </div>
          </div>
          <div>
            <div class="font-mono text-xs uppercase tracking-wider text-muted-foreground">Status</div>
            <span class="inline-block mt-0.5 px-2 py-0.5 rounded text-xs font-mono"
                  style="color: {sandboxInfo.repository.isDirty ? 'var(--cyber-amber)' : 'var(--cyber-emerald)'}; 
                         background: color-mix(in oklch, {sandboxInfo.repository.isDirty ? 'var(--cyber-amber)' : 'var(--cyber-emerald)'} 10%, transparent); 
                         border: 1px solid color-mix(in oklch, {sandboxInfo.repository.isDirty ? 'var(--cyber-amber)' : 'var(--cyber-emerald)'} 30%, transparent);">
              {sandboxInfo.repository.isDirty ? "Modified" : "Clean"}
            </span>
          </div>
        </div>
      </div>
    </div>
  {/if}

  <!-- Quick Actions -->
  {#if sandbox?.status === "running"}
    <div class="cyber-card corner-accent overflow-hidden animate-fade-in-up stagger-4">
      <div class="py-3 px-4 border-b border-border/30 bg-background/30 backdrop-blur-sm">
        <h3 class="font-mono text-xs uppercase tracking-wider text-[var(--cyber-cyan)]">
          [quick_actions]
        </h3>
      </div>
      
      <div class="p-4">
        <div class="flex flex-wrap gap-2">
          {#if sandbox.urls?.opencode}
            <Button 
              size="sm" 
              variant="outline" 
              onclick={() => openService(sandbox?.urls?.opencode, "OpenCode", "opencode")}
              class="h-8 px-4 font-mono text-xs uppercase tracking-wider border-border/50
                     hover:border-[var(--cyber-cyan)]/50 hover:text-[var(--cyber-cyan)]"
            >
              OpenCode
            </Button>
          {/if}
          {#if sandbox.urls?.codeServer}
            <Button 
              size="sm" 
              variant="outline" 
              onclick={() => openService(sandbox?.urls?.codeServer, "Code Server", "code-server")}
              class="h-8 px-4 font-mono text-xs uppercase tracking-wider border-border/50
                     hover:border-[var(--cyber-magenta)]/50 hover:text-[var(--cyber-magenta)]"
            >
              Code Server
            </Button>
          {/if}
          {#if sandbox.urls?.vnc}
            <Button 
              size="sm" 
              variant="outline" 
              onclick={() => openService(sandbox?.urls?.vnc, "Desktop", "vnc")}
              class="h-8 px-4 font-mono text-xs uppercase tracking-wider border-border/50
                     hover:border-[var(--cyber-amber)]/50 hover:text-[var(--cyber-amber)]"
            >
              Desktop
            </Button>
          {/if}
        </div>
      </div>
    </div>
  {/if}
  </div>
</div>

<!-- Restart Confirmation Dialog -->
<Dialog.Root bind:open={showRestartDialog}>
  <Dialog.Content class="cyber-card border-border/50">
    <Dialog.Header>
      <Dialog.Title class="font-bold font-heading">
        Restart Container
      </Dialog.Title>
      <Dialog.Description class="font-mono text-sm text-muted-foreground">
        This will restart the sandbox container. Any unsaved work in the container will be lost.
      </Dialog.Description>
    </Dialog.Header>
    
    {#if restartError}
      <div class="p-3 rounded border border-[var(--cyber-red)]/50 bg-[var(--cyber-red)]/5">
        <div class="flex items-center gap-2 text-[var(--cyber-red)]">
          <span class="font-mono text-xs uppercase tracking-wider">[error]</span>
          <span class="text-sm">{restartError}</span>
        </div>
      </div>
    {/if}
    
    <Dialog.Footer class="gap-2">
      <Button 
        variant="outline" 
        onclick={() => showRestartDialog = false} 
        disabled={isRestarting}
        class="font-mono text-xs uppercase tracking-wider"
      >
        Cancel
      </Button>
      <Button 
        onclick={handleRestart} 
        disabled={isRestarting}
        class="font-mono text-xs uppercase tracking-wider bg-[var(--cyber-amber)] hover:bg-[var(--cyber-amber)]/90 text-black"
      >
        {isRestarting ? "Restarting..." : "Restart"}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
