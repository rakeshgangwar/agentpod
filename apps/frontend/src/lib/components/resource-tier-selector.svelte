<script lang="ts">
  /**
   * Resource Tier Selector Component
   * 
   * Displays available resource tiers (CPU, memory, storage),
   * allowing the user to select a tier for their project.
   */
  
  import { onMount } from "svelte";
  import { 
    listResourceTiers,
    type ResourceTier,
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
  let tiers = $state<ResourceTier[]>([]);
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
      tiers = await listResourceTiers();
      
      // Auto-select default tier if none selected
      if (!selectedTierId) {
        const defaultTier = tiers.find(t => t.isDefault);
        if (defaultTier) {
          selectedTierId = defaultTier.id;
        }
      }
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to load resource tiers";
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

<div class="space-y-3">
  <!-- Header -->
  <div>
    <h3 class="text-sm font-medium">Resources</h3>
    <p class="text-xs text-muted-foreground">
      Select the compute resources for your environment
    </p>
  </div>
  
  {#if loading}
    <!-- Loading skeleton -->
    <div class="grid grid-cols-2 gap-2">
      {#each Array(4) as _}
        <div class="h-20 bg-muted rounded-lg animate-pulse"></div>
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
    <div class="grid grid-cols-2 gap-2">
      {#each tiers as tier (tier.id)}
        {@const isSelected = selectedTierId === tier.id}
        <button
          type="button"
          class="w-full text-left p-3 rounded-lg border-2 transition-all hover:bg-muted/50
            {isSelected 
              ? 'border-primary bg-primary/5' 
              : 'border-border hover:border-muted-foreground/30'}"
          onclick={() => selectTier(tier.id)}
          {disabled}
        >
          <div class="flex items-start justify-between gap-2">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-1.5 mb-1">
                <span class="font-medium text-sm">{tier.name}</span>
                {#if tier.isDefault}
                  <Badge variant="secondary" class="text-[10px] px-1 py-0">Default</Badge>
                {/if}
              </div>
              
              <!-- Resources -->
              <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                <span>{tier.resources.cpuCores} CPU</span>
                <span class="text-muted-foreground/40">·</span>
                <span>{tier.resources.memoryGb}GB RAM</span>
                <span class="text-muted-foreground/40">·</span>
                <span>{tier.resources.storageGb}GB</span>
              </div>
              
              <!-- Price -->
              {#if tier.priceMonthly > 0}
                <div class="text-xs text-muted-foreground mt-1">
                  ${tier.priceMonthly}/mo
                </div>
              {:else}
                <div class="text-xs text-green-600 mt-1">
                  Free
                </div>
              {/if}
            </div>
            
            <!-- Selection indicator -->
            <div class="flex-shrink-0">
              <div class="w-4 h-4 rounded-full border-2 flex items-center justify-center
                {isSelected ? 'border-primary bg-primary' : 'border-muted-foreground/30'}">
                {#if isSelected}
                  <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="text-primary-foreground">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                {/if}
              </div>
            </div>
          </div>
        </button>
      {/each}
    </div>
    
    <!-- Empty state -->
    {#if tiers.length === 0}
      <div class="text-sm text-muted-foreground text-center p-4 border rounded-lg">
        No resource tiers available
      </div>
    {/if}
  {/if}
</div>
