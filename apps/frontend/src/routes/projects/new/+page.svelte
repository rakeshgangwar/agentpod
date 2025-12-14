<script lang="ts">
  import { goto } from "$app/navigation";
  import { connection } from "$lib/stores/connection.svelte";
  import { auth } from "$lib/stores/auth.svelte";
  import { createSandbox } from "$lib/stores/sandboxes.svelte";
  import { sandboxOpencodeHealthCheck, sandboxOpencodeCreateSession } from "$lib/api/tauri";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import * as Card from "$lib/components/ui/card";
  import * as Tabs from "$lib/components/ui/tabs";
  import ResourceTierSelector from "$lib/components/resource-tier-selector.svelte";
  import FlavorSelector from "$lib/components/flavor-selector.svelte";
  import AddonSelector from "$lib/components/addon-selector.svelte";

  // Redirect if not connected or not authenticated
  $effect(() => {
    if (!connection.isConnected) {
      goto("/setup");
    } else if (!auth.isAuthenticated) {
      goto("/login");
    }
  });

  // Form state
  let activeTab = $state("scratch");
  
  // From Scratch form
  let projectName = $state("");
  let projectDescription = $state("");
  
  // GitHub Import form
  let githubUrl = $state("");
  
  // Modular container configuration
  let selectedResourceTierId = $state("");
  let selectedFlavorId = $state("");
  let selectedAddonIds = $state<string[]>([]);
  
  // Submission state
  let isSubmitting = $state(false);
  let errorMessage = $state<string | null>(null);
  
  // Creation progress
  let creationProgress = $state<{ message: string; done: boolean }[]>([]);
  let currentProgressMessage = $state("");
  let progressMessageInterval: ReturnType<typeof setInterval> | null = null;
  
  // Dynamic progress messages to show while waiting for container to start
  const waitingMessages = [
    "Assembling your AI agents...",
    "Setting up workspace environment...",
    "Configuring development tools...",
    "Preparing code editor...",
    "Loading language runtimes...",
    "Initializing version control...",
    "Setting up terminal access...",
    "Warming up the engines...",
    "Almost there...",
    "Giving it final touches...",
  ];

  /**
   * Wait for OpenCode to become healthy in the sandbox
   */
  async function waitForContainerReady(sandboxId: string, maxWaitMs = 120000): Promise<boolean> {
    const startTime = Date.now();
    const pollInterval = 2000; // Poll every 2 seconds
    let messageIndex = 0;
    
    // Start cycling through messages
    progressMessageInterval = setInterval(() => {
      messageIndex = (messageIndex + 1) % waitingMessages.length;
      currentProgressMessage = waitingMessages[messageIndex];
    }, 3000); // Change message every 3 seconds
    
    currentProgressMessage = waitingMessages[0];
    
    try {
      while (Date.now() - startTime < maxWaitMs) {
        try {
          const health = await sandboxOpencodeHealthCheck(sandboxId);
          console.log("[waitForContainerReady] Health check result:", health);
          if (health.healthy) {
            console.log("[waitForContainerReady] Container is healthy!");
            return true;
          }
        } catch (err) {
          // Container not ready yet, continue polling
          console.log("[waitForContainerReady] Health check error:", err);
        }
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
      console.log("[waitForContainerReady] Timeout reached after", maxWaitMs, "ms");
      return false;
    } finally {
      if (progressMessageInterval) {
        clearInterval(progressMessageInterval);
        progressMessageInterval = null;
      }
    }
  }

  /**
   * Create a new session for the sandbox
   */
  async function createInitialSession(sandboxId: string): Promise<string | null> {
    try {
      const session = await sandboxOpencodeCreateSession(sandboxId, "New Chat");
      return session.id;
    } catch (error) {
      console.error("Failed to create initial session:", error);
      return null;
    }
  }

  // Validation
  const isFromScratchValid = $derived(projectName.trim().length >= 1);
  const isGithubUrlValid = $derived(
    githubUrl.trim().length > 0 && 
    (githubUrl.includes("github.com/") || githubUrl.includes("gitlab.com/"))
  );
  const isFormValid = $derived(
    activeTab === "scratch" ? isFromScratchValid : isGithubUrlValid
  );

  // Extract repo name from GitHub URL
  function extractRepoName(url: string): string {
    try {
      // Handle URLs like https://github.com/owner/repo or https://github.com/owner/repo.git
      const match = url.match(/(?:github|gitlab)\.com\/([^\/]+)\/([^\/\s]+?)(?:\.git)?$/);
      if (match) {
        return match[2];
      }
    } catch {
      // Ignore parsing errors
    }
    return "";
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (!isFormValid || isSubmitting) return;
    
    isSubmitting = true;
    errorMessage = null;
    creationProgress = [];
    currentProgressMessage = "";
    
    try {
      let sandboxId: string | null = null;
      
      if (activeTab === "scratch") {
        // From Scratch
        creationProgress = [{ message: "Creating repository...", done: false }];
        
        const result = await createSandbox({
          name: projectName.trim(),
          description: projectDescription.trim() || undefined,
          userId: auth.user!.id,
          resourceTier: selectedResourceTierId || undefined,
          flavor: selectedFlavorId || undefined,
          addons: selectedAddonIds.length > 0 ? selectedAddonIds : undefined,
          autoStart: true,
        });
        
        if (result) {
          sandboxId = result.sandbox.id;
          // Mark first step done, add second step
          creationProgress = [
            { message: "Creating repository...", done: true },
            { message: "Starting container...", done: false },
          ];
        } else {
          errorMessage = "Failed to create project. Please try again.";
          return;
        }
      } else {
        // GitHub Import
        creationProgress = [{ message: "Cloning from GitHub...", done: false }];
        
        // Extract name from URL if not provided
        const repoName = extractRepoName(githubUrl);
        
        const result = await createSandbox({
          name: repoName || "imported-project",
          githubUrl: githubUrl.trim(),
          userId: auth.user!.id,
          resourceTier: selectedResourceTierId || undefined,
          flavor: selectedFlavorId || undefined,
          addons: selectedAddonIds.length > 0 ? selectedAddonIds : undefined,
          autoStart: true,
        });
        
        if (result) {
          sandboxId = result.sandbox.id;
          // Mark first step done, add second step
          creationProgress = [
            { message: "Cloning from GitHub...", done: true },
            { message: "Starting container...", done: false },
          ];
        } else {
          errorMessage = "Failed to import project. Please check the URL and try again.";
          return;
        }
      }
      
      // Wait for container to be ready
      if (sandboxId) {
        const isReady = await waitForContainerReady(sandboxId);
        
        if (isReady) {
          // Mark container start done, add session creation step
          creationProgress = [
            ...creationProgress.map((p, i) => i === 1 ? { ...p, done: true } : p),
            { message: "Preparing your workspace...", done: false },
          ];
          
          // Create an initial session
          const sessionId = await createInitialSession(sandboxId);
          
          // All done!
          creationProgress = [
            ...creationProgress.map(p => ({ ...p, done: true })),
          ];
          
          // Small delay to show completion state
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Navigate to chat with the new session
          if (sessionId) {
            await goto(`/projects/${sandboxId}/chat?session=${sessionId}`);
          } else {
            await goto(`/projects/${sandboxId}/chat`);
          }
        } else {
          // Container didn't become healthy in time
          errorMessage = "Container took too long to start. Please try again or check your sandbox in the dashboard.";
          // Still navigate to the project page so user can see their sandbox
          await goto(`/projects/${sandboxId}`);
        }
      }
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : "An unexpected error occurred";
    } finally {
      isSubmitting = false;
      if (progressMessageInterval) {
        clearInterval(progressMessageInterval);
        progressMessageInterval = null;
      }
    }
  }

  function handleCancel() {
    goto("/projects");
  }
</script>

<main class="container mx-auto px-4 py-8 max-w-2xl">
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center gap-4">
      <Button variant="ghost" size="sm" onclick={handleCancel}>
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m15 18-6-6 6-6"/>
        </svg>
      </Button>
      <div>
        <h1 class="text-2xl font-bold">New Project</h1>
        <p class="text-muted-foreground text-sm">
          Create a new project or import from GitHub
        </p>
      </div>
    </div>

    <!-- Creation Progress -->
    {#if isSubmitting && creationProgress.length > 0}
      <Card.Root>
        <Card.Header>
          <Card.Title class="text-lg">Creating Project...</Card.Title>
        </Card.Header>
        <Card.Content>
          <div class="space-y-3">
            {#each creationProgress as step, i}
              <div class="flex items-center gap-2">
                {#if step.done}
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-green-500 flex-shrink-0">
                    <path d="M20 6 9 17l-5-5"/>
                  </svg>
                {:else}
                  <div class="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin flex-shrink-0"></div>
                {/if}
                <span class="text-sm {step.done ? 'text-muted-foreground' : 'text-foreground'}">
                  {step.message}
                </span>
              </div>
            {/each}
            
            <!-- Dynamic waiting message -->
            {#if currentProgressMessage && creationProgress.some(s => !s.done)}
              <div class="mt-4 pt-4 border-t">
                <div class="flex items-center gap-2 text-muted-foreground">
                  <div class="flex space-x-1">
                    <div class="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style="animation-delay: 0ms"></div>
                    <div class="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style="animation-delay: 150ms"></div>
                    <div class="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style="animation-delay: 300ms"></div>
                  </div>
                  <span class="text-sm italic">{currentProgressMessage}</span>
                </div>
              </div>
            {/if}
          </div>
        </Card.Content>
      </Card.Root>
    {:else}
      <!-- Tabs Form -->
      <Card.Root>
        <Tabs.Root bind:value={activeTab}>
          <Card.Header class="pb-0">
            <Tabs.List class="grid w-full grid-cols-2">
              <Tabs.Trigger value="scratch">From Scratch</Tabs.Trigger>
              <Tabs.Trigger value="github">Import from GitHub</Tabs.Trigger>
            </Tabs.List>
          </Card.Header>
          
          <Card.Content class="pt-6">
            <!-- Error Display -->
            {#if errorMessage}
              <div class="mb-4 text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                {errorMessage}
              </div>
            {/if}
            
            <form onsubmit={handleSubmit}>
              <!-- From Scratch Tab -->
              <Tabs.Content value="scratch" class="space-y-4 mt-0">
                <div class="space-y-2">
                  <Label for="project-name">Project Name *</Label>
                  <Input
                    id="project-name"
                    placeholder="my-awesome-project"
                    bind:value={projectName}
                    disabled={isSubmitting}
                  />
                  <p class="text-xs text-muted-foreground">
                    A unique name for your project. This will be used to create the repository.
                  </p>
                </div>
                
                <div class="space-y-2">
                  <Label for="project-desc">Description</Label>
                  <Input
                    id="project-desc"
                    placeholder="A brief description of your project..."
                    bind:value={projectDescription}
                    disabled={isSubmitting}
                  />
                </div>
                
                <!-- Flavor selector -->
                <div class="space-y-2 border-t pt-4">
                  <FlavorSelector
                    bind:selectedFlavorId
                    disabled={isSubmitting}
                  />
                </div>
                
                <!-- Resource Tier selector -->
                <div class="space-y-2 border-t pt-4">
                  <ResourceTierSelector
                    bind:selectedTierId={selectedResourceTierId}
                    disabled={isSubmitting}
                  />
                </div>
                
                <!-- Addon selector -->
                <div class="space-y-2 border-t pt-4">
                  <AddonSelector
                    bind:selectedAddonIds
                    disabled={isSubmitting}
                  />
                </div>
              </Tabs.Content>
              
              <!-- GitHub Import Tab -->
              <Tabs.Content value="github" class="space-y-4 mt-0">
                <div class="space-y-2">
                  <Label for="github-url">Repository URL *</Label>
                  <Input
                    id="github-url"
                    placeholder="https://github.com/username/repository"
                    bind:value={githubUrl}
                    disabled={isSubmitting}
                  />
                  <p class="text-xs text-muted-foreground">
                    Enter the URL of a GitHub or GitLab repository to import.
                  </p>
                </div>
                
                {#if githubUrl && extractRepoName(githubUrl)}
                  <div class="text-sm text-muted-foreground bg-muted p-3 rounded-md">
                    Project name: <span class="font-medium text-foreground">{extractRepoName(githubUrl)}</span>
                  </div>
                {/if}
                
                <!-- Flavor selector -->
                <div class="space-y-2 border-t pt-4">
                  <FlavorSelector
                    bind:selectedFlavorId
                    disabled={isSubmitting}
                  />
                </div>
                
                <!-- Resource Tier selector -->
                <div class="space-y-2 border-t pt-4">
                  <ResourceTierSelector
                    bind:selectedTierId={selectedResourceTierId}
                    disabled={isSubmitting}
                  />
                </div>
                
                <!-- Addon selector -->
                <div class="space-y-2 border-t pt-4">
                  <AddonSelector
                    bind:selectedAddonIds
                    disabled={isSubmitting}
                  />
                </div>
              </Tabs.Content>
              
              <!-- Submit Button -->
              <div class="flex gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onclick={handleCancel}
                  disabled={isSubmitting}
                  class="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={!isFormValid || isSubmitting}
                  class="flex-1"
                >
                  {#if isSubmitting}
                    <div class="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin mr-2"></div>
                    Creating...
                  {:else if activeTab === "scratch"}
                    Create Project
                  {:else}
                    Import Project
                  {/if}
                </Button>
              </div>
            </form>
          </Card.Content>
        </Tabs.Root>
      </Card.Root>
    {/if}
    
    <!-- Help Text -->
    <div class="text-center text-sm text-muted-foreground">
      <p>
        {#if activeTab === "scratch"}
          A new Git repository will be created and a sandbox container will be provisioned.
        {:else}
          The repository will be cloned and a sandbox container will be set up with the code.
        {/if}
      </p>
    </div>
  </div>
</main>
