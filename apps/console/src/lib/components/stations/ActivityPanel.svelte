<script lang="ts">
  import { onMount } from "svelte";
  import { activity } from "$lib/api/client";
  import type { StationAuditRow } from "$lib/api/client";

  interface Props {
    stationId: string;
  }

  let { stationId }: Props = $props();

  let rows = $state<StationAuditRow[]>([]);
  let isLoading = $state(true);
  let error = $state<string | null>(null);

  async function load() {
    isLoading = true;
    error = null;
    try {
      rows = await activity(stationId);
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to load activity";
    } finally {
      isLoading = false;
    }
  }

  onMount(() => {
    load();
  });

  function fmtTimestamp(val: string | Date): string {
    const d = typeof val === "string" ? new Date(val) : val;
    if (isNaN(d.getTime())) return String(val);
    const diffMs = Date.now() - d.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return d.toLocaleString();
  }

  function resultBadgeClass(result: string): string {
    if (result === "ok") return "text-green-700 bg-green-100 dark:text-green-400 dark:bg-green-950/50";
    if (result === "error") return "text-red-700 bg-red-100 dark:text-red-400 dark:bg-red-950/50";
    return "text-muted-foreground bg-muted";
  }
</script>

<div class="flex flex-col gap-3 p-4">
  <!-- Toolbar -->
  <div class="flex justify-end">
    <button
      type="button"
      class="inline-flex h-8 items-center justify-center rounded-md border border-input bg-background px-3 text-[13px] font-medium text-muted-foreground shadow-xs hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
      disabled={isLoading}
      onclick={load}
      aria-label="Refresh"
    >
      Refresh
    </button>
  </div>

  {#if isLoading}
    <p class="text-sm text-muted-foreground py-2">Loading activity…</p>
  {:else if error}
    <p class="text-sm text-destructive py-2">{error}</p>
  {:else if rows.length === 0}
    <p class="text-sm text-muted-foreground py-2">No activity yet.</p>
  {:else}
    <ul class="divide-y divide-border/40 rounded-md border border-border overflow-hidden">
      {#each rows as row (row.id)}
        <li
          class="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 px-3 py-2 text-[13px] hover:bg-muted/40"
          data-testid="activity-row"
        >
          <span
            class="shrink-0 text-xs text-muted-foreground tabular-nums min-w-[4.5rem]"
            title={String(row.createdAt)}
          >
            {fmtTimestamp(row.createdAt)}
          </span>
          <span class="shrink-0 font-mono text-xs font-semibold text-foreground">
            {row.verb}
          </span>
          {#if row.paramsSummary}
            <span
              class="flex-1 font-mono text-[11px] text-muted-foreground overflow-hidden text-ellipsis whitespace-nowrap"
              title={row.paramsSummary}
            >
              {row.paramsSummary}
            </span>
          {/if}
          <span
            class="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide {resultBadgeClass(row.result)}"
          >
            {row.result}
          </span>
          {#if row.error}
            <span class="shrink-0 text-xs text-destructive italic truncate max-w-xs">
              {row.error}
            </span>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>
