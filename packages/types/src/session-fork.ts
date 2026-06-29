/**
 * Session Forking & Branching Types
 * 
 * These types support the conversation branching and session forking system,
 * providing a Git-like mental model for AI conversations.
 */

import type { Session, ModelSelection } from "./opencode";

/**
 * Type of fork creation
 * - explicit: User explicitly forked the session
 * - auto-edit: System created fork due to message edit
 * - auto-regenerate: System created fork due to message regeneration
 */
export type ForkType = "explicit" | "auto-edit" | "auto-regenerate";

/**
 * Who created the fork
 */
export type ForkCreator = "user" | "system";

/**
 * Metadata about a forked session.
 * This stores the relationship between sessions and fork context.
 */
export interface SessionFork {
  /** Unique fork ID (same as the new session ID) */
  id: string;

  /** Parent session ID (null for root sessions) */
  parentSessionId: string | null;

  /** Message ID where fork occurred (null for session start) */
  forkedAtMessageId: string | null;

  /** How the fork was created */
  forkType: ForkType;

  /** ISO timestamp of fork creation */
  createdAt: string;

  /** Who created the fork */
  createdBy: ForkCreator;

  /** User-defined tags for organization */
  tags: string[];

  /** Additional metadata */
  metadata: SessionForkMetadata;
}

/**
 * Additional metadata stored with a fork
 */
export interface SessionForkMetadata {
  /** User-provided reason for forking */
  reason?: string;

  /** Different agent/model config if changed in the fork */
  agentConfig?: ModelSelection;

  /** If this fork was merged into another session */
  mergedInto?: string;

  /** Original session title at fork time */
  originalTitle?: string;
}

/**
 * Input for creating a new fork
 */
export interface CreateForkInput {
  /** Message ID to fork at (null = fork from latest) */
  messageId?: string;

  /** Role of the message being forked from ('user' or 'assistant') */
  messageRole?: 'user' | 'assistant';

  /** Reason for forking */
  reason?: string;

  /** Different agent config for the fork */
  agentConfig?: ModelSelection;

  /** Initial tags to apply */
  tags?: string[];
}

/**
 * A branch within a session (from message edits/regenerations).
 * This is distinct from session forks - branches exist within a single session.
 */
export interface SessionBranch {
  /** Session this branch belongs to */
  sessionId: string;

  /** Unique branch identifier */
  branchId: string;

  /** Message ID where this branch diverges */
  messageId: string;

  /** Sequential branch number at this message point (1, 2, 3...) */
  branchNumber: number;

  /** Parent branch if this is a nested branch */
  parentBranchId: string | null;

  /** Is this the currently active branch */
  isCurrent: boolean;

  /** ISO timestamp of branch creation */
  createdAt: string;
}

/**
 * Node in the session fork tree.
 * Used for visualizing parent-child relationships between sessions.
 */
export interface SessionTreeNode {
  /** The session data */
  session: Session;

  /** Fork metadata (null for root sessions without fork record) */
  fork: SessionFork | null;

  /** Child forks */
  children: SessionTreeNode[];

  /** Depth in the tree (0 for root) */
  depth: number;

  /** Path from root (array of session IDs) */
  path: string[];
}

/**
 * Response from listing forks
 */
export interface ListForksResponse {
  /** All forks in the sandbox */
  forks: SessionFork[];

  /** Root session IDs (no parent) */
  rootSessions: string[];
}

/**
 * Response from getting ancestry
 */
export interface AncestryResponse {
  /** Path from root to the session (array of session IDs) */
  ancestry: string[];
}

/**
 * Response from getting children
 */
export interface ChildrenResponse {
  /** Direct child forks */
  children: SessionFork[];
}

/**
 * Response from listing branches
 */
export interface ListBranchesResponse {
  /** All branches in the session */
  branches: SessionBranch[];

  /** Currently active branch ID */
  currentBranchId: string | null;
}

/**
 * Branch info for a specific message
 */
export interface MessageBranchInfo {
  /** Message ID */
  messageId: string;

  /** Current branch number at this message */
  branchNumber: number;

  /** Total branches at this message */
  branchCount: number;

  /** Whether this message is on the active branch */
  isOnActiveBranch: boolean;
}

/**
 * Input for switching branches
 */
export interface SwitchBranchInput {
  /** Message ID to switch branch at */
  messageId: string;

  /** Branch number to switch to */
  branchNumber: number;
}

/**
 * Session comparison result
 */
export interface SessionComparison {
  /** First session ID */
  sessionA: string;

  /** Second session ID */
  sessionB: string;

  /** Index where sessions diverge (0-based) */
  divergenceIndex: number;

  /** Common messages before divergence */
  commonMessageCount: number;

  /** Messages unique to session A */
  uniqueToA: number;

  /** Messages unique to session B */
  uniqueToB: number;
}

/**
 * Fork statistics for a sandbox
 */
export interface ForkStatistics {
  /** Total number of sessions */
  totalSessions: number;

  /** Number of root sessions */
  rootSessions: number;

  /** Number of forked sessions */
  forkedSessions: number;

  /** Maximum fork depth */
  maxDepth: number;

  /** Fork type breakdown */
  byType: {
    explicit: number;
    autoEdit: number;
    autoRegenerate: number;
  };

  /** Most used tags */
  topTags: Array<{ tag: string; count: number }>;
}
