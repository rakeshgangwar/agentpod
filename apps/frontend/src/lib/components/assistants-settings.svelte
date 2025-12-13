<script lang="ts">
  /**
   * AI Assistants Settings Component
   * 
   * Settings tab for managing AI Assistants (agent harnesses).
   * Features:
   * - List of built-in and custom assistants
   * - Default assistant selector
   * - Authentication flows
   * - Start/stop controls
   * - Add custom assistants
   */
  
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";
  import type { AgentInstance } from "$lib/api/tauri";
  import {
    assistantsStore,
    initAssistants,
    refreshAssistants,
    spawnAssistant,
    stopAssistant,
    setDefaultAssistant,
    removeCustomAssistant,
  } from "$lib/stores/assistants.svelte";
  import { Button } from "$lib/components/ui/button";
  import { Badge } from "$lib/components/ui/badge";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import * as Card from "$lib/components/ui/card";
  import * as Dialog from "$lib/components/ui/dialog";
  import AssistantCard from "./assistant-card.svelte";
  import AssistantAuthModal from "./assistant-auth-modal.svelte";
  
  // State
  let searchQuery = $state("");
  let actionInProgress = $state<string | null>(null);
  
  // Auth modal state
  let showAuthModal = $state(false);
  let authAssistant = $state<AgentInstance | null>(null);
  
  // Remove confirmation state
  let showRemoveDialog = $state(false);
  let assistantToRemove = $state<AgentInstance | null>(null);
  let removing = $state(false);
  
  // Add custom assistant state
  let showAddDialog = $state(false);
  let newAssistant = $state({
    id: "",
    name: "",
    command: "",
    description: "",
    args: "",
    requiresAuth: false,
    authType: "none" as "none" | "api_key" | "device_flow",
  });
  let adding = $state(false);
  
  // Derived: filtered assistants
  const filteredBuiltIn = $derived(
    assistantsStore.builtIn.filter(a =>
      a.config.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.config.description.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );
  
  const filteredCustom = $derived(
    assistantsStore.custom.filter(a =>
      a.config.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.config.description.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );
  
  // Load on mount
  onMount(() => {
    initAssistants();
  });
  
  // Handlers
  async function handleStart(assistant: AgentInstance) {
    actionInProgress = assistant.id;
    try {
      await spawnAssistant(assistant.id);
      toast.success(`${assistant.config.name} started`);
    } catch (e) {
      toast.error(`Failed to start ${assistant.config.name}`, {
        description: e instanceof Error ? e.message : "Unknown error"
      });
    } finally {
      actionInProgress = null;
    }
  }
  
  async function handleStop(assistant: AgentInstance) {
    actionInProgress = assistant.id;
    try {
      await stopAssistant(assistant.id);
      toast.success(`${assistant.config.name} stopped`);
    } catch (e) {
      toast.error(`Failed to stop ${assistant.config.name}`, {
        description: e instanceof Error ? e.message : "Unknown error"
      });
    } finally {
      actionInProgress = null;
    }
  }
  
  function handleAuth(assistant: AgentInstance) {
    authAssistant = assistant;
    showAuthModal = true;
  }
  
  function handleAuthSuccess() {
    // Refresh the list to show updated auth status
    refreshAssistants();
  }
  
  async function handleSetDefault(assistant: AgentInstance) {
    try {
      await setDefaultAssistant(assistant.id);
      toast.success(`${assistant.config.name} is now the default`);
    } catch (e) {
      toast.error("Failed to set default assistant", {
        description: e instanceof Error ? e.message : "Unknown error"
      });
    }
  }
  
  function handleRemoveClick(assistant: AgentInstance) {
    assistantToRemove = assistant;
    showRemoveDialog = true;
  }
  
  async function handleConfirmRemove() {
    if (!assistantToRemove) return;
    
    removing = true;
    try {
      await removeCustomAssistant(assistantToRemove.id);
      toast.success(`${assistantToRemove.config.name} removed`);
      showRemoveDialog = false;
      assistantToRemove = null;
    } catch (e) {
      toast.error("Failed to remove assistant", {
        description: e instanceof Error ? e.message : "Unknown error"
      });
    } finally {
      removing = false;
    }
  }
</script>

<div class="space-y-6">
  <!-- Header with Stats -->
  <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
    <div>
      <h2 class="text-xl font-semibold">AI Assistants</h2>
      <p class="text-sm text-muted-foreground">
        Configure AI coding assistants for your sessions
      </p>
    </div>
    
    <!-- Stats badges -->
    <div class="flex items-center gap-3">
      <div class="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-full">
        <span class="text-sm font-medium">{assistantsStore.all.length}</span>
        <span class="text-xs text-muted-foreground">available</span>
      </div>
      <div class="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 rounded-full">
        <span class="text-sm font-medium text-green-600">{assistantsStore.running.length}</span>
        <span class="text-xs text-muted-foreground">running</span>
      </div>
      {#if assistantsStore.default}
        <div class="flex items-center gap-2 px-3 py-1.5 bg-primary/10 rounded-full">
          <span class="text-xs font-medium">{assistantsStore.default.config.name}</span>
          <Badge variant="secondary" class="text-[10px] px-1.5 py-0">Default</Badge>
        </div>
      {/if}
    </div>
  </div>

  <!-- Search -->
  <div class="relative">
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
      fill="none" 
      viewBox="0 0 24 24" 
      stroke="currentColor"
    >
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
    <Input 
      bind:value={searchQuery}
      placeholder="Search assistants..."
      class="pl-10"
    />
  </div>

  {#if assistantsStore.isLoading && !assistantsStore.isInitialized}
    <!-- Loading state -->
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {#each Array(4) as _}
        <div class="h-32 bg-muted rounded-lg animate-pulse"></div>
      {/each}
    </div>
  {:else if assistantsStore.error}
    <!-- Error state -->
    <Card.Root class="border-destructive/50 bg-destructive/5">
      <Card.Content class="pt-6">
        <div class="flex items-center gap-3">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <p class="font-medium text-destructive">Failed to load assistants</p>
            <p class="text-sm text-muted-foreground">{assistantsStore.error}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onclick={refreshAssistants} class="mt-4">
          Try Again
        </Button>
      </Card.Content>
    </Card.Root>
  {:else}
    <!-- Built-in Assistants -->
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <h3 class="text-lg font-medium">Built-in Assistants</h3>
        <span class="text-xs text-muted-foreground">{filteredBuiltIn.length} assistants</span>
      </div>
      
      {#if filteredBuiltIn.length === 0}
        <Card.Root class="border-dashed">
          <Card.Content class="pt-6 text-center">
            <p class="text-muted-foreground">No built-in assistants match your search</p>
          </Card.Content>
        </Card.Root>
      {:else}
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {#each filteredBuiltIn as assistant (assistant.id)}
            <AssistantCard
              {assistant}
              isDefault={assistant.id === assistantsStore.defaultId}
              onStart={() => handleStart(assistant)}
              onStop={() => handleStop(assistant)}
              onAuth={() => handleAuth(assistant)}
              onSetDefault={() => handleSetDefault(assistant)}
              disabled={actionInProgress === assistant.id}
            />
          {/each}
        </div>
      {/if}
    </div>

    <!-- Custom Assistants -->
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <h3 class="text-lg font-medium">Custom Assistants</h3>
        <Button variant="outline" size="sm" onclick={() => showAddDialog = true}>
          + Add Custom
        </Button>
      </div>
      
      {#if filteredCustom.length === 0}
        <Card.Root class="border-dashed">
          <Card.Content class="pt-6 text-center">
            <div class="space-y-3">
              <div class="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </div>
              <div>
                <p class="font-medium">No custom assistants</p>
                <p class="text-sm text-muted-foreground">Add your own ACP-compatible assistants</p>
              </div>
              <Button variant="outline" onclick={() => showAddDialog = true}>
                Add Custom Assistant
              </Button>
            </div>
          </Card.Content>
        </Card.Root>
      {:else}
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {#each filteredCustom as assistant (assistant.id)}
            <AssistantCard
              {assistant}
              isDefault={assistant.id === assistantsStore.defaultId}
              onStart={() => handleStart(assistant)}
              onStop={() => handleStop(assistant)}
              onAuth={() => handleAuth(assistant)}
              onSetDefault={() => handleSetDefault(assistant)}
              onRemove={() => handleRemoveClick(assistant)}
              disabled={actionInProgress === assistant.id}
            />
          {/each}
        </div>
      {/if}
    </div>

    <!-- Info Card -->
    <Card.Root class="bg-muted/30">
      <Card.Content class="pt-6">
        <div class="flex items-start gap-3">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div class="space-y-1 text-sm text-muted-foreground">
            <p><strong>OpenCode</strong> is the default assistant and requires no authentication.</p>
            <p>Other assistants like <strong>Claude Code</strong> require signing in with your provider account.</p>
            <p>You can add custom ACP-compatible assistants using the "Add Custom" button.</p>
          </div>
        </div>
      </Card.Content>
    </Card.Root>
  {/if}
</div>

<!-- Auth Modal (standalone component) -->
<AssistantAuthModal
  assistant={authAssistant}
  open={showAuthModal}
  onOpenChange={(open) => {
    showAuthModal = open;
    if (!open) authAssistant = null;
  }}
  onSuccess={handleAuthSuccess}
/>

<!-- Remove Confirmation Dialog -->
<Dialog.Root bind:open={showRemoveDialog}>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>Remove Assistant</Dialog.Title>
      <Dialog.Description>
        Are you sure you want to remove {assistantToRemove?.config.name}? This action cannot be undone.
      </Dialog.Description>
    </Dialog.Header>
    <Dialog.Footer>
      <Button variant="outline" onclick={() => showRemoveDialog = false}>
        Cancel
      </Button>
      <Button 
        variant="destructive"
        onclick={handleConfirmRemove}
        disabled={removing}
      >
        {removing ? "Removing..." : "Remove"}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<!-- Add Custom Assistant Dialog -->
<Dialog.Root bind:open={showAddDialog}>
  <Dialog.Content class="sm:max-w-lg">
    <Dialog.Header>
      <Dialog.Title>Add Custom Assistant</Dialog.Title>
      <Dialog.Description>
        Add an ACP-compatible assistant by specifying its command.
      </Dialog.Description>
    </Dialog.Header>
    
    <div class="space-y-4 py-4">
      <div class="grid grid-cols-2 gap-4">
        <div class="space-y-2">
          <Label for="custom-id">ID</Label>
          <Input 
            id="custom-id"
            bind:value={newAssistant.id}
            placeholder="my-assistant"
          />
          <p class="text-xs text-muted-foreground">Unique identifier (lowercase, no spaces)</p>
        </div>
        
        <div class="space-y-2">
          <Label for="custom-name">Name</Label>
          <Input 
            id="custom-name"
            bind:value={newAssistant.name}
            placeholder="My Assistant"
          />
        </div>
      </div>
      
      <div class="space-y-2">
        <Label for="custom-command">Command</Label>
        <Input 
          id="custom-command"
          bind:value={newAssistant.command}
          placeholder="my-assistant-cli"
          class="font-mono"
        />
        <p class="text-xs text-muted-foreground">The command to execute (must be in PATH)</p>
      </div>
      
      <div class="space-y-2">
        <Label for="custom-args">Arguments (optional)</Label>
        <Input 
          id="custom-args"
          bind:value={newAssistant.args}
          placeholder="--acp --verbose"
          class="font-mono"
        />
        <p class="text-xs text-muted-foreground">Space-separated command arguments</p>
      </div>
      
      <div class="space-y-2">
        <Label for="custom-description">Description (optional)</Label>
        <Input 
          id="custom-description"
          bind:value={newAssistant.description}
          placeholder="A custom AI coding assistant"
        />
      </div>
    </div>
    
    <Dialog.Footer>
      <Button variant="outline" onclick={() => showAddDialog = false}>
        Cancel
      </Button>
      <Button 
        onclick={async () => {
          // TODO: Implement add custom assistant
          toast.info("Custom assistants coming soon!");
          showAddDialog = false;
        }}
        disabled={adding || !newAssistant.id.trim() || !newAssistant.name.trim() || !newAssistant.command.trim()}
      >
        {adding ? "Adding..." : "Add Assistant"}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
