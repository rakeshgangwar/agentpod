<script lang="ts">
  import { goto } from "$app/navigation";
  import { connection } from "$lib/stores/connection.svelte";
  import { onMount } from "svelte";

  // Redirect based on connection status
  onMount(() => {
    if (connection.isConnected) {
      goto("/projects", { replaceState: true });
    } else {
      goto("/setup", { replaceState: true });
    }
  });

  // Also handle reactive changes
  $effect(() => {
    if (connection.isConnected) {
      goto("/projects", { replaceState: true });
    }
  });
</script>

<main class="container mx-auto px-4 py-8 max-w-6xl">
  <div class="flex items-center justify-center min-h-[80vh]">
    <div class="text-center">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
      <p class="mt-4 text-muted-foreground">Loading...</p>
    </div>
  </div>
</main>
