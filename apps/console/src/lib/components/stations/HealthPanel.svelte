<script lang="ts">
  import { onMount } from "svelte";
  import { stationHealth, lifecycle } from "$lib/api/client";
  import TypeToConfirmDialog from "$lib/components/ui/TypeToConfirmDialog.svelte";
  import * as Card from "$lib/components/ui/card";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
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
  <Card.Root class="border-0 shadow-none rounded-none">
    <Card.Content class="py-4 space-y-4">
      <!-- Responsive stat grid: 1 col mobile → 2 cols sm -->
      <dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
        <!-- Status -->
        <div class="flex flex-col gap-1">
          <dt class="text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</dt>
          <dd>
            <Badge
              variant={health.running ? "default" : "secondary"}
              class={health.running
                ? "bg-chart-2 text-chart-2 border-transparent"
                : ""}
            >
              {health.running ? "Running" : "Stopped"}
            </Badge>
          </dd>
        </div>

        <!-- PID -->
        <div class="flex flex-col gap-1">
          <dt class="text-xs font-medium text-muted-foreground uppercase tracking-wide">PID</dt>
          <dd class="font-mono text-sm text-foreground">{fmt(health.pid)}</dd>
        </div>

        <!-- CPU -->
        <div class="flex flex-col gap-1">
          <dt class="text-xs font-medium text-muted-foreground uppercase tracking-wide">CPU</dt>
          <dd class="font-mono text-sm text-foreground">
            {health.cpuPct !== null ? `${health.cpuPct}%` : "—"}
          </dd>
        </div>

        <!-- Memory -->
        <div class="flex flex-col gap-1">
          <dt class="text-xs font-medium text-muted-foreground uppercase tracking-wide">Memory</dt>
          <dd class="font-mono text-sm text-foreground">{fmtBytes(health.memBytes)}</dd>
        </div>

        <!-- Disk -->
        <div class="flex flex-col gap-1">
          <dt class="text-xs font-medium text-muted-foreground uppercase tracking-wide">Disk</dt>
          <dd class="font-mono text-sm text-foreground">{fmtBytes(health.diskBytes)}</dd>
        </div>

        <!-- Uptime -->
        <div class="flex flex-col gap-1">
          <dt class="text-xs font-medium text-muted-foreground uppercase tracking-wide">Uptime</dt>
          <dd class="font-mono text-sm text-foreground">{fmtUptime(health.uptimeSec)}</dd>
        </div>

        <!-- Last Activity -->
        <div class="flex flex-col gap-1">
          <dt class="text-xs font-medium text-muted-foreground uppercase tracking-wide">Last Activity</dt>
          <dd class="font-mono text-sm text-foreground">{fmtStr(health.lastActivity)}</dd>
        </div>

        <!-- Note -->
        <div class="flex flex-col gap-1">
          <dt class="text-xs font-medium text-muted-foreground uppercase tracking-wide">Note</dt>
          <dd class="font-mono text-sm text-foreground">{fmtStr(health.note)}</dd>
        </div>

        <!-- Matrix ID (conditional) -->
        {#if matrixId}
          <div class="flex flex-col gap-1 sm:col-span-2">
            <dt class="text-xs font-medium text-muted-foreground uppercase tracking-wide">Matrix</dt>
            <dd class="font-mono text-sm">
              <a
                href="https://matrix.to/#/{matrixId}"
                target="_blank"
                rel="noopener noreferrer"
                class="text-primary hover:underline break-all"
              >{matrixId}</a>
            </dd>
          </div>
        {/if}
      </dl>

      <!-- Lifecycle controls -->
      {#if canLifecycle}
        <div class="pt-2 border-t border-border/40 flex flex-wrap gap-2">
          <Button
            variant="default"
            size="sm"
            disabled={actionInFlight}
            onclick={handleStart}
          >
            Start
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={actionInFlight}
            onclick={handleStop}
          >
            Stop
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={actionInFlight}
            onclick={handleRestart}
          >
            Restart
          </Button>
        </div>
        {#if actionError}
          <p class="text-sm text-destructive">{actionError}</p>
        {/if}
      {/if}
    </Card.Content>
  </Card.Root>

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
