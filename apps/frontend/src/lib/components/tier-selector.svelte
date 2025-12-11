<script lang="ts">
  /**
   * Container Tier Selector Component
   * 
   * Displays available container tiers with their resources and features,
   * allowing the user to select a tier for their project.
   */
  
  import { onMount } from "svelte";
  import { 
    listContainerTiers,
    type ContainerTier,
  } from "$lib/api/tauri";
  import { Badge } from "$lib/components/ui/badge";
  
  // Props
  let {
    selectedTierId = $bindable(""),
    disabled = false,
  }: {
    selectedTierId?: string;
    disabled?: boolean;
  } = $props();
  
  // State
  let tiers = $state<ContainerTier[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  
  // Load tiers on mount
  onMount(() => {
    loadTiers();
  });
  
  async function loadTiers() {
    loading = true;
    error = null;
    
    try {
      tiers = await listContainerTiers();
      
      // Auto-select default tier if none selected
      if (!selectedTierId) {
        const defaultTier = tiers.find(t => t.isDefault);
        if (defaultTier) {
          selectedTierId = defaultTier.id;
        }
      }
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to load container tiers";
    } finally {
      loading = false;
    }
  }
  
  function selectTier(tierId: string) {
    if (!disabled) {
      selectedTierId = tierId;
    }
  }
</script>

<div class="space-y-4">
  <!-- Header -->
  <div>
    <h3 class="text-sm font-medium">Container Tier</h3>
    <p class="text-xs text-muted-foreground">
      Select the resources for your development environment
    </p>
  </div>
  
  {#if loading}
    <!-- Loading skeleton -->
    <div class="grid grid-cols-1 gap-3">
      {#each Array(2) as _}
        <div class="h-24 bg-muted rounded-lg animate-pulse"></div>
      {/each}
    </div>
  {:else if error}
    <!-- Error state -->
    <div class="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
      {error}
      <button 
        type="button" 
        class="ml-2 underline hover:no-underline"
        onclick={loadTiers}
      >
        Retry
      </button>
    </div>
  {:else}
    <!-- Tiers grid -->
    <div class="grid grid-cols-1 gap-3">
      {#each tiers as tier (tier.id)}
        {@const isSelected = selectedTierId === tier.id}
        <button
          type="button"
          class="w-full text-left p-4 rounded-lg border-2 transition-all hover:bg-muted/50
            {isSelected 
              ? 'border-primary bg-primary/5' 
              : 'border-border hover:border-muted-foreground/30'}"
          onclick={() => selectTier(tier.id)}
          {disabled}
        >
          <div class="flex items-start justify-between gap-4">
            <!-- Tier info -->
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <!-- Icon based on image type -->
                {#if tier.imageType === "cli"}
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground">
                    <polyline points="4 17 10 11 4 5"></polyline>
                    <line x1="12" x2="20" y1="19" y2="19"></line>
                  </svg>
                {:else}
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground">
                    <rect width="20" height="14" x="2" y="3" rx="2"></rect>
                    <line x1="8" x2="16" y1="21" y2="21"></line>
                    <line x1="12" x2="12" y1="17" y2="21"></line>
                  </svg>
                {/if}
                <span class="font-medium">{tier.name}</span>
                {#if tier.isDefault}
                  <Badge variant="secondary" class="text-xs">Default</Badge>
                {/if}
              </div>
              <p class="text-sm text-muted-foreground mb-2">{tier.description}</p>
              
              <!-- Resources -->
              <div class="flex flex-wrap items-center gap-2 text-xs">
                <span class="inline-flex items-center gap-1 text-muted-foreground">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect width="16" height="16" x="4" y="4" rx="2"></rect>
                    <rect width="6" height="6" x="9" y="9" rx="1"></rect>
                    <path d="M15 2v2"></path>
                    <path d="M15 20v2"></path>
                    <path d="M2 15h2"></path>
                    <path d="M2 9h2"></path>
                    <path d="M20 15h2"></path>
                    <path d="M20 9h2"></path>
                    <path d="M9 2v2"></path>
                    <path d="M9 20v2"></path>
                  </svg>
                  {tier.resources.cpu}
                </span>
                <span class="text-muted-foreground/50">|</span>
                <span class="inline-flex items-center gap-1 text-muted-foreground">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M6 19v-3"></path>
                    <path d="M10 19v-3"></path>
                    <path d="M14 19v-3"></path>
                    <path d="M18 19v-3"></path>
                    <path d="M8 11V9"></path>
                    <path d="M16 11V9"></path>
                    <path d="M12 11V9"></path>
                    <path d="M2 15h20"></path>
                    <path d="M2 7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v1.1a2 2 0 0 0 0 3.8V17a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-5.1a2 2 0 0 0 0-3.8Z"></path>
                  </svg>
                  {tier.resources.memory}
                </span>
                <span class="text-muted-foreground/50">|</span>
                <span class="inline-flex items-center gap-1 text-muted-foreground">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
                    <path d="M3 5V19A9 3 0 0 0 21 19V5"></path>
                    <path d="M3 12A9 3 0 0 0 21 12"></path>
                  </svg>
                  {tier.resources.storage}
                </span>
              </div>
            </div>
            
            <!-- Selection indicator -->
            <div class="flex-shrink-0">
              <div class="w-5 h-5 rounded-full border-2 flex items-center justify-center
                {isSelected ? 'border-primary bg-primary' : 'border-muted-foreground/30'}">
                {#if isSelected}
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="text-primary-foreground">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                {/if}
              </div>
            </div>
          </div>
          
          <!-- Features badges -->
          {#if tier.features.hasDesktopAccess || tier.features.exposedPorts.length > 0}
            <div class="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-border/50">
              {#if tier.features.hasDesktopAccess}
                <Badge variant="outline" class="text-xs">
                  Desktop Access (VNC)
                </Badge>
              {/if}
              {#if tier.features.exposedPorts.length > 0}
                <Badge variant="outline" class="text-xs">
                  {tier.features.exposedPorts.length} port{tier.features.exposedPorts.length !== 1 ? 's' : ''} exposed
                </Badge>
              {/if}
            </div>
          {/if}
        </button>
      {/each}
    </div>
    
    <!-- Empty state -->
    {#if tiers.length === 0}
      <div class="text-sm text-muted-foreground text-center p-4 border rounded-lg">
        No container tiers available
      </div>
    {/if}
  {/if}
</div>
