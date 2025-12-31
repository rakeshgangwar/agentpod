<script lang="ts">
  /**
   * Project Animated Icon Display
   * 
   * A component for displaying Lottie animated icons for projects.
   * Used in project cards, headers, and other display contexts.
   */
  
  import { 
    getAnimatedIcon,
    animatedIcons,
  } from "$lib/utils/animated-icons";
  import LottieIcon from "$lib/components/lottie-icon.svelte";
  
  // =============================================================================
  // Props
  // =============================================================================
  
  interface Props {
    /** Icon ID to display */
    iconId: string;
    /** Size in pixels */
    size?: number;
    /** Whether to loop the animation */
    loop?: boolean;
    /** Whether to autoplay */
    autoplay?: boolean;
    /** Play on hover only */
    hover?: boolean;
    /** Animation speed */
    speed?: number;
    /** Additional CSS classes */
    class?: string;
  }
  
  let {
    iconId,
    size = 32,
    loop = true,
    autoplay = true,
    hover = false,
    speed = 1,
    class: className = "",
  }: Props = $props();
  
  // =============================================================================
  // Derived
  // =============================================================================
  
  // Get the icon, fallback to first icon if not found
  const icon = $derived(getAnimatedIcon(iconId) ?? animatedIcons[0]);
</script>

<LottieIcon 
  src={icon.path} 
  {size}
  {loop}
  {autoplay}
  {hover}
  {speed}
  class={className}
/>
