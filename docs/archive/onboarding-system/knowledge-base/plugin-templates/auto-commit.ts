/**
 * @id plugin_auto_commit
 * @title Auto-Commit Plugin
 * @description Automatically commits changes after session idle or task completion
 * @tags ["git", "automation", "commit", "workflow"]
 * @applicable_to null
 * @priority medium
 */

import type { Plugin } from "@opencode-ai/plugin";

/**
 * Auto-Commit Plugin
 * 
 * This plugin automatically commits changes to git when:
 * - The session becomes idle for a configurable duration
 * - A specific message pattern indicates task completion
 * 
 * Features:
 * - Configurable idle timeout
 * - Smart commit message generation
 * - Skip if no changes
 * - Configurable branch patterns to exclude
 * - Dry-run mode for testing
 * 
 * Usage:
 * Place this file in .opencode/plugin/auto-commit.ts
 * 
 * Environment Variables:
 * - AUTO_COMMIT_IDLE_MS: Idle time before auto-commit (default: 60000 = 1 minute)
 * - AUTO_COMMIT_DRY_RUN: Set to "true" to log without committing
 * - AUTO_COMMIT_EXCLUDE_BRANCHES: Comma-separated branches to skip (default: main,master,production)
 */

// Configuration
const IDLE_TIMEOUT_MS = parseInt(process.env.AUTO_COMMIT_IDLE_MS || "60000", 10);
const DRY_RUN = process.env.AUTO_COMMIT_DRY_RUN === "true";
const EXCLUDE_BRANCHES = (process.env.AUTO_COMMIT_EXCLUDE_BRANCHES || "main,master,production")
  .split(",")
  .map(b => b.trim());

// Track session state
let lastActivityTime = Date.now();
let pendingCommitTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Auto-Commit Plugin
 * 
 * Uses the $ shell utility from plugin context to run git commands,
 * and the event handler to track session activity.
 */
export const AutoCommitPlugin: Plugin = async ({ $, directory }) => {
  console.log(`[auto-commit] Initialized in ${directory}`);
  
  async function getCurrentBranch(): Promise<string> {
    try {
      const result = await $`git rev-parse --abbrev-ref HEAD`;
      return result.stdout.trim();
    } catch {
      return "";
    }
  }
  
  async function hasUncommittedChanges(): Promise<boolean> {
    try {
      const result = await $`git status --porcelain`;
      return result.stdout.trim().length > 0;
    } catch {
      return false;
    }
  }
  
  async function getChangeSummary(): Promise<string> {
    try {
      const diffStat = await $`git diff --stat HEAD`;
      const lines = diffStat.stdout.trim().split("\n");
      const lastLine = lines[lines.length - 1] || "";
      
      // Parse "X files changed, Y insertions(+), Z deletions(-)"
      const match = lastLine.match(/(\d+) files? changed/);
      const filesChanged = match ? parseInt(match[1], 10) : 0;
      
      // Get list of modified files
      const diffNames = await $`git diff --name-only HEAD`;
      const files = diffNames.stdout.trim().split("\n").filter(Boolean).slice(0, 5);
      
      if (files.length === 0) {
        // Check for untracked files
        const untrackedResult = await $`git ls-files --others --exclude-standard`;
        const untracked = untrackedResult.stdout.trim().split("\n").filter(Boolean);
        if (untracked.length > 0) {
          return `Add ${untracked.length} new file(s): ${untracked.slice(0, 3).join(", ")}${untracked.length > 3 ? "..." : ""}`;
        }
        return "Update files";
      }
      
      // Generate descriptive message
      const fileTypes = new Set(files.map(f => {
        const ext = f.split(".").pop()?.toLowerCase();
        return ext || "file";
      }));
      
      const typeStr = Array.from(fileTypes).slice(0, 2).join("/");
      
      if (filesChanged === 1) {
        return `Update ${files[0]}`;
      } else if (filesChanged <= 3) {
        return `Update ${files.join(", ")}`;
      } else {
        return `Update ${filesChanged} ${typeStr} files`;
      }
    } catch {
      return "Auto-commit: session changes";
    }
  }
  
  async function performAutoCommit(): Promise<void> {
    const branch = await getCurrentBranch();
    
    // Check if we should skip this branch
    if (EXCLUDE_BRANCHES.includes(branch)) {
      console.log(`[auto-commit] Skipping auto-commit on protected branch: ${branch}`);
      return;
    }
    
    // Check if there are changes
    if (!(await hasUncommittedChanges())) {
      console.log("[auto-commit] No changes to commit");
      return;
    }
    
    // Generate commit message
    const summary = await getChangeSummary();
    const message = `${summary} (auto-commit)`;
    
    if (DRY_RUN) {
      console.log(`[auto-commit] DRY RUN - Would commit: "${message}"`);
      return;
    }
    
    try {
      // Stage all changes
      await $`git add -A`;
      
      // Commit with generated message
      await $`git commit -m ${message}`;
      
      console.log(`[auto-commit] Committed: "${message}"`);
    } catch (error) {
      console.error("[auto-commit] Failed to commit:", error);
    }
  }
  
  function scheduleAutoCommit(): void {
    // Clear any existing timer
    if (pendingCommitTimer) {
      clearTimeout(pendingCommitTimer);
    }
    
    // Schedule new commit
    pendingCommitTimer = setTimeout(async () => {
      const idleTime = Date.now() - lastActivityTime;
      if (idleTime >= IDLE_TIMEOUT_MS) {
        await performAutoCommit();
      }
    }, IDLE_TIMEOUT_MS);
  }
  
  function cancelPendingCommit(): void {
    if (pendingCommitTimer) {
      clearTimeout(pendingCommitTimer);
      pendingCommitTimer = null;
    }
  }
  
  return {
    // Handle all events to track activity
    event: async ({ event }) => {
      const { type, properties } = event;
      
      switch (type) {
        case "session.created":
          // Reset state on new session
          lastActivityTime = Date.now();
          cancelPendingCommit();
          break;
          
        case "session.idle":
          // Check if idle long enough
          const duration = properties?.duration as number | undefined;
          if (duration && duration >= IDLE_TIMEOUT_MS) {
            await performAutoCommit();
          } else {
            scheduleAutoCommit();
          }
          break;
          
        case "file.edited":
          // Update activity time and schedule commit
          lastActivityTime = Date.now();
          scheduleAutoCommit();
          break;
      }
    },
    
    // Also hook into tool execution to track write operations
    "tool.execute.after": async (input) => {
      const { tool } = input;
      
      // Update activity time after tool execution
      lastActivityTime = Date.now();
      
      // If a write/edit tool was used, schedule commit
      if (tool === "write" || tool === "edit" || tool === "Write" || tool === "Edit") {
        scheduleAutoCommit();
      }
    },
  };
};

export default AutoCommitPlugin;
