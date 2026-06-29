<script lang="ts">
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";

  // Redirect to users page by default
  onMount(() => {
    goto("/admin/users", { replaceState: true });
  });
</script>

<!-- Loading indicator while redirecting -->
<div class="noise-overlay"></div>
<main class="h-screen flex flex-col grid-bg mesh-gradient overflow-hidden items-center justify-center">
  <div class="text-center animate-fade-in-up">
    <div class="relative">
      <div class="w-16 h-16 rounded-full border-2 border-[var(--cyber-cyan)]/20 mx-auto"></div>
      <div class="absolute inset-0 w-16 h-16 rounded-full border-2 border-transparent border-t-[var(--cyber-cyan)] mx-auto animate-spin"></div>
    </div>
    <p class="mt-6 text-sm font-mono text-muted-foreground tracking-wider uppercase">
      Loading admin<span class="typing-cursor"></span>
    </p>
  </div>
</main>
