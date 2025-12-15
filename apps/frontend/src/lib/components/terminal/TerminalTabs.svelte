<script lang="ts">
  import { Plus, X, AlertCircle, Loader2, RefreshCw } from "@lucide/svelte";
  import Terminal from "./Terminal.svelte";
  import * as terminalStore from "$lib/stores/terminals.svelte";
  import type { TerminalSession } from "$lib/stores/terminals.svelte";
  import { Button } from "$lib/components/ui/button";

  // =============================================================================
  // Props
  // =============================================================================

  interface Props {
    /** Sandbox ID to manage terminals for */
    sandboxId: string;
    /** Custom class name */
    class?: string;
  }

  let { sandboxId, class: className = "" }: Props = $props();

  // =============================================================================
  // Derived State
  // =============================================================================

  let sessions = $derived(terminalStore.getTerminalsForSandbox(sandboxId));
  let activeId = $derived(terminalStore.terminals.activeId);
  let activeSession = $derived(sessions.find(s => s.terminalId === activeId) ?? sessions[0] ?? null);
  let isConnecting = $derived(terminalStore.terminals.isConnecting);
  let canCreateMore = $derived(terminalStore.canCreateTerminal(sandboxId));
  let error = $derived(terminalStore.terminals.error);

  // =============================================================================
  // Handlers
  // =============================================================================

  async function handleNewTerminal(): Promise<void> {
    await terminalStore.connectTerminal(sandboxId);
  }

  async function handleCloseTerminal(e: Event, terminalId: string): Promise<void> {
    e.stopPropagation();
    await terminalStore.disconnectTerminal(terminalId);
  }

  function handleSelectTerminal(terminalId: string): void {
    terminalStore.setActiveTerminal(terminalId);
  }

  async function handleReconnect(terminalId: string): Promise<void> {
    await terminalStore.manualReconnect(terminalId);
  }

  function getStatusIcon(session: TerminalSession): typeof Loader2 | typeof AlertCircle | null {
    if (session.status === "connecting") return Loader2;
    if (session.status === "error") return AlertCircle;
    return null;
  }

  function getTabLabel(session: TerminalSession, index: number): string {
    const shell = session.shell?.split("/").pop() ?? "shell";
    return `${shell} (${index + 1})`;
  }
</script>

<div class="terminal-tabs {className}">
  <!-- Tab Bar -->
  <div class="tab-bar">
    <div class="tabs">
      {#each sessions as session, index (session.terminalId)}
        {@const isActive = session.terminalId === activeSession?.terminalId}
        {@const StatusIcon = getStatusIcon(session)}
        <div
          class="tab"
          class:active={isActive}
          class:error={session.status === "error"}
          role="tab"
          tabindex="0"
          aria-selected={isActive}
          onclick={() => handleSelectTerminal(session.terminalId)}
          onkeydown={(e) => e.key === "Enter" && handleSelectTerminal(session.terminalId)}
          title={session.shell ?? "Terminal"}
        >
          {#if StatusIcon}
            <StatusIcon class="h-3 w-3 {session.status === 'connecting' ? 'animate-spin' : ''}" />
          {/if}
          <span class="tab-label">{getTabLabel(session, index)}</span>
          <button
            class="close-btn"
            onclick={(e) => handleCloseTerminal(e, session.terminalId)}
            title="Close terminal"
          >
            <X class="h-3 w-3" />
          </button>
        </div>
      {/each}
    </div>

    <!-- New Terminal Button -->
    {#if canCreateMore}
      <Button
        variant="ghost"
        size="sm"
        class="new-terminal-btn h-7 w-7 p-0 border border-[var(--cyber-cyan)]/30 bg-[var(--cyber-cyan)]/5 hover:bg-[var(--cyber-cyan)]/15 hover:border-[var(--cyber-cyan)]/50 transition-all"
        onclick={handleNewTerminal}
        disabled={isConnecting}
      >
        {#if isConnecting}
          <Loader2 class="h-3.5 w-3.5 animate-spin text-[var(--cyber-cyan)]" />
        {:else}
          <Plus class="h-3.5 w-3.5 text-[var(--cyber-cyan)]" />
        {/if}
        <span class="sr-only">New Terminal</span>
      </Button>
    {/if}
  </div>

  <!-- Terminal Content -->
  <div class="terminal-content">
    {#if sessions.length === 0}
      <!-- Empty State -->
      <div class="empty-state">
        <div class="empty-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-12 w-12">
            <polyline points="4 17 10 11 4 5" />
            <line x1="12" y1="19" x2="20" y2="19" />
          </svg>
        </div>
        <h3 class="empty-title">No Terminal Sessions</h3>
        <p class="empty-description">
          Open a terminal to access the sandbox shell.
        </p>
        <Button
          class="font-mono text-xs uppercase tracking-wider bg-[var(--cyber-cyan)] hover:bg-[var(--cyber-cyan)]/90 text-black px-4 py-2"
          onclick={handleNewTerminal}
          disabled={isConnecting}
        >
          {#if isConnecting}
            <Loader2 class="h-4 w-4 animate-spin mr-2" />
            Connecting...
          {:else}
            <Plus class="h-4 w-4 mr-2" />
            New Terminal
          {/if}
        </Button>
        {#if error}
          <p class="error-message">{error}</p>
        {/if}
      </div>
    {:else if activeSession}
      <!-- Active Terminal -->
      {#if activeSession.status === "error" && activeSession.error}
        <div class="error-overlay">
          <AlertCircle class="h-6 w-6 text-[var(--cyber-red)]" />
          <p class="error-text">{activeSession.error}</p>
          <Button 
            class="font-mono text-xs uppercase tracking-wider border border-[var(--cyber-cyan)]/50 bg-transparent hover:bg-[var(--cyber-cyan)]/10 text-[var(--cyber-cyan)]"
            onclick={() => handleReconnect(activeSession.terminalId)}
          >
            <RefreshCw class="h-4 w-4 mr-2" />
            Reconnect
          </Button>
        </div>
      {:else}
        <Terminal session={activeSession} autoFocus={true} />
      {/if}
    {/if}
  </div>
</div>

<style>
  .terminal-tabs {
    display: flex;
    flex-direction: column;
    height: calc(100vh - 300px);
    min-height: 400px;
    background-color: #0d0d14;
    font-family: var(--font-mono), ui-monospace, monospace;
  }

  .tab-bar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: linear-gradient(180deg, rgba(13, 13, 20, 0.95) 0%, rgba(20, 20, 30, 0.9) 100%);
    border-bottom: 1px solid color-mix(in oklch, var(--cyber-cyan) 20%, transparent);
    position: relative;
  }

  .tab-bar::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, color-mix(in oklch, var(--cyber-cyan) 50%, transparent) 20%, color-mix(in oklch, var(--cyber-cyan) 50%, transparent) 80%, transparent);
  }

  .tabs {
    display: flex;
    gap: 0.375rem;
    overflow-x: auto;
    flex: 1;
    scrollbar-width: none;
  }

  .tabs::-webkit-scrollbar {
    display: none;
  }

  .tab {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.875rem;
    font-size: 0.75rem;
    font-family: var(--font-mono), ui-monospace, monospace;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: hsl(var(--muted-foreground));
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 4px;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.2s ease;
    position: relative;
  }

  .tab:hover {
    background: color-mix(in oklch, var(--cyber-cyan) 8%, transparent);
    border-color: color-mix(in oklch, var(--cyber-cyan) 30%, transparent);
    color: var(--cyber-cyan);
  }

  .tab.active {
    background: color-mix(in oklch, var(--cyber-cyan) 12%, transparent);
    border-color: color-mix(in oklch, var(--cyber-cyan) 50%, transparent);
    color: var(--cyber-cyan);
    box-shadow: 0 0 12px color-mix(in oklch, var(--cyber-cyan) 15%, transparent),
                inset 0 1px 0 color-mix(in oklch, var(--cyber-cyan) 10%, transparent);
  }

  .tab.active::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--cyber-cyan) 50%, transparent);
  }

  .tab.error {
    color: var(--cyber-red);
    border-color: color-mix(in oklch, var(--cyber-red) 30%, transparent);
  }

  .tab.error.active {
    background: color-mix(in oklch, var(--cyber-red) 10%, transparent);
    border-color: color-mix(in oklch, var(--cyber-red) 50%, transparent);
  }

  .tab-label {
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.25rem;
    color: inherit;
    opacity: 0.4;
    background: transparent;
    border: none;
    border-radius: 3px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .close-btn:hover {
    opacity: 1;
    background: color-mix(in oklch, var(--cyber-red) 20%, transparent);
    color: var(--cyber-red);
  }

  .new-terminal-btn {
    flex-shrink: 0;
  }

  .terminal-content {
    flex: 1;
    min-height: 0;
    position: relative;
    background: #0d0d14;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    padding: 2rem;
    text-align: center;
    color: hsl(var(--muted-foreground));
    background: radial-gradient(ellipse at center, color-mix(in oklch, var(--cyber-cyan) 3%, transparent) 0%, transparent 70%);
  }

  .empty-icon {
    margin-bottom: 1.5rem;
    color: color-mix(in oklch, var(--cyber-cyan) 40%, transparent);
    filter: drop-shadow(0 0 8px color-mix(in oklch, var(--cyber-cyan) 30%, transparent));
  }

  .empty-title {
    font-size: 0.875rem;
    font-weight: 500;
    font-family: var(--font-mono), ui-monospace, monospace;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--cyber-cyan);
    margin-bottom: 0.5rem;
  }

  .empty-description {
    font-size: 0.8125rem;
    font-family: var(--font-mono), ui-monospace, monospace;
    margin-bottom: 1.5rem;
    opacity: 0.6;
  }

  .error-message {
    margin-top: 1rem;
    font-size: 0.75rem;
    font-family: var(--font-mono), ui-monospace, monospace;
    color: var(--cyber-red);
    padding: 0.5rem 1rem;
    background: color-mix(in oklch, var(--cyber-red) 10%, transparent);
    border: 1px solid color-mix(in oklch, var(--cyber-red) 30%, transparent);
    border-radius: 4px;
  }

  .error-overlay {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    height: 100%;
    padding: 2rem;
    background: linear-gradient(180deg, rgba(13, 13, 20, 0.98) 0%, rgba(30, 15, 15, 0.95) 100%);
    border: 1px solid color-mix(in oklch, var(--cyber-red) 30%, transparent);
    position: relative;
  }

  .error-overlay::before {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse at center, color-mix(in oklch, var(--cyber-red) 5%, transparent) 0%, transparent 70%);
    pointer-events: none;
  }

  .error-text {
    font-size: 0.8125rem;
    font-family: var(--font-mono), ui-monospace, monospace;
    color: hsl(var(--muted-foreground));
    text-align: center;
    max-width: 300px;
    line-height: 1.5;
  }
</style>
