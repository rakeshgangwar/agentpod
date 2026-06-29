/**
 * Project Icons
 * 
 * A curated set of icons for projects, organized by category.
 * Users can select these when creating or editing a project.
 */

import type { Component } from "svelte";

// Lucide icon imports
import CodeIcon from "@lucide/svelte/icons/code";
import TerminalIcon from "@lucide/svelte/icons/terminal";
import BugIcon from "@lucide/svelte/icons/bug";
import RocketIcon from "@lucide/svelte/icons/rocket";
import ZapIcon from "@lucide/svelte/icons/zap";
import CpuIcon from "@lucide/svelte/icons/cpu";
import DatabaseIcon from "@lucide/svelte/icons/database";
import ServerIcon from "@lucide/svelte/icons/server";
import CloudIcon from "@lucide/svelte/icons/cloud";
import GlobeIcon from "@lucide/svelte/icons/globe";
import ShieldIcon from "@lucide/svelte/icons/shield";
import LockIcon from "@lucide/svelte/icons/lock";
import KeyIcon from "@lucide/svelte/icons/key";
import WrenchIcon from "@lucide/svelte/icons/wrench";
import HammerIcon from "@lucide/svelte/icons/hammer";
import CogIcon from "@lucide/svelte/icons/cog";
import LayersIcon from "@lucide/svelte/icons/layers";
import BoxIcon from "@lucide/svelte/icons/box";
import PackageIcon from "@lucide/svelte/icons/package";
import FolderIcon from "@lucide/svelte/icons/folder";
import FileCodeIcon from "@lucide/svelte/icons/file-code";
import GitBranchIcon from "@lucide/svelte/icons/git-branch";
import GitMergeIcon from "@lucide/svelte/icons/git-merge";
import BrainIcon from "@lucide/svelte/icons/brain";
import SparklesIcon from "@lucide/svelte/icons/sparkles";
import BotIcon from "@lucide/svelte/icons/bot";
import MessageSquareIcon from "@lucide/svelte/icons/message-square";
import FlaskConicalIcon from "@lucide/svelte/icons/flask-conical";
import TestTubeIcon from "@lucide/svelte/icons/test-tube";
import BeakerIcon from "@lucide/svelte/icons/beaker";
import LightbulbIcon from "@lucide/svelte/icons/lightbulb";
import TargetIcon from "@lucide/svelte/icons/target";
import TrophyIcon from "@lucide/svelte/icons/trophy";
import GamepadIcon from "@lucide/svelte/icons/gamepad-2";
import MusicIcon from "@lucide/svelte/icons/music";
import ImageIcon from "@lucide/svelte/icons/image";
import VideoIcon from "@lucide/svelte/icons/video";
import HeartIcon from "@lucide/svelte/icons/heart";
import StarIcon from "@lucide/svelte/icons/star";
import SunIcon from "@lucide/svelte/icons/sun";
import MoonIcon from "@lucide/svelte/icons/moon";

// =============================================================================
// Types
// =============================================================================

export interface ProjectIcon {
  id: string;
  name: string;
  component: Component;
  category: IconCategory;
}

export type IconCategory = 
  | "development" 
  | "infrastructure" 
  | "security" 
  | "ai" 
  | "creative" 
  | "misc";

// =============================================================================
// Icon Registry
// =============================================================================

export const projectIcons: ProjectIcon[] = [
  // Development
  { id: "code", name: "Code", component: CodeIcon, category: "development" },
  { id: "terminal", name: "Terminal", component: TerminalIcon, category: "development" },
  { id: "bug", name: "Bug", component: BugIcon, category: "development" },
  { id: "file-code", name: "File Code", component: FileCodeIcon, category: "development" },
  { id: "git-branch", name: "Git Branch", component: GitBranchIcon, category: "development" },
  { id: "git-merge", name: "Git Merge", component: GitMergeIcon, category: "development" },
  { id: "layers", name: "Layers", component: LayersIcon, category: "development" },
  { id: "folder", name: "Folder", component: FolderIcon, category: "development" },
  
  // Infrastructure
  { id: "server", name: "Server", component: ServerIcon, category: "infrastructure" },
  { id: "database", name: "Database", component: DatabaseIcon, category: "infrastructure" },
  { id: "cloud", name: "Cloud", component: CloudIcon, category: "infrastructure" },
  { id: "cpu", name: "CPU", component: CpuIcon, category: "infrastructure" },
  { id: "globe", name: "Globe", component: GlobeIcon, category: "infrastructure" },
  { id: "box", name: "Box", component: BoxIcon, category: "infrastructure" },
  { id: "package", name: "Package", component: PackageIcon, category: "infrastructure" },
  
  // Security
  { id: "shield", name: "Shield", component: ShieldIcon, category: "security" },
  { id: "lock", name: "Lock", component: LockIcon, category: "security" },
  { id: "key", name: "Key", component: KeyIcon, category: "security" },
  
  // AI & Automation
  { id: "brain", name: "Brain", component: BrainIcon, category: "ai" },
  { id: "sparkles", name: "Sparkles", component: SparklesIcon, category: "ai" },
  { id: "bot", name: "Bot", component: BotIcon, category: "ai" },
  { id: "message-square", name: "Chat", component: MessageSquareIcon, category: "ai" },
  { id: "zap", name: "Zap", component: ZapIcon, category: "ai" },
  { id: "rocket", name: "Rocket", component: RocketIcon, category: "ai" },
  
  // Creative & Tools
  { id: "wrench", name: "Wrench", component: WrenchIcon, category: "creative" },
  { id: "hammer", name: "Hammer", component: HammerIcon, category: "creative" },
  { id: "cog", name: "Cog", component: CogIcon, category: "creative" },
  { id: "flask", name: "Flask", component: FlaskConicalIcon, category: "creative" },
  { id: "test-tube", name: "Test Tube", component: TestTubeIcon, category: "creative" },
  { id: "beaker", name: "Beaker", component: BeakerIcon, category: "creative" },
  { id: "lightbulb", name: "Lightbulb", component: LightbulbIcon, category: "creative" },
  
  // Misc
  { id: "target", name: "Target", component: TargetIcon, category: "misc" },
  { id: "trophy", name: "Trophy", component: TrophyIcon, category: "misc" },
  { id: "gamepad", name: "Gamepad", component: GamepadIcon, category: "misc" },
  { id: "music", name: "Music", component: MusicIcon, category: "misc" },
  { id: "image", name: "Image", component: ImageIcon, category: "misc" },
  { id: "video", name: "Video", component: VideoIcon, category: "misc" },
  { id: "heart", name: "Heart", component: HeartIcon, category: "misc" },
  { id: "star", name: "Star", component: StarIcon, category: "misc" },
  { id: "sun", name: "Sun", component: SunIcon, category: "misc" },
  { id: "moon", name: "Moon", component: MoonIcon, category: "misc" },
];

// =============================================================================
// Helpers
// =============================================================================

/**
 * Get icon by ID
 */
export function getProjectIcon(id: string): ProjectIcon | undefined {
  return projectIcons.find(icon => icon.id === id);
}

/**
 * Get icons by category
 */
export function getIconsByCategory(category: IconCategory): ProjectIcon[] {
  return projectIcons.filter(icon => icon.category === category);
}

/**
 * Get all categories with their icons
 */
export function getIconCategories(): { category: IconCategory; label: string; icons: ProjectIcon[] }[] {
  return [
    { category: "development", label: "Development", icons: getIconsByCategory("development") },
    { category: "infrastructure", label: "Infrastructure", icons: getIconsByCategory("infrastructure") },
    { category: "security", label: "Security", icons: getIconsByCategory("security") },
    { category: "ai", label: "AI & Automation", icons: getIconsByCategory("ai") },
    { category: "creative", label: "Tools & Creative", icons: getIconsByCategory("creative") },
    { category: "misc", label: "Miscellaneous", icons: getIconsByCategory("misc") },
  ];
}

/**
 * Get a random icon (for default assignment)
 */
export function getRandomIcon(): ProjectIcon {
  const randomIndex = Math.floor(Math.random() * projectIcons.length);
  return projectIcons[randomIndex];
}

/**
 * Default icons for different project types (can be used for auto-suggestion)
 */
export const defaultIconsByType: Record<string, string> = {
  "web": "globe",
  "api": "server",
  "cli": "terminal",
  "ai": "brain",
  "ml": "sparkles",
  "bot": "bot",
  "mobile": "layers",
  "game": "gamepad",
  "data": "database",
  "security": "shield",
  "devops": "cloud",
  "default": "code",
};

/**
 * Get suggested icon based on project name or type
 * Always returns a deterministic result (no randomness)
 */
export function getSuggestedIcon(projectName: string): ProjectIcon {
  const nameLower = projectName.toLowerCase();
  
  // Check for keywords in project name
  if (nameLower.includes("api") || nameLower.includes("backend")) {
    return getProjectIcon("server")!;
  }
  if (nameLower.includes("web") || nameLower.includes("frontend") || nameLower.includes("site")) {
    return getProjectIcon("globe")!;
  }
  if (nameLower.includes("ai") || nameLower.includes("ml") || nameLower.includes("model")) {
    return getProjectIcon("brain")!;
  }
  if (nameLower.includes("bot") || nameLower.includes("chat")) {
    return getProjectIcon("bot")!;
  }
  if (nameLower.includes("cli") || nameLower.includes("terminal") || nameLower.includes("shell")) {
    return getProjectIcon("terminal")!;
  }
  if (nameLower.includes("db") || nameLower.includes("database") || nameLower.includes("data")) {
    return getProjectIcon("database")!;
  }
  if (nameLower.includes("test") || nameLower.includes("spec")) {
    return getProjectIcon("flask")!;
  }
  if (nameLower.includes("game")) {
    return getProjectIcon("gamepad")!;
  }
  
  // Default to "code" icon (deterministic, not random)
  return getProjectIcon("code")!;
}
