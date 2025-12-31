/**
 * OpenCode SDK types - Re-exported from @opencode-ai/sdk
 * 
 * IMPORTANT: Do NOT manually redefine SDK types here.
 * Always import and re-export from the SDK to maintain type consistency.
 */

// Re-export core SDK types
export type {
  Session,
  Message,
  UserMessage,
  AssistantMessage,
  Part,
  TextPart,
  FilePart,
  ToolPart,
  StepStartPart,
  StepFinishPart,
  ToolState,
  ToolStatePending,
  ToolStateRunning,
  ToolStateCompleted,
  ToolStateError,
  Permission,
} from "@opencode-ai/sdk";

// Custom types that extend SDK functionality for our use case

/** Response type for permission requests */
export type PermissionResponseType = "once" | "always" | "reject";

/** Permission reply sent back to the agent */
export interface PermissionReply {
  request_id: string;
  response: PermissionResponseType;
}

/** Stream connection status */
export type StreamStatus = "connected" | "disconnected" | "error";

/** Stream connection information */
export interface StreamConnection {
  session_id: string;
  status: StreamStatus;
  error?: string;
}

/** Model selection for chat */
export interface ModelSelection {
  provider: string;
  model: string;
}

/** File node type */
export type FileNodeType = "file" | "directory";

/** File system node for browsing */
export interface FileNode {
  name: string;
  path: string;
  type: FileNodeType;
  size?: number;
  modified?: string;
  children?: FileNode[];
}

/** File content response */
export interface FileContent {
  path: string;
  content: string;
  encoding: string;
}

/** App/Agent health information */
export interface OpenCodeHealth {
  healthy: boolean;
  version: string;
  uptime?: number;
}
