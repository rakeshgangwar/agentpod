<script lang="ts">
  import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "$lib/components/ui/collapsible";
  import { Input } from "$lib/components/ui/input";
  import * as Tooltip from "$lib/components/ui/tooltip";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import SearchIcon from "@lucide/svelte/icons/search";
  import { NODE_CATEGORIES, NODE_REGISTRY, type NodeRegistryEntry } from "./node-registry";

  interface Props {
    collapsed?: boolean;
  }

  let { collapsed = false }: Props = $props();

  let searchQuery = $state("");

  interface PaletteCategory {
    id: string;
    label: string;
    nodes: NodeRegistryEntry[];
  }

  const paletteCategories: PaletteCategory[] = NODE_CATEGORIES.map(category => ({
    id: category.id,
    label: category.label,
    nodes: Object.values(NODE_REGISTRY).filter(node => node.category === category.id),
  })).filter(cat => cat.nodes.length > 0);

  const allNodes = $derived(
    Object.values(NODE_REGISTRY).filter(node => node.status === "implemented")
  );

  let expandedCategories = $state<Record<string, boolean>>(
    Object.fromEntries(NODE_CATEGORIES.map((c) => [c.id, true]))
  );

  const filteredCategories = $derived.by(() => {
    if (!searchQuery.trim()) return paletteCategories;

    const query = searchQuery.toLowerCase();
    return paletteCategories
      .map((category) => ({
        ...category,
        nodes: category.nodes.filter(
          (node) =>
            node.name.toLowerCase().includes(query) ||
            node.description.toLowerCase().includes(query) ||
            node.type.toLowerCase().includes(query)
        ),
      }))
      .filter((category) => category.nodes.length > 0);
  });

  function handleDragStart(event: DragEvent, node: NodeRegistryEntry) {
    if (!event.dataTransfer) return;
    event.dataTransfer.setData("application/svelteflow", node.type);
    event.dataTransfer.effectAllowed = "move";
  }

  function toggleCategory(categoryId: string) {
    expandedCategories[categoryId] = !expandedCategories[categoryId];
  }

  function getStatusBadge(status: string): { text: string; class: string } | null {
    if (status === "planned") return { text: "Soon", class: "bg-amber-500/20 text-amber-500" };
    if (status === "future") return { text: "Future", class: "bg-muted text-muted-foreground" };
    return null;
  }
</script>

<div
  class="flex flex-col h-full bg-card/50 backdrop-blur-sm border-r border-border overflow-hidden transition-all duration-300 ease-out"
  style:width={collapsed ? "3.5rem" : "16rem"}
  style:min-width={collapsed ? "3.5rem" : "16rem"}
>
  {#if collapsed}
    <div class="flex-1 overflow-y-auto py-2">
      <div class="flex flex-col items-center gap-1">
        {#each allNodes as node (node.type)}
          <Tooltip.Root>
            <Tooltip.Trigger>
              <button
                type="button"
                draggable="true"
                ondragstart={(e) => handleDragStart(e, node)}
                class="w-10 h-10 rounded-md flex items-center justify-center cursor-grab active:cursor-grabbing hover:bg-accent/50 transition-colors duration-200"
                style:background="color-mix(in oklch, {node.color} 10%, transparent)"
              >
                <span style:color={node.color}>
                  <node.icon class="h-5 w-5" />
                </span>
              </button>
            </Tooltip.Trigger>
            <Tooltip.Content side="right" class="font-medium">
              {node.name}
            </Tooltip.Content>
          </Tooltip.Root>
        {/each}
      </div>
    </div>
  {:else}
    <div class="p-3 border-b border-border space-y-3">
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-semibold text-foreground uppercase tracking-wider font-mono whitespace-nowrap">
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
            <span class="font-mono text-xs uppercase tracking-wider whitespace-nowrap">{category.label}</span>
            <span class="ml-auto text-[10px] text-muted-foreground/60 font-mono">
              {category.nodes.length}
            </span>
          </CollapsibleTrigger>

          <CollapsibleContent class="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
            <div class="pl-2 pt-1 space-y-1">
              {#each category.nodes as node (node.type)}
                {@const statusBadge = getStatusBadge(node.status)}
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
                    <div class="flex items-center gap-1.5">
                      <span class="text-xs font-medium text-foreground truncate">
                        {node.name}
                      </span>
                      {#if statusBadge}
                        <span class="text-[9px] px-1.5 py-0.5 rounded-full {statusBadge.class}">
                          {statusBadge.text}
                        </span>
                      {/if}
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
      <p class="text-[10px] text-muted-foreground/60 text-center font-mono whitespace-nowrap">
        Drag nodes to canvas
      </p>
    </div>
  {/if}
</div>
