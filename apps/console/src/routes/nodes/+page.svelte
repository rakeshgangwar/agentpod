<script lang="ts">
  import { onMount } from "svelte";
  import { nodes, fetchNodes } from "$lib/stores/nodes.svelte";
  import { createEnrollmentToken } from "$lib/api/client";
  let lastToken = $state<string | null>(null);
  onMount(fetchNodes);
  async function mint() { lastToken = (await createEnrollmentToken()).token; }
</script>

<h1>Nodes</h1>
<button onclick={mint}>Create enrollment token</button>
{#if lastToken}<code>agentpod-node enroll --hub http://localhost:3001 --token {lastToken}</code>{/if}

{#if nodes.isLoading}<p>Loading…</p>
{:else if nodes.error}<p class="error">{nodes.error}</p>
{:else}
  <ul>
    {#each nodes.list as n (n.id)}
      <li><strong>{n.hostname}</strong> — {n.os}/{n.arch} · {n.cpuCount} CPU · <em>{n.status}</em></li>
    {/each}
  </ul>
{/if}
