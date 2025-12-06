<script lang="ts">
  import { goto } from "$app/navigation";
  import { connection } from "$lib/stores/connection.svelte";
  import { createProject, startProject } from "$lib/stores/projects.svelte";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import * as Card from "$lib/components/ui/card";
  import * as Tabs from "$lib/components/ui/tabs";
  import LlmProviderSelector from "$lib/components/llm-provider-selector.svelte";

  // Redirect if not connected
  $effect(() => {
    if (!connection.isConnected) {
      goto("/setup");
    }
  });

  // Form state
  let activeTab = $state("scratch");
  
  // From Scratch form
  let projectName = $state("");
  let projectDescription = $state("");
  
  // GitHub Import form
  let githubUrl = $state("");
  let syncEnabled = $state(true);
  
  // LLM Provider selection
  let selectedModel = $state("");
  let selectedProvider = $state("");
  let showAllProviders = $state(false);
  
  // Submission state
  let isSubmitting = $state(false);
  let errorMessage = $state<string | null>(null);
  
  // Creation progress
  let creationProgress = $state<string[]>([]);

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
    
    try {
      if (activeTab === "scratch") {
        // From Scratch
        creationProgress = [...creationProgress, "Creating repository..."];
        
        const project = await createProject({
          name: projectName.trim(),
          description: projectDescription.trim() || undefined,
          llmProviderId: selectedProvider || undefined,
          llmModelId: selectedModel || undefined,
        });
        
        if (project) {
          creationProgress = [...creationProgress, "Setting up container..."];
          creationProgress = [...creationProgress, "Starting OpenCode..."];
          creationProgress = [...creationProgress, "Done!"];
          
          // Navigate to the new project
          await goto(`/projects/${project.id}`);
        } else {
          errorMessage = "Failed to create project. Please try again.";
        }
      } else {
        // GitHub Import
        creationProgress = [...creationProgress, "Cloning from GitHub..."];
        
        // Extract name from URL if not provided
        const repoName = extractRepoName(githubUrl);
        
        const project = await createProject({
          name: repoName || "imported-project",
          githubUrl: githubUrl.trim(),
          llmProviderId: selectedProvider || undefined,
          llmModelId: selectedModel || undefined,
        });
        
        if (project) {
          creationProgress = [...creationProgress, "Setting up container..."];
          creationProgress = [...creationProgress, "Starting OpenCode..."];
          creationProgress = [...creationProgress, "Done!"];
          
          // Navigate to the new project
          await goto(`/projects/${project.id}`);
        } else {
          errorMessage = "Failed to import project. Please check the URL and try again.";
        }
      }
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : "An unexpected error occurred";
    } finally {
      isSubmitting = false;
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
          <div class="space-y-2">
            {#each creationProgress as step, i}
              <div class="flex items-center gap-2">
                {#if i < creationProgress.length - 1 || step === "Done!"}
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-green-500">
                    <path d="M20 6 9 17l-5-5"/>
                  </svg>
                {:else}
                  <div class="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                {/if}
                <span class="text-sm {i === creationProgress.length - 1 && step !== 'Done!' ? 'text-foreground' : 'text-muted-foreground'}">
                  {step}
                </span>
              </div>
            {/each}
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
                
                <!-- LLM Provider selector -->
                <div class="space-y-2 border-t pt-4">
                  <LlmProviderSelector
                    bind:selectedModel
                    bind:selectedProvider
                    bind:showAllProviders
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
                
                <div class="space-y-3">
                  <div class="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="sync-enabled"
                      bind:checked={syncEnabled}
                      disabled={isSubmitting}
                      class="h-4 w-4 rounded border-input"
                    />
                    <Label for="sync-enabled" class="font-normal cursor-pointer">
                      Enable GitHub sync
                    </Label>
                  </div>
                  <p class="text-xs text-muted-foreground ml-6">
                    Keep your project in sync with the GitHub repository. Changes can be pushed back to GitHub.
                  </p>
                </div>
                
                <!-- LLM Provider selector -->
                <div class="space-y-2 border-t pt-4">
                  <LlmProviderSelector
                    bind:selectedModel
                    bind:selectedProvider
                    bind:showAllProviders
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
          A new Git repository will be created and an OpenCode container will be provisioned.
        {:else}
          The repository will be cloned and an OpenCode container will be set up with the code.
        {/if}
      </p>
    </div>
  </div>
</main>
