<script lang="ts">
  /**
   * Agent Selector Component
   * 
   * A compact dropdown for selecting an OpenCode agent in the chat interface.
   * Fetches available agents from the OpenCode container and filters to primary agents only.
   */
  
  import { onMount } from "svelte";
  import { 
    sandboxOpencodeGetAgents,
    type OpenCodeAgent,
  } from "$lib/api/tauri";
  import * as Select from "$lib/components/ui/select";
  import { Button } from "$lib/components/ui/button";
  
  // Props
  let {
    projectId,
    selectedAgent = $bindable<string | undefined>(undefined),
    disabled = false,
    compact = false,
  }: {
    projectId: string;
    selectedAgent?: string;
    disabled?: boolean;
    compact?: boolean;
  } = $props();
  
  // State
  let agents = $state<OpenCodeAgent[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  
  // Filter to only primary agents
  let primaryAgents = $derived(
    agents.filter(agent => agent.mode === "primary" || agent.mode === "all")
  );
  
  // Load agents on mount
  onMount(() => {
    loadAgents();
  });
  
  async function loadAgents() {
    loading = true;
    error = null;
    
    try {
      // projectId is actually sandboxId in v2 API
      const result = await sandboxOpencodeGetAgents(projectId);
      agents = result;
      
      // Auto-select first primary agent if none selected
      if (!selectedAgent && primaryAgents.length > 0) {
        // Default to "build" agent if available, otherwise first primary agent
        const buildAgent = primaryAgents.find(a => a.name.toLowerCase() === "build");
        selectedAgent = buildAgent?.name ?? primaryAgents[0].name;
      }
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to load agents";
    } finally {
      loading = false;
    }
  }
  
  function handleValueChange(value: string | undefined) {
    selectedAgent = value;
  }
  
  // Get display name for the current selection
  function getDisplayName(): string {
    if (!selectedAgent) return "Select agent...";
    
    const agent = primaryAgents.find(a => a.name === selectedAgent);
    if (!agent) return selectedAgent;
    
    // Capitalize first letter for display
    return agent.name.charAt(0).toUpperCase() + agent.name.slice(1);
  }
  
</script>

{#if loading}
  <div class="text-xs text-muted-foreground animate-pulse px-2 py-1">
    Loading agents...
  </div>
{:else if error}
  <Button
    variant="ghost"
    size="sm"
    class="text-xs text-destructive"
    onclick={loadAgents}
    {disabled}
  >
    Error loading - Retry
  </Button>
{:else if primaryAgents.length === 0}
  <div class="text-xs text-muted-foreground px-2 py-1">
    No agents configured
  </div>
{:else}
  <Select.Root 
    type="single"
    value={selectedAgent ?? ""}
    onValueChange={handleValueChange}
    {disabled}
  >
    <Select.Trigger class={compact ? 'h-7 text-xs min-w-[100px] max-w-[150px]' : 'h-9 text-sm min-w-[120px]'}>
      <span class="truncate">{getDisplayName()}</span>
    </Select.Trigger>
    
    <Select.Portal>
      <Select.Content>
        {#each primaryAgents as agent (agent.name)}
          <Select.Item value={agent.name} class="text-sm">
            <div class="flex items-center gap-2">
              {#if agent.color}
                <span 
                  class="w-2 h-2 rounded-full" 
                  style="background-color: {agent.color}"
                ></span>
              {/if}
              <span>{agent.name.charAt(0).toUpperCase() + agent.name.slice(1)}</span>
              {#if agent.description}
                <span class="text-xs text-muted-foreground ml-1">
                  - {agent.description.length > 30 ? agent.description.slice(0, 30) + '...' : agent.description}
                </span>
              {/if}
            </div>
          </Select.Item>
        {/each}
      </Select.Content>
    </Select.Portal>
  </Select.Root>
{/if}
