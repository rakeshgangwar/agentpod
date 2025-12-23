<script lang="ts">
  import { goto } from "$app/navigation";
  import { connection } from "$lib/stores/connection.svelte";
  import { auth } from "$lib/stores/auth.svelte";
  import { createSandbox, sandboxes } from "$lib/stores/sandboxes.svelte";
  import { sandboxOpencodeHealthCheck, sandboxOpencodeCreateSession, getFlavorImages, type FlavorImageStatus } from "$lib/api/tauri";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import * as Tabs from "$lib/components/ui/tabs";
  import * as Collapsible from "$lib/components/ui/collapsible";
  import { Check, ArrowLeft, ChevronDown, Settings2, Sparkles, Globe, Server, Smartphone, Bot, Wrench } from "@lucide/svelte";
  import ThemeToggle from "$lib/components/theme-toggle.svelte";
  import ResourceTierSelector from "$lib/components/resource-tier-selector.svelte";
  import FlavorSelector from "$lib/components/flavor-selector.svelte";
  import AddonSelector from "$lib/components/addon-selector.svelte";
  import AgentTeamSelector from "$lib/components/agent-team-selector.svelte";
  import ProjectIconPicker from "$lib/components/project-icon-picker.svelte";
  import ProviderSelector, { type SandboxProvider } from "$lib/components/provider-selector.svelte";
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
  
  // Provider selection
  let selectedProvider = $state<SandboxProvider>("docker");
  
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
  
  // Agent team selection
  let selectedAgentSlugs = $state<string[]>([]);
  
  // Advanced options state (collapsed by default)
  let advancedOptionsOpen = $state(false);
  
  // Watch provider changes to clear Docker-specific state when switching to Cloudflare
  $effect(() => {
    if (selectedProvider === "cloudflare") {
      selectedFlavorId = "";
      selectedResourceTierId = "";
      selectedAddonIds = [];
      selectedAgentSlugs = [];
    }
  });
  
  // Flavor image availability tracking
  let flavorImageStatus = $state<Record<string, FlavorImageStatus>>({});
  let flavorStatusLoaded = $state(false);
  
  // Load flavor image status on mount
  $effect(() => {
    loadFlavorStatus();
  });
  
  async function loadFlavorStatus() {
    try {
      const response = await getFlavorImages();
      if (response.success) {
        flavorImageStatus = response.images;
      }
    } catch (err) {
      console.warn("Failed to load flavor image status:", err);
    } finally {
      flavorStatusLoaded = true;
    }
  }
  
  function isFlavorAvailable(flavorId: string): boolean {
    return flavorImageStatus[flavorId]?.available ?? false;
  }
  
  // Template definitions
  interface ProjectTemplate {
    id: string;
    name: string;
    description: string;
    icon: typeof Globe;
    flavor: string;
    resourceTier?: string;      // Optional resource tier override
    addons?: string[];          // Optional addon presets
    suggestedName: string;
    suggestedDescription: string;
    tags: string[];
  }
  
  const projectTemplates: ProjectTemplate[] = [
    {
      id: "web-app",
      name: "Web Application",
      description: "Full-stack web app with modern frameworks",
      icon: Globe,
      flavor: "js",
      resourceTier: "starter",   // Light: just needs Node.js
      addons: ["code-server"],
      suggestedName: "my-web-app",
      suggestedDescription: "A modern web application",
      tags: ["React", "Next.js", "TypeScript"],
    },
    {
      id: "api-server",
      name: "API Server",
      description: "RESTful or GraphQL backend service",
      icon: Server,
      flavor: "js",
      resourceTier: "builder",   // Medium: may run database locally
      addons: ["code-server"],
      suggestedName: "my-api",
      suggestedDescription: "Backend API service",
      tags: ["Node.js", "Express", "PostgreSQL"],
    },
    {
      id: "ai-agent",
      name: "AI Agent",
      description: "LLM-powered agent or chatbot",
      icon: Bot,
      flavor: "python",
      resourceTier: "builder",   // Medium: ML libraries need more RAM
      addons: ["code-server"],
      suggestedName: "my-agent",
      suggestedDescription: "AI-powered agent application",
      tags: ["Python", "LangChain", "OpenAI"],
    },
    {
      id: "cli-tool",
      name: "CLI Tool",
      description: "Command-line utility or automation",
      icon: Wrench,
      flavor: "go",
      resourceTier: "starter",   // Light: Go compiles efficiently
      addons: ["code-server"],
      suggestedName: "my-cli",
      suggestedDescription: "Command-line tool",
      tags: ["Go", "Cobra", "Cross-platform"],
    },
    {
      id: "mobile-app",
      name: "Mobile App",
      description: "Cross-platform mobile application",
      icon: Smartphone,
      flavor: "js",
      resourceTier: "builder",   // Medium: mobile dev tooling is heavy
      addons: ["code-server"],
      suggestedName: "my-mobile-app",
      suggestedDescription: "Cross-platform mobile application",
      tags: ["React Native", "Expo", "TypeScript"],
    },
  ];
  
  let selectedTemplateId = $state<string | null>(null);
  
  // Apply template when selected
  function applyTemplate(template: ProjectTemplate) {
    selectedTemplateId = template.id;
    projectName = template.suggestedName;
    projectDescription = template.suggestedDescription;
    selectedFlavorId = template.flavor;
    
    // Apply resource tier if specified
    if (template.resourceTier) {
      selectedResourceTierId = template.resourceTier;
    }
    
    // Apply addons if specified
    if (template.addons) {
      selectedAddonIds = [...template.addons];
    }
    
    // Switch to scratch tab to show the pre-filled form
    activeTab = "scratch";
  }
  
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
  
  // Check if selected flavor is available (downloaded)
  const isFlavorValid = $derived(() => {
    // If no flavor selected, it will use default (which should be available)
    if (!selectedFlavorId) return true;
    // If status not loaded yet, allow (will validate on submit)
    if (!flavorStatusLoaded) return true;
    return isFlavorAvailable(selectedFlavorId);
  });
  
  // Get the name of the selected flavor for error messages
  const selectedFlavorName = $derived(() => {
    const flavorNames: Record<string, string> = {
      js: "JavaScript",
      python: "Python",
      go: "Go",
      rust: "Rust",
      fullstack: "Fullstack",
      polyglot: "Polyglot",
      bare: "Bare",
    };
    return flavorNames[selectedFlavorId] || selectedFlavorId;
  });
  
  const isFormValid = $derived(
    (activeTab === "scratch" ? isFromScratchValid : isGithubUrlValid) && isFlavorValid()
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

  function formatErrorMessage(rawError: string | null, fallback: string): string {
    const message = rawError || fallback;
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes("limit reached") || lowerMessage.includes("limit exceeded") || lowerMessage.includes("sandbox limit") || lowerMessage.includes("resource limit")) {
      return "You've reached your sandbox limit. Please delete an existing project before creating a new one.";
    }
    if (lowerMessage.includes("quota exceeded")) {
      return "Resource quota exceeded. Please contact support or upgrade your plan.";
    }
    return message;
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
        const firstStepMessage = selectedProvider === "docker" 
          ? "Creating repository..." 
          : "Provisioning sandbox...";
        creationProgress = [{ message: firstStepMessage, done: false }];
        
        const result = await createSandbox({
          name: projectName.trim(),
          description: projectDescription.trim() || undefined,
          userId: auth.user!.id,
          resourceTier: selectedResourceTierId || undefined,
          flavor: selectedFlavorId || undefined,
          addons: selectedAddonIds.length > 0 ? selectedAddonIds : undefined,
          agentSlugs: selectedAgentSlugs.length > 0 ? selectedAgentSlugs : undefined,
          autoStart: true,
          provider: selectedProvider,
        });
        
        if (result) {
          sandboxId = result.sandbox.id;
          // Save the selected icon for this project
          projectIcons.setIcon(sandboxId, selectedIconId);
          // Mark first step done, add second step
          const firstStepMessage = selectedProvider === "docker" 
            ? "Creating repository..." 
            : "Provisioning sandbox...";
          const secondStepMessage = selectedProvider === "docker"
            ? "Starting container..."
            : "Starting OpenCode...";
          creationProgress = [
            { message: firstStepMessage, done: true },
            { message: secondStepMessage, done: false },
          ];
        } else {
          errorMessage = formatErrorMessage(sandboxes.error, "Failed to create project. Please try again.");
          return;
        }
      } else {
        // GitHub Import
        const firstStepMessage = selectedProvider === "docker"
          ? "Cloning from GitHub..."
          : "Cloning repository...";
        creationProgress = [{ message: firstStepMessage, done: false }];
        
        // Extract name from URL if not provided
        const repoName = extractRepoName(githubUrl);
        
        const result = await createSandbox({
          name: repoName || "imported-project",
          githubUrl: githubUrl.trim(),
          userId: auth.user!.id,
          resourceTier: selectedResourceTierId || undefined,
          flavor: selectedFlavorId || undefined,
          addons: selectedAddonIds.length > 0 ? selectedAddonIds : undefined,
          agentSlugs: selectedAgentSlugs.length > 0 ? selectedAgentSlugs : undefined,
          autoStart: true,
          provider: selectedProvider,
        });
        
        if (result) {
          sandboxId = result.sandbox.id;
          // Save the selected icon for this project
          projectIcons.setIcon(sandboxId, selectedIconId);
          // Mark first step done, add second step
          const firstStepMessage = selectedProvider === "docker"
            ? "Cloning from GitHub..."
            : "Cloning repository...";
          const secondStepMessage = selectedProvider === "docker"
            ? "Starting container..."
            : "Starting OpenCode...";
          creationProgress = [
            { message: firstStepMessage, done: true },
            { message: secondStepMessage, done: false },
          ];
        } else {
          errorMessage = formatErrorMessage(sandboxes.error, "Failed to import project. Please check the URL and try again.");
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
          // Use replaceState so back button goes to homepage, not back to /projects/new
          if (sessionId) {
            await goto(`/projects/${sandboxId}/chat?session=${sessionId}`, { replaceState: true });
          } else {
            await goto(`/projects/${sandboxId}/chat`, { replaceState: true });
          }
        } else {
          // Container didn't become healthy in time
          errorMessage = "Container took too long to start. Please try again or check your sandbox in the dashboard.";
          // Still navigate to the project page so user can see their sandbox
          // Use replaceState so back button goes to homepage, not back to /projects/new
          await goto(`/projects/${sandboxId}`, { replaceState: true });
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errorMessage = formatErrorMessage(message, "An unexpected error occurred");
    } finally {
      isSubmitting = false;
      if (progressMessageInterval) {
        clearInterval(progressMessageInterval);
        progressMessageInterval = null;
      }
    }
  }

  function handleCancel() {
    // Use browser history for proper back navigation
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
    } else {
      goto("/");
    }
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
        size="icon"
        onclick={handleCancel}
        class="h-8 w-8 border border-border/30 hover:border-[var(--cyber-cyan)] hover:text-[var(--cyber-cyan)]"
      >
        <ArrowLeft class="h-4 w-4" />
      </Button>
      <ThemeToggle />
      <div>
        <h1 class="text-2xl font-bold glitch-hover">
          New Project
        </h1>
        <p class="font-mono text-sm text-muted-foreground">
          Create a new project or import from GitHub
        </p>
      </div>
    </div>

    <!-- Provider Selector -->
    {#if !isSubmitting}
      <div class="cyber-card corner-accent overflow-hidden p-6 animate-fade-in-up">
        <ProviderSelector 
          bind:value={selectedProvider}
          disabled={isSubmitting}
        />
      </div>
    {/if}

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
            <Tabs.List class="grid w-full grid-cols-3 p-0 h-auto bg-transparent">
              <Tabs.Trigger 
                value="scratch" 
                class="py-3 px-2 sm:px-4 font-mono text-[10px] sm:text-xs uppercase tracking-wider rounded-none border-b-2 
                       data-[state=active]:border-[var(--cyber-cyan)] data-[state=active]:text-[var(--cyber-cyan)]
                       data-[state=inactive]:border-transparent data-[state=inactive]:text-muted-foreground
                       hover:text-foreground transition-colors bg-transparent"
              >
                Blank
              </Tabs.Trigger>
              <Tabs.Trigger 
                value="templates"
                class="py-3 px-2 sm:px-4 font-mono text-[10px] sm:text-xs uppercase tracking-wider rounded-none border-b-2 
                       data-[state=active]:border-[var(--cyber-cyan)] data-[state=active]:text-[var(--cyber-cyan)]
                       data-[state=inactive]:border-transparent data-[state=inactive]:text-muted-foreground
                       hover:text-foreground transition-colors bg-transparent flex items-center justify-center gap-1"
              >
                <Sparkles class="w-3 h-3" />
                <span class="hidden sm:inline">Templates</span>
                <span class="sm:hidden">Quick</span>
              </Tabs.Trigger>
              <Tabs.Trigger 
                value="github"
                class="py-3 px-2 sm:px-4 font-mono text-[10px] sm:text-xs uppercase tracking-wider rounded-none border-b-2 
                       data-[state=active]:border-[var(--cyber-cyan)] data-[state=active]:text-[var(--cyber-cyan)]
                       data-[state=inactive]:border-transparent data-[state=inactive]:text-muted-foreground
                       hover:text-foreground transition-colors bg-transparent"
              >
                GitHub
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
                
                <!-- Docker-specific: Agent team selector -->
                {#if selectedProvider === "docker"}
                  <div class="space-y-2 border-t border-border/30 pt-4">
                    <AgentTeamSelector
                      bind:selectedAgentSlugs
                      disabled={isSubmitting}
                    />
                  </div>
                {/if}
                
                <!-- Docker-specific options -->
                {#if selectedProvider === "docker"}
                  <!-- Flavor selector -->
                  <div class="space-y-2 border-t border-border/30 pt-4">
                    <FlavorSelector
                      bind:selectedFlavorId
                      disabled={isSubmitting}
                    />
                    
                    <!-- Warning if selected flavor is not available -->
                    {#if selectedFlavorId && flavorStatusLoaded && !isFlavorAvailable(selectedFlavorId)}
                      <div class="p-3 rounded border border-[var(--cyber-amber)]/50 bg-[var(--cyber-amber)]/5">
                        <p class="text-sm text-[var(--cyber-amber)] font-mono">
                          <span class="font-bold">{selectedFlavorName()}</span> environment is not downloaded.
                          Please download it from the list above before creating your project.
                        </p>
                      </div>
                    {/if}
                  </div>
                  
                  <!-- Advanced Options (Collapsible) -->
                  <Collapsible.Root bind:open={advancedOptionsOpen} class="border-t border-border/30 pt-4">
                    <Collapsible.Trigger 
                      class="flex items-center justify-between w-full py-2 px-3 -mx-3 rounded 
                             hover:bg-[var(--cyber-cyan)]/5 transition-colors group"
                      disabled={isSubmitting}
                    >
                      <div class="flex items-center gap-2">
                        <Settings2 class="w-4 h-4 text-muted-foreground group-hover:text-[var(--cyber-cyan)] transition-colors" />
                        <span class="font-mono text-xs uppercase tracking-wider text-muted-foreground group-hover:text-foreground transition-colors">
                          Advanced Options
                        </span>
                        {#if selectedAddonIds.length > 0 || selectedResourceTierId}
                          <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--cyber-cyan)]/10 text-[var(--cyber-cyan)] border border-[var(--cyber-cyan)]/30">
                            {#if selectedResourceTierId && selectedAddonIds.length > 0}
                              Configured
                            {:else if selectedAddonIds.length > 0}
                              {selectedAddonIds.length} addon{selectedAddonIds.length > 1 ? 's' : ''}
                            {:else}
                              Custom tier
                            {/if}
                          </span>
                        {/if}
                      </div>
                      <ChevronDown 
                        class="w-4 h-4 text-muted-foreground transition-transform duration-200
                               {advancedOptionsOpen ? 'rotate-180' : ''}" 
                      />
                    </Collapsible.Trigger>
                    
                    <Collapsible.Content class="pt-4 space-y-4">
                      <!-- Resource Tier selector -->
                      <div class="space-y-2">
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
                    </Collapsible.Content>
                  </Collapsible.Root>
                {/if}
              </Tabs.Content>
              
              <!-- Templates Tab -->
              <Tabs.Content value="templates" class="space-y-4 mt-0">
                <div class="space-y-3">
                  <p class="text-xs text-muted-foreground font-mono">
                    Start with a pre-configured template to get going quickly
                  </p>
                  
                  <!-- Template cards -->
                  <div class="grid gap-2">
                    {#each projectTemplates as template (template.id)}
                      {@const isSelected = selectedTemplateId === template.id}
                      <button
                        type="button"
                        class="w-full text-left p-3 rounded border transition-all
                          {isSelected 
                            ? 'border-[var(--cyber-cyan)] bg-[var(--cyber-cyan)]/10 shadow-[0_0_12px_var(--cyber-cyan)/15]' 
                            : 'border-border/30 hover:border-[var(--cyber-cyan)]/50 hover:bg-[var(--cyber-cyan)]/5'}"
                        onclick={() => applyTemplate(template)}
                        disabled={isSubmitting}
                      >
                        <div class="flex items-start gap-3">
                          <!-- Icon -->
                          <div class="flex-shrink-0 w-10 h-10 rounded-lg bg-[var(--cyber-cyan)]/10 border border-[var(--cyber-cyan)]/30 
                                      flex items-center justify-center">
                            <template.icon class="w-5 h-5 text-[var(--cyber-cyan)]" />
                          </div>
                          
                          <!-- Content -->
                          <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-2 mb-0.5">
                              <span class="font-medium text-sm {isSelected ? 'text-[var(--cyber-cyan)]' : ''}">
                                {template.name}
                              </span>
                            </div>
                            <p class="text-xs text-muted-foreground mb-2">
                              {template.description}
                            </p>
                            <div class="flex flex-wrap gap-1">
                              {#each template.tags as tag}
                                <span class="text-[10px] px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground border border-border/30">
                                  {tag}
                                </span>
                              {/each}
                            </div>
                          </div>
                          
                          <!-- Arrow indicator -->
                          <div class="flex-shrink-0 self-center">
                            <ChevronDown class="w-4 h-4 -rotate-90 text-muted-foreground" />
                          </div>
                        </div>
                      </button>
                    {/each}
                  </div>
                  
                  <p class="text-[10px] text-muted-foreground/70 font-mono">
                    Selecting a template will pre-fill the project form. You can customize before creating.
                  </p>
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
                
                <!-- Docker-specific: Agent team selector -->
                {#if selectedProvider === "docker"}
                  <div class="space-y-2 border-t border-border/30 pt-4">
                    <AgentTeamSelector
                      bind:selectedAgentSlugs
                      disabled={isSubmitting}
                    />
                  </div>
                {/if}
                
                <!-- Docker-specific options -->
                {#if selectedProvider === "docker"}
                  <!-- Flavor selector -->
                  <div class="space-y-2 border-t border-border/30 pt-4">
                    <FlavorSelector
                      bind:selectedFlavorId
                      disabled={isSubmitting}
                    />
                    
                    <!-- Warning if selected flavor is not available -->
                    {#if selectedFlavorId && flavorStatusLoaded && !isFlavorAvailable(selectedFlavorId)}
                      <div class="p-3 rounded border border-[var(--cyber-amber)]/50 bg-[var(--cyber-amber)]/5">
                        <p class="text-sm text-[var(--cyber-amber)] font-mono">
                          <span class="font-bold">{selectedFlavorName()}</span> environment is not downloaded.
                          Please download it from the list above before creating your project.
                        </p>
                      </div>
                    {/if}
                  </div>
                  
                  <!-- Advanced Options (Collapsible) -->
                  <Collapsible.Root bind:open={advancedOptionsOpen} class="border-t border-border/30 pt-4">
                    <Collapsible.Trigger 
                      class="flex items-center justify-between w-full py-2 px-3 -mx-3 rounded 
                             hover:bg-[var(--cyber-cyan)]/5 transition-colors group"
                      disabled={isSubmitting}
                    >
                      <div class="flex items-center gap-2">
                        <Settings2 class="w-4 h-4 text-muted-foreground group-hover:text-[var(--cyber-cyan)] transition-colors" />
                        <span class="font-mono text-xs uppercase tracking-wider text-muted-foreground group-hover:text-foreground transition-colors">
                          Advanced Options
                        </span>
                        {#if selectedAddonIds.length > 0 || selectedResourceTierId}
                          <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--cyber-cyan)]/10 text-[var(--cyber-cyan)] border border-[var(--cyber-cyan)]/30">
                            {#if selectedResourceTierId && selectedAddonIds.length > 0}
                              Configured
                            {:else if selectedAddonIds.length > 0}
                              {selectedAddonIds.length} addon{selectedAddonIds.length > 1 ? 's' : ''}
                            {:else}
                              Custom tier
                            {/if}
                          </span>
                        {/if}
                      </div>
                      <ChevronDown 
                        class="w-4 h-4 text-muted-foreground transition-transform duration-200
                               {advancedOptionsOpen ? 'rotate-180' : ''}" 
                      />
                    </Collapsible.Trigger>
                    
                    <Collapsible.Content class="pt-4 space-y-4">
                      <!-- Resource Tier selector -->
                      <div class="space-y-2">
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
                    </Collapsible.Content>
                  </Collapsible.Root>
                {/if}
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
                         bg-[var(--cyber-cyan)] hover:bg-[var(--cyber-cyan)]/90 text-[var(--cyber-cyan-foreground)]
                         disabled:opacity-30"
                >
                  {#if isSubmitting}
                    <div class="relative w-4 h-4 mr-2">
                      <div class="absolute inset-0 rounded-full border-2 border-black/20"></div>
                      <div class="absolute inset-0 rounded-full border-2 border-transparent border-t-black animate-spin"></div>
                    </div>
                    Creating...
                  {:else if activeTab === "github"}
                    Import Project
                  {:else}
                    Create Project
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
        {:else if activeTab === "templates"}
          Choose a template to pre-configure your project settings.
        {:else}
          The repository will be cloned and a sandbox container will be set up with the code.
        {/if}
      </p>
    </div>
  </div>
</main>
