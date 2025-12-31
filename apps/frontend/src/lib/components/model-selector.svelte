<script lang="ts">
  /**
   * Model Selector Component
   * 
   * A compact dropdown for selecting an LLM model in the chat interface.
   * Fetches available providers/models from the OpenCode container.
   * 
   * Can accept external providers list for keyboard shortcut cycling.
   */
  
  import { onMount } from "svelte";
  import { 
    sandboxOpencodeGetProviders,
    type OpenCodeProvider,
    type ModelSelection,
  } from "$lib/api/tauri";
  import * as Select from "$lib/components/ui/select";
  import { Button } from "$lib/components/ui/button";
  
  // Props
  let {
    projectId,
    selectedModel = $bindable<ModelSelection | undefined>(undefined),
    disabled = false,
    compact = false,
    providers: externalProviders,
    animateTrigger = 0,
  }: {
    projectId: string;
    selectedModel?: ModelSelection;
    disabled?: boolean;
    compact?: boolean;
    /** External providers list (if provided, skip internal loading) */
    providers?: OpenCodeProvider[];
    /** Trigger animation when this value changes (for keyboard shortcut cycling) */
    animateTrigger?: number;
  } = $props();
  
  // State
  let internalProviders = $state<OpenCodeProvider[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let isAnimating = $state(false);
  
  // Use external providers if provided, otherwise use internal
  let providers = $derived(externalProviders ?? internalProviders);
  
  // Trigger animation when animateTrigger changes
  $effect(() => {
    if (animateTrigger > 0) {
      isAnimating = true;
      const timer = setTimeout(() => {
        isAnimating = false;
      }, 300);
      return () => clearTimeout(timer);
    }
  });
  
  // Computed value for the select
  let selectValue = $derived(
    selectedModel ? `${selectedModel.providerId}::${selectedModel.modelId}` : ""
  );
  
  // Load providers on mount (only if not externally provided)
  onMount(() => {
    if (!externalProviders) {
      loadProviders();
    } else {
      loading = false;
    }
  });
  
  async function loadProviders() {
    loading = true;
    error = null;
    
    try {
      // projectId is actually sandboxId in v2 API
      const result = await sandboxOpencodeGetProviders(projectId);
      internalProviders = result;
      
      // Auto-select first model if none selected
      if (!selectedModel && internalProviders.length > 0 && internalProviders[0].models.length > 0) {
        selectedModel = {
          providerId: internalProviders[0].id,
          modelId: internalProviders[0].models[0].id,
        };
      }
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to load providers";
    } finally {
      loading = false;
    }
  }
  
  function handleValueChange(value: string | undefined) {
    if (!value) {
      selectedModel = undefined;
      return;
    }
    
    const [providerId, modelId] = value.split("::");
    if (providerId && modelId) {
      selectedModel = { providerId, modelId };
    }
  }
  
  // Get display name for the current selection
  function getDisplayName(): string {
    if (!selectedModel) return "Select model...";
    
    const provider = providers.find(p => p.id === selectedModel?.providerId);
    const model = provider?.models.find(m => m.id === selectedModel?.modelId);
    
    if (compact) {
      // Just show model name for compact view
      return model?.name || selectedModel.modelId;
    }
    
    return model?.name 
      ? `${provider?.name || selectedModel.providerId} / ${model.name}`
      : `${selectedModel.providerId} / ${selectedModel.modelId}`;
  }
</script>

{#if loading && !externalProviders}
  <div class="text-xs text-muted-foreground font-mono animate-pulse px-2 py-1">
    Loading models...
  </div>
{:else if error}
  <Button
    variant="ghost"
    size="sm"
    class="text-xs font-mono text-[var(--cyber-red)] hover:bg-[var(--cyber-red)]/10"
    onclick={loadProviders}
    {disabled}
  >
    Error loading - Retry
  </Button>
{:else if providers.length === 0}
  <div class="text-xs text-muted-foreground font-mono px-2 py-1">
    No providers configured
  </div>
{:else}
  <Select.Root 
    type="single"
    value={selectValue}
    onValueChange={handleValueChange}
    {disabled}
  >
    <Select.Trigger class="font-mono {compact ? 'h-7 text-xs min-w-[120px] max-w-[200px]' : 'h-9 text-sm min-w-[180px]'} border-border/50 bg-background/50 focus:border-[var(--cyber-cyan)] focus:ring-1 focus:ring-[var(--cyber-cyan)] {isAnimating ? 'animate-agent-switch' : ''}">
      <span class="truncate">{getDisplayName()}</span>
    </Select.Trigger>
    
    <Select.Portal>
      <Select.Content class="font-mono border-border/50 bg-background/95 backdrop-blur-sm">
        {#each providers as provider (provider.id)}
          <Select.Group>
            <Select.GroupHeading class="text-xs font-mono uppercase tracking-wider text-[var(--cyber-cyan)] px-2 py-1">
              {provider.name}
            </Select.GroupHeading>
            {#each provider.models as model (model.id)}
              <Select.Item value={`${provider.id}::${model.id}`} class="text-sm font-mono">
                {model.name}
              </Select.Item>
            {/each}
          </Select.Group>
        {/each}
      </Select.Content>
    </Select.Portal>
  </Select.Root>
{/if}
