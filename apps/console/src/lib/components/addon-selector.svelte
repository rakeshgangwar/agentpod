<script lang="ts">
  /**
   * Container Addon Selector Component
   * 
   * Displays available container addons (optional features),
   * allowing the user to select multiple addons for their project.
   */
  
  import { onMount } from "svelte";
  import { 
    listContainerAddons,
    type ContainerAddon,
    type AddonCategory,
  } from "$lib/api/tauri";
  import { Badge } from "$lib/components/ui/badge";
  
  // Props
  let {
    selectedAddonIds = $bindable<string[]>([]),
    disabled = false,
    hasGpu = false, // Whether the host has GPU support
  }: {
    selectedAddonIds?: string[];
    disabled?: boolean;
    hasGpu?: boolean;
  } = $props();
  
  // State
  let addons = $state<ContainerAddon[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  
  // Category labels and icons (for future grouped display)
  const categoryInfo: Record<AddonCategory, { label: string; icon: string }> = {
    interface: { label: "Interface", icon: "monitor" },
    compute: { label: "Compute", icon: "cpu" },
    storage: { label: "Storage", icon: "database" },
    devops: { label: "DevOps", icon: "cloud" },
  };
  
  // Load addons on mount
  onMount(() => {
    loadAddons();
  });
  
  async function loadAddons() {
    loading = true;
    error = null;
    
    try {
      addons = await listContainerAddons();
      
      // Auto-select code-server by default if not selected
      if (selectedAddonIds.length === 0) {
        const codeServer = addons.find(a => a.id === "code-server");
        if (codeServer) {
          selectedAddonIds = ["code-server"];
        }
      }
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to load container addons";
    } finally {
      loading = false;
    }
  }
  
  function toggleAddon(addonId: string, addon: ContainerAddon) {
    if (disabled) return;
    
    // Check if GPU addon is being selected without GPU support
    if (addon.requiresGpu && !hasGpu && !selectedAddonIds.includes(addonId)) {
      // Could show a warning here, but for now just prevent selection
      return;
    }
    
    if (selectedAddonIds.includes(addonId)) {
      selectedAddonIds = selectedAddonIds.filter(id => id !== addonId);
    } else {
      selectedAddonIds = [...selectedAddonIds, addonId];
    }
  }
  
  function isAddonDisabled(addon: ContainerAddon): boolean {
    if (disabled) return true;
    if (addon.requiresGpu && !hasGpu) return true;
    return false;
  }
</script>

<div class="space-y-3">
  <!-- Header -->
  <div>
    <h3 class="text-xs font-mono uppercase tracking-wider text-[var(--cyber-cyan)]">[add-ons]</h3>
    <p class="text-xs text-muted-foreground font-mono">
      Optional features for your development environment
    </p>
  </div>
  
  {#if loading}
    <!-- Loading skeleton -->
    <div class="space-y-2">
      {#each Array(3) as _}
        <div class="h-12 rounded border border-[var(--cyber-cyan)]/20 bg-[var(--cyber-cyan)]/5 animate-pulse"></div>
      {/each}
    </div>
  {:else if error}
    <!-- Error state -->
    <div class="text-sm font-mono text-[var(--cyber-red)] bg-[var(--cyber-red)]/10 border border-[var(--cyber-red)]/30 p-3 rounded">
      {error}
      <button 
        type="button" 
        class="ml-2 underline hover:no-underline text-[var(--cyber-cyan)]"
        onclick={loadAddons}
      >
        Retry
      </button>
    </div>
  {:else}
    <!-- Addons list -->
    <div class="space-y-2">
      {#each addons as addon (addon.id)}
        {@const isSelected = selectedAddonIds.includes(addon.id)}
        {@const isDisabled = isAddonDisabled(addon)}
        <button
          type="button"
          class="w-full text-left p-3 rounded border transition-all font-mono
            {isSelected 
              ? 'border-[var(--cyber-cyan)] bg-[var(--cyber-cyan)]/10' 
              : 'border-border/30 hover:border-[var(--cyber-cyan)]/50 hover:bg-[var(--cyber-cyan)]/5'}
            {isDisabled ? 'opacity-50 cursor-not-allowed' : ''}"
          onclick={() => toggleAddon(addon.id, addon)}
          disabled={isDisabled}
        >
          <div class="flex items-center gap-3">
            <!-- Checkbox -->
            <div class="flex-shrink-0">
              <div class="w-4 h-4 rounded border-2 flex items-center justify-center transition-all
                {isSelected ? 'border-[var(--cyber-cyan)] bg-[var(--cyber-cyan)] shadow-[0_0_6px_var(--cyber-cyan)]' : 'border-muted-foreground/30'}">
                {#if isSelected}
                  <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="text-black">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                {/if}
              </div>
            </div>
            
            <!-- Addon info -->
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="font-medium text-sm {isSelected ? 'text-[var(--cyber-cyan)]' : ''}">{addon.name}</span>
                <span class="text-[10px] px-1.5 py-0 rounded border border-[var(--cyber-magenta)]/30 bg-[var(--cyber-magenta)]/10 text-[var(--cyber-magenta)]">
                  {categoryInfo[addon.category]?.label || addon.category}
                </span>
                {#if addon.priceMonthly > 0}
                  <span class="text-xs text-muted-foreground">+${addon.priceMonthly}/mo</span>
                {:else}
                  <span class="text-xs text-[var(--cyber-emerald)]">Free</span>
                {/if}
              </div>
              <p class="text-xs text-muted-foreground truncate">
                {addon.description}
              </p>
            </div>
            
            <!-- Port info -->
            {#if addon.port}
              <div class="flex-shrink-0 text-xs text-[var(--cyber-amber)]">
                :{addon.port}
              </div>
            {/if}
          </div>
          
          <!-- GPU warning -->
          {#if addon.requiresGpu && !hasGpu}
            <p class="text-xs text-[var(--cyber-amber)] mt-1 ml-7">
              Requires GPU-enabled host
            </p>
          {/if}
        </button>
      {/each}
    </div>
    
    <!-- Empty state -->
    {#if addons.length === 0}
      <div class="text-sm text-muted-foreground font-mono text-center p-4 border border-dashed border-border/30 rounded">
        No addons available
      </div>
    {/if}
    
    <!-- Summary -->
    {#if selectedAddonIds.length > 0}
      {@const selectedAddons = addons.filter(a => selectedAddonIds.includes(a.id))}
      {@const totalPrice = selectedAddons.reduce((sum, a) => sum + a.priceMonthly, 0)}
      <div class="text-xs text-muted-foreground font-mono pt-2 border-t border-border/30">
        <span class="text-[var(--cyber-cyan)]">{selectedAddonIds.length}</span> addon{selectedAddonIds.length !== 1 ? 's' : ''} selected
        {#if totalPrice > 0}
          · <span class="text-[var(--cyber-amber)]">+${totalPrice}/mo</span>
        {/if}
      </div>
    {/if}
  {/if}
</div>
