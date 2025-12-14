/**
 * Tauri API wrapper for CodeOpen
 * 
 * This module provides typed wrappers around Tauri invoke commands
 * for communicating with the Rust backend.
 */

import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { goto } from "$app/navigation";

// =============================================================================
// Auth Error Handling
// =============================================================================

/**
 * Check if an error is an unauthorized error (401/403)
 */
function isUnauthorizedError(error: unknown): boolean {
  if (typeof error === "string") {
    const message = error.toLowerCase();
    return (
      message.includes("unauthorized") ||
      message.includes("session expired") ||
      message.includes("access forbidden")
    );
  }
  return false;
}

/**
 * Handle unauthorized errors by clearing auth and redirecting to login
 */
async function handleUnauthorizedError(): Promise<void> {
  console.warn("[Tauri] Unauthorized error detected, redirecting to login");
  
  // Clear auth state via Tauri command (don't use invoke wrapper to avoid recursion)
  try {
    await tauriInvoke("auth_logout");
  } catch (e) {
    console.error("[Tauri] Failed to logout:", e);
  }
  
  // Redirect to login
  await goto("/login");
}

/**
 * Wrapped invoke that handles auth errors automatically.
 * Use this instead of importing invoke directly from @tauri-apps/api/core.
 */
export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await tauriInvoke<T>(cmd, args);
  } catch (error) {
    // Check for unauthorized errors and handle them
    if (isUnauthorizedError(error)) {
      await handleUnauthorizedError();
      // Throw a specific error so callers know auth failed
      throw new Error("Session expired. Please log in again.");
    }
    throw error;
  }
}

// =============================================================================
// Connection Types
// =============================================================================

export interface ConnectionStatus {
  connected: boolean;
  apiUrl: string | null;
  lastTested: string | null;
  error: string | null;
}

// =============================================================================
// Modular Container Types
// =============================================================================

/** Resource tier - defines CPU, memory, and storage limits */
export interface ResourceTier {
  id: string;
  name: string;
  description: string | null;
  resources: {
    cpuCores: number;
    memoryGb: number;
    storageGb: number;
  };
  priceMonthly: number;
  isDefault: boolean;
  sortOrder: number;
}

/** Container flavor - language/framework-specific image */
export interface ContainerFlavor {
  id: string;
  name: string;
  description: string | null;
  languages: string[];
  imageSizeMb: number | null;
  isDefault: boolean;
  sortOrder: number;
}

/** Addon category for grouping */
export type AddonCategory = "interface" | "compute" | "storage" | "devops";

/** Container addon - optional feature that can be added to containers */
export interface ContainerAddon {
  id: string;
  name: string;
  description: string | null;
  category: AddonCategory;
  imageSizeMb: number | null;
  port: number | null;
  requiresGpu: boolean;
  requiresFlavor: string | null;
  priceMonthly: number;
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
// Modular Container Commands
// =============================================================================

/**
 * List all available resource tiers
 */
export async function listResourceTiers(): Promise<ResourceTier[]> {
  return invoke<ResourceTier[]>("list_resource_tiers");
}

/**
 * Get the default resource tier
 */
export async function getDefaultResourceTier(): Promise<ResourceTier | null> {
  return invoke<ResourceTier | null>("get_default_resource_tier");
}

/**
 * List all available container flavors
 */
export async function listContainerFlavors(): Promise<ContainerFlavor[]> {
  return invoke<ContainerFlavor[]>("list_container_flavors");
}

/**
 * Get the default container flavor
 */
export async function getDefaultContainerFlavor(): Promise<ContainerFlavor | null> {
  return invoke<ContainerFlavor | null>("get_default_container_flavor");
}

/**
 * List all available container addons
 */
export async function listContainerAddons(): Promise<ContainerAddon[]> {
  return invoke<ContainerAddon[]>("list_container_addons");
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
  /** Parent session ID - set when this session was spawned as a child (e.g., via task tool) */
  parentID?: string;
  title?: string;
  time?: SessionTime;
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
  agent?: string;  // Agent used for this message (e.g., "build", "plan")
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
  error?: string; // Error message when status is "error"
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
  text?: string;
  snapshot?: string;
  reason?: string;
  time?: PartTime;
  cost?: number;
  tokens?: TokenUsage;
  toolInvocation?: ToolInvocation;
  callID?: string;
  tool?: string;
  state?: ToolState;
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
  status?: string;
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

/** Agent info as returned from OpenCode's /app/agents endpoint */
export interface OpenCodeAgent {
  name: string;
  description?: string;
  mode: "primary" | "subagent" | "all";
  builtIn: boolean;
  color?: string;
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
 */
export interface PermissionRequest {
  id: string;
  type: string;
  pattern?: string | string[];
  sessionID: string;
  messageID: string;
  callID?: string;
  title: string;
  metadata: Record<string, unknown>;
  time: PermissionTime;
}

/**
 * Permission replied event from SSE stream.
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
  type: string;
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
 */
export async function listProvidersWithModels(popularOnly = true): Promise<ProviderWithModels[]> {
  return invoke<ProviderWithModels[]>("list_providers_with_models", { popularOnly });
}

/**
 * List only configured LLM providers
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
 * Initialize OAuth device flow for a provider
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
// Auth Types (Better Auth Session)
// =============================================================================

/** User information from stored session */
export interface AuthUser {
  id: string;
  email?: string;
  name?: string;
}

/** Authentication status */
export interface AuthStatus {
  authenticated: boolean;
  user: AuthUser | null;
}

// =============================================================================
// Auth Commands (Better Auth Session Storage)
// =============================================================================

/**
 * Store session token from Better Auth login
 */
export async function authStoreSession(
  token: string,
  userId: string,
  email?: string,
  name?: string
): Promise<void> {
  return invoke("auth_store_session", { token, userId, email, name });
}

/**
 * Get the current authentication status
 */
export async function authGetStatus(): Promise<AuthStatus> {
  return invoke<AuthStatus>("auth_get_status");
}

/**
 * Logout the current user
 */
export async function authLogout(): Promise<void> {
  return invoke("auth_logout");
}

/**
 * Get current user info from stored session
 */
export async function authGetUser(): Promise<AuthUser | null> {
  return invoke<AuthUser | null>("auth_get_user");
}

/**
 * Get the stored session token for API calls
 */
export async function authGetToken(): Promise<string | null> {
  return invoke<string | null>("auth_get_token");
}

/**
 * Check if user is authenticated
 */
export async function authIsAuthenticated(): Promise<boolean> {
  return invoke<boolean>("auth_is_authenticated");
}

// =============================================================================
// V2 Sandbox Types (Direct Docker Orchestration)
// =============================================================================

// Must match the API's SandboxStatus: 'created' | 'starting' | 'running' | 'stopping' | 'stopped' | 'error'
export type SandboxStatus = "created" | "starting" | "running" | "stopping" | "stopped" | "error" | "unknown";

export interface SandboxUrls {
  homepage?: string;
  opencode?: string;
  codeServer?: string;
  vnc?: string;
  acpGateway?: string;
}

export interface SandboxHealth {
  status: string;
  failingStreak?: number;
  lastCheck?: string;
}

export interface Sandbox {
  id: string;
  userId: string;
  name: string;
  slug: string;
  description?: string;
  
  // Git/Repository info
  repoName: string;
  githubUrl?: string;
  
  // Container configuration
  resourceTierId?: string;
  flavorId?: string;
  addonIds: string[];
  
  // Container runtime info
  containerId?: string;
  containerName?: string;
  status: SandboxStatus;
  errorMessage?: string;
  
  // Individual URL fields from DB
  opencodeUrl?: string;
  acpGatewayUrl?: string;
  vncUrl?: string;
  codeServerUrl?: string;
  
  // URLs object (for backward compatibility)
  urls?: SandboxUrls;
  
  // Timestamps
  createdAt: string;
  updatedAt: string;
  lastAccessedAt?: string;
  
  // Additional Docker runtime info (enriched at runtime, may not always be present)
  image?: string;
  labels?: Record<string, string>;
  health?: SandboxHealth;
  startedAt?: string;
}

export interface Repository {
  name: string;
  path: string;
  createdAt: string;
  lastModified: string;
  currentBranch: string;
  isDirty: boolean;
  description?: string;
}

export interface CreateSandboxInput {
  name: string;
  description?: string;
  githubUrl?: string;
  userId: string;
  flavor?: string;
  resourceTier?: string;
  addons?: string[];
  autoStart?: boolean;
}

export interface SandboxWithRepo {
  sandbox: Sandbox;
  repository: Repository;
}

export interface SandboxInfo {
  sandbox: Sandbox;
  repository?: Repository;
  config?: Record<string, unknown>;
}

export interface SandboxStats {
  cpuPercent: number;
  memoryUsage: number;
  memoryLimit: number;
  memoryPercent: number;
  networkRx: number;
  networkTx: number;
  blockRead: number;
  blockWrite: number;
}

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface GitFileStatus {
  path: string;
  staged: string;
  unstaged: string;
  tracked: boolean;
}

export interface GitStatusResponse {
  files: GitFileStatus[];
}

export interface GitAuthor {
  name: string;
  email: string;
  timestamp: string;
}

export interface GitCommit {
  sha: string;
  message: string;
  author: GitAuthor;
  committer: GitAuthor;
  parents: string[];
  timestamp: string;
}

export interface GitLogResponse {
  commits: GitCommit[];
}

export interface GitCommitResponse {
  sha: string;
  message: string;
}

export interface DockerContainerStats {
  running: number;
  stopped: number;
}

export interface DockerInfo {
  version: string;
  apiVersion: string;
  os: string;
  arch: string;
  containers: DockerContainerStats;
  images: number;
}

export interface DockerHealthResponse {
  status: string;
  docker?: DockerInfo;
  message?: string;
}

// =============================================================================
// V2 Sandbox Commands
// =============================================================================

/**
 * Check Docker health
 */
export async function dockerHealth(): Promise<DockerHealthResponse> {
  return invoke<DockerHealthResponse>("docker_health");
}

/**
 * List all sandboxes
 */
export async function listSandboxes(): Promise<Sandbox[]> {
  return invoke<Sandbox[]>("list_sandboxes");
}

/**
 * Get a sandbox by ID
 */
export async function getSandbox(id: string): Promise<SandboxInfo> {
  return invoke<SandboxInfo>("get_sandbox", { id });
}

/**
 * Create a new sandbox
 */
export async function createSandbox(input: CreateSandboxInput): Promise<SandboxWithRepo> {
  return invoke<SandboxWithRepo>("create_sandbox", {
    name: input.name,
    description: input.description ?? null,
    githubUrl: input.githubUrl ?? null,
    userId: input.userId,
    flavor: input.flavor ?? null,
    resourceTier: input.resourceTier ?? null,
    addons: input.addons ?? null,
    autoStart: input.autoStart ?? null,
  });
}

/**
 * Delete a sandbox
 */
export async function deleteSandbox(id: string): Promise<void> {
  return invoke("delete_sandbox", { id });
}

/**
 * Start a sandbox
 */
export async function startSandbox(id: string): Promise<Sandbox> {
  return invoke<Sandbox>("start_sandbox", { id });
}

/**
 * Stop a sandbox
 */
export async function stopSandbox(id: string): Promise<Sandbox> {
  return invoke<Sandbox>("stop_sandbox", { id });
}

/**
 * Restart a sandbox
 */
export async function restartSandbox(id: string): Promise<Sandbox> {
  return invoke<Sandbox>("restart_sandbox", { id });
}

/**
 * Pause a sandbox
 */
export async function pauseSandbox(id: string): Promise<Sandbox> {
  return invoke<Sandbox>("pause_sandbox", { id });
}

/**
 * Unpause a sandbox
 */
export async function unpauseSandbox(id: string): Promise<Sandbox> {
  return invoke<Sandbox>("unpause_sandbox", { id });
}

/**
 * Get sandbox logs
 */
export async function getSandboxLogs(id: string, tail?: number): Promise<string> {
  return invoke<string>("get_sandbox_logs", { id, tail });
}

/**
 * Get sandbox resource stats
 */
export async function getSandboxStats(id: string): Promise<SandboxStats> {
  return invoke<SandboxStats>("get_sandbox_stats", { id });
}

/**
 * Get sandbox status
 */
export async function getSandboxStatus(id: string): Promise<string> {
  return invoke<string>("get_sandbox_status", { id });
}

/**
 * Execute a command in a sandbox
 */
export async function execInSandbox(
  id: string,
  command: string[],
  workingDir?: string
): Promise<ExecResult> {
  return invoke<ExecResult>("exec_in_sandbox", { id, command, workingDir });
}

/**
 * Get git status for a sandbox
 */
export async function getSandboxGitStatus(id: string): Promise<GitStatusResponse> {
  return invoke<GitStatusResponse>("get_sandbox_git_status", { id });
}

/**
 * Get git log for a sandbox
 */
export async function getSandboxGitLog(id: string): Promise<GitLogResponse> {
  return invoke<GitLogResponse>("get_sandbox_git_log", { id });
}

/**
 * Commit changes in a sandbox
 */
export async function commitSandboxChanges(id: string, message: string): Promise<GitCommitResponse> {
  return invoke<GitCommitResponse>("commit_sandbox_changes", { id, message });
}

// =============================================================================
// V2 Sandbox OpenCode Commands
// =============================================================================

/**
 * Get OpenCode app info for a sandbox
 */
export async function sandboxOpencodeGetAppInfo(sandboxId: string): Promise<AppInfo> {
  return invoke<AppInfo>("sandbox_opencode_get_app_info", { sandboxId });
}

/**
 * Check if OpenCode is healthy in a sandbox
 */
export async function sandboxOpencodeHealthCheck(sandboxId: string): Promise<OpenCodeHealth> {
  return invoke<OpenCodeHealth>("sandbox_opencode_health_check", { sandboxId });
}

/**
 * Get configured LLM providers for a sandbox
 */
export async function sandboxOpencodeGetProviders(sandboxId: string): Promise<OpenCodeProvider[]> {
  return invoke<OpenCodeProvider[]>("sandbox_opencode_get_providers", { sandboxId });
}

/**
 * Get available agents for a sandbox
 */
export async function sandboxOpencodeGetAgents(sandboxId: string): Promise<OpenCodeAgent[]> {
  return invoke<OpenCodeAgent[]>("sandbox_opencode_get_agents", { sandboxId });
}

/**
 * List all OpenCode sessions for a sandbox
 */
export async function sandboxOpencodeListSessions(sandboxId: string): Promise<Session[]> {
  return invoke<Session[]>("sandbox_opencode_list_sessions", { sandboxId });
}

/**
 * Create a new OpenCode session in a sandbox
 */
export async function sandboxOpencodeCreateSession(sandboxId: string, title?: string): Promise<Session> {
  return invoke<Session>("sandbox_opencode_create_session", { sandboxId, title });
}

/**
 * Get an OpenCode session by ID
 */
export async function sandboxOpencodeGetSession(sandboxId: string, sessionId: string): Promise<Session> {
  return invoke<Session>("sandbox_opencode_get_session", { sandboxId, sessionId });
}

/**
 * Delete an OpenCode session
 */
export async function sandboxOpencodeDeleteSession(sandboxId: string, sessionId: string): Promise<void> {
  return invoke("sandbox_opencode_delete_session", { sandboxId, sessionId });
}

/**
 * Abort a running OpenCode session
 */
export async function sandboxOpencodeAbortSession(sandboxId: string, sessionId: string): Promise<void> {
  return invoke("sandbox_opencode_abort_session", { sandboxId, sessionId });
}

/**
 * Respond to an OpenCode permission request in a sandbox
 */
export async function sandboxOpencodeRespondPermission(
  sandboxId: string,
  sessionId: string,
  permissionId: string,
  response: PermissionResponseType
): Promise<boolean> {
  return invoke<boolean>("sandbox_opencode_respond_permission", {
    sandboxId,
    sessionId,
    permissionId,
    response,
  });
}

/**
 * List messages in an OpenCode session for a sandbox
 */
export async function sandboxOpencodeListMessages(sandboxId: string, sessionId: string): Promise<Message[]> {
  return invoke<Message[]>("sandbox_opencode_list_messages", { sandboxId, sessionId });
}

/**
 * Input part for sending a message (text or file)
 */
export interface MessagePartInput {
  type: "text" | "file";
  text?: string;
  url?: string;
  filename?: string;
  mime?: string;
}

/**
 * Send a message to an OpenCode session in a sandbox
 * @param sandboxId - The sandbox ID
 * @param sessionId - The session ID
 * @param text - The message text
 * @param model - Optional model selection
 * @param agent - Optional agent to use (e.g., "onboarding", "plan", "build")
 */
export async function sandboxOpencodeSendMessage(
  sandboxId: string,
  sessionId: string,
  text: string,
  model?: ModelSelection,
  agent?: string
): Promise<Message> {
  const input = {
    parts: [{ type: "text", text }],
    model: model ? { providerID: model.providerId, modelID: model.modelId } : undefined,
    agent,
  };
  return invoke<Message>("sandbox_opencode_send_message", { sandboxId, sessionId, input });
}

/**
 * Send a message with multiple parts (text and/or files) to an OpenCode session
 * @param sandboxId - The sandbox ID
 * @param sessionId - The session ID
 * @param parts - Array of message parts (text and/or files)
 * @param model - Optional model selection
 * @param agent - Optional agent to use (e.g., "onboarding", "plan", "build")
 */
export async function sandboxOpencodeSendMessageWithParts(
  sandboxId: string,
  sessionId: string,
  parts: MessagePartInput[],
  model?: ModelSelection,
  agent?: string
): Promise<Message> {
  const input = {
    parts,
    model: model ? { providerID: model.providerId, modelID: model.modelId } : undefined,
    agent,
  };
  return invoke<Message>("sandbox_opencode_send_message", { sandboxId, sessionId, input });
}

/**
 * Get a specific message from an OpenCode session in a sandbox
 */
export async function sandboxOpencodeGetMessage(
  sandboxId: string,
  sessionId: string,
  messageId: string
): Promise<Message> {
  return invoke<Message>("sandbox_opencode_get_message", { sandboxId, sessionId, messageId });
}

/**
 * List files in a sandbox directory via OpenCode
 */
export async function sandboxOpencodeListFiles(sandboxId: string, path: string = "/"): Promise<FileNode[]> {
  return invoke<FileNode[]>("sandbox_opencode_list_files", { sandboxId, path });
}

/**
 * Get file content from a sandbox via OpenCode
 */
export async function sandboxOpencodeGetFileContent(sandboxId: string, path: string): Promise<FileContent> {
  return invoke<FileContent>("sandbox_opencode_get_file_content", { sandboxId, path });
}

/**
 * Find files in a sandbox by query via OpenCode
 */
export async function sandboxOpencodeFindFiles(sandboxId: string, query: string): Promise<string[]> {
  return invoke<string[]>("sandbox_opencode_find_files", { sandboxId, query });
}

/**
 * Connect to OpenCode SSE event stream for a sandbox
 * This starts the Rust background task that processes SSE events
 */
export async function sandboxOpencodeConnectStream(sandboxId: string): Promise<StreamConnection> {
  return invoke<StreamConnection>("sandbox_opencode_connect_stream", { sandboxId });
}

/**
 * Disconnect from OpenCode SSE event stream
 */
export async function sandboxOpencodeDisconnectStream(streamId: string): Promise<void> {
  return invoke<void>("sandbox_opencode_disconnect_stream", { streamId });
}

// =============================================================================
// SSE Event Listeners (for sandbox OpenCode streams)
// =============================================================================

/**
 * Listen for OpenCode stream events
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
 */
export async function onStreamStatus(
  callback: (payload: StreamStatusPayload) => void
): Promise<UnlistenFn> {
  return listen<StreamStatusPayload>("opencode:stream-status", (event) => {
    callback(event.payload);
  });
}

// =============================================================================
// OpenCode Stream Helper Class
// =============================================================================

/**
 * Helper class for managing a v2 sandbox OpenCode stream connection
 */
export class OpenCodeStream {
  private sandboxId: string;
  private streamId: string | null = null;
  private eventUnlisten: UnlistenFn | null = null;
  private statusUnlisten: UnlistenFn | null = null;
  private onEvent: ((event: OpenCodeEvent) => void) | null = null;
  private onStatus: ((status: StreamStatus, error?: string) => void) | null = null;

  constructor(sandboxId: string) {
    this.sandboxId = sandboxId;
  }

  /**
   * Connect to the stream
   */
  async connect(
    onEvent: (event: OpenCodeEvent) => void,
    onStatus?: (status: StreamStatus, error?: string) => void
  ): Promise<void> {
    // Prevent duplicate connections
    if (this.streamId) {
      console.warn("[OpenCodeStream] Already connected, ignoring duplicate connect call");
      return;
    }

    this.onEvent = onEvent;
    this.onStatus = onStatus ?? null;

    // IMPORTANT: Set up event listeners BEFORE starting the stream to avoid race condition
    // The Rust backend starts emitting events immediately after connection, so we need
    // the listeners ready first. We'll filter by streamId once we have it.
    let pendingStreamId: string | null = null;
    
    this.eventUnlisten = await onStreamEvent((payload) => {
      // Filter by streamId to only receive events for THIS stream connection
      const targetStreamId = this.streamId || pendingStreamId;
      if (payload.streamId === targetStreamId && this.onEvent) {
        console.debug("[OpenCodeStream] Received event:", payload.event.eventType);
        this.onEvent(payload.event);
      }
    });

    this.statusUnlisten = await onStreamStatus((payload) => {
      // Filter by streamId to only receive status for THIS stream connection
      const targetStreamId = this.streamId || pendingStreamId;
      if (payload.streamId === targetStreamId) {
        console.debug("[OpenCodeStream] Received status:", payload.status);
        
        // If server disconnected, reset our internal state so reconnection can happen
        if (payload.status === "disconnected" || payload.status === "error") {
          console.log("[OpenCodeStream] Server disconnected, resetting state for streamId:", targetStreamId);
          this.streamId = null;
          // Note: We keep the listeners active so the RuntimeProvider can handle reconnection
        }
        
        if (this.onStatus) {
          this.onStatus(payload.status, payload.error);
        }
      }
    });

    // Now start the SSE stream via Rust backend
    const connection = await sandboxOpencodeConnectStream(this.sandboxId);
    pendingStreamId = connection.streamId;
    this.streamId = connection.streamId;
    console.log("[OpenCodeStream] Connected with streamId:", this.streamId);
  }

  /**
   * Disconnect from the stream and clean up listeners
   */
  async disconnect(): Promise<void> {
    // Disconnect the SSE stream via Rust backend
    if (this.streamId) {
      try {
        await sandboxOpencodeDisconnectStream(this.streamId);
        console.log("[OpenCodeStream] Disconnected streamId:", this.streamId);
      } catch (err) {
        console.warn("[OpenCodeStream] Error disconnecting stream:", err);
      }
      this.streamId = null;
    }

    // Clean up event listeners
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
    return this.streamId !== null && this.eventUnlisten !== null;
  }
}

// =============================================================================
// User OpenCode Config Types
// =============================================================================

/** Permission level for OpenCode tools */
export type PermissionLevel = "allow" | "ask" | "deny";

/** User's OpenCode permission settings */
export interface PermissionSettings {
  bash?: PermissionLevel;
  write?: PermissionLevel;
  edit?: PermissionLevel;
  webfetch?: PermissionLevel;
  mcp?: PermissionLevel;
  doom_loop?: PermissionLevel;
  external_directory?: PermissionLevel;
}

/** User's OpenCode settings */
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
