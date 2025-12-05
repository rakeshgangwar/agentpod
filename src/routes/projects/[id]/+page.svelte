<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import { onMount } from "svelte";

  // Redirect to chat tab by default
  onMount(() => {
    goto(`/projects/${$page.params.id}/chat`, { replaceState: true });
  });
</script>

<div class="flex items-center justify-center min-h-[40vh]">
  <p class="text-muted-foreground">Redirecting to chat...</p>
</div>
