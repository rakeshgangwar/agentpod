<script lang="ts">
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";

  // Redirect to login page - setup is now handled there
  onMount(() => {
    goto("/login", { replaceState: true });
  });
</script>

<div class="min-h-screen flex items-center justify-center">
  <p class="text-muted-foreground">Redirecting...</p>
</div>
