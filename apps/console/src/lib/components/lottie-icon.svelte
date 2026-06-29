<script lang="ts">
  /**
   * Lottie Icon Component
   * 
   * A Svelte component for rendering Lottie animations using lottie-web.
   * Supports local JSON files from /static/icons/animated/.
   * 
   * Usage:
   *   <LottieIcon src="/icons/animated/rocket.json" />
   *   <LottieIcon src="/icons/animated/rocket.json" loop={false} hover />
   */
  
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import lottie, { type AnimationItem } from "lottie-web";
  
  // =============================================================================
  // Props
  // =============================================================================
  
  interface Props {
    /** Path to the Lottie JSON file */
    src: string;
    /** Size in pixels (width & height) */
    size?: number;
    /** Whether to loop the animation */
    loop?: boolean;
    /** Whether to autoplay on mount */
    autoplay?: boolean;
    /** Play on hover only */
    hover?: boolean;
    /** Animation speed (1 = normal) */
    speed?: number;
    /** Additional CSS classes */
    class?: string;
  }
  
  let {
    src,
    size = 48,
    loop = true,
    autoplay = true,
    hover = false,
    speed = 1,
    class: className = "",
  }: Props = $props();
  
  // =============================================================================
  // State
  // =============================================================================
  
  let container: HTMLDivElement;
  let animation: AnimationItem | null = null;
  
  // =============================================================================
  // Lifecycle
  // =============================================================================
  
  onMount(() => {
    if (!browser || !container) return;
    
    // Determine autoplay based on hover mode
    const shouldAutoplay = hover ? false : autoplay;
    
    animation = lottie.loadAnimation({
      container,
      renderer: "svg",
      loop,
      autoplay: shouldAutoplay,
      path: src,
    });
    
    // Set speed
    if (speed !== 1) {
      animation.setSpeed(speed);
    }
    
    return () => {
      animation?.destroy();
      animation = null;
    };
  });
  
  // =============================================================================
  // Handlers
  // =============================================================================
  
  function handleMouseEnter() {
    if (hover && animation) {
      animation.play();
    }
  }
  
  function handleMouseLeave() {
    if (hover && animation) {
      animation.stop();
    }
  }
</script>

<div
  bind:this={container}
  class="lottie-icon {className}"
  style="width: {size}px; height: {size}px;"
  onmouseenter={handleMouseEnter}
  onmouseleave={handleMouseLeave}
  role="img"
  aria-label="Animated icon"
></div>

<style>
  .lottie-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  
  .lottie-icon :global(svg) {
    width: 100% !important;
    height: 100% !important;
  }
</style>
