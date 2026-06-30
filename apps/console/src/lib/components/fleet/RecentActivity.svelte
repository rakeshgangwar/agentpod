<script lang="ts">
  import { onMount } from "svelte";
  import { listActivity } from "$lib/api/client";
  import type { ActivityRow } from "$lib/api/client";

  let rows = $state<ActivityRow[]>([]);
  let isLoading = $state(true);

  function relativeTime(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  onMount(async () => {
    try {
      const all = await listActivity();
      rows = all.slice(0, 6);
    } catch {
      // non-fatal: show empty state
    } finally {
      isLoading = false;
    }
  });
</script>

<div class="cyber-card p-4 space-y-2" data-testid="recent-activity">
  <div class="flex items-center justify-between">
    <p class="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">// recent activity</p>
    <a href="/activity" class="font-mono text-[10px] text-primary hover:underline" data-testid="view-all-activity">
      view all →
    </a>
  </div>

  {#if isLoading}
    <p class="font-mono text-xs text-muted-foreground">// loading…</p>
  {:else if rows.length === 0}
    <p class="font-mono text-xs text-muted-foreground" data-testid="no-activity">// no activity yet</p>
  {:else}
    <ul class="space-y-1.5" data-testid="activity-list">
      {#each rows as row (row.id)}
        <li class="flex items-center gap-2 font-mono text-xs" data-testid="activity-row">
          <span class="text-foreground font-medium">{row.verb}</span>
          {#if row.stationKey}
            <span class="text-muted-foreground/70">· {row.stationKey}</span>
          {/if}
          {#if row.nodeId}
            <span class="text-muted-foreground/50">· {row.nodeId.slice(0, 8)}</span>
          {/if}
          <span class="ml-auto text-muted-foreground/50 shrink-0">{relativeTime(String(row.createdAt))}</span>
        </li>
      {/each}
    </ul>
  {/if}
</div>
