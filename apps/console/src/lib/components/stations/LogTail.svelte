<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { logsUrl } from "$lib/api/client";
  import { Badge } from "$lib/components/ui/badge";
  import { statusBadgeClass } from "$lib/utils/status-badge";

  interface Props {
    stationId: string;
  }

  let { stationId }: Props = $props();

  // Maximum number of log lines kept in the DOM at any time.
  // Older lines are dropped when new ones push past this cap.
  const MAX_LINES = 2000;

  let lines = $state<string[]>([]);
  let status = $state<"connecting" | "connected" | "closed">("connecting");
  let containerEl = $state<HTMLElement | null>(null);

  let es: EventSource | null = null;

  onMount(() => {
    // Guard: EventSource is only available in browser environments.
    // Tests stub globalThis.EventSource before rendering.
    if (typeof EventSource === "undefined") {
      status = "closed";
      return;
    }

    const url = logsUrl(stationId);
    // withCredentials so the Better Auth session cookie is sent on the
    // cross-origin SSE request (console :1420 → hub :3001); without it the
    // /logs endpoint returns 401.
    es = new EventSource(url, { withCredentials: true });

    es.onopen = () => {
      status = "connected";
    };

    es.onmessage = (event: MessageEvent) => {
      const next = [...lines, event.data];
      lines = next.length > MAX_LINES ? next.slice(-MAX_LINES) : next;
      // Auto-scroll to bottom on next tick
      if (containerEl) {
        setTimeout(() => {
          if (containerEl) containerEl.scrollTop = containerEl.scrollHeight;
        }, 0);
      }
    };

    es.onerror = () => {
      status = "closed";
    };
  });

  onDestroy(() => {
    es?.close();
    es = null;
    status = "closed";
  });

  const statusLabel: Record<string, string> = {
    connecting: "Connecting…",
    connected: "Connected",
    closed: "Disconnected",
  };

  // Map log-stream states to status tokens understood by statusBadgeClass
  const statusToken: Record<string, string> = {
    connecting: "pending",
    connected: "connected",
    closed: "stopped",
  };
</script>

<div class="cyber-card flex flex-col h-full min-h-[200px]">
  <!-- Header -->
  <div
    class="flex items-center gap-2 px-3 py-1.5 border-b border-border/50 bg-black/30 shrink-0"
  >
    <span class="text-xs font-mono text-muted-foreground/70 uppercase tracking-wide">Logs</span>
    <Badge variant="outline" class={statusBadgeClass(statusToken[status] ?? status)}>
      {statusLabel[status]}
    </Badge>
    <span class="ml-auto text-xs font-mono text-muted-foreground/60">
      {lines.length} line{lines.length === 1 ? "" : "s"}
    </span>
  </div>

  <!-- Log lines — styled scroll container preserving auto-scroll + line-cap -->
  <div
    bind:this={containerEl}
    class="flex-1 overflow-y-auto min-h-0 bg-black/90 py-1 font-mono text-[13px] leading-relaxed"
  >
    {#if lines.length === 0 && status === "connecting"}
      <div class="px-3 py-1 text-[#6b7280] italic">Waiting for log output…</div>
    {:else if lines.length === 0}
      <div class="px-3 py-1 text-[#6b7280] italic">No log output yet.</div>
    {:else}
      {#each lines as line}
        <div class="px-3 py-0.5 text-[#d4d4d4] whitespace-pre-wrap break-all hover:bg-white/5">
          {line}
        </div>
      {/each}
    {/if}
  </div>
</div>
