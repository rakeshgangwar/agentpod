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
  
  // Language icons/colors
  const languageColors: Record<string, string> = {
    javascript: "bg-yellow-500",
    typescript: "bg-blue-500",
    python: "bg-green-500",
    go: "bg-cyan-500",
    rust: "bg-orange-500",
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
    <h3 class="text-sm font-medium">Language Environment</h3>
    <p class="text-xs text-muted-foreground">
      Choose the programming languages for your project
    </p>
  </div>
  
  {#if loading}
    <!-- Loading skeleton -->
    <div class="grid grid-cols-2 gap-2">
      {#each Array(4) as _}
        <div class="h-16 bg-muted rounded-lg animate-pulse"></div>
      {/each}
    </div>
  {:else if error}
    <!-- Error state -->
    <div class="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
      {error}
      <button 
        type="button" 
        class="ml-2 underline hover:no-underline"
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
          class="w-full text-left p-3 rounded-lg border-2 transition-all hover:bg-muted/50
            {isSelected 
              ? 'border-primary bg-primary/5' 
              : 'border-border hover:border-muted-foreground/30'}"
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
                      class="w-2.5 h-2.5 rounded-full border border-background {languageColors[lang] || 'bg-gray-400'}"
                      title={lang}
                    ></div>
                  {/each}
                </div>
                <span class="font-medium text-sm">{flavor.name}</span>
                {#if flavor.isDefault}
                  <Badge variant="secondary" class="text-[10px] px-1 py-0">Default</Badge>
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
    {#if flavors.length === 0}
      <div class="text-sm text-muted-foreground text-center p-4 border rounded-lg">
        No container flavors available
      </div>
    {/if}
  {/if}
</div>
