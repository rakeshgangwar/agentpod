<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import * as Collapsible from "$lib/components/ui/collapsible";
  import ScrollArea from "$lib/components/ui/scroll-area/scroll-area.svelte";
  import TerminalIcon from "@lucide/svelte/icons/terminal";
  import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
  import ChevronUpIcon from "@lucide/svelte/icons/chevron-up";
  import Trash2Icon from "@lucide/svelte/icons/trash-2";
  import XCircleIcon from "@lucide/svelte/icons/x-circle";
  import AlertTriangleIcon from "@lucide/svelte/icons/alert-triangle";
  import InfoIcon from "@lucide/svelte/icons/info";
  
  export interface ConsoleLog {
    type: 'log' | 'info' | 'warn' | 'error';
    message: string;
    timestamp: number;
    count?: number;
  }

  let { logs = [], onClear } = $props<{
    logs: ConsoleLog[];
    onClear: () => void;
  }>();

  let isOpen = $state(false);

  function formatTime(timestamp: number) {
    return new Date(timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function getIcon(type: string) {
    switch (type) {
      case 'error': return XCircleIcon;
      case 'warn': return AlertTriangleIcon;
      default: return InfoIcon;
    }
  }

  function getColor(type: string) {
    switch (type) {
      case 'error': return 'text-red-500';
      case 'warn': return 'text-yellow-500';
      default: return 'text-blue-500';
    }
  }
</script>

<Collapsible.Root bind:open={isOpen} class="border-t border-border bg-background">
  <div class="flex items-center justify-between px-3 h-8 bg-muted/30 select-none">
    <Collapsible.Trigger class="flex items-center gap-2 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors">
      {#if isOpen}
        <ChevronDownIcon class="h-3.5 w-3.5" />
      {:else}
        <ChevronUpIcon class="h-3.5 w-3.5" />
      {/if}
      <TerminalIcon class="h-3.5 w-3.5" />
      <span>Console ({logs.length})</span>
      
      {#if logs.some(l => l.type === 'error')}
        <span class="flex items-center gap-1 text-red-500 ml-2">
          <XCircleIcon class="h-3 w-3" />
          {logs.filter(l => l.type === 'error').length}
        </span>
      {/if}
      {#if logs.some(l => l.type === 'warn')}
        <span class="flex items-center gap-1 text-yellow-500 ml-1">
          <AlertTriangleIcon class="h-3 w-3" />
          {logs.filter(l => l.type === 'warn').length}
        </span>
      {/if}
    </Collapsible.Trigger>

    <div class="flex items-center gap-1">
      <Button variant="ghost" size="icon" class="h-6 w-6" onclick={onClear} title="Clear console">
        <Trash2Icon class="h-3 w-3 text-muted-foreground hover:text-destructive" />
      </Button>
    </div>
  </div>

  <Collapsible.Content>
    <div class="h-48 border-t border-border bg-black/50 font-mono text-xs">
      <ScrollArea class="h-full">
        <div class="p-2 space-y-0.5">
          {#if logs.length === 0}
            <div class="text-muted-foreground/50 italic px-2 py-1">No logs captured</div>
          {:else}
            {#each logs as log}
              {@const Icon = getIcon(log.type)}
              <div class="flex items-start gap-2 px-2 py-0.5 hover:bg-white/5 rounded-sm group">
                <span class="text-muted-foreground/40 shrink-0 select-none w-16">{formatTime(log.timestamp)}</span>
                <Icon class="h-3.5 w-3.5 mt-0.5 shrink-0 {getColor(log.type)}" />
                <span class="break-all whitespace-pre-wrap flex-1 leading-relaxed {log.type === 'error' ? 'text-red-400' : log.type === 'warn' ? 'text-yellow-400' : 'text-foreground/90'}">
                  {log.message}
                </span>
                {#if log.count && log.count > 1}
                  <span class="shrink-0 bg-white/10 text-white/70 px-1.5 rounded-full text-[10px] font-bold min-w-[18px] text-center">
                    {log.count}
                  </span>
                {/if}
              </div>
            {/each}
          {/if}
        </div>
      </ScrollArea>
    </div>
  </Collapsible.Content>
</Collapsible.Root>
