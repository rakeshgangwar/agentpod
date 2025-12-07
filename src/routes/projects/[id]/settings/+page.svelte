<script lang="ts">
  import { page } from "$app/stores";
  import { getProject, fetchProject } from "$lib/stores/projects.svelte";
  import * as api from "$lib/api/tauri";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { onMount } from "svelte";

  // Get current project ID from route params
  let projectId = $derived($page.params.id ?? "");

  // Get current project
  let project = $derived(projectId ? getProject(projectId) : undefined);

  // Health check states
  let opencodeHealth = $state<boolean | null>(null);
  let isCheckingHealth = $state(false);

  async function checkHealth() {
    if (!project) return;
    isCheckingHealth = true;
    try {
      const result = await api.opencodeHealthCheck(project.id);
      opencodeHealth = result.healthy;
    } catch (e) {
      opencodeHealth = false;
    } finally {
      isCheckingHealth = false;
    }
  }

  // Check health on mount and when project changes
  onMount(() => {
    if (project && project.status === "running") {
      checkHealth();
    }
  });

  $effect(() => {
    if (project && project.status === "running") {
      checkHealth();
    } else {
      opencodeHealth = null;
    }
  });

  function getHealthBadgeVariant(health: boolean | null): "default" | "secondary" | "destructive" | "outline" {
    if (health === null) return "outline";
    return health ? "default" : "destructive";
  }

  function getHealthText(health: boolean | null): string {
    if (health === null) return "Unknown";
    return health ? "Healthy" : "Unhealthy";
  }

  function openUrl(url: string | null | undefined) {
    if (url) {
      window.open(url, "_blank");
    }
  }
</script>

<div class="space-y-6">
  <h2 class="text-xl font-semibold">Project Settings</h2>

  <!-- Service URLs Section -->
  <div class="border rounded-lg p-4 space-y-4">
    <h3 class="font-medium">Service URLs</h3>
    
    <div class="grid gap-3">
      <!-- OpenCode API -->
      <div class="flex items-center justify-between p-3 bg-muted/50 rounded">
        <div class="min-w-0 flex-1">
          <div class="font-medium">OpenCode API</div>
          <div class="text-sm text-muted-foreground truncate">
            {project?.fqdnUrl ?? "Not configured"}
          </div>
        </div>
        {#if project?.fqdnUrl}
          <Button size="sm" variant="outline" onclick={() => openUrl(project?.fqdnUrl)}>
            Open
          </Button>
        {/if}
      </div>

      <!-- Code Server -->
      <div class="flex items-center justify-between p-3 bg-muted/50 rounded">
        <div class="min-w-0 flex-1">
          <div class="font-medium">Code Server</div>
          <div class="text-sm text-muted-foreground truncate">
            {project?.codeServerUrl ?? "Not configured"}
          </div>
        </div>
        {#if project?.codeServerUrl}
          <Button size="sm" variant="outline" onclick={() => openUrl(project?.codeServerUrl)}>
            Open
          </Button>
        {/if}
      </div>

      <!-- VNC/Desktop (only show if available) -->
      {#if project?.vncUrl}
        <div class="flex items-center justify-between p-3 bg-muted/50 rounded">
          <div class="min-w-0 flex-1">
            <div class="font-medium">Desktop (VNC)</div>
            <div class="text-sm text-muted-foreground truncate">
              {project.vncUrl}
            </div>
          </div>
          <Button size="sm" variant="outline" onclick={() => openUrl(project?.vncUrl)}>
            Open
          </Button>
        </div>
      {/if}
    </div>
  </div>

  <!-- Service Health Section -->
  <div class="border rounded-lg p-4 space-y-4">
    <div class="flex items-center justify-between">
      <h3 class="font-medium">Service Health</h3>
      <Button 
        size="sm" 
        variant="outline" 
        onclick={checkHealth} 
        disabled={isCheckingHealth || project?.status !== "running"}
      >
        {isCheckingHealth ? "Checking..." : "Refresh"}
      </Button>
    </div>
    
    {#if project?.status !== "running"}
      <div class="text-sm text-muted-foreground p-3 bg-muted/30 rounded">
        Start the project to check service health.
      </div>
    {:else}
      <div class="grid gap-3">
        <!-- OpenCode Status -->
        <div class="flex items-center justify-between p-3 bg-muted/50 rounded">
          <div>
            <div class="font-medium">OpenCode API</div>
            <div class="text-sm text-muted-foreground">Port 4096</div>
          </div>
          <Badge variant={getHealthBadgeVariant(opencodeHealth)}>
            {getHealthText(opencodeHealth)}
          </Badge>
        </div>
        
        <!-- Code Server Status -->
        <div class="flex items-center justify-between p-3 bg-muted/50 rounded">
          <div>
            <div class="font-medium">Code Server</div>
            <div class="text-sm text-muted-foreground">Port 8080</div>
          </div>
          <Badge variant="outline">
            {project?.status === "running" ? "Running" : "Stopped"}
          </Badge>
        </div>

        <!-- VNC Status (only show if available) -->
        {#if project?.vncUrl}
          <div class="flex items-center justify-between p-3 bg-muted/50 rounded">
            <div>
              <div class="font-medium">Desktop (VNC)</div>
              <div class="text-sm text-muted-foreground">Port 6080</div>
            </div>
            <Badge variant="outline">
              {project?.status === "running" ? "Running" : "Stopped"}
            </Badge>
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Container Info Section -->
  <div class="border rounded-lg p-4 space-y-4">
    <h3 class="font-medium">Container Info</h3>
    
    <div class="grid grid-cols-2 gap-4 text-sm">
      <div>
        <div class="text-muted-foreground">Container Port</div>
        <div class="font-mono">{project?.containerPort ?? "N/A"}</div>
      </div>
      <div>
        <div class="text-muted-foreground">Coolify App UUID</div>
        <div class="font-mono truncate" title={project?.coolifyAppUuid}>
          {project?.coolifyAppUuid?.slice(0, 8) ?? "N/A"}...
        </div>
      </div>
      <div>
        <div class="text-muted-foreground">Forgejo Owner</div>
        <div class="font-mono">{project?.forgejoOwner ?? "N/A"}</div>
      </div>
      <div>
        <div class="text-muted-foreground">Project Slug</div>
        <div class="font-mono">{project?.slug ?? "N/A"}</div>
      </div>
    </div>
  </div>

  <!-- Quick Actions -->
  {#if project?.status === "running"}
    <div class="border rounded-lg p-4 space-y-3">
      <h3 class="font-medium">Quick Actions</h3>
      <div class="flex flex-wrap gap-2">
        {#if project.fqdnUrl}
          <Button size="sm" variant="outline" onclick={() => openUrl(project?.fqdnUrl)}>
            Open OpenCode
          </Button>
        {/if}
        {#if project.codeServerUrl}
          <Button size="sm" variant="outline" onclick={() => openUrl(project?.codeServerUrl)}>
            Open Code Server
          </Button>
        {/if}
        {#if project.vncUrl}
          <Button size="sm" variant="outline" onclick={() => openUrl(project?.vncUrl)}>
            Open Desktop
          </Button>
        {/if}
      </div>
    </div>
  {/if}
</div>
