<script lang="ts">
  import { goto } from "$app/navigation";
  import { connection } from "$lib/stores/connection.svelte";
  import { auth } from "$lib/stores/auth.svelte";
  import { createSandbox } from "$lib/stores/sandboxes.svelte";
  import { sandboxOpencodeHealthCheck, sandboxOpencodeCreateSession } from "$lib/api/tauri";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import * as Tabs from "$lib/components/ui/tabs";
  import { Check } from "@lucide/svelte";
  import ResourceTierSelector from "$lib/components/resource-tier-selector.svelte";
  import FlavorSelector from "$lib/components/flavor-selector.svelte";
  import AddonSelector from "$lib/components/addon-selector.svelte";
  import ProjectIconPicker from "$lib/components/project-icon-picker.svelte";
  import { getSuggestedIcon } from "$lib/utils/project-icons";
  import { projectIcons } from "$lib/stores/project-icons.svelte";

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
  let selectedIconId = $state("code");
  
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
          // Save the selected icon for this project
          projectIcons.setIcon(sandboxId, selectedIconId);
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
          // Save the selected icon for this project
          projectIcons.setIcon(sandboxId, selectedIconId);
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

<!-- Noise overlay for atmosphere -->
<div class="noise-overlay"></div>

<main class="container mx-auto px-4 py-8 max-w-2xl grid-bg min-h-screen">
  <div class="space-y-6 animate-fade-in">
    <!-- Header -->
    <div class="flex items-center gap-4">
      <Button 
        variant="ghost" 
        size="sm" 
        onclick={handleCancel}
        class="font-mono text-xs uppercase tracking-wider h-8 px-3"
      >
        <span class="mr-1">&larr;</span> Back
      </Button>
      <div>
        <h1 class="text-2xl font-bold glitch-hover">
          New Project
        </h1>
        <p class="font-mono text-sm text-muted-foreground">
          Create a new project or import from GitHub
        </p>
      </div>
    </div>

    <!-- Creation Progress -->
    {#if isSubmitting && creationProgress.length > 0}
      <div class="cyber-card corner-accent p-6 animate-fade-in-up">
        <h3 class="text-lg font-bold mb-4">
          Creating Project<span class="typing-cursor"></span>
        </h3>
        
        <div class="space-y-3">
          {#each creationProgress as step, i}
            <div class="flex items-center gap-3 animate-fade-in-up" style="animation-delay: {i * 100}ms">
              {#if step.done}
                <div class="w-5 h-5 rounded-full bg-[var(--cyber-emerald)]/20 border border-[var(--cyber-emerald)] flex items-center justify-center">
                  <Check class="h-3 w-3 text-[var(--cyber-emerald)]" />
                </div>
              {:else}
                <div class="relative w-5 h-5">
                  <div class="absolute inset-0 rounded-full border-2 border-[var(--cyber-cyan)]/20"></div>
                  <div class="absolute inset-0 rounded-full border-2 border-transparent border-t-[var(--cyber-cyan)] animate-spin"></div>
                </div>
              {/if}
              <span class="font-mono text-sm {step.done ? 'text-muted-foreground' : 'text-[var(--cyber-cyan)]'}">
                {step.message}
              </span>
            </div>
          {/each}
          
          <!-- Dynamic waiting message -->
          {#if currentProgressMessage && creationProgress.some(s => !s.done)}
            <div class="mt-6 pt-4 border-t border-border/30">
              <div class="flex items-center gap-3 text-muted-foreground">
                <div class="flex space-x-1">
                  <div class="w-1.5 h-1.5 bg-[var(--cyber-cyan)] rounded-full animate-bounce" style="animation-delay: 0ms"></div>
                  <div class="w-1.5 h-1.5 bg-[var(--cyber-cyan)] rounded-full animate-bounce" style="animation-delay: 150ms"></div>
                  <div class="w-1.5 h-1.5 bg-[var(--cyber-cyan)] rounded-full animate-bounce" style="animation-delay: 300ms"></div>
                </div>
                <span class="text-sm font-mono italic text-[var(--cyber-cyan)]/70">{currentProgressMessage}</span>
              </div>
            </div>
          {/if}
        </div>
      </div>
    {:else}
      <!-- Tabs Form -->
      <div class="cyber-card corner-accent overflow-hidden">
        <Tabs.Root bind:value={activeTab}>
          <!-- Tab Header -->
          <div class="border-b border-border/30 bg-background/30 backdrop-blur-sm">
            <Tabs.List class="grid w-full grid-cols-2 p-0 h-auto bg-transparent">
              <Tabs.Trigger 
                value="scratch" 
                class="py-3 px-4 font-mono text-xs uppercase tracking-wider rounded-none border-b-2 
                       data-[state=active]:border-[var(--cyber-cyan)] data-[state=active]:text-[var(--cyber-cyan)]
                       data-[state=inactive]:border-transparent data-[state=inactive]:text-muted-foreground
                       hover:text-foreground transition-colors bg-transparent"
              >
                From Scratch
              </Tabs.Trigger>
              <Tabs.Trigger 
                value="github"
                class="py-3 px-4 font-mono text-xs uppercase tracking-wider rounded-none border-b-2 
                       data-[state=active]:border-[var(--cyber-cyan)] data-[state=active]:text-[var(--cyber-cyan)]
                       data-[state=inactive]:border-transparent data-[state=inactive]:text-muted-foreground
                       hover:text-foreground transition-colors bg-transparent"
              >
                Import from GitHub
              </Tabs.Trigger>
            </Tabs.List>
          </div>
          
          <!-- Tab Content -->
          <div class="p-6">
            <!-- Error Display -->
            {#if errorMessage}
              <div class="mb-4 p-3 rounded border border-[var(--cyber-red)]/50 bg-[var(--cyber-red)]/5">
                <span class="font-mono text-xs uppercase tracking-wider text-[var(--cyber-red)]">[error]</span>
                <p class="text-sm text-[var(--cyber-red)] mt-1">{errorMessage}</p>
              </div>
            {/if}
            
            <form onsubmit={handleSubmit}>
              <!-- From Scratch Tab -->
              <Tabs.Content value="scratch" class="space-y-4 mt-0">
                <div class="space-y-2">
                  <Label for="project-name" class="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                    Project Name *
                  </Label>
                  <div class="flex gap-3 items-start">
                    <ProjectIconPicker
                      value={selectedIconId}
                      onSelect={(id) => selectedIconId = id}
                      disabled={isSubmitting}
                      size="md"
                    />
                    <div class="flex-1 space-y-2">
                      <Input
                        id="project-name"
                        placeholder="my-awesome-project"
                        bind:value={projectName}
                        oninput={() => {
                          // Auto-suggest icon based on project name (only if still using default)
                          if (selectedIconId === "code" && projectName.length > 2) {
                            const suggested = getSuggestedIcon(projectName);
                            selectedIconId = suggested.id;
                          }
                        }}
                        disabled={isSubmitting}
                        class="font-mono bg-background/50 border-border/50 
                               focus:border-[var(--cyber-cyan)] focus:ring-1 focus:ring-[var(--cyber-cyan)]"
                      />
                      <p class="text-xs font-mono text-muted-foreground/70">
                        A unique name for your project. Click the icon to customize.
                      </p>
                    </div>
                  </div>
                </div>
                
                <div class="space-y-2">
                  <Label for="project-desc" class="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                    Description
                  </Label>
                  <Input
                    id="project-desc"
                    placeholder="A brief description of your project..."
                    bind:value={projectDescription}
                    disabled={isSubmitting}
                    class="font-mono bg-background/50 border-border/50 
                           focus:border-[var(--cyber-cyan)] focus:ring-1 focus:ring-[var(--cyber-cyan)]"
                  />
                </div>
                
                <!-- Flavor selector -->
                <div class="space-y-2 border-t border-border/30 pt-4">
                  <FlavorSelector
                    bind:selectedFlavorId
                    disabled={isSubmitting}
                  />
                </div>
                
                <!-- Resource Tier selector -->
                <div class="space-y-2 border-t border-border/30 pt-4">
                  <ResourceTierSelector
                    bind:selectedTierId={selectedResourceTierId}
                    disabled={isSubmitting}
                  />
                </div>
                
                <!-- Addon selector -->
                <div class="space-y-2 border-t border-border/30 pt-4">
                  <AddonSelector
                    bind:selectedAddonIds
                    disabled={isSubmitting}
                  />
                </div>
              </Tabs.Content>
              
              <!-- GitHub Import Tab -->
              <Tabs.Content value="github" class="space-y-4 mt-0">
                <div class="space-y-2">
                  <Label for="github-url" class="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                    Repository URL *
                  </Label>
                  <div class="flex gap-3 items-start">
                    <ProjectIconPicker
                      value={selectedIconId}
                      onSelect={(id) => selectedIconId = id}
                      disabled={isSubmitting}
                      size="md"
                    />
                    <div class="flex-1 space-y-2">
                      <Input
                        id="github-url"
                        placeholder="https://github.com/username/repository"
                        bind:value={githubUrl}
                        oninput={() => {
                          // Auto-suggest icon based on repo name (only if still using default)
                          const repoName = extractRepoName(githubUrl);
                          if (selectedIconId === "code" && repoName.length > 2) {
                            const suggested = getSuggestedIcon(repoName);
                            selectedIconId = suggested.id;
                          }
                        }}
                        disabled={isSubmitting}
                        class="font-mono bg-background/50 border-border/50 
                               focus:border-[var(--cyber-cyan)] focus:ring-1 focus:ring-[var(--cyber-cyan)]"
                      />
                      <p class="text-xs font-mono text-muted-foreground/70">
                        Enter a GitHub or GitLab URL. Click the icon to customize.
                      </p>
                    </div>
                  </div>
                </div>
                
                {#if githubUrl && extractRepoName(githubUrl)}
                  <div class="p-3 rounded bg-[var(--cyber-cyan)]/5 border border-[var(--cyber-cyan)]/20">
                    <span class="font-mono text-xs text-muted-foreground">Project name: </span>
                    <span class="font-mono text-sm text-[var(--cyber-cyan)]">{extractRepoName(githubUrl)}</span>
                  </div>
                {/if}
                
                <!-- Flavor selector -->
                <div class="space-y-2 border-t border-border/30 pt-4">
                  <FlavorSelector
                    bind:selectedFlavorId
                    disabled={isSubmitting}
                  />
                </div>
                
                <!-- Resource Tier selector -->
                <div class="space-y-2 border-t border-border/30 pt-4">
                  <ResourceTierSelector
                    bind:selectedTierId={selectedResourceTierId}
                    disabled={isSubmitting}
                  />
                </div>
                
                <!-- Addon selector -->
                <div class="space-y-2 border-t border-border/30 pt-4">
                  <AddonSelector
                    bind:selectedAddonIds
                    disabled={isSubmitting}
                  />
                </div>
              </Tabs.Content>
              
              <!-- Submit Button -->
              <div class="flex gap-3 pt-6 border-t border-border/30 mt-6">
                <Button
                  type="button"
                  variant="outline"
                  onclick={handleCancel}
                  disabled={isSubmitting}
                  class="flex-1 font-mono text-xs uppercase tracking-wider border-border/50"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={!isFormValid || isSubmitting}
                  class="flex-1 font-mono text-xs uppercase tracking-wider
                         bg-[var(--cyber-cyan)] hover:bg-[var(--cyber-cyan)]/90 text-black
                         disabled:opacity-30"
                >
                  {#if isSubmitting}
                    <div class="relative w-4 h-4 mr-2">
                      <div class="absolute inset-0 rounded-full border-2 border-black/20"></div>
                      <div class="absolute inset-0 rounded-full border-2 border-transparent border-t-black animate-spin"></div>
                    </div>
                    Creating...
                  {:else if activeTab === "scratch"}
                    Create Project
                  {:else}
                    Import Project
                  {/if}
                </Button>
              </div>
            </form>
          </div>
        </Tabs.Root>
      </div>
    {/if}
    
    <!-- Help Text -->
    <div class="text-center">
      <p class="text-xs font-mono text-muted-foreground/70">
        {#if activeTab === "scratch"}
          A new Git repository will be created and a sandbox container will be provisioned.
        {:else}
          The repository will be cloned and a sandbox container will be set up with the code.
        {/if}
      </p>
    </div>
  </div>
</main>
