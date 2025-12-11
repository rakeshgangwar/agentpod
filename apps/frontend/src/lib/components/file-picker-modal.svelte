<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import {
    opencodeListFiles,
    opencodeFindFiles,
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
      fileTree = await opencodeListFiles(projectId);
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
        const results = await opencodeFindFiles(projectId, searchQuery);
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
      const contents = await opencodeListFiles(projectId, path);
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

  function getFileIcon(node: FileNode): string {
    if (node.type === "directory") {
      return expandedPaths.has(node.path) ? "📂" : "📁";
    }
    const ext = node.name.split(".").pop()?.toLowerCase();
    switch (ext) {
      case "ts":
      case "tsx":
        return "🟦";
      case "js":
      case "jsx":
        return "🟨";
      case "svelte":
        return "🟠";
      case "rs":
        return "🦀";
      case "json":
        return "📋";
      case "md":
        return "📝";
      default:
        return "📄";
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
  <Dialog.Content class="max-w-2xl max-h-[80vh] flex flex-col">
    <Dialog.Header>
      <Dialog.Title>Select a File</Dialog.Title>
      <Dialog.Description>
        Search or browse for a file to reference in your message
      </Dialog.Description>
    </Dialog.Header>

    <!-- View Mode Toggle -->
    <div class="flex gap-2 mb-4">
      <Button
        size="sm"
        variant={viewMode === "search" ? "default" : "outline"}
        onclick={() => (viewMode = "search")}
      >
        Search
      </Button>
      <Button
        size="sm"
        variant={viewMode === "browse" ? "default" : "outline"}
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
        />

        <ScrollArea class="h-[400px] border rounded-md">
          {#if isSearching}
            <div class="p-4 space-y-2">
              {#each [1, 2, 3, 4, 5] as _}
                <Skeleton class="h-8 w-full" />
              {/each}
            </div>
          {:else if searchResults.length === 0 && searchQuery}
            <div class="p-4 text-center text-muted-foreground">
              No files found matching "{searchQuery}"
            </div>
          {:else if searchResults.length === 0}
            <div class="p-4 text-center text-muted-foreground">
              Start typing to search for files
            </div>
          {:else}
            <div class="p-2">
              {#each searchResults as file, i}
                <button
                  class="w-full text-left px-3 py-2 rounded-md text-sm font-mono hover:bg-muted transition-colors flex items-center gap-2
                    {i === selectedIndex ? 'bg-primary/10 text-primary' : ''}"
                  onclick={() => selectFile(file)}
                  onmouseenter={() => (selectedIndex = i)}
                >
                  <span>📄</span>
                  <span class="truncate">{file}</span>
                </button>
              {/each}
            </div>
          {/if}
        </ScrollArea>
      </div>
    {:else}
      <!-- Browse Mode -->
      <ScrollArea class="h-[400px] border rounded-md">
        {#if isLoadingTree}
          <div class="p-4 space-y-2">
            {#each [1, 2, 3, 4, 5] as _}
              <Skeleton class="h-6 w-full" />
            {/each}
          </div>
        {:else if fileTree.length === 0}
          <div class="p-4 text-center text-muted-foreground">
            No files found
          </div>
        {:else}
          <div class="p-2">
            {#snippet renderNode(node: FileNode, depth: number = 0)}
              <button
                class="w-full text-left flex items-center gap-2 py-1.5 px-2 rounded text-sm hover:bg-muted transition-colors
                  {node.ignored ? 'opacity-50' : ''}"
                style="padding-left: {depth * 16 + 8}px"
                onclick={() => handleNodeClick(node)}
              >
                <span class="flex-shrink-0">
                  {#if node.type === "directory" && loadingFolders.has(node.path)}
                    <span class="animate-spin">⏳</span>
                  {:else}
                    {getFileIcon(node)}
                  {/if}
                </span>
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
      <Button variant="outline" onclick={() => onOpenChange(false)}>Cancel</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
