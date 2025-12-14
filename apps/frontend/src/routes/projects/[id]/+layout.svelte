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
  import { Badge } from "$lib/components/ui/badge";
  import * as Tabs from "$lib/components/ui/tabs";
  import * as Dialog from "$lib/components/ui/dialog";

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

  function handleTabChange(value: string) {
    goto(`/projects/${sandboxId}/${value}`);
  }

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

  // Get display name from labels
  function getDisplayName(): string {
    if (!sandbox) return "";
    return sandbox.labels?.["agentpod.sandbox.name"] || sandbox.name;
  }

  function getDescription(): string | undefined {
    if (!sandbox) return undefined;
    // Description is stored in the repository, not in sandbox labels
    // For now, show the image
    return undefined;
  }
</script>

<main class="container mx-auto px-4 py-8 max-w-6xl">
  {#if sandbox}
    <div class="space-y-6">
      <!-- Header -->
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div class="flex items-center gap-4">
          <Button variant="ghost" size="sm" onclick={() => goto("/projects")}>
            ← Back
          </Button>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 overflow-hidden">
              <h1 class="text-2xl font-bold truncate">{getDisplayName()}</h1>
              <Badge variant={getStatusColor(sandbox.status)} class="shrink-0 whitespace-nowrap">
                {getStatusLabel(sandbox.status)}
              </Badge>
            </div>
            <p class="text-muted-foreground text-sm truncate">{sandbox.image}</p>
          </div>
        </div>
        <div class="flex gap-2">
          {#if sandbox.status === "stopped" || sandbox.status === "created"}
            <Button size="sm" onclick={() => startSandbox(sandbox.id)}>
              Start
            </Button>
          {:else if sandbox.status === "running"}
            <Button size="sm" variant="secondary" onclick={() => stopSandbox(sandbox.id)}>
              Stop
            </Button>
          {:else if sandbox.status === "starting" || sandbox.status === "stopping"}
            <Button size="sm" disabled={true}>
              {sandbox.status === "starting" ? "Starting..." : "Stopping..."}
            </Button>
          {/if}
          <Button size="sm" variant="outline" onclick={() => showRestartDialog = true}>
            Restart
          </Button>
        </div>
      </div>

      <!-- Restart Confirmation Dialog -->
      <Dialog.Root bind:open={showRestartDialog}>
        <Dialog.Content>
          <Dialog.Header>
            <Dialog.Title>Restart Container</Dialog.Title>
            <Dialog.Description>
              This will restart the sandbox container. Any unsaved work in the container will be lost.
            </Dialog.Description>
          </Dialog.Header>
          
          {#if restartError}
            <div class="text-sm p-3 rounded-md bg-destructive/10 text-destructive">
              {restartError}
            </div>
          {/if}
          
          <Dialog.Footer>
            <Button variant="outline" onclick={() => showRestartDialog = false} disabled={isRestarting}>
              Cancel
            </Button>
            <Button onclick={handleRestart} disabled={isRestarting}>
              {isRestarting ? "Restarting..." : "Restart"}
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog.Root>

      <!-- Tabs Navigation -->
      <Tabs.Root value={currentTab()} onValueChange={handleTabChange}>
        <Tabs.List class="grid w-full grid-cols-5 max-w-xl">
          <Tabs.Trigger value="chat">Chat</Tabs.Trigger>
          <Tabs.Trigger value="files">Files</Tabs.Trigger>
          <Tabs.Trigger value="logs">Logs</Tabs.Trigger>
          <Tabs.Trigger value="sync">Git</Tabs.Trigger>
          <Tabs.Trigger value="settings">Settings</Tabs.Trigger>
        </Tabs.List>
      </Tabs.Root>

      <!-- Tab Content (children) -->
      <div class="min-h-[60vh]">
        {@render children()}
      </div>
    </div>
  {:else if sandboxes.isLoading}
    <div class="flex items-center justify-center min-h-[60vh]">
      <div class="text-center">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
        <p class="mt-4 text-muted-foreground">Loading project...</p>
      </div>
    </div>
  {:else}
    <div class="flex items-center justify-center min-h-[60vh]">
      <div class="text-center">
        <p class="text-muted-foreground">Project not found</p>
        <Button variant="link" onclick={() => goto("/projects")}>
          Back to Projects
        </Button>
      </div>
    </div>
  {/if}
</main>
