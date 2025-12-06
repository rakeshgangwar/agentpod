<script lang="ts">
  /**
   * Model Selector Component
   * 
   * A compact dropdown for selecting an LLM model in the chat interface.
   * Fetches available providers/models from the OpenCode container.
   */
  
  import { onMount } from "svelte";
  import { 
    opencodeGetProviders,
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
  }: {
    projectId: string;
    selectedModel?: ModelSelection;
    disabled?: boolean;
    compact?: boolean;
  } = $props();
  
  // State
  let providers = $state<OpenCodeProvider[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  
  // Computed value for the select
  let selectValue = $derived(
    selectedModel ? `${selectedModel.providerId}::${selectedModel.modelId}` : ""
  );
  
  // Load providers on mount
  onMount(() => {
    loadProviders();
  });
  
  async function loadProviders() {
    loading = true;
    error = null;
    
    try {
      const result = await opencodeGetProviders(projectId);
      providers = result;
      
      // Auto-select first model if none selected
      if (!selectedModel && providers.length > 0 && providers[0].models.length > 0) {
        selectedModel = {
          providerId: providers[0].id,
          modelId: providers[0].models[0].id,
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

{#if loading}
  <div class="text-xs text-muted-foreground animate-pulse px-2 py-1">
    Loading models...
  </div>
{:else if error}
  <Button
    variant="ghost"
    size="sm"
    class="text-xs text-destructive"
    onclick={loadProviders}
    {disabled}
  >
    Error loading - Retry
  </Button>
{:else if providers.length === 0}
  <div class="text-xs text-muted-foreground px-2 py-1">
    No providers configured
  </div>
{:else}
  <Select.Root 
    type="single"
    value={selectValue}
    onValueChange={handleValueChange}
    {disabled}
  >
    <Select.Trigger class={compact ? 'h-7 text-xs min-w-[120px] max-w-[200px]' : 'h-9 text-sm min-w-[180px]'}>
      <span class="truncate">{getDisplayName()}</span>
    </Select.Trigger>
    
    <Select.Portal>
      <Select.Content>
        {#each providers as provider (provider.id)}
          <Select.Group>
            <Select.GroupHeading class="text-xs font-medium text-muted-foreground px-2 py-1">
              {provider.name}
            </Select.GroupHeading>
            {#each provider.models as model (model.id)}
              <Select.Item value={`${provider.id}::${model.id}`} class="text-sm">
                {model.name}
              </Select.Item>
            {/each}
          </Select.Group>
        {/each}
      </Select.Content>
    </Select.Portal>
  </Select.Root>
{/if}
