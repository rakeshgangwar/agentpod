<script lang="ts">
  import CheckIcon from "@lucide/svelte/icons/check";
  import XIcon from "@lucide/svelte/icons/x";
  import LoaderIcon from "@lucide/svelte/icons/loader-2";
  import SkipForwardIcon from "@lucide/svelte/icons/skip-forward";

  type ExecutionStatus = "idle" | "running" | "success" | "error" | "skipped";

  interface Props {
    status: ExecutionStatus;
    error?: string;
  }

  let { status, error }: Props = $props();

  const statusConfig = $derived({
    idle: {
      bgClass: "bg-muted-foreground/20",
      textClass: "text-muted-foreground",
      label: "Idle",
      dotClass: "bg-muted-foreground",
    },
    running: {
      bgClass: "bg-amber-500/20",
      textClass: "text-amber-500",
      label: "Running",
      dotClass: "bg-amber-500",
    },
    success: {
      bgClass: "bg-emerald-500/20",
      textClass: "text-emerald-500",
      label: "Success",
      dotClass: "bg-emerald-500",
    },
    error: {
      bgClass: "bg-red-500/20",
      textClass: "text-red-500",
      label: "Error",
      dotClass: "bg-red-500",
    },
    skipped: {
      bgClass: "bg-slate-400/20",
      textClass: "text-slate-400",
      label: "Skipped",
      dotClass: "bg-slate-400",
    },
  }[status]);
</script>

<div class="flex items-center gap-2">
  {#if status === "running"}
    <LoaderIcon class="w-3 h-3 text-amber-500 animate-spin" />
  {:else if status === "success"}
    <CheckIcon class="w-3 h-3 text-emerald-500" />
  {:else if status === "error"}
    <XIcon class="w-3 h-3 text-red-500" />
  {:else if status === "skipped"}
    <SkipForwardIcon class="w-3 h-3 text-slate-400" />
  {:else}
    <div class="w-1.5 h-1.5 rounded-full {statusConfig.dotClass}"></div>
  {/if}
  
  <div class="text-[10px] font-mono uppercase tracking-wide {statusConfig.textClass}">
    {statusConfig.label}
  </div>
</div>

{#if status === "error" && error}
  <div class="mt-2 p-2 rounded bg-red-500/10 border border-red-500/30">
    <div class="text-[10px] text-red-500 font-mono truncate" title={error}>
      {error}
    </div>
  </div>
{/if}
