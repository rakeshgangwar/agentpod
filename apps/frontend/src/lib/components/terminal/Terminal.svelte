<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { Terminal as XTerm } from "@xterm/xterm";
  import { FitAddon } from "@xterm/addon-fit";
  import { WebLinksAddon } from "@xterm/addon-web-links";
  import "@xterm/xterm/css/xterm.css";
  import * as terminalStore from "$lib/stores/terminals.svelte";
  import type { TerminalSession } from "$lib/stores/terminals.svelte";
  import { themeStore } from "$lib/themes/store.svelte";

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
  // Terminal Themes (Light & Dark)
  // =============================================================================

  // Dark theme - Catppuccin Mocha inspired with cyber accents
  const darkTheme = {
    background: "#0d0d14", // Deep dark matching cyber theme
    foreground: "#cdd6f4", // Light text
    cursor: "#00ffff", // Cyber cyan cursor
    cursorAccent: "#0d0d14",
    selectionBackground: "#585b70",
    selectionForeground: "#cdd6f4",
    black: "#45475a",
    red: "#f38ba8",
    green: "#00ff9d", // Cyber emerald
    yellow: "#f9e2af",
    blue: "#89b4fa",
    magenta: "#f5c2e7",
    cyan: "#00ffff", // Cyber cyan
    white: "#bac2de",
    brightBlack: "#585b70",
    brightRed: "#f38ba8",
    brightGreen: "#00ff9d",
    brightYellow: "#f9e2af",
    brightBlue: "#89b4fa",
    brightMagenta: "#f5c2e7",
    brightCyan: "#00ffff",
    brightWhite: "#a6adc8",
  };

  // Light theme - Clean and readable
  const lightTheme = {
    background: "#fafafa", // Light background
    foreground: "#1e1e2e", // Dark text
    cursor: "#0891b2", // Teal cursor for visibility
    cursorAccent: "#fafafa",
    selectionBackground: "#d4d4d8",
    selectionForeground: "#1e1e2e",
    black: "#27272a",
    red: "#dc2626",
    green: "#16a34a",
    yellow: "#ca8a04",
    blue: "#2563eb",
    magenta: "#c026d3",
    cyan: "#0891b2",
    white: "#e4e4e7",
    brightBlack: "#52525b",
    brightRed: "#ef4444",
    brightGreen: "#22c55e",
    brightYellow: "#eab308",
    brightBlue: "#3b82f6",
    brightMagenta: "#d946ef",
    brightCyan: "#06b6d4",
    brightWhite: "#f4f4f5",
  };

  // Reactive theme based on current mode
  let currentTheme = $derived(themeStore.isDark ? darkTheme : lightTheme);

  // =============================================================================
  // Lifecycle
  // =============================================================================

  onMount(() => {
    if (!containerRef) return;

    // Get the mono font from CSS variable, with fallbacks
    const computedStyle = getComputedStyle(document.documentElement);
    const monoFont = computedStyle.getPropertyValue('--font-mono').trim() || 'JetBrains Mono';
    const fontFamily = `${monoFont}, Menlo, Monaco, Consolas, monospace`;

    // Create terminal instance with current theme
    terminal = new XTerm({
      cursorBlink: true,
      cursorStyle: "bar",
      fontFamily,
      fontSize: 14,
      lineHeight: 1.2,
      theme: currentTheme,
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

  // Update terminal theme when light/dark mode changes
  $effect(() => {
    if (terminal && !isDisposed) {
      // Access currentTheme to create reactivity dependency
      const theme = currentTheme;
      terminal.options.theme = theme;
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
    background-color: hsl(var(--background));
    border-radius: 4px;
    overflow: hidden;
    position: relative;
    border: 1px solid hsl(var(--border) / 0.5);
  }

  /* Dark mode - use cyber accent glow */
  :global(.dark) .terminal-container {
    background-color: #0d0d14;
    border-color: color-mix(in oklch, var(--cyber-cyan) 20%, transparent);
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
      hsl(var(--primary)) 20%,
      hsl(var(--primary)) 80%,
      transparent
    );
    opacity: 0.3;
    z-index: 1;
  }

  /* Dark mode - use cyber cyan glow */
  :global(.dark) .terminal-container::before {
    background: linear-gradient(
      90deg,
      transparent,
      var(--cyber-cyan) 20%,
      var(--cyber-cyan) 80%,
      transparent
    );
    opacity: 0.5;
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

  /* Theme-aware scrollbar */
  .terminal-container :global(.xterm-viewport::-webkit-scrollbar) {
    width: 8px;
  }

  .terminal-container :global(.xterm-viewport::-webkit-scrollbar-track) {
    background: hsl(var(--muted) / 0.3);
  }

  .terminal-container :global(.xterm-viewport::-webkit-scrollbar-thumb) {
    background: hsl(var(--muted-foreground) / 0.3);
    border-radius: 4px;
  }

  .terminal-container :global(.xterm-viewport::-webkit-scrollbar-thumb:hover) {
    background: hsl(var(--muted-foreground) / 0.5);
  }

  /* Dark mode - use cyber cyan accent */
  :global(.dark) .terminal-container :global(.xterm-viewport::-webkit-scrollbar-thumb) {
    background: color-mix(in oklch, var(--cyber-cyan) 30%, transparent);
  }

  :global(.dark) .terminal-container :global(.xterm-viewport::-webkit-scrollbar-thumb:hover) {
    background: color-mix(in oklch, var(--cyber-cyan) 50%, transparent);
  }
</style>
