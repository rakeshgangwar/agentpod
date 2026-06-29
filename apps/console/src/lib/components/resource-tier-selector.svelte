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
    <h3 class="text-xs font-mono uppercase tracking-wider text-[var(--cyber-cyan)]">[resources]</h3>
    <p class="text-xs text-muted-foreground font-mono">
      Select the compute resources for your environment
    </p>
  </div>
  
  {#if loading}
    <!-- Loading skeleton -->
    <div class="grid grid-cols-2 gap-2">
      {#each Array(4) as _}
        <div class="h-20 rounded border border-[var(--cyber-cyan)]/20 bg-[var(--cyber-cyan)]/5 animate-pulse"></div>
      {/each}
    </div>
  {:else if error}
    <!-- Error state -->
    <div class="text-sm font-mono text-[var(--cyber-red)] bg-[var(--cyber-red)]/10 border border-[var(--cyber-red)]/30 p-3 rounded">
      {error}
      <button 
        type="button" 
        class="ml-2 underline hover:no-underline text-[var(--cyber-cyan)]"
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
          class="w-full text-left p-3 rounded border transition-all font-mono
            {isSelected 
              ? 'border-[var(--cyber-cyan)] bg-[var(--cyber-cyan)]/10 shadow-[0_0_12px_var(--cyber-cyan)/15]' 
              : 'border-border/30 hover:border-[var(--cyber-cyan)]/50 hover:bg-[var(--cyber-cyan)]/5'}"
          onclick={() => selectTier(tier.id)}
          {disabled}
        >
          <div class="flex items-start justify-between gap-2">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-1.5 mb-1">
                <span class="font-medium text-sm {isSelected ? 'text-[var(--cyber-cyan)]' : ''}">{tier.name}</span>
                {#if tier.isDefault}
                  <span class="text-[10px] px-1 py-0 rounded bg-[var(--cyber-emerald)]/10 text-[var(--cyber-emerald)] border border-[var(--cyber-emerald)]/30">Default</span>
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
                <div class="text-xs text-[var(--cyber-emerald)] mt-1">
                  Free
                </div>
              {/if}
            </div>
            
            <!-- Selection indicator -->
            <div class="flex-shrink-0">
              <div class="w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all
                {isSelected ? 'border-[var(--cyber-cyan)] bg-[var(--cyber-cyan)] shadow-[0_0_8px_var(--cyber-cyan)]' : 'border-muted-foreground/30'}">
                {#if isSelected}
                  <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="text-black">
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
      <div class="text-sm text-muted-foreground font-mono text-center p-4 border border-dashed border-border/30 rounded">
        No resource tiers available
      </div>
    {/if}
  {/if}
</div>
