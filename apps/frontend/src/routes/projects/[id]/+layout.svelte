<script lang="ts">
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { toast } from "svelte-sonner";
  import { connection } from "$lib/stores/connection.svelte";
  import { 
    sandboxes, 
    fetchSandboxes, 
    fetchSandbox,
    restartSandbox,
    getSandbox 
  } from "$lib/stores/sandboxes.svelte";
  import { markAsSeen } from "$lib/stores/unseen-completions.svelte";
  import { Button } from "$lib/components/ui/button";
  import * as Dialog from "$lib/components/ui/dialog";
  import PageHeader, { type PageIcon } from "$lib/components/page-header.svelte";
  import ThemeToggle from "$lib/components/theme-toggle.svelte";
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
  import MessageSquareIcon from "@lucide/svelte/icons/message-square";
  import FolderIcon from "@lucide/svelte/icons/folder";
  import ScrollTextIcon from "@lucide/svelte/icons/scroll-text";
  import TerminalIcon from "@lucide/svelte/icons/terminal";
  import GitBranchIcon from "@lucide/svelte/icons/git-branch";
  import GlobeIcon from "@lucide/svelte/icons/globe";
  import SettingsIcon from "@lucide/svelte/icons/settings";
  import { getProjectIcon } from "$lib/utils/project-icons";
  import { getAnimatedIcon } from "$lib/utils/animated-icons";
  import { projectIcons, parseIconId } from "$lib/stores/project-icons.svelte";

  let { children } = $props();

  // Redirect if not connected
  $effect(() => {
    if (!connection.isConnected) {
      goto("/setup");
    }
  });

  // Get current sandbox ID from route params
  let sandboxId = $derived($page.params.id ?? "");

  // Get current sandbox from list
  let sandbox = $derived(sandboxId ? getSandbox(sandboxId) : undefined);
  
  // Clear unseen completion indicator when user visits the project
  $effect(() => {
    if (sandboxId) {
      markAsSeen(sandboxId);
    }
  });

  // Get current tab from URL path
  let currentTab = $derived(() => {
    const path = $page.url.pathname;
    if (path.includes("/chat")) return "chat";
    if (path.includes("/files")) return "files";
    if (path.includes("/logs")) return "logs";
    if (path.includes("/terminal")) return "terminal";
    if (path.includes("/preview")) return "preview";
    if (path.includes("/sync")) return "sync";
    if (path.includes("/settings")) return "settings";
    return "chat";
  });

  // Restart state (replaces deploy for v2)
  let isRestarting = $state(false);
  let restartError = $state<string | null>(null);
  let showRestartDialog = $state(false);

  async function handleRestart() {
    if (!sandbox) return;
    
    isRestarting = true;
    restartError = null;
    
    try {
      await restartSandbox(sandbox.id);
      showRestartDialog = false;
      
      toast.success("Container restarted", {
        description: "The sandbox container has been restarted.",
      });
      
      // Refresh sandbox info
      await fetchSandbox(sandbox.id);
    } catch (e) {
      restartError = e instanceof Error ? e.message : "Restart failed";
      toast.error("Restart failed", {
        description: restartError,
      });
    } finally {
      isRestarting = false;
    }
  }

  // Load sandboxes and fetch current sandbox details
  $effect(() => {
    if (connection.isConnected) {
      if (sandboxes.list.length === 0) {
        fetchSandboxes();
      }
      if (sandboxId) {
        fetchSandbox(sandboxId);
      }
    }
  });

  function handleTabChange(tab: string) {
    // Use replaceState to avoid polluting browser history with tab changes
    // This way the back button navigates to the previous page, not previous tab
    goto(`/projects/${sandboxId}/${tab}`, { replaceState: true });
  }

  function getStatusVariant(status: string): "running" | "starting" | "stopped" | "error" {
    switch (status) {
      case "running": return "running";
      case "starting":
      case "stopping": return "starting";
      case "created":
      case "stopped": return "stopped";
      case "error":
      case "dead":
      case "unknown": return "error";
      default: return "stopped";
    }
  }

  function getStatusLabel(status: string): string {
    switch (status) {
      case "exited": return "stopped";
      case "created": return "ready";
      default: return status;
    }
  }

  // Get display name (project name from DB)
  function getDisplayName(): string {
    if (!sandbox) return "";
    return sandbox.name;
  }

  // Get subtitle with container name and image
  function getSubtitle(): string {
    if (!sandbox) return "";
    const containerName = sandbox.containerName || sandbox.slug || "";
    const image = sandbox.image || "";
    
    if (containerName && image) {
      return `${containerName} | ${image}`;
    }
    return containerName || image;
  }

  // Get project icon - supports both static and animated icons
  function getProjectIconData(): PageIcon | undefined {
    if (!sandbox) return undefined;
    
    // Get icon ID from store (includes fallback logic)
    const iconId = projectIcons.getIconId(sandbox.id, getDisplayName());
    const { isAnimated, id } = parseIconId(iconId);
    
    if (isAnimated) {
      const animatedIcon = getAnimatedIcon(id);
      if (animatedIcon) {
        return { type: "animated", path: animatedIcon.path };
      }
    }
    
    // Fall back to static icon
    const staticIcon = getProjectIcon(isAnimated ? "code" : id);
    return staticIcon?.component;
  }

  const tabs = [
    { id: "chat", label: "Chat", icon: MessageSquareIcon },
    { id: "files", label: "Files", icon: FolderIcon },
    { id: "logs", label: "Logs", icon: ScrollTextIcon },
    { id: "terminal", label: "Terminal", icon: TerminalIcon },
    { id: "preview", label: "Preview", icon: GlobeIcon },
    { id: "sync", label: "Git", icon: GitBranchIcon },
    { id: "settings", label: "Settings", icon: SettingsIcon },
  ];

  // Back navigation - uses browser history for proper back behavior
  // Tab changes use replaceState so they don't pollute history
  function goBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
    } else {
      goto("/");
    }
  }
</script>

<!-- Noise overlay for atmosphere -->
<div class="noise-overlay"></div>

<main class="h-screen flex flex-col grid-bg overflow-hidden">
  {#if sandbox}
    <!-- Header Bar (fixed at top) -->
    <PageHeader
      title={getDisplayName()}
      icon={getProjectIconData()}
      subtitle={getSubtitle()}
      status={{
        label: getStatusLabel(sandbox.status),
        variant: getStatusVariant(sandbox.status),
        animate: sandbox.status === "running"
      }}
      tabs={tabs}
      activeTab={currentTab()}
      onTabChange={handleTabChange}
      sticky={false}
      collapsible={true}
    >
      {#snippet leading()}
        <Button 
          variant="ghost" 
          size="icon"
          onclick={goBack}
          class="h-8 w-8 border border-border/30 hover:border-[var(--cyber-cyan)] hover:text-[var(--cyber-cyan)]"
        >
          <ArrowLeftIcon class="h-4 w-4" />
        </Button>
      {/snippet}
      {#snippet actions()}
        <!-- Theme Toggle only - Container controls moved to Settings tab -->
        <ThemeToggle />
      {/snippet}
    </PageHeader>

    <!-- Restart Confirmation Dialog -->
    <Dialog.Root bind:open={showRestartDialog}>
      <Dialog.Content class="cyber-card border-border/50">
        <Dialog.Header>
          <Dialog.Title class="font-bold font-heading">
            Restart Container
          </Dialog.Title>
          <Dialog.Description class="font-mono text-sm text-muted-foreground">
            This will restart the sandbox container. Any unsaved work in the container will be lost.
          </Dialog.Description>
        </Dialog.Header>
        
        {#if restartError}
          <div class="p-3 rounded border border-[var(--cyber-red)]/50 bg-[var(--cyber-red)]/5">
            <div class="flex items-center gap-2 text-[var(--cyber-red)]">
              <span class="font-mono text-xs uppercase tracking-wider">[error]</span>
              <span class="text-sm">{restartError}</span>
            </div>
          </div>
        {/if}
        
        <Dialog.Footer class="gap-2">
          <Button 
            variant="outline" 
            onclick={() => showRestartDialog = false} 
            disabled={isRestarting}
            class="font-mono text-xs uppercase tracking-wider"
          >
            Cancel
          </Button>
          <Button 
            onclick={handleRestart} 
            disabled={isRestarting}
            class="font-mono text-xs uppercase tracking-wider bg-[var(--cyber-amber)] hover:bg-[var(--cyber-amber)]/90 text-black"
          >
            {isRestarting ? "Restarting..." : "Restart"}
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog.Root>

    <!-- Content area - fills remaining height, each page handles its own scrolling -->
    <div class="flex-1 min-h-0 flex flex-col pb-16 md:pb-0">
      <div class="container mx-auto px-4 sm:px-6 py-4 md:py-6 max-w-7xl flex-1 min-h-0 flex flex-col">
        {@render children()}
      </div>
    </div>
  {:else if sandboxes.isLoading}
    <!-- Loading State -->
    <div class="flex items-center justify-center min-h-[60vh]">
      <div class="text-center animate-fade-in-up">
        <div class="relative mx-auto w-16 h-16">
          <div class="absolute inset-0 rounded-full border-2 border-[var(--cyber-cyan)]/20"></div>
          <div class="absolute inset-0 rounded-full border-2 border-transparent border-t-[var(--cyber-cyan)] animate-spin"></div>
          <div class="absolute inset-0 flex items-center justify-center">
            <div class="w-2 h-2 rounded-full bg-[var(--cyber-cyan)] animate-pulse-dot"></div>
          </div>
        </div>
        <p class="mt-6 text-sm font-mono text-muted-foreground tracking-wider uppercase">
          Loading project<span class="typing-cursor"></span>
        </p>
      </div>
    </div>
  {:else}
    <!-- Not Found State -->
    <div class="flex items-center justify-center min-h-[60vh]">
      <div class="text-center animate-fade-in-up cyber-card corner-accent p-12">
        <div class="font-mono text-5xl text-[var(--cyber-red)]/30 mb-6">404</div>
        <p class="text-muted-foreground font-mono mb-4">Project not found</p>
        <Button 
          variant="outline" 
          onclick={() => goto("/projects")}
          class="font-mono text-xs uppercase tracking-wider"
        >
          &larr; Back to Projects
        </Button>
      </div>
    </div>
  {/if}
</main>
