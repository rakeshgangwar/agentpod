<script lang="ts">
  import "../app.css";
  import { onMount, onDestroy } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { initConnection } from "$lib/stores/connection.svelte";
  import { auth, initAuth } from "$lib/stores/auth.svelte";
  import { themeStore } from "$lib/themes/store.svelte";
  import { commandPalette } from "$lib/stores/command-palette.svelte";
  import { Toaster } from "$lib/components/ui/sonner";
  import * as Tooltip from "$lib/components/ui/tooltip";
  import AppShell from "$lib/components/app-shell.svelte";
  import CommandPalette from "$lib/components/command-palette.svelte";

  let { children } = $props();
  let isInitializing = $state(true);

  // Reactive current path (tracks SvelteKit client navigations — using
  // window.location.pathname imperatively goes stale across goto()).
  let currentPath = $derived(page.url.pathname);

  // Public routes that don't require authentication (no AppShell/BottomNav)
  const publicRoutes = ["/login", "/setup"];

  // Derived: check if current route is public
  let isPublicRoute = $derived(publicRoutes.some(route => currentPath.startsWith(route)));

  // Derived: should we show the loading spinner?
  // Only show loading during initial app startup
  // Don't show loading during redirects (e.g., after logout) - just let the redirect happen
  let shouldShowLoading = $derived(isInitializing);

  // Derived: should we show the AppShell with bottom navigation?
  // Hide on public routes (login/setup) and show on all authenticated routes
  let showAppShell = $derived(!isPublicRoute && !shouldShowLoading);

  function handleGlobalKeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      commandPalette.toggle();
    }
  }

  onMount(async () => {
    themeStore.initialize();

    await initConnection(); // must run before initAuth — sets the auth client base URL
    await initAuth();
    isInitializing = false;

    window.addEventListener("keydown", handleGlobalKeydown);
  });

  onDestroy(() => {
    if (typeof window !== "undefined") {
      window.removeEventListener("keydown", handleGlobalKeydown);
    }
  });

  // Auth guard - redirect to login if not authenticated
  $effect(() => {
    if (!isInitializing && auth.isInitialized) {
      if (!auth.isAuthenticated && !isPublicRoute) {
        goto("/login");
      }
    }
  });
</script>

<!-- Tooltip Provider - required for all Tooltip components -->
<Tooltip.Provider>
  <!-- Toast notifications - positioned to avoid bottom nav on mobile -->
  <Toaster richColors position="bottom-right" class="mb-16 md:mb-0" />

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
    {:else if showAppShell}
      <!-- Authenticated routes: wrap in AppShell with bottom navigation -->
      <AppShell>
        {@render children()}
      </AppShell>
    {:else}
      <!-- Public routes (login/setup): render without AppShell -->
      {@render children()}
    {/if}
  </div>

  <CommandPalette />
</Tooltip.Provider>
