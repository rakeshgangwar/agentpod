<script lang="ts">
  /**
   * DiffHunkSideBySide Component
   * 
   * Renders a diff hunk in side-by-side (split) view format.
   * Left side shows old content, right side shows new content.
   */

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

  interface SplitLine {
    left: { lineNumber?: number; content: string; type: "context" | "deletion" | "empty" };
    right: { lineNumber?: number; content: string; type: "context" | "addition" | "empty" };
  }

  interface Props {
    hunk: DiffHunkData;
    initialCollapsed?: boolean;
  }

  let { hunk, initialCollapsed = false }: Props = $props();

  // Local collapse state
  let isCollapsed = $state(false);
  
  $effect(() => {
    isCollapsed = initialCollapsed;
  });

  // Generate hunk header
  let hunkHeader = $derived.by(() => {
    const oldRange = hunk.oldLines === 1 
      ? `${hunk.oldStart}` 
      : `${hunk.oldStart},${hunk.oldLines}`;
    const newRange = hunk.newLines === 1 
      ? `${hunk.newStart}` 
      : `${hunk.newStart},${hunk.newLines}`;
    return `@@ -${oldRange} +${newRange} @@`;
  });

  // Convert unified diff lines to side-by-side format
  let splitLines = $derived.by<SplitLine[]>(() => {
    const result: SplitLine[] = [];
    let i = 0;
    
    while (i < hunk.lines.length) {
      const line = hunk.lines[i];
      
      if (line.type === "context") {
        // Context lines go on both sides
        result.push({
          left: { lineNumber: line.oldLineNumber, content: line.content, type: "context" },
          right: { lineNumber: line.newLineNumber, content: line.content, type: "context" },
        });
        i++;
      } else if (line.type === "deletion") {
        // Look ahead for a matching addition
        let j = i + 1;
        const deletions: DiffLineData[] = [line];
        
        // Collect consecutive deletions
        while (j < hunk.lines.length && hunk.lines[j].type === "deletion") {
          deletions.push(hunk.lines[j]);
          j++;
        }
        
        // Collect consecutive additions
        const additions: DiffLineData[] = [];
        while (j < hunk.lines.length && hunk.lines[j].type === "addition") {
          additions.push(hunk.lines[j]);
          j++;
        }
        
        // Pair deletions and additions
        const maxLen = Math.max(deletions.length, additions.length);
        for (let k = 0; k < maxLen; k++) {
          const del = deletions[k];
          const add = additions[k];
          
          result.push({
            left: del 
              ? { lineNumber: del.oldLineNumber, content: del.content, type: "deletion" }
              : { content: "", type: "empty" },
            right: add 
              ? { lineNumber: add.newLineNumber, content: add.content, type: "addition" }
              : { content: "", type: "empty" },
          });
        }
        
        i = j;
      } else if (line.type === "addition") {
        // Solo addition (no matching deletion)
        result.push({
          left: { content: "", type: "empty" },
          right: { lineNumber: line.newLineNumber, content: line.content, type: "addition" },
        });
        i++;
      } else {
        i++;
      }
    }
    
    return result;
  });

  // Get styling for a line type
  function getLineStyle(type: "context" | "addition" | "deletion" | "empty") {
    switch (type) {
      case "addition":
        return {
          bg: "bg-[var(--cyber-emerald)]/10",
          text: "text-foreground",
        };
      case "deletion":
        return {
          bg: "bg-[var(--cyber-red)]/10",
          text: "text-foreground",
        };
      case "empty":
        return {
          bg: "bg-muted/20",
          text: "text-transparent",
        };
      case "context":
      default:
        return {
          bg: "bg-transparent",
          text: "text-muted-foreground",
        };
    }
  }

  // Count changes
  let changeStats = $derived.by(() => {
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
      {hunkHeader}
    </span>
    <div class="flex items-center gap-2 text-xs font-mono">
      {#if changeStats.additions > 0}
        <span class="text-[var(--cyber-emerald)]">+{changeStats.additions}</span>
      {/if}
      {#if changeStats.deletions > 0}
        <span class="text-[var(--cyber-red)]">-{changeStats.deletions}</span>
      {/if}
      <span class="text-muted-foreground/50">
        {isCollapsed ? "▶" : "▼"}
      </span>
    </div>
  </button>

  <!-- Side-by-side content -->
  {#if !isCollapsed}
    <div class="overflow-x-auto">
      <table class="w-full border-collapse font-mono text-xs">
        <tbody>
          {#each splitLines as row}
            <tr class="border-b border-border/10 last:border-b-0">
              <!-- Left side (old) -->
              <td class="w-10 text-right px-1.5 py-0 bg-muted/30 text-muted-foreground/50 select-none border-r border-border/20">
                {row.left.lineNumber ?? ""}
              </td>
              <td class="w-1/2 {getLineStyle(row.left.type).bg}">
                <pre class="px-2 py-0 whitespace-pre overflow-x-auto leading-5 {getLineStyle(row.left.type).text}">{row.left.content || " "}</pre>
              </td>
              
              <!-- Right side (new) -->
              <td class="w-10 text-right px-1.5 py-0 bg-muted/30 text-muted-foreground/50 select-none border-l border-r border-border/20">
                {row.right.lineNumber ?? ""}
              </td>
              <td class="w-1/2 {getLineStyle(row.right.type).bg}">
                <pre class="px-2 py-0 whitespace-pre overflow-x-auto leading-5 {getLineStyle(row.right.type).text}">{row.right.content || " "}</pre>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
