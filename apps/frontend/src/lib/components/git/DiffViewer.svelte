<script lang="ts">
  /**
   * DiffViewer Component
   * 
   * Main container for viewing git diffs. Shows a list of changed files
   * with expandable diff content for each file.
   */

  import { RefreshCw, FileCode, Check } from "@lucide/svelte";
  import DiffFileItem from "./DiffFileItem.svelte";
  import DiffStats from "./DiffStats.svelte";
  import {
    gitStore,
    fetchDiffSummary,
    fetchFileDiff,
    clearFileDiff
  } from "$lib/stores/git.svelte";

  interface Props {
    sandboxId: string;
    compact?: boolean;
  }

  let { sandboxId, compact = false }: Props = $props();

  // State
  let expandedFile = $state<string | null>(null);
  let loadingFiles = $state<Set<string>>(new Set());

  // Get data from store
  let diffSummary = $derived(gitStore.diffSummary);
  let isLoadingDiff = $derived(gitStore.isLoadingDiff);
  let selectedFileDiff = $derived(gitStore.selectedFileDiff);
  let selectedFilePath = $derived(gitStore.selectedFilePath);
  let diffError = $derived(gitStore.diffError);

  // Build list of all changed files with their status
  type FileStatus = "added" | "modified" | "deleted" | "renamed";
  interface ChangedFile {
    path: string;
    status: FileStatus;
    oldPath?: string;
  }

  let changedFiles = $derived.by<ChangedFile[]>(() => {
    if (!diffSummary) return [];
    
    const files: ChangedFile[] = [];
    
    // Added files
    for (const path of diffSummary.added) {
      files.push({ path, status: "added" });
    }
    
    // Modified files
    for (const path of diffSummary.modified) {
      files.push({ path, status: "modified" });
    }
    
    // Deleted files
    for (const path of diffSummary.deleted) {
      files.push({ path, status: "deleted" });
    }
    
    // Renamed files
    for (const renamed of diffSummary.renamed) {
      files.push({ path: renamed.to, status: "renamed", oldPath: renamed.from });
    }
    
    return files;
  });

  // Calculate total stats
  let totalStats = $derived.by(() => {
    let additions = 0;
    let deletions = 0;
    
    if (selectedFileDiff) {
      additions = selectedFileDiff.additions;
      deletions = selectedFileDiff.deletions;
    }
    
    return { additions, deletions };
  });

  // Load diff summary on mount
  $effect(() => {
    if (sandboxId) {
      fetchDiffSummary(sandboxId);
    }
  });

  // Toggle file expansion
  async function toggleFile(filePath: string) {
    if (expandedFile === filePath) {
      // Collapse
      expandedFile = null;
      clearFileDiff();
    } else {
      // Expand and load diff
      expandedFile = filePath;
      loadingFiles = new Set([...loadingFiles, filePath]);
      
      try {
        await fetchFileDiff(filePath, sandboxId);
      } finally {
        const newSet = new Set(loadingFiles);
        newSet.delete(filePath);
        loadingFiles = newSet;
      }
    }
  }

  // Load diff for a specific file
  async function loadFileDiff(filePath: string) {
    loadingFiles = new Set([...loadingFiles, filePath]);
    
    try {
      await fetchFileDiff(filePath, sandboxId);
    } finally {
      const newSet = new Set(loadingFiles);
      newSet.delete(filePath);
      loadingFiles = newSet;
    }
  }

  // Refresh diff summary
  async function refresh() {
    expandedFile = null;
    clearFileDiff();
    await fetchDiffSummary(sandboxId);
  }
</script>

<div class="flex flex-col h-full min-h-0">
  <!-- Header -->
  <div class="flex-shrink-0 flex items-center justify-between px-4 py-2 border-b border-border/20 bg-muted/30">
    <div class="flex items-center gap-2">
      <FileCode class="h-4 w-4 text-muted-foreground" />
      <h3 class="font-mono text-xs uppercase tracking-wider text-muted-foreground">
        Changes
      </h3>
      {#if changedFiles.length > 0}
        <span class="text-xs font-mono text-[var(--cyber-amber)]">
          ({changedFiles.length} {changedFiles.length === 1 ? 'file' : 'files'})
        </span>
      {/if}
    </div>
    
    <button
      type="button"
      onclick={refresh}
      disabled={isLoadingDiff}
      class="p-1.5 rounded hover:bg-accent/50 transition-colors disabled:opacity-50"
      title="Refresh"
    >
      <RefreshCw class="h-4 w-4 {isLoadingDiff ? 'animate-spin' : ''}" />
    </button>
  </div>

  <!-- Content -->
  <div class="flex-1 min-h-0 overflow-y-auto">
    {#if isLoadingDiff}
      <!-- Loading state -->
      <div class="flex items-center justify-center py-12">
        <div class="flex flex-col items-center gap-3">
          <RefreshCw class="h-6 w-6 animate-spin text-[var(--cyber-cyan)]" />
          <span class="text-sm font-mono text-muted-foreground">Loading changes...</span>
        </div>
      </div>
    {:else if diffError}
      <!-- Error state -->
      <div class="flex items-center justify-center py-12 px-4">
        <div class="text-center">
          <p class="text-sm text-destructive font-mono">{diffError}</p>
          <button
            type="button"
            onclick={refresh}
            class="mt-3 text-xs text-[var(--cyber-cyan)] hover:underline"
          >
            Try again
          </button>
        </div>
      </div>
    {:else if changedFiles.length === 0}
      <!-- Empty state -->
      <div class="flex flex-col items-center justify-center py-12 px-4">
        <Check class="h-10 w-10 text-[var(--cyber-emerald)]/40 mb-3" />
        <p class="text-sm font-mono text-muted-foreground">No changes detected</p>
        <p class="text-xs text-muted-foreground/60 mt-1">
          Working directory is clean
        </p>
      </div>
    {:else}
      <!-- Files list -->
      <div class="p-3 space-y-2">
        {#each changedFiles as file (file.path)}
          <DiffFileItem
            filePath={file.path}
            status={file.status}
            expanded={expandedFile === file.path}
            loading={loadingFiles.has(file.path)}
            diff={expandedFile === file.path && selectedFilePath === file.path ? selectedFileDiff : null}
            onToggle={() => toggleFile(file.path)}
            onLoadDiff={() => loadFileDiff(file.path)}
          />
        {/each}
      </div>
    {/if}
  </div>

  <!-- Footer with total stats (only if we have loaded a file diff) -->
  {#if selectedFileDiff && expandedFile}
    <div class="flex-shrink-0 px-4 py-2 border-t border-border/20 bg-muted/30">
      <div class="flex items-center justify-between">
        <span class="text-xs font-mono text-muted-foreground">
          {selectedFilePath}
        </span>
        <DiffStats additions={totalStats.additions} deletions={totalStats.deletions} compact showBar />
      </div>
    </div>
  {/if}
</div>
