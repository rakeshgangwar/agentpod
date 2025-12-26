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
  
  // Filter node state
  let filterItemsPath = $state("");
  let filterConditions = $state<Array<{ field: string; operator: string; value: string }>>([]);
  let filterMode = $state<"all" | "any">("all");
  
  // Transform node state
  let transformInputPath = $state("");
  let transformMode = $state<"map" | "pick" | "omit" | "rename" | "flatten" | "unflatten">("map");
  let transformMapping = $state<Array<{ from: string; to: string; transform?: string }>>([]);
  let transformFields = $state<string[]>([]);
  let transformSeparator = $state(".");
  
  // Wait node state
  let waitDuration = $state("5 seconds");
  
  // Error handler node state
  let errorOnError = $state<"continue" | "stop" | "retry" | "fallback">("continue");
  let errorMaxRetries = $state(3);
  let errorRetryDelay = $state("5 seconds");
  
  // Split node state
  let splitBranches = $state(2);
  
  // Set Variable node state
  let setVariables = $state<Array<{ name: string; value: string; type: string }>>([]);
  
  // Parse JSON node state
  let parseJsonInputPath = $state("");
  let parseJsonErrorHandling = $state<"error" | "default">("error");
  
  // Aggregate node state
  let aggregateItemsPath = $state("");
  let aggregateOperations = $state<Array<{ operation: string; field: string; outputName: string }>>([]);
  
  // Discord node state
  let discordWebhookUrl = $state("");
  let discordContent = $state("");
  let discordUsername = $state("");
  
  // Telegram node state
  let telegramBotToken = $state("");
  let telegramChatId = $state("");
  let telegramText = $state("");
  let telegramParseMode = $state<"HTML" | "Markdown" | "MarkdownV2">("HTML");
  
  // Email node state
  let emailTo = $state("");
  let emailSubject = $state("");
  let emailBody = $state("");
  let emailProvider = $state<"resend" | "sendgrid" | "mailgun">("resend");
  
  // D1 Query node state
  let d1Query = $state("");
  let d1Operation = $state<"all" | "first" | "run">("all");
  
  // R2 Storage node state
  let r2Operation = $state<"get" | "put" | "delete" | "list" | "head">("get");
  let r2Key = $state("");
  let r2Content = $state("");
  let r2Prefix = $state("");
  
  // Approval node state
  let approvalMessage = $state("");
  let approvalTimeout = $state("24h");

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
      
      // Filter node
      filterItemsPath = selectedNode.data.itemsPath as string || "";
      filterConditions = selectedNode.data.conditions as Array<{ field: string; operator: string; value: string }> || [];
      filterMode = (selectedNode.data.mode as "all" | "any") || "all";
      
      // Transform node
      transformInputPath = selectedNode.data.inputPath as string || "";
      transformMode = (selectedNode.data.mode as typeof transformMode) || "map";
      transformMapping = selectedNode.data.mapping as typeof transformMapping || [];
      transformFields = selectedNode.data.fields as string[] || [];
      transformSeparator = selectedNode.data.separator as string || ".";
      
      // Wait node
      waitDuration = selectedNode.data.duration as string || "5 seconds";
      
      // Error handler node
      errorOnError = (selectedNode.data.onError as typeof errorOnError) || "continue";
      errorMaxRetries = selectedNode.data.maxRetries as number || 3;
      errorRetryDelay = selectedNode.data.retryDelay as string || "5 seconds";
      
      // Split node
      splitBranches = selectedNode.data.branches as number || 2;
      
      // Set Variable node
      setVariables = selectedNode.data.variables as typeof setVariables || [];
      
      // Parse JSON node
      parseJsonInputPath = selectedNode.data.inputPath as string || "";
      parseJsonErrorHandling = (selectedNode.data.errorHandling as typeof parseJsonErrorHandling) || "error";
      
      // Aggregate node
      aggregateItemsPath = selectedNode.data.itemsPath as string || "";
      aggregateOperations = selectedNode.data.operations as typeof aggregateOperations || [];
      
      // Discord node
      discordWebhookUrl = selectedNode.data.webhookUrl as string || "";
      discordContent = selectedNode.data.content as string || "";
      discordUsername = selectedNode.data.username as string || "";
      
      // Telegram node
      telegramBotToken = selectedNode.data.botToken as string || "";
      telegramChatId = selectedNode.data.chatId as string || "";
      telegramText = selectedNode.data.text as string || "";
      telegramParseMode = (selectedNode.data.parseMode as typeof telegramParseMode) || "HTML";
      
      // Email node
      emailTo = selectedNode.data.to as string || "";
      emailSubject = selectedNode.data.subject as string || "";
      emailBody = selectedNode.data.body as string || "";
      emailProvider = (selectedNode.data.provider as typeof emailProvider) || "resend";
      
      // D1 Query node
      d1Query = selectedNode.data.query as string || "";
      d1Operation = (selectedNode.data.operation as typeof d1Operation) || "all";
      
      // R2 Storage node
      r2Operation = (selectedNode.data.operation as typeof r2Operation) || "get";
      r2Key = selectedNode.data.key as string || "";
      r2Content = selectedNode.data.content as string || "";
      r2Prefix = selectedNode.data.prefix as string || "";
      
      // Approval node
      approvalMessage = selectedNode.data.message as string || "";
      approvalTimeout = selectedNode.data.timeout as string || "24h";
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

    if (actualType === "filter") {
      updatedData = {
        ...updatedData,
        itemsPath: filterItemsPath,
        conditions: filterConditions,
        mode: filterMode,
      };
    }

    if (actualType === "transform") {
      updatedData = {
        ...updatedData,
        inputPath: transformInputPath,
        mode: transformMode,
        mapping: transformMapping,
        fields: transformFields,
        separator: transformSeparator,
      };
    }

    if (actualType === "wait") {
      updatedData = {
        ...updatedData,
        duration: waitDuration,
      };
    }

    if (actualType === "error-handler") {
      updatedData = {
        ...updatedData,
        onError: errorOnError,
        maxRetries: errorMaxRetries,
        retryDelay: errorRetryDelay,
      };
    }

    if (actualType === "split") {
      updatedData = {
        ...updatedData,
        branches: splitBranches,
      };
    }

    if (actualType === "set-variable") {
      updatedData = {
        ...updatedData,
        variables: setVariables.filter(v => v.name),
      };
    }

    if (actualType === "parse-json") {
      updatedData = {
        ...updatedData,
        inputPath: parseJsonInputPath,
        errorHandling: parseJsonErrorHandling,
      };
    }

    if (actualType === "aggregate") {
      updatedData = {
        ...updatedData,
        itemsPath: aggregateItemsPath,
        operations: aggregateOperations.filter(o => o.operation && o.outputName),
      };
    }

    if (actualType === "discord") {
      updatedData = {
        ...updatedData,
        webhookUrl: discordWebhookUrl,
        content: discordContent,
        username: discordUsername,
      };
    }

    if (actualType === "telegram") {
      updatedData = {
        ...updatedData,
        botToken: telegramBotToken,
        chatId: telegramChatId,
        text: telegramText,
        parseMode: telegramParseMode,
      };
    }

    if (actualType === "email") {
      updatedData = {
        ...updatedData,
        to: emailTo,
        subject: emailSubject,
        body: emailBody,
        provider: emailProvider,
      };
    }

    if (actualType === "d1-query") {
      updatedData = {
        ...updatedData,
        query: d1Query,
        operation: d1Operation,
      };
    }

    if (actualType === "r2-storage") {
      updatedData = {
        ...updatedData,
        operation: r2Operation,
        key: r2Key,
        content: r2Content,
        prefix: r2Prefix,
      };
    }

    if (actualType === "approval") {
      updatedData = {
        ...updatedData,
        message: approvalMessage,
        timeout: approvalTimeout,
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

      {#if actualNodeType === "filter"}
        <div class="space-y-4">
          <div class="space-y-2">
            <Label for="filter-items-path" class="text-foreground/90">Items Path</Label>
            <Input 
              id="filter-items-path"
              bind:value={filterItemsPath}
              placeholder="steps.http-1.data.items"
              class="bg-background/50 border-border font-mono text-sm"
              onblur={handleUpdate}
            />
            <p class="text-xs text-muted-foreground">Path to array in context</p>
          </div>

          <div class="space-y-2">
            <Label class="text-foreground/90">Match Mode</Label>
            <Select.Root
              type="single"
              value={filterMode}
              onValueChange={(v) => { if (v) { filterMode = v as "all" | "any"; handleUpdate(); } }}
            >
              <Select.Trigger class="w-full bg-background/50 border-border">
                {filterMode === "all" ? "All conditions (AND)" : "Any condition (OR)"}
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="all" label="All conditions (AND)" />
                <Select.Item value="any" label="Any condition (OR)" />
              </Select.Content>
            </Select.Root>
          </div>

          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <Label class="text-foreground/90">Filter Conditions</Label>
              <Button
                variant="ghost"
                size="sm"
                onclick={() => { filterConditions = [...filterConditions, { field: "", operator: "equals", value: "" }]; }}
                class="h-7 text-xs hover:bg-accent/50"
              >
                + Add Condition
              </Button>
            </div>
            
            {#if filterConditions.length === 0}
              <div class="p-4 rounded-md border border-dashed border-border bg-background/30 text-center">
                <p class="text-xs text-muted-foreground">No conditions - all items will pass</p>
              </div>
            {:else}
              <div class="space-y-2">
                {#each filterConditions as condition, i}
                  <div class="p-3 rounded-md border border-border bg-background/30 space-y-2">
                    <div class="flex items-center gap-2">
                      <Input
                        bind:value={condition.field}
                        placeholder="Field path"
                        class="flex-1 bg-background/50 border-border text-sm h-8 font-mono"
                        onblur={handleUpdate}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onclick={() => { filterConditions = filterConditions.filter((_, idx) => idx !== i); handleUpdate(); }}
                        class="h-8 w-8 hover:bg-destructive/20 hover:text-destructive"
                      >
                        <XIcon class="w-3 h-3" />
                      </Button>
                    </div>
                    <div class="flex items-center gap-2">
                      <Select.Root
                        type="single"
                        value={condition.operator}
                        onValueChange={(v) => { if (v) { condition.operator = v; handleUpdate(); } }}
                      >
                        <Select.Trigger class="w-1/2 bg-background/50 border-border h-8 text-sm">
                          {CONDITION_OPERATORS.find(o => o.value === condition.operator)?.label || condition.operator}
                        </Select.Trigger>
                        <Select.Content>
                          {#each CONDITION_OPERATORS as op}
                            <Select.Item value={op.value} label={op.label} />
                          {/each}
                        </Select.Content>
                      </Select.Root>
                      <Input
                        bind:value={condition.value}
                        placeholder="Value"
                        class="w-1/2 bg-background/50 border-border text-sm h-8"
                        onblur={handleUpdate}
                      />
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        </div>
      {/if}

      {#if actualNodeType === "transform"}
        <div class="space-y-4">
          <div class="space-y-2">
            <Label for="transform-input-path" class="text-foreground/90">Input Path</Label>
            <Input 
              id="transform-input-path"
              bind:value={transformInputPath}
              placeholder="steps.http-1.data"
              class="bg-background/50 border-border font-mono text-sm"
              onblur={handleUpdate}
            />
          </div>

          <div class="space-y-2">
            <Label class="text-foreground/90">Transform Mode</Label>
            <Select.Root
              type="single"
              value={transformMode}
              onValueChange={(v) => { if (v) { transformMode = v as typeof transformMode; handleUpdate(); } }}
            >
              <Select.Trigger class="w-full bg-background/50 border-border">
                {transformMode}
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="map" label="Map - Transform fields with mapping" />
                <Select.Item value="pick" label="Pick - Keep only specified fields" />
                <Select.Item value="omit" label="Omit - Remove specified fields" />
                <Select.Item value="rename" label="Rename - Rename fields" />
                <Select.Item value="flatten" label="Flatten - Flatten nested object" />
                <Select.Item value="unflatten" label="Unflatten - Expand flat object" />
              </Select.Content>
            </Select.Root>
          </div>

          {#if transformMode === "map" || transformMode === "rename"}
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <Label class="text-foreground/90">Field Mapping</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onclick={() => { transformMapping = [...transformMapping, { from: "", to: "" }]; }}
                  class="h-7 text-xs hover:bg-accent/50"
                >
                  + Add Mapping
                </Button>
              </div>
              {#each transformMapping as mapping, i}
                <div class="flex items-center gap-2">
                  <Input
                    bind:value={mapping.from}
                    placeholder="From field"
                    class="flex-1 bg-background/50 border-border text-sm h-8 font-mono"
                    onblur={handleUpdate}
                  />
                  <span class="text-muted-foreground">→</span>
                  <Input
                    bind:value={mapping.to}
                    placeholder="To field"
                    class="flex-1 bg-background/50 border-border text-sm h-8 font-mono"
                    onblur={handleUpdate}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onclick={() => { transformMapping = transformMapping.filter((_, idx) => idx !== i); handleUpdate(); }}
                    class="h-8 w-8 hover:bg-destructive/20 hover:text-destructive"
                  >
                    <XIcon class="w-3 h-3" />
                  </Button>
                </div>
              {/each}
            </div>
          {/if}

          {#if transformMode === "pick" || transformMode === "omit"}
            <div class="space-y-2">
              <Label for="transform-fields" class="text-foreground/90">Fields (comma-separated)</Label>
              <Input 
                id="transform-fields"
                value={transformFields.join(", ")}
                oninput={(e) => { transformFields = (e.target as HTMLInputElement).value.split(",").map(f => f.trim()).filter(Boolean); }}
                placeholder="name, email, address.city"
                class="bg-background/50 border-border font-mono text-sm"
                onblur={handleUpdate}
              />
            </div>
          {/if}

          {#if transformMode === "flatten" || transformMode === "unflatten"}
            <div class="space-y-2">
              <Label for="transform-separator" class="text-foreground/90">Separator</Label>
              <Input 
                id="transform-separator"
                bind:value={transformSeparator}
                placeholder="."
                class="bg-background/50 border-border font-mono text-sm w-20"
                onblur={handleUpdate}
              />
            </div>
          {/if}
        </div>
      {/if}

      {#if actualNodeType === "wait"}
        <div class="space-y-2">
          <Label for="wait-duration" class="text-foreground/90">Duration</Label>
          <Input 
            id="wait-duration"
            bind:value={waitDuration}
            placeholder="5 seconds"
            class="bg-background/50 border-border"
            onblur={handleUpdate}
          />
          <p class="text-xs text-muted-foreground">
            Examples: 500ms, 5 seconds, 2 minutes, 1 hour
          </p>
        </div>
      {/if}

      {#if actualNodeType === "error-handler"}
        <div class="space-y-4">
          <div class="space-y-2">
            <Label class="text-foreground/90">On Error</Label>
            <Select.Root
              type="single"
              value={errorOnError}
              onValueChange={(v) => { if (v) { errorOnError = v as typeof errorOnError; handleUpdate(); } }}
            >
              <Select.Trigger class="w-full bg-background/50 border-border">
                {errorOnError === "continue" ? "Continue (ignore error)" : 
                 errorOnError === "stop" ? "Stop workflow" :
                 errorOnError === "retry" ? "Retry failed step" : "Use fallback value"}
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="continue" label="Continue - Ignore error and proceed" />
                <Select.Item value="stop" label="Stop - Halt workflow execution" />
                <Select.Item value="retry" label="Retry - Retry the failed step" />
                <Select.Item value="fallback" label="Fallback - Use default value" />
              </Select.Content>
            </Select.Root>
          </div>

          {#if errorOnError === "retry"}
            <div class="space-y-2">
              <Label for="error-max-retries" class="text-foreground/90">Max Retries</Label>
              <Input 
                id="error-max-retries"
                type="number"
                bind:value={errorMaxRetries}
                min="1"
                max="10"
                class="bg-background/50 border-border w-20"
                onblur={handleUpdate}
              />
            </div>
            <div class="space-y-2">
              <Label for="error-retry-delay" class="text-foreground/90">Retry Delay</Label>
              <Input 
                id="error-retry-delay"
                bind:value={errorRetryDelay}
                placeholder="5 seconds"
                class="bg-background/50 border-border"
                onblur={handleUpdate}
              />
            </div>
          {/if}
        </div>
      {/if}

      {#if actualNodeType === "split"}
        <div class="space-y-2">
          <Label for="split-branches" class="text-foreground/90">Number of Branches</Label>
          <Input 
            id="split-branches"
            type="number"
            bind:value={splitBranches}
            min="2"
            max="10"
            class="bg-background/50 border-border w-24"
            onblur={handleUpdate}
          />
          <p class="text-xs text-muted-foreground">
            Creates parallel execution paths (2-10 branches)
          </p>
        </div>
      {/if}

      {#if actualNodeType === "set-variable"}
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <Label class="text-foreground/90">Variables</Label>
            <Button
              variant="ghost"
              size="sm"
              onclick={() => { setVariables = [...setVariables, { name: "", value: "", type: "auto" }]; }}
              class="h-7 text-xs hover:bg-accent/50"
            >
              + Add Variable
            </Button>
          </div>
          
          {#if setVariables.length === 0}
            <div class="p-4 rounded-md border border-dashed border-border bg-background/30 text-center">
              <p class="text-xs text-muted-foreground">No variables defined</p>
            </div>
          {:else}
            <div class="space-y-3">
              {#each setVariables as variable, i}
                <div class="p-3 rounded-md border border-border bg-background/30 space-y-2">
                  <div class="flex items-center gap-2">
                    <Input
                      bind:value={variable.name}
                      placeholder="Variable name"
                      class="flex-1 bg-background/50 border-border text-sm h-8 font-mono"
                      onblur={handleUpdate}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onclick={() => { setVariables = setVariables.filter((_, idx) => idx !== i); handleUpdate(); }}
                      class="h-8 w-8 hover:bg-destructive/20 hover:text-destructive"
                    >
                      <XIcon class="w-3 h-3" />
                    </Button>
                  </div>
                  <Input
                    bind:value={variable.value}
                    placeholder="Value or {'{{'}path.to.data{'}}'}"
                    class="bg-background/50 border-border text-sm h-8"
                    onblur={handleUpdate}
                  />
                  <Select.Root
                    type="single"
                    value={variable.type}
                    onValueChange={(v) => { if (v) { variable.type = v; handleUpdate(); } }}
                  >
                    <Select.Trigger class="w-full bg-background/50 border-border h-8 text-sm">
                      Type: {variable.type}
                    </Select.Trigger>
                    <Select.Content>
                      <Select.Item value="auto" label="Auto-detect" />
                      <Select.Item value="string" label="String" />
                      <Select.Item value="number" label="Number" />
                      <Select.Item value="boolean" label="Boolean" />
                      <Select.Item value="object" label="Object" />
                      <Select.Item value="array" label="Array" />
                    </Select.Content>
                  </Select.Root>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/if}

      {#if actualNodeType === "parse-json"}
        <div class="space-y-4">
          <div class="space-y-2">
            <Label for="parse-json-path" class="text-foreground/90">Input Path</Label>
            <Input 
              id="parse-json-path"
              bind:value={parseJsonInputPath}
              placeholder="steps.http-1.data.body"
              class="bg-background/50 border-border font-mono text-sm"
              onblur={handleUpdate}
            />
            <p class="text-xs text-muted-foreground">Path to JSON string in context</p>
          </div>

          <div class="space-y-2">
            <Label class="text-foreground/90">Error Handling</Label>
            <Select.Root
              type="single"
              value={parseJsonErrorHandling}
              onValueChange={(v) => { if (v) { parseJsonErrorHandling = v as typeof parseJsonErrorHandling; handleUpdate(); } }}
            >
              <Select.Trigger class="w-full bg-background/50 border-border">
                {parseJsonErrorHandling === "error" ? "Throw error on invalid JSON" : "Use default value"}
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="error" label="Throw error on invalid JSON" />
                <Select.Item value="default" label="Use default value on failure" />
              </Select.Content>
            </Select.Root>
          </div>
        </div>
      {/if}

      {#if actualNodeType === "aggregate"}
        <div class="space-y-4">
          <div class="space-y-2">
            <Label for="aggregate-items-path" class="text-foreground/90">Items Path</Label>
            <Input 
              id="aggregate-items-path"
              bind:value={aggregateItemsPath}
              placeholder="steps.http-1.data.items"
              class="bg-background/50 border-border font-mono text-sm"
              onblur={handleUpdate}
            />
          </div>

          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <Label class="text-foreground/90">Operations</Label>
              <Button
                variant="ghost"
                size="sm"
                onclick={() => { aggregateOperations = [...aggregateOperations, { operation: "count", field: "", outputName: "" }]; }}
                class="h-7 text-xs hover:bg-accent/50"
              >
                + Add Operation
              </Button>
            </div>
            
            {#if aggregateOperations.length === 0}
              <div class="p-4 rounded-md border border-dashed border-border bg-background/30 text-center">
                <p class="text-xs text-muted-foreground">Add aggregation operations</p>
              </div>
            {:else}
              <div class="space-y-2">
                {#each aggregateOperations as op, i}
                  <div class="p-3 rounded-md border border-border bg-background/30 space-y-2">
                    <div class="flex items-center gap-2">
                      <Select.Root
                        type="single"
                        value={op.operation}
                        onValueChange={(v) => { if (v) { op.operation = v; handleUpdate(); } }}
                      >
                        <Select.Trigger class="flex-1 bg-background/50 border-border h-8 text-sm">
                          {op.operation}
                        </Select.Trigger>
                        <Select.Content>
                          <Select.Item value="count" label="Count" />
                          <Select.Item value="sum" label="Sum" />
                          <Select.Item value="avg" label="Average" />
                          <Select.Item value="min" label="Min" />
                          <Select.Item value="max" label="Max" />
                          <Select.Item value="first" label="First" />
                          <Select.Item value="last" label="Last" />
                          <Select.Item value="unique" label="Unique" />
                        </Select.Content>
                      </Select.Root>
                      <Button
                        variant="ghost"
                        size="icon"
                        onclick={() => { aggregateOperations = aggregateOperations.filter((_, idx) => idx !== i); handleUpdate(); }}
                        class="h-8 w-8 hover:bg-destructive/20 hover:text-destructive"
                      >
                        <XIcon class="w-3 h-3" />
                      </Button>
                    </div>
                    <div class="flex gap-2">
                      <Input
                        bind:value={op.field}
                        placeholder="Field (optional)"
                        class="flex-1 bg-background/50 border-border text-sm h-8 font-mono"
                        onblur={handleUpdate}
                      />
                      <Input
                        bind:value={op.outputName}
                        placeholder="Output name"
                        class="flex-1 bg-background/50 border-border text-sm h-8 font-mono"
                        onblur={handleUpdate}
                      />
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        </div>
      {/if}

      {#if actualNodeType === "discord"}
        <div class="space-y-4">
          <div class="space-y-2">
            <Label for="discord-webhook" class="text-foreground/90">Webhook URL</Label>
            <Input 
              id="discord-webhook"
              bind:value={discordWebhookUrl}
              placeholder="https://discord.com/api/webhooks/..."
              class="bg-background/50 border-border text-sm"
              onblur={handleUpdate}
            />
          </div>

          <div class="space-y-2">
            <Label for="discord-content" class="text-foreground/90">Message</Label>
            <textarea
              id="discord-content"
              bind:value={discordContent}
              placeholder="Message content..."
              rows={3}
              class="w-full px-3 py-2 text-sm rounded-md border border-border bg-background/50 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-[var(--cyber-indigo)] resize-y"
              onblur={handleUpdate}
            ></textarea>
          </div>

          <div class="space-y-2">
            <Label for="discord-username" class="text-foreground/90">Username Override</Label>
            <Input 
              id="discord-username"
              bind:value={discordUsername}
              placeholder="Bot name (optional)"
              class="bg-background/50 border-border text-sm"
              onblur={handleUpdate}
            />
          </div>
        </div>
      {/if}

      {#if actualNodeType === "telegram"}
        <div class="space-y-4">
          <div class="space-y-2">
            <Label for="telegram-token" class="text-foreground/90">Bot Token</Label>
            <Input 
              id="telegram-token"
              type="password"
              bind:value={telegramBotToken}
              placeholder="123456:ABC-DEF..."
              class="bg-background/50 border-border text-sm"
              onblur={handleUpdate}
            />
          </div>

          <div class="space-y-2">
            <Label for="telegram-chat" class="text-foreground/90">Chat ID</Label>
            <Input 
              id="telegram-chat"
              bind:value={telegramChatId}
              placeholder="@channel or numeric ID"
              class="bg-background/50 border-border text-sm"
              onblur={handleUpdate}
            />
          </div>

          <div class="space-y-2">
            <Label for="telegram-text" class="text-foreground/90">Message</Label>
            <textarea
              id="telegram-text"
              bind:value={telegramText}
              placeholder="Message text..."
              rows={3}
              class="w-full px-3 py-2 text-sm rounded-md border border-border bg-background/50 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-[var(--cyber-cyan)] resize-y"
              onblur={handleUpdate}
            ></textarea>
          </div>

          <div class="space-y-2">
            <Label class="text-foreground/90">Parse Mode</Label>
            <Select.Root
              type="single"
              value={telegramParseMode}
              onValueChange={(v) => { if (v) { telegramParseMode = v as typeof telegramParseMode; handleUpdate(); } }}
            >
              <Select.Trigger class="w-full bg-background/50 border-border">
                {telegramParseMode}
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="HTML" label="HTML" />
                <Select.Item value="Markdown" label="Markdown" />
                <Select.Item value="MarkdownV2" label="MarkdownV2" />
              </Select.Content>
            </Select.Root>
          </div>
        </div>
      {/if}

      {#if actualNodeType === "email"}
        <div class="space-y-4">
          <div class="space-y-2">
            <Label class="text-foreground/90">Provider</Label>
            <Select.Root
              type="single"
              value={emailProvider}
              onValueChange={(v) => { if (v) { emailProvider = v as typeof emailProvider; handleUpdate(); } }}
            >
              <Select.Trigger class="w-full bg-background/50 border-border">
                {emailProvider}
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="resend" label="Resend" />
                <Select.Item value="sendgrid" label="SendGrid" />
                <Select.Item value="mailgun" label="Mailgun" />
              </Select.Content>
            </Select.Root>
          </div>

          <div class="space-y-2">
            <Label for="email-to" class="text-foreground/90">To</Label>
            <Input 
              id="email-to"
              type="email"
              bind:value={emailTo}
              placeholder="recipient@example.com"
              class="bg-background/50 border-border text-sm"
              onblur={handleUpdate}
            />
          </div>

          <div class="space-y-2">
            <Label for="email-subject" class="text-foreground/90">Subject</Label>
            <Input 
              id="email-subject"
              bind:value={emailSubject}
              placeholder="Email subject"
              class="bg-background/50 border-border text-sm"
              onblur={handleUpdate}
            />
          </div>

          <div class="space-y-2">
            <Label for="email-body" class="text-foreground/90">Body</Label>
            <textarea
              id="email-body"
              bind:value={emailBody}
              placeholder="Email body..."
              rows={4}
              class="w-full px-3 py-2 text-sm rounded-md border border-border bg-background/50 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-[var(--cyber-magenta)] resize-y"
              onblur={handleUpdate}
            ></textarea>
          </div>
        </div>
      {/if}

      {#if actualNodeType === "d1-query"}
        <div class="space-y-4">
          <div class="space-y-2">
            <Label class="text-foreground/90">Operation</Label>
            <Select.Root
              type="single"
              value={d1Operation}
              onValueChange={(v) => { if (v) { d1Operation = v as typeof d1Operation; handleUpdate(); } }}
            >
              <Select.Trigger class="w-full bg-background/50 border-border">
                {d1Operation === "all" ? "Query (all rows)" : d1Operation === "first" ? "Query (first row)" : "Execute (INSERT/UPDATE/DELETE)"}
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="all" label="Query - Return all rows" />
                <Select.Item value="first" label="Query - Return first row" />
                <Select.Item value="run" label="Execute - INSERT/UPDATE/DELETE" />
              </Select.Content>
            </Select.Root>
          </div>

          <div class="space-y-2">
            <Label for="d1-query" class="text-foreground/90">SQL Query</Label>
            <textarea
              id="d1-query"
              bind:value={d1Query}
              placeholder="SELECT * FROM users WHERE id = ?"
              rows={4}
              class="w-full px-3 py-2 text-sm rounded-md border border-border bg-background/50 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-[var(--cyber-orange)] resize-y font-mono"
              onblur={handleUpdate}
            ></textarea>
            <p class="text-xs text-muted-foreground">Use ? for parameter placeholders</p>
          </div>
        </div>
      {/if}

      {#if actualNodeType === "r2-storage"}
        <div class="space-y-4">
          <div class="space-y-2">
            <Label class="text-foreground/90">Operation</Label>
            <Select.Root
              type="single"
              value={r2Operation}
              onValueChange={(v) => { if (v) { r2Operation = v as typeof r2Operation; handleUpdate(); } }}
            >
              <Select.Trigger class="w-full bg-background/50 border-border">
                {r2Operation}
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="get" label="Get - Download object" />
                <Select.Item value="put" label="Put - Upload object" />
                <Select.Item value="delete" label="Delete - Remove object" />
                <Select.Item value="list" label="List - List objects" />
                <Select.Item value="head" label="Head - Get metadata" />
              </Select.Content>
            </Select.Root>
          </div>

          {#if r2Operation !== "list"}
            <div class="space-y-2">
              <Label for="r2-key" class="text-foreground/90">Object Key</Label>
              <Input 
                id="r2-key"
                bind:value={r2Key}
                placeholder="path/to/file.txt"
                class="bg-background/50 border-border font-mono text-sm"
                onblur={handleUpdate}
              />
            </div>
          {/if}

          {#if r2Operation === "put"}
            <div class="space-y-2">
              <Label for="r2-content" class="text-foreground/90">Content</Label>
              <textarea
                id="r2-content"
                bind:value={r2Content}
                placeholder="File content or {'{{'}path.to.data{'}}'}"
                rows={3}
                class="w-full px-3 py-2 text-sm rounded-md border border-border bg-background/50 placeholder:text-muted-foreground focus-visible:outline-none resize-y"
                onblur={handleUpdate}
              ></textarea>
            </div>
          {/if}

          {#if r2Operation === "list"}
            <div class="space-y-2">
              <Label for="r2-prefix" class="text-foreground/90">Prefix Filter</Label>
              <Input 
                id="r2-prefix"
                bind:value={r2Prefix}
                placeholder="folder/ (optional)"
                class="bg-background/50 border-border font-mono text-sm"
                onblur={handleUpdate}
              />
            </div>
          {/if}
        </div>
      {/if}

      {#if actualNodeType === "approval"}
        <div class="space-y-4">
          <div class="space-y-2">
            <Label for="approval-message" class="text-foreground/90">Approval Message</Label>
            <textarea
              id="approval-message"
              bind:value={approvalMessage}
              placeholder="Please review and approve this action..."
              rows={3}
              class="w-full px-3 py-2 text-sm rounded-md border border-border bg-background/50 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-[var(--cyber-cyan)] resize-y"
              onblur={handleUpdate}
            ></textarea>
          </div>

          <div class="space-y-2">
            <Label for="approval-timeout" class="text-foreground/90">Timeout</Label>
            <Input 
              id="approval-timeout"
              bind:value={approvalTimeout}
              placeholder="24h"
              class="bg-background/50 border-border text-sm"
              onblur={handleUpdate}
            />
            <p class="text-xs text-muted-foreground">
              Examples: 1h, 24h, 7d, 30 minutes
            </p>
          </div>
        </div>
      {/if}

      {#if !isImplemented && !nodeDefinition.isTrigger && nodeDefinition.category !== "ai" && actualNodeType !== "condition" && actualNodeType !== "switch" && actualNodeType !== "javascript" && actualNodeType !== "http-request" && actualNodeType !== "filter" && actualNodeType !== "transform" && actualNodeType !== "wait" && actualNodeType !== "error-handler" && actualNodeType !== "split" && actualNodeType !== "set-variable" && actualNodeType !== "parse-json" && actualNodeType !== "aggregate" && actualNodeType !== "discord" && actualNodeType !== "telegram" && actualNodeType !== "email" && actualNodeType !== "d1-query" && actualNodeType !== "r2-storage" && actualNodeType !== "approval"}
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
