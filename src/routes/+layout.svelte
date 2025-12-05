<script lang="ts">
  import "../app.css";
  import { onMount } from "svelte";
  import { connection, initConnection } from "$lib/stores/connection.svelte";

  let { children } = $props();
  let isInitializing = $state(true);

  onMount(async () => {
    await initConnection();
    isInitializing = false;
  });
</script>

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
