<script lang="ts">
  /**
   * Agent Mode Picker Component
   * 
   * A compact dropdown for selecting an Agent Mode (persona/behavior) 
   * within an AI Assistant.
   * 
   * Features:
   * - Shows available modes for the selected assistant
   * - For OpenCode assistant: fetches agents directly from OpenCode SDK
   * - For other assistants: falls back to the assistants store
   * - Supports default mode selection with color customization
   */
  
  import type { OpenCodeAgent } from "$lib/api/tauri";
  import { sandboxOpencodeGetAgents } from "$lib/api/tauri";
  import * as Select from "$lib/components/ui/select";
  
  // Icons
  import SparklesIcon from "@lucide/svelte/icons/sparkles";
  import UserIcon from "@lucide/svelte/icons/user";
  import CodeIcon from "@lucide/svelte/icons/code";
  import FileSearchIcon from "@lucide/svelte/icons/file-search";
  import BotIcon from "@lucide/svelte/icons/bot";
  
  // Props
  interface Props {
    /** The assistant ID (e.g., "opencode") */
    assistantId: string;
    /** The sandbox ID - required for fetching OpenCode agents */
    sandboxId: string;
    /** Currently selected mode/agent name */
    value?: string;
    /** Callback when mode selection changes */
    onValueChange?: (agentName: string) => void;
    /** Whether the picker is disabled */
    disabled?: boolean;
    /** Use compact styling */
    compact?: boolean;
  }
  
  let { 
    assistantId,
    sandboxId,
    value = $bindable("default"),
    onValueChange,
    disabled = false,
    compact = false,
  }: Props = $props();
  
  // State - using OpenCodeAgent from SDK directly
  let agents = $state<OpenCodeAgent[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  
  // Load agents when sandbox changes
  $effect(() => {
    if (sandboxId && assistantId === "opencode") {
      loadAgents();
    }
  });
  
  async function loadAgents() {
    loading = true;
    error = null;
    
    try {
      // Fetch agents directly from OpenCode SDK via Tauri
      const result = await sandboxOpencodeGetAgents(sandboxId);
      
      // Filter to only show "primary" and "all" modes (not subagents)
      // Primary agents are the main chat agents users can select
      agents = result.filter(a => a.mode === "primary" || a.mode === "all");
      
      // Auto-select default agent if current value is not in the list
      if (agents.length > 0 && !agents.find(a => a.name === value)) {
        // Try to find a "default" agent, otherwise use first one
        const defaultAgent = agents.find(a => a.name.toLowerCase() === "default") || agents[0];
        value = defaultAgent.name;
        onValueChange?.(defaultAgent.name);
      }
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to load agents";
      console.error("Failed to load OpenCode agents:", err);
    } finally {
      loading = false;
    }
  }
  
  function handleValueChange(newValue: string | undefined) {
    if (!newValue) return;
    value = newValue;
    onValueChange?.(newValue);
  }
  
  // Get the currently selected agent
  const selectedAgent = $derived(
    agents.find(a => a.name === value) || agents[0]
  );
  
  // Get display name for current selection
  function getDisplayName(): string {
    if (!selectedAgent) return "Default";
    return selectedAgent.name;
  }
  
  // Get icon for an agent based on its name/type
  function getAgentIcon(agent: OpenCodeAgent): typeof SparklesIcon {
    const name = agent.name.toLowerCase();
    if (name.includes("code") || name.includes("coder")) return CodeIcon;
    if (name.includes("review")) return FileSearchIcon;
    if (name.includes("custom") || name.includes("persona")) return UserIcon;
    if (agent.builtIn) return BotIcon;
    return SparklesIcon;
  }
  
  // Get color style for an agent (from OpenCode SDK color field)
  function getAgentColorStyle(agent: OpenCodeAgent): string | undefined {
    if (!agent.color) return undefined;
    return `color: ${agent.color}`;
  }
</script>

{#if assistantId !== "opencode"}
  <!-- Non-OpenCode assistants: show simple default mode -->
  <div class={`flex items-center gap-1.5 px-2 py-1 ${compact ? 'text-xs' : 'text-sm'} text-muted-foreground`}>
    <SparklesIcon class={compact ? 'h-3 w-3' : 'h-4 w-4'} />
    <span>Default Mode</span>
  </div>
{:else if loading && agents.length === 0}
  <div class="text-xs text-muted-foreground animate-pulse px-2 py-1 flex items-center gap-1">
    <SparklesIcon class="h-3 w-3" />
    Loading...
  </div>
{:else if error && agents.length === 0}
  <button
    type="button"
    class="text-xs text-destructive hover:underline px-2 py-1"
    onclick={loadAgents}
    {disabled}
  >
    Error - Retry
  </button>
{:else if agents.length === 0}
  <!-- No agents available, just show default -->
  <div class="text-xs text-muted-foreground px-2 py-1 flex items-center gap-1">
    <SparklesIcon class="h-3 w-3" />
    Default Mode
  </div>
{:else if agents.length === 1}
  <!-- Only one agent, no need for dropdown -->
  <div 
    class={`flex items-center gap-1.5 px-2 py-1 ${compact ? 'text-xs' : 'text-sm'} text-muted-foreground`}
    style={getAgentColorStyle(agents[0])}
  >
    <SparklesIcon class={compact ? 'h-3 w-3' : 'h-4 w-4'} />
    <span>{agents[0].name}</span>
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
        ? 'h-7 text-xs min-w-[100px] max-w-[150px] gap-1' 
        : 'h-9 text-sm min-w-[140px] gap-2'}
    >
      <span 
        class="flex items-center gap-1.5 truncate"
        style={selectedAgent ? getAgentColorStyle(selectedAgent) : undefined}
      >
        <SparklesIcon class={compact ? 'h-3 w-3' : 'h-4 w-4'} />
        <span class="truncate">{getDisplayName()}</span>
      </span>
    </Select.Trigger>
    
    <Select.Portal>
      <Select.Content class="min-w-[180px]">
        {#each agents as agent (agent.name)}
          {@const AgentIcon = getAgentIcon(agent)}
          <Select.Item value={agent.name} class="text-sm py-2">
            <div class="flex items-start gap-2">
              <AgentIcon 
                class="h-4 w-4 shrink-0 mt-0.5" 
                style={getAgentColorStyle(agent) || 'color: var(--muted-foreground)'}
              />
              <div class="min-w-0">
                <div class="font-medium truncate" style={getAgentColorStyle(agent)}>
                  {agent.name}
                </div>
                {#if agent.description}
                  <div class="text-xs text-muted-foreground truncate">
                    {agent.description}
                  </div>
                {/if}
                {#if !agent.builtIn}
                  <div class="text-xs text-blue-500 dark:text-blue-400">
                    Custom
                  </div>
                {/if}
              </div>
            </div>
          </Select.Item>
        {/each}
      </Select.Content>
    </Select.Portal>
  </Select.Root>
{/if}
