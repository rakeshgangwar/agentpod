<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import * as Select from "$lib/components/ui/select";
  import Trash2Icon from "@lucide/svelte/icons/trash-2";
  import ZapIcon from "@lucide/svelte/icons/zap";
  import BotIcon from "@lucide/svelte/icons/bot";
  import GitBranchIcon from "@lucide/svelte/icons/git-branch";
  import SendIcon from "@lucide/svelte/icons/send";
  import XIcon from "@lucide/svelte/icons/x";
  import type { ISvelteFlowNode } from "@agentpod/types";
  import type { Component } from "svelte";

  interface Props {
    selectedNode: ISvelteFlowNode | null;
    onNodeUpdate: (nodeId: string, updates: Partial<ISvelteFlowNode>) => void;
    onNodeDelete?: (nodeId: string) => void;
    onClose?: () => void;
  }

  let {
    selectedNode,
    onNodeUpdate,
    onNodeDelete,
    onClose,
  }: Props = $props();

  let nodeName = $state("");
  let nodePrompt = $state("");
  let nodeModel = $state("claude-3-5-sonnet");
  let nodeTimeout = $state(30000);
  let nodeTriggerType = $state("manual");
  let nodeUrl = $state("");
  let nodeMethod = $state("GET");
  let nodeCondition = $state("");
  let nodeHeaders = $state<Array<{ key: string; value: string }>>([]);

  $effect(() => {
    if (selectedNode) {
      nodeName = selectedNode.data.label as string || "";
      nodePrompt = selectedNode.data.prompt as string || "";
      nodeModel = selectedNode.data.model as string || "claude-3-5-sonnet";
      nodeTimeout = selectedNode.data.timeout as number || 30000;
      nodeTriggerType = selectedNode.data.triggerType as string || "manual";
      nodeUrl = selectedNode.data.url as string || "";
      nodeMethod = selectedNode.data.method as string || "GET";
      nodeCondition = selectedNode.data.condition as string || "";
      nodeHeaders = selectedNode.data.headers as Array<{ key: string; value: string }> || [];
    }
  });

  function handleUpdate() {
    if (!selectedNode) return;

    const baseData = { ...selectedNode.data, label: nodeName };
    let updatedData: Record<string, unknown> = baseData;

    if (selectedNode.type?.includes("ai")) {
      updatedData = {
        ...updatedData,
        prompt: nodePrompt,
        model: nodeModel,
        timeout: nodeTimeout,
      };
    }

    if (selectedNode.type?.includes("trigger")) {
      updatedData = {
        ...updatedData,
        triggerType: nodeTriggerType,
      };
    }

    if (selectedNode.type?.includes("http") || selectedNode.type === "action") {
      updatedData = {
        ...updatedData,
        url: nodeUrl,
        method: nodeMethod,
        headers: nodeHeaders.filter(h => h.key && h.value),
      };
    }

    if (selectedNode.type?.includes("condition")) {
      updatedData = {
        ...updatedData,
        condition: nodeCondition,
      };
    }

    onNodeUpdate(selectedNode.id, { data: updatedData });
  }

  function handleDelete() {
    if (!selectedNode || !onNodeDelete) return;
    onNodeDelete(selectedNode.id);
  }

  function addHeader() {
    nodeHeaders = [...nodeHeaders, { key: "", value: "" }];
  }

  function removeHeader(index: number) {
    nodeHeaders = nodeHeaders.filter((_, i) => i !== index);
  }

  function getNodeIcon(nodeType?: string): Component {
    if (nodeType?.includes("trigger")) return ZapIcon;
    if (nodeType?.includes("ai")) return BotIcon;
    if (nodeType?.includes("condition")) return GitBranchIcon;
    return SendIcon;
  }

  function getNodeColor(nodeType?: string) {
    if (nodeType?.includes("trigger")) return "cyber-cyan";
    if (nodeType?.includes("ai")) return "cyber-emerald";
    if (nodeType?.includes("condition")) return "cyber-amber";
    return "muted-foreground";
  }

  function getTriggerTypeLabel(value: string): string {
    const labels: Record<string, string> = {
      manual: "Manual",
      webhook: "Webhook",
      schedule: "Schedule",
      event: "Event",
    };
    return labels[value] || value;
  }

  function getModelLabel(value: string): string {
    const labels: Record<string, string> = {
      "claude-3-5-sonnet": "Claude 3.5 Sonnet",
      "claude-3-opus": "Claude 3 Opus",
      "gpt-4": "GPT-4",
      "gpt-4-turbo": "GPT-4 Turbo",
      "gpt-3.5-turbo": "GPT-3.5 Turbo",
    };
    return labels[value] || value;
  }

</script>

{#if selectedNode}
  {@const NodeIcon = getNodeIcon(selectedNode.type)}
  <div class="h-full flex flex-col bg-card/90 backdrop-blur-sm border-l border-border">
    <div class="relative border-b border-border bg-gradient-to-br from-card to-card/50">
      <div class="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[var(--{getNodeColor(selectedNode.type)})] to-transparent opacity-40"></div>
      
      <div class="p-4 space-y-3">
        <div class="flex items-start justify-between gap-3">
          <div class="flex items-center gap-3 flex-1 min-w-0">
            <div class="flex-shrink-0 w-10 h-10 rounded-sm bg-[var(--{getNodeColor(selectedNode.type)})]/20 flex items-center justify-center border border-[var(--{getNodeColor(selectedNode.type)})]/30">
              <NodeIcon class="w-5 h-5 text-[var(--{getNodeColor(selectedNode.type)})]" />
            </div>
            
            <div class="flex-1 min-w-0">
              <div class="text-sm font-semibold text-foreground truncate">
                {selectedNode.data.label || selectedNode.type}
              </div>
              <div class="text-xs text-muted-foreground font-mono uppercase tracking-wider">
                Properties
              </div>
            </div>
          </div>

          {#if onClose}
            <Button 
              variant="ghost" 
              size="icon"
              onclick={onClose}
              class="h-8 w-8 hover:bg-accent/50"
            >
              <XIcon class="w-4 h-4" />
            </Button>
          {/if}
        </div>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto p-4 space-y-6">
      <div class="space-y-2">
        <Label for="node-name" class="text-foreground/90">Node Name</Label>
        <Input 
          id="node-name"
          bind:value={nodeName}
          placeholder="Enter node name..."
          class="bg-background/50 border-border"
          onblur={handleUpdate}
        />
      </div>

      {#if selectedNode.type?.includes("trigger")}
        <div class="space-y-2">
          <Label for="trigger-type" class="text-foreground/90">Trigger Type</Label>
          <Select.Root
            type="single"
            value={nodeTriggerType}
            onValueChange={(v) => { if (v) { nodeTriggerType = v; handleUpdate(); } }}
          >
            <Select.Trigger 
              id="trigger-type"
              class="w-full bg-background/50 border-border"
            >
              {getTriggerTypeLabel(nodeTriggerType)}
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="manual" label="Manual" />
              <Select.Item value="webhook" label="Webhook" />
              <Select.Item value="schedule" label="Schedule" />
              <Select.Item value="event" label="Event" />
            </Select.Content>
          </Select.Root>
        </div>
      {/if}

      {#if selectedNode.type?.includes("ai")}
        <div class="space-y-2">
          <Label for="model" class="text-foreground/90">AI Model</Label>
          <Select.Root
            type="single"
            value={nodeModel}
            onValueChange={(v) => { if (v) { nodeModel = v; handleUpdate(); } }}
          >
            <Select.Trigger 
              id="model"
              class="w-full bg-background/50 border-border"
            >
              {getModelLabel(nodeModel)}
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="claude-3-5-sonnet" label="Claude 3.5 Sonnet" />
              <Select.Item value="claude-3-opus" label="Claude 3 Opus" />
              <Select.Item value="gpt-4" label="GPT-4" />
              <Select.Item value="gpt-4-turbo" label="GPT-4 Turbo" />
              <Select.Item value="gpt-3.5-turbo" label="GPT-3.5 Turbo" />
            </Select.Content>
          </Select.Root>
        </div>

        <div class="space-y-2">
          <Label for="prompt" class="text-foreground/90">Prompt</Label>
          <textarea
            id="prompt"
            bind:value={nodePrompt}
            placeholder="Enter AI prompt instructions..."
            rows={6}
            class="w-full min-h-[120px] px-3 py-2 text-sm rounded-md border border-border bg-background/50 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-[var(--cyber-emerald)] focus-visible:ring-[3px] focus-visible:ring-[var(--cyber-emerald)]/20 disabled:cursor-not-allowed disabled:opacity-50 resize-y"
            onblur={handleUpdate}
          ></textarea>
        </div>

        <div class="space-y-2">
          <Label for="timeout" class="text-foreground/90">Timeout (ms)</Label>
          <Input 
            id="timeout"
            type="number"
            bind:value={nodeTimeout}
            placeholder="30000"
            class="bg-background/50 border-border"
            onblur={handleUpdate}
          />
        </div>
      {/if}

      {#if selectedNode.type === "action" || selectedNode.type?.includes("http")}
        <div class="space-y-2">
          <Label for="method" class="text-foreground/90">HTTP Method</Label>
          <Select.Root
            type="single"
            value={nodeMethod}
            onValueChange={(v) => { if (v) { nodeMethod = v; handleUpdate(); } }}
          >
            <Select.Trigger 
              id="method"
              class="w-full bg-background/50 border-border"
            >
              {nodeMethod}
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="GET" label="GET" />
              <Select.Item value="POST" label="POST" />
              <Select.Item value="PUT" label="PUT" />
              <Select.Item value="PATCH" label="PATCH" />
              <Select.Item value="DELETE" label="DELETE" />
            </Select.Content>
          </Select.Root>
        </div>

        <div class="space-y-2">
          <Label for="url" class="text-foreground/90">URL</Label>
          <Input 
            id="url"
            type="url"
            bind:value={nodeUrl}
            placeholder="https://api.example.com/endpoint"
            class="bg-background/50 border-border"
            onblur={handleUpdate}
          />
        </div>

        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <Label class="text-foreground/90">Headers</Label>
            <Button
              variant="ghost"
              size="sm"
              onclick={addHeader}
              class="h-7 text-xs hover:bg-accent/50"
            >
              + Add Header
            </Button>
          </div>
          
          {#if nodeHeaders.length === 0}
            <div class="p-4 rounded-md border border-dashed border-border bg-background/30 text-center">
              <p class="text-xs text-muted-foreground">No headers added</p>
            </div>
          {:else}
            <div class="space-y-2">
              {#each nodeHeaders as header, i}
                <div class="flex items-center gap-2">
                  <Input
                    bind:value={header.key}
                    placeholder="Key"
                    class="flex-1 bg-background/50 border-border text-sm h-8"
                    onblur={handleUpdate}
                  />
                  <Input
                    bind:value={header.value}
                    placeholder="Value"
                    class="flex-1 bg-background/50 border-border text-sm h-8"
                    onblur={handleUpdate}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onclick={() => removeHeader(i)}
                    class="h-8 w-8 hover:bg-destructive/20 hover:text-destructive"
                  >
                    <XIcon class="w-3 h-3" />
                  </Button>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/if}

      {#if selectedNode.type?.includes("condition")}
        <div class="space-y-2">
          <Label for="condition" class="text-foreground/90">Condition Expression</Label>
          <textarea
            id="condition"
            bind:value={nodeCondition}
            placeholder="e.g., data.status === 'success'"
            rows={4}
            class="w-full min-h-[80px] px-3 py-2 text-sm rounded-md border border-border bg-background/50 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-[var(--cyber-amber)] focus-visible:ring-[3px] focus-visible:ring-[var(--cyber-amber)]/20 disabled:cursor-not-allowed disabled:opacity-50 resize-y font-mono"
            onblur={handleUpdate}
          ></textarea>
          <p class="text-xs text-muted-foreground">JavaScript expression that returns true or false</p>
        </div>
      {/if}
    </div>

    {#if onNodeDelete}
      <div class="p-4 border-t border-border bg-gradient-to-br from-card/50 to-card">
        <Button
          variant="destructive"
          size="sm"
          onclick={handleDelete}
          class="w-full"
        >
          <Trash2Icon class="w-4 h-4 mr-2" />
          Delete Node
        </Button>
      </div>
    {/if}
  </div>
{:else}
  <div class="h-full flex items-center justify-center bg-card/40 backdrop-blur-sm border-l border-border">
    <div class="text-center p-8 space-y-3 max-w-sm">
      <div class="w-16 h-16 mx-auto rounded-full bg-muted/30 flex items-center justify-center">
        <div class="w-8 h-8 rounded-full border-2 border-dashed border-muted-foreground/30"></div>
      </div>
      <div class="space-y-1">
        <p class="text-sm font-medium text-foreground/70">No Node Selected</p>
        <p class="text-xs text-muted-foreground">
          Click on a node in the workflow to view and edit its properties
        </p>
      </div>
    </div>
  </div>
{/if}
