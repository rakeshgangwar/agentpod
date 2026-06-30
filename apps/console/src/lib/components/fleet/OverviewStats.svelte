<script lang="ts">
  import type { FleetStats } from "@agentpod/contract";

  let { stats }: { stats: FleetStats } = $props();
</script>

<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
  <!-- Nodes stat -->
  <div class="cyber-card p-4 space-y-1">
    <div class="text-2xl font-bold font-mono text-foreground" data-testid="stat-nodes">
      {stats.nodes.online}<span class="text-muted-foreground text-lg">/{stats.nodes.total}</span>
    </div>
    <div class="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
      Nodes online
    </div>
  </div>

  <!-- Agents stat -->
  <div class="cyber-card p-4 space-y-1">
    <div class="text-2xl font-bold font-mono text-foreground" data-testid="stat-agents">
      {stats.agents.total}
    </div>
    <div class="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
      Agents
    </div>
  </div>

  <!-- Updates available stat — accent when >0 -->
  <div
    class="cyber-card p-4 space-y-1 {stats.updatesAvailable > 0 ? 'border-primary/50' : ''}"
  >
    <div
      class="text-2xl font-bold font-mono {stats.updatesAvailable > 0 ? 'text-primary' : 'text-foreground'}"
      data-testid="stat-updates"
    >
      {stats.updatesAvailable}
    </div>
    <div class="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
      Updates available
    </div>
  </div>
</div>
