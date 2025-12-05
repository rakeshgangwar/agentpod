<script lang="ts">
  import { page } from "$app/stores";
  import { sveltify } from "svelte-preprocess-react";
  import { RuntimeProvider } from "$lib/chat/RuntimeProvider";
  import { ChatThread } from "$lib/chat/ChatThread";

  // Wrap React components for use in Svelte
  const react = sveltify({ RuntimeProvider, ChatThread });

  // Get project ID from route params (with fallback for safety)
  let projectId = $derived($page.params.id ?? "");
</script>

{#if projectId}
  <div class="flex flex-col h-[calc(100vh-200px)] min-h-[400px]">
    <react.RuntimeProvider {projectId}>
      <react.ChatThread />
    </react.RuntimeProvider>
  </div>
{:else}
  <div class="flex items-center justify-center h-[calc(100vh-200px)]">
    <p class="text-muted-foreground">Loading...</p>
  </div>
{/if}
