<script lang="ts">
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { toast } from "svelte-sonner";
  import { connection } from "$lib/stores/connection.svelte";
  import { 
    sandboxes, 
    fetchSandboxes, 
    fetchSandbox,
    startSandbox, 
    stopSandbox, 
    restartSandbox,
    getSandbox 
  } from "$lib/stores/sandboxes.svelte";
  import { Button } from "$lib/components/ui/button";
  import * as Dialog from "$lib/components/ui/dialog";
  import PageHeader from "$lib/components/page-header.svelte";

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

  // Get current tab from URL path
  let currentTab = $derived(() => {
    const path = $page.url.pathname;
    if (path.includes("/chat")) return "chat";
    if (path.includes("/files")) return "files";
    if (path.includes("/logs")) return "logs";
    if (path.includes("/terminal")) return "terminal";
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
    goto(`/projects/${sandboxId}/${tab}`);
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

  // Get display name from labels
  function getDisplayName(): string {
    if (!sandbox) return "";
    return sandbox.labels?.["agentpod.sandbox.name"] || sandbox.name;
  }

  const tabs = [
    { id: "chat", label: "Chat" },
    { id: "files", label: "Files" },
    { id: "logs", label: "Logs" },
    { id: "terminal", label: "Terminal" },
    { id: "sync", label: "Git" },
    { id: "settings", label: "Settings" },
  ];
</script>

<!-- Noise overlay for atmosphere -->
<div class="noise-overlay"></div>

<main class="min-h-screen grid-bg">
  {#if sandbox}
    <!-- Header Bar -->
    <PageHeader
      title={getDisplayName()}
      subtitle={sandbox.image}
      status={{
        label: getStatusLabel(sandbox.status),
        variant: getStatusVariant(sandbox.status),
        animate: sandbox.status === "running"
      }}
      tabs={tabs}
      activeTab={currentTab()}
      onTabChange={handleTabChange}
    >
      {#snippet leading()}
        <Button 
          variant="ghost" 
          size="sm" 
          onclick={() => goto("/projects")}
          class="shrink-0 font-mono text-xs uppercase tracking-wider h-8 px-3"
        >
          &larr; Back
        </Button>
      {/snippet}
      {#snippet actions()}
        {#if sandbox.status === "stopped" || sandbox.status === "created"}
          <Button 
            size="sm" 
            onclick={() => startSandbox(sandbox.id)}
            class="font-mono text-xs uppercase tracking-wider h-8 px-4
                   bg-[var(--cyber-emerald)] hover:bg-[var(--cyber-emerald)]/90 text-black"
          >
            Start
          </Button>
        {:else if sandbox.status === "running"}
          <Button 
            size="sm" 
            variant="secondary"
            onclick={() => stopSandbox(sandbox.id)}
            class="font-mono text-xs uppercase tracking-wider h-8 px-4"
          >
            Stop
          </Button>
        {:else if sandbox.status === "starting" || sandbox.status === "stopping"}
          <Button 
            size="sm" 
            disabled={true}
            class="font-mono text-xs uppercase tracking-wider h-8 px-4"
          >
            {sandbox.status === "starting" ? "Starting..." : "Stopping..."}
          </Button>
        {/if}
        <Button 
          size="sm" 
          variant="outline" 
          onclick={() => showRestartDialog = true}
          class="font-mono text-xs uppercase tracking-wider h-8 px-4 border-border/50"
        >
          Restart
        </Button>
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

    <!-- Tab Content (children) -->
    <div class="container mx-auto px-4 sm:px-6 py-6 max-w-7xl">
      {@render children()}
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
