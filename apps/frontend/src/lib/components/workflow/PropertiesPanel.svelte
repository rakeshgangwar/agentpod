<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import * as Select from "$lib/components/ui/select";
  import Trash2Icon from "@lucide/svelte/icons/trash-2";
  import XIcon from "@lucide/svelte/icons/x";
  import AlertCircleIcon from "@lucide/svelte/icons/alert-circle";
  import type { ISvelteFlowNode, WorkflowNodeType } from "@agentpod/types";
  import { getNodeDefinition, isNodeImplemented, type NodeRegistryEntry } from "./node-registry";

  interface Props {
    selectedNode: ISvelteFlowNode | null;
    onNodeUpdate: (nodeId: string, updates: Partial<ISvelteFlowNode>) => void;
    onNodeDelete?: (nodeId: string) => void;
    onClose?: () => void;
    collapsed?: boolean;
  }

  let {
    selectedNode,
    onNodeUpdate,
    onNodeDelete,
    onClose,
    collapsed = false,
  }: Props = $props();

  let nodeName = $state("");
  let nodePrompt = $state("");
  let nodeModel = $state("claude-3-5-sonnet");
  let nodeTimeout = $state(30000);
  let nodeTriggerType = $state("manual");
  let nodeUrl = $state("");
  let nodeMethod = $state("GET");
  let nodeConditionField = $state("");
  let nodeConditionOperator = $state("equals");
  let nodeConditionValue = $state("");
  let nodeHeaders = $state<Array<{ key: string; value: string }>>([]);
  let nodeCode = $state("");
  let nodeCron = $state("");
  let nodeTimezone = $state("UTC");

  const actualNodeType = $derived.by(() => {
    if (!selectedNode) return undefined;
    const fromData = selectedNode.data?.nodeType as WorkflowNodeType | undefined;
    if (fromData) return fromData;
    return selectedNode.type as WorkflowNodeType | undefined;
  });

  const nodeDefinition = $derived.by(() => 
    actualNodeType ? getNodeDefinition(actualNodeType) : undefined
  );

  const isImplemented = $derived(
    actualNodeType ? isNodeImplemented(actualNodeType) : false
  );

  $effect(() => {
    if (selectedNode) {
      nodeName = selectedNode.data.label as string || "";
      nodePrompt = selectedNode.data.prompt as string || "";
      nodeModel = selectedNode.data.model as string || "claude-3-5-sonnet";
      nodeTimeout = selectedNode.data.timeout as number || 30000;
      nodeTriggerType = selectedNode.data.triggerType as string || "manual";
      nodeUrl = selectedNode.data.url as string || "";
      nodeMethod = selectedNode.data.method as string || "GET";
      nodeHeaders = selectedNode.data.headers as Array<{ key: string; value: string }> || [];
      nodeCode = selectedNode.data.code as string || "";
      nodeCron = selectedNode.data.cron as string || "";
      nodeTimezone = selectedNode.data.timezone as string || "UTC";
      
      const conditions = selectedNode.data.conditions as Array<{ field: string; operator: string; value: unknown }> || [];
      if (conditions.length > 0) {
        nodeConditionField = conditions[0].field || "";
        nodeConditionOperator = conditions[0].operator || "equals";
        nodeConditionValue = String(conditions[0].value || "");
      } else {
        nodeConditionField = "";
        nodeConditionOperator = "equals";
        nodeConditionValue = "";
      }
    }
  });

  function handleUpdate() {
    if (!selectedNode) return;

    const baseData = { ...selectedNode.data, label: nodeName };
    let updatedData: Record<string, unknown> = baseData;

    const nodeType = selectedNode.type as WorkflowNodeType;

    const actualType = (selectedNode.data?.nodeType as string) || selectedNode.type;

    if (actualType === "ai-agent" || actualType === "ai-prompt") {
      updatedData = {
        ...updatedData,
        prompt: nodePrompt,
        model: nodeModel,
        timeout: nodeTimeout,
      };
    }

    if (actualType?.includes("trigger")) {
      updatedData = {
        ...updatedData,
        triggerType: nodeTriggerType,
      };
      
      if (actualType === "schedule-trigger") {
        updatedData.cron = nodeCron;
        updatedData.timezone = nodeTimezone;
      }
    }

    if (actualType === "http-request") {
      updatedData = {
        ...updatedData,
        url: nodeUrl,
        method: nodeMethod,
        headers: nodeHeaders.filter(h => h.key && h.value),
      };
    }

    if (actualType === "condition" || actualType === "switch") {
      updatedData = {
        ...updatedData,
        conditions: nodeConditionField ? [{
          field: nodeConditionField,
          operator: nodeConditionOperator,
          value: nodeConditionValue,
          outputBranch: "true",
        }] : [],
        defaultBranch: "false",
      };
    }

    if (actualType === "javascript") {
      updatedData = {
        ...updatedData,
        code: nodeCode,
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

  function getColorClass(category?: string): string {
    switch (category) {
      case "trigger": return "cyber-cyan";
      case "ai": return "cyber-emerald";
      case "logic": return "cyber-amber";
      case "action": return "cyber-magenta";
      case "human": return "cyber-cyan";
      case "code": return "cyber-amber";
      default: return "muted-foreground";
    }
  }

  const CONDITION_OPERATORS = [
    { value: "equals", label: "Equals" },
    { value: "notEquals", label: "Not Equals" },
    { value: "contains", label: "Contains" },
    { value: "notContains", label: "Not Contains" },
    { value: "startsWith", label: "Starts With" },
    { value: "endsWith", label: "Ends With" },
    { value: "greaterThan", label: "Greater Than" },
    { value: "lessThan", label: "Less Than" },
    { value: "isEmpty", label: "Is Empty" },
    { value: "isNotEmpty", label: "Is Not Empty" },
    { value: "isTrue", label: "Is True" },
    { value: "isFalse", label: "Is False" },
  ];

  const MODEL_OPTIONS = [
    { value: "claude-3-5-sonnet", label: "Claude 3.5 Sonnet" },
    { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
    { value: "claude-3-opus", label: "Claude 3 Opus" },
    { value: "gpt-4", label: "GPT-4" },
    { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
    { value: "gpt-4o", label: "GPT-4o" },
  ];

  const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
</script>

<div class="sidebar h-full overflow-hidden" class:collapsed={collapsed}>
{#if selectedNode && nodeDefinition}
  {@const NodeIcon = nodeDefinition.icon}
  {@const colorClass = getColorClass(nodeDefinition.category)}
  <div class="h-full flex flex-col bg-card/90 backdrop-blur-sm border-l border-border w-80">
    <div class="relative border-b border-border bg-gradient-to-br from-card to-card/50">
      <div class="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[var(--{colorClass})] to-transparent opacity-40"></div>
      
      <div class="p-4 space-y-3">
        <div class="flex items-start justify-between gap-3">
          <div class="flex items-center gap-3 flex-1 min-w-0">
            <div 
              class="flex-shrink-0 w-10 h-10 rounded-sm flex items-center justify-center border"
              style="background: color-mix(in oklch, var(--{colorClass}) 20%, transparent); border-color: color-mix(in oklch, var(--{colorClass}) 30%, transparent);"
            >
              <NodeIcon class="w-5 h-5" style="color: var(--{colorClass});" />
            </div>
            
            <div class="flex-1 min-w-0">
              <div class="text-sm font-semibold text-foreground truncate">
                {nodeDefinition.name}
              </div>
              <div class="text-xs text-muted-foreground font-mono uppercase tracking-wider">
                {nodeDefinition.category}
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

        {#if !isImplemented}
          <div class="flex items-center gap-2 px-3 py-2 rounded-md bg-amber-500/10 border border-amber-500/30">
            <AlertCircleIcon class="w-4 h-4 text-amber-500 flex-shrink-0" />
            <span class="text-xs text-amber-500">Node not yet implemented</span>
          </div>
        {/if}
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

      {#if nodeDefinition.isTrigger}
        {#if actualNodeType === "schedule-trigger"}
          <div class="space-y-2">
            <Label for="cron" class="text-foreground/90">Cron Expression</Label>
            <Input 
              id="cron"
              bind:value={nodeCron}
              placeholder="0 9 * * * (every day at 9 AM)"
              class="bg-background/50 border-border font-mono"
              onblur={handleUpdate}
            />
            <p class="text-xs text-muted-foreground">Standard cron format: minute hour day month weekday</p>
          </div>
          
          <div class="space-y-2">
            <Label for="timezone" class="text-foreground/90">Timezone</Label>
            <Input 
              id="timezone"
              bind:value={nodeTimezone}
              placeholder="UTC"
              class="bg-background/50 border-border"
              onblur={handleUpdate}
            />
          </div>
        {:else}
          <div class="p-4 rounded-md border border-dashed border-border bg-background/30 text-center">
            <p class="text-xs text-muted-foreground">
              {#if actualNodeType === "manual-trigger"}
                This node starts the workflow when you click "Run"
              {:else if actualNodeType === "webhook-trigger"}
                Triggers via HTTP POST to the workflow webhook URL
              {:else}
                Trigger configuration
              {/if}
            </p>
          </div>
        {/if}
      {/if}

      {#if nodeDefinition.category === "ai"}
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
              {MODEL_OPTIONS.find(m => m.value === nodeModel)?.label || nodeModel}
            </Select.Trigger>
            <Select.Content>
              {#each MODEL_OPTIONS as option}
                <Select.Item value={option.value} label={option.label} />
              {/each}
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
          <p class="text-xs text-muted-foreground">
            Use {"{{steps.nodeId.data}}"} to reference previous step outputs
          </p>
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

      {#if actualNodeType === "http-request"}
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
              {#each HTTP_METHODS as method}
                <Select.Item value={method} label={method} />
              {/each}
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
          <p class="text-xs text-muted-foreground">
            Use {"{{steps.nodeId.data.field}}"} for dynamic values
          </p>
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

      {#if actualNodeType === "condition" || actualNodeType === "switch"}
        <div class="space-y-4">
          <div class="space-y-2">
            <Label for="condition-field" class="text-foreground/90">Field Path</Label>
            <Input 
              id="condition-field"
              bind:value={nodeConditionField}
              placeholder="steps.http-request-123.data.status"
              class="bg-background/50 border-border font-mono text-sm"
              onblur={handleUpdate}
            />
            <p class="text-xs text-muted-foreground">
              Path to the value to evaluate (e.g., trigger.data.email or steps.nodeId.data.field)
            </p>
          </div>

          <div class="space-y-2">
            <Label for="operator" class="text-foreground/90">Operator</Label>
            <Select.Root
              type="single"
              value={nodeConditionOperator}
              onValueChange={(v) => { if (v) { nodeConditionOperator = v; handleUpdate(); } }}
            >
              <Select.Trigger 
                id="operator"
                class="w-full bg-background/50 border-border"
              >
                {CONDITION_OPERATORS.find(o => o.value === nodeConditionOperator)?.label || nodeConditionOperator}
              </Select.Trigger>
              <Select.Content>
                {#each CONDITION_OPERATORS as op}
                  <Select.Item value={op.value} label={op.label} />
                {/each}
              </Select.Content>
            </Select.Root>
          </div>

          {#if !["isEmpty", "isNotEmpty", "isTrue", "isFalse"].includes(nodeConditionOperator)}
            <div class="space-y-2">
              <Label for="condition-value" class="text-foreground/90">Value</Label>
              <Input 
                id="condition-value"
                bind:value={nodeConditionValue}
                placeholder="Expected value"
                class="bg-background/50 border-border"
                onblur={handleUpdate}
              />
            </div>
          {/if}
        </div>
      {/if}

      {#if actualNodeType === "javascript"}
        <div class="space-y-2">
          <Label for="code" class="text-foreground/90">JavaScript Code</Label>
          <textarea
            id="code"
            bind:value={nodeCode}
            placeholder="// Your JavaScript code here"
            rows={10}
            class="w-full min-h-[200px] px-3 py-2 text-sm rounded-md border border-border bg-background/50 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-[var(--cyber-amber)] focus-visible:ring-[3px] focus-visible:ring-[var(--cyber-amber)]/20 disabled:cursor-not-allowed disabled:opacity-50 resize-y font-mono"
            onblur={handleUpdate}
          ></textarea>
          <p class="text-xs text-muted-foreground">
            Available: <code class="px-1 py-0.5 rounded bg-muted">trigger</code>, 
            <code class="px-1 py-0.5 rounded bg-muted">steps</code>, 
            <code class="px-1 py-0.5 rounded bg-muted">inputs</code>, 
            <code class="px-1 py-0.5 rounded bg-muted">console</code>
          </p>
        </div>
      {/if}

      {#if actualNodeType === "loop"}
        <div class="space-y-2">
          <Label for="items-path" class="text-foreground/90">Items Path</Label>
          <Input 
            id="items-path"
            bind:value={nodeUrl}
            placeholder="steps.http-request-123.data.items"
            class="bg-background/50 border-border font-mono text-sm"
            onblur={handleUpdate}
          />
          <p class="text-xs text-muted-foreground">Path to the array to iterate over</p>
        </div>
      {/if}

      {#if actualNodeType === "merge"}
        <div class="p-4 rounded-md border border-dashed border-border bg-background/30 text-center">
          <p class="text-xs text-muted-foreground">
            Waits for all incoming branches to complete before continuing
          </p>
        </div>
      {/if}

      {#if !isImplemented && !nodeDefinition.isTrigger && nodeDefinition.category !== "ai" && actualNodeType !== "condition" && actualNodeType !== "switch" && actualNodeType !== "javascript" && actualNodeType !== "http-request"}
        <div class="p-4 rounded-md border border-dashed border-border bg-background/30 space-y-2">
          <p class="text-sm font-medium text-foreground/70">{nodeDefinition.name}</p>
          <p class="text-xs text-muted-foreground">{nodeDefinition.description}</p>
          <p class="text-xs text-amber-500">This node type is planned but not yet implemented.</p>
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
{:else if selectedNode}
  <div class="h-full flex flex-col bg-card/90 backdrop-blur-sm border-l border-border w-80">
    <div class="p-4 border-b border-border">
      <div class="flex items-center justify-between">
        <span class="text-sm font-medium">Unknown Node Type</span>
        {#if onClose}
          <Button variant="ghost" size="icon" onclick={onClose} class="h-8 w-8">
            <XIcon class="w-4 h-4" />
          </Button>
        {/if}
      </div>
    </div>
    <div class="flex-1 p-4">
      <p class="text-sm text-muted-foreground">
        Node type "{actualNodeType || selectedNode.type}" is not in the registry.
      </p>
    </div>
  </div>
{:else}
  <div class="h-full flex items-center justify-center bg-card/40 backdrop-blur-sm border-l border-border w-80">
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
</div>

<style>
  .sidebar {
    width: 20rem;
    min-width: 20rem;
    opacity: 1;
    transition: 
      width 0.3s cubic-bezier(0.4, 0, 0.2, 1),
      min-width 0.3s cubic-bezier(0.4, 0, 0.2, 1),
      opacity 0.2s ease-out;
  }

  .sidebar.collapsed {
    width: 0;
    min-width: 0;
    opacity: 0;
    transition: 
      width 0.3s cubic-bezier(0.4, 0, 0.2, 1),
      min-width 0.3s cubic-bezier(0.4, 0, 0.2, 1),
      opacity 0.15s ease-in;
  }
</style>
