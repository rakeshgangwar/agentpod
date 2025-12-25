<script lang="ts">
  import CheckIcon from "@lucide/svelte/icons/check";
  import XIcon from "@lucide/svelte/icons/x";
  import LoaderIcon from "@lucide/svelte/icons/loader-2";

  type ExecutionStatus = "idle" | "running" | "success" | "error";

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
      bgClass: "bg-[var(--cyber-cyan)]/20",
      textClass: "text-[var(--cyber-cyan)]",
      label: "Running",
      dotClass: "bg-[var(--cyber-cyan)]",
    },
    success: {
      bgClass: "bg-[var(--cyber-emerald)]/20",
      textClass: "text-[var(--cyber-emerald)]",
      label: "Success",
      dotClass: "bg-[var(--cyber-emerald)]",
    },
    error: {
      bgClass: "bg-[var(--cyber-red)]/20",
      textClass: "text-[var(--cyber-red)]",
      label: "Error",
      dotClass: "bg-[var(--cyber-red)]",
    },
  }[status]);
</script>

<div class="flex items-center gap-2">
  {#if status === "running"}
    <LoaderIcon class="w-3 h-3 text-[var(--cyber-cyan)] animate-spin" />
  {:else if status === "success"}
    <CheckIcon class="w-3 h-3 text-[var(--cyber-emerald)]" />
  {:else if status === "error"}
    <XIcon class="w-3 h-3 text-[var(--cyber-red)]" />
  {:else}
    <div class="w-1.5 h-1.5 rounded-full {statusConfig.dotClass}"></div>
  {/if}
  
  <div class="text-[10px] font-mono uppercase tracking-wide {statusConfig.textClass}">
    {statusConfig.label}
  </div>
</div>

{#if status === "error" && error}
  <div class="mt-2 p-2 rounded bg-[var(--cyber-red)]/10 border border-[var(--cyber-red)]/30">
    <div class="text-[10px] text-[var(--cyber-red)] font-mono truncate" title={error}>
      {error}
    </div>
  </div>
{/if}
