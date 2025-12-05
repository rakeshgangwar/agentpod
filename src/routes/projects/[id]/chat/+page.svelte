<script lang="ts">
  import { page } from "$app/stores";
  import * as Card from "$lib/components/ui/card";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import * as ScrollArea from "$lib/components/ui/scroll-area";

  let projectId = $derived($page.params.id);
  
  // Chat state (placeholder - will be connected to OpenCode API)
  let messages = $state<Array<{ id: string; role: "user" | "assistant"; content: string }>>([]);
  let inputValue = $state("");
  let isLoading = $state(false);

  async function handleSend() {
    if (!inputValue.trim() || isLoading) return;
    
    const userMessage = {
      id: crypto.randomUUID(),
      role: "user" as const,
      content: inputValue.trim(),
    };
    
    messages = [...messages, userMessage];
    inputValue = "";
    isLoading = true;

    // TODO: Send to OpenCode API via Management API
    // For now, just add a placeholder response
    setTimeout(() => {
      messages = [...messages, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "This is a placeholder response. Chat functionality will be connected to OpenCode in the next phase.",
      }];
      isLoading = false;
    }, 1000);
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }
</script>

<div class="flex flex-col h-[60vh]">
  <!-- Messages Area -->
  <ScrollArea.Root class="flex-1 pr-4">
    <div class="space-y-4 p-4">
      {#if messages.length === 0}
        <div class="text-center text-muted-foreground py-12">
          <p>No messages yet.</p>
          <p class="text-sm mt-1">Send a message to start a conversation with OpenCode.</p>
        </div>
      {:else}
        {#each messages as message (message.id)}
          <div class="flex {message.role === 'user' ? 'justify-end' : 'justify-start'}">
            <div class="max-w-[80%] rounded-lg px-4 py-2 {message.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'}">
              <p class="whitespace-pre-wrap">{message.content}</p>
            </div>
          </div>
        {/each}
        {#if isLoading}
          <div class="flex justify-start">
            <div class="max-w-[80%] rounded-lg px-4 py-2 bg-muted">
              <div class="flex gap-1">
                <span class="animate-bounce">.</span>
                <span class="animate-bounce" style="animation-delay: 0.1s">.</span>
                <span class="animate-bounce" style="animation-delay: 0.2s">.</span>
              </div>
            </div>
          </div>
        {/if}
      {/if}
    </div>
  </ScrollArea.Root>

  <!-- Input Area -->
  <div class="border-t p-4">
    <div class="flex gap-2">
      <Input
        placeholder="Type a message..."
        bind:value={inputValue}
        onkeydown={handleKeyDown}
        disabled={isLoading}
        class="flex-1"
      />
      <Button onclick={handleSend} disabled={!inputValue.trim() || isLoading}>
        Send
      </Button>
    </div>
    <p class="text-xs text-muted-foreground mt-2">
      Press Enter to send, Shift+Enter for new line
    </p>
  </div>
</div>
