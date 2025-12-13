<script lang="ts">
  /**
   * AI Assistant Picker Component
   * 
   * A compact dropdown for selecting an AI Assistant in the chat interface.
   * Features:
   * - Shows available assistants with status indicators
   * - Triggers auth modal for unauthenticated assistants
   * - Link to manage assistants in settings
   */
  
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import type { AgentInstance } from "$lib/api/tauri";
  import {
    assistantsStore,
    initAssistants,
  } from "$lib/stores/assistants.svelte";
  import * as Select from "$lib/components/ui/select";
  import { Badge } from "$lib/components/ui/badge";
  import AssistantAuthModal from "./assistant-auth-modal.svelte";
  
  // Icons
  import BotIcon from "@lucide/svelte/icons/bot";
  import LockIcon from "@lucide/svelte/icons/lock";
  import SettingsIcon from "@lucide/svelte/icons/settings";
  import CheckCircleIcon from "@lucide/svelte/icons/check-circle-2";
  
  // Props
  interface Props {
    value?: string;
    onValueChange?: (assistantId: string) => void;
    disabled?: boolean;
    compact?: boolean;
  }
  
  let { 
    value = $bindable(assistantsStore.defaultId),
    onValueChange,
    disabled = false,
    compact = false,
  }: Props = $props();
  
  // Auth modal state
  let showAuthModal = $state(false);
  let authAssistant = $state<AgentInstance | null>(null);
  
  // Initialize assistants on mount
  onMount(() => {
    initAssistants();
  });
  
  function handleValueChange(newValue: string | undefined) {
    if (!newValue) return;
    
    // Handle special "manage" action
    if (newValue === "__manage__") {
      goto("/settings?tab=assistants");
      return;
    }
    
    const assistant = assistantsStore.getById(newValue);
    if (!assistant) return;
    
    // Check if authentication is required
    if (assistant.config.requiresAuth && !assistant.authenticated) {
      // Open auth modal
      authAssistant = assistant;
      showAuthModal = true;
      return;
    }
    
    // Update value and notify parent
    value = newValue;
    onValueChange?.(newValue);
  }
  
  function handleAuthSuccess() {
    // After successful auth, select the assistant
    if (authAssistant) {
      value = authAssistant.id;
      onValueChange?.(authAssistant.id);
    }
  }
  
  // Get the currently selected assistant
  const selectedAssistant = $derived(
    assistantsStore.getById(value) || assistantsStore.default
  );
  
  // Get display name for current selection
  function getDisplayName(): string {
    if (!selectedAssistant) return "Select Assistant...";
    return selectedAssistant.config.name;
  }
  
  // Get status indicator for an assistant
  function getStatusIndicator(assistant: AgentInstance): { icon: string; class: string; label: string } {
    if (assistant.config.requiresAuth && !assistant.authenticated) {
      return { icon: "lock", class: "text-amber-500", label: "Sign in required" };
    }
    if (assistant.status === "running") {
      return { icon: "running", class: "text-green-500", label: "Running" };
    }
    if (assistant.status === "error") {
      return { icon: "error", class: "text-destructive", label: "Error" };
    }
    return { icon: "ready", class: "text-muted-foreground", label: "Ready" };
  }
  
</script>

{#if assistantsStore.isLoading && !assistantsStore.isInitialized}
  <div class="text-xs text-muted-foreground animate-pulse px-2 py-1 flex items-center gap-1">
    <BotIcon class="h-3 w-3" />
    Loading...
  </div>
{:else if assistantsStore.error}
  <button
    type="button"
    class="text-xs text-destructive hover:underline px-2 py-1"
    onclick={() => initAssistants()}
    {disabled}
  >
    Error - Retry
  </button>
{:else if assistantsStore.all.length === 0}
  <div class="text-xs text-muted-foreground px-2 py-1">
    No assistants
  </div>
{:else}
  <Select.Root 
    type="single"
    value={value}
    onValueChange={handleValueChange}
    {disabled}
  >
    <Select.Trigger 
      class={compact 
        ? 'h-7 text-xs min-w-[140px] max-w-[200px] gap-1' 
        : 'h-9 text-sm min-w-[180px] gap-2'}
    >
      <span class="flex items-center gap-1.5 truncate">
        <BotIcon class={compact ? 'h-3 w-3' : 'h-4 w-4'} />
        <span class="truncate">{getDisplayName()}</span>
        {#if selectedAssistant?.status === "running"}
          <span class="h-1.5 w-1.5 rounded-full bg-green-500 shrink-0"></span>
        {/if}
      </span>
    </Select.Trigger>
    
    <Select.Portal>
      <Select.Content class="min-w-[220px]">
        <!-- Built-in Assistants -->
        <Select.Group>
          <Select.GroupHeading class="text-xs font-medium text-muted-foreground px-2 py-1.5">
            Built-in Assistants
          </Select.GroupHeading>
          
          {#each assistantsStore.builtIn as assistant (assistant.id)}
            {@const status = getStatusIndicator(assistant)}
            <Select.Item 
              value={assistant.id} 
              class="text-sm py-2"
            >
              <div class="flex items-center justify-between w-full gap-2">
                <div class="flex items-center gap-2 min-w-0">
                  <BotIcon class="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span class="truncate">{assistant.config.name}</span>
                </div>
                
                <div class="flex items-center gap-1.5 shrink-0">
                  {#if assistant.id === assistantsStore.defaultId}
                    <Badge variant="secondary" class="text-[10px] px-1 py-0">Default</Badge>
                  {/if}
                  
                  {#if status.icon === "lock"}
                    <LockIcon class="h-3.5 w-3.5 {status.class}" />
                  {:else if status.icon === "running"}
                    <span class="h-2 w-2 rounded-full bg-green-500"></span>
                  {:else if status.icon === "error"}
                    <span class="h-2 w-2 rounded-full bg-destructive"></span>
                  {:else}
                    <CheckCircleIcon class="h-3.5 w-3.5 {status.class}" />
                  {/if}
                </div>
              </div>
            </Select.Item>
          {/each}
        </Select.Group>
        
        <!-- Custom Assistants (if any) -->
        {#if assistantsStore.custom.length > 0}
          <Select.Separator />
          <Select.Group>
            <Select.GroupHeading class="text-xs font-medium text-muted-foreground px-2 py-1.5">
              Custom Assistants
            </Select.GroupHeading>
            
            {#each assistantsStore.custom as assistant (assistant.id)}
              {@const status = getStatusIndicator(assistant)}
              <Select.Item 
                value={assistant.id} 
                class="text-sm py-2"
              >
                <div class="flex items-center justify-between w-full gap-2">
                  <div class="flex items-center gap-2 min-w-0">
                    <BotIcon class="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span class="truncate">{assistant.config.name}</span>
                  </div>
                  
                  <div class="flex items-center gap-1.5 shrink-0">
                    {#if status.icon === "lock"}
                      <LockIcon class="h-3.5 w-3.5 {status.class}" />
                    {:else if status.icon === "running"}
                      <span class="h-2 w-2 rounded-full bg-green-500"></span>
                    {/if}
                  </div>
                </div>
              </Select.Item>
            {/each}
          </Select.Group>
        {/if}
        
        <!-- Manage Link -->
        <Select.Separator />
        <Select.Item value="__manage__" class="text-sm py-2">
          <div class="flex items-center gap-2 text-muted-foreground">
            <SettingsIcon class="h-4 w-4" />
            <span>Manage AI Assistants...</span>
          </div>
        </Select.Item>
      </Select.Content>
    </Select.Portal>
  </Select.Root>
{/if}

<!-- Auth Modal -->
<AssistantAuthModal
  assistant={authAssistant}
  open={showAuthModal}
  onOpenChange={(open) => {
    showAuthModal = open;
    if (!open) authAssistant = null;
  }}
  onSuccess={handleAuthSuccess}
/>
