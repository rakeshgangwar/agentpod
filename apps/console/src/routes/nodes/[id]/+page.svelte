<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { stations, loadDetected, adopt, loadAdopted } from "$lib/stores/stations.svelte";
  import { listNodes } from "$lib/api/client";
  import type { NodeSummary } from "@agentpod/contract";
  import StationTree from "$lib/components/stations/StationTree.svelte";
  import ProvisionedNodeControls from "$lib/components/fleet/ProvisionedNodeControls.svelte";
  import * as Card from "$lib/components/ui/card";
  import { Badge } from "$lib/components/ui/badge";
  import { statusBadgeClass } from "$lib/utils/status-badge";
  import { Button } from "$lib/components/ui/button";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";

  // params.id is always defined for this route
  const id = $derived($page.params.id as string);

  let node = $state<NodeSummary | null>(null);

  async function loadNode() {
    try {
      const all = await listNodes();
      node = all.find((n) => n.id === id) ?? null;
    } catch {
      // non-fatal: node info is best-effort; stations still load
    }
  }

  onMount(() => {
    loadDetected(id);
    loadAdopted(id);
    loadNode();
  });

  async function handleAdopt(key: string) {
    await adopt(id, [key]);
  }

  async function handleAdoptAll() {
    const unadopted = stations.detected.filter((s) => !s.adopted);
    if (unadopted.length === 0) return;
    await adopt(id, unadopted.map((s) => s.key));
  }

  function isAlreadyAdopted(key: string): boolean {
    return stations.adopted.some((s) => s.stationKey === key);
  }
</script>

<div class="space-y-6 p-4 md:p-6">
  <!-- Page header -->
  <div class="flex items-start gap-3">
    <a href="/" class="text-muted-foreground hover:text-foreground transition-colors mt-1" aria-label="Back to fleet">
      <ArrowLeftIcon class="w-4 h-4" />
    </a>
    <div class="flex-1 min-w-0">
      <h1 class="text-xl font-bold font-mono tracking-tight">
        Node: <span class="text-primary">{node?.hostname ?? id}</span>
      </h1>
      {#if node}
        <div class="flex flex-wrap items-center gap-2 mt-1">
          <Badge
            variant="outline"
            class={statusBadgeClass(node.status)}
          >
            {node.status}
          </Badge>
        </div>

        <!-- Provisioned runtime controls (destroy / stop / start) -->
        {#if node.provisioned}
          <div class="mt-3">
            <ProvisionedNodeControls {node} onRefresh={loadNode} />
          </div>
        {/if}
      {/if}
    </div>
  </div>

  {#if stations.error}
    <div class="cyber-card p-4 border-destructive/50">
      <p class="text-sm font-mono text-destructive">{stations.error}</p>
    </div>
  {/if}

  <!-- Detected Stations section -->
  <section class="space-y-3">
    <div class="flex items-center justify-between gap-4">
      <div>
        <h2 class="text-lg font-semibold">Detected Stations</h2>
        <p class="text-xs text-muted-foreground font-mono">// ready to adopt</p>
      </div>
      {#if stations.detected.filter((s) => !isAlreadyAdopted(s.key)).length > 0}
        <Button
          variant="outline"
          size="sm"
          onclick={handleAdoptAll}
          disabled={stations.isLoading}
          class="font-mono text-xs uppercase tracking-wider shrink-0"
        >
          Adopt all
        </Button>
      {/if}
    </div>

    {#if stations.isLoading}
      <div class="flex flex-col gap-2">
        {#each [1, 2] as _}
          <Skeleton class="h-16 rounded-xl" />
        {/each}
      </div>
    {:else if stations.detected.length === 0}
      <div class="cyber-card p-8 text-center">
        <p class="text-sm text-muted-foreground">No stations detected.</p>
      </div>
    {:else}
      <div class="flex flex-col gap-2 md:grid md:grid-cols-2 lg:grid-cols-3">
        {#each stations.detected as s (s.key)}
          <Card.Root class="transition-colors hover:border-primary/40">
            <Card.Content class="flex items-center justify-between gap-3 p-4">
              <div class="flex flex-col gap-1 min-w-0">
                <span class="text-sm font-semibold truncate">{s.displayName}</span>
                <div class="flex items-center gap-1.5 flex-wrap">
                  <Badge
                    variant="outline"
                    class="font-mono text-[10px] text-primary border-primary/40"
                  >
                    {s.harness}
                  </Badge>
                  <span class="text-xs text-muted-foreground">{s.kind}</span>
                </div>
                {#if s.workspacePath}
                  <code class="text-xs text-muted-foreground font-mono truncate" title={s.workspacePath}>{s.workspacePath}</code>
                {/if}
              </div>
              {#if !isAlreadyAdopted(s.key)}
                <Button
                  size="sm"
                  onclick={() => handleAdopt(s.key)}
                  disabled={stations.isLoading}
                  class="shrink-0 font-mono text-xs"
                >
                  Adopt
                </Button>
              {:else}
                <Badge variant="secondary" class="shrink-0">Adopted</Badge>
              {/if}
            </Card.Content>
          </Card.Root>
        {/each}
      </div>
    {/if}
  </section>

  <!-- Adopted Stations section -->
  <section class="space-y-3">
    <div>
      <h2 class="text-lg font-semibold">Adopted Stations</h2>
      <p class="text-xs text-muted-foreground font-mono">// active workspaces</p>
    </div>

    {#if stations.isLoading}
      <div class="flex flex-col gap-2">
        {#each [1, 2] as _}
          <Skeleton class="h-12 rounded-xl" />
        {/each}
      </div>
    {:else if stations.adopted.length === 0}
      <div class="cyber-card p-8 text-center">
        <p class="text-sm text-muted-foreground">No stations adopted yet.</p>
      </div>
    {:else}
      <StationTree stations={stations.adopted} nodeId={id} />
    {/if}
  </section>
</div>
