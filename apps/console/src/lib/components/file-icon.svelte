<script lang="ts">
  import { getIcon } from "material-file-icons";
  import { Folder, FolderOpen } from "@lucide/svelte";

  interface Props {
    /** Filename to get icon for */
    filename: string;
    /** Whether this is a directory */
    isDirectory?: boolean;
    /** Whether the directory is expanded */
    isExpanded?: boolean;
    /** Size class for the icon */
    size?: "xs" | "sm" | "md" | "lg";
    /** Additional CSS classes */
    class?: string;
  }

  let {
    filename,
    isDirectory = false,
    isExpanded = false,
    size = "sm",
    class: className = ""
  }: Props = $props();

  // Get the appropriate file icon (only used for files, not directories)
  let fileIcon = $derived.by(() => {
    if (isDirectory) {
      return null; // We use Lucide icons for directories
    }
    return getIcon(filename);
  });

  // Size classes for the container
  const sizeClasses = {
    xs: "w-3 h-3",
    sm: "w-4 h-4",
    md: "w-5 h-5",
    lg: "w-6 h-6"
  };

  // Lucide icon sizes (slightly smaller than container for visual balance)
  const lucideSizes = {
    xs: 12,
    sm: 16,
    md: 20,
    lg: 24
  };
</script>

{#if isDirectory}
  <!-- Use Lucide icons for directories (material-file-icons doesn't have folder icons) -->
  <span
    class="file-icon inline-flex items-center justify-center flex-shrink-0 {sizeClasses[size]} {className} text-[var(--cyber-amber)]"
    title={isExpanded ? "folder-open" : "folder"}
  >
    {#if isExpanded}
      <FolderOpen size={lucideSizes[size]} />
    {:else}
      <Folder size={lucideSizes[size]} />
    {/if}
  </span>
{:else if fileIcon}
  <!-- Use material-file-icons for files -->
  <span
    class="file-icon inline-flex items-center justify-center flex-shrink-0 {sizeClasses[size]} {className}"
    title={fileIcon.name}
  >
    {@html fileIcon.svg}
  </span>
{/if}

<style>
  .file-icon :global(svg) {
    width: 100%;
    height: 100%;
  }
</style>
