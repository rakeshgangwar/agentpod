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

<!-- Noise overlay for atmosphere -->
<div class="noise-overlay"></div>

<main class="min-h-screen grid-bg mesh-gradient flex items-center justify-center">
  <div class="text-center animate-fade-in-up">
    <!-- Cyber loading spinner -->
    <div class="relative mx-auto w-16 h-16">
      <!-- Outer ring -->
      <div class="absolute inset-0 rounded-full border-2 border-[var(--cyber-cyan)]/20"></div>
      <!-- Spinning ring -->
      <div class="absolute inset-0 rounded-full border-2 border-transparent border-t-[var(--cyber-cyan)] animate-spin"></div>
      <!-- Center dot -->
      <div class="absolute inset-0 flex items-center justify-center">
        <div class="w-2 h-2 rounded-full bg-[var(--cyber-cyan)] animate-pulse-dot"></div>
      </div>
    </div>
    <p class="mt-6 text-sm font-mono text-muted-foreground tracking-wider uppercase">
      Loading<span class="typing-cursor"></span>
    </p>
  </div>
</main>
