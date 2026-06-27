<script lang="ts">
  import type { Snippet } from "svelte";
  import { cn } from "$lib/utils";
  import { BottomNav, BottomNavItem } from "$lib/components/ui/bottom-nav";
  import Home from "@lucide/svelte/icons/home";
  import FolderKanban from "@lucide/svelte/icons/folder-kanban";
  import Settings from "@lucide/svelte/icons/settings";

  interface Props {
    children: Snippet;
    /** Hide bottom navigation (useful for fullscreen views like terminal) */
    hideBottomNav?: boolean;
    /** Number of items requiring attention (shown as badge on Home) */
    attentionCount?: number;
    class?: string;
  }

  let { 
    children, 
    hideBottomNav = false, 
    attentionCount = 0,
    class: className 
  }: Props = $props();
</script>

<div
  class={cn(
    "min-h-screen flex flex-col",
    // Add bottom padding on mobile to account for bottom nav
    // Only when bottom nav is visible
    !hideBottomNav && "pb-16 md:pb-0",
    className
  )}
>
  <!-- Main content area -->
  <main class="flex-1 flex flex-col">
    {@render children()}
  </main>

  <!-- Bottom navigation (mobile only) -->
  {#if !hideBottomNav}
    <BottomNav>
      <BottomNavItem 
        href="/" 
        icon={Home} 
        label="Home" 
        badge={attentionCount}
      />
      <BottomNavItem 
        href="/projects" 
        icon={FolderKanban} 
        label="Projects" 
      />
      <BottomNavItem 
        href="/settings" 
        icon={Settings} 
        label="Settings" 
      />
    </BottomNav>
  {/if}
</div>
