<script lang="ts">
  import { onMount } from "svelte";
  import {
    listRuntimes,
    destroyRuntime,
    startRuntime,
    stopRuntime,
    listRuntimeProviders,
  } from "$lib/api/client";
  import type { ProvisionedRuntime } from "@agentpod/contract";
  import PageHeader from "$lib/components/page-header.svelte";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { statusBadgeClass } from "$lib/utils/status-badge";
  import NewRuntimeDialog from "$lib/components/fleet/NewRuntimeDialog.svelte";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import { toast } from "svelte-sonner";

  // ── State ───────────────────────────────────────────────────────────────────
  let runtimes = $state<ProvisionedRuntime[]>([]);
  let providers = $state<string[]>(["docker", "cloudflare"]);
  let isLoading = $state(true);
  let error = $state<string | null>(null);
  let showNewRuntimeDialog = $state(false);

  /** Runtime targeted for destruction; drives the confirm dialog. */
  let destroyTarget = $state<ProvisionedRuntime | null>(null);
  let isDestroying = $state(false);

  /** Per-runtime in-flight flag for start/stop to disable buttons. */
  let actionInFlight = $state<Record<string, boolean>>({});

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function relativeTime(dateStr: string): string {
    try {
      const diff = Date.now() - new Date(dateStr).getTime();
      const m = Math.floor(diff / 60000);
      if (m < 1) return "just now";
      if (m < 60) return `${m}m ago`;
      const h = Math.floor(m / 60);
      if (h < 24) return `${h}h ago`;
      return `${Math.floor(h / 24)}d ago`;
    } catch {
      return "?";
    }
  }

  // ── Data loading ─────────────────────────────────────────────────────────────

  async function loadRuntimes() {
    try {
      runtimes = await listRuntimes();
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load runtimes";
    } finally {
      isLoading = false;
    }
  }

  onMount(async () => {
    // Fetch enabled providers; fall back to defaults on failure
    try {
      const res = await listRuntimeProviders();
      if (res.providers.length > 0) providers = res.providers;
    } catch {
      // keep ["docker", "cloudflare"]
    }
    await loadRuntimes();
  });

  // ── Actions ──────────────────────────────────────────────────────────────────

  async function handleRuntimeCreated() {
    showNewRuntimeDialog = false;
    isLoading = true;
    await loadRuntimes();
  }

  async function handleDestroyConfirm() {
    if (!destroyTarget) return;
    const id = destroyTarget.id;
    isDestroying = true;
    try {
      await destroyRuntime(id);
      destroyTarget = null;
      isLoading = true;
      await loadRuntimes();
    } catch (e) {
      toast.error("Destroy failed", {
        description: e instanceof Error ? e.message : "Unknown error",
      });
    } finally {
      isDestroying = false;
    }
  }

  async function handleStart(rt: ProvisionedRuntime) {
    actionInFlight[rt.id] = true;
    try {
      await startRuntime(rt.id);
      await loadRuntimes();
    } catch (e) {
      toast.error("Start failed", {
        description: e instanceof Error ? e.message : "Unknown error",
      });
    } finally {
      delete actionInFlight[rt.id];
    }
  }

  async function handleStop(rt: ProvisionedRuntime) {
    actionInFlight[rt.id] = true;
    try {
      await stopRuntime(rt.id);
      await loadRuntimes();
    } catch (e) {
      toast.error("Stop failed", {
        description: e instanceof Error ? e.message : "Unknown error",
      });
    } finally {
      delete actionInFlight[rt.id];
    }
  }
</script>

<!-- ── Page header with "New runtime" CTA ─────────────────────────────────── -->
<PageHeader title="Runtimes" subtitle="// provisioned containers">
  {#snippet actions()}
    <Button
      onclick={() => (showNewRuntimeDialog = true)}
      class="font-mono text-xs uppercase tracking-wider"
      data-testid="new-runtime-btn"
    >
      <PlusIcon class="h-4 w-4 mr-2" />
      New runtime
    </Button>
  {/snippet}
</PageHeader>

<!-- ── Main content ───────────────────────────────────────────────────────── -->
<div class="container mx-auto px-4 sm:px-6 max-w-7xl py-6">
  {#if isLoading}
    <!-- Loading skeletons -->
    <div class="space-y-2">
      {#each [1, 2, 3] as _}
        <Skeleton class="h-12 rounded-sm" />
      {/each}
    </div>

  {:else if error}
    <!-- Error state -->
    <div class="cyber-card p-4 border-destructive/50">
      <p class="text-sm font-mono text-destructive">{error}</p>
    </div>

  {:else if runtimes.length === 0}
    <!-- Empty state -->
    <div class="cyber-card p-8 text-center space-y-4" data-testid="empty-state">
      <p class="font-mono text-sm text-muted-foreground">// no runtimes yet</p>
      <p class="font-mono text-xs text-muted-foreground/60">
        // provision your first runtime to get started
      </p>
      <Button
        onclick={() => (showNewRuntimeDialog = true)}
        class="font-mono text-xs uppercase tracking-wider"
        data-testid="empty-new-runtime-btn"
      >
        <PlusIcon class="h-4 w-4 mr-2" />
        Provision runtime
      </Button>
    </div>

  {:else}
    <!-- Runtimes table -->
    <div class="cyber-card overflow-hidden" data-testid="runtimes-table">
      <!-- Column header row -->
      <div
        class="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-x-4 px-4 py-2 border-b border-border/30"
        style="background: hsl(var(--muted) / 0.3);"
      >
        <span class="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/60">Name / ID</span>
        <span class="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/60">Provider</span>
        <span class="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/60">Status</span>
        <span class="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/60">Node</span>
        <span class="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/60">Actions</span>
      </div>

      <!-- Data rows -->
      <ul class="divide-y divide-border/20">
        {#each runtimes as rt (rt.id)}
          <li
            class="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-x-4 px-4 py-3 items-center hover:bg-primary/3 transition-colors"
            data-testid="runtime-row"
          >
            <!-- Name / ID -->
            <div class="min-w-0">
              <p class="font-mono text-sm text-foreground font-medium truncate">{rt.name}</p>
              <p class="font-mono text-[10px] text-muted-foreground/50 truncate">{rt.id.slice(0, 12)}</p>
            </div>

            <!-- Provider -->
            <span class="font-mono text-xs text-muted-foreground/80 truncate">{rt.provider}</span>

            <!-- Status badge -->
            <span>
              <Badge
                variant="outline"
                class={statusBadgeClass(rt.status)}
                data-testid="status-badge"
              >
                {rt.status}
              </Badge>
            </span>

            <!-- Linked node (click navigates to node detail) -->
            <span class="font-mono text-xs text-muted-foreground/60 truncate">
              {#if rt.nodeId}
                <a href="/nodes/{rt.nodeId}" class="hover:text-primary transition-colors">
                  {rt.nodeId.slice(0, 8)}
                </a>
              {:else}
                <span class="text-muted-foreground/30">—</span>
              {/if}
            </span>

            <!-- Per-row actions -->
            <div class="flex items-center gap-1.5">
              <!-- Start: shown when runtime is stopped or in error -->
              {#if rt.status === "stopped" || rt.status === "error"}
                <button
                  type="button"
                  disabled={!!actionInFlight[rt.id]}
                  onclick={() => handleStart(rt)}
                  class="font-mono text-[10px] uppercase tracking-wider px-2 py-1 rounded border transition-colors
                    border-chart-2/50 text-chart-2 hover:border-chart-2 hover:bg-chart-2/10
                    disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid="start-btn"
                >
                  Start
                </button>
              {/if}

              <!-- Stop: shown when runtime is online -->
              {#if rt.status === "online"}
                <button
                  type="button"
                  disabled={!!actionInFlight[rt.id]}
                  onclick={() => handleStop(rt)}
                  class="font-mono text-[10px] uppercase tracking-wider px-2 py-1 rounded border transition-colors
                    border-muted-foreground/50 text-muted-foreground hover:border-muted-foreground hover:bg-muted/20
                    disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid="stop-btn"
                >
                  Stop
                </button>
              {/if}

              <!-- Destroy: hidden during provisioning or when already destroyed -->
              {#if rt.status !== "provisioning" && rt.status !== "destroyed"}
                <button
                  type="button"
                  onclick={() => (destroyTarget = rt)}
                  class="font-mono text-[10px] uppercase tracking-wider px-2 py-1 rounded border transition-colors
                    border-destructive/50 text-destructive hover:border-destructive hover:bg-destructive/10"
                  data-testid="destroy-btn"
                >
                  Destroy
                </button>
              {/if}
            </div>
          </li>
        {/each}
      </ul>
    </div>
  {/if}
</div>

<!-- ── New runtime dialog — reuses the same dialog/flow from NodesOverview ── -->
<NewRuntimeDialog
  open={showNewRuntimeDialog}
  {providers}
  onClose={() => (showNewRuntimeDialog = false)}
  onCreated={handleRuntimeCreated}
/>

<!-- ── Destroy confirmation dialog ──────────────────────────────────────────── -->
<Dialog.Root
  open={destroyTarget !== null}
  onOpenChange={(open) => {
    if (!open) destroyTarget = null;
  }}
>
  <Dialog.Portal>
    <Dialog.Overlay />
    <Dialog.Content showCloseButton={false}>
      <Dialog.Header>
        <Dialog.Title class="font-mono">Destroy Runtime</Dialog.Title>
        <Dialog.Description>
          Permanently destroy <strong>{destroyTarget?.name}</strong>? This action cannot be
          undone.
        </Dialog.Description>
      </Dialog.Header>
      <Dialog.Footer>
        <Button
          variant="outline"
          onclick={() => (destroyTarget = null)}
          disabled={isDestroying}
        >
          Cancel
        </Button>
        <Button
          variant="destructive"
          onclick={handleDestroyConfirm}
          disabled={isDestroying}
          data-testid="confirm-destroy-btn"
        >
          {isDestroying ? "Destroying…" : "Destroy"}
        </Button>
      </Dialog.Footer>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
