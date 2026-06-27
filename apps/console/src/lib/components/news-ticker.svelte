<script lang="ts">
  /**
   * News Ticker Component
   * 
   * A continuously scrolling ticker like news TV channels.
   * Displays tips, stats, and fun messages.
   */
  
  import { onMount } from "svelte";
  
  // Props
  let {
    items = [] as string[],
    speed = 100, // pixels per second (higher = faster)
    pauseOnHover = true,
  }: {
    items?: string[];
    speed?: number;
    pauseOnHover?: boolean;
  } = $props();
  
  // Default items if none provided
  const defaultItems = [
    "💡 Pro tip: Your AI assistant remembers context between sessions",
    "🚀 New: Git branch management now available in the Sync tab",
    "⌨️ Shortcut: Press ⌘K to quickly search and switch projects",
    "🤖 AI agents can read your AGENTS.md file for project context",
    "📦 Tip: Use different container flavors for different tech stacks",
    "🔄 Your changes are automatically saved to the Git repository",
    "💬 Start a chat session to collaborate with your AI assistant",
    "🎯 Define clear project descriptions to help AI understand your goals",
    "⚡ Containers start in seconds with pre-built development environments",
    "🔐 All your code stays on your machine - nothing leaves your Docker",
  ];
  
  // Use provided items or defaults
  let tickerItems = $derived(items.length > 0 ? items : defaultItems);
  
  // Duplicate items for seamless loop
  let displayItems = $derived([...tickerItems, ...tickerItems]);
  
  // State
  let contentRef = $state<HTMLDivElement | null>(null);
  let isPaused = $state(false);
  let animationDuration = $state(30);
  
  // Calculate animation duration based on content width and speed
  onMount(() => {
    if (contentRef) {
      const contentWidth = contentRef.scrollWidth / 2; // Half because we duplicate
      // Calculate duration but cap it for reasonable speed
      const calculatedDuration = contentWidth / speed;
      // Minimum 15s, maximum 45s for good readability
      animationDuration = Math.max(15, Math.min(45, calculatedDuration));
    }
  });
  
  function handleMouseEnter() {
    if (pauseOnHover) {
      isPaused = true;
    }
  }
  
  function handleMouseLeave() {
    isPaused = false;
  }
</script>

<div 
  class="ticker-container"
  onmouseenter={handleMouseEnter}
  onmouseleave={handleMouseLeave}
  role="marquee"
  aria-live="off"
>
  <!-- Label -->
  <div class="ticker-label">
    <span class="ticker-label-text">LIVE</span>
  </div>
  
  <!-- Scrolling content -->
  <div class="ticker-wrapper">
    <div 
      class="ticker-content"
      class:paused={isPaused}
      bind:this={contentRef}
      style="--duration: {animationDuration}s"
    >
      {#each displayItems as item}
        <span class="ticker-item">
          {item}
        </span>
        <span class="ticker-separator">•</span>
      {/each}
    </div>
  </div>
  
  <!-- Fade edges -->
  <div class="ticker-fade-left"></div>
  <div class="ticker-fade-right"></div>
</div>

<style>
  .ticker-container {
    position: relative;
    width: 100%;
    height: 36px;
    background: hsl(var(--muted) / 0.5);
    border: 1px solid hsl(var(--border) / 0.5);
    border-radius: var(--radius);
    overflow: hidden;
    display: flex;
    align-items: center;
  }
  
  .ticker-label {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    z-index: 10;
    display: flex;
    align-items: center;
    padding: 0 12px;
    background: var(--cyber-cyan);
    border-radius: var(--radius) 0 0 var(--radius);
  }
  
  .ticker-label::after {
    content: '';
    position: absolute;
    right: -8px;
    top: 0;
    bottom: 0;
    width: 16px;
    background: var(--cyber-cyan);
    clip-path: polygon(0 0, 100% 50%, 0 100%);
  }
  
  .ticker-label-text {
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: black;
  }
  
  .ticker-wrapper {
    flex: 1;
    overflow: hidden;
    margin-left: 65px;
  }
  
  .ticker-content {
    display: flex;
    align-items: center;
    white-space: nowrap;
    animation: scroll var(--duration, 30s) linear infinite;
  }
  
  .ticker-content.paused {
    animation-play-state: paused;
  }
  
  .ticker-item {
    font-family: var(--font-mono);
    font-size: 12px;
    color: hsl(var(--foreground) / 0.8);
    padding: 0 12px;
  }
  
  .ticker-separator {
    color: var(--cyber-cyan);
    opacity: 0.4;
    font-size: 8px;
  }
  
  .ticker-fade-left {
    position: absolute;
    left: 60px;
    top: 0;
    bottom: 0;
    width: 30px;
    background: linear-gradient(90deg, hsl(var(--muted) / 0.5) 0%, transparent 100%);
    pointer-events: none;
    z-index: 5;
  }
  
  .ticker-fade-right {
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    width: 30px;
    background: linear-gradient(90deg, transparent 0%, hsl(var(--muted) / 0.5) 100%);
    pointer-events: none;
    z-index: 5;
    border-radius: 0 var(--radius) var(--radius) 0;
  }
  
  @keyframes scroll {
    0% {
      transform: translateX(0);
    }
    100% {
      transform: translateX(-50%);
    }
  }
  
  /* Mobile adjustments */
  @media (max-width: 640px) {
    .ticker-container {
      height: 32px;
    }
    
    .ticker-label {
      padding: 0 10px;
    }
    
    .ticker-label-text {
      font-size: 9px;
    }
    
    .ticker-wrapper {
      margin-left: 55px;
    }
    
    .ticker-item {
      font-size: 11px;
      padding: 0 10px;
    }
    
    .ticker-fade-left {
      left: 50px;
      width: 20px;
    }
    
    .ticker-fade-right {
      width: 20px;
    }
  }
</style>
