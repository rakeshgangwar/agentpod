<script lang="ts">
  import { onMount } from "svelte";
  import { listNodes, createEnrollmentToken } from "$lib/api/client";
  import type { NodeSummary } from "@agentpod/contract";
  import * as Card from "$lib/components/ui/card";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import ServerIcon from "@lucide/svelte/icons/server";
  import PlusIcon from "@lucide/svelte/icons/plus";

  let nodes = $state<NodeSummary[]>([]);
  let isLoading = $state(true);
  let error = $state<string | null>(null);
  let lastToken = $state<string | null>(null);
  let isMinting = $state(false);

  function resolvedHubUrl(): string {
    const stored =
      typeof window !== "undefined" ? window.localStorage.getItem("agentpod.apiUrl") : null;
    return stored ?? import.meta.env.PUBLIC_HUB_URL ?? "http://localhost:3001";
  }

  onMount(async () => {
    try {
      nodes = await listNodes();
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load nodes";
    } finally {
      isLoading = false;
    }
  });

  async function handleCreateToken() {
    isMinting = true;
    try {
      const result = await createEnrollmentToken();
      lastToken = result.token;
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to create enrollment token";
    } finally {
      isMinting = false;
    }
  }
</script>

<section class="space-y-6">
  <!-- Header row -->
  <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
    <div>
      <h2 class="text-2xl font-bold tracking-tight">Fleet Overview</h2>
      <p class="text-sm text-muted-foreground font-mono">// connected nodes</p>
    </div>
    <Button onclick={handleCreateToken} disabled={isMinting} class="font-mono text-xs uppercase tracking-wider w-full sm:w-auto">
      <PlusIcon class="h-4 w-4 mr-2" />
      {isMinting ? "Creating…" : "Create enrollment token"}
    </Button>
  </div>

  <!-- Enrollment command block -->
  {#if lastToken}
    <div class="cyber-card p-4 space-y-2">
      <p class="text-xs font-mono text-muted-foreground">// run this on the target node to connect it</p>
      <code class="block text-sm font-mono break-all text-[var(--cyber-cyan)]">
        agentpod-node enroll --hub {resolvedHubUrl()} --token {lastToken}
      </code>
    </div>
  {/if}

  <!-- Loading state -->
  {#if isLoading}
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {#each [1, 2, 3] as _}
        <Skeleton class="h-36 rounded-xl" />
      {/each}
    </div>

  <!-- Error state -->
  {:else if error}
    <div class="cyber-card p-4 border-destructive/50">
      <p class="text-sm font-mono text-destructive">{error}</p>
    </div>

  <!-- Empty state -->
  {:else if nodes.length === 0}
    <div class="cyber-card p-12 text-center">
      <ServerIcon class="w-12 h-12 mx-auto mb-4 text-muted-foreground/40" />
      <h3 class="text-lg font-semibold mb-1">No nodes yet</h3>
      <p class="text-sm text-muted-foreground">
        Create an enrollment token to connect one.
      </p>
    </div>

  <!-- Node cards grid -->
  {:else}
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {#each nodes as node (node.id)}
        <a href="/nodes/{node.id}" class="block group focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cyber-cyan)] rounded-xl">
          <Card.Root class="h-full transition-colors group-hover:border-[var(--cyber-cyan)]/50">
            <Card.Header>
              <div class="flex items-start justify-between gap-2">
                <Card.Title class="font-mono text-sm leading-tight truncate">
                  {node.hostname}
                </Card.Title>
                <Badge
                  variant={node.status === "online" ? "default" : "secondary"}
                  class={node.status === "online"
                    ? "shrink-0 bg-[var(--cyber-emerald)] text-black border-transparent"
                    : "shrink-0"}
                >
                  {node.status}
                </Badge>
              </div>
            </Card.Header>
            <Card.Content class="space-y-1">
              <p class="text-sm font-mono text-muted-foreground">
                {node.arch} · {node.cpuCount} CPU
              </p>
              <p class="text-xs font-mono text-muted-foreground/70">
                {node.os}
              </p>
            </Card.Content>
          </Card.Root>
        </a>
      {/each}
    </div>
  {/if}
</section>
