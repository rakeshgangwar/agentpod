<script lang="ts">
  /**
   * DiffLine Component
   * 
   * Renders a single line from a git diff with proper syntax coloring.
   * Shows line numbers (old/new), change indicator (+/-/ ), and content.
   */

  type DiffLineType = "context" | "addition" | "deletion";

  interface DiffLineData {
    type: DiffLineType;
    content: string;
    oldLineNumber?: number;
    newLineNumber?: number;
  }

  interface Props {
    line: DiffLineData;
    showLineNumbers?: boolean;
  }

  let { line, showLineNumbers = true }: Props = $props();

  // Compute line styling based on type
  function getLineStyle(type: DiffLineType) {
    switch (type) {
      case "addition":
        return {
          bg: "bg-[var(--cyber-emerald)]/10",
          border: "border-l-2 border-l-[var(--cyber-emerald)]",
          text: "text-foreground",
          indicator: "+",
          indicatorColor: "text-[var(--cyber-emerald)]",
        };
      case "deletion":
        return {
          bg: "bg-[var(--cyber-red)]/10",
          border: "border-l-2 border-l-[var(--cyber-red)]",
          text: "text-foreground",
          indicator: "-",
          indicatorColor: "text-[var(--cyber-red)]",
        };
      case "context":
      default:
        return {
          bg: "bg-transparent",
          border: "border-l-2 border-l-transparent",
          text: "text-muted-foreground",
          indicator: " ",
          indicatorColor: "text-muted-foreground/50",
        };
    }
  }

  let style = $derived(getLineStyle(line.type));
</script>

<div
  class="flex items-stretch font-mono text-xs leading-5 {style.bg} {style.border} hover:brightness-105 transition-all"
>
  <!-- Line numbers -->
  {#if showLineNumbers}
    <div class="flex-shrink-0 flex select-none text-muted-foreground/50 bg-muted/30">
      <!-- Old line number -->
      <span class="w-10 text-right px-1.5 border-r border-border/20">
        {line.oldLineNumber ?? ""}
      </span>
      <!-- New line number -->
      <span class="w-10 text-right px-1.5 border-r border-border/20">
        {line.newLineNumber ?? ""}
      </span>
    </div>
  {/if}

  <!-- Change indicator -->
  <span
    class="w-5 flex-shrink-0 text-center select-none font-bold {style.indicatorColor}"
  >
    {style.indicator}
  </span>

  <!-- Line content -->
  <pre
    class="flex-1 px-2 overflow-x-auto whitespace-pre {style.text}"
  >{line.content}</pre>
</div>
