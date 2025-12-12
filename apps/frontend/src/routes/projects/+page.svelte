<script lang="ts">
  import { goto } from "$app/navigation";
  import { confirm } from "@tauri-apps/plugin-dialog";
  import { connection } from "$lib/stores/connection.svelte";
  import { auth, logout } from "$lib/stores/auth.svelte";
  import { 
    sandboxes, 
    fetchSandboxes, 
    startSandbox, 
    stopSandbox, 
    deleteSandbox,
    checkDockerHealth 
  } from "$lib/stores/sandboxes.svelte";
  import { Button } from "$lib/components/ui/button";
  import * as Card from "$lib/components/ui/card";
  import { Badge } from "$lib/components/ui/badge";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import { Avatar, AvatarFallback } from "$lib/components/ui/avatar";

  // Redirect if not connected
  $effect(() => {
    if (!connection.isConnected) {
      goto("/login");
    }
  });

  async function handleLogout() {
    await logout();
    goto("/login");
  }

  // Check Docker health and load sandboxes when connected
  $effect(() => {
    if (connection.isConnected) {
      checkDockerHealth();
      fetchSandboxes();
    }
  });

  function getStatusColor(status: string): "default" | "secondary" | "destructive" | "outline" {
    switch (status) {
      case "running": return "default";
      case "exited": 
      case "created": return "secondary";
      case "dead":
      case "unknown": return "destructive";
      case "paused":
      case "restarting": return "outline";
      default: return "outline";
    }
  }

  function getStatusLabel(status: string): string {
    switch (status) {
      case "exited": return "stopped";
      case "created": return "created";
      default: return status;
    }
  }

  function handleSandboxClick(e: MouseEvent, sandboxId: string) {
    // Don't navigate if clicking on a button or inside a button
    const target = e.target as HTMLElement;
    if (target.closest('button')) {
      return;
    }
    goto(`/projects/${sandboxId}`);
  }

  // Extract project name from sandbox labels or name
  function getSandboxDisplayName(sandbox: { name: string; labels: Record<string, string> }): string {
    return sandbox.labels["agentpod.sandbox.name"] || sandbox.name;
  }

  function getSandboxSlug(sandbox: { labels: Record<string, string> }): string {
    return sandbox.labels["agentpod.sandbox.slug"] || "";
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
          {#if sandboxes.dockerHealthy !== null}
            <span class="ml-2">
              {#if sandboxes.dockerHealthy}
                <span class="text-green-600">Docker: healthy</span>
              {:else}
                <span class="text-red-600">Docker: unhealthy</span>
              {/if}
            </span>
          {/if}
        </p>
      </div>
      <div class="flex items-center gap-2">
        <Button onclick={() => goto("/projects/new")}>
          New Project
        </Button>
        <Button variant="ghost" onclick={() => goto("/settings")}>
          Settings
        </Button>
        
        <!-- User Menu -->
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            <Button variant="ghost" size="icon" class="rounded-full">
              <Avatar class="h-8 w-8">
                <AvatarFallback class="text-xs">{auth.initials}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="end" class="w-56">
            <DropdownMenu.Label>
              <div class="flex flex-col space-y-1">
                <p class="text-sm font-medium leading-none">{auth.displayName}</p>
                {#if auth.user?.email}
                  <p class="text-xs leading-none text-muted-foreground">{auth.user.email}</p>
                {/if}
              </div>
            </DropdownMenu.Label>
            <DropdownMenu.Separator />
            <DropdownMenu.Item onclick={() => goto("/settings")}>
              Settings
            </DropdownMenu.Item>
            <DropdownMenu.Separator />
            <DropdownMenu.Item onclick={handleLogout} class="text-destructive focus:text-destructive">
              Log out
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </div>
    </div>

    <!-- Error Display -->
    {#if sandboxes.error}
      <div class="text-sm text-destructive bg-destructive/10 p-4 rounded-md">
        {sandboxes.error}
      </div>
    {/if}

    <!-- Docker Health Warning -->
    {#if sandboxes.dockerHealthy === false}
      <div class="text-sm text-amber-600 bg-amber-50 dark:bg-amber-900/20 p-4 rounded-md">
        Docker daemon is not accessible. Please ensure Docker is running.
      </div>
    {/if}

    <!-- Projects Grid -->
    {#if sandboxes.isLoading && sandboxes.list.length === 0}
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
    {:else if sandboxes.list.length === 0}
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
        {#each sandboxes.list as sandbox (sandbox.id)}
          <Card.Root class="cursor-pointer hover:shadow-md transition-shadow" onclick={(e: MouseEvent) => handleSandboxClick(e, sandbox.id)}>
            <Card.Header>
              <div class="flex items-start justify-between gap-2 overflow-hidden">
                <div class="min-w-0 flex-1 overflow-hidden">
                  <Card.Title class="text-lg truncate">{getSandboxDisplayName(sandbox)}</Card.Title>
                  <Card.Description class="text-sm truncate">
                    {getSandboxSlug(sandbox)}
                  </Card.Description>
                </div>
                <Badge variant={getStatusColor(sandbox.status)} class="shrink-0 whitespace-nowrap">
                  {getStatusLabel(sandbox.status)}
                </Badge>
              </div>
            </Card.Header>
            <Card.Content>
              <p class="text-sm text-muted-foreground truncate">
                {sandbox.image}
              </p>
            </Card.Content>
            <Card.Footer class="flex flex-wrap gap-2 relative z-10">
              {#if sandbox.status === "exited" || sandbox.status === "created"}
                <Button 
                  size="sm" 
                  onclick={(e: MouseEvent) => { e.stopPropagation(); startSandbox(sandbox.id); }}
                  disabled={sandboxes.isLoading}
                >
                  Start
                </Button>
              {:else if sandbox.status === "running"}
                <Button 
                  size="sm" 
                  variant="secondary"
                  onclick={(e: MouseEvent) => { e.stopPropagation(); stopSandbox(sandbox.id); }}
                  disabled={sandboxes.isLoading}
                >
                  Stop
                </Button>
              {:else if sandbox.status === "paused"}
                <Button 
                  size="sm" 
                  onclick={(e: MouseEvent) => { e.stopPropagation(); startSandbox(sandbox.id); }}
                  disabled={sandboxes.isLoading}
                >
                  Resume
                </Button>
              {/if}
              <Button 
                size="sm" 
                variant="destructive"
                onclick={async (e: MouseEvent) => {
                  e.stopPropagation();
                  const displayName = getSandboxDisplayName(sandbox);
                  const shouldDelete = await confirm(`Delete project "${displayName}"?`, {
                    title: "Confirm Delete",
                    kind: "warning",
                  });
                  if (shouldDelete) {
                    deleteSandbox(sandbox.id);
                  }
                }}
                disabled={sandboxes.isLoading}
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
