<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { stations, loadDetected, adopt, loadAdopted } from "$lib/stores/stations.svelte";
  import StationTree from "$lib/components/stations/StationTree.svelte";

  // params.id is always defined for this route
  const id = $derived($page.params.id as string);

  onMount(() => {
    loadDetected(id);
    loadAdopted(id);
  });

  async function handleAdopt(key: string) {
    await adopt(id, [key]);
  }

  async function handleAdoptAll() {
    const unadopted = stations.detected.filter((s) => !s.adopted);
    if (unadopted.length === 0) return;
    await adopt(id, unadopted.map((s) => s.key));
  }

  function isAlreadyAdopted(key: string): boolean {
    return stations.adopted.some((s) => s.stationKey === key);
  }
</script>

<h1>Node: {id}</h1>

<a href="/nodes">← Back to nodes</a>

{#if stations.error}
  <p class="error">{stations.error}</p>
{/if}

{#if stations.isLoading}
  <p>Loading…</p>
{/if}

<!-- Detected stations section -->
<section class="section">
  <div class="section-header">
    <h2>Detected Stations</h2>
    {#if stations.detected.filter((s) => !s.adopted).length > 0}
      <button
        onclick={handleAdoptAll}
        disabled={stations.isLoading}
        class="btn-secondary"
      >
        Adopt all
      </button>
    {/if}
  </div>

  {#if stations.detected.length === 0 && !stations.isLoading}
    <p class="empty-msg">No detected stations.</p>
  {:else}
    <ul class="station-list">
      {#each stations.detected as s (s.key)}
        <li class="station-item">
          <div class="station-info">
            <strong>{s.displayName}</strong>
            <span class="station-meta">{s.harness} · {s.kind}</span>
            {#if s.workspacePath}
              <code class="station-path">{s.workspacePath}</code>
            {/if}
          </div>
          {#if !isAlreadyAdopted(s.key)}
            <button
              onclick={() => handleAdopt(s.key)}
              disabled={stations.isLoading}
              class="btn-primary"
            >
              Adopt
            </button>
          {:else}
            <span class="adopted-badge">Adopted</span>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</section>

<!-- Adopted stations section -->
<section class="section">
  <h2>Adopted Stations</h2>

  {#if stations.adopted.length === 0 && !stations.isLoading}
    <p class="empty-msg">No stations adopted yet.</p>
  {:else}
    <StationTree stations={stations.adopted} nodeId={id} />
  {/if}
</section>

<style>
  h1 {
    font-size: 1.5rem;
    font-weight: 700;
    margin-bottom: 0.5rem;
  }

  h2 {
    font-size: 1.125rem;
    font-weight: 600;
  }

  .section {
    margin-top: 2rem;
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 0.75rem;
  }

  .station-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .station-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    border: 1px solid hsl(var(--border));
    border-radius: 6px;
    gap: 1rem;
  }

  .station-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .station-meta {
    font-size: 0.75rem;
    color: hsl(var(--muted-foreground));
  }

  .station-path {
    font-size: 0.75rem;
    color: hsl(var(--muted-foreground));
  }

  .btn-primary {
    padding: 0.375rem 0.75rem;
    font-size: 0.875rem;
    font-weight: 500;
    background-color: hsl(var(--primary));
    color: hsl(var(--primary-foreground));
    border: none;
    border-radius: 4px;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-secondary {
    padding: 0.375rem 0.75rem;
    font-size: 0.875rem;
    font-weight: 500;
    background-color: hsl(var(--secondary));
    color: hsl(var(--secondary-foreground));
    border: 1px solid hsl(var(--border));
    border-radius: 4px;
    cursor: pointer;
  }

  .btn-secondary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .adopted-badge {
    font-size: 0.75rem;
    color: hsl(var(--muted-foreground));
    white-space: nowrap;
    flex-shrink: 0;
  }

  .empty-msg {
    font-size: 0.875rem;
    color: hsl(var(--muted-foreground));
  }

  .error {
    color: hsl(var(--destructive));
    font-size: 0.875rem;
  }

  a {
    font-size: 0.875rem;
    color: hsl(var(--muted-foreground));
    text-decoration: none;
  }

  a:hover {
    text-decoration: underline;
  }
</style>
