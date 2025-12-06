<script lang="ts">
  import { page } from "$app/stores";
  import * as Card from "$lib/components/ui/card";
  import { Button } from "$lib/components/ui/button";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import {
    opencodeListFiles,
    opencodeGetFileContent,
    type FileNode,
    type FileContent,
  } from "$lib/api/tauri";

  let projectId = $derived($page.params.id ?? "");

  // State
  let fileTree = $state<FileNode[]>([]);
  let isLoadingTree = $state(true);
  let treeError = $state<string | null>(null);

  let selectedFile = $state<FileNode | null>(null);
  let fileContent = $state<FileContent | null>(null);
  let isLoadingContent = $state(false);
  let contentError = $state<string | null>(null);

  // Track expanded folders
  let expandedPaths = $state<Set<string>>(new Set());

  // Load file tree when project changes
  $effect(() => {
    if (projectId) {
      loadFileTree();
    }
  });

  async function loadFileTree() {
    isLoadingTree = true;
    treeError = null;
    try {
      fileTree = await opencodeListFiles(projectId);
      // Auto-expand root level
      fileTree.forEach((node) => {
        if (node.type === "directory") {
          expandedPaths.add(node.path);
        }
      });
      // Trigger reactivity
      expandedPaths = new Set(expandedPaths);
    } catch (err) {
      treeError = err instanceof Error ? err.message : "Failed to load files";
      console.error("Failed to load file tree:", err);
    } finally {
      isLoadingTree = false;
    }
  }

  async function selectFile(node: FileNode) {
    if (node.type === "directory") {
      toggleFolder(node.path);
      return;
    }

    selectedFile = node;
    isLoadingContent = true;
    contentError = null;
    fileContent = null;

    try {
      fileContent = await opencodeGetFileContent(projectId, node.path);
    } catch (err) {
      contentError = err instanceof Error ? err.message : "Failed to load file";
      console.error("Failed to load file content:", err);
    } finally {
      isLoadingContent = false;
    }
  }

  function toggleFolder(path: string) {
    if (expandedPaths.has(path)) {
      expandedPaths.delete(path);
    } else {
      expandedPaths.add(path);
    }
    // Trigger reactivity
    expandedPaths = new Set(expandedPaths);
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
      case "css":
      case "scss":
        return "🎨";
      case "html":
        return "🌐";
      case "toml":
      case "yaml":
      case "yml":
        return "⚙️";
      case "png":
      case "jpg":
      case "jpeg":
      case "gif":
      case "svg":
        return "🖼️";
      case "lock":
        return "🔒";
      default:
        return "📄";
    }
  }

  function getLanguage(filename: string): string {
    const ext = filename.split(".").pop()?.toLowerCase();
    switch (ext) {
      case "ts":
      case "tsx":
        return "typescript";
      case "js":
      case "jsx":
        return "javascript";
      case "svelte":
        return "svelte";
      case "rs":
        return "rust";
      case "json":
        return "json";
      case "md":
        return "markdown";
      case "css":
        return "css";
      case "scss":
        return "scss";
      case "html":
        return "html";
      case "toml":
        return "toml";
      case "yaml":
      case "yml":
        return "yaml";
      case "sh":
      case "bash":
        return "bash";
      case "sql":
        return "sql";
      default:
        return "plaintext";
    }
  }

  // Sort nodes: directories first, then alphabetically
  function sortNodes(nodes: FileNode[]): FileNode[] {
    return [...nodes].sort((a, b) => {
      if (a.type === "directory" && b.type !== "directory") return -1;
      if (a.type !== "directory" && b.type === "directory") return 1;
      return a.name.localeCompare(b.name);
    });
  }
</script>

<div class="flex h-[calc(100vh-200px)] min-h-[400px] gap-4">
  <!-- File Tree Panel -->
  <Card.Root class="w-72 flex flex-col">
    <Card.Header class="py-3 px-4 border-b flex-row items-center justify-between">
      <Card.Title class="text-sm">Files</Card.Title>
      <Button size="sm" variant="ghost" onclick={loadFileTree} disabled={isLoadingTree}>
        {isLoadingTree ? "..." : "↻"}
      </Button>
    </Card.Header>
    <Card.Content class="flex-1 p-0 overflow-hidden">
      <ScrollArea class="h-full">
        {#if isLoadingTree}
          <div class="p-3 space-y-2">
            {#each [1, 2, 3, 4, 5] as _}
              <Skeleton class="h-6 w-full" />
            {/each}
          </div>
        {:else if treeError}
          <div class="p-3 text-sm text-destructive">{treeError}</div>
        {:else if fileTree.length === 0}
          <div class="p-3 text-sm text-muted-foreground text-center">
            <p>No files found</p>
          </div>
        {:else}
          <div class="p-2">
            {#snippet renderNode(node: FileNode, depth: number = 0)}
              <div
                class="flex items-center gap-2 py-1 px-2 rounded cursor-pointer text-sm hover:bg-muted transition-colors
                  {selectedFile?.path === node.path ? 'bg-primary/10 text-primary' : ''}
                  {node.ignored ? 'opacity-50' : ''}"
                style="padding-left: {depth * 16 + 8}px"
                onclick={() => selectFile(node)}
                onkeydown={(e) => e.key === "Enter" && selectFile(node)}
                role="button"
                tabindex="0"
              >
                <span class="flex-shrink-0">{getFileIcon(node)}</span>
                <span class="truncate">{node.name}</span>
              </div>
              {#if node.type === "directory" && node.children && expandedPaths.has(node.path)}
                {#each sortNodes(node.children) as child (child.path)}
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
    </Card.Content>
  </Card.Root>

  <!-- File Content Panel -->
  <Card.Root class="flex-1 flex flex-col">
    {#if selectedFile}
      <Card.Header class="py-3 px-4 border-b">
        <div class="flex items-center justify-between">
          <div class="min-w-0 flex-1">
            <Card.Title class="text-sm truncate">{selectedFile.name}</Card.Title>
            <Card.Description class="text-xs truncate">
              {selectedFile.path}
            </Card.Description>
          </div>
          <div class="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onclick={() => {
                if (fileContent?.content) {
                  navigator.clipboard.writeText(fileContent.content);
                }
              }}
              disabled={!fileContent?.content}
            >
              Copy
            </Button>
          </div>
        </div>
      </Card.Header>
      <Card.Content class="flex-1 p-0 overflow-hidden">
        <ScrollArea class="h-full">
          {#if isLoadingContent}
            <div class="p-4 space-y-2">
              {#each [1, 2, 3, 4, 5, 6, 7, 8] as _}
                <Skeleton class="h-4 w-full" />
              {/each}
            </div>
          {:else if contentError}
            <div class="p-4 text-sm text-destructive">{contentError}</div>
          {:else if fileContent}
            <pre
              class="p-4 text-sm font-mono whitespace-pre-wrap break-words leading-relaxed"
            ><code>{fileContent.content}</code></pre>
          {/if}
        </ScrollArea>
      </Card.Content>
    {:else}
      <Card.Content class="flex-1 flex items-center justify-center">
        <div class="text-center text-muted-foreground">
          <p class="text-lg">No file selected</p>
          <p class="text-sm mt-1">Select a file from the tree to view its contents</p>
        </div>
      </Card.Content>
    {/if}
  </Card.Root>
</div>
