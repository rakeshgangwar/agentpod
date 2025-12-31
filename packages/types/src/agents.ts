/**
 * Agent Catalog Types
 *
 * Types for the agent selection and marketplace system.
 * Used by both frontend and API.
 */

// =============================================================================
// Enums / Literal Types
// =============================================================================

export type AgentSquad =
  | "orchestration"
  | "development"
  | "product"
  | "operations"
  | "security"
  | "data";

export type AgentTier = "central" | "foundation" | "specialized" | "premium";

export type AgentStatus = "active" | "deprecated" | "hidden" | "pending_review";

export type AgentSource = "default" | "marketplace" | "custom" | "gift";

export type SubscriptionStatus = "active" | "cancelled" | "expired";

export type SubscriptionPlan = "monthly" | "yearly";

export type ReviewStatus = "pending" | "published" | "hidden";

// =============================================================================
// Agent Types
// =============================================================================

/**
 * Agent configuration stored in the agents table
 */
export interface AgentConfig {
  name: string;
  role: string;
  emoji?: string;
  squad: string;
  [key: string]: unknown;
}

/**
 * Core agent data from the catalog
 */
export interface Agent {
  id: string;
  slug: string;
  name: string;
  role: string;
  emoji?: string | null;
  description?: string | null;
  squad: AgentSquad;
  tier: AgentTier | null;
  tags?: string[] | null;
  category?: string | null;
  isBuiltin: boolean | null;
  isPremium: boolean | null;
  priceMonthly?: number | null;
  priceYearly?: number | null;
  publisherId?: string | null;
  publisherName?: string | null;
  installCount: number | null;
  ratingAvg?: number | null;
  ratingCount: number | null;
  config: AgentConfig;
  opencodeContent: string;
  status: AgentStatus | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Simplified agent for list views and selection UI
 */
export interface AgentSummary {
  id: string;
  slug: string;
  name: string;
  role: string;
  emoji?: string | null;
  description?: string | null;
  squad: AgentSquad;
  tier: AgentTier | null;
  isBuiltin: boolean | null;
  isPremium: boolean | null;
  installCount: number | null;
  ratingAvg?: number | null;
}

/**
 * Agent grouped by squad for UI display
 */
export interface AgentsBySquad {
  orchestration: AgentSummary[];
  development: AgentSummary[];
  product: AgentSummary[];
  operations: AgentSummary[];
  security: AgentSummary[];
  data: AgentSummary[];
}

// =============================================================================
// Preset Types
// =============================================================================

/**
 * Agent preset (quick select bundle)
 */
export interface AgentPreset {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  agentSlugs: string[];
  sortOrder: number | null;
  isDefault: boolean | null;
  isSystem: boolean | null;
  userId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Simplified preset for selection UI
 */
export interface AgentPresetSummary {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  agentSlugs: string[];
  isDefault: boolean | null;
}

// =============================================================================
// User Agent Types
// =============================================================================

/**
 * User's agent library entry
 */
export interface UserAgent {
  id: string;
  userId: string;
  agentId: string;
  source: AgentSource | null;
  subscriptionStatus?: SubscriptionStatus | null;
  subscriptionStartedAt?: Date | null;
  subscriptionExpiresAt?: Date | null;
  subscriptionPlan?: SubscriptionPlan | null;
  customName?: string | null;
  customConfig?: Record<string, unknown> | null;
  acquiredAt: Date;
}

// =============================================================================
// Sandbox Agent Types
// =============================================================================

/**
 * Per-sandbox agent assignment
 */
export interface SandboxAgent {
  id: string;
  sandboxId: string;
  agentId: string;
  enabled: boolean | null;
  priority: number | null;
  settings?: Record<string, unknown> | null;
  addedAt: Date;
  addedBy?: string | null;
}

/**
 * Sandbox agent with full agent details (for display)
 */
export interface SandboxAgentWithDetails extends SandboxAgent {
  agent: AgentSummary;
}

// =============================================================================
// Review Types
// =============================================================================

/**
 * Agent review (marketplace)
 */
export interface AgentReview {
  id: string;
  agentId: string;
  userId: string;
  rating: number;
  title?: string | null;
  review?: string | null;
  status: ReviewStatus | null;
  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// API Request/Response Types
// =============================================================================

/**
 * Request to assign agents to a sandbox
 */
export interface AssignAgentsRequest {
  agentSlugs: string[];
}

/**
 * Request to assign a preset to a sandbox
 */
export interface AssignPresetRequest {
  presetSlug: string;
}

/**
 * Response from agent assignment operations
 */
export interface AgentAssignmentResult {
  created: number;
  skipped: number;
}

/**
 * Agent selection state for sandbox creation
 */
export interface AgentSelectionState {
  selectedPreset?: string | null;
  selectedAgentSlugs: string[];
  isCustomSelection: boolean;
}

/**
 * API response for listing agents
 */
export interface AgentsListResponse {
  agents: AgentSummary[];
  bySquad: AgentsBySquad;
}

/**
 * API response for listing presets
 */
export interface PresetsListResponse {
  presets: AgentPresetSummary[];
  defaultPreset?: AgentPresetSummary | null;
}

// =============================================================================
// Squad Metadata
// =============================================================================

export interface SquadInfo {
  id: AgentSquad;
  name: string;
  description: string;
  color: string;
}

export const SQUAD_INFO: Record<AgentSquad, SquadInfo> = {
  orchestration: {
    id: "orchestration",
    name: "Orchestration",
    description: "Central coordination and task management",
    color: "purple",
  },
  development: {
    id: "development",
    name: "Development",
    description: "Code writing, review, and architecture",
    color: "cyan",
  },
  product: {
    id: "product",
    name: "Product",
    description: "Product planning, requirements, and design",
    color: "green",
  },
  operations: {
    id: "operations",
    name: "Operations",
    description: "DevOps, deployment, and infrastructure",
    color: "orange",
  },
  security: {
    id: "security",
    name: "Security",
    description: "Security analysis and vulnerability assessment",
    color: "red",
  },
  data: {
    id: "data",
    name: "Data",
    description: "Data analysis, ML, and insights",
    color: "blue",
  },
};

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Convert full agent to summary
 */
export function toAgentSummary(agent: Agent): AgentSummary {
  return {
    id: agent.id,
    slug: agent.slug,
    name: agent.name,
    role: agent.role,
    emoji: agent.emoji,
    description: agent.description,
    squad: agent.squad,
    tier: agent.tier,
    isBuiltin: agent.isBuiltin,
    isPremium: agent.isPremium,
    installCount: agent.installCount,
    ratingAvg: agent.ratingAvg,
  };
}

/**
 * Convert full preset to summary
 */
export function toPresetSummary(preset: AgentPreset): AgentPresetSummary {
  return {
    id: preset.id,
    slug: preset.slug,
    name: preset.name,
    description: preset.description,
    icon: preset.icon,
    agentSlugs: preset.agentSlugs,
    isDefault: preset.isDefault,
  };
}

/**
 * Group agents by squad
 */
export function groupAgentsBySquad(agents: AgentSummary[]): AgentsBySquad {
  const result: AgentsBySquad = {
    orchestration: [],
    development: [],
    product: [],
    operations: [],
    security: [],
    data: [],
  };

  for (const agent of agents) {
    if (result[agent.squad]) {
      result[agent.squad].push(agent);
    }
  }

  return result;
}
