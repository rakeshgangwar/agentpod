<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import FileIcon from "$lib/components/file-icon.svelte";
  import { ChevronRight, ChevronDown, Loader2 } from "@lucide/svelte";
  import {
    sandboxOpencodeListFiles,
    sandboxOpencodeFindFiles,
    type FileNode,
  } from "$lib/api/tauri";

  interface Props {
    projectId: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSelect: (filePath: string) => void;
  }

  let { projectId, open, onOpenChange, onSelect }: Props = $props();

  // State
  let searchQuery = $state("");
  let searchResults = $state<string[]>([]);
  let isSearching = $state(false);
  let selectedIndex = $state(0);

  // File tree state (for browse mode)
  let fileTree = $state<FileNode[]>([]);
  let isLoadingTree = $state(false);
  let expandedPaths = $state<Set<string>>(new Set());
  let folderContents = $state<Map<string, FileNode[]>>(new Map());
  let loadingFolders = $state<Set<string>>(new Set());

  // View mode: "search" or "browse"
  let viewMode = $state<"search" | "browse">("search");

  // Load file tree when opening in browse mode
  $effect(() => {
    if (open && viewMode === "browse" && fileTree.length === 0) {
      loadFileTree();
    }
  });

  // Search files when query changes
  $effect(() => {
    if (open && viewMode === "search" && searchQuery.length > 0) {
      searchFiles();
    } else if (searchQuery.length === 0) {
      searchResults = [];
    }
  });

  // Reset state when modal opens/closes
  $effect(() => {
    if (open) {
      searchQuery = "";
      searchResults = [];
      selectedIndex = 0;
    }
  });

  async function loadFileTree() {
    isLoadingTree = true;
    try {
      // projectId is actually sandboxId in v2 API
      fileTree = await sandboxOpencodeListFiles(projectId);
    } catch (err) {
      console.error("Failed to load file tree:", err);
    } finally {
      isLoadingTree = false;
    }
  }

  let searchTimeout: ReturnType<typeof setTimeout>;
  async function searchFiles() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(async () => {
      if (!searchQuery) return;
      isSearching = true;
      try {
        // projectId is actually sandboxId in v2 API
        const results = await sandboxOpencodeFindFiles(projectId, searchQuery);
        searchResults = results.slice(0, 50); // Limit results
        selectedIndex = 0;
      } catch (err) {
        console.error("Failed to search files:", err);
        searchResults = [];
      } finally {
        isSearching = false;
      }
    }, 200);
  }

  async function toggleFolder(path: string) {
    if (expandedPaths.has(path)) {
      expandedPaths.delete(path);
      expandedPaths = new Set(expandedPaths);
    } else {
      if (!folderContents.has(path)) {
        await loadFolderContents(path);
      }
      expandedPaths.add(path);
      expandedPaths = new Set(expandedPaths);
    }
  }

  async function loadFolderContents(path: string) {
    loadingFolders.add(path);
    loadingFolders = new Set(loadingFolders);
    try {
      // projectId is actually sandboxId in v2 API
      const contents = await sandboxOpencodeListFiles(projectId, path);
      folderContents.set(path, contents);
      folderContents = new Map(folderContents);
    } catch (err) {
      console.error(`Failed to load folder contents for ${path}:`, err);
      folderContents.set(path, []);
      folderContents = new Map(folderContents);
    } finally {
      loadingFolders.delete(path);
      loadingFolders = new Set(loadingFolders);
    }
  }

  function getChildren(path: string): FileNode[] {
    return folderContents.get(path) ?? [];
  }

  function selectFile(path: string) {
    onSelect(path);
    onOpenChange(false);
  }

  function handleNodeClick(node: FileNode) {
    if (node.type === "directory") {
      toggleFolder(node.path);
    } else {
      selectFile(node.path);
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (viewMode === "search" && searchResults.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        selectedIndex = (selectedIndex + 1) % searchResults.length;
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        selectedIndex = selectedIndex === 0 ? searchResults.length - 1 : selectedIndex - 1;
      } else if (e.key === "Enter") {
        e.preventDefault();
        selectFile(searchResults[selectedIndex]);
      }
    }
  }

  function sortNodes(nodes: FileNode[]): FileNode[] {
    return [...nodes].sort((a, b) => {
      if (a.type === "directory" && b.type !== "directory") return -1;
      if (a.type !== "directory" && b.type === "directory") return 1;
      return a.name.localeCompare(b.name);
    });
  }
</script>

<Dialog.Root bind:open onOpenChange={onOpenChange}>
  <Dialog.Content class="max-w-2xl max-h-[80vh] flex flex-col border-[var(--cyber-cyan)]/30 bg-background/95 backdrop-blur-sm">
    <Dialog.Header>
      <Dialog.Title class="font-mono text-[var(--cyber-cyan)]">[select_file]</Dialog.Title>
      <Dialog.Description class="font-mono text-sm">
        Search or browse for a file to reference in your message
      </Dialog.Description>
    </Dialog.Header>

    <!-- View Mode Toggle -->
    <div class="flex gap-2 mb-4">
      <Button
        size="sm"
        class="font-mono text-xs uppercase tracking-wider {viewMode === 'search' ? 'bg-[var(--cyber-cyan)] text-black hover:bg-[var(--cyber-cyan)]/90' : 'border border-border/50 bg-transparent hover:bg-[var(--cyber-cyan)]/10 hover:text-[var(--cyber-cyan)]'}"
        onclick={() => (viewMode = "search")}
      >
        Search
      </Button>
      <Button
        size="sm"
        class="font-mono text-xs uppercase tracking-wider {viewMode === 'browse' ? 'bg-[var(--cyber-cyan)] text-black hover:bg-[var(--cyber-cyan)]/90' : 'border border-border/50 bg-transparent hover:bg-[var(--cyber-cyan)]/10 hover:text-[var(--cyber-cyan)]'}"
        onclick={() => (viewMode = "browse")}
      >
        Browse
      </Button>
    </div>

    {#if viewMode === "search"}
      <!-- Search Mode -->
      <div class="space-y-4">
        <Input
          type="text"
          placeholder="Type to search files..."
          bind:value={searchQuery}
          onkeydown={handleKeyDown}
          autofocus
          class="font-mono bg-background/50 border-border/50 focus:border-[var(--cyber-cyan)] focus:ring-1 focus:ring-[var(--cyber-cyan)]"
        />

        <ScrollArea class="h-[400px] border border-border/30 rounded bg-background/30">
          {#if isSearching}
            <div class="p-4 space-y-2">
              {#each [1, 2, 3, 4, 5] as _}
                <Skeleton class="h-8 w-full bg-[var(--cyber-cyan)]/10" />
              {/each}
            </div>
          {:else if searchResults.length === 0 && searchQuery}
            <div class="p-4 text-center text-muted-foreground font-mono">
              No files found matching "{searchQuery}"
            </div>
          {:else if searchResults.length === 0}
            <div class="p-4 text-center text-muted-foreground font-mono">
              Start typing to search for files
            </div>
          {:else}
            <div class="p-2">
              {#each searchResults as file, i}
                <button
                  class="w-full text-left px-3 py-2 rounded text-sm font-mono hover:bg-[var(--cyber-cyan)]/10 transition-colors flex items-center gap-2
                    {i === selectedIndex ? 'bg-[var(--cyber-cyan)]/15 text-[var(--cyber-cyan)] border-l-2 border-[var(--cyber-cyan)]' : ''}"
                  onclick={() => selectFile(file)}
                  onmouseenter={() => (selectedIndex = i)}
                >
                  <span class="text-[var(--cyber-cyan)]">></span>
                  <span class="truncate">{file}</span>
                </button>
              {/each}
            </div>
          {/if}
        </ScrollArea>
      </div>
    {:else}
      <!-- Browse Mode -->
      <ScrollArea class="h-[400px] border border-border/30 rounded bg-background/30">
        {#if isLoadingTree}
          <div class="p-4 space-y-2">
            {#each [1, 2, 3, 4, 5] as _}
              <Skeleton class="h-6 w-full bg-[var(--cyber-cyan)]/10" />
            {/each}
          </div>
        {:else if fileTree.length === 0}
          <div class="p-4 text-center text-muted-foreground font-mono">
            No files found
          </div>
        {:else}
          <div class="p-2">
            {#snippet renderNode(node: FileNode, depth: number = 0)}
              <button
                class="w-full text-left flex items-center gap-2 py-1.5 px-2 rounded text-sm font-mono hover:bg-[var(--cyber-cyan)]/10 transition-colors
                  {node.ignored ? 'opacity-50' : ''}"
                style="padding-left: {depth * 16 + 8}px"
                onclick={() => handleNodeClick(node)}
              >
                {#if node.type === "directory"}
                  <span class="flex-shrink-0 w-4 flex items-center justify-center text-[var(--cyber-amber)]">
                    {#if loadingFolders.has(node.path)}
                      <Loader2 class="h-3.5 w-3.5 animate-spin" />
                    {:else if expandedPaths.has(node.path)}
                      <ChevronDown class="h-3.5 w-3.5" />
                    {:else}
                      <ChevronRight class="h-3.5 w-3.5" />
                    {/if}
                  </span>
                  <FileIcon filename={node.name} isDirectory={true} isExpanded={expandedPaths.has(node.path)} size="sm" />
                {:else}
                  <span class="flex-shrink-0 w-4"></span>
                  <FileIcon filename={node.name} size="sm" />
                {/if}
                <span class="truncate">{node.name}</span>
              </button>
              {#if node.type === "directory" && expandedPaths.has(node.path)}
                {#each sortNodes(getChildren(node.path)) as child (child.path)}
                  {@render renderNode(child, depth + 1)}
                {/each}
              {/if}
            {/snippet}

            {#each sortNodes(fileTree) as node (node.path)}
              {@render renderNode(node)}
            {/each}
          </div>
        {/if}
      </ScrollArea>
    {/if}

    <Dialog.Footer class="mt-4">
      <Button 
        class="font-mono text-xs uppercase tracking-wider border border-border/50 bg-transparent hover:bg-muted" 
        onclick={() => onOpenChange(false)}
      >
        Cancel
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
