<script lang="ts">
  /**
   * DiffHunk Component
   * 
   * Renders a single diff hunk (chunk of changes) with a header
   * showing the line range and all the diff lines.
   */

  import DiffLine from "./DiffLine.svelte";

  type DiffLineType = "context" | "addition" | "deletion";

  interface DiffLineData {
    type: DiffLineType;
    content: string;
    oldLineNumber?: number;
    newLineNumber?: number;
  }

  interface DiffHunkData {
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
    lines: DiffLineData[];
  }

  interface Props {
    hunk: DiffHunkData;
    showLineNumbers?: boolean;
    initialCollapsed?: boolean;
  }

  let { hunk, showLineNumbers = true, initialCollapsed = false }: Props = $props();

  // Local collapse state
  let isCollapsed = $state(false);
  
  // Sync with initial prop value
  $effect(() => {
    isCollapsed = initialCollapsed;
  });

  // Generate hunk header like "@@ -15,7 +15,10 @@"
  let hunkHeader = $derived(() => {
    const oldRange = hunk.oldLines === 1 
      ? `${hunk.oldStart}` 
      : `${hunk.oldStart},${hunk.oldLines}`;
    const newRange = hunk.newLines === 1 
      ? `${hunk.newStart}` 
      : `${hunk.newStart},${hunk.newLines}`;
    return `@@ -${oldRange} +${newRange} @@`;
  });

  // Count changes in this hunk
  let changeStats = $derived(() => {
    let additions = 0;
    let deletions = 0;
    for (const line of hunk.lines) {
      if (line.type === "addition") additions++;
      else if (line.type === "deletion") deletions++;
    }
    return { additions, deletions };
  });
</script>

<div class="border border-border/30 rounded-md overflow-hidden">
  <!-- Hunk Header -->
  <button
    type="button"
    onclick={() => isCollapsed = !isCollapsed}
    class="w-full flex items-center justify-between gap-3 px-3 py-1.5 
           bg-[var(--cyber-cyan)]/5 border-b border-border/20
           hover:bg-[var(--cyber-cyan)]/10 transition-colors
           text-left cursor-pointer"
  >
    <span class="font-mono text-xs text-[var(--cyber-cyan)]">
      {hunkHeader()}
    </span>
    <div class="flex items-center gap-2 text-xs font-mono">
      {#if changeStats().additions > 0}
        <span class="text-[var(--cyber-emerald)]">+{changeStats().additions}</span>
      {/if}
      {#if changeStats().deletions > 0}
        <span class="text-[var(--cyber-red)]">-{changeStats().deletions}</span>
      {/if}
      <span class="text-muted-foreground/50">
        {isCollapsed ? "▶" : "▼"}
      </span>
    </div>
  </button>

  <!-- Hunk Lines -->
  {#if !isCollapsed}
    <div class="divide-y divide-border/10">
      {#each hunk.lines as line}
        <DiffLine {line} {showLineNumbers} />
      {/each}
    </div>
  {/if}
</div>
