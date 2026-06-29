<script lang="ts">
  import { onMount } from "svelte";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Input } from "$lib/components/ui/input";
  import { commandPalette } from "$lib/stores/command-palette.svelte";
  import { listNodes } from "$lib/api/client";
  import { goto } from "$app/navigation";
  import { cn } from "$lib/utils";
  import SearchIcon from "@lucide/svelte/icons/search";
  import ServerIcon from "@lucide/svelte/icons/server";
  import PlusCircleIcon from "@lucide/svelte/icons/plus-circle";
  import KeyRoundIcon from "@lucide/svelte/icons/key-round";
  import LayoutDashboardIcon from "@lucide/svelte/icons/layout-dashboard";
  import SettingsIcon from "@lucide/svelte/icons/settings";

  // ── Types ────────────────────────────────────────────────────────────────────

  type PaletteItem = {
    label: string;
    group: "actions" | "nodes";
    run: () => void;
  };

  // ── State ────────────────────────────────────────────────────────────────────

  let search = $state("");
  let highlightIndex = $state(0);
  let nodes = $state<{ id: string; hostname: string }[]>([]);
  let loading = $state(false);

  // ── Static actions ────────────────────────────────────────────────────────────

  const staticActions: PaletteItem[] = [
    {
      label: "New runtime",
      group: "actions",
      run: () => {
        window.dispatchEvent(new CustomEvent("agentpod:new-runtime"));
        commandPalette.close();
      },
    },
    {
      label: "Create enrollment token",
      group: "actions",
      run: () => {
        window.dispatchEvent(new CustomEvent("agentpod:create-token"));
        commandPalette.close();
      },
    },
    {
      label: "Fleet",
      group: "actions",
      run: () => {
        goto("/");
        commandPalette.close();
      },
    },
    {
      label: "Settings",
      group: "actions",
      run: () => {
        goto("/settings");
        commandPalette.close();
      },
    },
  ];

  // ── Derived: all items ────────────────────────────────────────────────────────

  let nodeItems = $derived<PaletteItem[]>(
    nodes.map((n) => ({
      label: n.hostname,
      group: "nodes" as const,
      run: () => {
        goto(`/nodes/${n.id}`);
        commandPalette.close();
      },
    }))
  );

  let allItems = $derived<PaletteItem[]>([...staticActions, ...nodeItems]);

  let filteredItems = $derived<PaletteItem[]>(
    search.trim()
      ? allItems.filter((item) =>
          item.label.toLowerCase().includes(search.toLowerCase())
        )
      : allItems
  );

  // ── Load nodes on open ────────────────────────────────────────────────────────

  $effect(() => {
    if (commandPalette.isOpen) {
      search = "";
      highlightIndex = 0;
      loading = true;
      listNodes()
        .then((fetched) => {
          nodes = fetched.map((n) => ({ id: n.id, hostname: n.hostname }));
        })
        .catch(() => {
          nodes = [];
        })
        .finally(() => {
          loading = false;
        });
    }
  });

  // ── Keyboard navigation ────────────────────────────────────────────────────────

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      highlightIndex = Math.min(highlightIndex + 1, filteredItems.length - 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      highlightIndex = Math.max(highlightIndex - 1, 0);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = filteredItems[highlightIndex];
      if (item) {
        item.run();
      }
    }
  }

  // ── Reset highlight when filter changes ────────────────────────────────────────

  $effect(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    filteredItems;
    highlightIndex = 0;
  });

  // ── Open change ────────────────────────────────────────────────────────────────

  function handleOpenChange(open: boolean) {
    if (!open) {
      commandPalette.close();
    }
  }

  // ── Item icon ─────────────────────────────────────────────────────────────────

  function iconFor(item: PaletteItem) {
    if (item.group === "nodes") return ServerIcon;
    if (item.label === "New runtime") return PlusCircleIcon;
    if (item.label === "Create enrollment token") return KeyRoundIcon;
    if (item.label === "Fleet") return LayoutDashboardIcon;
    return SettingsIcon;
  }
</script>

<Dialog.Root open={commandPalette.isOpen} onOpenChange={handleOpenChange}>
  <Dialog.Content
    class="max-w-2xl p-0 gap-0 overflow-hidden"
    showCloseButton={false}
    onkeydown={handleKeydown}
  >
    <!-- Header / search input -->
    <div class="flex items-center gap-3 px-4 py-3 border-b border-border/50">
      <SearchIcon class="w-4 h-4 text-muted-foreground shrink-0" />
      <Input
        type="text"
        placeholder="Search fleet commands, nodes…"
        bind:value={search}
        class="border-0 bg-transparent shadow-none focus-visible:ring-0 h-auto py-0 px-0 text-sm font-mono"
        autofocus
      />
      <kbd
        class="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded border border-border/50 text-[10px] font-mono text-muted-foreground"
      >
        ESC
      </kbd>
    </div>

    <!-- Item list -->
    <div class="py-2 max-h-[60vh] overflow-y-auto">
      {#if loading}
        <div class="px-4 py-6 text-center">
          <span
            class="text-xs font-mono text-muted-foreground tracking-wider uppercase"
          >
            Loading<span class="typing-cursor"></span>
          </span>
        </div>
      {:else if filteredItems.length === 0}
        <div class="px-4 py-6 text-center">
          <span class="text-sm text-muted-foreground">No results for "{search}"</span>
        </div>
      {:else}
        <!-- Group: actions -->
        {#if filteredItems.some((i) => i.group === "actions")}
          <p
            class="px-4 py-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground"
          >
            Actions
          </p>
          {#each filteredItems as item, idx}
            {#if item.group === "actions"}
              {@const Icon = iconFor(item)}
              <button
                class={cn(
                  "w-full text-left flex items-center gap-3 px-4 py-2.5 text-sm transition-colors",
                  "hover:bg-muted/50",
                  highlightIndex === idx &&
                    "bg-[var(--cyber-cyan)]/10 text-[var(--cyber-cyan)]"
                )}
                onclick={() => item.run()}
                onmouseenter={() => (highlightIndex = idx)}
              >
                <Icon class="w-4 h-4 shrink-0 opacity-60" />
                <span>{item.label}</span>
              </button>
            {/if}
          {/each}
        {/if}

        <!-- Group: nodes -->
        {#if filteredItems.some((i) => i.group === "nodes")}
          <p
            class="px-4 pt-3 pb-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground border-t border-border/30 mt-1"
          >
            Nodes
          </p>
          {#each filteredItems as item, idx}
            {#if item.group === "nodes"}
              {@const Icon = iconFor(item)}
              <button
                class={cn(
                  "w-full text-left flex items-center gap-3 px-4 py-2.5 text-sm transition-colors",
                  "hover:bg-muted/50",
                  highlightIndex === idx &&
                    "bg-[var(--cyber-cyan)]/10 text-[var(--cyber-cyan)]"
                )}
                onclick={() => item.run()}
                onmouseenter={() => (highlightIndex = idx)}
              >
                <Icon class="w-4 h-4 shrink-0 opacity-60" />
                <span>{item.label}</span>
              </button>
            {/if}
          {/each}
        {/if}
      {/if}
    </div>

    <!-- Footer hint -->
    <div
      class="flex items-center gap-4 px-4 py-2 border-t border-border/30 bg-muted/20"
    >
      <span class="text-[10px] font-mono text-muted-foreground">
        <kbd class="rounded border border-border/50 px-1 py-0.5 text-[9px]">↑↓</kbd>
        Navigate
      </span>
      <span class="text-[10px] font-mono text-muted-foreground">
        <kbd class="rounded border border-border/50 px-1 py-0.5 text-[9px]">↵</kbd>
        Open
      </span>
      <span class="text-[10px] font-mono text-muted-foreground">
        <kbd class="rounded border border-border/50 px-1 py-0.5 text-[9px]">Esc</kbd>
        Close
      </span>
    </div>
  </Dialog.Content>
</Dialog.Root>
