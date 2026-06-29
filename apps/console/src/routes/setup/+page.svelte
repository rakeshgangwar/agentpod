<script lang="ts">
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";

  // Redirect to login page - setup is now handled there
  onMount(() => {
    goto("/login", { replaceState: true });
  });
</script>

<!-- Noise overlay for atmosphere -->
<div class="noise-overlay"></div>

<main class="min-h-screen grid-bg mesh-gradient flex items-center justify-center">
  <div class="text-center animate-fade-in-up">
    <!-- Cyber loading spinner -->
    <div class="relative mx-auto w-12 h-12">
      <div class="absolute inset-0 rounded-full border-2 border-[var(--cyber-cyan)]/20"></div>
      <div class="absolute inset-0 rounded-full border-2 border-transparent border-t-[var(--cyber-cyan)] animate-spin"></div>
    </div>
    <p class="mt-4 text-sm font-mono text-muted-foreground">
      Redirecting<span class="typing-cursor"></span>
    </p>
  </div>
</main>
