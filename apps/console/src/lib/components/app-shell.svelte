<script lang="ts">
  import type { Snippet, Component } from "svelte";
  import { page } from "$app/state";
  import { cn } from "$lib/utils";
  import { BottomNav, BottomNavItem } from "$lib/components/ui/bottom-nav";
  import { auth } from "$lib/stores/auth.svelte";
  import LayoutDashboard from "@lucide/svelte/icons/layout-dashboard";
  import Boxes from "@lucide/svelte/icons/boxes";
  import Server from "@lucide/svelte/icons/server";
  import ContainerIcon from "@lucide/svelte/icons/container";
  import ActivityIcon from "@lucide/svelte/icons/activity";
  import Settings from "@lucide/svelte/icons/settings";
  import ShieldIcon from "@lucide/svelte/icons/shield";

  interface NavItem {
    href: string;
    label: string;
    icon: Component<{ class?: string }>;
    adminOnly?: boolean;
  }

  interface NavGroup {
    label: string;
    items: NavItem[];
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

  // Resource-typed nav groups for the desktop sidebar
  const baseNavGroups: NavGroup[] = [
    {
      label: "Fleet",
      items: [
        { href: "/", label: "Overview", icon: LayoutDashboard },
        { href: "/agents", label: "Agents", icon: Boxes },
        { href: "/nodes", label: "Nodes", icon: Server },
        { href: "/runtimes", label: "Runtimes", icon: ContainerIcon },
        { href: "/activity", label: "Activity", icon: ActivityIcon },
      ],
    },
    {
      label: "System",
      items: [
        { href: "/settings", label: "Settings", icon: Settings },
      ],
    },
  ];

  const adminNavItem: NavItem = {
    href: "/admin",
    label: "Admin",
    icon: ShieldIcon,
    adminOnly: true,
  };

  // Reactive nav groups — System group gains Admin when user is admin
  let navGroups = $derived(
    baseNavGroups.map((g) =>
      g.label === "System" && isAdmin
        ? { ...g, items: [...g.items, adminNavItem] }
        : g
    )
  );

  // Flat list for the mobile BottomNav (derived from groups, same reactivity)
  let navItems = $derived(navGroups.flatMap((g) => g.items));

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
                 bg-primary/10
                 border border-primary/30"
        >
          <Server class="w-4 h-4 text-primary" />
        </div>
        <span class="hidden lg:block text-sm font-mono font-bold tracking-wider truncate">
          AgentPod
        </span>
      </div>
    </div>

    <!-- Nav items — grouped with uppercase section labels -->
    <nav class="flex-1 p-2 overflow-y-auto">
      {#each navGroups as group (group.label)}
        <!-- Group label — hidden on collapsed (icon-only) sidebar -->
        <p class="hidden lg:block font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground/50 px-2 pt-3 pb-1 first:pt-1">
          {group.label}
        </p>
        <div class="space-y-0.5 mb-1">
          {#each group.items as item (item.href)}
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
        </div>
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
