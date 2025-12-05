<script lang="ts">
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { connection } from "$lib/stores/connection.svelte";
  import { projects, fetchProjects, startProject, stopProject, getProject } from "$lib/stores/projects.svelte";
  import { Button } from "$lib/components/ui/button";
  import { Badge } from "$lib/components/ui/badge";
  import * as Tabs from "$lib/components/ui/tabs";

  let { children } = $props();

  // Redirect if not connected
  $effect(() => {
    if (!connection.isConnected) {
      goto("/setup");
    }
  });

  // Get current project ID from route params
  let projectId = $derived($page.params.id ?? "");

  // Get current project
  let project = $derived(projectId ? getProject(projectId) : undefined);

  // Get current tab from URL path
  let currentTab = $derived(() => {
    const path = $page.url.pathname;
    if (path.includes("/chat")) return "chat";
    if (path.includes("/files")) return "files";
    if (path.includes("/sync")) return "sync";
    return "chat";
  });

  // Load projects if not already loaded
  $effect(() => {
    if (connection.isConnected && projects.list.length === 0) {
      fetchProjects();
    }
  });

  function handleTabChange(value: string) {
    goto(`/projects/${projectId}/${value}`);
  }

  function getStatusColor(status: string): "default" | "secondary" | "destructive" | "outline" {
    switch (status) {
      case "running": return "default";
      case "stopped": return "secondary";
      case "error": return "destructive";
      case "creating": return "outline";
      default: return "outline";
    }
  }
</script>

<main class="container mx-auto px-4 py-8 max-w-6xl">
  {#if project}
    <div class="space-y-6">
      <!-- Header -->
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div class="flex items-center gap-4">
          <Button variant="ghost" size="sm" onclick={() => goto("/projects")}>
            ← Back
          </Button>
          <div>
            <div class="flex items-center gap-2">
              <h1 class="text-2xl font-bold">{project.name}</h1>
              <Badge variant={getStatusColor(project.status)}>
                {project.status}
              </Badge>
            </div>
            {#if project.description}
              <p class="text-muted-foreground text-sm">{project.description}</p>
            {/if}
          </div>
        </div>
        <div class="flex gap-2">
          {#if project.status === "stopped"}
            <Button size="sm" onclick={() => startProject(project.id)}>
              Start
            </Button>
          {:else if project.status === "running"}
            <Button size="sm" variant="secondary" onclick={() => stopProject(project.id)}>
              Stop
            </Button>
          {/if}
        </div>
      </div>

      <!-- Tabs Navigation -->
      <Tabs.Root value={currentTab()} onValueChange={handleTabChange}>
        <Tabs.List class="grid w-full grid-cols-3 max-w-md">
          <Tabs.Trigger value="chat">Chat</Tabs.Trigger>
          <Tabs.Trigger value="files">Files</Tabs.Trigger>
          <Tabs.Trigger value="sync">Sync</Tabs.Trigger>
        </Tabs.List>
      </Tabs.Root>

      <!-- Tab Content (children) -->
      <div class="min-h-[60vh]">
        {@render children()}
      </div>
    </div>
  {:else if projects.isLoading}
    <div class="flex items-center justify-center min-h-[60vh]">
      <div class="text-center">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
        <p class="mt-4 text-muted-foreground">Loading project...</p>
      </div>
    </div>
  {:else}
    <div class="flex items-center justify-center min-h-[60vh]">
      <div class="text-center">
        <p class="text-muted-foreground">Project not found</p>
        <Button variant="link" onclick={() => goto("/projects")}>
          Back to Projects
        </Button>
      </div>
    </div>
  {/if}
</main>
