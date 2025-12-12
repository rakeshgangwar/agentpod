<script lang="ts">
  import { page } from "$app/stores";
  import { getSandboxLogs } from "$lib/stores/sandboxes.svelte";
  import { Button } from "$lib/components/ui/button";
  import { Label } from "$lib/components/ui/label";
  import { Input } from "$lib/components/ui/input";
  import { CodeBlock } from "$lib/components/ui/code-block";
  import * as Card from "$lib/components/ui/card";
  import { ScrollArea } from "$lib/components/ui/scroll-area";

  // Get sandbox ID from route params
  let sandboxId = $derived($page.params.id ?? "");

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

<div class="space-y-4">
  <!-- Controls -->
  <Card.Root>
    <Card.Content class="pt-4">
      <div class="flex flex-wrap items-center gap-4">
        <div class="flex items-center gap-2">
          <Label for="lines" class="whitespace-nowrap">Lines:</Label>
          <Input 
            id="lines"
            type="number" 
            min="1" 
            max="1000"
            value={lines}
            onchange={handleLinesChange}
            class="w-24"
          />
        </div>
        
        <Button 
          variant="outline" 
          size="sm"
          onclick={loadLogs}
          disabled={isLoading}
        >
          {isLoading ? "Loading..." : "Refresh"}
        </Button>
        
        <Button 
          variant={autoRefresh ? "default" : "outline"}
          size="sm"
          onclick={() => autoRefresh = !autoRefresh}
        >
          {autoRefresh ? "Auto-refresh ON" : "Auto-refresh OFF"}
        </Button>
        
        {#if autoRefresh}
          <span class="text-xs text-muted-foreground">Refreshing every 5s</span>
        {/if}
      </div>
    </Card.Content>
  </Card.Root>

  <!-- Logs Display -->
  <Card.Root>
    <Card.Header class="pb-2">
      <Card.Title class="text-base flex items-center justify-between">
        <span>Container Logs</span>
        {#if logs}
          <span class="text-xs font-normal text-muted-foreground">
            {logs.split('\n').length} lines
          </span>
        {/if}
      </Card.Title>
    </Card.Header>
    <Card.Content>
      {#if error}
        <div class="text-sm p-4 rounded-md bg-destructive/10 text-destructive">
          {error}
        </div>
      {:else if isLoading && !logs}
        <div class="flex items-center justify-center py-12">
          <div class="text-center">
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            <p class="mt-2 text-sm text-muted-foreground">Loading logs...</p>
          </div>
        </div>
      {:else if logs}
        <ScrollArea class="h-[500px] w-full rounded-md border">
          <div class="p-1">
            <CodeBlock 
              code={logs} 
              language="log"
              class="text-xs"
            />
          </div>
        </ScrollArea>
      {:else}
        <div class="text-center py-12 text-muted-foreground">
          <p>No logs available</p>
          <p class="text-xs mt-1">The container may not be running or hasn't produced any output yet.</p>
        </div>
      {/if}
    </Card.Content>
  </Card.Root>

  <!-- Help text -->
  <p class="text-xs text-muted-foreground">
    Logs are retrieved from the container's stdout/stderr. Use the Deploy button in the header to rebuild the container if needed.
  </p>
</div>
