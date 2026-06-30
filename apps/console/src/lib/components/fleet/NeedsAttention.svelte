<script lang="ts">
  import type { FleetAgent } from "@agentpod/contract";

  let { agents }: { agents: FleetAgent[] } = $props();

  let notRunning = $derived(agents.filter((a) => a.status !== "running"));
  let offlineNodes = $derived(
    [...new Set(
      agents
        .filter((a) => a.nodeStatus === "offline")
        .map((a) => a.nodeId)
    )].length
  );
  let updatesAvailable = $derived(agents.filter((a) => a.updateAvailable).length);
</script>

<div class="cyber-card p-4 space-y-2" data-testid="needs-attention">
  <p class="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">// needs attention</p>

  {#if notRunning.length === 0 && offlineNodes === 0 && updatesAvailable === 0}
    <p class="font-mono text-xs text-chart-2" data-testid="all-healthy">all healthy ✓</p>
  {:else}
    <ul class="space-y-1">
      {#each notRunning as agent (agent.stationId)}
        <li>
          <a
            href="/agents?station={agent.stationId}"
            class="font-mono text-xs flex items-center gap-1.5 hover:text-primary transition-colors"
            data-testid="attention-agent"
          >
            <span class="text-foreground">{agent.agentName}</span>
            <span class="text-muted-foreground/60">·</span>
            <span class="text-destructive/80">{agent.status}</span>
          </a>
        </li>
      {/each}

      {#if offlineNodes > 0}
        <li>
          <a
            href="/nodes"
            class="font-mono text-xs flex items-center gap-1.5 hover:text-primary transition-colors"
            data-testid="attention-offline-nodes"
          >
            <span class="text-foreground">{offlineNodes} node{offlineNodes !== 1 ? "s" : ""} offline</span>
          </a>
        </li>
      {/if}

      {#if updatesAvailable > 0}
        <li>
          <a
            href="/agents?status=running"
            class="font-mono text-xs flex items-center gap-1.5 hover:text-primary transition-colors"
            data-testid="attention-updates"
          >
            <span class="text-foreground">{updatesAvailable} update{updatesAvailable !== 1 ? "s" : ""} available</span>
          </a>
        </li>
      {/if}
    </ul>
  {/if}
</div>
