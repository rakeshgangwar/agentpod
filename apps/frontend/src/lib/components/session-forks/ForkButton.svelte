<script lang="ts">
  import { GitFork } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button";
  import * as Tooltip from "$lib/components/ui/tooltip";
  import ForkSessionDialog from "./ForkSessionDialog.svelte";
  
  interface Props {
    sandboxId: string;
    sessionId: string;
    sessionTitle?: string;
    messageId?: string;
    variant?: "default" | "ghost" | "outline";
    size?: "default" | "sm" | "icon";
    showLabel?: boolean;
    onForkCreated?: (forkId: string) => void;
  }
  
  let { 
    sandboxId, 
    sessionId,
    sessionTitle,
    messageId,
    variant = "ghost",
    size = "sm",
    showLabel = false,
    onForkCreated
  }: Props = $props();
  
  let dialogOpen = $state(false);
  
  function handleClick() {
    dialogOpen = true;
  }
  
  function handleForkCreated(forkId: string) {
    onForkCreated?.(forkId);
  }
</script>

<Tooltip.Root>
  <Tooltip.Trigger>
    <Button 
      {variant} 
      {size}
      onclick={handleClick}
      class="gap-1.5"
    >
      <GitFork class="h-4 w-4" />
      {#if showLabel}
        <span>Fork</span>
      {/if}
    </Button>
  </Tooltip.Trigger>
  <Tooltip.Portal>
    <Tooltip.Content side="top">
      {#if messageId}
        Fork from this message
      {:else}
        Fork this session
      {/if}
    </Tooltip.Content>
  </Tooltip.Portal>
</Tooltip.Root>

<ForkSessionDialog
  {sandboxId}
  {sessionId}
  {sessionTitle}
  {messageId}
  open={dialogOpen}
  onOpenChange={(open) => dialogOpen = open}
  onForkCreated={handleForkCreated}
/>
