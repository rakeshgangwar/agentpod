<script lang="ts">
  import { connection, connect, disconnect, testConnection } from "$lib/stores/connection.svelte";
  import { projects, fetchProjects, startProject, stopProject, deleteProject, createProject } from "$lib/stores/projects.svelte";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import * as Card from "$lib/components/ui/card";
  import { Badge } from "$lib/components/ui/badge";
  import { Skeleton } from "$lib/components/ui/skeleton";

  // View state
  type View = "projects" | "settings";
  let currentView = $state<View>("projects");

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

  // Settings state
  let isTesting = $state(false);
  let testResult = $state<{ success: boolean; message: string } | null>(null);

  // Load projects when connected
  $effect(() => {
    if (connection.isConnected && currentView === "projects") {
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
    currentView = "projects";
  }

  async function handleTestConnection() {
    isTesting = true;
    testResult = null;
    
    const success = await testConnection();
    
    testResult = {
      success,
      message: success ? "Connection successful!" : (connection.error || "Connection failed"),
    };
    
    isTesting = false;
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

  function formatDate(dateStr: string): string {
    try {
      return new Date(dateStr).toLocaleString();
    } catch {
      return dateStr;
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
              <Label for="api-key">API Key</Label>
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
        <Card.Footer class="justify-center">
          <p class="text-xs text-muted-foreground">
            CodeOpen v0.1.0
          </p>
        </Card.Footer>
      </Card.Root>
    </div>
  {:else}
    <!-- Connected: Main App -->
    <div class="space-y-6">
      <!-- Header with Navigation -->
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 class="text-3xl font-bold">
            {currentView === "projects" ? "Projects" : "Settings"}
          </h1>
          <p class="text-muted-foreground text-sm">
            {connection.apiUrl}
          </p>
        </div>
        <div class="flex gap-2">
          {#if currentView === "projects"}
            <Button variant="outline" onclick={() => showCreateForm = !showCreateForm}>
              {showCreateForm ? "Cancel" : "New Project"}
            </Button>
          {/if}
          <Button 
            variant={currentView === "projects" ? "ghost" : "default"}
            onclick={() => currentView = currentView === "projects" ? "settings" : "projects"}
          >
            {currentView === "projects" ? "Settings" : "Back to Projects"}
          </Button>
        </div>
      </div>

      {#if currentView === "settings"}
        <!-- Settings View -->
        <div class="grid gap-6 md:grid-cols-2">
          <!-- Connection Info -->
          <Card.Root>
            <Card.Header>
              <Card.Title>Connection</Card.Title>
              <Card.Description>
                Manage your API connection
              </Card.Description>
            </Card.Header>
            <Card.Content class="space-y-4">
              <div class="space-y-1">
                <Label class="text-muted-foreground text-xs">API URL</Label>
                <p class="font-mono text-sm break-all">{connection.apiUrl}</p>
              </div>
              <div class="space-y-1">
                <Label class="text-muted-foreground text-xs">Status</Label>
                <div class="flex items-center gap-2">
                  <span class="h-2 w-2 rounded-full bg-green-500"></span>
                  <span class="text-sm">Connected</span>
                </div>
              </div>
              {#if testResult}
                <div class="text-sm p-3 rounded-md {testResult.success ? 'bg-green-500/10 text-green-700 dark:text-green-400' : 'bg-destructive/10 text-destructive'}">
                  {testResult.message}
                </div>
              {/if}
            </Card.Content>
            <Card.Footer class="flex gap-2">
              <Button 
                variant="outline" 
                onclick={handleTestConnection}
                disabled={isTesting}
              >
                {isTesting ? "Testing..." : "Test Connection"}
              </Button>
              <Button 
                variant="destructive" 
                onclick={handleDisconnect}
              >
                Disconnect
              </Button>
            </Card.Footer>
          </Card.Root>

          <!-- App Info -->
          <Card.Root>
            <Card.Header>
              <Card.Title>About</Card.Title>
              <Card.Description>
                Application information
              </Card.Description>
            </Card.Header>
            <Card.Content class="space-y-4">
              <div class="space-y-1">
                <Label class="text-muted-foreground text-xs">Application</Label>
                <p class="text-sm font-medium">CodeOpen</p>
              </div>
              <div class="space-y-1">
                <Label class="text-muted-foreground text-xs">Version</Label>
                <p class="text-sm font-mono">0.1.0</p>
              </div>
              <div class="space-y-1">
                <Label class="text-muted-foreground text-xs">Description</Label>
                <p class="text-sm text-muted-foreground">
                  Portable Command Center for OpenCode - manage your AI-powered development environments from anywhere.
                </p>
              </div>
            </Card.Content>
            <Card.Footer>
              <p class="text-xs text-muted-foreground">
                Built with Tauri, Svelte, and Rust
              </p>
            </Card.Footer>
          </Card.Root>

          <!-- Integrations (OAuth placeholder) -->
          <Card.Root class="md:col-span-2">
            <Card.Header>
              <Card.Title>Integrations</Card.Title>
              <Card.Description>
                Connect external services (coming in Phase 4)
              </Card.Description>
            </Card.Header>
            <Card.Content>
              <div class="grid gap-4 sm:grid-cols-2">
                <!-- GitHub Integration -->
                <div class="flex items-center justify-between p-4 border rounded-lg">
                  <div class="flex items-center gap-3">
                    <div class="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                      <svg class="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                      </svg>
                    </div>
                    <div>
                      <p class="font-medium">GitHub</p>
                      <p class="text-sm text-muted-foreground">Sync repositories</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" disabled>
                    Connect
                  </Button>
                </div>

                <!-- LLM Provider Integration -->
                <div class="flex items-center justify-between p-4 border rounded-lg">
                  <div class="flex items-center gap-3">
                    <div class="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                      <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                      </svg>
                    </div>
                    <div>
                      <p class="font-medium">LLM Providers</p>
                      <p class="text-sm text-muted-foreground">OpenAI, Anthropic, etc.</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" disabled>
                    Configure
                  </Button>
                </div>
              </div>
            </Card.Content>
            <Card.Footer>
              <p class="text-xs text-muted-foreground">
                OAuth integrations will be available in a future update
              </p>
            </Card.Footer>
          </Card.Root>

          <!-- Statistics -->
          <Card.Root class="md:col-span-2">
            <Card.Header>
              <Card.Title>Statistics</Card.Title>
              <Card.Description>
                Overview of your projects
              </Card.Description>
            </Card.Header>
            <Card.Content>
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div class="text-center p-4 bg-muted rounded-lg">
                  <p class="text-3xl font-bold">{projects.count}</p>
                  <p class="text-sm text-muted-foreground">Total Projects</p>
                </div>
                <div class="text-center p-4 bg-green-500/10 rounded-lg">
                  <p class="text-3xl font-bold text-green-600 dark:text-green-400">{projects.running.length}</p>
                  <p class="text-sm text-muted-foreground">Running</p>
                </div>
                <div class="text-center p-4 bg-muted rounded-lg">
                  <p class="text-3xl font-bold">{projects.stopped.length}</p>
                  <p class="text-sm text-muted-foreground">Stopped</p>
                </div>
                <div class="text-center p-4 bg-destructive/10 rounded-lg">
                  <p class="text-3xl font-bold text-destructive">{projects.errored.length}</p>
                  <p class="text-sm text-muted-foreground">Errors</p>
                </div>
              </div>
            </Card.Content>
          </Card.Root>
        </div>
      {:else}
        <!-- Projects View -->
        
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
      {/if}
    </div>
  {/if}
</main>
