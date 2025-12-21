<script lang="ts">
  import { page } from "$app/stores";
  import { Button } from "$lib/components/ui/button";
  import { Label } from "$lib/components/ui/label";
  import { Input } from "$lib/components/ui/input";
  import { CodeBlock } from "$lib/components/ui/code-block";
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import { RefreshCw, Circle } from "@lucide/svelte";
  import { getSandboxLogs, sandboxes } from "$lib/stores/sandboxes.svelte";
  import SandboxNotRunning from "$lib/components/sandbox-not-running.svelte";

  // Get sandbox ID from route params
  let sandboxId = $derived($page.params.id ?? "");

  // Get sandbox and check if running
  let sandbox = $derived(sandboxId ? sandboxes.list.find(s => s.id === sandboxId) : undefined);
  let isRunning = $derived(sandbox?.status === "running");

  // Logs state
  let logs = $state<string>("");
  let isLoading = $state(false);
  let error = $state<string | null>(null);
  let lines = $state(100);
  let autoRefresh = $state(false);
  let refreshInterval: ReturnType<typeof setInterval> | null = null;

  // Load logs
  async function loadLogs() {
    if (!sandboxId) return;

    isLoading = true;
    error = null;

    try {
      const result = await getSandboxLogs(sandboxId, lines);
      logs = result ?? "";
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load logs";
      logs = "";
    } finally {
      isLoading = false;
    }
  }

  // Initial load
  $effect(() => {
    if (sandboxId) {
      loadLogs();
    }
  });

  // Auto-refresh
  $effect(() => {
    if (autoRefresh && sandboxId) {
      refreshInterval = setInterval(loadLogs, 5000);
    } else if (refreshInterval) {
      clearInterval(refreshInterval);
      refreshInterval = null;
    }

    return () => {
      if (refreshInterval) {
        clearInterval(refreshInterval);
      }
    };
  });

  // Handle lines change
  function handleLinesChange(event: Event) {
    const target = event.target as HTMLInputElement;
    const value = parseInt(target.value, 10);
    if (value >= 1 && value <= 1000) {
      lines = value;
    }
  }
</script>

{#if !sandbox}
  <!-- Loading State -->
  <div class="h-[calc(100vh-140px)] min-h-[500px] flex items-center justify-center animate-fade-in">
    <div class="text-center animate-fade-in-up">
      <div class="relative mx-auto w-16 h-16">
        <div class="absolute inset-0 rounded-full border-2 border-[var(--cyber-cyan)]/20"></div>
        <div class="absolute inset-0 rounded-full border-2 border-transparent border-t-[var(--cyber-cyan)] animate-spin"></div>
      </div>
      <p class="mt-6 text-sm font-mono text-muted-foreground tracking-wider uppercase">
        Loading sandbox<span class="typing-cursor"></span>
      </p>
    </div>
  </div>
{:else if !isRunning}
  <SandboxNotRunning {sandbox} icon="📋" actionText="view logs" />
{:else}
  <div class="space-y-4 animate-fade-in">
  <!-- Controls Card -->
  <div class="cyber-card corner-accent p-4">
    <div class="flex flex-wrap items-center gap-4">
      <div class="flex items-center gap-2">
        <Label for="lines" class="font-mono text-xs uppercase tracking-wider text-muted-foreground">
          Lines:
        </Label>
        <Input
          id="lines"
          type="number"
          min="1"
          max="1000"
          value={lines}
          onchange={handleLinesChange}
          class="w-24 h-8 font-mono text-sm bg-background/50 border-border/50
                 focus:border-[var(--cyber-cyan)] focus:ring-1 focus:ring-[var(--cyber-cyan)]"
        />
      </div>

      <Button
        variant="outline"
        size="sm"
        onclick={loadLogs}
        disabled={isLoading}
        class="h-8 px-4 font-mono text-xs uppercase tracking-wider border-border/50
               hover:border-[var(--cyber-cyan)]/50 hover:text-[var(--cyber-cyan)] flex items-center gap-2"
      >
        <RefreshCw class="h-3 w-3 {isLoading ? 'animate-spin' : ''}" />
        {isLoading ? "Loading..." : "Refresh"}
      </Button>

      <Button
        size="sm"
        onclick={() => autoRefresh = !autoRefresh}
        class="h-8 px-4 font-mono text-xs uppercase tracking-wider flex items-center gap-2
               {autoRefresh
                 ? 'bg-[var(--cyber-emerald)] hover:bg-[var(--cyber-emerald)]/90 text-[var(--cyber-emerald-foreground)]'
                 : 'bg-transparent border border-border/50 hover:border-[var(--cyber-emerald)]/50 hover:text-[var(--cyber-emerald)]'}"
      >
        <Circle class="h-2.5 w-2.5 {autoRefresh ? 'fill-current' : ''}" />
        Auto {autoRefresh ? "ON" : "OFF"}
      </Button>

      {#if autoRefresh}
        <span class="text-xs font-mono text-[var(--cyber-emerald)]">
          Refreshing every 5s
        </span>
      {/if}
    </div>
  </div>

  <!-- Logs Display Card -->
  <div class="cyber-card corner-accent overflow-hidden">
    <!-- Header -->
    <div class="py-3 px-4 border-b border-border/30 bg-background/30 backdrop-blur-sm">
      <div class="flex items-center justify-between">
        <h3 class="font-mono text-xs uppercase tracking-wider text-[var(--cyber-cyan)]">
          [container_logs]
        </h3>
        {#if logs}
          <span class="text-xs font-mono text-muted-foreground">
            {logs.split('\n').length} lines
          </span>
        {/if}
      </div>
    </div>

    <!-- Content -->
    <div class="bg-black/20">
      {#if error}
        <div class="p-4">
          <div class="p-4 rounded border border-[var(--cyber-red)]/50 bg-[var(--cyber-red)]/5">
            <span class="font-mono text-xs uppercase tracking-wider text-[var(--cyber-red)]">[error]</span>
            <p class="text-sm text-[var(--cyber-red)] mt-2">{error}</p>
          </div>
        </div>
      {:else if isLoading && !logs}
        <div class="flex items-center justify-center py-16">
          <div class="text-center animate-fade-in-up">
            <div class="relative mx-auto w-12 h-12">
              <div class="absolute inset-0 rounded-full border-2 border-[var(--cyber-cyan)]/20"></div>
              <div class="absolute inset-0 rounded-full border-2 border-transparent border-t-[var(--cyber-cyan)] animate-spin"></div>
            </div>
            <p class="mt-4 text-sm font-mono text-muted-foreground tracking-wider uppercase">
              Loading logs<span class="typing-cursor"></span>
            </p>
          </div>
        </div>
      {:else if logs}
        <ScrollArea class="h-[500px] w-full">
          <div class="p-1">
            <CodeBlock
              code={logs}
              language="log"
              class="text-xs"
            />
          </div>
        </ScrollArea>
      {:else}
        <div class="flex items-center justify-center py-16">
          <div class="text-center animate-fade-in-up">
            <div class="font-mono text-4xl text-[var(--cyber-cyan)]/20 mb-4">[ ]</div>
            <p class="text-sm font-mono text-muted-foreground">No logs available</p>
            <p class="text-xs font-mono text-muted-foreground/70 mt-2">
              The container may not be running or hasn't produced any output yet
            </p>
          </div>
        </div>
      {/if}
    </div>
  </div>

  <!-- Help text -->
  <p class="text-xs font-mono text-muted-foreground/70">
    Logs are retrieved from the container's stdout/stderr. Use the Restart button in the header to rebuild the container if needed.
  </p>
</div>
{/if}
