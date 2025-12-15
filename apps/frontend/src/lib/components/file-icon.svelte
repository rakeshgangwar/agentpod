<script lang="ts">
  import { getIcon } from "material-file-icons";

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

  // Get the appropriate icon
  let icon = $derived.by(() => {
    if (isDirectory) {
      // Use folder icons for directories
      return isExpanded ? getIcon("folder-open") : getIcon("folder");
    }
    return getIcon(filename);
  });

  // Size classes
  const sizeClasses = {
    xs: "w-3 h-3",
    sm: "w-4 h-4",
    md: "w-5 h-5",
    lg: "w-6 h-6"
  };
</script>

<span
  class="file-icon inline-flex items-center justify-center flex-shrink-0 {sizeClasses[size]} {className}"
  title={icon.name}
>
  {@html icon.svg}
</span>

<style>
  .file-icon :global(svg) {
    width: 100%;
    height: 100%;
  }
</style>
