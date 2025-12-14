/**
 * Onboarding System Types
 *
 * Types for the onboarding agent system including:
 * - Knowledge documents and search
 * - Onboarding sessions and status
 * - Model selection
 */

// =============================================================================
// Knowledge Document Types
// =============================================================================

export type KnowledgeCategory =
  | "project_template"
  | "agent_pattern"
  | "command_template"
  | "tool_template"
  | "plugin_template"
  | "mcp_template"
  | "workflow_pattern"
  | "best_practice"
  | "provider_guide";

export type EmbeddingStatus = "pending" | "processing" | "completed" | "failed";

export interface KnowledgeDocument {
  id: string;
  category: KnowledgeCategory;
  title: string;
  description: string | null;
  content: string;
  tags: string[];
  applicableTo: string[] | null;
  metadata: Record<string, unknown>;
  embeddingStatus: EmbeddingStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeSearchParams {
  query?: string;
  category?: KnowledgeCategory;
  tags?: string[];
  limit?: number;
  useSemanticSearch?: boolean;
}

export interface KnowledgeSearchResult extends KnowledgeDocument {
  similarity?: number;
}

export interface CreateKnowledgeDocument {
  category: KnowledgeCategory;
  title: string;
  description?: string;
  content: string;
  tags?: string[];
  applicableTo?: string[];
  metadata?: Record<string, unknown>;
}

export interface UpdateKnowledgeDocument {
  title?: string;
  description?: string;
  content?: string;
  tags?: string[];
  applicableTo?: string[];
  metadata?: Record<string, unknown>;
}

// =============================================================================
// Onboarding Session Types
// =============================================================================

export type OnboardingStatus =
  | "pending"
  | "started"
  | "gathering"
  | "generating"
  | "applying"
  | "completed"
  | "skipped"
  | "failed";

export interface OnboardingSession {
  id: string;
  userId: string;
  sandboxId: string | null;
  status: OnboardingStatus;

  // Project information gathered during onboarding
  projectType: string | null;
  projectName: string | null;
  projectDescription: string | null;

  // Requirements gathered from user
  gatheredRequirements: OnboardingRequirements | null;

  // Generated configuration
  generatedConfig: GeneratedConfig | null;

  // Selected models
  selectedModel: string | null;
  selectedSmallModel: string | null;

  // Error info
  errorMessage: string | null;

  // Timestamps
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface OnboardingRequirements {
  // Project basics
  projectType: string;
  projectName: string;
  projectDescription?: string;

  // Languages and frameworks
  primaryLanguage?: string;
  frameworks?: string[];
  buildTools?: string[];

  // Development preferences
  testingFramework?: string;
  linter?: string;
  formatter?: string;

  // AI preferences
  preferredModel?: string;
  preferredSmallModel?: string;
  codingStyle?: string;

  // Custom instructions
  customInstructions?: string;

  // Additional context
  additionalContext?: Record<string, unknown>;
}

export interface GeneratedConfig {
  // opencode.json settings
  settings: OpenCodeSettings;

  // AGENTS.md content
  agentsMd?: string;

  // Custom agents
  agents?: AgentDefinition[];

  // Custom commands
  commands?: CommandDefinition[];

  // MCP servers
  mcpServers?: McpServerConfig[];
}

export interface OpenCodeSettings {
  provider?: string;
  model?: string;
  smallModel?: string;
  autoapprove?: string[];
  customInstructions?: string;
  [key: string]: unknown;
}

export interface AgentDefinition {
  name: string;
  description: string;
  content: string;
}

export interface CommandDefinition {
  name: string;
  description: string;
  content: string;
}

export interface McpServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface CreateOnboardingSession {
  userId: string;
  sandboxId?: string;
}

export interface UpdateOnboardingSession {
  status?: OnboardingStatus;
  projectType?: string;
  projectName?: string;
  projectDescription?: string;
  gatheredRequirements?: OnboardingRequirements;
  generatedConfig?: GeneratedConfig;
  selectedModel?: string;
  selectedSmallModel?: string;
  errorMessage?: string;
}

// =============================================================================
// Model Selection Types
// =============================================================================

// Re-use ModelInfo from provider.ts - import it where needed
// import { ModelInfo, Provider } from "./provider";

export interface OnboardingModelRecommendation {
  primaryModelId: string;
  primaryModelName: string;
  primaryProvider: string;
  smallModelId?: string;
  smallModelName?: string;
  smallProvider?: string;
  reasoning: string;
  alternativeModelIds: string[];
}

export interface ModelSelectionParams {
  projectType?: string;
  preferLowCost?: boolean;
  preferFast?: boolean;
  requireLargeContext?: boolean;
  configuredProvidersOnly?: boolean;
}

// =============================================================================
// Re-onboarding Types
// =============================================================================

export type ReOnboardingStrategy = "wipe" | "merge";

export interface ReOnboardingOptions {
  strategy: ReOnboardingStrategy;
  preserveCustomAgents?: boolean;
  preserveCustomCommands?: boolean;
  preserveMcpServers?: boolean;
}

// =============================================================================
// Onboarding Agent Types
// =============================================================================

/**
 * OpenCode JSON configuration structure.
 * Generated by the onboarding agent for the user's workspace.
 */
export interface OpenCodeJsonConfig {
  $schema?: string;
  model?: string;
  small_model?: string;
  share?: "manual" | "auto" | "disabled";
  autoupdate?: boolean | "notify";
  mcp?: Record<string, McpServerDefinition>;
  agent?: Record<string, AgentConfigDefinition>;
  command?: Record<string, CommandConfigDefinition>;
  permission?: PermissionConfig;
  formatter?: Record<string, FormatterConfig> | false;
  instructions?: string[];
  tools?: Record<string, boolean>;
  disabled_providers?: string[];
  theme?: string;
  tui?: {
    scroll_speed?: number;
    scroll_acceleration?: number;
  };
  keybinds?: Record<string, string>;
}

/**
 * MCP server definition in opencode.json
 */
export interface McpServerDefinition {
  type: "local" | "remote";
  command?: string[];
  url?: string;
  enabled?: boolean;
  environment?: Record<string, string>;
  headers?: Record<string, string>;
  oauth?: McpOAuthConfig | false;
  timeout?: number;
}

/**
 * OAuth configuration for MCP servers
 */
export interface McpOAuthConfig {
  clientId?: string;
  clientSecret?: string;
  scope?: string;
}

/**
 * Agent configuration in opencode.json
 */
export interface AgentConfigDefinition {
  description: string;
  mode?: "primary" | "subagent" | "all";
  model?: string;
  temperature?: number;
  maxSteps?: number;
  prompt?: string;
  disable?: boolean;
  tools?: Record<string, boolean>;
  permission?: Record<string, PermissionValue>;
}

/**
 * Command configuration in opencode.json
 */
export interface CommandConfigDefinition {
  description: string;
  template?: string;
  agent?: string;
  subtask?: boolean;
  model?: string;
}

/**
 * Permission configuration
 */
export interface PermissionConfig {
  edit?: PermissionValue;
  bash?: PermissionValue | Record<string, PermissionValue>;
  webfetch?: PermissionValue;
  doom_loop?: PermissionValue;
  external_directory?: PermissionValue;
}

export type PermissionValue = "allow" | "ask" | "deny";

/**
 * Formatter configuration
 */
export interface FormatterConfig {
  command: string[];
  extensions: string[];
  environment?: Record<string, string>;
  disabled?: boolean;
}

// =============================================================================
// Agent Template Types
// =============================================================================

/**
 * Agent markdown file frontmatter
 */
export interface AgentFrontmatter {
  description: string;
  mode?: "primary" | "subagent" | "all";
  model?: string;
  temperature?: number;
  maxSteps?: number;
  tools?: Record<string, boolean>;
  permission?: Record<string, PermissionValue>;
}

/**
 * Parsed agent template with frontmatter and content
 */
export interface ParsedAgentTemplate {
  frontmatter: AgentFrontmatter;
  content: string;
}

// =============================================================================
// Config Generation Types
// =============================================================================

/**
 * Input for generating OpenCode configuration
 */
export interface ConfigGenerationInput {
  requirements: OnboardingRequirements;
  recommendation: OnboardingModelRecommendation;
  userId: string;
  sandboxId?: string;
}

/**
 * Output from config generation
 */
export interface ConfigGenerationOutput {
  /** opencode.json configuration */
  opencodeJson: OpenCodeJsonConfig;
  /** AGENTS.md content */
  agentsMdContent: string;
  /** Custom agent definitions (.opencode/agent/*.md) */
  customAgents: GeneratedAgentFile[];
  /** Custom command definitions (.opencode/command/*.md) */
  customCommands: GeneratedCommandFile[];
}

/**
 * Generated agent file
 */
export interface GeneratedAgentFile {
  filename: string;
  content: string;
}

/**
 * Generated command file
 */
export interface GeneratedCommandFile {
  filename: string;
  content: string;
}

// =============================================================================
// MCP Tool Types (for /api/mcp/knowledge endpoint)
// =============================================================================

/**
 * MCP tool call request
 */
export interface McpToolCallRequest {
  method: "tools/call";
  params: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

/**
 * MCP tool call response
 */
export interface McpToolCallResponse {
  content: Array<{
    type: "text";
    text: string;
  }>;
  isError?: boolean;
}

/**
 * MCP tools list request
 */
export interface McpToolsListRequest {
  method: "tools/list";
}

/**
 * MCP tools list response
 */
export interface McpToolsListResponse {
  tools: McpToolDefinition[];
}

/**
 * MCP tool definition
 */
export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, McpToolProperty>;
    required?: string[];
  };
}

/**
 * MCP tool property definition
 */
export interface McpToolProperty {
  type: string;
  description?: string;
  enum?: string[];
  items?: McpToolProperty;
  default?: unknown;
}

// =============================================================================
// Sandbox Integration Types
// =============================================================================

/**
 * Environment variables injected into sandbox for onboarding
 */
export interface OnboardingEnvVars {
  ONBOARDING_MODE: string;
  ONBOARDING_SESSION_ID: string;
  AGENTPOD_API_TOKEN: string;
  MANAGEMENT_API_URL: string;
}

/**
 * Files to inject into sandbox at creation
 */
export interface OnboardingInjectedFiles {
  /** opencode.json content */
  opencodeJson: string;
  /** AGENTS.md content */
  agentsMd: string;
  /** Agent markdown files to create */
  agents: Array<{
    path: string;
    content: string;
  }>;
}
