<script lang="ts">
  import { onMount } from "svelte";
  import { stationHealth, lifecycle } from "$lib/api/client";
  import TypeToConfirmDialog from "$lib/components/ui/TypeToConfirmDialog.svelte";
  import type { StationHealth } from "@agentpod/contract";

  interface Props {
    stationId: string;
    canLifecycle?: boolean;
    matrixId?: string | null;
  }

  let { stationId, canLifecycle = false, matrixId = null }: Props = $props();

  let health = $state<StationHealth | null>(null);
  let isLoading = $state(true);
  let error = $state<string | null>(null);

  // Lifecycle action state
  let dialogOpen = $state(false);
  let pendingAction = $state<"stop" | "restart" | null>(null);
  let actionInFlight = $state(false);
  let actionError = $state<string | null>(null);

  onMount(async () => {
    try {
      health = await stationHealth(stationId);
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to load health";
    } finally {
      isLoading = false;
    }
  });

  function fmt(v: number | null): string {
    return v !== null ? String(v) : "—";
  }

  function fmtStr(v: string | null): string {
    return v ?? "—";
  }

  function fmtBytes(v: number | null): string {
    if (v === null) return "—";
    if (v < 1024) return `${v} B`;
    if (v < 1048576) return `${(v / 1024).toFixed(1)} KB`;
    if (v < 1073741824) return `${(v / 1048576).toFixed(1)} MB`;
    return `${(v / 1073741824).toFixed(2)} GB`;
  }

  function fmtUptime(v: number | null): string {
    if (v === null) return "—";
    const h = Math.floor(v / 3600);
    const m = Math.floor((v % 3600) / 60);
    const s = v % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  async function doLifecycle(action: "start" | "stop" | "restart") {
    actionInFlight = true;
    actionError = null;
    try {
      health = await lifecycle(stationId, action);
    } catch (err) {
      actionError = err instanceof Error ? err.message : "Action failed";
    } finally {
      actionInFlight = false;
    }
  }

  function handleStart() {
    doLifecycle("start");
  }

  function handleStop() {
    pendingAction = "stop";
    dialogOpen = true;
  }

  function handleRestart() {
    pendingAction = "restart";
    dialogOpen = true;
  }

  function handleDialogConfirm() {
    dialogOpen = false;
    const action = pendingAction;
    pendingAction = null;
    if (action) doLifecycle(action);
  }

  function handleDialogCancel() {
    dialogOpen = false;
    pendingAction = null;
  }
</script>

{#if isLoading}
  <p class="text-sm text-muted-foreground p-3">Loading health data…</p>
{:else if error}
  <p class="text-sm text-destructive p-3">{error}</p>
{:else if health}
  <div class="p-4">
    <table class="w-full text-sm border-collapse">
      <tbody>
        <tr class="border-b border-border/40">
          <th class="text-left text-muted-foreground font-medium py-2 pr-4 w-36 whitespace-nowrap">Status</th>
          <td class="py-2 font-mono text-[13px]">
            <span class="inline-flex items-center gap-1.5">
              <span
                class="inline-block w-2 h-2 rounded-full {health.running ? 'bg-green-500' : 'bg-muted-foreground'}"
              ></span>
              {health.running ? "Running" : "Stopped"}
            </span>
          </td>
        </tr>
        <tr class="border-b border-border/40">
          <th class="text-left text-muted-foreground font-medium py-2 pr-4">PID</th>
          <td class="py-2 font-mono text-[13px]">{fmt(health.pid)}</td>
        </tr>
        <tr class="border-b border-border/40">
          <th class="text-left text-muted-foreground font-medium py-2 pr-4">CPU</th>
          <td class="py-2 font-mono text-[13px]">
            {health.cpuPct !== null ? `${health.cpuPct}%` : "—"}
          </td>
        </tr>
        <tr class="border-b border-border/40">
          <th class="text-left text-muted-foreground font-medium py-2 pr-4">Memory</th>
          <td class="py-2 font-mono text-[13px]">{fmtBytes(health.memBytes)}</td>
        </tr>
        <tr class="border-b border-border/40">
          <th class="text-left text-muted-foreground font-medium py-2 pr-4">Disk</th>
          <td class="py-2 font-mono text-[13px]">{fmtBytes(health.diskBytes)}</td>
        </tr>
        <tr class="border-b border-border/40">
          <th class="text-left text-muted-foreground font-medium py-2 pr-4">Uptime</th>
          <td class="py-2 font-mono text-[13px]">{fmtUptime(health.uptimeSec)}</td>
        </tr>
        <tr class="border-b border-border/40">
          <th class="text-left text-muted-foreground font-medium py-2 pr-4">Last Activity</th>
          <td class="py-2 font-mono text-[13px]">{fmtStr(health.lastActivity)}</td>
        </tr>
        <tr class="border-b border-border/40">
          <th class="text-left text-muted-foreground font-medium py-2 pr-4">Note</th>
          <td class="py-2 font-mono text-[13px]">{fmtStr(health.note)}</td>
        </tr>
        {#if matrixId}
        <tr>
          <th class="text-left text-muted-foreground font-medium py-2 pr-4">Matrix</th>
          <td class="py-2 font-mono text-[13px]">
            <a
              href="https://matrix.to/#/{matrixId}"
              target="_blank"
              rel="noopener noreferrer"
            >{matrixId}</a>
          </td>
        </tr>
        {/if}
      </tbody>
    </table>

    {#if canLifecycle}
      <div class="mt-4 flex gap-2">
        <button
          type="button"
          class="inline-flex h-8 items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground shadow-xs hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
          disabled={actionInFlight}
          onclick={handleStart}
        >
          Start
        </button>
        <button
          type="button"
          class="inline-flex h-8 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium shadow-xs hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
          disabled={actionInFlight}
          onclick={handleStop}
        >
          Stop
        </button>
        <button
          type="button"
          class="inline-flex h-8 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium shadow-xs hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
          disabled={actionInFlight}
          onclick={handleRestart}
        >
          Restart
        </button>
      </div>
      {#if actionError}
        <p class="mt-2 text-sm text-destructive">{actionError}</p>
      {/if}
    {/if}
  </div>

  {#if canLifecycle}
    <TypeToConfirmDialog
      open={dialogOpen}
      title="{pendingAction === 'stop' ? 'Stop' : 'Restart'} station"
      message="This will {pendingAction} the station process. Type the station ID below to confirm."
      confirmPhrase={stationId}
      confirmLabel="Confirm"
      onConfirm={handleDialogConfirm}
      onCancel={handleDialogCancel}
    />
  {/if}
{/if}
