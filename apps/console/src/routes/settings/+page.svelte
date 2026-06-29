<script lang="ts">
  import { goto } from "$app/navigation";
  import { auth, logout } from "$lib/stores/auth.svelte";
  import { connection, disconnect } from "$lib/stores/connection.svelte";
  import ThemeSettings from "$lib/components/theme-settings.svelte";
  import { Button } from "$lib/components/ui/button";
  import PaletteIcon from "@lucide/svelte/icons/palette";
  import ServerIcon from "@lucide/svelte/icons/server";
  import UserIcon from "@lucide/svelte/icons/user";
  import SettingsIcon from "@lucide/svelte/icons/settings";

  async function handleDisconnect() {
    await disconnect();
    goto("/setup");
  }

  async function handleSignOut() {
    await logout();
    goto("/login");
  }
</script>

<div class="noise-overlay"></div>
<main class="h-screen flex flex-col grid-bg mesh-gradient overflow-hidden">

  <!-- Page title bar -->
  <div class="border-b border-border/30 bg-background/50 backdrop-blur-sm px-4 py-3 flex items-center gap-3 shrink-0">
    <SettingsIcon class="h-4 w-4 text-[var(--cyber-cyan)]" />
    <h1 class="font-mono text-sm uppercase tracking-wider text-foreground">Settings</h1>
  </div>

  <div class="flex-1 overflow-y-auto">
    <div class="container mx-auto px-4 py-6 max-w-3xl space-y-6 animate-fade-in">

      <!-- ================================================================ -->
      <!-- Section 1: Appearance                                             -->
      <!-- ================================================================ -->
      <div class="cyber-card corner-accent overflow-hidden animate-fade-in-up stagger-1">
        <div class="py-3 px-4 border-b border-border/30 bg-background/30 backdrop-blur-sm flex items-center gap-2">
          <PaletteIcon class="h-4 w-4 text-[var(--cyber-cyan)]" />
          <h2 class="font-mono text-xs uppercase tracking-wider text-[var(--cyber-cyan)]">
            [appearance]
          </h2>
        </div>
        <div class="p-4">
          <ThemeSettings />
        </div>
      </div>

      <!-- ================================================================ -->
      <!-- Section 2: Connection                                             -->
      <!-- ================================================================ -->
      <div class="cyber-card corner-accent overflow-hidden animate-fade-in-up stagger-2">
        <div class="py-3 px-4 border-b border-border/30 bg-background/30 backdrop-blur-sm flex items-center gap-2">
          <ServerIcon class="h-4 w-4 text-[var(--cyber-cyan)]" />
          <h2 class="font-mono text-xs uppercase tracking-wider text-[var(--cyber-cyan)]">
            [connection]
          </h2>
        </div>
        <div class="p-4 space-y-3">
          <div class="space-y-1">
            <span class="text-[var(--cyber-cyan)] text-xs font-mono">CONNECTED_TO:</span>
            <p class="font-mono text-sm break-all bg-background/50 p-2 rounded border border-border/30">
              {connection.apiUrl ?? "—"}
            </p>
          </div>
        </div>
        <div class="px-4 pb-4">
          <Button
            variant="outline"
            onclick={handleDisconnect}
            class="font-mono text-xs uppercase tracking-wider border-[var(--cyber-amber)]/50 text-[var(--cyber-amber)] hover:bg-[var(--cyber-amber)]/10"
          >
            Use different server
          </Button>
        </div>
      </div>

      <!-- ================================================================ -->
      <!-- Section 3: Account                                                -->
      <!-- ================================================================ -->
      <div class="cyber-card corner-accent overflow-hidden animate-fade-in-up stagger-3">
        <div class="py-3 px-4 border-b border-border/30 bg-background/30 backdrop-blur-sm flex items-center gap-2">
          <UserIcon class="h-4 w-4 text-[var(--cyber-cyan)]" />
          <h2 class="font-mono text-xs uppercase tracking-wider text-[var(--cyber-cyan)]">
            [account]
          </h2>
        </div>
        <div class="p-4 space-y-3">
          {#if auth.user}
            <div class="space-y-2 font-mono text-sm bg-background/50 p-3 rounded border border-border/30">
              {#if auth.user.name}
                <div class="flex items-baseline gap-2">
                  <span class="text-xs text-[var(--cyber-cyan)]">NAME:</span>
                  <span>{auth.user.name}</span>
                </div>
              {/if}
              <div class="flex items-baseline gap-2">
                <span class="text-xs text-[var(--cyber-cyan)]">EMAIL:</span>
                <span>{auth.user.email}</span>
              </div>
              {#if auth.user.role}
                <div class="flex items-baseline gap-2">
                  <span class="text-xs text-[var(--cyber-cyan)]">ROLE:</span>
                  <span class="px-2 py-0.5 rounded text-xs text-[var(--cyber-magenta)] bg-[color-mix(in_oklch,var(--cyber-magenta)_10%,transparent)] border border-[color-mix(in_oklch,var(--cyber-magenta)_30%,transparent)]">
                    {auth.user.role}
                  </span>
                </div>
              {/if}
            </div>
          {:else}
            <p class="text-xs text-muted-foreground font-mono">Not signed in.</p>
          {/if}
        </div>
        <div class="px-4 pb-4">
          <Button
            variant="outline"
            onclick={handleSignOut}
            class="font-mono text-xs uppercase tracking-wider border-[var(--cyber-red)]/50 text-[var(--cyber-red)] hover:bg-[var(--cyber-red)]/10"
          >
            Sign out
          </Button>
        </div>
      </div>

    </div>
  </div>
</main>
