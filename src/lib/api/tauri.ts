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
  llmProvider: string | null;  // Provider ID: 'zai', 'anthropic', etc.
  llmModel: string | null;     // Model ID: 'glm-4.6', 'claude-3-5-sonnet', etc.
  
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
  llmModelId?: string;
  containerTierId?: string;
}

// =============================================================================
// Container Tier Types
// =============================================================================

export interface TierResources {
  cpu: string;
  memory: string;
  storage: string;
}

export interface TierFeatures {
  hasDesktopAccess: boolean;
  exposedPorts: string[];
}

export interface ContainerTier {
  id: string;
  name: string;
  description: string;
  imageType: string;
  resources: TierResources;
  features: TierFeatures;
  isDefault: boolean;
  sortOrder: number;
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
  // Tauri expects camelCase parameter names (converts to snake_case for Rust)
  const params = {
    name: input.name,
    description: input.description ?? null,
    githubUrl: input.githubUrl ?? null,
    llmProviderId: input.llmProviderId ?? null,
    llmModelId: input.llmModelId ?? null,
    containerTierId: input.containerTierId ?? null,
  };
  
  return invoke<Project>("create_project", params);
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

/**
 * Get container logs for a project
 * @param id Project ID
 * @param lines Number of log lines to return (default 100, max 1000)
 */
export async function getProjectLogs(id: string, lines?: number): Promise<string> {
  return invoke<string>("get_project_logs", { id, lines });
}

export interface DeployResponse {
  success: boolean;
  message: string;
  deploymentId?: string;
}

/**
 * Deploy/rebuild a project container
 * @param id Project ID
 * @param force Force deployment even if no changes (default false)
 */
export async function deployProject(id: string, force?: boolean): Promise<DeployResponse> {
  return invoke<DeployResponse>("deploy_project", { id, force });
}

// =============================================================================
// Container Tier Commands
// =============================================================================

/**
 * List all available container tiers
 */
export async function listContainerTiers(): Promise<ContainerTier[]> {
  return invoke<ContainerTier[]>("list_container_tiers");
}

/**
 * Get the default container tier
 */
export async function getDefaultContainerTier(): Promise<ContainerTier | null> {
  return invoke<ContainerTier | null>("get_default_container_tier");
}

// =============================================================================
// OpenCode Types
// =============================================================================

export type MessageRole = "user" | "assistant";
export type MessagePartType = "text" | "tool-invocation" | "tool-result" | "tool" | "step-start" | "step-finish" | "file" | "patch";
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

/** Tool state - used in "tool" type parts */
export interface ToolState {
  status?: string;
  input?: Record<string, unknown>;
  output?: unknown;
  title?: string;
  metadata?: Record<string, unknown>;
  time?: PartTime;
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
  // Tool invocation (legacy format)
  toolInvocation?: ToolInvocation;
  // Tool (current OpenCode format)
  callID?: string;
  tool?: string;
  state?: ToolState;
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
// OpenCode - Provider/Model Types (from OpenCode API)
// =============================================================================

/** Model info as returned from OpenCode's /config/providers endpoint */
export interface OpenCodeModel {
  id: string;
  name: string;
}

/** Provider info as returned from OpenCode's /config/providers endpoint */
export interface OpenCodeProvider {
  id: string;
  name: string;
  models: OpenCodeModel[];
}

/** Model selection for sending messages */
export interface ModelSelection {
  providerId: string;
  modelId: string;
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

/**
 * Get configured LLM providers and their models for a project
 */
export async function opencodeGetProviders(projectId: string): Promise<OpenCodeProvider[]> {
  return invoke<OpenCodeProvider[]>("opencode_get_providers", { projectId });
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
// OpenCode - Permission Commands
// =============================================================================

/**
 * Respond to a permission request.
 * 
 * When a tool requires user approval (permission is set to "ask"), OpenCode will
 * pause and emit a permission.updated event. This function responds to that request.
 * 
 * @param projectId - The project ID
 * @param sessionId - The session ID where the permission was requested
 * @param permissionId - The permission request ID
 * @param response - The response: "once" (allow this time), "always" (allow pattern), "reject" (deny)
 * @returns true if the permission was successfully responded to
 */
export async function opencodeRespondPermission(
  projectId: string,
  sessionId: string,
  permissionId: string,
  response: PermissionResponseType
): Promise<boolean> {
  return invoke<boolean>("opencode_respond_permission", { 
    projectId, 
    sessionId, 
    permissionId, 
    response 
  });
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
 * @param projectId - Project ID
 * @param sessionId - Session ID
 * @param text - Message text
 * @param model - Optional model selection (providerId and modelId)
 */
export async function opencodeSendMessage(
  projectId: string,
  sessionId: string,
  text: string,
  model?: ModelSelection
): Promise<Message> {
  return invoke<Message>("opencode_send_message", { 
    projectId, 
    sessionId, 
    text,
    providerId: model?.providerId,
    modelId: model?.modelId,
  });
}

/**
 * Send a message with file attachments
 * @param projectId - Project ID
 * @param sessionId - Session ID
 * @param text - Message text
 * @param files - Array of file paths
 * @param model - Optional model selection (providerId and modelId)
 */
export async function opencodeSendMessageWithFiles(
  projectId: string,
  sessionId: string,
  text: string,
  files: string[],
  model?: ModelSelection
): Promise<Message> {
  return invoke<Message>("opencode_send_message_with_files", { 
    projectId, 
    sessionId, 
    text, 
    files,
    providerId: model?.providerId,
    modelId: model?.modelId,
  });
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
// OpenCode - Permission Types
// =============================================================================

/** Permission response types */
export type PermissionResponseType = "once" | "always" | "reject";

/** Permission time info */
export interface PermissionTime {
  created: number;
}

/**
 * Permission request from OpenCode SSE stream.
 * 
 * This is emitted when a tool requires user approval (when permission is set to "ask").
 * The frontend should display this to the user and call the respond endpoint.
 */
export interface PermissionRequest {
  /** Unique permission request ID */
  id: string;
  /** Permission type: "bash", "edit", "external_directory", "webfetch", etc. */
  type: string;
  /** Pattern for the permission (command pattern, file path pattern, etc.) */
  pattern?: string | string[];
  /** Session ID where this permission was requested */
  sessionID: string;
  /** Message ID that triggered this permission request */
  messageID: string;
  /** Tool call ID (links to the tool part waiting for permission) */
  callID?: string;
  /** Human-readable title describing what permission is being requested */
  title: string;
  /** Additional metadata about the permission request */
  metadata: Record<string, unknown>;
  /** Time when the permission was requested */
  time: PermissionTime;
}

/**
 * Permission replied event from SSE stream.
 * 
 * This is emitted when a permission request has been responded to.
 */
export interface PermissionReplied {
  sessionID: string;
  permissionID: string;
  response: PermissionResponseType;
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

// =============================================================================
// Settings Types
// =============================================================================

export type Theme = "light" | "dark" | "system";

export interface AppSettings {
  theme: Theme;
  defaultProviderId: string | null;
  autoRefreshInterval: number;
  inAppNotifications: boolean;
  systemNotifications: boolean;
}

export interface Provider {
  id: string;
  name: string;
  type: string; // "api-key" or "oauth"
  isConfigured: boolean;
  isDefault: boolean;
}

// =============================================================================
// Enhanced Provider Types (with Models.dev data)
// =============================================================================

export type AuthType = "api_key" | "oauth" | "device_flow";

export interface ModelCapabilities {
  image: boolean;
  video: boolean;
  tools: boolean;
  streaming: boolean;
}

export interface ModelPricing {
  input: number;
  output: number;
}

export interface ModelInfo {
  id: string;
  name: string;
  context: number;
  maxOutput: number;
  pricing: ModelPricing;
  capabilities: ModelCapabilities;
}

export interface ProviderWithModels {
  id: string;
  name: string;
  authType: AuthType;
  apiKeyEnvVar?: string;
  isConfigured: boolean;
  isDefault: boolean;
  logoUrl: string;
  models: ModelInfo[];
}

export interface OAuthFlowInit {
  stateId: string;
  userCode: string;
  verificationUri: string;
  expiresAt: string;
  interval: number;
}

export type OAuthFlowStatusType = "pending" | "completed" | "expired" | "error";

export interface OAuthFlowStatus {
  status: OAuthFlowStatusType;
  error?: string;
  isConfigured: boolean;
}

export interface ExportData {
  version: string;
  exportedAt: string;
  settings: AppSettings;
  apiUrl: string | null;
}

// =============================================================================
// Settings Commands
// =============================================================================

/**
 * Get current app settings from local storage
 */
export async function getSettings(): Promise<AppSettings> {
  return invoke<AppSettings>("get_settings");
}

/**
 * Save app settings to local storage
 */
export async function saveSettings(settings: AppSettings): Promise<void> {
  return invoke("save_settings", { settings });
}

/**
 * List LLM providers from Management API
 */
export async function listProviders(): Promise<Provider[]> {
  return invoke<Provider[]>("list_providers");
}

/**
 * Get the default LLM provider from Management API
 */
export async function getDefaultProvider(): Promise<Provider | null> {
  return invoke<Provider | null>("get_default_provider");
}

/**
 * Export settings to a JSON string for backup/transfer
 */
export async function exportSettings(): Promise<string> {
  return invoke<string>("export_settings");
}

/**
 * Import settings from a JSON string
 */
export async function importSettings(json: string): Promise<AppSettings> {
  return invoke<AppSettings>("import_settings", { json });
}

// =============================================================================
// Provider Commands (Enhanced with Models.dev)
// =============================================================================

/**
 * List LLM providers with their models from Models.dev
 * @param popularOnly - Only return popular/curated providers (default: true)
 */
export async function listProvidersWithModels(popularOnly = true): Promise<ProviderWithModels[]> {
  return invoke<ProviderWithModels[]>("list_providers_with_models", { popularOnly });
}

/**
 * List only configured LLM providers (those with credentials set up)
 */
export async function listConfiguredProviders(): Promise<ProviderWithModels[]> {
  return invoke<ProviderWithModels[]>("list_configured_providers");
}

/**
 * Configure a provider with an API key
 */
export async function configureProviderApiKey(providerId: string, apiKey: string): Promise<void> {
  return invoke("configure_provider_api_key", { providerId, apiKey });
}

/**
 * Initialize OAuth device flow for a provider (e.g., GitHub Copilot)
 */
export async function initOAuthFlow(providerId: string): Promise<OAuthFlowInit> {
  return invoke<OAuthFlowInit>("init_oauth_flow", { providerId });
}

/**
 * Poll OAuth device flow status
 */
export async function pollOAuthFlow(providerId: string, stateId: string): Promise<OAuthFlowStatus> {
  return invoke<OAuthFlowStatus>("poll_oauth_flow", { providerId, stateId });
}

/**
 * Cancel an OAuth flow
 */
export async function cancelOAuthFlow(providerId: string, stateId: string): Promise<void> {
  return invoke("cancel_oauth_flow", { providerId, stateId });
}

/**
 * Remove provider credentials
 */
export async function removeProviderCredentials(providerId: string): Promise<void> {
  return invoke("remove_provider_credentials", { providerId });
}

/**
 * Set a provider as the default
 */
export async function setDefaultProvider(providerId: string): Promise<void> {
  return invoke("set_default_provider", { providerId });
}

// =============================================================================
// Stream Helper Class
// =============================================================================

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
  // Buffer events received before streamId is set
  private pendingEvents: StreamEventPayload[] = [];
  private pendingStatuses: StreamStatusPayload[] = [];
  // Flag to indicate we're waiting for streamId
  private waitingForStreamId = true;

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
    this.waitingForStreamId = true;

    // Set up event listeners before connecting
    // Buffer events until we have the streamId
    this.eventUnlisten = await onStreamEvent((payload) => {
      // Match by projectId initially, then by streamId once we have it
      if (payload.projectId === this.projectId) {
        if (this.waitingForStreamId) {
          // Buffer until we have streamId
          this.pendingEvents.push(payload);
        } else if (payload.streamId === this.streamId && this.onEvent) {
          this.onEvent(payload.event);
        }
      }
    });

    this.statusUnlisten = await onStreamStatus((payload) => {
      if (payload.projectId === this.projectId) {
        if (this.waitingForStreamId) {
          // Buffer until we have streamId
          this.pendingStatuses.push(payload);
        } else if (payload.streamId === this.streamId && this.onStatus) {
          this.onStatus(payload.status, payload.error);
        }
      }
    });

    // Connect to the stream
    const connection = await opencodeConnectStream(this.projectId);
    this.streamId = connection.streamId;
    this.waitingForStreamId = false;
    
    // Process any buffered events that match our streamId
    for (const payload of this.pendingEvents) {
      if (payload.streamId === this.streamId && this.onEvent) {
        this.onEvent(payload.event);
      }
    }
    this.pendingEvents = [];
    
    for (const payload of this.pendingStatuses) {
      if (payload.streamId === this.streamId && this.onStatus) {
        this.onStatus(payload.status, payload.error);
      }
    }
    this.pendingStatuses = [];
  }

  /**
   * Disconnect from the stream and clean up listeners
   */
  async disconnect(): Promise<void> {
    if (this.streamId) {
      await opcodeDisconnectStream(this.streamId);
      this.streamId = null;
    }
    
    this.waitingForStreamId = true;

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
    this.pendingEvents = [];
    this.pendingStatuses = [];
  }

/**
 * Check if the stream is connected
 */
  get isConnected(): boolean {
    return this.streamId !== null;
  }
}

// =============================================================================
// User OpenCode Config Types
// =============================================================================

/** Permission level for OpenCode tools */
export type PermissionLevel = "allow" | "ask" | "deny";

/** User's OpenCode permission settings (snake_case to match OpenCode config) */
export interface PermissionSettings {
  bash?: PermissionLevel;
  write?: PermissionLevel;
  edit?: PermissionLevel;
  webfetch?: PermissionLevel;
  mcp?: PermissionLevel;
  doom_loop?: PermissionLevel;
  external_directory?: PermissionLevel;
}

/** User's OpenCode settings (Layer 3) */
export interface UserOpencodeSettings {
  theme?: string;
  permission?: PermissionSettings;
  provider?: Record<string, unknown>;
}

/** User OpenCode config file */
export interface UserOpencodeFile {
  name: string;
  type: "agent" | "command" | "tool" | "plugin";
  extension: string;
  content: string;
  // Optional fields - only present in file list response
  id?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** Full user OpenCode config */
export interface UserOpencodeConfig {
  settings: UserOpencodeSettings;
  agents_md?: string;
  files: UserOpencodeFile[];
}

// =============================================================================
// User OpenCode Config Commands
// =============================================================================

/**
 * Get user's full OpenCode configuration
 */
export async function getUserOpencodeConfig(userId?: string): Promise<UserOpencodeConfig> {
  return invoke<UserOpencodeConfig>("get_user_opencode_config", { userId });
}

/**
 * Update user's OpenCode settings
 */
export async function updateUserOpencodeSettings(
  settings: UserOpencodeSettings,
  userId?: string
): Promise<UserOpencodeSettings> {
  return invoke<UserOpencodeSettings>("update_user_opencode_settings", { 
    userId, 
    settings 
  });
}

/**
 * Update user's AGENTS.md content
 */
export async function updateUserAgentsMd(content: string, userId?: string): Promise<void> {
  return invoke("update_user_agents_md", { userId, content });
}

/**
 * List user's OpenCode config files
 */
export async function listUserOpencodeFiles(
  fileType?: "agent" | "command" | "tool" | "plugin",
  userId?: string
): Promise<UserOpencodeFile[]> {
  return invoke<UserOpencodeFile[]>("list_user_opencode_files", { 
    userId, 
    fileType 
  });
}

/**
 * Create or update a user's OpenCode config file
 */
export async function upsertUserOpencodeFile(
  fileType: "agent" | "command" | "tool" | "plugin",
  name: string,
  content: string,
  extension?: string,
  userId?: string
): Promise<UserOpencodeFile> {
  return invoke<UserOpencodeFile>("upsert_user_opencode_file", { 
    userId, 
    fileType, 
    name, 
    content,
    extension
  });
}

/**
 * Delete a user's OpenCode config file
 */
export async function deleteUserOpencodeFile(
  fileType: "agent" | "command" | "tool" | "plugin",
  name: string,
  userId?: string
): Promise<void> {
  return invoke("delete_user_opencode_file", { userId, fileType, name });
}
