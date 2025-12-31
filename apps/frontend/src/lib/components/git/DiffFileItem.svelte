<script lang="ts">
  /**
   * DiffFileItem Component
   * 
   * Displays a single file from the diff summary with expandable diff content.
   * Shows file path, status icon, and change stats. Clicking expands to show hunks.
   */

  import { ChevronRight, Plus, Minus, FilePen, ArrowRight, RefreshCw } from "@lucide/svelte";
  import DiffStats from "./DiffStats.svelte";
  import DiffHunk from "./DiffHunk.svelte";

  type GitDiffFileStatus = "added" | "modified" | "deleted" | "renamed";
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

  interface FileDiffData {
    path: string;
    status: GitDiffFileStatus;
    additions: number;
    deletions: number;
    hunks: DiffHunkData[];
  }

  interface Props {
    filePath: string;
    status: GitDiffFileStatus;
    expanded?: boolean;
    loading?: boolean;
    diff?: FileDiffData | null;
    onToggle?: () => void;
    onLoadDiff?: () => void;
  }

  let { 
    filePath, 
    status, 
    expanded = false, 
    loading = false, 
    diff = null,
    onToggle,
    onLoadDiff
  }: Props = $props();

  // Get status style (color, background, label) based on file status
  function getStatusStyle(fileStatus: GitDiffFileStatus) {
    switch (fileStatus) {
      case "added":
        return {
          color: "text-[var(--cyber-emerald)]",
          bg: "bg-[var(--cyber-emerald)]/10",
          label: "Added",
        };
      case "deleted":
        return {
          color: "text-[var(--cyber-red)]",
          bg: "bg-[var(--cyber-red)]/10",
          label: "Deleted",
        };
      case "renamed":
        return {
          color: "text-[var(--cyber-cyan)]",
          bg: "bg-[var(--cyber-cyan)]/10",
          label: "Renamed",
        };
      case "modified":
      default:
        return {
          color: "text-[var(--cyber-amber)]",
          bg: "bg-[var(--cyber-amber)]/10",
          label: "Modified",
        };
    }
  }

  let statusStyle = $derived(getStatusStyle(status));

  // Extract filename from path
  let fileName = $derived(filePath.split("/").pop() ?? filePath);
  let dirPath = $derived(() => {
    const parts = filePath.split("/");
    return parts.length > 1 ? parts.slice(0, -1).join("/") : "";
  });

  // Handle click - toggle expansion and load diff if needed
  function handleClick() {
    if (!expanded && !diff && onLoadDiff) {
      onLoadDiff();
    }
    onToggle?.();
  }
</script>

<div class="border border-border/30 rounded-lg overflow-hidden">
  <!-- File Header -->
  <button
    type="button"
    onclick={handleClick}
    class="w-full flex items-center gap-3 px-3 py-2.5
           hover:bg-accent/30 transition-colors cursor-pointer
           {expanded ? 'bg-accent/20 border-b border-border/30' : ''}"
  >
    <!-- Expand arrow -->
    <ChevronRight 
      class="h-4 w-4 text-muted-foreground transition-transform flex-shrink-0
             {expanded ? 'rotate-90' : ''}"
    />

    <!-- Status icon -->
    <div class="{statusStyle.bg} {statusStyle.color} p-1.5 rounded flex-shrink-0">
      {#if status === "added"}
        <Plus class="h-3.5 w-3.5" />
      {:else if status === "deleted"}
        <Minus class="h-3.5 w-3.5" />
      {:else if status === "renamed"}
        <ArrowRight class="h-3.5 w-3.5" />
      {:else}
        <FilePen class="h-3.5 w-3.5" />
      {/if}
    </div>

    <!-- File path -->
    <div class="flex-1 min-w-0 text-left">
      <div class="flex items-baseline gap-1 truncate">
        <span class="font-mono text-sm font-medium truncate">{fileName}</span>
        {#if dirPath()}
          <span class="font-mono text-xs text-muted-foreground truncate hidden sm:inline">
            {dirPath()}
          </span>
        {/if}
      </div>
    </div>

    <!-- Stats / Loading -->
    <div class="flex-shrink-0 flex items-center gap-2">
      {#if loading}
        <RefreshCw class="h-4 w-4 animate-spin text-muted-foreground" />
      {:else if diff}
        <DiffStats additions={diff.additions} deletions={diff.deletions} compact />
      {:else}
        <span class="text-xs text-muted-foreground font-mono">
          {statusStyle.label}
        </span>
      {/if}
    </div>
  </button>

  <!-- Expanded diff content -->
  {#if expanded}
    <div class="bg-muted/20">
      {#if loading}
        <div class="flex items-center justify-center py-8">
          <div class="flex items-center gap-3 text-muted-foreground">
            <RefreshCw class="h-4 w-4 animate-spin" />
            <span class="text-sm font-mono">Loading diff...</span>
          </div>
        </div>
      {:else if diff && diff.hunks.length > 0}
        <div class="p-3 space-y-3">
          {#each diff.hunks as hunk, index}
            <DiffHunk {hunk} initialCollapsed={index > 2} />
          {/each}
        </div>
      {:else if diff && diff.hunks.length === 0}
        <div class="flex items-center justify-center py-8">
          <span class="text-sm text-muted-foreground">
            {#if status === "added"}
              New file (empty or binary)
            {:else if status === "deleted"}
              File deleted
            {:else}
              No content changes
            {/if}
          </span>
        </div>
      {:else}
        <div class="flex items-center justify-center py-8">
          <span class="text-sm text-muted-foreground">
            Click to load diff
          </span>
        </div>
      {/if}
    </div>
  {/if}
</div>
