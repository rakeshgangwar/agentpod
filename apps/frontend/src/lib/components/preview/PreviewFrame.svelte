<script lang="ts">
  import Loader2Icon from "@lucide/svelte/icons/loader-2";
  import AlertTriangleIcon from "@lucide/svelte/icons/alert-triangle";
  import type { ConsoleLog } from "./ConsolePanel.svelte";
  
  let { 
    url = null, 
    title = "Preview",
    onConsoleMessage
  } = $props<{ 
    url: string | null;
    title?: string;
    onConsoleMessage?: (log: ConsoleLog) => void;
  }>();

  let isLoading = $state(true);
  let error = $state<string | null>(null);
  let iframeRef = $state<HTMLIFrameElement | null>(null);

  $effect(() => {
    if (url) {
      isLoading = true;
      error = null;
    } else {
      isLoading = false;
      error = "No preview URL available";
    }
  });

  function handleLoad() {
    isLoading = false;
    error = null;
    
    // Inject console capturing script if needed
    // Note: This only works for same-origin iframes or if headers allow it
    // For cross-origin, we rely on postMessage from the injected script in the preview
    if (iframeRef?.contentWindow) {
      try {
        // We can try to listen to messages from the iframe
        // The actual injection happens via Traefik middleware or the backend serving the preview
      } catch (e) {
        console.warn("Cannot access iframe content:", e);
      }
    }
  }

  function handleError() {
    isLoading = false;
    error = "Failed to load preview";
  }

  // Listen for console messages from the preview
  $effect(() => {
    function handleMessage(event: MessageEvent) {
      if (!url) return;
      
      // Basic check to ensure it's from our preview
      // In production, we should check event.origin against the preview URL origin
      
      if (event.data && event.data.type === 'agentpod-console' && onConsoleMessage) {
        onConsoleMessage({
          type: event.data.level || 'log',
          message: event.data.message || '',
          timestamp: Date.now()
        });
      }
    }

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  });
</script>

<div class="relative w-full h-full bg-white rounded-md overflow-hidden border border-border/50">
  {#if url}
    <iframe
      bind:this={iframeRef}
      src={url}
      {title}
      class="w-full h-full border-0 bg-white"
      onload={handleLoad}
      onerror={handleError}
      sandbox="allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts allow-downloads allow-pointer-lock"
      allow="accelerometer; camera; encrypted-media; geolocation; gyroscope; microphone; midi; clipboard-read; clipboard-write"
    ></iframe>
  {/if}

  {#if isLoading}
    <div class="absolute inset-0 flex flex-col items-center justify-center bg-background/50 backdrop-blur-sm z-10">
      <Loader2Icon class="h-8 w-8 text-[var(--cyber-cyan)] animate-spin mb-2" />
      <span class="text-sm font-mono text-muted-foreground animate-pulse">Loading preview...</span>
    </div>
  {/if}

  {#if error}
    <div class="absolute inset-0 flex flex-col items-center justify-center bg-background z-10">
      <div class="p-6 rounded-lg border border-[var(--cyber-red)]/30 bg-[var(--cyber-red)]/5 text-center max-w-md">
        <AlertTriangleIcon class="h-10 w-10 text-[var(--cyber-red)] mx-auto mb-3" />
        <h3 class="text-lg font-bold mb-1">Preview Error</h3>
        <p class="text-sm text-muted-foreground mb-4">{error}</p>
        <p class="text-xs text-muted-foreground/60">
          Make sure your application is running and listening on the expected port.
        </p>
      </div>
    </div>
  {/if}
</div>
