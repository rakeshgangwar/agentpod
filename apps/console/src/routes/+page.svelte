<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { getFleet, createEnrollmentToken } from "$lib/api/client";
  import type { FleetStats, FleetAgent } from "@agentpod/contract";
  import PageHeader from "$lib/components/page-header.svelte";
  import OverviewStats from "$lib/components/fleet/OverviewStats.svelte";
  import FleetHeatmap from "$lib/components/fleet/FleetHeatmap.svelte";
  import NeedsAttention from "$lib/components/fleet/NeedsAttention.svelte";
  import RecentActivity from "$lib/components/fleet/RecentActivity.svelte";
  import ConnectBanner from "$lib/components/fleet/connect-banner.svelte";
  import { Skeleton } from "$lib/components/ui/skeleton";

  let stats = $state<FleetStats | null>(null);
  let agents = $state<FleetAgent[]>([]);
  let isLoading = $state(true);
  let error = $state<string | null>(null);

  // Enrollment token state (for empty-state connect banner)
  let lastToken = $state<string | null>(null);
  let isMinting = $state(false);

  // ── Heatmap navigation callbacks ──────────────────────────────────────────────

  function handleSelectAgent(stationId: string) {
    goto("/agents?station=" + stationId);
  }

  function handleFilterStatus(status: string) {
    goto("/agents?status=" + status);
  }

  async function loadFleet() {
    try {
      const result = await getFleet();
      stats = result.stats;
      agents = result.agents;
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load fleet";
    } finally {
      isLoading = false;
    }
  }

  async function handleCreateToken() {
    isMinting = true;
    try {
      const result = await createEnrollmentToken();
      lastToken = result.token;
    } catch {
      // non-fatal in empty state — ConnectBanner handles the error display
    } finally {
      isMinting = false;
    }
  }

  onMount(async () => {
    await loadFleet();
  });
</script>

<PageHeader title="Overview" subtitle="// fleet control plane" />

<div class="container mx-auto px-4 sm:px-6 max-w-7xl py-6 space-y-6">
  {#if isLoading}
    <!-- Loading skeleton for stat cards -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {#each [1, 2, 3] as _}
        <Skeleton class="h-20 rounded-xl" />
      {/each}
    </div>

  {:else if error}
    <div class="cyber-card p-4 border-destructive/50">
      <p class="text-sm font-mono text-destructive">{error}</p>
    </div>

  {:else if agents.length === 0}
    <!-- Empty state: no agents enrolled yet -->
    <div class="flex flex-col items-center py-8">
      <div class="w-full max-w-2xl">
        {#if lastToken}
          <div class="cyber-card p-6 space-y-3">
            <p class="text-xs font-mono text-muted-foreground">// enrollment token created — run this on the target node to connect it</p>
            <code class="block text-sm font-mono break-all text-primary">
              curl -fsSL https://github.com/rakeshgangwar/agentpod/releases/latest/download/install.sh | sudo bash -s -- {lastToken}
            </code>
            <p class="text-xs font-mono text-muted-foreground/60">// the node will appear in the fleet once it connects</p>
          </div>
        {:else}
          <ConnectBanner onCreateToken={handleCreateToken} />
        {/if}
      </div>
    </div>

  {:else}
    <!-- Stat band -->
    {#if stats}
      <OverviewStats {stats} />
    {/if}

    <!-- Fleet heatmap — clicking a cell navigates to /agents filtered by that station -->
    <div class="cyber-card p-4 space-y-2">
      <span class="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">// fleet health</span>
      <FleetHeatmap
        {agents}
        onSelectAgent={handleSelectAgent}
        onFilterStatus={handleFilterStatus}
      />
    </div>

    <!-- Dashboard panels: Needs Attention + Recent Activity -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <NeedsAttention {agents} />
      <RecentActivity />
    </div>
  {/if}
</div>
