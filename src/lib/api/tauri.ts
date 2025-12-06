/**
 * Tauri API wrapper for CodeOpen
 * 
 * This module provides typed wrappers around Tauri invoke commands
 * for communicating with the Rust backend.
 */

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

// =============================================================================
// Types
// =============================================================================

export type ProjectStatus = "creating" | "running" | "stopped" | "error";
export type SyncDirection = "push" | "pull" | "bidirectional";

export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  
  // Forgejo
  forgejoRepoUrl: string;
  forgejoRepoId: number | null;
  forgejoOwner: string;
  
  // Coolify
  coolifyAppUuid: string;
  coolifyServerUuid: string;
  containerPort: number;
  
  // GitHub sync
  githubRepoUrl: string | null;
  githubSyncEnabled: boolean;
  githubSyncDirection: SyncDirection;
  lastSyncAt: string | null;
  
  // LLM
  llmProvider: string | null;
  
  // Status
  status: ProjectStatus;
  errorMessage: string | null;
  
  // Timestamps
  createdAt: string;
  updatedAt: string;
}

export interface ConnectionStatus {
  connected: boolean;
  apiUrl: string | null;
  lastTested: string | null;
  error: string | null;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  githubUrl?: string;
  llmProviderId?: string;
}

// =============================================================================
// Connection Commands
// =============================================================================

/**
 * Connect to a Management API instance
 */
export async function connect(apiUrl: string, apiKey?: string): Promise<ConnectionStatus> {
  return invoke<ConnectionStatus>("connect", { apiUrl, apiKey });
}

/**
 * Disconnect from the Management API
 */
export async function disconnect(): Promise<void> {
  return invoke("disconnect");
}

/**
 * Test the current connection with a health check
 */
export async function testConnection(): Promise<ConnectionStatus> {
  return invoke<ConnectionStatus>("test_connection");
}

/**
 * Get the current connection status (without health check)
 */
export async function getConnectionStatus(): Promise<ConnectionStatus> {
  return invoke<ConnectionStatus>("get_connection_status");
}

// =============================================================================
// Project Commands
// =============================================================================

/**
 * List all projects
 */
export async function listProjects(): Promise<Project[]> {
  return invoke<Project[]>("list_projects");
}

/**
 * Get a single project by ID
 */
export async function getProject(id: string): Promise<Project> {
  return invoke<Project>("get_project", { id });
}

/**
 * Create a new project
 */
export async function createProject(input: CreateProjectInput): Promise<Project> {
  return invoke<Project>("create_project", {
    name: input.name,
    description: input.description ?? null,
    github_url: input.githubUrl ?? null,
    llm_provider_id: input.llmProviderId ?? null,
  });
}

/**
 * Delete a project
 */
export async function deleteProject(id: string, deleteRepo = true): Promise<void> {
  return invoke("delete_project", { id, delete_repo: deleteRepo });
}

/**
 * Start a project container
 */
export async function startProject(id: string): Promise<Project> {
  return invoke<Project>("start_project", { id });
}

/**
 * Stop a project container
 */
export async function stopProject(id: string): Promise<Project> {
  return invoke<Project>("stop_project", { id });
}

/**
 * Restart a project container
 */
export async function restartProject(id: string): Promise<Project> {
  return invoke<Project>("restart_project", { id });
}

// =============================================================================
// OpenCode Types
// =============================================================================

export type MessageRole = "user" | "assistant";
export type MessagePartType = "text" | "tool-invocation" | "tool-result" | "step-start" | "step-finish" | "file";
export type FileNodeType = "file" | "directory";

/** Session time info */
export interface SessionTime {
  created: number;
  updated: number;
}

/** OpenCode session - matches actual API response */
export interface Session {
  id: string;
  version?: string;
  projectID?: string;
  directory?: string;
  title?: string;
  time?: SessionTime;
  // Legacy fields for compatibility
  status?: string;
  cost?: number;
}

/** Message time info */
export interface MessageTime {
  created: number;
  completed?: number;
}

/** Part time info */
export interface PartTime {
  start: number;
  end?: number;
}

/** Token cache info */
export interface TokenCache {
  read: number;
  write: number;
}

/** Token usage info */
export interface TokenUsage {
  input: number;
  output: number;
  reasoning: number;
  cache?: TokenCache;
}

/** Message path info */
export interface MessagePath {
  cwd: string;
  root: string;
}

/** Message info (metadata) - matches actual OpenCode API response */
export interface MessageInfo {
  id: string;
  sessionID: string;
  role: MessageRole;
  time?: MessageTime;
  parentID?: string;
  modelID?: string;
  providerID?: string;
  mode?: string;
  path?: MessagePath;
  cost?: number;
  tokens?: TokenUsage;
  finish?: string;
}

/** Tool invocation state */
export interface ToolInvocation {
  toolCallId: string;
  toolName: string;
  args?: unknown;
  state?: string;
  result?: unknown;
}

/** A part of a message - matches actual OpenCode API */
export interface MessagePart {
  id: string;
  sessionID: string;
  messageID: string;
  type: MessagePartType;
  // Text content
  text?: string;
  // Step tracking
  snapshot?: string;
  reason?: string;
  // Timing
  time?: PartTime;
  // Cost/tokens for step-finish
  cost?: number;
  tokens?: TokenUsage;
  // Tool invocation
  toolInvocation?: ToolInvocation;
  // File info
  url?: string;
  filename?: string;
  mime?: string;
}

export interface Message {
  info: MessageInfo;
  parts: MessagePart[];
}

/** File system node - matches actual OpenCode API */
export interface FileNode {
  name: string;
  type: FileNodeType;
  path: string;
  absolute?: string;
  ignored: boolean;
  children?: FileNode[];
}

/** File content response - matches actual OpenCode API */
export interface FileContent {
  content: string;
  type?: string;
}

export interface AppInfo {
  name: string;
  version: string;
}

export interface OpenCodeHealth {
  healthy: boolean;
  projectId: string;
  error?: string;
}

// =============================================================================
// OpenCode - App Info & Health Commands
// =============================================================================

/**
 * Get OpenCode app info for a project
 */
export async function opencodeGetAppInfo(projectId: string): Promise<AppInfo> {
  return invoke<AppInfo>("opencode_get_app_info", { projectId });
}

/**
 * Check if OpenCode container is healthy
 */
export async function opencodeHealthCheck(projectId: string): Promise<OpenCodeHealth> {
  return invoke<OpenCodeHealth>("opencode_health_check", { projectId });
}

// =============================================================================
// OpenCode - Session Commands
// =============================================================================

/**
 * List all sessions for a project
 */
export async function opencodeListSessions(projectId: string): Promise<Session[]> {
  return invoke<Session[]>("opencode_list_sessions", { projectId });
}

/**
 * Create a new session for a project
 */
export async function opencodeCreateSession(projectId: string): Promise<Session> {
  return invoke<Session>("opencode_create_session", { projectId });
}

/**
 * Get a session by ID
 */
export async function opencodeGetSession(projectId: string, sessionId: string): Promise<Session> {
  return invoke<Session>("opencode_get_session", { projectId, sessionId });
}

/**
 * Delete a session
 */
export async function opencodeDeleteSession(projectId: string, sessionId: string): Promise<void> {
  return invoke("opencode_delete_session", { projectId, sessionId });
}

/**
 * Abort a running session
 */
export async function opencodeAbortSession(projectId: string, sessionId: string): Promise<void> {
  return invoke("opencode_abort_session", { projectId, sessionId });
}

// =============================================================================
// OpenCode - Message Commands
// =============================================================================

/**
 * List messages in a session
 */
export async function opencodeListMessages(projectId: string, sessionId: string): Promise<Message[]> {
  return invoke<Message[]>("opencode_list_messages", { projectId, sessionId });
}

/**
 * Send a text message to a session
 */
export async function opencodeSendMessage(
  projectId: string,
  sessionId: string,
  text: string
): Promise<Message> {
  return invoke<Message>("opencode_send_message", { projectId, sessionId, text });
}

/**
 * Send a message with file attachments
 */
export async function opencodeSendMessageWithFiles(
  projectId: string,
  sessionId: string,
  text: string,
  files: string[]
): Promise<Message> {
  return invoke<Message>("opencode_send_message_with_files", { projectId, sessionId, text, files });
}

/**
 * Get a specific message
 */
export async function opencodeGetMessage(
  projectId: string,
  sessionId: string,
  messageId: string
): Promise<Message> {
  return invoke<Message>("opencode_get_message", { projectId, sessionId, messageId });
}

// =============================================================================
// OpenCode - File Commands
// =============================================================================

/**
 * List files in a project directory
 * @param projectId Project ID
 * @param path Directory path (defaults to "/" for root)
 */
export async function opencodeListFiles(projectId: string, path: string = "/"): Promise<FileNode[]> {
  return invoke<FileNode[]>("opencode_list_files", { projectId, path });
}

/**
 * Get file content
 */
export async function opencodeGetFileContent(projectId: string, path: string): Promise<FileContent> {
  return invoke<FileContent>("opencode_get_file_content", { projectId, path });
}

/**
 * Find files by pattern
 */
export async function opencodeFindFiles(projectId: string, pattern: string): Promise<string[]> {
  return invoke<string[]>("opencode_find_files", { projectId, pattern });
}

// =============================================================================
// OpenCode - SSE Streaming Types
// =============================================================================

export type StreamStatus = "connected" | "disconnected" | "error";

export interface StreamConnection {
  streamId: string;
  projectId: string;
}

export interface OpenCodeEvent {
  eventType: string;
  data: unknown;
}

export interface StreamEventPayload {
  streamId: string;
  projectId: string;
  event: OpenCodeEvent;
}

export interface StreamStatusPayload {
  streamId: string;
  projectId: string;
  status: StreamStatus;
  error?: string;
}

// =============================================================================
// OpenCode - SSE Streaming Commands
// =============================================================================

/**
 * Connect to the OpenCode SSE event stream for a project.
 * 
 * This establishes a persistent connection that emits events through Tauri's
 * event system. Use `onStreamEvent` and `onStreamStatus` to listen for events.
 * 
 * @returns StreamConnection with a unique streamId for managing the connection
 */
export async function opencodeConnectStream(projectId: string): Promise<StreamConnection> {
  return invoke<StreamConnection>("opencode_connect_stream", { projectId });
}

/**
 * Disconnect from an OpenCode SSE event stream
 */
export async function opcodeDisconnectStream(streamId: string): Promise<void> {
  return invoke("opencode_disconnect_stream", { streamId });
}

/**
 * Listen for OpenCode stream events
 * 
 * @param callback Function called for each event received
 * @returns Unlisten function to stop listening
 */
export async function onStreamEvent(
  callback: (payload: StreamEventPayload) => void
): Promise<UnlistenFn> {
  return listen<StreamEventPayload>("opencode:event", (event) => {
    callback(event.payload);
  });
}

/**
 * Listen for OpenCode stream status changes
 * 
 * @param callback Function called for each status change
 * @returns Unlisten function to stop listening
 */
export async function onStreamStatus(
  callback: (payload: StreamStatusPayload) => void
): Promise<UnlistenFn> {
  return listen<StreamStatusPayload>("opencode:stream-status", (event) => {
    callback(event.payload);
  });
}

/**
 * Helper class for managing a stream connection with automatic cleanup
 */
export class OpenCodeStream {
  private streamId: string | null = null;
  private projectId: string;
  private eventUnlisten: UnlistenFn | null = null;
  private statusUnlisten: UnlistenFn | null = null;
  private onEvent: ((event: OpenCodeEvent) => void) | null = null;
  private onStatus: ((status: StreamStatus, error?: string) => void) | null = null;

  constructor(projectId: string) {
    this.projectId = projectId;
  }

  /**
   * Connect to the stream
   */
  async connect(
    onEvent: (event: OpenCodeEvent) => void,
    onStatus?: (status: StreamStatus, error?: string) => void
  ): Promise<void> {
    this.onEvent = onEvent;
    this.onStatus = onStatus ?? null;

    // Set up event listeners before connecting
    this.eventUnlisten = await onStreamEvent((payload) => {
      if (payload.streamId === this.streamId && this.onEvent) {
        this.onEvent(payload.event);
      }
    });

    this.statusUnlisten = await onStreamStatus((payload) => {
      if (payload.streamId === this.streamId && this.onStatus) {
        this.onStatus(payload.status, payload.error);
      }
    });

    // Connect to the stream
    const connection = await opencodeConnectStream(this.projectId);
    this.streamId = connection.streamId;
  }

  /**
   * Disconnect from the stream and clean up listeners
   */
  async disconnect(): Promise<void> {
    if (this.streamId) {
      await opcodeDisconnectStream(this.streamId);
      this.streamId = null;
    }

    if (this.eventUnlisten) {
      this.eventUnlisten();
      this.eventUnlisten = null;
    }

    if (this.statusUnlisten) {
      this.statusUnlisten();
      this.statusUnlisten = null;
    }

    this.onEvent = null;
    this.onStatus = null;
  }

  /**
   * Check if the stream is connected
   */
  get isConnected(): boolean {
    return this.streamId !== null;
  }
}
