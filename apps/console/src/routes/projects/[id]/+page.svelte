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
  <div class="text-center animate-fade-in-up">
    <div class="relative mx-auto w-10 h-10">
      <div class="absolute inset-0 rounded-full border-2 border-[var(--cyber-cyan)]/20"></div>
      <div class="absolute inset-0 rounded-full border-2 border-transparent border-t-[var(--cyber-cyan)] animate-spin"></div>
    </div>
    <p class="mt-4 text-sm font-mono text-muted-foreground">
      Redirecting<span class="typing-cursor"></span>
    </p>
  </div>
</div>
