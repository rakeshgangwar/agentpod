/**
 * Git Store
 * 
 * Manages git state (branches, diffs) using Svelte 5 runes.
 * This store handles branch management and diff viewing for sandboxes.
 */

import * as api from "$lib/api/tauri";
import type {
  GitBranch,
  GitBranchesResponse,
  GitDiffSummary,
  GitFileDiff,
  GitStatusResponse,
  GitLogResponse,
} from "$lib/api/tauri";

// =============================================================================
// State
// =============================================================================

// Branch state
let branches = $state<GitBranch[]>([]);
let currentBranch = $state<string>("");
let isLoadingBranches = $state(false);
let branchError = $state<string | null>(null);

// Diff state
let diffSummary = $state<GitDiffSummary | null>(null);
let selectedFileDiff = $state<GitFileDiff | null>(null);
let selectedFilePath = $state<string | null>(null);
let isLoadingDiff = $state(false);
let isLoadingFileDiff = $state(false);
let diffError = $state<string | null>(null);

// Git status state (from existing implementation)
let gitStatus = $state<GitStatusResponse | null>(null);
let gitLog = $state<GitLogResponse | null>(null);
let isLoadingStatus = $state(false);
let isLoadingLog = $state(false);

// Current sandbox ID being tracked
let activeSandboxId = $state<string | null>(null);

// =============================================================================
// Exported State (Reactive Getters)
// =============================================================================

export const gitStore = {
  // Branch state
  get branches() { return branches; },
  get currentBranch() { return currentBranch; },
  get isLoadingBranches() { return isLoadingBranches; },
  get branchError() { return branchError; },
  
  // Diff state
  get diffSummary() { return diffSummary; },
  get selectedFileDiff() { return selectedFileDiff; },
  get selectedFilePath() { return selectedFilePath; },
  get isLoadingDiff() { return isLoadingDiff; },
  get isLoadingFileDiff() { return isLoadingFileDiff; },
  get diffError() { return diffError; },
  
  // Git status state
  get status() { return gitStatus; },
  get log() { return gitLog; },
  get isLoadingStatus() { return isLoadingStatus; },
  get isLoadingLog() { return isLoadingLog; },
  
  // Computed properties
  get hasChanges() { return gitStatus?.files && gitStatus.files.length > 0; },
  get changedFileCount() { 
    if (!diffSummary) return 0;
    return diffSummary.added.length + 
           diffSummary.modified.length + 
           diffSummary.deleted.length + 
           diffSummary.renamed.length;
  },
  get stagedFiles() {
    return gitStatus?.files.filter(f => 
      f.staged && f.staged !== " " && f.staged !== "?" && f.staged !== "unmodified"
    ) ?? [];
  },
  get unstagedFiles() {
    return gitStatus?.files.filter(f => 
      f.unstaged && f.unstaged !== " " && f.unstaged !== "unmodified"
    ) ?? [];
  },
  
  // Active sandbox
  get activeSandboxId() { return activeSandboxId; },
};

// =============================================================================
// Branch Operations
// =============================================================================

/**
 * Set the active sandbox for git operations
 */
export function setActiveSandbox(sandboxId: string | null) {
  activeSandboxId = sandboxId;
  // Clear state when sandbox changes
  if (sandboxId !== activeSandboxId) {
    clearGitState();
  }
}

/**
 * Clear all git state
 */
export function clearGitState() {
  branches = [];
  currentBranch = "";
  diffSummary = null;
  selectedFileDiff = null;
  selectedFilePath = null;
  gitStatus = null;
  gitLog = null;
  branchError = null;
  diffError = null;
}

/**
 * Fetch branches for the active sandbox
 */
export async function fetchBranches(sandboxId?: string): Promise<GitBranchesResponse | null> {
  const id = sandboxId ?? activeSandboxId;
  if (!id) {
    branchError = "No sandbox ID provided";
    return null;
  }

  isLoadingBranches = true;
  branchError = null;

  try {
    const response = await api.listSandboxBranches(id);
    branches = response.branches;
    currentBranch = response.current;
    return response;
  } catch (e) {
    branchError = e instanceof Error ? e.message : "Failed to fetch branches";
    console.error("Failed to fetch branches:", e);
    return null;
  } finally {
    isLoadingBranches = false;
  }
}

/**
 * Create a new branch
 */
export async function createBranch(
  name: string,
  fromRef?: string,
  sandboxId?: string
): Promise<boolean> {
  const id = sandboxId ?? activeSandboxId;
  if (!id) {
    branchError = "No sandbox ID provided";
    return false;
  }

  isLoadingBranches = true;
  branchError = null;

  try {
    await api.createSandboxBranch(id, name, fromRef);
    // Refresh branches after creation
    await fetchBranches(id);
    return true;
  } catch (e) {
    branchError = e instanceof Error ? e.message : "Failed to create branch";
    console.error("Failed to create branch:", e);
    return false;
  } finally {
    isLoadingBranches = false;
  }
}

/**
 * Checkout (switch to) a branch
 */
export async function checkoutBranch(branchName: string, sandboxId?: string): Promise<boolean> {
  const id = sandboxId ?? activeSandboxId;
  if (!id) {
    branchError = "No sandbox ID provided";
    return false;
  }

  isLoadingBranches = true;
  branchError = null;

  try {
    await api.checkoutSandboxBranch(id, branchName);
    currentBranch = branchName;
    // Refresh branches and status after checkout
    await Promise.all([
      fetchBranches(id),
      fetchGitStatus(id),
      fetchDiffSummary(id),
    ]);
    return true;
  } catch (e) {
    branchError = e instanceof Error ? e.message : "Failed to checkout branch";
    console.error("Failed to checkout branch:", e);
    return false;
  } finally {
    isLoadingBranches = false;
  }
}

/**
 * Delete a branch
 */
export async function deleteBranch(branchName: string, sandboxId?: string): Promise<boolean> {
  const id = sandboxId ?? activeSandboxId;
  if (!id) {
    branchError = "No sandbox ID provided";
    return false;
  }

  // Don't allow deleting current branch
  if (branchName === currentBranch) {
    branchError = "Cannot delete the current branch";
    return false;
  }

  isLoadingBranches = true;
  branchError = null;

  try {
    await api.deleteSandboxBranch(id, branchName);
    // Refresh branches after deletion
    await fetchBranches(id);
    return true;
  } catch (e) {
    branchError = e instanceof Error ? e.message : "Failed to delete branch";
    console.error("Failed to delete branch:", e);
    return false;
  } finally {
    isLoadingBranches = false;
  }
}

// =============================================================================
// Diff Operations
// =============================================================================

/**
 * Fetch diff summary (list of changed files)
 */
export async function fetchDiffSummary(
  sandboxId?: string,
  fromRef?: string,
  toRef?: string
): Promise<GitDiffSummary | null> {
  const id = sandboxId ?? activeSandboxId;
  if (!id) {
    diffError = "No sandbox ID provided";
    return null;
  }

  isLoadingDiff = true;
  diffError = null;

  try {
    const response = await api.getSandboxDiff(id, fromRef, toRef);
    diffSummary = response.diff;
    return response.diff;
  } catch (e) {
    diffError = e instanceof Error ? e.message : "Failed to fetch diff";
    console.error("Failed to fetch diff:", e);
    return null;
  } finally {
    isLoadingDiff = false;
  }
}

/**
 * Fetch detailed diff for a specific file
 */
export async function fetchFileDiff(
  filePath: string,
  sandboxId?: string
): Promise<GitFileDiff | null> {
  const id = sandboxId ?? activeSandboxId;
  if (!id) {
    diffError = "No sandbox ID provided";
    return null;
  }

  isLoadingFileDiff = true;
  diffError = null;
  selectedFilePath = filePath;

  try {
    const response = await api.getSandboxFileDiff(id, filePath);
    selectedFileDiff = response.fileDiff;
    return response.fileDiff;
  } catch (e) {
    diffError = e instanceof Error ? e.message : "Failed to fetch file diff";
    console.error("Failed to fetch file diff:", e);
    selectedFileDiff = null;
    return null;
  } finally {
    isLoadingFileDiff = false;
  }
}

/**
 * Clear the selected file diff
 */
export function clearFileDiff() {
  selectedFileDiff = null;
  selectedFilePath = null;
}

// =============================================================================
// Git Status Operations (moved from sync page)
// =============================================================================

/**
 * Fetch git status
 */
export async function fetchGitStatus(sandboxId?: string): Promise<GitStatusResponse | null> {
  const id = sandboxId ?? activeSandboxId;
  if (!id) return null;

  isLoadingStatus = true;

  try {
    gitStatus = await api.getSandboxGitStatus(id);
    return gitStatus;
  } catch (e) {
    console.error("Failed to fetch git status:", e);
    return null;
  } finally {
    isLoadingStatus = false;
  }
}

/**
 * Fetch git log
 */
export async function fetchGitLog(sandboxId?: string): Promise<GitLogResponse | null> {
  const id = sandboxId ?? activeSandboxId;
  if (!id) return null;

  isLoadingLog = true;

  try {
    gitLog = await api.getSandboxGitLog(id);
    return gitLog;
  } catch (e) {
    console.error("Failed to fetch git log:", e);
    return null;
  } finally {
    isLoadingLog = false;
  }
}

/**
 * Refresh all git data (status, log, branches, diff)
 */
export async function refreshAll(sandboxId?: string): Promise<void> {
  const id = sandboxId ?? activeSandboxId;
  if (!id) return;

  await Promise.all([
    fetchGitStatus(id),
    fetchGitLog(id),
    fetchBranches(id),
    fetchDiffSummary(id),
  ]);
}

/**
 * Commit changes
 */
export async function commitChanges(
  message: string,
  sandboxId?: string
): Promise<boolean> {
  const id = sandboxId ?? activeSandboxId;
  if (!id) return false;

  try {
    await api.commitSandboxChanges(id, message);
    // Refresh after commit
    await refreshAll(id);
    return true;
  } catch (e) {
    console.error("Failed to commit changes:", e);
    return false;
  }
}
