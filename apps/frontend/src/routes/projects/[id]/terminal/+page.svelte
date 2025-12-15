<script lang="ts">
  import { page } from "$app/stores";
  import { onMount, onDestroy } from "svelte";
  import { TerminalTabs } from "$lib/components/terminal";
  import * as terminalStore from "$lib/stores/terminals.svelte";
  import { sandboxes } from "$lib/stores/sandboxes.svelte";
  import SandboxNotRunning from "$lib/components/sandbox-not-running.svelte";

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

{#if !sandbox}
  <!-- Loading State -->
  <div class="h-[calc(100vh-140px)] min-h-[500px] flex items-center justify-center animate-fade-in">
    <div class="text-center animate-fade-in-up">
      <div class="relative mx-auto w-16 h-16">
        <div class="absolute inset-0 rounded-full border-2 border-[var(--cyber-cyan)]/20"></div>
        <div class="absolute inset-0 rounded-full border-2 border-transparent border-t-[var(--cyber-cyan)] animate-spin"></div>
        <div class="absolute inset-0 flex items-center justify-center">
          <div class="w-2 h-2 rounded-full bg-[var(--cyber-cyan)] animate-pulse-dot"></div>
        </div>
      </div>
      <p class="mt-6 text-sm font-mono text-muted-foreground tracking-wider uppercase">
        Loading sandbox<span class="typing-cursor"></span>
      </p>
    </div>
  </div>
{:else if !isRunning}
  <!-- Not Running State -->
  <SandboxNotRunning {sandbox} icon="⌨" actionText="access the terminal" />
{:else}
  <!-- Terminal Content -->
  <div class="animate-fade-in">
    <div class="cyber-card corner-accent overflow-hidden">
      <TerminalTabs {sandboxId} />
    </div>
  </div>
{/if}
