<script lang="ts">
  import "../app.css";
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { initConnection } from "$lib/stores/connection.svelte";
  import { auth, initAuth } from "$lib/stores/auth.svelte";
  import { initSettings } from "$lib/stores/settings.svelte";
  import { themeStore } from "$lib/themes/store.svelte";
  import { Toaster } from "$lib/components/ui/sonner";

  let { children } = $props();
  let isInitializing = $state(true);
  let currentPath = $state("/");

  // Public routes that don't require authentication
  const publicRoutes = ["/login"];

  // Derived: check if current route is public
  let isPublicRoute = $derived(publicRoutes.some(route => currentPath.startsWith(route)));

  // Derived: should we show the loading spinner?
  // Show loading if initializing OR if we need to redirect (not authenticated and not on public route)
  let shouldShowLoading = $derived(
    isInitializing || 
    (!isPublicRoute && auth.isInitialized && !auth.isAuthenticated)
  );

  onMount(async () => {
    // Get current path
    currentPath = window.location.pathname;
    
    // Initialize theme store first (applies saved theme immediately)
    themeStore.initialize();
    
    // Initialize settings
    await initSettings();
    // Initialize auth
    await initAuth();
    // Then connection
    await initConnection();
    isInitializing = false;
  });

  // Auth guard - redirect to login if not authenticated
  $effect(() => {
    if (!isInitializing && auth.isInitialized) {
      // Update current path on navigation
      if (typeof window !== "undefined") {
        currentPath = window.location.pathname;
      }
      
      if (!auth.isAuthenticated && !isPublicRoute) {
        goto("/login");
      }
    }
  });
</script>

<Toaster richColors position="bottom-right" />

<div class="min-h-screen bg-background text-foreground">
  {#if shouldShowLoading}
    <!-- Cyber-styled loading state -->
    <div class="noise-overlay"></div>
    <div class="min-h-screen grid-bg mesh-gradient flex items-center justify-center">
      <div class="text-center animate-fade-in-up">
        <div class="relative">
          <!-- Outer ring -->
          <div class="w-16 h-16 rounded-full border-2 border-[var(--cyber-cyan)]/20 mx-auto"></div>
          <!-- Spinning ring -->
          <div class="absolute inset-0 w-16 h-16 rounded-full border-2 border-transparent border-t-[var(--cyber-cyan)] mx-auto animate-spin"></div>
          <!-- Center dot -->
          <div class="absolute inset-0 flex items-center justify-center">
            <div class="w-2 h-2 rounded-full bg-[var(--cyber-cyan)] animate-pulse-dot"></div>
          </div>
        </div>
        <p class="mt-6 text-sm font-mono text-muted-foreground tracking-wider uppercase">
          Initializing<span class="typing-cursor"></span>
        </p>
      </div>
    </div>
  {:else}
    {@render children()}
  {/if}
</div>
