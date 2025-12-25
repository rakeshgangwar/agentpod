<script lang="ts">
  import type { WorkflowNodeType } from "@agentpod/types";
  import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "$lib/components/ui/collapsible";
  import { Input } from "$lib/components/ui/input";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import SearchIcon from "@lucide/svelte/icons/search";
  import ZapIcon from "@lucide/svelte/icons/zap";
  import WebhookIcon from "@lucide/svelte/icons/webhook";
  import CalendarIcon from "@lucide/svelte/icons/calendar";
  import RadioIcon from "@lucide/svelte/icons/radio";
  import BotIcon from "@lucide/svelte/icons/bot";
  import SparklesIcon from "@lucide/svelte/icons/sparkles";
  import DatabaseIcon from "@lucide/svelte/icons/database";
  import SearchCodeIcon from "@lucide/svelte/icons/search-code";
  import GitBranchIcon from "@lucide/svelte/icons/git-branch";
  import RouteIcon from "@lucide/svelte/icons/route";
  import RepeatIcon from "@lucide/svelte/icons/repeat";
  import MergeIcon from "@lucide/svelte/icons/git-merge";
  import GlobeIcon from "@lucide/svelte/icons/globe";
  import MailIcon from "@lucide/svelte/icons/mail";
  import HardDriveIcon from "@lucide/svelte/icons/hard-drive";
  import CloudIcon from "@lucide/svelte/icons/cloud";
  import BellIcon from "@lucide/svelte/icons/bell";
  import UserCheckIcon from "@lucide/svelte/icons/user-check";
  import FormInputIcon from "@lucide/svelte/icons/form-input";
  import FileCodeIcon from "@lucide/svelte/icons/file-code";
  import type { Component } from "svelte";

  interface Props {
    collapsed?: boolean;
    onCollapsedChange?: (collapsed: boolean) => void;
  }

  let { collapsed = false, onCollapsedChange }: Props = $props();

  let searchQuery = $state("");

  interface NodeDefinition {
    type: WorkflowNodeType;
    label: string;
    description: string;
    icon: Component;
    color: string;
  }

  interface NodeCategory {
    id: string;
    label: string;
    nodes: NodeDefinition[];
  }

  const nodeCategories: NodeCategory[] = [
    {
      id: "triggers",
      label: "Triggers",
      nodes: [
        {
          type: "manual-trigger",
          label: "Manual Trigger",
          description: "Start workflow manually",
          icon: ZapIcon,
          color: "var(--cyber-cyan)",
        },
        {
          type: "webhook-trigger",
          label: "Webhook",
          description: "Trigger via HTTP request",
          icon: WebhookIcon,
          color: "var(--cyber-cyan)",
        },
        {
          type: "schedule-trigger",
          label: "Schedule",
          description: "Run on a schedule",
          icon: CalendarIcon,
          color: "var(--cyber-cyan)",
        },
        {
          type: "event-trigger",
          label: "Event",
          description: "Listen for events",
          icon: RadioIcon,
          color: "var(--cyber-cyan)",
        },
      ],
    },
    {
      id: "ai",
      label: "AI",
      nodes: [
        {
          type: "ai-agent",
          label: "AI Agent",
          description: "Autonomous AI agent",
          icon: BotIcon,
          color: "var(--cyber-emerald)",
        },
        {
          type: "ai-prompt",
          label: "AI Prompt",
          description: "Generate with LLM",
          icon: SparklesIcon,
          color: "var(--cyber-emerald)",
        },
        {
          type: "embeddings",
          label: "Embeddings",
          description: "Generate embeddings",
          icon: DatabaseIcon,
          color: "var(--cyber-emerald)",
        },
        {
          type: "vector-search",
          label: "Vector Search",
          description: "Search vector store",
          icon: SearchCodeIcon,
          color: "var(--cyber-emerald)",
        },
      ],
    },
    {
      id: "logic",
      label: "Logic",
      nodes: [
        {
          type: "condition",
          label: "Condition",
          description: "Branch based on condition",
          icon: GitBranchIcon,
          color: "var(--cyber-amber)",
        },
        {
          type: "switch",
          label: "Switch",
          description: "Multiple branches",
          icon: RouteIcon,
          color: "var(--cyber-amber)",
        },
        {
          type: "loop",
          label: "Loop",
          description: "Iterate over items",
          icon: RepeatIcon,
          color: "var(--cyber-amber)",
        },
        {
          type: "merge",
          label: "Merge",
          description: "Combine branches",
          icon: MergeIcon,
          color: "var(--cyber-amber)",
        },
      ],
    },
    {
      id: "actions",
      label: "Actions",
      nodes: [
        {
          type: "http-request",
          label: "HTTP Request",
          description: "Make API calls",
          icon: GlobeIcon,
          color: "var(--cyber-magenta)",
        },
        {
          type: "email",
          label: "Email",
          description: "Send email",
          icon: MailIcon,
          color: "var(--cyber-magenta)",
        },
        {
          type: "database",
          label: "Database",
          description: "Database operations",
          icon: HardDriveIcon,
          color: "var(--cyber-magenta)",
        },
        {
          type: "storage",
          label: "Storage",
          description: "File storage",
          icon: CloudIcon,
          color: "var(--cyber-magenta)",
        },
        {
          type: "notification",
          label: "Notification",
          description: "Send notifications",
          icon: BellIcon,
          color: "var(--cyber-magenta)",
        },
      ],
    },
    {
      id: "human",
      label: "Human",
      nodes: [
        {
          type: "approval",
          label: "Approval",
          description: "Wait for approval",
          icon: UserCheckIcon,
          color: "var(--cyber-cyan)",
        },
        {
          type: "form",
          label: "Form",
          description: "Collect user input",
          icon: FormInputIcon,
          color: "var(--cyber-cyan)",
        },
      ],
    },
    {
      id: "code",
      label: "Code",
      nodes: [
        {
          type: "javascript",
          label: "JavaScript",
          description: "Run JavaScript code",
          icon: FileCodeIcon,
          color: "var(--cyber-amber)",
        },
        {
          type: "python",
          label: "Python",
          description: "Run Python code",
          icon: FileCodeIcon,
          color: "var(--cyber-amber)",
        },
      ],
    },
  ];

  let expandedCategories = $state<Record<string, boolean>>(
    Object.fromEntries(nodeCategories.map((c) => [c.id, true]))
  );

  const filteredCategories = $derived.by(() => {
    if (!searchQuery.trim()) return nodeCategories;

    const query = searchQuery.toLowerCase();
    return nodeCategories
      .map((category) => ({
        ...category,
        nodes: category.nodes.filter(
          (node) =>
            node.label.toLowerCase().includes(query) ||
            node.description.toLowerCase().includes(query) ||
            node.type.toLowerCase().includes(query)
        ),
      }))
      .filter((category) => category.nodes.length > 0);
  });

  function handleDragStart(event: DragEvent, node: NodeDefinition) {
    console.log("[NodePalette] dragstart:", node.type);
    if (!event.dataTransfer) {
      console.log("[NodePalette] No dataTransfer!");
      return;
    }
    event.dataTransfer.setData("application/svelteflow", node.type);
    event.dataTransfer.effectAllowed = "move";
    console.log("[NodePalette] Data set successfully");
  }

  function toggleCategory(categoryId: string) {
    expandedCategories[categoryId] = !expandedCategories[categoryId];
  }
</script>

<div
  class="flex flex-col h-full bg-card/50 backdrop-blur-sm border-r border-border"
  class:w-64={!collapsed}
  class:w-0={collapsed}
  class:overflow-hidden={collapsed}
>
  <div class="p-3 border-b border-border space-y-3">
    <div class="flex items-center justify-between">
      <h3 class="text-sm font-semibold text-foreground uppercase tracking-wider font-mono">
        Nodes
      </h3>
    </div>

    <div class="relative">
      <SearchIcon class="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
      <Input
        type="text"
        placeholder="Search nodes..."
        bind:value={searchQuery}
        class="pl-8 h-8 text-sm bg-background/50 border-border focus:border-[var(--cyber-cyan)] focus:ring-[var(--cyber-cyan)]/20"
      />
    </div>
  </div>

  <div class="flex-1 overflow-y-auto p-2 space-y-1">
    {#each filteredCategories as category (category.id)}
      <Collapsible bind:open={expandedCategories[category.id]}>
        <CollapsibleTrigger
          class="flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
          onclick={() => toggleCategory(category.id)}
        >
          <span
            class="inline-flex transition-transform duration-200"
            style:transform={expandedCategories[category.id] ? "rotate(90deg)" : "rotate(0deg)"}
          >
            <ChevronRightIcon class="h-3.5 w-3.5" />
          </span>
          <span class="font-mono text-xs uppercase tracking-wider">{category.label}</span>
          <span class="ml-auto text-[10px] text-muted-foreground/60 font-mono">
            {category.nodes.length}
          </span>
        </CollapsibleTrigger>

        <CollapsibleContent class="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
          <div class="pl-2 pt-1 space-y-1">
            {#each category.nodes as node (node.type)}
              <button
                type="button"
                draggable="true"
                ondragstart={(e) => handleDragStart(e, node)}
                class="group flex items-center gap-3 w-full p-2 rounded-md border border-transparent bg-background/30 hover:bg-accent/50 hover:border-[color-mix(in_oklch,var(--cyber-cyan)_30%,transparent)] cursor-grab active:cursor-grabbing transition-all duration-200"
              >
                <div
                  class="flex-shrink-0 w-8 h-8 rounded flex items-center justify-center transition-all duration-200"
                  style:background="color-mix(in oklch, {node.color} 15%, transparent)"
                  style:border="1px solid color-mix(in oklch, {node.color} 30%, transparent)"
                >
                  <span style:color={node.color}>
                    <node.icon class="h-4 w-4 transition-all duration-200 group-hover:drop-shadow-[0_0_6px_var(--cyber-cyan)]" />
                  </span>
                </div>

                <div class="flex-1 min-w-0 text-left">
                  <div class="text-xs font-medium text-foreground truncate">
                    {node.label}
                  </div>
                  <div class="text-[10px] text-muted-foreground truncate">
                    {node.description}
                  </div>
                </div>
              </button>
            {/each}
          </div>
        </CollapsibleContent>
      </Collapsible>
    {/each}

    {#if filteredCategories.length === 0}
      <div class="flex flex-col items-center justify-center py-8 text-center">
        <SearchIcon class="h-8 w-8 text-muted-foreground/30 mb-2" />
        <p class="text-sm text-muted-foreground">No nodes found</p>
        <p class="text-xs text-muted-foreground/60">Try a different search term</p>
      </div>
    {/if}
  </div>

  <div class="p-3 border-t border-border">
    <p class="text-[10px] text-muted-foreground/60 text-center font-mono">
      Drag nodes to canvas
    </p>
  </div>
</div>
