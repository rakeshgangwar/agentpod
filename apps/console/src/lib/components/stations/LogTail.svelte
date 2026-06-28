<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { logsUrl } from "$lib/api/client";

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

  const statusColor: Record<string, string> = {
    connecting: "bg-yellow-500",
    connected: "bg-green-500",
    closed: "bg-muted-foreground",
  };
</script>

<div class="flex flex-col h-full min-h-[200px] rounded-md border border-border overflow-hidden bg-black/90">
  <!-- Header -->
  <div class="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-muted/20 text-xs font-mono shrink-0">
    <span class="inline-block w-2 h-2 rounded-full {statusColor[status]}"></span>
    <span class="text-muted-foreground">{statusLabel[status]}</span>
    <span class="ml-auto text-muted-foreground">{lines.length} line{lines.length === 1 ? "" : "s"}</span>
  </div>

  <!-- Log lines -->
  <div
    bind:this={containerEl}
    class="flex-1 overflow-y-auto py-1 font-mono text-[13px] leading-relaxed"
  >
    {#if lines.length === 0 && status === "connecting"}
      <div class="px-3 py-1 text-[#6b7280] italic">Waiting for log output…</div>
    {:else if lines.length === 0}
      <div class="px-3 py-1 text-[#6b7280] italic">No log output yet.</div>
    {:else}
      {#each lines as line}
        <div class="px-3 py-0.5 text-[#d4d4d4] whitespace-pre-wrap break-all hover:bg-white/5">{line}</div>
      {/each}
    {/if}
  </div>
</div>
