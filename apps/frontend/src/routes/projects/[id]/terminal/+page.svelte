<script lang="ts">
  import { page } from "$app/stores";
  import { onMount, onDestroy } from "svelte";
  import { TerminalTabs } from "$lib/components/terminal";
  import * as terminalStore from "$lib/stores/terminals.svelte";
  import { sandboxes } from "$lib/stores/sandboxes.svelte";

  // =============================================================================
  // State
  // =============================================================================

  let sandboxId = $derived($page.params.id ?? "");
  let sandbox = $derived(sandboxId ? sandboxes.list.find(s => s.id === sandboxId) : undefined);
  let isRunning = $derived(sandbox?.status === "running");

  // =============================================================================
  // Lifecycle
  // =============================================================================

  onMount(async () => {
    // Initialize terminal listeners when entering terminal view
    await terminalStore.initTerminalListeners();
    
    // Sync terminals with backend state
    if (sandboxId) {
      await terminalStore.syncTerminals(sandboxId);
    }
  });

  onDestroy(() => {
    // Note: We don't cleanup listeners here because we want terminals to persist
    // during navigation. Cleanup happens when the app closes or user explicitly
    // disconnects all terminals.
  });
</script>

<div class="terminal-page">
  {#if !sandbox}
    <div class="status-message">
      <p class="text-muted-foreground">Loading sandbox...</p>
    </div>
  {:else if !isRunning}
    <div class="status-message">
      <div class="status-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-12 w-12 text-muted-foreground/50">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <h3 class="text-lg font-semibold">Sandbox Not Running</h3>
      <p class="text-sm text-muted-foreground">
        Start the sandbox to access the terminal.
      </p>
      <p class="text-xs text-muted-foreground mt-2">
        Current status: <span class="font-medium">{sandbox.status}</span>
      </p>
    </div>
  {:else}
    <TerminalTabs {sandboxId} class="h-full" />
  {/if}
</div>

<style>
  .terminal-page {
    height: calc(100vh - 300px);
    min-height: 400px;
    display: flex;
    flex-direction: column;
  }

  .status-message {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 1rem;
    text-align: center;
    padding: 2rem;
  }

  .status-icon {
    margin-bottom: 0.5rem;
  }
</style>
