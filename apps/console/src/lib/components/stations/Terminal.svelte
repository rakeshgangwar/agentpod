<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { createTerminalClient } from "$lib/api/terminal";
  import type { TerminalClient } from "$lib/api/terminal";

  interface Props {
    stationId: string;
  }

  let { stationId }: Props = $props();

  let containerEl = $state<HTMLDivElement | null>(null);
  let status = $state<"connecting" | "connected" | "disconnected">("connecting");

  // Keep references for onDestroy cleanup — async onMount can't return a cleanup fn
  let client: TerminalClient | null = null;
  let resizeObserver: ResizeObserver | null = null;
  // term is typed as `any` because @xterm/xterm is dynamic-imported; keeping it
  // loose here avoids a static import that would break SSR/build.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let term: any = null;

  onMount(() => {
    // Fire-and-forget: run the async setup inside onMount without returning a
    // Promise (Svelte's onMount signature doesn't support async cleanup returns).
    void (async () => {
      // xterm.js is browser-only — dynamic import keeps the static build clean
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
      ]);

      // Import xterm CSS dynamically alongside the module
      await import("@xterm/xterm/css/xterm.css");

      if (!containerEl) return;

      term = new Terminal({
        cursorBlink: true,
        fontSize: 13,
        fontFamily:
          "var(--font-mono), ui-monospace, 'Cascadia Code', Menlo, Monaco, 'Courier New', monospace",
        theme: {
          background: "#0a0a0a",
          foreground: "#d4d4d4",
          cursor: "#d4d4d4",
          selectionBackground: "#264f78",
        },
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.open(containerEl);
      fitAddon.fit();

      // Create the WS client once terminal dimensions are known
      client = createTerminalClient(stationId);

      // Terminal → hub: forward keystrokes / paste
      term.onData((data: string) => {
        client?.send(data);
      });

      // Hub → terminal: render incoming PTY output
      client.onData((text: string) => {
        term.write(text);
        if (status === "connecting") status = "connected";
      });

      // Notify the remote PTY of the initial dimensions
      client.resize(term.cols, term.rows);

      // Re-fit and resize whenever the container changes size
      const doResize = () => {
        fitAddon.fit();
        client?.resize(term.cols, term.rows);
      };

      resizeObserver = new ResizeObserver(doResize);
      resizeObserver.observe(containerEl);
    })();
  });

  onDestroy(() => {
    resizeObserver?.disconnect();
    resizeObserver = null;
    client?.close();
    client = null;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    term?.dispose();
    term = null;
    status = "disconnected";
  });

  const statusLabel: Record<string, string> = {
    connecting: "Connecting…",
    connected: "Connected",
    disconnected: "Disconnected",
  };

  const statusDot: Record<string, string> = {
    connecting: "bg-yellow-500",
    connected: "bg-green-500",
    disconnected: "bg-muted-foreground",
  };
</script>

<div
  class="flex flex-col h-full min-h-[200px] rounded-md border border-border overflow-hidden"
  style="background:#0a0a0a"
>
  <!-- Status bar -->
  <div
    class="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-muted/20 text-xs font-mono shrink-0"
  >
    <span class="inline-block w-2 h-2 rounded-full {statusDot[status]}"></span>
    <span class="text-muted-foreground">{statusLabel[status]}</span>
    <span class="ml-auto text-muted-foreground/50 text-[11px]">terminal</span>
  </div>

  <!-- xterm.js mount point -->
  <div bind:this={containerEl} class="flex-1 overflow-hidden p-1" style="min-height:0"></div>
</div>
