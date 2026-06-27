<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { sandboxes, startSandbox } from "$lib/stores/sandboxes.svelte";
  import type { Sandbox } from "$lib/api/tauri";

  interface Props {
    sandbox: Sandbox;
    icon: string;
    actionText: string;
    class?: string;
  }

  let { sandbox, icon, actionText, class: className = "" }: Props = $props();
</script>

<div class="h-[calc(100vh-140px)] min-h-[500px] flex items-center justify-center animate-fade-in {className}">
  <div class="text-center animate-fade-in-up cyber-card corner-accent p-12">
    <div class="font-mono text-5xl text-[var(--cyber-amber)]/30 mb-6">{icon}</div>
    <h3 class="text-lg font-bold">
      Sandbox Not Running
    </h3>
    <p class="text-sm font-mono text-muted-foreground mt-2">
      Start the sandbox to {actionText}
    </p>
    <div class="mt-4 flex items-center justify-center gap-2">
      <span class="font-mono text-xs text-muted-foreground uppercase tracking-wider">Status:</span>
      <span class="status-indicator status-stopped">
        <span class="status-dot"></span>
        <span>{sandbox.status}</span>
      </span>
    </div>
    <Button
      onclick={() => startSandbox(sandbox.id)}
      disabled={sandboxes.isLoading}
      class="mt-6 font-mono text-xs uppercase tracking-wider
             bg-[var(--cyber-emerald)] hover:bg-[var(--cyber-emerald)]/90 text-[var(--cyber-emerald-foreground)]"
    >
      {sandboxes.isLoading ? "Starting..." : "Start Sandbox"}
    </Button>
  </div>
</div>
