<script lang="ts">
  /**
   * Container Flavor Selector Component
   * 
   * Displays available container flavors (language environments),
   * showing which ones have Docker images available locally.
   * Unavailable flavors can be pulled on demand.
   */
  
  import { onMount } from "svelte";
  import { 
    listContainerFlavors,
    getFlavorImages,
    pullImageSync,
    type ContainerFlavor,
    type FlavorImageStatus,
  } from "$lib/api/tauri";
  import { Download, Check, Loader2, AlertCircle, ChevronDown } from "@lucide/svelte";
  
  // Props
  let {
    selectedFlavorId = $bindable(""),
    disabled = false,
    initialVisibleCount = 4, // How many flavors to show initially
  }: {
    selectedFlavorId?: string;
    disabled?: boolean;
    initialVisibleCount?: number;
  } = $props();
  
  // State
  let flavors = $state<ContainerFlavor[]>([]);
  let imageStatus = $state<Record<string, FlavorImageStatus>>({});
  let loading = $state(true);
  let loadingImages = $state(false);
  let error = $state<string | null>(null);
  let pullingFlavor = $state<string | null>(null);
  let pullError = $state<string | null>(null);
  let showAllFlavors = $state(false);
  
  // Derived state for sorted flavors
  // Stable ordering: 1) Downloaded images first, 2) Sorted by image size (smaller first), 3) Original sortOrder as tiebreaker
  // Selection does NOT affect position - UI stays stable
  const sortedFlavors = $derived(() => {
    return [...flavors].sort((a, b) => {
      const aAvailable = imageStatus[a.id]?.available ?? false;
      const bAvailable = imageStatus[b.id]?.available ?? false;
      
      // Downloaded images come first
      if (aAvailable && !bAvailable) return -1;
      if (!aAvailable && bAvailable) return 1;
      
      // Within same availability group, sort by image size (smaller first)
      if (aAvailable && bAvailable) {
        const aSize = imageStatus[a.id]?.size ?? 0;
        const bSize = imageStatus[b.id]?.size ?? 0;
        if (aSize !== bSize) return aSize - bSize;
      }
      
      // For non-downloaded, sort by expected size (imageSizeMb from flavor config)
      if (!aAvailable && !bAvailable) {
        const aSize = a.imageSizeMb ?? 0;
        const bSize = b.imageSizeMb ?? 0;
        if (aSize !== bSize) return aSize - bSize;
      }
      
      // Final tiebreaker: original sortOrder from database
      return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    });
  });
  
  // Visible flavors based on showAllFlavors state
  const visibleFlavors = $derived(() => {
    const sorted = sortedFlavors();
    if (showAllFlavors || sorted.length <= initialVisibleCount) {
      return sorted;
    }
    return sorted.slice(0, initialVisibleCount);
  });
  
  const hiddenCount = $derived(() => {
    return Math.max(0, flavors.length - initialVisibleCount);
  });
  
  // Language icons/colors - updated to cyber theme
  const languageColors: Record<string, string> = {
    javascript: "bg-[var(--cyber-amber)]",
    typescript: "bg-[var(--cyber-cyan)]",
    python: "bg-[var(--cyber-emerald)]",
    go: "bg-[var(--cyber-cyan)]",
    rust: "bg-[var(--cyber-magenta)]",
  };
  
  // Load flavors and image status on mount
  onMount(() => {
    loadData();
  });
  
  async function loadData() {
    loading = true;
    error = null;
    
    try {
      // Load flavors first
      flavors = await listContainerFlavors();
      
      // Load image availability BEFORE selecting default
      await loadImageStatus();
      
      // Auto-select best available flavor if none selected
      if (!selectedFlavorId) {
        selectBestAvailableFlavor();
      }
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to load container flavors";
    } finally {
      loading = false;
    }
  }
  
  /**
   * Select the best available flavor based on:
   * 1. If default flavor is downloaded, use it
   * 2. Otherwise, use the smallest downloaded image
   * 3. If nothing is downloaded, don't auto-select (user must pull first)
   */
  function selectBestAvailableFlavor() {
    // First, try the default flavor
    const defaultFlavor = flavors.find(f => f.isDefault);
    if (defaultFlavor && isImageAvailable(defaultFlavor.id)) {
      selectedFlavorId = defaultFlavor.id;
      return;
    }
    
    // Find all available (downloaded) flavors
    const availableFlavors = flavors.filter(f => isImageAvailable(f.id));
    
    if (availableFlavors.length > 0) {
      // Sort by size (smallest first) and pick the first one
      const smallestAvailable = availableFlavors.sort((a, b) => {
        const aSize = imageStatus[a.id]?.size ?? Infinity;
        const bSize = imageStatus[b.id]?.size ?? Infinity;
        return aSize - bSize;
      })[0];
      
      selectedFlavorId = smallestAvailable.id;
      return;
    }
    
    // No available images - don't auto-select
    // User will see all flavors as "Not downloaded" and can pull one
  }
  
  async function loadImageStatus() {
    loadingImages = true;
    try {
      const response = await getFlavorImages();
      if (response.success) {
        imageStatus = response.images;
      }
    } catch (err) {
      // Don't fail the whole component if image status fails
      console.warn("Failed to load image availability:", err);
    } finally {
      loadingImages = false;
    }
  }
  
  function selectFlavor(flavorId: string) {
    if (!disabled && !pullingFlavor && isImageAvailable(flavorId)) {
      // Only allow selecting available images
      selectedFlavorId = flavorId;
    }
  }
  
  async function pullImage(flavorId: string, event: MouseEvent) {
    event.stopPropagation();
    
    if (pullingFlavor) return;
    
    pullingFlavor = flavorId;
    pullError = null;
    
    try {
      const response = await pullImageSync(undefined, flavorId);
      if (response.success) {
        // Update the image status for this flavor
        imageStatus = {
          ...imageStatus,
          [flavorId]: {
            available: true,
            imageName: response.imageName,
            size: response.image?.size,
          }
        };
        // Auto-select the flavor after successful pull
        selectedFlavorId = flavorId;
      } else {
        pullError = response.error || "Failed to pull image";
      }
    } catch (err) {
      pullError = err instanceof Error ? err.message : "Failed to pull image";
    } finally {
      pullingFlavor = null;
    }
  }
  
  function formatLanguages(languages: string[]): string {
    return languages.map(l => l.charAt(0).toUpperCase() + l.slice(1)).join(", ");
  }
  
  function isImageAvailable(flavorId: string): boolean {
    return imageStatus[flavorId]?.available ?? false;
  }
  
  function formatSize(bytes?: number): string {
    if (!bytes) return "";
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1) {
      return `${gb.toFixed(1)}GB`;
    }
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(0)}MB`;
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
        onclick={loadData}
      >
        Retry
      </button>
    </div>
  {:else}
    <!-- Pull error banner -->
    {#if pullError}
      <div class="text-sm font-mono text-[var(--cyber-red)] bg-[var(--cyber-red)]/10 border border-[var(--cyber-red)]/30 p-2 rounded flex items-center gap-2">
        <AlertCircle class="w-4 h-4 flex-shrink-0" />
        <span class="flex-1">{pullError}</span>
        <button 
          type="button" 
          class="text-xs underline hover:no-underline"
          onclick={() => pullError = null}
        >
          Dismiss
        </button>
      </div>
    {/if}
    
    <!-- Flavors grid -->
    <div class="grid grid-cols-2 gap-2">
      {#each visibleFlavors() as flavor (flavor.id)}
        {@const isSelected = selectedFlavorId === flavor.id}
        {@const available = isImageAvailable(flavor.id)}
        {@const isPulling = pullingFlavor === flavor.id}
        {@const status = imageStatus[flavor.id]}
        
        <!-- Flavor card - only clickable if image is available -->
        <div
          class="w-full text-left p-3 rounded border transition-all font-mono relative
            {isSelected 
              ? 'border-[var(--cyber-cyan)] bg-[var(--cyber-cyan)]/10 shadow-[0_0_12px_var(--cyber-cyan)/15]' 
              : available 
                ? 'border-border/30 hover:border-[var(--cyber-cyan)]/50 hover:bg-[var(--cyber-cyan)]/5 cursor-pointer'
                : 'border-border/20 bg-muted/30 cursor-default'}
            {disabled || isPulling ? 'opacity-50 cursor-not-allowed' : ''}"
          role={available ? "button" : undefined}
          tabindex={available && !disabled && !isPulling ? 0 : -1}
          onclick={() => available && !disabled && !isPulling && selectFlavor(flavor.id)}
          onkeydown={(e) => available && (e.key === 'Enter' || e.key === ' ') && !disabled && !isPulling && selectFlavor(flavor.id)}
        >
          <div class="flex items-start justify-between gap-2">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-1.5 mb-1 flex-wrap">
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
              
              <!-- Image status row -->
              <div class="flex items-center gap-2 mt-1.5">
                {#if loadingImages}
                  <span class="text-[10px] text-muted-foreground/70 flex items-center gap-1">
                    <Loader2 class="w-3 h-3 animate-spin" />
                    Checking...
                  </span>
                {:else if available}
                  <span class="text-[10px] text-[var(--cyber-emerald)] flex items-center gap-1">
                    <Check class="w-3 h-3" />
                    Ready
                  </span>
                  {#if status?.size}
                    <span class="text-[10px] text-muted-foreground/70">
                      ({formatSize(status.size)})
                    </span>
                  {/if}
                {:else}
                  <span class="text-[10px] text-[var(--cyber-amber)] flex items-center gap-1">
                    <Download class="w-3 h-3" />
                    Not downloaded
                  </span>
                {/if}
              </div>
            </div>
            
            <!-- Right side: Selection indicator (available) or Pull button (unavailable) -->
            <div class="flex-shrink-0 flex flex-col items-end gap-1">
              {#if available}
                <!-- Selection indicator - only for available images -->
                <div class="w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all
                  {isSelected ? 'border-[var(--cyber-cyan)] bg-[var(--cyber-cyan)] shadow-[0_0_8px_var(--cyber-cyan)]' : 'border-muted-foreground/30'}">
                  {#if isSelected}
                    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="text-black">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                  {/if}
                </div>
              {:else if !loadingImages}
                <!-- Pull button - only for unavailable images -->
                <button
                  type="button"
                  class="text-[10px] px-2 py-0.5 rounded bg-[var(--cyber-amber)]/20 text-[var(--cyber-amber)] 
                    hover:bg-[var(--cyber-amber)]/30 border border-[var(--cyber-amber)]/30 
                    flex items-center gap-1 transition-colors disabled:opacity-50"
                  onclick={(e) => pullImage(flavor.id, e)}
                  disabled={isPulling || disabled}
                >
                  {#if isPulling}
                    <Loader2 class="w-3 h-3 animate-spin" />
                    Pulling...
                  {:else}
                    <Download class="w-3 h-3" />
                    Pull
                  {/if}
                </button>
              {/if}
            </div>
          </div>
        </div>
      {/each}
    </div>
    
    <!-- Show more/less button -->
    {#if hiddenCount() > 0}
      <button
        type="button"
        class="w-full py-2 px-3 rounded border border-border/30 hover:border-[var(--cyber-cyan)]/50 
               hover:bg-[var(--cyber-cyan)]/5 transition-colors
               flex items-center justify-center gap-2 font-mono text-xs text-muted-foreground
               hover:text-foreground"
        onclick={() => showAllFlavors = !showAllFlavors}
        {disabled}
      >
        {#if showAllFlavors}
          <ChevronDown class="w-4 h-4 rotate-180 transition-transform" />
          <span>Show less</span>
        {:else}
          <ChevronDown class="w-4 h-4 transition-transform" />
          <span>Show {hiddenCount()} more environment{hiddenCount() > 1 ? 's' : ''}</span>
        {/if}
      </button>
    {/if}
    
    <!-- Empty state -->
    {#if flavors.length === 0}
      <div class="text-sm text-muted-foreground font-mono text-center p-4 border border-dashed border-border/30 rounded">
        No container flavors available
      </div>
    {/if}
    
    <!-- Info message about unavailable images -->
    {#if Object.values(imageStatus).some(s => !s.available)}
      <p class="text-[10px] text-muted-foreground font-mono">
        <span class="text-[var(--cyber-amber)]">*</span> Some images need to be downloaded before use. Click "Pull" to download.
      </p>
    {/if}
  {/if}
</div>
