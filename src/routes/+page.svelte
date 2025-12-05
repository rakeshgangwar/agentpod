<script lang="ts">
  import { connection, connect, disconnect, testConnection } from "$lib/stores/connection.svelte";
  import { projects, fetchProjects, startProject, stopProject, deleteProject, createProject } from "$lib/stores/projects.svelte";
  import { onMount } from "svelte";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import * as Card from "$lib/components/ui/card";
  import { Badge } from "$lib/components/ui/badge";
  import { Skeleton } from "$lib/components/ui/skeleton";

  // Setup form state
  let apiUrl = $state("");
  let apiKey = $state("");
  let isConnecting = $state(false);
  let connectionError = $state<string | null>(null);

  // Create project form state
  let showCreateForm = $state(false);
  let newProjectName = $state("");
  let newProjectDescription = $state("");
  let isCreating = $state(false);

  // Load projects when connected
  $effect(() => {
    if (connection.isConnected) {
      fetchProjects();
    }
  });

  async function handleConnect(e: Event) {
    e.preventDefault();
    isConnecting = true;
    connectionError = null;

    const success = await connect(apiUrl, apiKey || undefined);
    
    if (!success) {
      connectionError = connection.error || "Connection failed";
    }
    
    isConnecting = false;
  }

  async function handleDisconnect() {
    await disconnect();
  }

  async function handleCreateProject(e: Event) {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    
    isCreating = true;
    const project = await createProject({
      name: newProjectName,
      description: newProjectDescription || undefined,
    });
    
    if (project) {
      showCreateForm = false;
      newProjectName = "";
      newProjectDescription = "";
    }
    isCreating = false;
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
  {#if !connection.isConnected}
    <!-- Setup Screen -->
    <div class="flex flex-col items-center justify-center min-h-[80vh]">
      <Card.Root class="w-full max-w-md">
        <Card.Header>
          <Card.Title class="text-2xl text-center">Welcome to CodeOpen</Card.Title>
          <Card.Description class="text-center">
            Connect to your Management API to get started
          </Card.Description>
        </Card.Header>
        <Card.Content>
          <form onsubmit={handleConnect} class="space-y-4">
            <div class="space-y-2">
              <Label for="api-url">API URL</Label>
              <Input
                id="api-url"
                type="url"
                placeholder="https://api.example.com"
                bind:value={apiUrl}
                required
              />
            </div>
            <div class="space-y-2">
              <Label for="api-key">API Key (optional)</Label>
              <Input
                id="api-key"
                type="password"
                placeholder="Enter API key..."
                bind:value={apiKey}
              />
            </div>
            {#if connectionError}
              <div class="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                {connectionError}
              </div>
            {/if}
            <Button type="submit" class="w-full" disabled={isConnecting || !apiUrl}>
              {isConnecting ? "Connecting..." : "Connect"}
            </Button>
          </form>
        </Card.Content>
      </Card.Root>
    </div>
  {:else}
    <!-- Connected: Show Projects -->
    <div class="space-y-6">
      <!-- Header -->
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 class="text-3xl font-bold">Projects</h1>
          <p class="text-muted-foreground">
            Connected to {connection.apiUrl}
          </p>
        </div>
        <div class="flex gap-2">
          <Button variant="outline" onclick={() => showCreateForm = !showCreateForm}>
            {showCreateForm ? "Cancel" : "New Project"}
          </Button>
          <Button variant="ghost" onclick={handleDisconnect}>
            Disconnect
          </Button>
        </div>
      </div>

      <!-- Create Project Form -->
      {#if showCreateForm}
        <Card.Root>
          <Card.Header>
            <Card.Title>Create New Project</Card.Title>
          </Card.Header>
          <Card.Content>
            <form onsubmit={handleCreateProject} class="space-y-4">
              <div class="grid gap-4 sm:grid-cols-2">
                <div class="space-y-2">
                  <Label for="project-name">Project Name</Label>
                  <Input
                    id="project-name"
                    placeholder="My Project"
                    bind:value={newProjectName}
                    required
                  />
                </div>
                <div class="space-y-2">
                  <Label for="project-desc">Description (optional)</Label>
                  <Input
                    id="project-desc"
                    placeholder="Project description..."
                    bind:value={newProjectDescription}
                  />
                </div>
              </div>
              <Button type="submit" disabled={isCreating || !newProjectName.trim()}>
                {isCreating ? "Creating..." : "Create Project"}
              </Button>
            </form>
          </Card.Content>
        </Card.Root>
      {/if}

      <!-- Error Display -->
      {#if projects.error}
        <div class="text-sm text-destructive bg-destructive/10 p-4 rounded-md">
          {projects.error}
        </div>
      {/if}

      <!-- Projects Grid -->
      {#if projects.isLoading && projects.list.length === 0}
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {#each [1, 2, 3] as _}
            <Card.Root>
              <Card.Header>
                <Skeleton class="h-6 w-3/4" />
                <Skeleton class="h-4 w-1/2" />
              </Card.Header>
              <Card.Content>
                <Skeleton class="h-4 w-full" />
              </Card.Content>
              <Card.Footer>
                <Skeleton class="h-9 w-20" />
              </Card.Footer>
            </Card.Root>
          {/each}
        </div>
      {:else if projects.list.length === 0}
        <Card.Root>
          <Card.Content class="py-12 text-center">
            <p class="text-muted-foreground">No projects yet.</p>
            <p class="text-sm text-muted-foreground mt-1">
              Click "New Project" to create your first project.
            </p>
          </Card.Content>
        </Card.Root>
      {:else}
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {#each projects.list as project (project.id)}
            <Card.Root>
              <Card.Header>
                <div class="flex items-start justify-between">
                  <div>
                    <Card.Title class="text-lg">{project.name}</Card.Title>
                    <Card.Description class="text-sm">
                      {project.slug}
                    </Card.Description>
                  </div>
                  <Badge variant={getStatusColor(project.status)}>
                    {project.status}
                  </Badge>
                </div>
              </Card.Header>
              {#if project.description}
                <Card.Content>
                  <p class="text-sm text-muted-foreground line-clamp-2">
                    {project.description}
                  </p>
                </Card.Content>
              {/if}
              <Card.Footer class="flex gap-2">
                {#if project.status === "stopped"}
                  <Button 
                    size="sm" 
                    onclick={() => startProject(project.id)}
                    disabled={projects.isLoading}
                  >
                    Start
                  </Button>
                {:else if project.status === "running"}
                  <Button 
                    size="sm" 
                    variant="secondary"
                    onclick={() => stopProject(project.id)}
                    disabled={projects.isLoading}
                  >
                    Stop
                  </Button>
                {/if}
                <Button 
                  size="sm" 
                  variant="destructive"
                  onclick={() => {
                    if (confirm(`Delete project "${project.name}"?`)) {
                      deleteProject(project.id);
                    }
                  }}
                  disabled={projects.isLoading}
                >
                  Delete
                </Button>
              </Card.Footer>
            </Card.Root>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</main>
