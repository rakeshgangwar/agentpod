<script lang="ts">
  import { onMount } from "svelte";
  import { listFiles, readFile, writeFile, mkdir, move, del } from "$lib/api/client";
  import type { FsEntry } from "@agentpod/contract";
  import {
    ChevronRight,
    ChevronDown,
    Loader2,
    FileText,
    Folder,
    FolderOpen,
    Trash2,
    FilePlus,
    FolderPlus,
    Pencil,
  } from "@lucide/svelte";
  import TypeToConfirmDialog from "$lib/components/ui/TypeToConfirmDialog.svelte";
  import ConfirmDialog from "$lib/components/ui/ConfirmDialog.svelte";

  interface Props {
    stationId: string;
    /** Show write actions when the station advertises fs.write capability. */
    canWrite?: boolean;
  }

  let { stationId, canWrite = false }: Props = $props();

  // ── Read-only file tree state ────────────────────────────────────────────────
  let rootEntries = $state<FsEntry[]>([]);
  let isLoading = $state(true);
  let error = $state<string | null>(null);
  let expandedPaths = $state<Set<string>>(new Set());
  let folderContents = $state<Map<string, FsEntry[]>>(new Map());
  let loadingFolders = $state<Set<string>>(new Set());

  // ── File preview / edit state ────────────────────────────────────────────────
  let selectedPath = $state<string | null>(null);
  let fileContent = $state<string | null>(null);
  let fileTruncated = $state(false);
  let isLoadingFile = $state(false);
  let fileError = $state<string | null>(null);

  // ── Write-action state ───────────────────────────────────────────────────────
  /** Entry currently targeted for deletion; opens TypeToConfirmDialog. */
  let deleteTarget = $state<FsEntry | null>(null);
  /** null = not creating; "file" = new-file mode; "dir" = new-folder mode. */
  let newItemMode = $state<"file" | "dir" | null>(null);
  let newItemName = $state("");
  /** Inline rename: entry being renamed and the pending new name. */
  let renameTarget = $state<FsEntry | null>(null);
  let renameName = $state("");
  /** Edit mode: textarea edits the file content. */
  let editMode = $state(false);
  let editContent = $state("");
  let showSaveConfirm = $state(false);
  let isSaving = $state(false);
  let saveError = $state<string | null>(null);

  // ── Lifecycle ────────────────────────────────────────────────────────────────
  onMount(async () => {
    await refreshRoot();
  });

  // ── Read helpers ─────────────────────────────────────────────────────────────
  async function refreshRoot() {
    isLoading = true;
    error = null;
    try {
      rootEntries = await listFiles(stationId, "");
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to load directory";
    } finally {
      isLoading = false;
    }
  }

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
    editMode = false;
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

  // ── Write helpers ────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await del(stationId, deleteTarget.path, { recursive: deleteTarget.type === "dir" });
      if (selectedPath === deleteTarget.path) {
        selectedPath = null;
        fileContent = null;
      }
    } catch {
      // TODO: surface error
    } finally {
      deleteTarget = null;
    }
    await refreshRoot();
  }

  async function handleNewItemKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      const name = newItemName.trim();
      if (!name) return;
      try {
        if (newItemMode === "dir") {
          await mkdir(stationId, name);
        } else {
          await writeFile(stationId, name, "");
        }
      } catch {
        // TODO: surface error
      } finally {
        newItemMode = null;
        newItemName = "";
      }
      await refreshRoot();
    } else if (e.key === "Escape") {
      newItemMode = null;
      newItemName = "";
    }
  }

  async function handleRenameKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      if (!renameTarget) return;
      const newName = renameName.trim();
      if (!newName || newName === renameTarget.name) {
        renameTarget = null;
        return;
      }
      const dir = renameTarget.path.includes("/")
        ? renameTarget.path.substring(0, renameTarget.path.lastIndexOf("/") + 1)
        : "";
      const newPath = dir + newName;
      try {
        await move(stationId, renameTarget.path, newPath);
      } catch {
        // TODO: surface error
      } finally {
        renameTarget = null;
        renameName = "";
      }
      await refreshRoot();
    } else if (e.key === "Escape") {
      renameTarget = null;
      renameName = "";
    }
  }

  function startEdit() {
    editContent = fileContent ?? "";
    editMode = true;
    saveError = null;
  }

  function cancelEdit() {
    editMode = false;
    editContent = "";
    saveError = null;
  }

  async function handleSaveFile() {
    if (!selectedPath) return;
    isSaving = true;
    saveError = null;
    try {
      await writeFile(stationId, selectedPath, editContent);
      fileContent = editContent;
      editMode = false;
    } catch (err) {
      saveError = err instanceof Error ? err.message : "Failed to save";
    } finally {
      isSaving = false;
      showSaveConfirm = false;
    }
  }
</script>

<div class="flex h-full min-h-[300px] border border-border rounded-md overflow-hidden">
  <!-- ── Tree pane ── -->
  <div class="w-60 shrink-0 overflow-y-auto border-r border-border bg-muted/20 flex flex-col">
    <!-- Write toolbar (always rendered when canWrite so tests can find buttons) -->
    {#if canWrite}
      <div class="flex shrink-0 items-center gap-1 border-b border-border px-2 py-1">
        <button
          type="button"
          class="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[12px] font-medium hover:bg-muted/60"
          onclick={() => { newItemMode = "file"; newItemName = ""; }}
          title="New File"
        >
          <FilePlus class="h-3.5 w-3.5" />
          New File
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[12px] font-medium hover:bg-muted/60"
          onclick={() => { newItemMode = "dir"; newItemName = ""; }}
          title="New Folder"
        >
          <FolderPlus class="h-3.5 w-3.5" />
          New Folder
        </button>
      </div>

      <!-- Inline create input -->
      {#if newItemMode !== null}
        <div class="shrink-0 px-2 py-1 border-b border-border">
          <input
            type="text"
            class="h-7 w-full rounded border border-input bg-background px-2 text-[13px] font-mono outline-none focus:border-ring"
            placeholder={newItemMode === "dir" ? "Folder name" : "File name"}
            bind:value={newItemName}
            onkeydown={handleNewItemKeydown}
            autofocus
          />
        </div>
      {/if}
    {/if}

    <!-- File tree -->
    <div class="flex-1 overflow-y-auto">
      {#if isLoading}
        <p class="text-sm text-muted-foreground p-3">Loading…</p>
      {:else if error}
        <p class="text-sm text-destructive p-3">{error}</p>
      {:else if rootEntries.length === 0}
        <p class="text-sm text-muted-foreground p-3">No files found.</p>
      {:else}
        <div class="py-1">
          {#snippet renderEntry(entry: FsEntry, depth: number)}
            <!-- Row wrapper: holds the entry button + optional action buttons -->
            <div
              class="group flex items-center w-full rounded-sm
                {entry.path === selectedPath ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/50 text-foreground'}"
              style:padding-left="{depth * 16 + 8}px"
            >
              <!-- Main entry button -->
              <button
                type="button"
                class="flex flex-1 items-center gap-1 py-1 text-[13px] font-mono text-left pr-1"
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

              <!-- Write action buttons (visible on hover; always in DOM for testing) -->
              {#if canWrite}
                {#if renameTarget?.path === entry.path}
                  <input
                    type="text"
                    class="h-6 w-24 shrink-0 rounded border border-input bg-background px-1 text-[12px] font-mono outline-none"
                    bind:value={renameName}
                    onkeydown={handleRenameKeydown}
                    autofocus
                  />
                {:else}
                  <button
                    type="button"
                    aria-label="Rename {entry.name}"
                    class="mr-0.5 flex shrink-0 items-center justify-center rounded p-0.5 text-muted-foreground opacity-0 hover:bg-muted/60 hover:text-foreground focus:opacity-100 group-hover:opacity-100"
                    onclick={(e) => {
                      e.stopPropagation();
                      renameTarget = entry;
                      renameName = entry.name;
                    }}
                  >
                    <Pencil class="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    aria-label="Delete {entry.name}"
                    class="mr-1 flex shrink-0 items-center justify-center rounded p-0.5 text-muted-foreground opacity-0 hover:bg-destructive/10 hover:text-destructive focus:opacity-100 group-hover:opacity-100"
                    onclick={(e) => {
                      e.stopPropagation();
                      deleteTarget = entry;
                    }}
                  >
                    <Trash2 class="h-3 w-3" />
                  </button>
                {/if}
              {/if}
            </div>

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
  </div>

  <!-- ── Preview / edit pane ── -->
  {#if selectedPath !== null}
    <div class="flex flex-col flex-1 overflow-hidden">
      <!-- Pane header -->
      <div class="flex items-center gap-3 px-3 py-1.5 border-b border-border bg-muted/20 text-xs font-mono shrink-0">
        <span class="text-foreground truncate">{selectedPath}</span>
        {#if fileTruncated && !editMode}
          <span class="shrink-0 rounded border border-destructive/30 bg-destructive/10 px-1.5 py-0.5 text-[11px] text-destructive">
            truncated — showing first portion
          </span>
        {/if}
        {#if canWrite && fileContent !== null && !editMode}
          <button
            type="button"
            class="ml-auto shrink-0 rounded border border-input bg-background px-2 py-0.5 text-[11px] font-sans hover:bg-muted/60"
            onclick={startEdit}
          >
            Edit
          </button>
        {/if}
        {#if editMode}
          <div class="ml-auto flex shrink-0 items-center gap-1.5">
            {#if saveError}
              <span class="text-[11px] text-destructive">{saveError}</span>
            {/if}
            <button
              type="button"
              class="rounded border border-input bg-background px-2 py-0.5 text-[11px] font-sans hover:bg-muted/60"
              onclick={cancelEdit}
            >
              Cancel
            </button>
            <button
              type="button"
              class="rounded border border-primary bg-primary px-2 py-0.5 text-[11px] font-sans text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              disabled={isSaving}
              onclick={() => (showSaveConfirm = true)}
            >
              {isSaving ? "Saving…" : "Save"}
            </button>
          </div>
        {/if}
      </div>

      <!-- Pane body -->
      {#if isLoadingFile}
        <p class="text-sm text-muted-foreground p-3">Loading file…</p>
      {:else if fileError}
        <p class="text-sm text-destructive p-3">{fileError}</p>
      {:else if editMode}
        <textarea
          class="flex-1 resize-none m-0 p-3 font-mono text-[13px] leading-relaxed bg-transparent text-foreground outline-none"
          bind:value={editContent}
        ></textarea>
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

<!-- ── Write confirm dialogs (rendered outside the layout split) ── -->
<TypeToConfirmDialog
  open={deleteTarget !== null}
  title="Delete {deleteTarget?.name ?? ''}"
  message="This will permanently delete {deleteTarget?.name ?? ''}. This action cannot be undone."
  confirmPhrase={deleteTarget?.name ?? ""}
  onConfirm={handleDelete}
  onCancel={() => (deleteTarget = null)}
/>

<ConfirmDialog
  open={showSaveConfirm}
  title="Save changes"
  message="Save changes to {selectedPath ?? 'this file'}?"
  confirmLabel="Save"
  onConfirm={handleSaveFile}
  onCancel={() => (showSaveConfirm = false)}
/>
