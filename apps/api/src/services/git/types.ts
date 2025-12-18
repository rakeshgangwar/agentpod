/**
 * Git Backend Types
 * Shared types for the filesystem-based Git backend
 */

// ============================================================================
// Repository Types
// ============================================================================

/**
 * Represents a Git repository
 */
export interface Repository {
  /** Repository name (unique identifier) */
  name: string;

  /** Absolute path to the repository on the filesystem */
  path: string;

  /** When the repository was created */
  createdAt: Date;

  /** When the repository was last modified */
  lastModified: Date;

  /** Current branch name */
  currentBranch?: string;

  /** Whether the repository has uncommitted changes */
  isDirty?: boolean;

  /** Remote URL if configured */
  remoteUrl?: string;

  /** Repository description (from .git/description or config) */
  description?: string;
}

/**
 * Options for creating a new repository
 */
export interface CreateRepoOptions {
  /** Initial branch name (default: "main") */
  defaultBranch?: string;

  /** Repository description */
  description?: string;

  /** Whether to create an initial commit */
  initialCommit?: boolean;

  /** Author for initial commit */
  author?: Author;

  /** Template files to create (e.g., README.md, .gitignore) */
  template?: RepositoryTemplate;
}

/**
 * Repository template configuration
 */
export interface RepositoryTemplate {
  /** Create a README.md file */
  readme?: boolean | string;

  /** Create a .gitignore file with content or template name */
  gitignore?: boolean | string;

  /** Create an agentpod.toml configuration file */
  agentpodConfig?: boolean;

  /** Additional files to create */
  files?: Record<string, string>;
  
  /** Project display name (used in README, AGENTS.md) */
  projectName?: string;
  
  /** Project description (used in README, AGENTS.md) */
  projectDescription?: string;
}

/**
 * Options for cloning a repository
 */
export interface CloneOptions {
  /** Clone depth (for shallow clones) */
  depth?: number;

  /** Clone only a single branch */
  singleBranch?: boolean;

  /** Branch to clone (default: default branch) */
  branch?: string;

  /** Authentication for private repositories */
  auth?: GitAuth;

  /** Progress callback */
  onProgress?: (progress: CloneProgress) => void;
}

/**
 * Clone progress information
 */
export interface CloneProgress {
  phase: "counting" | "compressing" | "receiving" | "resolving" | "done";
  loaded: number;
  total: number;
  percent: number;
}

// ============================================================================
// Commit Types
// ============================================================================

/**
 * Represents a Git commit
 */
export interface Commit {
  /** Commit SHA hash */
  sha: string;

  /** Commit message */
  message: string;

  /** Commit author */
  author: Author;

  /** Commit committer (may differ from author) */
  committer: Author;

  /** Parent commit SHAs */
  parents: string[];

  /** Commit timestamp */
  timestamp: Date;
}

/**
 * Represents a commit author or committer
 */
export interface Author {
  /** Author name */
  name: string;

  /** Author email */
  email: string;

  /** Timestamp (optional, defaults to current time) */
  timestamp?: Date;
}

/**
 * Options for creating a commit
 */
export interface CommitOptions {
  /** Commit message */
  message: string;

  /** Commit author */
  author: Author;

  /** Committer (defaults to author) */
  committer?: Author;

  /** Allow empty commits */
  allowEmpty?: boolean;

  /** Amend the previous commit */
  amend?: boolean;
}

// ============================================================================
// File Types
// ============================================================================

/**
 * Represents a file or directory in a repository
 */
export interface FileEntry {
  /** File or directory name */
  name: string;

  /** Full path relative to repository root */
  path: string;

  /** Entry type */
  type: "file" | "directory" | "symlink" | "submodule";

  /** File mode (e.g., "100644" for regular file) */
  mode: string;

  /** SHA of the blob (for files) or tree (for directories) */
  sha: string;

  /** File size in bytes (only for files) */
  size?: number;
}

/**
 * File content with metadata
 */
export interface FileContent {
  /** File path */
  path: string;

  /** File content as string */
  content: string;

  /** Content encoding */
  encoding: "utf8" | "base64";

  /** File size in bytes */
  size: number;

  /** SHA of the blob */
  sha: string;
}

/**
 * File status in working tree
 */
export interface FileStatus {
  /** File path */
  path: string;

  /** Status in the index (staged) */
  staged: StatusCode;

  /** Status in the working tree (unstaged) */
  unstaged: StatusCode;

  /** Whether the file is tracked */
  tracked: boolean;
}

/**
 * Status codes for file changes
 */
export type StatusCode =
  | "unmodified"
  | "modified"
  | "added"
  | "deleted"
  | "renamed"
  | "copied"
  | "untracked"
  | "ignored";

// ============================================================================
// Branch Types
// ============================================================================

/**
 * Represents a Git branch
 */
export interface Branch {
  /** Branch name */
  name: string;

  /** Full ref name (e.g., "refs/heads/main") */
  ref: string;

  /** SHA of the commit the branch points to */
  sha: string;

  /** Whether this is the current branch */
  current: boolean;

  /** Upstream branch if tracking */
  upstream?: string;

  /** Number of commits ahead of upstream */
  ahead?: number;

  /** Number of commits behind upstream */
  behind?: number;
}

// ============================================================================
// Remote Types
// ============================================================================

/**
 * Represents a Git remote
 */
export interface Remote {
  /** Remote name (e.g., "origin") */
  name: string;

  /** Fetch URL */
  fetchUrl: string;

  /** Push URL (may differ from fetch URL) */
  pushUrl: string;
}

/**
 * Authentication for Git operations
 */
export interface GitAuth {
  /** Username for HTTP(S) auth */
  username?: string;

  /** Password or personal access token */
  password?: string;

  /** OAuth token (alternative to username/password) */
  token?: string;

  /** SSH private key (for SSH URLs) */
  privateKey?: string;

  /** SSH passphrase */
  passphrase?: string;
}

/**
 * Options for push/pull operations
 */
export interface SyncOptions {
  /** Remote name (default: "origin") */
  remote?: string;

  /** Branch name (default: current branch) */
  branch?: string;

  /** Authentication */
  auth?: GitAuth;

  /** Force push (dangerous!) */
  force?: boolean;

  /** Progress callback */
  onProgress?: (progress: SyncProgress) => void;
}

/**
 * Sync progress information
 */
export interface SyncProgress {
  phase: "counting" | "compressing" | "writing" | "done";
  loaded: number;
  total: number;
  percent: number;
}

// ============================================================================
// Diff Types
// ============================================================================

/**
 * Represents a diff between two commits or working tree
 */
export interface Diff {
  /** Files that were added */
  added: string[];

  /** Files that were modified */
  modified: string[];

  /** Files that were deleted */
  deleted: string[];

  /** Files that were renamed */
  renamed: Array<{ from: string; to: string }>;
}

/**
 * Detailed diff for a single file
 */
export interface FileDiff {
  /** File path */
  path: string;

  /** Change type */
  type: "add" | "modify" | "delete" | "rename";

  /** Old path (for renames) */
  oldPath?: string;

  /** Diff content in unified format */
  patch?: string;

  /** Number of lines added */
  additions: number;

  /** Number of lines deleted */
  deletions: number;

  /** Structured hunks for rich diff display */
  hunks?: DiffHunk[];
}

/**
 * A hunk represents a contiguous section of changes in a diff
 */
export interface DiffHunk {
  /** Starting line number in the old file */
  oldStart: number;

  /** Number of lines in the old file for this hunk */
  oldLines: number;

  /** Starting line number in the new file */
  newStart: number;

  /** Number of lines in the new file for this hunk */
  newLines: number;

  /** The individual lines in this hunk */
  lines: DiffLine[];
}

/**
 * A single line in a diff hunk
 */
export interface DiffLine {
  /** Type of change */
  type: "context" | "addition" | "deletion";

  /** The content of the line (without the +/- prefix) */
  content: string;

  /** Line number in the old file (for context and deletion) */
  oldLineNumber?: number;

  /** Line number in the new file (for context and addition) */
  newLineNumber?: number;
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Git configuration options
 */
export interface GitConfig {
  /** User name for commits */
  userName?: string;

  /** User email for commits */
  userEmail?: string;

  /** Default branch name for new repos */
  defaultBranch?: string;

  /** Core configuration */
  core?: {
    autocrlf?: boolean | "input";
    safecrlf?: boolean | "warn";
    ignorecase?: boolean;
  };
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Git operation error
 */
export class GitError extends Error {
  constructor(
    message: string,
    public readonly code: GitErrorCode,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "GitError";
  }
}

/**
 * Git error codes
 */
export type GitErrorCode =
  | "REPO_NOT_FOUND"
  | "REPO_EXISTS"
  | "CLONE_FAILED"
  | "COMMIT_FAILED"
  | "PUSH_FAILED"
  | "PULL_FAILED"
  | "MERGE_CONFLICT"
  | "AUTH_FAILED"
  | "NETWORK_ERROR"
  | "INVALID_REF"
  | "FILE_NOT_FOUND"
  | "PERMISSION_DENIED"
  | "UNKNOWN";
