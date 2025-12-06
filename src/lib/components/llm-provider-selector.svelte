<script lang="ts">
  /**
   * LLM Provider Selector Component
   * 
   * Displays a list of LLM providers with their models, allowing the user
   * to select a model for their project. Configured providers are shown
   * at the top in a separate section, followed by unconfigured providers.
   */
  
  import { onMount } from "svelte";
  import { 
    listProvidersWithModels,
    listConfiguredProviders,
    type ProviderWithModels,
  } from "$lib/api/tauri";
  import { Button } from "$lib/components/ui/button";
  import { Badge } from "$lib/components/ui/badge";
  import * as Card from "$lib/components/ui/card";
  import ProviderConfigModal from "./provider-config-modal.svelte";
  
  // Props
  let {
    selectedModel = $bindable(""),
    showAllProviders = $bindable(false),
    disabled = false,
  }: {
    selectedModel?: string;
    showAllProviders?: boolean;
    disabled?: boolean;
  } = $props();
  
  // State
  let configuredProviders = $state<ProviderWithModels[]>([]);
  let availableProviders = $state<ProviderWithModels[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  
  // Config modal state
  let showConfigModal = $state(false);
  let configProviderId = $state<string | null>(null);
  let configProviderName = $state("");
  let configAuthType = $state<"api_key" | "oauth" | "device_flow">("api_key");
  
  // Expanded providers (to show models)
  let expandedProviders = $state<Set<string>>(new Set());
  
  // Load providers on mount
  onMount(() => {
    loadProviders();
  });
  
  // Reload when showAllProviders changes
  $effect(() => {
    void showAllProviders;
    loadProviders();
  });
  
  async function loadProviders() {
    loading = true;
    error = null;
    
    try {
      // Fetch both configured and available providers in parallel
      const [configured, all] = await Promise.all([
        listConfiguredProviders(),
        listProvidersWithModels(!showAllProviders),
      ]);
      
      configuredProviders = configured;
      
      // Filter out already-configured providers from the available list
      const configuredIds = new Set(configured.map(p => p.id));
      availableProviders = all.filter(p => !configuredIds.has(p.id));
      
      // Auto-expand configured providers
      for (const p of configured) {
        expandedProviders.add(p.id);
      }
      expandedProviders = new Set(expandedProviders);
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to load providers";
    } finally {
      loading = false;
    }
  }
  
  function toggleProvider(providerId: string) {
    if (expandedProviders.has(providerId)) {
      expandedProviders.delete(providerId);
    } else {
      expandedProviders.add(providerId);
    }
    expandedProviders = new Set(expandedProviders);
  }
  
  function handleConfigureClick(provider: ProviderWithModels) {
    configProviderId = provider.id;
    configProviderName = provider.name;
    configAuthType = provider.authType;
    showConfigModal = true;
  }
  
  function handleConfigComplete() {
    showConfigModal = false;
    configProviderId = null;
    // Reload providers to get updated status
    loadProviders();
  }
  
  function selectModel(modelId: string) {
    if (!disabled) {
      selectedModel = modelId;
    }
  }
  
  function formatContext(context: number): string {
    if (context >= 1000000) {
      return `${(context / 1000000).toFixed(1)}M`;
    }
    if (context >= 1000) {
      return `${(context / 1000).toFixed(0)}K`;
    }
    return context.toString();
  }
  
  function formatPrice(price: number): string {
    if (price === 0) return "Free";
    if (price < 0.01) return `$${price.toFixed(4)}`;
    return `$${price.toFixed(2)}`;
  }
</script>

{#snippet providerCard(provider: ProviderWithModels)}
  {@const isExpanded = expandedProviders.has(provider.id)}
  <Card.Root class="overflow-hidden {!provider.isConfigured ? 'opacity-60' : ''}">
    <!-- Provider header -->
    <button
      type="button"
      class="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors text-left"
      onclick={() => provider.isConfigured && toggleProvider(provider.id)}
      {disabled}
    >
      <div class="flex items-center gap-3">
        <img 
          src={provider.logoUrl} 
          alt={provider.name}
          class="w-6 h-6 rounded"
          onerror={(e) => (e.currentTarget as HTMLImageElement).style.display = 'none'}
        />
        <div>
          <div class="font-medium text-sm">{provider.name}</div>
          <div class="text-xs text-muted-foreground">
            {provider.models.length} model{provider.models.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>
      
      <div class="flex items-center gap-2">
        {#if provider.isDefault}
          <Badge variant="secondary">Default</Badge>
        {/if}
        
        {#if provider.isConfigured}
          <Badge variant="outline" class="bg-green-500/10 text-green-600 border-green-500/30">
            Configured
          </Badge>
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            width="16" 
            height="16" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            stroke-width="2" 
            stroke-linecap="round" 
            stroke-linejoin="round"
            class="transition-transform {isExpanded ? 'rotate-180' : ''}"
          >
            <path d="m6 9 6 6 6-6"/>
          </svg>
        {:else}
          <Button
            variant="outline"
            size="sm"
            onclick={(e) => { e.stopPropagation(); handleConfigureClick(provider); }}
            {disabled}
          >
            Configure
          </Button>
        {/if}
      </div>
    </button>
    
    <!-- Models list (expanded) -->
    {#if isExpanded && provider.isConfigured}
      <div class="border-t bg-muted/30">
        {#each provider.models as model (model.id)}
          {@const isSelected = selectedModel === model.id}
          <button
            type="button"
            class="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors text-left border-b last:border-b-0 {isSelected ? 'bg-primary/5 border-l-2 border-l-primary' : ''}"
            onclick={() => selectModel(model.id)}
            {disabled}
          >
            <div class="flex items-center gap-3">
              <input
                type="radio"
                name="llm-model"
                value={model.id}
                checked={isSelected}
                class="h-4 w-4"
                {disabled}
              />
              <div>
                <div class="font-medium text-sm">{model.name}</div>
                <div class="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{formatContext(model.context)} ctx</span>
                  <span>·</span>
                  <span>{formatPrice(model.pricing.input)}/M in</span>
                </div>
              </div>
            </div>
            
            <div class="flex items-center gap-1">
              {#if model.capabilities.tools}
                <Badge variant="secondary" class="text-xs">Tools</Badge>
              {/if}
              {#if model.capabilities.image}
                <Badge variant="secondary" class="text-xs">Vision</Badge>
              {/if}
            </div>
          </button>
        {/each}
      </div>
    {/if}
  </Card.Root>
{/snippet}

<div class="space-y-4">
  <!-- Header with toggle -->
  <div class="flex items-center justify-between">
    <div>
      <h3 class="text-sm font-medium">LLM Provider</h3>
      <p class="text-xs text-muted-foreground">
        Select an AI model for your project
      </p>
    </div>
    <Button
      variant="ghost"
      size="sm"
      onclick={() => showAllProviders = !showAllProviders}
    >
      {showAllProviders ? "Show Popular" : "Show All"}
    </Button>
  </div>
  
  {#if loading}
    <!-- Loading skeleton -->
    <div class="space-y-3">
      {#each Array(3) as _}
        <div class="h-16 bg-muted rounded-lg animate-pulse"></div>
      {/each}
    </div>
  {:else if error}
    <!-- Error state -->
    <div class="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
      {error}
      <Button variant="link" size="sm" onclick={loadProviders}>Retry</Button>
    </div>
  {:else}
    <!-- Configured Providers Section -->
    {#if configuredProviders.length > 0}
      <div class="space-y-2">
        <h4 class="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Your Providers
        </h4>
        {#each configuredProviders as provider (provider.id)}
          {@render providerCard(provider)}
        {/each}
      </div>
    {/if}
    
    <!-- Available Providers Section -->
    {#if availableProviders.length > 0}
      <div class="space-y-2">
        <h4 class="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {configuredProviders.length > 0 ? 'Add More Providers' : 'Available Providers'}
        </h4>
        {#each availableProviders as provider (provider.id)}
          {@render providerCard(provider)}
        {/each}
      </div>
    {/if}
    
    <!-- Empty state -->
    {#if configuredProviders.length === 0 && availableProviders.length === 0}
      <div class="text-sm text-muted-foreground text-center p-4">
        No providers available
      </div>
    {/if}
  {/if}
  
  <!-- Selected model display -->
  {#if selectedModel}
    <div class="text-xs text-muted-foreground bg-muted p-2 rounded-md">
      Selected: <span class="font-mono text-foreground">{selectedModel}</span>
    </div>
  {/if}
</div>

<!-- Configuration Modal -->
{#if showConfigModal && configProviderId}
  <ProviderConfigModal
    providerId={configProviderId}
    providerName={configProviderName}
    authType={configAuthType}
    onClose={() => showConfigModal = false}
    onComplete={handleConfigComplete}
  />
{/if}
