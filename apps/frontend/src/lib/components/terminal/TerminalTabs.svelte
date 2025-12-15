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
        class="new-terminal-btn"
        onclick={handleNewTerminal}
        disabled={isConnecting}
      >
        {#if isConnecting}
          <Loader2 class="h-4 w-4 animate-spin" />
        {:else}
          <Plus class="h-4 w-4" />
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
          variant="default"
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
          <AlertCircle class="h-6 w-6 text-red-500" />
          <p class="error-text">{activeSession.error}</p>
          <Button variant="outline" onclick={() => handleReconnect(activeSession.terminalId)}>
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
    height: 100%;
    background-color: hsl(var(--background));
  }

  .tab-bar {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.5rem;
    background-color: hsl(var(--muted));
    border-bottom: 1px solid hsl(var(--border));
  }

  .tabs {
    display: flex;
    gap: 0.25rem;
    overflow-x: auto;
    flex: 1;
  }

  .tab {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 0.75rem;
    font-size: 0.875rem;
    color: hsl(var(--muted-foreground));
    background-color: transparent;
    border: none;
    border-radius: 0.375rem;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.15s ease;
  }

  .tab:hover {
    background-color: hsl(var(--accent));
    color: hsl(var(--accent-foreground));
  }

  .tab.active {
    background-color: hsl(var(--background));
    color: hsl(var(--foreground));
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
  }

  .tab.error {
    color: hsl(var(--destructive));
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
    padding: 0.125rem;
    color: inherit;
    opacity: 0.5;
    background: transparent;
    border: none;
    border-radius: 0.25rem;
    cursor: pointer;
    transition: opacity 0.15s ease;
  }

  .close-btn:hover {
    opacity: 1;
    background-color: hsl(var(--destructive) / 0.1);
    color: hsl(var(--destructive));
  }

  .new-terminal-btn {
    flex-shrink: 0;
  }

  .terminal-content {
    flex: 1;
    min-height: 0;
    position: relative;
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
  }

  .empty-icon {
    margin-bottom: 1rem;
    opacity: 0.5;
  }

  .empty-title {
    font-size: 1.125rem;
    font-weight: 600;
    color: hsl(var(--foreground));
    margin-bottom: 0.5rem;
  }

  .empty-description {
    font-size: 0.875rem;
    margin-bottom: 1.5rem;
  }

  .error-message {
    margin-top: 1rem;
    font-size: 0.875rem;
    color: hsl(var(--destructive));
  }

  .error-overlay {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    height: 100%;
    padding: 2rem;
    background-color: hsl(var(--muted) / 0.5);
  }

  .error-text {
    font-size: 0.875rem;
    color: hsl(var(--muted-foreground));
    text-align: center;
    max-width: 300px;
  }
</style>
