<script lang="ts">
  import type { FleetAgent } from "@agentpod/contract";
  import { updateNode } from "$lib/api/client";
  import { statusBadgeClass } from "$lib/utils/status-badge";
  import { Badge } from "$lib/components/ui/badge";
  import { toast } from "svelte-sonner";

  let { agents }: { agents: FleetAgent[] } = $props();

  // ── Toolbar state ────────────────────────────────────────────────────────────

  let searchQuery = $state("");
  let groupByNode = $state(true);
  let filterUpdateAvailable = $state(false);

  // ── Filtered agents ($derived) ────────────────────────────────────────────────

  let filteredAgents = $derived.by(() => {
    let result = agents;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (a) =>
          a.agentName.toLowerCase().includes(q) ||
          a.nodeName.toLowerCase().includes(q)
      );
    }

    if (filterUpdateAvailable) {
      result = result.filter((a) => a.updateAvailable);
    }

    return result;
  });

  // ── Grouped agents ($derived) ─────────────────────────────────────────────────

  interface NodeGroup {
    nodeId: string;
    nodeName: string;
    agents: FleetAgent[];
  }

  let groupedAgents = $derived.by((): NodeGroup[] => {
    const groups = new Map<string, NodeGroup>();

    for (const agent of filteredAgents) {
      if (!groups.has(agent.nodeId)) {
        groups.set(agent.nodeId, {
          nodeId: agent.nodeId,
          nodeName: agent.nodeName,
          agents: [],
        });
      }
      groups.get(agent.nodeId)!.agents.push(agent);
    }

    return Array.from(groups.values());
  });

  // ── Collapse state (keyed by nodeId) ─────────────────────────────────────────

  let collapsedGroups = $state<Record<string, boolean>>({});

  function toggleGroup(nodeId: string) {
    collapsedGroups[nodeId] = !collapsedGroups[nodeId];
  }

  // ── Per-node update state (mirrors slice-3 pattern from NodesOverview) ────────

  let updatingNodes = $state<Record<string, boolean>>({});

  async function handleUpdate(e: MouseEvent, nodeId: string) {
    e.stopPropagation();
    updatingNodes[nodeId] = true;
    try {
      const result = await updateNode(nodeId);
      if (result.ok) {
        // Keep "updating…" state — node will blip offline→online on the new version
        // and the next fleet refresh will clear updateAvailable.
      } else {
        delete updatingNodes[nodeId];
        toast.error("Update failed", { description: result.error ?? "Unknown error" });
      }
    } catch (err) {
      delete updatingNodes[nodeId];
      toast.error("Update failed", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }
</script>

<div class="space-y-3">
  <!-- Toolbar: search + filter pills + group toggle -->
  <div class="flex items-center gap-2 flex-wrap">
    <input
      type="search"
      placeholder="search agents…"
      bind:value={searchQuery}
      class="flex-1 min-w-[180px] font-mono text-sm px-3 py-1.5 rounded-sm border border-border/50 bg-background text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 transition-colors"
      aria-label="Search agents"
    />

    <!-- Filter pill: updates only -->
    <button
      type="button"
      onclick={() => (filterUpdateAvailable = !filterUpdateAvailable)}
      class="font-mono text-xs px-2.5 py-1.5 rounded-sm border transition-colors whitespace-nowrap
        {filterUpdateAvailable
          ? 'border-primary text-primary bg-primary/10'
          : 'border-border/50 text-muted-foreground hover:text-foreground hover:border-border'}"
      aria-pressed={filterUpdateAvailable}
    >
      updates only
    </button>

    <!-- Group toggle -->
    <button
      type="button"
      onclick={() => (groupByNode = !groupByNode)}
      class="font-mono text-xs px-2.5 py-1.5 rounded-sm border border-border/50 text-muted-foreground hover:text-foreground hover:border-border transition-colors whitespace-nowrap"
    >
      {groupByNode ? "group: node ▾" : "flat ▾"}
    </button>
  </div>

  <!-- Dense table -->
  <div class="border border-border/50 rounded-sm overflow-hidden">
    <table class="w-full border-collapse">
      <thead>
        <tr class="border-b border-border/30 bg-muted/20">
          <th class="font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground text-left px-3 py-2">Agent</th>
          <th class="font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground text-left px-3 py-2 hidden sm:table-cell">Harness</th>
          <th class="font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground text-left px-3 py-2 hidden md:table-cell">Node</th>
          <th class="font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground text-left px-3 py-2">Reachability</th>
          <th class="font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground text-left px-3 py-2 hidden sm:table-cell">Version</th>
          <th class="font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground text-left px-3 py-2">Update</th>
        </tr>
      </thead>
      <tbody>
        {#if groupByNode}
          {#each groupedAgents as group (group.nodeId)}
            <!-- Group header row -->
            <tr class="border-b border-border/20 bg-muted/10">
              <td colspan="6" class="px-3 py-1.5">
                <button
                  type="button"
                  onclick={() => toggleGroup(group.nodeId)}
                  class="flex items-center gap-2 font-mono text-[10px] text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
                  data-testid="group-header"
                >
                  <span class="text-[9px]">{collapsedGroups[group.nodeId] ? "▶" : "▾"}</span>
                  <span>{group.nodeName}</span>
                  <span class="text-muted-foreground/40">· {group.agents.length} {group.agents.length === 1 ? "agent" : "agents"}</span>
                </button>
              </td>
            </tr>

            {#if !collapsedGroups[group.nodeId]}
              {#each group.agents as agent (agent.stationId)}
                <tr class="border-b border-border/10 hover:bg-accent/20 transition-colors">
                  <td class="px-3 py-2">
                    <a
                      href="/nodes/{agent.nodeId}/stations/{agent.stationId}"
                      class="font-mono text-sm text-foreground hover:text-primary transition-colors"
                    >
                      {agent.agentName}
                    </a>
                  </td>
                  <td class="px-3 py-2 hidden sm:table-cell">
                    <span class="font-mono text-xs text-muted-foreground">{agent.harness}</span>
                  </td>
                  <td class="px-3 py-2 hidden md:table-cell">
                    <span class="font-mono text-xs text-muted-foreground">{agent.nodeName}</span>
                  </td>
                  <td class="px-3 py-2">
                    <Badge variant="outline" class={statusBadgeClass(agent.nodeStatus)}>
                      {agent.nodeStatus}
                    </Badge>
                  </td>
                  <td class="px-3 py-2 hidden sm:table-cell">
                    <span class="font-mono text-xs text-muted-foreground">{agent.agentVersion ?? "—"}</span>
                  </td>
                  <td class="px-3 py-2">
                    {#if agent.updateAvailable}
                      <button
                        type="button"
                        disabled={!!updatingNodes[agent.nodeId]}
                        onclick={(e) => handleUpdate(e, agent.nodeId)}
                        class="font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border transition-colors border-primary/50 text-primary hover:border-primary hover:bg-primary/10 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {updatingNodes[agent.nodeId] ? "updating…" : "Update"}
                      </button>
                    {/if}
                  </td>
                </tr>
              {/each}
            {/if}
          {/each}
        {:else}
          <!-- Flat view -->
          {#each filteredAgents as agent (agent.stationId)}
            <tr class="border-b border-border/10 hover:bg-accent/20 transition-colors">
              <td class="px-3 py-2">
                <a
                  href="/nodes/{agent.nodeId}/stations/{agent.stationId}"
                  class="font-mono text-sm text-foreground hover:text-primary transition-colors"
                >
                  {agent.agentName}
                </a>
              </td>
              <td class="px-3 py-2 hidden sm:table-cell">
                <span class="font-mono text-xs text-muted-foreground">{agent.harness}</span>
              </td>
              <td class="px-3 py-2 hidden md:table-cell">
                <span class="font-mono text-xs text-muted-foreground">{agent.nodeName}</span>
              </td>
              <td class="px-3 py-2">
                <Badge variant="outline" class={statusBadgeClass(agent.nodeStatus)}>
                  {agent.nodeStatus}
                </Badge>
              </td>
              <td class="px-3 py-2 hidden sm:table-cell">
                <span class="font-mono text-xs text-muted-foreground">{agent.agentVersion ?? "—"}</span>
              </td>
              <td class="px-3 py-2">
                {#if agent.updateAvailable}
                  <button
                    type="button"
                    disabled={!!updatingNodes[agent.nodeId]}
                    onclick={(e) => handleUpdate(e, agent.nodeId)}
                    class="font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border transition-colors border-primary/50 text-primary hover:border-primary hover:bg-primary/10 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {updatingNodes[agent.nodeId] ? "updating…" : "Update"}
                  </button>
                {/if}
              </td>
            </tr>
          {/each}
        {/if}
      </tbody>
    </table>

    <!-- Empty filtered state -->
    {#if filteredAgents.length === 0}
      <div class="py-8 text-center">
        <p class="text-sm font-mono text-muted-foreground">// no agents match the current filter</p>
      </div>
    {/if}
  </div>
</div>
