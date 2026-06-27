<script lang="ts">
  import { onMount } from "svelte";
  import { listFiles, readFile } from "$lib/api/client";
  import type { FsEntry } from "@agentpod/contract";
  import { ChevronRight, ChevronDown, Loader2, FileText, Folder, FolderOpen } from "@lucide/svelte";

  interface Props {
    stationId: string;
  }

  let { stationId }: Props = $props();

  // File tree state
  let rootEntries = $state<FsEntry[]>([]);
  let isLoading = $state(true);
  let error = $state<string | null>(null);
  let expandedPaths = $state<Set<string>>(new Set());
  let folderContents = $state<Map<string, FsEntry[]>>(new Map());
  let loadingFolders = $state<Set<string>>(new Set());

  // File preview state
  let selectedPath = $state<string | null>(null);
  let fileContent = $state<string | null>(null);
  let fileTruncated = $state(false);
  let isLoadingFile = $state(false);
  let fileError = $state<string | null>(null);

  onMount(async () => {
    try {
      rootEntries = await listFiles(stationId, "");
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to load directory";
    } finally {
      isLoading = false;
    }
  });

  async function toggleDir(path: string) {
    if (expandedPaths.has(path)) {
      const next = new Set(expandedPaths);
      next.delete(path);
      expandedPaths = next;
    } else {
      if (!folderContents.has(path)) {
        await loadDirContents(path);
      }
      const next = new Set(expandedPaths);
      next.add(path);
      expandedPaths = next;
    }
  }

  async function loadDirContents(path: string) {
    const loading = new Set(loadingFolders);
    loading.add(path);
    loadingFolders = loading;
    try {
      const contents = await listFiles(stationId, path);
      const next = new Map(folderContents);
      next.set(path, contents);
      folderContents = next;
    } catch {
      const next = new Map(folderContents);
      next.set(path, []);
      folderContents = next;
    } finally {
      const done = new Set(loadingFolders);
      done.delete(path);
      loadingFolders = done;
    }
  }

  async function openFile(path: string) {
    selectedPath = path;
    isLoadingFile = true;
    fileContent = null;
    fileTruncated = false;
    fileError = null;
    try {
      const result = await readFile(stationId, path);
      fileContent = result.content;
      fileTruncated = result.truncated;
    } catch (err) {
      fileError = err instanceof Error ? err.message : "Failed to read file";
    } finally {
      isLoadingFile = false;
    }
  }

  function handleEntryClick(entry: FsEntry) {
    if (entry.type === "dir") {
      toggleDir(entry.path);
    } else {
      openFile(entry.path);
    }
  }

  function getChildren(path: string): FsEntry[] {
    return folderContents.get(path) ?? [];
  }

  function sortEntries(entries: FsEntry[]): FsEntry[] {
    return [...entries].sort((a, b) => {
      if (a.type === "dir" && b.type !== "dir") return -1;
      if (a.type !== "dir" && b.type === "dir") return 1;
      return a.name.localeCompare(b.name);
    });
  }


</script>

<div class="flex h-full min-h-[300px] border border-border rounded-md overflow-hidden">
  <!-- Tree pane -->
  <div class="w-60 shrink-0 overflow-y-auto border-r border-border bg-muted/20">
    {#if isLoading}
      <p class="text-sm text-muted-foreground p-3">Loading…</p>
    {:else if error}
      <p class="text-sm text-destructive p-3">{error}</p>
    {:else if rootEntries.length === 0}
      <p class="text-sm text-muted-foreground p-3">No files found.</p>
    {:else}
      <div class="py-1">
        {#snippet renderEntry(entry: FsEntry, depth: number)}
          <button
            type="button"
            class="flex items-center gap-1 w-full text-left py-1 text-[13px] font-mono rounded-sm
              hover:bg-muted/50
              {entry.path === selectedPath ? 'bg-accent text-accent-foreground' : 'text-foreground'}"
            style:padding-left="{depth * 16 + 8}px"
            onclick={() => handleEntryClick(entry)}
          >
            {#if entry.type === "dir"}
              <span class="flex items-center justify-center w-4 shrink-0 text-muted-foreground">
                {#if loadingFolders.has(entry.path)}
                  <Loader2 class="h-3.5 w-3.5 animate-spin" />
                {:else if expandedPaths.has(entry.path)}
                  <ChevronDown class="h-3.5 w-3.5" />
                {:else}
                  <ChevronRight class="h-3.5 w-3.5" />
                {/if}
              </span>
              <span class="flex items-center justify-center w-4 shrink-0">
                {#if expandedPaths.has(entry.path)}
                  <FolderOpen class="h-3.5 w-3.5 text-amber-400" />
                {:else}
                  <Folder class="h-3.5 w-3.5 text-amber-400" />
                {/if}
              </span>
            {:else}
              <span class="w-4 shrink-0"></span>
              <span class="flex items-center justify-center w-4 shrink-0">
                <FileText class="h-3.5 w-3.5 text-muted-foreground" />
              </span>
            {/if}
            <span class="truncate">{entry.name}</span>
          </button>

          {#if entry.type === "dir" && expandedPaths.has(entry.path)}
            {#each sortEntries(getChildren(entry.path)) as child (child.path)}
              {@render renderEntry(child, depth + 1)}
            {/each}
          {/if}
        {/snippet}

        {#each sortEntries(rootEntries) as entry (entry.path)}
          {@render renderEntry(entry, 0)}
        {/each}
      </div>
    {/if}
  </div>

  <!-- Preview pane -->
  {#if selectedPath !== null}
    <div class="flex flex-col flex-1 overflow-hidden">
      <!-- Preview header -->
      <div class="flex items-center gap-3 px-3 py-1.5 border-b border-border bg-muted/20 text-xs font-mono shrink-0">
        <span class="text-foreground truncate">{selectedPath}</span>
        {#if fileTruncated}
          <span class="shrink-0 rounded border border-destructive/30 bg-destructive/10 px-1.5 py-0.5 text-[11px] text-destructive">
            truncated — showing first portion
          </span>
        {/if}
      </div>

      <!-- Preview body -->
      {#if isLoadingFile}
        <p class="text-sm text-muted-foreground p-3">Loading file…</p>
      {:else if fileError}
        <p class="text-sm text-destructive p-3">{fileError}</p>
      {:else if fileContent !== null}
        <!-- Code preview: plain <pre> for testability.
             vite-plugin-svelte@5 + vite@6 fails CSS preprocessing in jsdom
             for components that have <style> blocks (code-block.svelte).
             The station page wraps this in CodeBlock for Shiki highlighting. -->
        <pre
          class="flex-1 overflow-auto m-0 p-3 font-mono text-[13px] leading-relaxed whitespace-pre-wrap break-all bg-transparent text-foreground"
        >{fileContent}</pre>
      {/if}
    </div>
  {:else}
    <div class="flex flex-1 items-center justify-center text-sm text-muted-foreground">
      Select a file to preview
    </div>
  {/if}
</div>
