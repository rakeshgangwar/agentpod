<script lang="ts">
  import "../app.css";
  import { onMount } from "svelte";
  import { connection, initConnection } from "$lib/stores/connection.svelte";
  import { initSettings } from "$lib/stores/settings.svelte";
  import { Toaster } from "$lib/components/ui/sonner";

  let { children } = $props();
  let isInitializing = $state(true);

  onMount(async () => {
    // Initialize settings first (for theme)
    await initSettings();
    // Then connection
    await initConnection();
    isInitializing = false;
  });
</script>

<Toaster richColors position="bottom-right" />

<div class="min-h-screen bg-background text-foreground">
  {#if isInitializing}
    <div class="flex items-center justify-center min-h-screen">
      <div class="text-center">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
        <p class="mt-4 text-muted-foreground">Loading...</p>
      </div>
    </div>
  {:else}
    {@render children()}
  {/if}
</div>
