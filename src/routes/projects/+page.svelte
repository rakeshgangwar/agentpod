<script lang="ts">
  import { goto } from "$app/navigation";
  import { connection } from "$lib/stores/connection.svelte";
  import { projects, fetchProjects, startProject, stopProject, deleteProject, createProject } from "$lib/stores/projects.svelte";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import * as Card from "$lib/components/ui/card";
  import { Badge } from "$lib/components/ui/badge";
  import { Skeleton } from "$lib/components/ui/skeleton";

  // Redirect if not connected
  $effect(() => {
    if (!connection.isConnected) {
      goto("/setup");
    }
  });

  // Load projects when connected
  $effect(() => {
    if (connection.isConnected) {
      fetchProjects();
    }
  });

  // Create project form state
  let showCreateForm = $state(false);
  let newProjectName = $state("");
  let newProjectDescription = $state("");
  let isCreating = $state(false);

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

  function handleProjectClick(projectId: string) {
    goto(`/projects/${projectId}`);
  }
</script>

<main class="container mx-auto px-4 py-8 max-w-6xl">
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h1 class="text-3xl font-bold">Projects</h1>
        <p class="text-muted-foreground text-sm">
          {connection.apiUrl}
        </p>
      </div>
      <div class="flex gap-2">
        <Button variant="outline" onclick={() => showCreateForm = !showCreateForm}>
          {showCreateForm ? "Cancel" : "New Project"}
        </Button>
        <Button variant="ghost" onclick={() => goto("/settings")}>
          Settings
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
          <Card.Root class="cursor-pointer hover:shadow-md transition-shadow" onclick={() => handleProjectClick(project.id)}>
            <Card.Header>
              <div class="flex items-start justify-between">
                <div class="min-w-0 flex-1">
                  <Card.Title class="text-lg truncate">{project.name}</Card.Title>
                  <Card.Description class="text-sm truncate">
                    {project.slug}
                  </Card.Description>
                </div>
                <Badge variant={getStatusColor(project.status)} class="ml-2 shrink-0">
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
            <Card.Footer class="flex flex-wrap gap-2">
              {#if project.status === "stopped"}
                <Button 
                  size="sm" 
                  onclick={(e: MouseEvent) => { e.stopPropagation(); startProject(project.id); }}
                  disabled={projects.isLoading}
                >
                  Start
                </Button>
              {:else if project.status === "running"}
                <Button 
                  size="sm" 
                  variant="secondary"
                  onclick={(e: MouseEvent) => { e.stopPropagation(); stopProject(project.id); }}
                  disabled={projects.isLoading}
                >
                  Stop
                </Button>
              {/if}
              <Button 
                size="sm" 
                variant="destructive"
                onclick={(e: MouseEvent) => {
                  e.stopPropagation();
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
</main>
