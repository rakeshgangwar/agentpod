<script lang="ts">
  /**
   * Agent Selector Component
   * 
   * A compact dropdown for selecting an OpenCode agent in the chat interface.
   * Can fetch agents internally or receive them from parent component.
   * Supports animation trigger for keyboard shortcut feedback.
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
    agents: externalAgents,
    animateTrigger = 0,
    activeSubagent,
  }: {
    projectId: string;
    selectedAgent?: string;
    disabled?: boolean;
    compact?: boolean;
    /** Optional: pass agents from parent to avoid duplicate API calls */
    agents?: OpenCodeAgent[];
    /** Increment to trigger animation (e.g., when agent changed via keyboard shortcut) */
    animateTrigger?: number;
    /** Active subagent name (when a subagent session is active) */
    activeSubagent?: string;
  } = $props();
  
  // Internal state for when agents aren't provided externally
  let internalAgents = $state<OpenCodeAgent[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  
  // Use external agents if provided, otherwise use internal
  let agents = $derived(externalAgents ?? internalAgents);
  
  // Filter to only primary agents, excluding hidden agents
  let primaryAgents = $derived(
    agents.filter(agent => (agent.mode === "primary" || agent.mode === "all") && !agent.hidden)
  );
  
  // Determine if selector should be disabled (either explicitly disabled or subagent is active)
  let isDisabled = $derived(disabled || !!activeSubagent);
  
  // Animation state
  let isAnimating = $state(false);
  
  // Trigger animation when animateTrigger changes
  $effect(() => {
    if (animateTrigger > 0) {
      isAnimating = true;
      const timeout = setTimeout(() => {
        isAnimating = false;
      }, 300); // Animation duration
      return () => clearTimeout(timeout);
    }
  });
  
  // Load agents on mount (only if not provided externally)
  onMount(() => {
    if (!externalAgents) {
      loadAgents();
    } else {
      loading = false;
    }
  });
  
  // Update loading state when external agents are provided
  $effect(() => {
    if (externalAgents) {
      loading = false;
    }
  });
  
  async function loadAgents() {
    loading = true;
    error = null;
    
    try {
      // projectId is actually sandboxId in v2 API
      const result = await sandboxOpencodeGetAgents(projectId);
      internalAgents = result;
      
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
  
  function slugToDisplayName(slug: string): string {
    return slug
      .split("-")
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }
  
  function getDisplayName(): string {
    if (!selectedAgent) return "Select agent...";
    
    const agent = primaryAgents.find(a => a.name === selectedAgent);
    if (!agent) return selectedAgent;
    
    return slugToDisplayName(agent.name);
  }
  
</script>

{#if loading}
  <div class="text-xs text-muted-foreground font-mono animate-pulse px-2 py-1">
    Loading agents...
  </div>
{:else if error}
  <Button
    variant="ghost"
    size="sm"
    class="text-xs font-mono text-[var(--cyber-red)] hover:bg-[var(--cyber-red)]/10"
    onclick={loadAgents}
    {disabled}
  >
    Error loading - Retry
  </Button>
{:else if primaryAgents.length === 0}
  <div class="text-xs text-muted-foreground font-mono px-2 py-1">
    No agents configured
  </div>
{:else}
  <div class="flex flex-col gap-1">
    <Select.Root 
      type="single"
      value={selectedAgent ?? ""}
      onValueChange={handleValueChange}
      disabled={isDisabled}
    >
      <Select.Trigger 
        class="font-mono {compact ? 'h-7 text-xs min-w-[100px] max-w-[150px]' : 'h-9 text-sm min-w-[120px]'} border-border/50 bg-background/50 focus:border-[var(--cyber-cyan)] focus:ring-1 focus:ring-[var(--cyber-cyan)] {isAnimating ? 'animate-agent-switch' : ''} {isDisabled ? 'opacity-60 cursor-not-allowed' : ''}"
      >
        <span class="truncate">{getDisplayName()}</span>
      </Select.Trigger>
      
      <Select.Portal>
        <Select.Content class="font-mono border-border/50 bg-background/95 backdrop-blur-sm">
          {#each primaryAgents as agent (agent.name)}
            <Select.Item value={agent.name} class="text-sm font-mono">
              <div class="flex items-center gap-2">
                {#if agent.color}
                  <span 
                    class="w-2 h-2 rounded-full shadow-[0_0_4px_currentColor]" 
                    style="background-color: {agent.color}; color: {agent.color}"
                  ></span>
                {/if}
                <span>{slugToDisplayName(agent.name)}</span>
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
    
    {#if activeSubagent}
      <div 
        class="flex items-center gap-1 text-xs font-mono text-[var(--cyber-cyan)] px-2 animate-in fade-in slide-in-from-top-1 duration-200"
        title="Subagent is currently handling this task"
      >
        <span class="opacity-60">→</span>
        <span>@{activeSubagent}</span>
      </div>
    {/if}
  </div>
{/if}
