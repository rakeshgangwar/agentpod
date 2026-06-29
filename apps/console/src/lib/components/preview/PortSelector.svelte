<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import * as Select from "$lib/components/ui/select";
  import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
  import type { PreviewPort } from "$lib/stores/preview.svelte";
  import { createEventDispatcher } from "svelte";

  let { 
    ports = [], 
    selectedPort = null, 
    onSelect,
    onDetect,
    isDetecting = false
  } = $props<{ 
    ports: PreviewPort[]; 
    selectedPort: number | null; 
    onSelect: (port: number) => void;
    onDetect: () => void;
    isDetecting?: boolean;
  }>();

  let selectedValue = $derived(
    selectedPort ? selectedPort.toString() : 
    ports.length > 0 ? ports[0].port.toString() : ""
  );

  function handleValueChange(value: string) {
    if (value) {
      onSelect(parseInt(value, 10));
    }
  }
</script>

<div class="flex items-center gap-2">
  <div class="w-[180px]">
    {#if ports.length > 0}
      <Select.Root type="single" value={selectedValue} onValueChange={handleValueChange}>
        <Select.Trigger class="h-7 text-xs font-mono border-border/60 bg-background/50">
          {#if selectedPort}
            <div class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
              PORT {selectedPort}
            </div>
          {:else}
            Select Port
          {/if}
        </Select.Trigger>
        <Select.Content>
          {#each ports as port (port.id)}
            <Select.Item value={port.port.toString()} class="font-mono text-xs">
              <div class="flex items-center justify-between w-full gap-4">
                <span>PORT {port.port}</span>
                {#if port.label}
                  <span class="text-muted-foreground opacity-70">{port.label}</span>
                {/if}
              </div>
            </Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    {:else}
      <div class="h-7 px-3 flex items-center text-xs font-mono text-muted-foreground border border-border/60 rounded-md bg-muted/20 opacity-70 cursor-not-allowed">
        No ports detected
      </div>
    {/if}
  </div>

  <Button 
    variant="outline" 
    size="sm" 
    class="h-7 text-xs gap-1.5 px-2.5 font-mono border-border/60 hover:border-[var(--cyber-cyan)]/50 hover:text-[var(--cyber-cyan)] transition-colors"
    disabled={isDetecting}
    onclick={onDetect}
  >
    <RefreshCwIcon class="h-3 w-3 {isDetecting ? 'animate-spin' : ''}" />
    {isDetecting ? 'Detecting...' : 'Detect'}
  </Button>
</div>
