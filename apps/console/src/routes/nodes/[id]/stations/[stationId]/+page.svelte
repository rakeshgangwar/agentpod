<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import HealthPanel from "$lib/components/stations/HealthPanel.svelte";
  import LogTail from "$lib/components/stations/LogTail.svelte";
  import FileBrowser from "$lib/components/stations/FileBrowser.svelte";
  import Terminal from "$lib/components/stations/Terminal.svelte";
  import { listStations } from "$lib/api/client";
  import type { StationRow } from "$lib/api/client";

  const nodeId = $derived($page.params.id as string);
  const stationId = $derived($page.params.stationId as string);

  type Tab = "health" | "logs" | "files" | "terminal";
  let activeTab = $state<Tab>("health");

  let station = $state<StationRow | null>(null);

  const hasTerminal = $derived(
    Array.isArray(station?.capabilities) && station!.capabilities.includes("terminal")
  );

  const canWrite = $derived(
    Array.isArray(station?.capabilities) && station!.capabilities.includes("fs.write")
  );

  onMount(async () => {
    try {
      const rows = await listStations(nodeId);
      station = rows.find((r) => r.id === stationId) ?? null;
    } catch {
      // Capabilities will stay null — Terminal tab won't appear
    }
  });
</script>

<div class="station-page">
  <header class="page-header">
    <a href="/nodes/{nodeId}" class="back-link">← Back to node</a>
    <h1>Station: <code>{stationId}</code></h1>
  </header>

  <!-- Tab bar -->
  <nav class="tab-bar" aria-label="Station panels">
    <button
      type="button"
      class="tab-btn {activeTab === 'health' ? 'active' : ''}"
      onclick={() => (activeTab = "health")}
    >
      Health
    </button>
    <button
      type="button"
      class="tab-btn {activeTab === 'logs' ? 'active' : ''}"
      onclick={() => (activeTab = "logs")}
    >
      Logs
    </button>
    <button
      type="button"
      class="tab-btn {activeTab === 'files' ? 'active' : ''}"
      onclick={() => (activeTab = "files")}
    >
      Files
    </button>
    {#if hasTerminal}
      <button
        type="button"
        class="tab-btn {activeTab === 'terminal' ? 'active' : ''}"
        onclick={() => (activeTab = "terminal")}
      >
        Terminal
      </button>
    {/if}
  </nav>

  <!-- Panel content -->
  <div class="panel-content">
    {#if activeTab === "health"}
      <HealthPanel {stationId} />
    {:else if activeTab === "logs"}
      <div class="logs-wrap">
        <LogTail {stationId} />
      </div>
    {:else if activeTab === "files"}
      <div class="files-wrap">
        <FileBrowser {stationId} {canWrite} />
      </div>
    {:else if activeTab === "terminal" && hasTerminal}
      <div class="terminal-wrap">
        <Terminal {stationId} />
      </div>
    {/if}
  </div>
</div>

<style>
  .station-page {
    max-width: 960px;
    margin: 0 auto;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .page-header {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .back-link {
    font-size: 0.875rem;
    color: hsl(var(--muted-foreground));
    text-decoration: none;
  }

  .back-link:hover {
    text-decoration: underline;
  }

  h1 {
    font-size: 1.25rem;
    font-weight: 600;
    margin: 0;
  }

  h1 code {
    font-size: 1rem;
    font-family: var(--font-mono), ui-monospace, monospace;
    background-color: hsl(var(--muted));
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
  }

  .tab-bar {
    display: flex;
    gap: 0;
    border-bottom: 1px solid hsl(var(--border));
  }

  .tab-btn {
    padding: 0.5rem 1rem;
    font-size: 0.875rem;
    font-weight: 500;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    cursor: pointer;
    color: hsl(var(--muted-foreground));
    transition: color 0.15s, border-color 0.15s;
    margin-bottom: -1px;
  }

  .tab-btn:hover {
    color: hsl(var(--foreground));
  }

  .tab-btn.active {
    color: hsl(var(--foreground));
    border-bottom-color: hsl(var(--primary));
  }

  .panel-content {
    flex: 1;
  }

  .logs-wrap {
    height: 480px;
  }

  .files-wrap {
    height: 480px;
  }

  .terminal-wrap {
    height: 480px;
  }
</style>
