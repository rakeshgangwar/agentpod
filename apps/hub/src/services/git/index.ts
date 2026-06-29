/**
 * Git Backend Interface
 * Abstract interface for Git repository management
 */

import type {
  Repository,
  CreateRepoOptions,
  CloneOptions,
  Commit,
  CommitOptions,
  Author,
  FileEntry,
  FileContent,
  FileStatus,
  Branch,
  Remote,
  SyncOptions,
  Diff,
  FileDiff,
  GitConfig,
} from "./types";

/**
 * Git Backend Interface
 *
 * Provides an abstraction layer for Git operations.
 * The primary implementation is FileSystemGitBackend, which uses
 * isomorphic-git to manage repositories on the local filesystem.
 */
export interface GitBackend {
  // ===========================================================================
  // Repository Lifecycle
  // ===========================================================================

  /**
   * Create a new empty repository
   * @param name - Repository name (used as directory name)
   * @param options - Creation options
   * @returns The created repository
   */
  createRepo(name: string, options?: CreateRepoOptions): Promise<Repository>;

  /**
   * Clone a repository from a remote URL
   * @param url - Remote repository URL (HTTPS or SSH)
   * @param name - Local repository name
   * @param options - Clone options
   * @returns The cloned repository
   */
  cloneRepo(url: string, name: string, options?: CloneOptions): Promise<Repository>;

  /**
   * Get a repository by name
   * @param name - Repository name
   * @returns Repository or null if not found
   */
  getRepo(name: string): Promise<Repository | null>;

  /**
   * Delete a repository
   * @param name - Repository name
   */
  deleteRepo(name: string): Promise<void>;

  /**
   * List all repositories
   * @returns Array of repositories
   */
  listRepos(): Promise<Repository[]>;

  /**
   * Check if a repository exists
   * @param name - Repository name
   * @returns True if exists
   */
  repoExists(name: string): Promise<boolean>;

  // ===========================================================================
  // Commit Operations
  // ===========================================================================

  /**
   * Create a new commit
   * @param repoName - Repository name
   * @param options - Commit options
   * @returns The commit SHA
   */
  commit(repoName: string, options: CommitOptions): Promise<string>;

  /**
   * Get commit history
   * @param repoName - Repository name
   * @param options - Log options
   * @returns Array of commits
   */
  getLog(
    repoName: string,
    options?: {
      limit?: number;
      ref?: string;
      path?: string;
    }
  ): Promise<Commit[]>;

  /**
   * Get a specific commit
   * @param repoName - Repository name
   * @param sha - Commit SHA
   * @returns Commit or null if not found
   */
  getCommit(repoName: string, sha: string): Promise<Commit | null>;

  // ===========================================================================
  // File Operations
  // ===========================================================================

  /**
   * List files in a directory
   * @param repoName - Repository name
   * @param path - Directory path (default: root)
   * @param ref - Git ref (default: HEAD)
   * @returns Array of file entries
   */
  listFiles(repoName: string, path?: string, ref?: string): Promise<FileEntry[]>;

  /**
   * Read a file's content
   * @param repoName - Repository name
   * @param path - File path
   * @param ref - Git ref (default: HEAD)
   * @returns File content or null if not found
   */
  readFile(repoName: string, path: string, ref?: string): Promise<FileContent | null>;

  /**
   * Write a file (stages the change)
   * @param repoName - Repository name
   * @param path - File path
   * @param content - File content
   */
  writeFile(repoName: string, path: string, content: string): Promise<void>;

  /**
   * Delete a file (stages the deletion)
   * @param repoName - Repository name
   * @param path - File path
   */
  deleteFile(repoName: string, path: string): Promise<void>;

  /**
   * Get the status of files in the working tree
   * @param repoName - Repository name
   * @param paths - Specific paths to check (default: all)
   * @returns Array of file statuses
   */
  getStatus(repoName: string, paths?: string[]): Promise<FileStatus[]>;

  /**
   * Stage files for commit
   * @param repoName - Repository name
   * @param paths - Paths to stage (default: all)
   */
  stageFiles(repoName: string, paths?: string[]): Promise<void>;

  /**
   * Unstage files
   * @param repoName - Repository name
   * @param paths - Paths to unstage (default: all)
   */
  unstageFiles(repoName: string, paths?: string[]): Promise<void>;

  // ===========================================================================
  // Branch Operations
  // ===========================================================================

  /**
   * Get the current branch
   * @param repoName - Repository name
   * @returns Current branch name
   */
  getCurrentBranch(repoName: string): Promise<string>;

  /**
   * List all branches
   * @param repoName - Repository name
   * @returns Array of branches
   */
  listBranches(repoName: string): Promise<Branch[]>;

  /**
   * Create a new branch
   * @param repoName - Repository name
   * @param branchName - New branch name
   * @param ref - Starting point (default: HEAD)
   */
  createBranch(repoName: string, branchName: string, ref?: string): Promise<void>;

  /**
   * Delete a branch
   * @param repoName - Repository name
   * @param branchName - Branch to delete
   */
  deleteBranch(repoName: string, branchName: string): Promise<void>;

  /**
   * Checkout a branch or ref
   * @param repoName - Repository name
   * @param ref - Branch name or commit SHA
   */
  checkout(repoName: string, ref: string): Promise<void>;

  // ===========================================================================
  // Remote Operations (Optional - for future GitHub sync)
  // ===========================================================================

  /**
   * List remotes
   * @param repoName - Repository name
   * @returns Array of remotes
   */
  listRemotes?(repoName: string): Promise<Remote[]>;

  /**
   * Add a remote
   * @param repoName - Repository name
   * @param remoteName - Remote name
   * @param url - Remote URL
   */
  addRemote?(repoName: string, remoteName: string, url: string): Promise<void>;

  /**
   * Remove a remote
   * @param repoName - Repository name
   * @param remoteName - Remote name
   */
  removeRemote?(repoName: string, remoteName: string): Promise<void>;

  /**
   * Push to a remote
   * @param repoName - Repository name
   * @param options - Push options
   */
  push?(repoName: string, options?: SyncOptions): Promise<void>;

  /**
   * Pull from a remote
   * @param repoName - Repository name
   * @param options - Pull options
   */
  pull?(repoName: string, options?: SyncOptions): Promise<void>;

  /**
   * Fetch from a remote
   * @param repoName - Repository name
   * @param options - Fetch options
   */
  fetch?(repoName: string, options?: SyncOptions): Promise<void>;

  // ===========================================================================
  // Diff Operations
  // ===========================================================================

  /**
   * Get diff between two refs or working tree
   * @param repoName - Repository name
   * @param options - Diff options
   * @returns Diff summary
   */
  getDiff?(
    repoName: string,
    options?: {
      from?: string;
      to?: string;
      paths?: string[];
    }
  ): Promise<Diff>;

  /**
   * Get detailed diff for a file
   * @param repoName - Repository name
   * @param path - File path
   * @param options - Diff options
   * @returns File diff
   */
  getFileDiff?(
    repoName: string,
    path: string,
    options?: {
      from?: string;
      to?: string;
    }
  ): Promise<FileDiff | null>;

  // ===========================================================================
  // Configuration
  // ===========================================================================

  /**
   * Get git configuration for a repository
   * @param repoName - Repository name
   * @returns Git configuration
   */
  getConfig?(repoName: string): Promise<GitConfig>;

  /**
   * Set git configuration for a repository
   * @param repoName - Repository name
   * @param config - Configuration to set
   */
  setConfig?(repoName: string, config: Partial<GitConfig>): Promise<void>;
}

/**
 * Configuration for GitBackend implementations
 */
export interface GitBackendConfig {
  /** Base directory for repositories */
  reposDir: string;

  /** Default author for commits */
  defaultAuthor?: Author;

  /** Default branch name for new repos */
  defaultBranch?: string;
}

// =============================================================================
// Exports
// =============================================================================

// Export all types
export * from "./types.ts";

// Export FileSystemGitBackend implementation
export { FileSystemGitBackend } from "./filesystem.ts";
export type { FileSystemGitBackendConfig } from "./filesystem.ts";
