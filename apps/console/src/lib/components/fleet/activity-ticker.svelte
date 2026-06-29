<script lang="ts">
  /**
   * Activity Ticker Component
   *
   * Fleet-wide audit activity displayed as a continuously scrolling marquee.
   * Repurposed from news-ticker.svelte — keeps the marquee animation and
   * items: string[] rendering; adds an onMount fetch from /api/activity that
   * maps AuditRows to display strings. Self-hides when there is nothing to show.
   *
   * No <style> block: animation defined in app.css (.ticker-scroll-content /
   * @keyframes ticker-scroll). Tailwind + inline styles for theming.
   */

  import { onMount } from "svelte";
  import { listFleetActivity } from "$lib/api/client";

  // Props (keep speed + pauseOnHover from news-ticker so the animation is tunable)
  let {
    speed = 100, // pixels per second
    pauseOnHover = true,
  }: {
    speed?: number;
    pauseOnHover?: boolean;
  } = $props();

  // Internal items built from fetched audit rows
  let items = $state<string[]>([]);

  // Duplicate items for seamless loop
  let displayItems = $derived(items.length > 0 ? [...items, ...items] : []);

  // Marquee state
  let contentRef = $state<HTMLDivElement | null>(null);
  let isPaused = $state(false);
  let animationDuration = $state(30);

  /** Compact relative time: "5s", "2m", "1h", "3d" */
  function rel(iso: string): string {
    try {
      const diff = Date.now() - new Date(iso).getTime();
      const s = Math.floor(diff / 1000);
      if (s < 60) return `${s}s`;
      const m = Math.floor(s / 60);
      if (m < 60) return `${m}m`;
      const h = Math.floor(m / 60);
      if (h < 24) return `${h}h`;
      return `${Math.floor(h / 24)}d`;
    } catch {
      return "?";
    }
  }

  onMount(async () => {
    try {
      const rows = await listFleetActivity();
      if (!rows || rows.length === 0) return;
      items = rows.map(
        (r) => `${r.verb} · ${String(r.stationKey).split(":")[0]} · ${rel(r.createdAt)}`
      );
    } catch {
      // Fetch failed — remain hidden; do not crash
    }
  });

  // Recalculate scroll duration once content is rendered
  $effect(() => {
    if (contentRef && items.length > 0) {
      const contentWidth = contentRef.scrollWidth / 2; // halved because we duplicate
      const calculated = contentWidth / speed;
      animationDuration = Math.max(15, Math.min(45, calculated));
    }
  });

  function handleMouseEnter() {
    if (pauseOnHover) isPaused = true;
  }

  function handleMouseLeave() {
    isPaused = false;
  }
</script>

{#if items.length > 0}
  <div
    class="relative w-full h-9 overflow-hidden flex items-center"
    style="background: hsl(var(--muted) / 0.5); border: 1px solid hsl(var(--border) / 0.5); border-radius: var(--radius);"
    onmouseenter={handleMouseEnter}
    onmouseleave={handleMouseLeave}
    role="marquee"
    aria-live="off"
  >
    <!-- Label -->
    <div
      class="absolute left-0 top-0 bottom-0 z-10 flex items-center px-3"
      style="background: var(--cyber-cyan); border-radius: var(--radius) 0 0 var(--radius);"
    >
      <!-- Arrow chevron tip -->
      <div
        class="absolute top-0 bottom-0 w-4"
        style="right: -8px; background: var(--cyber-cyan); clip-path: polygon(0 0, 100% 50%, 0 100%);"
      ></div>
      <span class="font-mono text-[10px] font-bold tracking-widest text-black relative z-10">
        ACTIVITY
      </span>
    </div>

    <!-- Scrolling content -->
    <div class="flex-1 overflow-hidden" style="margin-left: 84px;">
      <div
        class="ticker-scroll-content flex items-center whitespace-nowrap"
        class:ticker-paused={isPaused}
        bind:this={contentRef}
        style="--ticker-duration: {animationDuration}s"
      >
        {#each displayItems as item}
          <span
            class="font-mono text-[12px] px-3"
            style="color: hsl(var(--foreground) / 0.8);"
          >{item}</span>
          <span style="color: var(--cyber-cyan); opacity: 0.4; font-size: 8px;">•</span>
        {/each}
      </div>
    </div>

    <!-- Fade left edge -->
    <div
      class="absolute top-0 bottom-0 w-8 pointer-events-none z-[5]"
      style="left: 80px; background: linear-gradient(90deg, hsl(var(--muted) / 0.5) 0%, transparent 100%);"
    ></div>

    <!-- Fade right edge -->
    <div
      class="absolute right-0 top-0 bottom-0 w-8 pointer-events-none z-[5]"
      style="border-radius: 0 var(--radius) var(--radius) 0; background: linear-gradient(90deg, transparent 0%, hsl(var(--muted) / 0.5) 100%);"
    ></div>
  </div>
{/if}
