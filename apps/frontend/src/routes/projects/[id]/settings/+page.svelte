<script lang="ts">
  import { page } from "$app/stores";
  import { sandboxes, fetchSandbox, getSandboxStats } from "$lib/stores/sandboxes.svelte";
  import type { Sandbox, SandboxStats, SandboxInfo } from "$lib/api/tauri";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { onMount } from "svelte";
  import { openServiceWindow, type ServiceType } from "$lib/utils/service-window";

  // Get current sandbox ID from route params
  let sandboxId = $derived($page.params.id ?? "");

  // Local state for sandbox info
  let sandboxInfo = $state<SandboxInfo | null>(null);
  let stats = $state<SandboxStats | null>(null);
  let isLoadingStats = $state(false);

  // Get current sandbox from list (quick access)
  let sandbox = $derived(sandboxInfo?.sandbox ?? sandboxes.list.find(s => s.id === sandboxId));

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

  function getStatusBadgeVariant(status: string | undefined): "default" | "secondary" | "destructive" | "outline" {
    switch (status) {
      case "running": return "default";
      case "paused": return "secondary";
      case "exited":
      case "dead": return "destructive";
      default: return "outline";
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

<div class="space-y-6">
  <h2 class="text-xl font-semibold">Sandbox Settings</h2>

  <!-- Service URLs Section -->
  <div class="border rounded-lg p-4 space-y-4">
    <h3 class="font-medium">Service URLs</h3>
    
    <div class="grid gap-3">
      <!-- Homepage URL -->
      {#if sandbox?.urls?.homepage}
        <div class="flex items-center justify-between p-3 bg-muted/50 rounded">
          <div class="min-w-0 flex-1">
            <div class="font-medium">Homepage URL</div>
            <div class="text-sm text-muted-foreground truncate">
              {sandbox.urls.homepage}
            </div>
          </div>
          <Button size="sm" variant="outline" onclick={() => openService(sandbox?.urls?.homepage, "Homepage", "opencode")}>
            Open
          </Button>
        </div>
      {/if}

      <!-- OpenCode API -->
      <div class="flex items-center justify-between p-3 bg-muted/50 rounded">
        <div class="min-w-0 flex-1">
          <div class="font-medium">OpenCode API</div>
          <div class="text-sm text-muted-foreground truncate">
            {sandbox?.urls?.opencode ?? "Not configured"}
          </div>
        </div>
        {#if sandbox?.urls?.opencode}
          <Button size="sm" variant="outline" onclick={() => openService(sandbox?.urls?.opencode, "OpenCode", "opencode")}>
            Open
          </Button>
        {/if}
      </div>

      <!-- Code Server -->
      <div class="flex items-center justify-between p-3 bg-muted/50 rounded">
        <div class="min-w-0 flex-1">
          <div class="font-medium">Code Server</div>
          <div class="text-sm text-muted-foreground truncate">
            {sandbox?.urls?.codeServer ?? "Not configured"}
          </div>
        </div>
        {#if sandbox?.urls?.codeServer}
          <Button size="sm" variant="outline" onclick={() => openService(sandbox?.urls?.codeServer, "Code Server", "code-server")}>
            Open
          </Button>
        {/if}
      </div>

      <!-- VNC/Desktop (only show if available) -->
      {#if sandbox?.urls?.vnc}
        <div class="flex items-center justify-between p-3 bg-muted/50 rounded">
          <div class="min-w-0 flex-1">
            <div class="font-medium">Desktop (VNC)</div>
            <div class="text-sm text-muted-foreground truncate">
              {sandbox.urls.vnc}
            </div>
          </div>
          <Button size="sm" variant="outline" onclick={() => openService(sandbox?.urls?.vnc, "Desktop", "vnc")}>
            Open
          </Button>
        </div>
      {/if}
    </div>
  </div>

  <!-- Container Status Section -->
  <div class="border rounded-lg p-4 space-y-4">
    <div class="flex items-center justify-between">
      <h3 class="font-medium">Container Status</h3>
      <Badge variant={getStatusBadgeVariant(sandbox?.status)}>
        {sandbox?.status ?? "Unknown"}
      </Badge>
    </div>
    
    {#if sandbox?.status !== "running"}
      <div class="text-sm text-muted-foreground p-3 bg-muted/30 rounded">
        Start the sandbox to view resource usage.
      </div>
    {:else}
      <div class="grid gap-3">
        {#if stats}
          <!-- CPU Usage -->
          <div class="flex items-center justify-between p-3 bg-muted/50 rounded">
            <div>
              <div class="font-medium">CPU Usage</div>
              <div class="text-sm text-muted-foreground">Current utilization</div>
            </div>
            <div class="text-right">
              <div class="font-mono text-lg">{stats.cpuPercent.toFixed(1)}%</div>
            </div>
          </div>
          
          <!-- Memory Usage -->
          <div class="flex items-center justify-between p-3 bg-muted/50 rounded">
            <div>
              <div class="font-medium">Memory Usage</div>
              <div class="text-sm text-muted-foreground">
                {formatBytes(stats.memoryUsage)} / {formatBytes(stats.memoryLimit)}
              </div>
            </div>
            <div class="text-right">
              <div class="font-mono text-lg">{stats.memoryPercent.toFixed(1)}%</div>
            </div>
          </div>

          <!-- Network I/O -->
          <div class="flex items-center justify-between p-3 bg-muted/50 rounded">
            <div>
              <div class="font-medium">Network I/O</div>
              <div class="text-sm text-muted-foreground">Received / Transmitted</div>
            </div>
            <div class="text-right font-mono text-sm">
              <div>{formatBytes(stats.networkRx)} / {formatBytes(stats.networkTx)}</div>
            </div>
          </div>

          <!-- Block I/O -->
          <div class="flex items-center justify-between p-3 bg-muted/50 rounded">
            <div>
              <div class="font-medium">Disk I/O</div>
              <div class="text-sm text-muted-foreground">Read / Write</div>
            </div>
            <div class="text-right font-mono text-sm">
              <div>{formatBytes(stats.blockRead)} / {formatBytes(stats.blockWrite)}</div>
            </div>
          </div>
        {:else if isLoadingStats}
          <div class="text-sm text-muted-foreground p-3 bg-muted/30 rounded">
            Loading stats...
          </div>
        {/if}
        
        <Button size="sm" variant="outline" onclick={refreshStats} disabled={isLoadingStats}>
          {isLoadingStats ? "Refreshing..." : "Refresh Stats"}
        </Button>
      </div>
    {/if}
  </div>

  <!-- Container Info Section -->
  <div class="border rounded-lg p-4 space-y-4">
    <h3 class="font-medium">Container Info</h3>
    
    <div class="grid grid-cols-2 gap-4 text-sm">
      <div>
        <div class="text-muted-foreground">Container ID</div>
        <div class="font-mono truncate" title={sandbox?.containerId}>
          {sandbox?.containerId?.slice(0, 12) ?? "N/A"}
        </div>
      </div>
      <div>
        <div class="text-muted-foreground">Image</div>
        <div class="font-mono truncate" title={sandbox?.image}>
          {sandbox?.image ?? "N/A"}
        </div>
      </div>
      <div>
        <div class="text-muted-foreground">Created</div>
        <div class="font-mono">
          {sandbox?.createdAt ? new Date(sandbox.createdAt).toLocaleString() : "N/A"}
        </div>
      </div>
      <div>
        <div class="text-muted-foreground">Started</div>
        <div class="font-mono">
          {sandbox?.startedAt ? new Date(sandbox.startedAt).toLocaleString() : "N/A"}
        </div>
      </div>
    </div>
  </div>

  <!-- Repository Info Section -->
  {#if sandboxInfo?.repository}
    <div class="border rounded-lg p-4 space-y-4">
      <h3 class="font-medium">Repository Info</h3>
      
      <div class="grid grid-cols-2 gap-4 text-sm">
        <div>
          <div class="text-muted-foreground">Name</div>
          <div class="font-mono">{sandboxInfo.repository.name}</div>
        </div>
        <div>
          <div class="text-muted-foreground">Branch</div>
          <div class="font-mono">{sandboxInfo.repository.currentBranch}</div>
        </div>
        <div>
          <div class="text-muted-foreground">Path</div>
          <div class="font-mono truncate" title={sandboxInfo.repository.path}>
            {sandboxInfo.repository.path}
          </div>
        </div>
        <div>
          <div class="text-muted-foreground">Status</div>
          <Badge variant={sandboxInfo.repository.isDirty ? "secondary" : "outline"}>
            {sandboxInfo.repository.isDirty ? "Modified" : "Clean"}
          </Badge>
        </div>
      </div>
    </div>
  {/if}

  <!-- Quick Actions -->
  {#if sandbox?.status === "running"}
    <div class="border rounded-lg p-4 space-y-3">
      <h3 class="font-medium">Quick Actions</h3>
      <div class="flex flex-wrap gap-2">
        {#if sandbox.urls?.opencode}
          <Button size="sm" variant="outline" onclick={() => openService(sandbox?.urls?.opencode, "OpenCode", "opencode")}>
            Open OpenCode
          </Button>
        {/if}
        {#if sandbox.urls?.codeServer}
          <Button size="sm" variant="outline" onclick={() => openService(sandbox?.urls?.codeServer, "Code Server", "code-server")}>
            Open Code Server
          </Button>
        {/if}
        {#if sandbox.urls?.vnc}
          <Button size="sm" variant="outline" onclick={() => openService(sandbox?.urls?.vnc, "Desktop", "vnc")}>
            Open Desktop
          </Button>
        {/if}
      </div>
    </div>
  {/if}
</div>
