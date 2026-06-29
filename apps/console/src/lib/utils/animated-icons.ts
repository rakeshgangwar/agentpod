/**
 * Animated Icons Registry
 * 
 * Registry of local Lottie animated icons.
 * Icons are stored in /static/icons/animated/ as JSON files.
 * 
 * @see https://lottiefiles.com - Source for free Lottie animations
 */

// =============================================================================
// Types
// =============================================================================

export interface AnimatedIcon {
  id: string;
  name: string;
  category: AnimatedIconCategory;
  /** Path to the JSON file (relative to /static/) */
  path: string;
}

export type AnimatedIconCategory = 
  | "workspace"
  | "ai"
  | "media"
  | "misc";

// =============================================================================
// Icon Registry
// =============================================================================

/**
 * Curated list of animated icons.
 * All icons are under 100KB and sourced from LottieFiles (free).
 */
export const animatedIcons: AnimatedIcon[] = [
  // Workspace
  {
    id: "coding-workspace",
    name: "Coding Workspace",
    category: "workspace",
    path: "/icons/animated/coding-workspace.json",
  },
  
  // AI & Robots
  {
    id: "robot-thinking",
    name: "Robot Thinking",
    category: "ai",
    path: "/icons/animated/robot-thinking.json",
  },
  {
    id: "robot-assistant",
    name: "Robot Assistant",
    category: "ai",
    path: "/icons/animated/robot-assistant.json",
  },
  
  // Media
  {
    id: "music",
    name: "Music",
    category: "media",
    path: "/icons/animated/music.json",
  },
  {
    id: "video",
    name: "Video",
    category: "media",
    path: "/icons/animated/video.json",
  },
  
  // Misc
  {
    id: "lines-animation",
    name: "Lines",
    category: "misc",
    path: "/icons/animated/lines-animation.json",
  },
  {
    id: "paper-plane",
    name: "Paper Plane",
    category: "misc",
    path: "/icons/animated/paper-plane.json",
  },
];

// =============================================================================
// Helpers
// =============================================================================

/**
 * Get animated icon by ID
 */
export function getAnimatedIcon(id: string): AnimatedIcon | undefined {
  return animatedIcons.find(icon => icon.id === id);
}

/**
 * Get animated icons by category
 */
export function getAnimatedIconsByCategory(category: AnimatedIconCategory): AnimatedIcon[] {
  return animatedIcons.filter(icon => icon.category === category);
}

/**
 * Get all animated icon categories with their icons
 */
export function getAnimatedIconCategories(): { category: AnimatedIconCategory; label: string; icons: AnimatedIcon[] }[] {
  return [
    { category: "workspace", label: "Workspace", icons: getAnimatedIconsByCategory("workspace") },
    { category: "ai", label: "AI & Robots", icons: getAnimatedIconsByCategory("ai") },
    { category: "media", label: "Media", icons: getAnimatedIconsByCategory("media") },
    { category: "misc", label: "Miscellaneous", icons: getAnimatedIconsByCategory("misc") },
  ];
}

/**
 * Get animated icon path by ID
 */
export function getAnimatedIconPath(id: string): string | undefined {
  return getAnimatedIcon(id)?.path;
}

/**
 * Check if an icon ID exists in the registry
 */
export function isValidAnimatedIcon(id: string): boolean {
  return animatedIcons.some(icon => icon.id === id);
}
