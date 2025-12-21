<script lang="ts">
  import { onMount } from "svelte";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { quickTask, type TaskTemplate } from "$lib/stores/quick-task.svelte";
  import { cn } from "$lib/utils";

  import SparklesIcon from "@lucide/svelte/icons/sparkles";
  import SendIcon from "@lucide/svelte/icons/send";
  import CopyIcon from "@lucide/svelte/icons/copy";
  import XIcon from "@lucide/svelte/icons/x";
  import HistoryIcon from "@lucide/svelte/icons/history";
  import ZapIcon from "@lucide/svelte/icons/zap";
  import CheckIcon from "@lucide/svelte/icons/check";

  let message = $state("");
  let showHistory = $state(false);
  let selectedTemplate = $state<TaskTemplate | null>(null);
  let copied = $state(false);

  function handleKeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !quickTask.isStreaming) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === "Escape") {
      quickTask.close();
    }
  }

  async function handleSubmit() {
    if (!message.trim() || quickTask.isStreaming) return;

    await quickTask.run(message, {
      templateId: selectedTemplate?.id,
    });
  }

  async function copyResponse() {
    await navigator.clipboard.writeText(quickTask.currentResponse);
    copied = true;
    setTimeout(() => (copied = false), 2000);
  }

  function useTemplate(template: TaskTemplate) {
    selectedTemplate = template;
    if (!template.placeholders?.length) {
      message = template.prompt;
    } else {
      message = template.prompt;
    }
  }

  function loadFromHistory(task: (typeof quickTask.history)[0]) {
    message = task.message;
    showHistory = false;
  }

  function handleOpenChange(open: boolean) {
    if (!open) {
      quickTask.close();
    }
  }

  onMount(() => {
    quickTask.loadTemplates();
    quickTask.loadHistory();
  });
</script>

<Dialog.Root open={quickTask.isOpen} onOpenChange={handleOpenChange}>
  <Dialog.Content
    class="max-w-3xl max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden"
    showCloseButton={false}
    onkeydown={handleKeydown}
  >
    <div
      class="flex items-center justify-between px-6 py-4 border-b border-border/50"
    >
      <div class="flex items-center gap-3">
        <div
          class="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--cyber-cyan)]/20 to-[var(--cyber-magenta)]/20
                  flex items-center justify-center border border-[var(--cyber-cyan)]/30"
        >
          <SparklesIcon class="w-4 h-4 text-[var(--cyber-cyan)]" />
        </div>
        <div>
          <Dialog.Title class="text-lg font-semibold">Quick AI Task</Dialog.Title>
          <Dialog.Description class="text-xs text-muted-foreground">
            Run AI tasks instantly
          </Dialog.Description>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon-sm"
          onclick={() => (showHistory = !showHistory)}
          title="Task History"
        >
          <HistoryIcon class="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onclick={() => quickTask.close()}
        >
          <XIcon class="h-4 w-4" />
        </Button>
      </div>
    </div>

    <div class="flex flex-1 overflow-hidden min-h-0">
      {#if quickTask.templates.length > 0 && !showHistory}
        <div
          class="w-48 border-r border-border/30 p-3 overflow-y-auto hidden md:block"
        >
          <p
            class="text-xs font-mono uppercase text-muted-foreground mb-3 px-2"
          >
            Templates
          </p>

          {#each quickTask.templates as template}
            <button
              onclick={() => useTemplate(template)}
              class={cn(
                "w-full text-left px-3 py-2 rounded-md text-sm mb-1 transition-colors",
                "hover:bg-muted/50",
                selectedTemplate?.id === template.id &&
                  "bg-[var(--cyber-cyan)]/10 text-[var(--cyber-cyan)]"
              )}
            >
              <div class="flex items-center gap-2">
                <span class="text-base">{template.icon}</span>
                <span class="truncate">{template.name}</span>
              </div>
            </button>
          {/each}
        </div>
      {/if}

      {#if showHistory}
        <div class="w-64 border-r border-border/30 p-3 overflow-y-auto">
          <p
            class="text-xs font-mono uppercase text-muted-foreground mb-3 px-2"
          >
            Recent Tasks
          </p>

          {#if quickTask.history.length === 0}
            <p class="text-sm text-muted-foreground px-2">No tasks yet</p>
          {:else}
            {#each quickTask.history as task}
              <button
                onclick={() => loadFromHistory(task)}
                class="w-full text-left p-2 rounded-md hover:bg-muted/50 mb-1"
              >
                <p class="text-xs font-mono text-muted-foreground mb-1">
                  {new Date(task.createdAt).toLocaleTimeString()}
                </p>
                <p class="text-sm truncate">{task.message}</p>
                <div class="flex items-center gap-2 mt-1">
                  <span
                    class={cn(
                      "w-1.5 h-1.5 rounded-full",
                      task.status === "completed" &&
                        "bg-[var(--cyber-emerald)]",
                      task.status === "failed" && "bg-[var(--cyber-red)]",
                      task.status === "streaming" &&
                        "bg-[var(--cyber-amber)] animate-pulse"
                    )}
                  ></span>
                  <span class="text-[10px] text-muted-foreground"
                    >{task.provider}</span
                  >
                </div>
              </button>
            {/each}
          {/if}
        </div>
      {/if}

      <div class="flex-1 flex flex-col p-4 overflow-hidden min-h-0">
        <div class="space-y-2 mb-4">
          <textarea
            bind:value={message}
            placeholder="What do you need help with?"
            rows={4}
            class="w-full font-mono text-sm resize-none bg-background border border-border rounded-md p-3 focus:outline-none focus:ring-2 focus:ring-[var(--cyber-cyan)]/50"
            disabled={quickTask.isStreaming}
          ></textarea>
          <div
            class="flex items-center justify-between text-xs text-muted-foreground font-mono"
          >
            <span>
              {#if selectedTemplate}
                Using: {selectedTemplate.name}
                <button
                  onclick={() => (selectedTemplate = null)}
                  class="ml-1 text-[var(--cyber-cyan)]"
                >
                  (clear)
                </button>
              {:else}
                Cmd+Enter to send
              {/if}
            </span>
            <span>{message.length} chars</span>
          </div>
        </div>

        <div class="flex-1 overflow-y-auto min-h-0">
          {#if quickTask.error}
            <div class="cyber-card p-4 border-[var(--cyber-red)]/50 mb-4">
              <div class="flex items-center gap-2 text-[var(--cyber-red)]">
                <XIcon class="h-4 w-4" />
                <span class="text-sm">{quickTask.error}</span>
              </div>
            </div>
          {/if}

          {#if quickTask.statusMessage && quickTask.isStreaming}
            <div class="mb-4 text-sm text-muted-foreground font-mono">
              {quickTask.statusMessage}
            </div>
          {/if}

          {#if quickTask.currentResponse || quickTask.isStreaming}
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <h4
                    class="text-xs font-mono uppercase tracking-wider text-[var(--cyber-cyan)]"
                  >
                    Response
                  </h4>
                  {#if quickTask.isStreaming}
                    <span
                      class="flex items-center gap-1 text-xs text-[var(--cyber-amber)]"
                    >
                      <span
                        class="w-1.5 h-1.5 rounded-full bg-[var(--cyber-amber)] animate-pulse"
                      ></span>
                      Streaming...
                    </span>
                  {/if}
                </div>

                {#if quickTask.currentResponse}
                  <Button size="sm" variant="ghost" onclick={copyResponse}>
                    {#if copied}
                      <CheckIcon class="h-3 w-3 mr-1" />
                      Copied!
                    {:else}
                      <CopyIcon class="h-3 w-3 mr-1" />
                      Copy
                    {/if}
                  </Button>
                {/if}
              </div>

              <div class="cyber-card p-4 max-h-64 overflow-y-auto">
                <pre class="text-sm font-mono whitespace-pre-wrap">{quickTask.currentResponse}{#if quickTask.isStreaming}<span class="typing-cursor"></span>{/if}</pre>
              </div>
            </div>
          {:else}
            <div
              class="flex flex-col items-center justify-center h-32 text-muted-foreground"
            >
              <ZapIcon class="h-8 w-8 mb-2 opacity-30" />
              <p class="text-sm">Ask anything, get instant AI assistance</p>
            </div>
          {/if}
        </div>
      </div>
    </div>

    <div
      class="flex items-center justify-between px-6 py-4 border-t border-border/50 bg-muted/30"
    >
      <div class="flex items-center gap-2 text-xs text-muted-foreground font-mono">
        {#if quickTask.providersLoading}
          <span class="w-1.5 h-1.5 rounded-full bg-[var(--cyber-amber)] animate-pulse"></span>
          <span>Checking...</span>
        {:else if quickTask.hasCloudflare}
          <span class="w-1.5 h-1.5 rounded-full bg-[var(--cyber-emerald)]"></span>
          <span>Cloudflare Edge</span>
        {:else if quickTask.hasDocker}
          <span class="w-1.5 h-1.5 rounded-full bg-[var(--cyber-cyan)]"></span>
          <span>Docker Sandbox</span>
        {:else}
          <span class="w-1.5 h-1.5 rounded-full bg-[var(--cyber-red)]"></span>
          <span>No provider</span>
        {/if}
      </div>

      <div class="flex gap-2">
        {#if quickTask.isStreaming}
          <Button variant="destructive" onclick={() => quickTask.cancel()}>
            <XIcon class="h-4 w-4 mr-2" />
            Cancel
          </Button>
        {:else}
          <Button variant="ghost" onclick={() => quickTask.close()}>
            Close
          </Button>
          <Button onclick={handleSubmit} disabled={!message.trim()}>
            <SendIcon class="h-4 w-4 mr-2" />
            Run Task
          </Button>
        {/if}
      </div>
    </div>
  </Dialog.Content>
</Dialog.Root>
