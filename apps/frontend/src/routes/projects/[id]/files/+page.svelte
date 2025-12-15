<script lang="ts">
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { Button } from "$lib/components/ui/button";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import { CodeBlock } from "$lib/components/ui/code-block";
  import { MarkdownViewer } from "$lib/components/ui/markdown";
  import { toast } from "svelte-sonner";
  import { sandboxes, startSandbox } from "$lib/stores/sandboxes.svelte";
  import SandboxNotRunning from "$lib/components/sandbox-not-running.svelte";
  import {
    sandboxOpencodeListFiles,
    sandboxOpencodeGetFileContent,
    type FileNode,
    type FileContent,
  } from "$lib/api/tauri";

  // Copy path to clipboard
  function copyPath() {
    if (selectedFile) {
      navigator.clipboard.writeText(selectedFile.path);
      toast.success("Path copied to clipboard");
    }
  }

  // Download the current file
  function downloadFile() {
    if (!selectedFile) return;

    let blob: Blob;
    const mimeType = getMimeType(selectedFile.name);

    // For binary files, use the raw base64 content and decode to proper binary
    if (isBinaryFile(selectedFile.name) && rawBase64Content) {
      const binaryData = base64ToArrayBuffer(rawBase64Content);
      blob = new Blob([binaryData], { type: mimeType });
    } else if (fileContent?.content) {
      // For text files, use the decoded content
      blob = new Blob([fileContent.content], { type: mimeType });
    } else {
      return;
    }

    const url = URL.createObjectURL(blob);

    // Create a temporary link and trigger download
    const link = document.createElement("a");
    link.href = url;
    link.download = selectedFile.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Clean up the URL object
    URL.revokeObjectURL(url);

    toast.success(`Downloaded ${selectedFile.name}`);
  }

  // Navigate to chat with file reference
  function useInChat() {
    if (selectedFile && projectId) {
      // Navigate to chat page with file path as search param
      goto(`/projects/${projectId}/chat?file=${encodeURIComponent(selectedFile.path)}`);
    }
  }

  let projectId = $derived($page.params.id ?? "");

  // Sandbox state for checking if running
  let sandbox = $derived(projectId ? sandboxes.list.find(s => s.id === projectId) : undefined);
  let isRunning = $derived(sandbox?.status === "running");

  // State
  let fileTree = $state<FileNode[]>([]);
  let isLoadingTree = $state(true);
  let treeError = $state<string | null>(null);

  let selectedFile = $state<FileNode | null>(null);
  let fileContent = $state<FileContent | null>(null);
  let rawBase64Content = $state<string | null>(null); // Store original base64 for binary downloads
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
   * Decode base64 to ArrayBuffer for Blob creation
   * This is needed for downloading binary files like PDFs, images, etc.
   */
  function base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer as ArrayBuffer;
  }

  /**
   * Check if a file is likely binary based on extension
   */
  function isBinaryFile(filename: string): boolean {
    const ext = filename.split(".").pop()?.toLowerCase();
    const binaryExtensions = [
      "pdf", "png", "jpg", "jpeg", "gif", "webp", "ico", "svg",
      "zip", "tar", "gz", "rar", "7z",
      "exe", "dll", "so", "dylib",
      "woff", "woff2", "ttf", "otf", "eot",
      "mp3", "mp4", "wav", "ogg", "webm", "avi", "mov",
      "doc", "docx", "xls", "xlsx", "ppt", "pptx",
      "bin", "dat", "db", "sqlite"
    ];
    return binaryExtensions.includes(ext || "");
  }

  /**
   * Get MIME type for file based on extension
   */
  function getMimeType(filename: string): string {
    const ext = filename.split(".").pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
      "pdf": "application/pdf",
      "png": "image/png",
      "jpg": "image/jpeg",
      "jpeg": "image/jpeg",
      "gif": "image/gif",
      "webp": "image/webp",
      "svg": "image/svg+xml",
      "ico": "image/x-icon",
      "zip": "application/zip",
      "json": "application/json",
      "html": "text/html",
      "css": "text/css",
      "js": "application/javascript",
      "ts": "application/typescript",
      "md": "text/markdown",
      "txt": "text/plain",
    };
    return mimeTypes[ext || ""] || "application/octet-stream";
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
      // projectId is actually sandboxId in v2 API
      fileTree = await sandboxOpencodeListFiles(projectId);
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
    rawBase64Content = null;

    try {
      // projectId is actually sandboxId in v2 API
      const response = await sandboxOpencodeGetFileContent(projectId, node.path);

      // OpenCode API returns base64 encoded content - decode it for display
      let content = response.content;
      if (content && isBase64(content)) {
        // Store raw base64 for binary file downloads
        rawBase64Content = content;
        // Decode for text display (this corrupts binary files, but we use rawBase64Content for downloads)
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
      // projectId is actually sandboxId in v2 API
      const contents = await sandboxOpencodeListFiles(projectId, path);
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
      return expandedPaths.has(node.path) ? "▼" : "▶";
    }

    const ext = node.name.split(".").pop()?.toLowerCase();
    switch (ext) {
      case "ts":
      case "tsx":
        return "◆";
      case "js":
      case "jsx":
        return "◇";
      case "svelte":
        return "●";
      case "rs":
        return "⚙";
      case "json":
        return "{}";
      case "md":
        return "#";
      case "css":
      case "scss":
        return "◈";
      case "html":
        return "<>";
      case "toml":
      case "yaml":
      case "yml":
        return "≡";
      case "png":
      case "jpg":
      case "jpeg":
      case "gif":
      case "svg":
        return "▣";
      case "lock":
        return "◉";
      default:
        return "○";
    }
  }

  function getLanguage(filename: string): string {
    // Just return the file extension - let Shiki handle language detection
    // Shiki supports 200+ languages and knows their extensions
    return filename.split(".").pop()?.toLowerCase() || "plaintext";
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

{#if !sandbox}
  <!-- Loading State -->
  <div class="h-[calc(100vh-140px)] min-h-[500px] flex items-center justify-center animate-fade-in">
    <div class="text-center animate-fade-in-up">
      <div class="relative mx-auto w-16 h-16">
        <div class="absolute inset-0 rounded-full border-2 border-[var(--cyber-cyan)]/20"></div>
        <div class="absolute inset-0 rounded-full border-2 border-transparent border-t-[var(--cyber-cyan)] animate-spin"></div>
      </div>
      <p class="mt-6 text-sm font-mono text-muted-foreground tracking-wider uppercase">
        Loading sandbox<span class="typing-cursor"></span>
      </p>
    </div>
  </div>
{:else if !isRunning}
  <SandboxNotRunning {sandbox} icon="📁" actionText="browse files" />
{:else}
  <div class="flex h-[calc(100vh-200px)] min-h-[400px] gap-4 overflow-hidden animate-fade-in">
  <!-- File Tree Panel -->
  <div class="w-72 flex-shrink-0 flex flex-col cyber-card corner-accent overflow-hidden">
    <!-- Header -->
    <div class="py-3 px-4 border-b border-border/30 bg-background/30 backdrop-blur-sm">
      <div class="flex items-center justify-between w-full">
        <h3 class="font-mono text-xs uppercase tracking-wider text-[var(--cyber-cyan)]">
          [files]
        </h3>
        <Button
          size="sm"
          variant="ghost"
          onclick={loadFileTree}
          disabled={isLoadingTree}
          class="h-7 px-2 font-mono text-xs text-muted-foreground hover:text-[var(--cyber-cyan)]"
        >
          {isLoadingTree ? "..." : "↻"}
        </Button>
      </div>
    </div>

    <!-- File Tree Content -->
    <div class="flex-1 overflow-hidden">
      <ScrollArea class="h-full">
        {#if isLoadingTree}
          <div class="p-3 space-y-2">
            {#each [1, 2, 3, 4, 5] as i}
              <div class="animate-fade-in-up stagger-{i}">
                <Skeleton class="h-6 w-full bg-muted/20" />
              </div>
            {/each}
          </div>
        {:else if treeError}
          <div class="p-4">
            <div class="p-3 rounded border border-[var(--cyber-red)]/50 bg-[var(--cyber-red)]/5">
              <span class="font-mono text-xs text-[var(--cyber-red)]">[error]</span>
              <p class="text-sm text-[var(--cyber-red)] mt-1">{treeError}</p>
            </div>
          </div>
        {:else if fileTree.length === 0}
          <div class="p-6 text-center">
            <div class="font-mono text-3xl text-[var(--cyber-cyan)]/20 mb-3">[ ]</div>
            <p class="text-sm font-mono text-muted-foreground">No files found</p>
          </div>
        {:else}
          <div class="p-2">
            {#snippet renderNode(node: FileNode, depth: number = 0)}
              <div
                class="flex items-center gap-2 py-1.5 px-2 rounded cursor-pointer text-sm font-mono
                       transition-all group
                  {selectedFile?.path === node.path
                    ? 'bg-[var(--cyber-cyan)]/10 text-[var(--cyber-cyan)] border border-[var(--cyber-cyan)]/30'
                    : 'hover:bg-muted/30 border border-transparent hover:border-border/30'}
                  {node.ignored ? 'opacity-40' : ''}"
                style="padding-left: {depth * 16 + 8}px"
                onclick={() => selectFile(node)}
                onkeydown={(e) => e.key === "Enter" && selectFile(node)}
                role="button"
                tabindex="0"
              >
                <span class="flex-shrink-0 w-4 text-center text-xs
                             {node.type === 'directory' ? 'text-[var(--cyber-amber)]' : 'text-muted-foreground'}
                             {selectedFile?.path === node.path ? 'text-[var(--cyber-cyan)]' : ''}">
                  {#if node.type === "directory" && loadingFolders.has(node.path)}
                    <span class="inline-block animate-spin">◌</span>
                  {:else}
                    {getFileIcon(node)}
                  {/if}
                </span>
                <span class="truncate text-xs">{node.name}</span>
              </div>
              {#if node.type === "directory" && expandedPaths.has(node.path)}
                <div class="border-l border-[var(--cyber-cyan)]/10 ml-4">
                  {#each sortNodes(getChildren(node.path)) as child (child.path)}
                    {@render renderNode(child, depth + 1)}
                  {/each}
                </div>
              {/if}
            {/snippet}

            {#each sortNodes(fileTree) as node (node.path)}
              {@render renderNode(node)}
            {/each}
          </div>
        {/if}
      </ScrollArea>
    </div>
  </div>

  <!-- File Content Panel -->
  <div class="flex-1 min-w-0 flex flex-col cyber-card corner-accent overflow-hidden">
    {#if selectedFile}
      <!-- File Header -->
      <div class="py-3 px-4 border-b border-border/30 bg-background/30 backdrop-blur-sm">
        <div class="flex items-center justify-between gap-4">
          <div class="min-w-0 flex-1">
            <h3 class="font-mono text-sm truncate text-foreground flex items-center gap-2">
              <span class="text-[var(--cyber-cyan)]">{getFileIcon(selectedFile)}</span>
              {selectedFile.name}
            </h3>
            <p class="text-xs font-mono truncate text-muted-foreground mt-0.5">
              {selectedFile.path}
            </p>
          </div>
          <div class="flex gap-2 flex-wrap justify-end">
            {#if isMarkdownFile(selectedFile.name)}
              <div class="flex border border-border/50 rounded overflow-hidden">
                <button
                  class="px-2 py-1 text-xs font-mono uppercase tracking-wider transition-colors
                         {markdownViewMode === 'raw'
                           ? 'bg-[var(--cyber-cyan)]/20 text-[var(--cyber-cyan)]'
                           : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'}"
                  onclick={() => markdownViewMode = "raw"}
                >
                  Raw
                </button>
                <button
                  class="px-2 py-1 text-xs font-mono uppercase tracking-wider transition-colors
                         {markdownViewMode === 'preview'
                           ? 'bg-[var(--cyber-cyan)]/20 text-[var(--cyber-cyan)]'
                           : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'}"
                  onclick={() => markdownViewMode = "preview"}
                >
                  Preview
                </button>
              </div>
            {/if}
            <Button
              size="sm"
              variant="outline"
              onclick={copyPath}
              title="Copy file path to clipboard"
              class="h-7 px-2 font-mono text-xs border-border/50 hover:border-[var(--cyber-cyan)]/50
                     hover:text-[var(--cyber-cyan)]"
            >
              Path
            </Button>
            <Button
              size="sm"
              variant="outline"
              onclick={useInChat}
              title="Reference this file in chat"
              class="h-7 px-2 font-mono text-xs border-border/50 hover:border-[var(--cyber-emerald)]/50
                     hover:text-[var(--cyber-emerald)]"
            >
              Chat
            </Button>
            <Button
              size="sm"
              variant="outline"
              onclick={() => {
                if (fileContent?.content) {
                  navigator.clipboard.writeText(fileContent.content);
                  toast.success("Content copied to clipboard");
                }
              }}
              disabled={!fileContent?.content}
              title="Copy file content to clipboard"
              class="h-7 px-2 font-mono text-xs border-border/50 hover:border-[var(--cyber-amber)]/50
                     hover:text-[var(--cyber-amber)] disabled:opacity-30"
            >
              Copy
            </Button>
            <Button
              size="sm"
              variant="outline"
              onclick={downloadFile}
              disabled={!fileContent?.content}
              title="Download file"
              class="h-7 px-2 font-mono text-xs border-border/50 hover:border-[var(--cyber-magenta)]/50
                     hover:text-[var(--cyber-magenta)] disabled:opacity-30"
            >
              ↓
            </Button>
          </div>
        </div>
      </div>

      <!-- File Content -->
      <div class="flex-1 overflow-hidden bg-black/20">
        <ScrollArea class="h-full" orientation="both">
          {#if isLoadingContent}
            <div class="p-4 space-y-2">
              {#each [1, 2, 3, 4, 5, 6, 7, 8] as i}
                <div class="animate-fade-in-up stagger-{i}">
                  <Skeleton class="h-4 w-full bg-muted/20" />
                </div>
              {/each}
            </div>
          {:else if contentError}
            <div class="p-4">
              <div class="p-4 rounded border border-[var(--cyber-red)]/50 bg-[var(--cyber-red)]/5">
                <span class="font-mono text-xs uppercase tracking-wider text-[var(--cyber-red)]">[error]</span>
                <p class="text-sm text-[var(--cyber-red)] mt-2">{contentError}</p>
              </div>
            </div>
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
      </div>
    {:else}
      <!-- No File Selected State -->
      <div class="flex-1 flex items-center justify-center">
        <div class="text-center animate-fade-in-up p-8">
          <div class="font-mono text-5xl text-[var(--cyber-cyan)]/20 mb-4">○</div>
          <p class="text-lg font-medium font-heading">
            No file selected
          </p>
          <p class="text-sm font-mono text-muted-foreground mt-2">
            Select a file from the tree to view its contents
          </p>
          <div class="mt-6 flex justify-center gap-4 text-xs font-mono text-muted-foreground/50">
            <span>▶ folder</span>
            <span>○ file</span>
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>
{/if}
