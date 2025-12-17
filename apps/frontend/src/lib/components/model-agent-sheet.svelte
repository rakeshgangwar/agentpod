<script lang="ts">
  /**
   * Model & Agent Selection Sheet
   * 
   * A mobile-friendly bottom sheet for selecting AI model and agent.
   * Shows a compact chip/button that opens a bottom sheet with full selection UI.
   */
  
  import * as Sheet from "$lib/components/ui/sheet";
  import { Button } from "$lib/components/ui/button";
  import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
  import SparklesIcon from "@lucide/svelte/icons/sparkles";
  import BotIcon from "@lucide/svelte/icons/bot";
  import CheckIcon from "@lucide/svelte/icons/check";
  import type { ModelSelection, OpenCodeProvider, OpenCodeAgent } from "$lib/api/tauri";

  // Props
  let {
    selectedModel = $bindable<ModelSelection | undefined>(undefined),
    selectedAgent = $bindable<string | undefined>(undefined),
    providers = [],
    agents = [],
    disabled = false,
    isChildSession = false,
  }: {
    selectedModel?: ModelSelection;
    selectedAgent?: string;
    providers?: OpenCodeProvider[];
    agents?: OpenCodeAgent[];
    disabled?: boolean;
    isChildSession?: boolean;
  } = $props();

  // Sheet state
  let isOpen = $state(false);
  let activeTab = $state<"model" | "agent">("model");

  // Get display names
  function getModelDisplayName(): string {
    if (!selectedModel) return "Select model";
    
    // Find the model in providers
    for (const provider of providers) {
      const model = provider.models.find(m => m.id === selectedModel!.modelId);
      if (model) {
        // Return short name (e.g., "Claude 3.5" instead of full name)
        const shortName = model.name.split(" ").slice(0, 2).join(" ");
        return shortName.length > 15 ? shortName.slice(0, 15) + "…" : shortName;
      }
    }
    
    return selectedModel.modelId.split("/").pop() || "Unknown";
  }

  function getAgentDisplayName(): string {
    if (!selectedAgent) return "Select agent";
    
    const agent = agents.find(a => a.name === selectedAgent);
    if (agent) {
      return agent.name.charAt(0).toUpperCase() + agent.name.slice(1);
    }
    
    return selectedAgent;
  }

  function getChipLabel(): string {
    const model = getModelDisplayName();
    const agent = getAgentDisplayName();
    return `${model} · ${agent}`;
  }

  // Handle model selection
  function selectModel(providerId: string, modelId: string) {
    selectedModel = { providerId, modelId };
  }

  // Handle agent selection
  function selectAgent(agentName: string) {
    if (!isChildSession) {
      selectedAgent = agentName;
    }
  }

  // Filter to primary agents only
  let primaryAgents = $derived(
    agents.filter(agent => (agent.mode === "primary" || agent.mode === "all") && !agent.hidden)
  );
</script>

<!-- Compact Chip Button -->
<button
  type="button"
  onclick={() => isOpen = true}
  {disabled}
  class="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono
         bg-background/80 border border-border/50 
         hover:border-primary/50 hover:bg-primary/5
         active:scale-[0.98] transition-all
         disabled:opacity-50 disabled:cursor-not-allowed"
>
  <SparklesIcon class="h-3 w-3 text-primary/70" />
  <span class="truncate max-w-[160px] text-muted-foreground">{getChipLabel()}</span>
  <ChevronDownIcon class="h-3 w-3 text-muted-foreground/50" />
</button>

<!-- Bottom Sheet -->
<Sheet.Root bind:open={isOpen}>
  <Sheet.Content side="bottom" class="h-[70vh] max-h-[500px] rounded-t-xl">
    <Sheet.Header class="pb-2">
      <Sheet.Title class="text-lg font-bold">Configure Chat</Sheet.Title>
      <Sheet.Description class="text-sm text-muted-foreground">
        Select the AI model and agent for this conversation
      </Sheet.Description>
    </Sheet.Header>

    <!-- Tab Buttons -->
    <div class="flex gap-2 mb-4">
      <button
        type="button"
        onclick={() => activeTab = "model"}
        class="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-mono text-xs uppercase tracking-wider transition-all
               {activeTab === 'model' 
                 ? 'bg-primary text-primary-foreground' 
                 : 'bg-muted/50 text-muted-foreground hover:bg-muted'}"
      >
        <SparklesIcon class="h-4 w-4" />
        Model
      </button>
      <button
        type="button"
        onclick={() => activeTab = "agent"}
        disabled={isChildSession}
        class="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-mono text-xs uppercase tracking-wider transition-all
               {activeTab === 'agent' 
                 ? 'bg-primary text-primary-foreground' 
                 : 'bg-muted/50 text-muted-foreground hover:bg-muted'}
               disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <BotIcon class="h-4 w-4" />
        Agent
        {#if isChildSession}
          <span class="text-[10px] normal-case">(locked)</span>
        {/if}
      </button>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto -mx-6 px-6">
      {#if activeTab === "model"}
        <!-- Model Selection -->
        <div class="space-y-4">
          {#each providers as provider (provider.id)}
            <div>
              <h4 class="text-xs font-mono uppercase tracking-wider text-primary mb-2 px-1">
                {provider.name}
              </h4>
              <div class="space-y-1">
                {#each provider.models as model (model.id)}
                  {@const isSelected = selectedModel?.providerId === provider.id && selectedModel?.modelId === model.id}
                  <button
                    type="button"
                    onclick={() => selectModel(provider.id, model.id)}
                    class="w-full flex items-center justify-between p-3 rounded-lg text-left transition-all
                           {isSelected 
                             ? 'bg-primary/10 border border-primary/30' 
                             : 'bg-muted/30 border border-transparent hover:bg-muted/50 hover:border-border/50'}"
                  >
                    <div class="min-w-0 flex-1">
                      <div class="font-medium text-sm {isSelected ? 'text-primary' : ''}">
                        {model.name}
                      </div>
                    </div>
                    {#if isSelected}
                      <CheckIcon class="h-4 w-4 text-primary shrink-0 ml-2" />
                    {/if}
                  </button>
                {/each}
              </div>
            </div>
          {/each}
          
          {#if providers.length === 0}
            <div class="text-center py-8 text-muted-foreground">
              <SparklesIcon class="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p class="text-sm">No models available</p>
            </div>
          {/if}
        </div>
      {:else}
        <!-- Agent Selection -->
        <div class="space-y-1">
          {#each primaryAgents as agent (agent.name)}
            {@const isSelected = selectedAgent === agent.name}
            <button
              type="button"
              onclick={() => selectAgent(agent.name)}
              disabled={isChildSession}
              class="w-full flex items-center justify-between p-3 rounded-lg text-left transition-all
                     {isSelected 
                       ? 'bg-primary/10 border border-primary/30' 
                       : 'bg-muted/30 border border-transparent hover:bg-muted/50 hover:border-border/50'}
                     disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div class="flex items-center gap-3 min-w-0 flex-1">
                {#if agent.color}
                  <span 
                    class="w-3 h-3 rounded-full shrink-0 shadow-[0_0_6px_currentColor]" 
                    style="background-color: {agent.color}; color: {agent.color}"
                  ></span>
                {:else}
                  <BotIcon class="h-4 w-4 text-muted-foreground shrink-0" />
                {/if}
                <div class="min-w-0 flex-1">
                  <div class="font-medium text-sm {isSelected ? 'text-primary' : ''}">
                    {agent.name.charAt(0).toUpperCase() + agent.name.slice(1)}
                  </div>
                  {#if agent.description}
                    <div class="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                      {agent.description}
                    </div>
                  {/if}
                </div>
              </div>
              {#if isSelected}
                <CheckIcon class="h-4 w-4 text-primary shrink-0 ml-2" />
              {/if}
            </button>
          {/each}
          
          {#if primaryAgents.length === 0}
            <div class="text-center py-8 text-muted-foreground">
              <BotIcon class="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p class="text-sm">No agents configured</p>
            </div>
          {/if}
        </div>
      {/if}
    </div>

    <!-- Footer with current selection -->
    <Sheet.Footer class="mt-4 pt-4 border-t border-border/30">
      <div class="flex items-center justify-between w-full">
        <div class="text-xs font-mono text-muted-foreground">
          <span class="text-primary">{getModelDisplayName()}</span>
          <span class="mx-1.5">·</span>
          <span class="text-primary">{getAgentDisplayName()}</span>
        </div>
        <Button 
          size="sm" 
          onclick={() => isOpen = false}
          class="font-mono text-xs uppercase tracking-wider"
        >
          Done
        </Button>
      </div>
    </Sheet.Footer>
  </Sheet.Content>
</Sheet.Root>
