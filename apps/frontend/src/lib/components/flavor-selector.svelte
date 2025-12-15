<script lang="ts">
  /**
   * Container Flavor Selector Component
   * 
   * Displays available container flavors (language environments),
   * allowing the user to select a flavor for their project.
   */
  
  import { onMount } from "svelte";
  import { 
    listContainerFlavors,
    type ContainerFlavor,
  } from "$lib/api/tauri";
  import { Badge } from "$lib/components/ui/badge";
  
  // Props
  let {
    selectedFlavorId = $bindable(""),
    disabled = false,
  }: {
    selectedFlavorId?: string;
    disabled?: boolean;
  } = $props();
  
  // State
  let flavors = $state<ContainerFlavor[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  
  // Language icons/colors - updated to cyber theme
  const languageColors: Record<string, string> = {
    javascript: "bg-[var(--cyber-amber)]",
    typescript: "bg-[var(--cyber-cyan)]",
    python: "bg-[var(--cyber-emerald)]",
    go: "bg-[var(--cyber-cyan)]",
    rust: "bg-[var(--cyber-magenta)]",
  };
  
  // Load flavors on mount
  onMount(() => {
    loadFlavors();
  });
  
  async function loadFlavors() {
    loading = true;
    error = null;
    
    try {
      flavors = await listContainerFlavors();
      
      // Auto-select default flavor if none selected
      if (!selectedFlavorId) {
        const defaultFlavor = flavors.find(f => f.isDefault);
        if (defaultFlavor) {
          selectedFlavorId = defaultFlavor.id;
        }
      }
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to load container flavors";
    } finally {
      loading = false;
    }
  }
  
  function selectFlavor(flavorId: string) {
    if (!disabled) {
      selectedFlavorId = flavorId;
    }
  }
  
  function formatLanguages(languages: string[]): string {
    return languages.map(l => l.charAt(0).toUpperCase() + l.slice(1)).join(", ");
  }
</script>

<div class="space-y-3">
  <!-- Header -->
  <div>
    <h3 class="text-xs font-mono uppercase tracking-wider text-[var(--cyber-cyan)]">[language_environment]</h3>
    <p class="text-xs text-muted-foreground font-mono">
      Choose the programming languages for your project
    </p>
  </div>
  
  {#if loading}
    <!-- Loading skeleton -->
    <div class="grid grid-cols-2 gap-2">
      {#each Array(4) as _}
        <div class="h-16 rounded border border-[var(--cyber-cyan)]/20 bg-[var(--cyber-cyan)]/5 animate-pulse"></div>
      {/each}
    </div>
  {:else if error}
    <!-- Error state -->
    <div class="text-sm font-mono text-[var(--cyber-red)] bg-[var(--cyber-red)]/10 border border-[var(--cyber-red)]/30 p-3 rounded">
      {error}
      <button 
        type="button" 
        class="ml-2 underline hover:no-underline text-[var(--cyber-cyan)]"
        onclick={loadFlavors}
      >
        Retry
      </button>
    </div>
  {:else}
    <!-- Flavors grid -->
    <div class="grid grid-cols-2 gap-2">
      {#each flavors as flavor (flavor.id)}
        {@const isSelected = selectedFlavorId === flavor.id}
        <button
          type="button"
          class="w-full text-left p-3 rounded border transition-all font-mono
            {isSelected 
              ? 'border-[var(--cyber-cyan)] bg-[var(--cyber-cyan)]/10 shadow-[0_0_12px_var(--cyber-cyan)/15]' 
              : 'border-border/30 hover:border-[var(--cyber-cyan)]/50 hover:bg-[var(--cyber-cyan)]/5'}"
          onclick={() => selectFlavor(flavor.id)}
          {disabled}
        >
          <div class="flex items-start justify-between gap-2">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-1.5 mb-1">
                <!-- Language color dots -->
                <div class="flex -space-x-1">
                  {#each flavor.languages.slice(0, 3) as lang}
                    <div 
                      class="w-2.5 h-2.5 rounded-full border border-background shadow-sm {languageColors[lang] || 'bg-gray-400'}"
                      title={lang}
                    ></div>
                  {/each}
                </div>
                <span class="font-medium text-sm {isSelected ? 'text-[var(--cyber-cyan)]' : ''}">{flavor.name}</span>
                {#if flavor.isDefault}
                  <span class="text-[10px] px-1 py-0 rounded bg-[var(--cyber-emerald)]/10 text-[var(--cyber-emerald)] border border-[var(--cyber-emerald)]/30">Default</span>
                {/if}
              </div>
              
              <!-- Languages list -->
              <p class="text-xs text-muted-foreground truncate">
                {formatLanguages(flavor.languages)}
              </p>
              
              <!-- Image size -->
              {#if flavor.imageSizeMb}
                <p class="text-[10px] text-muted-foreground/70 mt-0.5">
                  ~{(flavor.imageSizeMb / 1000).toFixed(1)}GB image
                </p>
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
    {#if flavors.length === 0}
      <div class="text-sm text-muted-foreground font-mono text-center p-4 border border-dashed border-border/30 rounded">
        No container flavors available
      </div>
    {/if}
  {/if}
</div>
