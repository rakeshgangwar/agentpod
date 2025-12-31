<script lang="ts">
  /**
   * DiffStats Component
   * 
   * Shows addition/deletion line counts with colored indicators.
   * Can be displayed inline or with a visual bar representation.
   */

  interface Props {
    additions: number;
    deletions: number;
    showBar?: boolean;
    compact?: boolean;
  }

  let { additions, deletions, showBar = false, compact = false }: Props = $props();

  // Calculate bar widths for visual representation
  let total = $derived(additions + deletions);
  let additionPercent = $derived(total > 0 ? (additions / total) * 100 : 0);
  let deletionPercent = $derived(total > 0 ? (deletions / total) * 100 : 0);
</script>

<div class="flex items-center gap-2 {compact ? 'text-xs' : 'text-sm'} font-mono">
  <!-- Addition count -->
  {#if additions > 0}
    <span class="text-[var(--cyber-emerald)]">
      +{additions}
    </span>
  {/if}

  <!-- Deletion count -->
  {#if deletions > 0}
    <span class="text-[var(--cyber-red)]">
      -{deletions}
    </span>
  {/if}

  <!-- No changes -->
  {#if additions === 0 && deletions === 0}
    <span class="text-muted-foreground">No changes</span>
  {/if}

  <!-- Visual bar (optional) -->
  {#if showBar && total > 0}
    <div class="flex h-2 w-16 rounded-sm overflow-hidden bg-muted/30">
      {#if additions > 0}
        <div 
          class="bg-[var(--cyber-emerald)]" 
          style="width: {additionPercent}%"
        ></div>
      {/if}
      {#if deletions > 0}
        <div 
          class="bg-[var(--cyber-red)]" 
          style="width: {deletionPercent}%"
        ></div>
      {/if}
    </div>
  {/if}
</div>
