<script lang="ts">
  import type { Snippet, Component } from "svelte";
  import { page } from "$app/state";
  import { cn } from "$lib/utils";
  import { BottomNav, BottomNavItem } from "$lib/components/ui/bottom-nav";
  import { auth } from "$lib/stores/auth.svelte";
  import Server from "@lucide/svelte/icons/server";
  import Settings from "@lucide/svelte/icons/settings";
  import ShieldIcon from "@lucide/svelte/icons/shield";
  interface NavItem {
    href: string;
    label: string;
    icon: Component<{ class?: string }>;
    adminOnly?: boolean;
  }

  interface Props {
    children?: Snippet;
    /** Hide bottom navigation (useful for fullscreen views like terminal) */
    hideBottomNav?: boolean;
    /** Number of items requiring attention (shown as badge on Fleet item) */
    attentionCount?: number;
    class?: string;
  }

  let {
    children,
    hideBottomNav = false,
    attentionCount = 0,
    class: className,
  }: Props = $props();

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  let isAdmin = $derived(auth.user?.role === "admin");

  // Primary nav items — shared between mobile BottomNav and desktop side nav
  const baseNavItems: NavItem[] = [
    { href: "/", label: "Fleet", icon: Server },
    { href: "/settings", label: "Settings", icon: Settings },
  ];

  const adminNavItem: NavItem = {
    href: "/admin",
    label: "Admin",
    icon: ShieldIcon,
    adminOnly: true,
  };

  // Reactive list — recomputes when isAdmin changes
  let navItems = $derived([...baseNavItems, ...(isAdmin ? [adminNavItem] : [])]);

  // ---------------------------------------------------------------------------
  // Active-link helper (mirrors BottomNavItem logic)
  // ---------------------------------------------------------------------------

  function isActive(href: string): boolean {
    const pathname = page.url.pathname;
    return href === "/" ? pathname === "/" : pathname.startsWith(href);
  }
</script>

<!-- Outer wrapper: flex row — side nav + content column -->
<div class={cn("min-h-screen flex", className)}>

  <!-- =========================================================
       Desktop side nav  (hidden on mobile, visible md+)
       ========================================================= -->
  <aside
    class={cn(
      "hidden md:flex flex-col shrink-0",
      "w-16 lg:w-56 sticky top-0 h-screen",
      "border-r border-border/50",
      "bg-background/95 backdrop-blur-lg supports-[backdrop-filter]:bg-background/80",
      "z-40",
    )}
    aria-label="Main navigation"
  >
    <!-- Brand / logo -->
    <div class="p-3 lg:p-4 border-b border-border/30 shrink-0">
      <div class="flex items-center gap-3">
        <div
          class="w-8 h-8 rounded-sm flex items-center justify-center shrink-0
                 bg-[var(--cyber-cyan,hsl(180_100%_50%))]/10
                 border border-[var(--cyber-cyan,hsl(180_100%_50%))]/30"
        >
          <Server class="w-4 h-4 text-[var(--cyber-cyan,hsl(180_100%_50%))]" />
        </div>
        <span class="hidden lg:block text-sm font-mono font-bold tracking-wider truncate">
          AgentPod
        </span>
      </div>
    </div>

    <!-- Nav items -->
    <nav class="flex-1 p-2 space-y-0.5 overflow-y-auto">
      {#each navItems as item (item.href)}
        {@const active = isActive(item.href)}
        <a
          href={item.href}
          class={cn(
            "flex items-center gap-3 px-2 py-2.5 rounded-sm",
            "font-mono text-sm transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            active
              ? "text-primary bg-primary/8"
              : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
          )}
          aria-current={active ? "page" : undefined}
        >
          <item.icon
            class={cn(
              "h-5 w-5 shrink-0 transition-transform",
              active && "scale-110",
            )}
          />
          <span class="hidden lg:block truncate">{item.label}</span>
        </a>
      {/each}
    </nav>

  </aside>

  <!-- =========================================================
       Content column  (grows, holds main + mobile nav)
       ========================================================= -->
  <div
    class={cn(
      "flex-1 flex flex-col min-w-0",
      // On mobile: pad bottom so content doesn't hide under BottomNav
      !hideBottomNav && "pb-16 md:pb-0",
    )}
  >
    <!-- Page content -->
    <main class="flex-1 flex flex-col">
      {@render children?.()}
    </main>

    <!-- Mobile bottom navigation (md:hidden is built into <BottomNav>) -->
    {#if !hideBottomNav}
      <BottomNav>
        {#each navItems as item (item.href)}
          <BottomNavItem
            href={item.href}
            icon={item.icon}
            label={item.label}
            badge={item.href === "/" ? attentionCount : 0}
          />
        {/each}
      </BottomNav>
    {/if}
  </div>
</div>
