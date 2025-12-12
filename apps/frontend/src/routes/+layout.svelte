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
      const isPublicRoute = publicRoutes.some(route => currentPath.startsWith(route));
      
      if (!auth.isAuthenticated && !isPublicRoute) {
        goto("/login");
      }
    }
  });
</script>

<Toaster richColors position="bottom-right" />

<div class="min-h-screen bg-background text-foreground">
  {#if isInitializing}
    <div class="flex items-center justify-center min-h-screen">
      <div class="text-center">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
        <p class="mt-4 text-muted-foreground">Loading...</p>
      </div>
    </div>
  {:else}
    {@render children()}
  {/if}
</div>
