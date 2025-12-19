<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
  import ExternalLinkIcon from "@lucide/svelte/icons/external-link";
  import Loader2Icon from "@lucide/svelte/icons/loader-2";
  import CameraIcon from "@lucide/svelte/icons/camera";
  
  let { 
    url = null, 
    onRefresh,
    onOpenExternal,
    onScreenshot,
    isRefreshing = false
  } = $props<{ 
    url: string | null; 
    onRefresh: () => void;
    onOpenExternal: () => void;
    onScreenshot?: () => void;
    isRefreshing?: boolean;
  }>();

  let isCapturing = $state(false);

  async function handleScreenshot() {
    if (!onScreenshot || isCapturing) return;
    
    isCapturing = true;
    try {
      await onScreenshot();
    } finally {
      // Small delay to prevent double-clicks
      setTimeout(() => {
        isCapturing = false;
      }, 500);
    }
  }
</script>

<div class="h-10 border-b border-border flex items-center px-2 bg-muted/40 gap-2 shrink-0">
  <div class="flex-1 flex items-center bg-background border border-border rounded-sm px-3 h-7 text-xs font-mono text-muted-foreground overflow-hidden">
    {#if url}
      <span class="truncate select-all text-foreground">{url}</span>
    {:else}
      <span class="opacity-50 italic">No preview URL</span>
    {/if}
  </div>

  <div class="flex items-center gap-1">
    {#if onScreenshot}
      <Button 
        variant="ghost" 
        size="icon" 
        class="h-7 w-7 rounded-sm" 
        title="Capture screenshot"
        disabled={!url || isCapturing}
        onclick={handleScreenshot}
      >
        <CameraIcon class="h-3.5 w-3.5 {isCapturing ? 'text-[var(--cyber-cyan)]' : ''}" />
      </Button>
    {/if}

    <Button 
      variant="ghost" 
      size="icon" 
      class="h-7 w-7 rounded-sm" 
      title="Refresh preview"
      disabled={!url}
      onclick={onRefresh}
    >
      <RefreshCwIcon class="h-3.5 w-3.5 {isRefreshing ? 'animate-spin' : ''}" />
    </Button>
    
    <Button 
      variant="ghost" 
      size="icon" 
      class="h-7 w-7 rounded-sm" 
      title="Open in browser"
      disabled={!url}
      onclick={onOpenExternal}
    >
      <ExternalLinkIcon class="h-3.5 w-3.5" />
    </Button>
  </div>
</div>
