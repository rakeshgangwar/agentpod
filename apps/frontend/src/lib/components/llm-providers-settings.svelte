<script lang="ts">
  /**
   * LLM Providers Settings Component
   * 
   * A dedicated, well-organized UI for managing LLM provider configurations.
   * Features:
   * - Summary stats (configured count, default provider)
   * - Search/filter providers
   * - Grid layout for compact view
   * - Expandable provider cards
   * - Tabbed interface (Configured / All Providers)
   */
  
  import { onMount } from "svelte";
  import { 
    listProvidersWithModels,
    listConfiguredProviders,
    removeProviderCredentials,
    setDefaultProvider as setDefaultProviderApi,
    type ProviderWithModels,
  } from "$lib/api/tauri";
  import { toast } from "svelte-sonner";
  import { Button } from "$lib/components/ui/button";
  import { Badge } from "$lib/components/ui/badge";
  import { Input } from "$lib/components/ui/input";
  import * as Card from "$lib/components/ui/card";
  import * as Tabs from "$lib/components/ui/tabs";
  import * as Dialog from "$lib/components/ui/dialog";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import ProviderConfigModal from "./provider-config-modal.svelte";
  
  // State
  let configuredProviders = $state<ProviderWithModels[]>([]);
  let allProviders = $state<ProviderWithModels[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let searchQuery = $state("");
  let activeTab = $state<"configured" | "all">("configured");
  
  // Config modal state
  let showConfigModal = $state(false);
  let configProviderId = $state<string | null>(null);
  let configProviderName = $state("");
  let configAuthType = $state<"api_key" | "oauth" | "device_flow">("api_key");
  
  // Remove confirmation state
  let showRemoveDialog = $state(false);
  let providerToRemove = $state<ProviderWithModels | null>(null);
  let removing = $state(false);
  
  // Expanded provider for model view
  let expandedProviderId = $state<string | null>(null);
  
  // Derived: filtered providers based on search
  const filteredConfigured = $derived(
    configuredProviders.filter(p => 
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.id.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );
  
  const filteredAll = $derived(
    allProviders.filter(p => 
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.id.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );
  
  // Derived: default provider
  const defaultProvider = $derived(
    configuredProviders.find(p => p.isDefault)
  );
  
  // Load providers on mount
  onMount(() => {
    loadProviders();
  });
  
  async function loadProviders() {
    loading = true;
    error = null;
    
    try {
      const [configured, all] = await Promise.all([
        listConfiguredProviders(),
        listProvidersWithModels(false), // Get all providers
      ]);
      
      configuredProviders = configured;
      allProviders = all;
      
      // If no configured providers, switch to "all" tab
      if (configured.length === 0) {
        activeTab = "all";
      }
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to load providers";
    } finally {
      loading = false;
    }
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
    loadProviders();
    toast.success("Provider configured successfully");
  }
  
  function handleRemoveClick(provider: ProviderWithModels) {
    providerToRemove = provider;
    showRemoveDialog = true;
  }
  
  async function handleConfirmRemove() {
    if (!providerToRemove) return;
    
    removing = true;
    try {
      await removeProviderCredentials(providerToRemove.id);
      toast.success(`${providerToRemove.name} credentials removed`);
      showRemoveDialog = false;
      providerToRemove = null;
      loadProviders();
    } catch (err) {
      toast.error("Failed to remove credentials", {
        description: err instanceof Error ? err.message : "Unknown error"
      });
    } finally {
      removing = false;
    }
  }
  
  async function handleSetDefault(provider: ProviderWithModels) {
    try {
      await setDefaultProviderApi(provider.id);
      toast.success(`${provider.name} is now your default provider`);
      loadProviders();
    } catch (err) {
      toast.error("Failed to set default provider", {
        description: err instanceof Error ? err.message : "Unknown error"
      });
    }
  }
  
  function toggleExpanded(providerId: string) {
    expandedProviderId = expandedProviderId === providerId ? null : providerId;
  }
  
  function formatContext(context: number): string {
    if (context >= 1000000) return `${(context / 1000000).toFixed(1)}M`;
    if (context >= 1000) return `${(context / 1000).toFixed(0)}K`;
    return context.toString();
  }
  
  function formatPrice(price: number): string {
    if (price === 0) return "Free";
    if (price < 0.01) return `$${price.toFixed(4)}`;
    return `$${price.toFixed(2)}`;
  }
  
  function getAuthTypeLabel(authType: string): string {
    switch (authType) {
      case "api_key": return "API Key";
      case "oauth": return "OAuth";
      case "device_flow": return "Device Login";
      default: return authType;
    }
  }
</script>

<div class="space-y-6">
  <!-- Header with Stats -->
  <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
    <div>
      <h2 class="text-xl font-semibold">LLM Providers</h2>
      <p class="text-sm text-muted-foreground">
        Configure AI model providers for your sandboxes
      </p>
    </div>
    
    <!-- Stats badges -->
    <div class="flex items-center gap-3">
      <div class="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-full">
        <span class="text-sm font-medium">{configuredProviders.length}</span>
        <span class="text-xs text-muted-foreground">configured</span>
      </div>
      {#if defaultProvider}
        <div class="flex items-center gap-2 px-3 py-1.5 bg-primary/10 rounded-full">
          <img 
            src={defaultProvider.logoUrl} 
            alt={defaultProvider.name}
            class="w-4 h-4 rounded"
            onerror={(e) => (e.currentTarget as HTMLImageElement).style.display = 'none'}
          />
          <span class="text-xs font-medium">{defaultProvider.name}</span>
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
      placeholder="Search providers..."
      class="pl-10"
    />
  </div>

  {#if loading}
    <!-- Loading state -->
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {#each Array(6) as _}
        <div class="h-24 bg-muted rounded-lg animate-pulse"></div>
      {/each}
    </div>
  {:else if error}
    <!-- Error state -->
    <Card.Root class="border-destructive/50 bg-destructive/5">
      <Card.Content class="pt-6">
        <div class="flex items-center gap-3">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <p class="font-medium text-destructive">Failed to load providers</p>
            <p class="text-sm text-muted-foreground">{error}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onclick={loadProviders} class="mt-4">
          Try Again
        </Button>
      </Card.Content>
    </Card.Root>
  {:else}
    <!-- Tabs: Configured / All Providers -->
    <Tabs.Root bind:value={activeTab}>
      <Tabs.List class="grid w-full grid-cols-2 max-w-md">
        <Tabs.Trigger value="configured" class="gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Your Providers
          {#if configuredProviders.length > 0}
            <Badge variant="secondary" class="ml-1">{configuredProviders.length}</Badge>
          {/if}
        </Tabs.Trigger>
        <Tabs.Trigger value="all" class="gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          All Providers
          <Badge variant="outline" class="ml-1">{allProviders.length}</Badge>
        </Tabs.Trigger>
      </Tabs.List>
      
      <!-- Configured Providers Tab -->
      <Tabs.Content value="configured" class="mt-6">
        {#if filteredConfigured.length === 0}
          <Card.Root class="border-dashed">
            <Card.Content class="pt-6 text-center">
              {#if searchQuery}
                <p class="text-muted-foreground">No configured providers match "{searchQuery}"</p>
              {:else}
                <div class="space-y-3">
                  <div class="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                  </div>
                  <div>
                    <p class="font-medium">No providers configured</p>
                    <p class="text-sm text-muted-foreground">Add your first AI provider to get started</p>
                  </div>
                  <Button variant="outline" onclick={() => activeTab = "all"}>
                    Browse Providers
                  </Button>
                </div>
              {/if}
            </Card.Content>
          </Card.Root>
        {:else}
          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {#each filteredConfigured as provider (provider.id)}
              {@const isExpanded = expandedProviderId === provider.id}
              <Card.Root class="overflow-hidden transition-all {isExpanded ? 'sm:col-span-2 lg:col-span-3' : ''}">
                <Card.Content class="p-0">
                  <!-- Provider Header -->
                  <div class="p-4 flex items-start justify-between gap-3">
                    <button 
                      type="button"
                      class="flex items-center gap-3 flex-1 text-left"
                      onclick={() => toggleExpanded(provider.id)}
                    >
                      <img 
                        src={provider.logoUrl} 
                        alt={provider.name}
                        class="w-10 h-10 rounded-lg bg-muted p-1.5"
                        onerror={(e) => {
                          (e.currentTarget as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>';
                        }}
                      />
                      <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-2">
                          <span class="font-medium truncate">{provider.name}</span>
                          {#if provider.isDefault}
                            <Badge variant="default" class="text-[10px] px-1.5 py-0 shrink-0">Default</Badge>
                          {/if}
                        </div>
                        <div class="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{provider.models.length} models</span>
                          <span>·</span>
                          <span class="text-green-600">Configured</span>
                        </div>
                      </div>
                    </button>
                    
                    <!-- Actions dropdown -->
                    <DropdownMenu.Root>
                      <DropdownMenu.Trigger>
                        <Button variant="ghost" size="sm" class="h-8 w-8 p-0">
                          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                          </svg>
                        </Button>
                      </DropdownMenu.Trigger>
                      <DropdownMenu.Content align="end">
                        {#if !provider.isDefault}
                          <DropdownMenu.Item onclick={() => handleSetDefault(provider)}>
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                            </svg>
                            Set as Default
                          </DropdownMenu.Item>
                        {/if}
                        <DropdownMenu.Item onclick={() => handleConfigureClick(provider)}>
                          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          Reconfigure
                        </DropdownMenu.Item>
                        <DropdownMenu.Separator />
                        <DropdownMenu.Item 
                          onclick={() => handleRemoveClick(provider)}
                          class="text-destructive focus:text-destructive"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          Remove
                        </DropdownMenu.Item>
                      </DropdownMenu.Content>
                    </DropdownMenu.Root>
                  </div>
                  
                  <!-- Expanded: Show models -->
                  {#if isExpanded}
                    <div class="border-t bg-muted/30 p-4">
                      <div class="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
                        Available Models ({provider.models.length})
                      </div>
                      <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {#each provider.models.slice(0, 9) as model (model.id)}
                          <div class="p-3 bg-background rounded-lg border text-sm">
                            <div class="font-medium truncate">{model.name}</div>
                            <div class="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                              <span>{formatContext(model.context)} ctx</span>
                              <span>·</span>
                              <span>{formatPrice(model.pricing.input)}/M</span>
                            </div>
                            <div class="flex gap-1 mt-2">
                              {#if model.capabilities.tools}
                                <Badge variant="outline" class="text-[10px] px-1.5 py-0">Tools</Badge>
                              {/if}
                              {#if model.capabilities.image}
                                <Badge variant="outline" class="text-[10px] px-1.5 py-0">Vision</Badge>
                              {/if}
                            </div>
                          </div>
                        {/each}
                      </div>
                      {#if provider.models.length > 9}
                        <p class="text-xs text-muted-foreground mt-3 text-center">
                          +{provider.models.length - 9} more models
                        </p>
                      {/if}
                    </div>
                  {/if}
                </Card.Content>
              </Card.Root>
            {/each}
          </div>
        {/if}
      </Tabs.Content>
      
      <!-- All Providers Tab -->
      <Tabs.Content value="all" class="mt-6">
        {#if filteredAll.length === 0}
          <Card.Root class="border-dashed">
            <Card.Content class="pt-6 text-center">
              <p class="text-muted-foreground">No providers match "{searchQuery}"</p>
            </Card.Content>
          </Card.Root>
        {:else}
          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {#each filteredAll as provider (provider.id)}
              <Card.Root class="overflow-hidden hover:border-primary/50 transition-colors {provider.isConfigured ? 'border-green-500/30 bg-green-500/5' : ''}">
                <Card.Content class="p-4">
                  <div class="flex items-start gap-3">
                    <img 
                      src={provider.logoUrl} 
                      alt={provider.name}
                      class="w-10 h-10 rounded-lg bg-muted p-1.5 shrink-0"
                      onerror={(e) => {
                        (e.currentTarget as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>';
                      }}
                    />
                    <div class="min-w-0 flex-1">
                      <div class="flex items-center gap-2">
                        <span class="font-medium truncate">{provider.name}</span>
                        {#if provider.isDefault}
                          <Badge variant="default" class="text-[10px] px-1.5 py-0 shrink-0">Default</Badge>
                        {/if}
                      </div>
                      <div class="text-xs text-muted-foreground mt-0.5">
                        {provider.models.length} models · {getAuthTypeLabel(provider.authType)}
                      </div>
                    </div>
                  </div>
                  
                  <div class="mt-4">
                    {#if provider.isConfigured}
                      <div class="flex items-center gap-2">
                        <Badge variant="outline" class="bg-green-500/10 text-green-600 border-green-500/30 flex-1 justify-center">
                          <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                          </svg>
                          Configured
                        </Badge>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          class="h-7 px-2"
                          onclick={() => handleConfigureClick(provider)}
                        >
                          Edit
                        </Button>
                      </div>
                    {:else}
                      <Button 
                        variant="outline" 
                        size="sm"
                        class="w-full"
                        onclick={() => handleConfigureClick(provider)}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                        Configure
                      </Button>
                    {/if}
                  </div>
                </Card.Content>
              </Card.Root>
            {/each}
          </div>
        {/if}
      </Tabs.Content>
    </Tabs.Root>
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

<!-- Remove Confirmation Dialog -->
<Dialog.Root bind:open={showRemoveDialog}>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>Remove Provider</Dialog.Title>
      <Dialog.Description>
        Are you sure you want to remove {providerToRemove?.name}? Your API key will be deleted.
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
