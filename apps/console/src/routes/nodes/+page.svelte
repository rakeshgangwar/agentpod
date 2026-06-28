<script lang="ts">
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";

  // The canonical fleet/nodes list is now the home page.
  // Redirect anyone landing here to /.
  onMount(() => {
    goto("/", { replaceState: true });
  });
</script>
