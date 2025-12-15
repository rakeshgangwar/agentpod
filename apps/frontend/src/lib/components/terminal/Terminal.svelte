<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { Terminal as XTerm } from "@xterm/xterm";
  import { FitAddon } from "@xterm/addon-fit";
  import { WebLinksAddon } from "@xterm/addon-web-links";
  import "@xterm/xterm/css/xterm.css";
  import * as terminalStore from "$lib/stores/terminals.svelte";
  import type { TerminalSession } from "$lib/stores/terminals.svelte";

  // =============================================================================
  // Props
  // =============================================================================

  interface Props {
    /** Terminal session to render */
    session: TerminalSession;
    /** Whether to auto-focus on mount */
    autoFocus?: boolean;
    /** Custom class name */
    class?: string;
  }

  let { session, autoFocus = true, class: className = "" }: Props = $props();

  // =============================================================================
  // State
  // =============================================================================

  let containerRef: HTMLDivElement | undefined = $state();
  let terminal: XTerm | null = null;
  let fitAddon: FitAddon | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let outputUnsubscribe: (() => void) | null = null;
  let isDisposed = false;

  // =============================================================================
  // Terminal Theme
  // =============================================================================

  const terminalTheme = {
    background: "#1e1e2e", // Catppuccin Mocha base
    foreground: "#cdd6f4", // Catppuccin Mocha text
    cursor: "#f5e0dc", // Catppuccin Mocha rosewater
    cursorAccent: "#1e1e2e",
    selectionBackground: "#585b70", // Catppuccin Mocha surface2
    selectionForeground: "#cdd6f4",
    black: "#45475a",
    red: "#f38ba8",
    green: "#a6e3a1",
    yellow: "#f9e2af",
    blue: "#89b4fa",
    magenta: "#f5c2e7",
    cyan: "#94e2d5",
    white: "#bac2de",
    brightBlack: "#585b70",
    brightRed: "#f38ba8",
    brightGreen: "#a6e3a1",
    brightYellow: "#f9e2af",
    brightBlue: "#89b4fa",
    brightMagenta: "#f5c2e7",
    brightCyan: "#94e2d5",
    brightWhite: "#a6adc8",
  };

  // =============================================================================
  // Lifecycle
  // =============================================================================

  onMount(() => {
    if (!containerRef) return;

    // Get the mono font from CSS variable, with fallbacks
    const computedStyle = getComputedStyle(document.documentElement);
    const monoFont = computedStyle.getPropertyValue('--font-mono').trim() || 'JetBrains Mono';
    const fontFamily = `${monoFont}, Menlo, Monaco, Consolas, monospace`;

    // Create terminal instance
    terminal = new XTerm({
      cursorBlink: true,
      cursorStyle: "bar",
      fontFamily,
      fontSize: 14,
      lineHeight: 1.2,
      theme: terminalTheme,
      allowProposedApi: true,
      scrollback: 10000,
    });

    // Create and load addons
    fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(new WebLinksAddon());

    // Open terminal in container
    terminal.open(containerRef);

    // Fit to container - but only send resize if session is connected
    setTimeout(() => {
      fitAddon?.fit();
      // Only notify backend of size if session is connected
      // Otherwise, the server will use default size and we'll resize later
      if (terminal && session.status === "connected") {
        terminalStore.resize(session.terminalId, terminal.cols, terminal.rows);
      }
    }, 0);

    // Handle input from user
    terminal.onData((data) => {
      if (!isDisposed) {
        terminalStore.sendInput(session.terminalId, data);
      }
    });

    // Handle resize
    terminal.onResize(({ cols, rows }) => {
      if (!isDisposed) {
        terminalStore.resize(session.terminalId, cols, rows);
      }
    });

    // Subscribe to terminal output
    outputUnsubscribe = terminalStore.onOutput(session.terminalId, (_id, data) => {
      terminal?.write(data);
    });

    // Write any buffered output
    if (session.outputBuffer.length > 0) {
      terminal.write(session.outputBuffer.join(""));
    }

    // Setup resize observer
    resizeObserver = new ResizeObserver(() => {
      if (!isDisposed && fitAddon) {
        fitAddon.fit();
      }
    });
    resizeObserver.observe(containerRef);

    // Auto-focus if requested
    if (autoFocus) {
      terminal.focus();
    }
  });

  // Send initial resize when session becomes connected
  // This handles the case where the component mounted before the WebSocket was fully connected
  $effect(() => {
    if (session.status === "connected" && terminal && fitAddon && !isDisposed) {
      // Small delay to ensure xterm has rendered
      setTimeout(() => {
        fitAddon?.fit();
        if (terminal) {
          terminalStore.resize(session.terminalId, terminal.cols, terminal.rows);
        }
      }, 50);
    }
  });

  onDestroy(() => {
    isDisposed = true;

    // Clean up output subscription
    if (outputUnsubscribe) {
      outputUnsubscribe();
    }

    // Clean up resize observer
    if (resizeObserver) {
      resizeObserver.disconnect();
    }

    // Dispose terminal
    if (terminal) {
      terminal.dispose();
    }
  });

  // =============================================================================
  // Public Methods (for parent components)
  // =============================================================================

  export function focus(): void {
    terminal?.focus();
  }

  export function fit(): void {
    fitAddon?.fit();
  }

  export function clear(): void {
    terminal?.clear();
  }

  export function scrollToBottom(): void {
    terminal?.scrollToBottom();
  }
</script>

<div
  bind:this={containerRef}
  class="terminal-container {className}"
  role="application"
  aria-label="Terminal"
></div>

<style>
  .terminal-container {
    width: 100%;
    height: 100%;
    min-height: 200px;
    background-color: #0d0d14;
    border-radius: 4px;
    overflow: hidden;
    position: relative;
    border: 1px solid color-mix(in oklch, var(--cyber-cyan) 20%, transparent);
  }

  .terminal-container::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 1px;
    background: linear-gradient(
      90deg,
      transparent,
      var(--cyber-cyan) 20%,
      var(--cyber-cyan) 80%,
      transparent
    );
    opacity: 0.5;
    z-index: 1;
  }

  .terminal-container :global(.xterm) {
    padding: 0.75rem;
    height: 100%;
  }

  .terminal-container :global(.xterm-viewport) {
    overflow-y: auto !important;
  }

  .terminal-container :global(.xterm-screen) {
    height: 100% !important;
  }

  /* Cyberpunk scrollbar */
  .terminal-container :global(.xterm-viewport::-webkit-scrollbar) {
    width: 8px;
  }

  .terminal-container :global(.xterm-viewport::-webkit-scrollbar-track) {
    background: hsl(var(--background) / 0.5);
  }

  .terminal-container :global(.xterm-viewport::-webkit-scrollbar-thumb) {
    background: color-mix(in oklch, var(--cyber-cyan) 30%, transparent);
    border-radius: 4px;
  }

  .terminal-container :global(.xterm-viewport::-webkit-scrollbar-thumb:hover) {
    background: color-mix(in oklch, var(--cyber-cyan) 50%, transparent);
  }
</style>
