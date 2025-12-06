<script lang="ts">
  import { page } from "$app/stores";
  import * as Card from "$lib/components/ui/card";
  import { Button } from "$lib/components/ui/button";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import { CodeBlock } from "$lib/components/ui/code-block";
  import { MarkdownViewer } from "$lib/components/ui/markdown";
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
  
  // Cache for folder contents (lazy loaded)
  let folderContents = $state<Map<string, FileNode[]>>(new Map());
  
  // Track folders currently being loaded
  let loadingFolders = $state<Set<string>>(new Set());

  // View mode for markdown files: "preview" or "raw"
  let markdownViewMode = $state<"preview" | "raw">("raw");

  /**
   * Decode base64 content to plain text
   * OpenCode API returns file content as base64 encoded strings
   */
  function decodeBase64(encoded: string): string {
    try {
      // Use atob for browser-based base64 decoding
      return atob(encoded);
    } catch {
      // If decoding fails, return original (might already be plain text)
      return encoded;
    }
  }

  /**
   * Check if a string appears to be base64 encoded
   * Base64 strings contain only A-Z, a-z, 0-9, +, /, and = padding
   */
  function isBase64(str: string): boolean {
    if (!str || str.length === 0) return false;
    // Base64 regex pattern
    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
    // Must be valid base64 length (multiple of 4 after padding)
    return base64Regex.test(str) && str.length % 4 === 0;
  }

  // Check if file is markdown
  function isMarkdownFile(filename: string): boolean {
    const ext = filename.split(".").pop()?.toLowerCase();
    return ext === "md" || ext === "mdx";
  }

  // Load file tree when project changes
  $effect(() => {
    if (projectId) {
      loadFileTree();
    }
  });

  async function loadFileTree() {
    isLoadingTree = true;
    treeError = null;
    // Reset folder contents cache
    folderContents = new Map();
    expandedPaths = new Set();
    try {
      fileTree = await opencodeListFiles(projectId);
    } catch (err) {
      treeError = err instanceof Error ? err.message : "Failed to load files";
      console.error("Failed to load file tree:", err);
    } finally {
      isLoadingTree = false;
    }
  }

  async function selectFile(node: FileNode) {
    if (node.type === "directory") {
      await toggleFolder(node.path);
      return;
    }

    selectedFile = node;
    isLoadingContent = true;
    contentError = null;
    fileContent = null;

    try {
      const response = await opencodeGetFileContent(projectId, node.path);
      
      // OpenCode API returns base64 encoded content - decode it
      let content = response.content;
      if (content && isBase64(content)) {
        content = decodeBase64(content);
      }
      
      fileContent = {
        ...response,
        content,
      };
    } catch (err) {
      contentError = err instanceof Error ? err.message : "Failed to load file";
      console.error("Failed to load file content:", err);
    } finally {
      isLoadingContent = false;
    }
  }

  async function toggleFolder(path: string) {
    if (expandedPaths.has(path)) {
      // Collapse folder
      expandedPaths.delete(path);
      expandedPaths = new Set(expandedPaths);
    } else {
      // Expand folder - fetch contents if not cached
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
      // Set empty array to prevent infinite retries
      folderContents.set(path, []);
      folderContents = new Map(folderContents);
    } finally {
      loadingFolders.delete(path);
      loadingFolders = new Set(loadingFolders);
    }
  }
  
  // Get children for a folder (from cache)
  function getChildren(path: string): FileNode[] {
    return folderContents.get(path) ?? [];
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
                <span class="flex-shrink-0">
                  {#if node.type === "directory" && loadingFolders.has(node.path)}
                    <span class="animate-spin">⏳</span>
                  {:else}
                    {getFileIcon(node)}
                  {/if}
                </span>
                <span class="truncate">{node.name}</span>
              </div>
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
            {#if isMarkdownFile(selectedFile.name)}
              <div class="flex border rounded-md overflow-hidden">
                <button
                  class="px-2 py-1 text-xs transition-colors {markdownViewMode === 'raw' 
                    ? 'bg-primary text-primary-foreground' 
                    : 'bg-muted hover:bg-muted/80'}"
                  onclick={() => markdownViewMode = "raw"}
                >
                  Raw
                </button>
                <button
                  class="px-2 py-1 text-xs transition-colors {markdownViewMode === 'preview' 
                    ? 'bg-primary text-primary-foreground' 
                    : 'bg-muted hover:bg-muted/80'}"
                  onclick={() => markdownViewMode = "preview"}
                >
                  Preview
                </button>
              </div>
            {/if}
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
            {#if isMarkdownFile(selectedFile.name) && markdownViewMode === "preview"}
              <MarkdownViewer 
                content={fileContent.content}
                class="h-full"
              />
            {:else}
              <CodeBlock 
                code={fileContent.content} 
                language={getLanguage(selectedFile.name)}
                class="h-full"
              />
            {/if}
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
