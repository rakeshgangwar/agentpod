/**
 * AgentPod Configuration Schema
 *
 * Defines the TypeScript types and Zod schemas for agentpod.toml configuration files.
 * This is the central definition for sandbox environment configuration.
 */

import { z } from "zod";

// =============================================================================
// Flavor IDs (matches database)
// =============================================================================

/**
 * Available container flavors
 */
export const FlavorId = z.enum([
  "bare",
  "js",
  "python",
  "go",
  "rust",
  "fullstack",
  "polyglot",
]);
export type FlavorId = z.infer<typeof FlavorId>;

// =============================================================================
// Resource Tier IDs (matches database)
// =============================================================================

/**
 * Available resource tiers
 */
export const ResourceTierId = z.enum([
  "micro",
  "starter",
  "builder",
  "creator",
  "power",
]);
export type ResourceTierId = z.infer<typeof ResourceTierId>;

// =============================================================================
// Addon IDs (matches database)
// =============================================================================

/**
 * Available container addons
 */
export const AddonId = z.enum([
  "gui",
  "code-server",
  "gpu",
  "databases",
  "cloud",
]);
export type AddonId = z.infer<typeof AddonId>;

// =============================================================================
// Project Section
// =============================================================================

/**
 * [project] section schema
 */
export const ProjectConfigSchema = z.object({
  /** Project name (used for display and URL slug) */
  name: z.string().min(1).max(100),

  /** Project description */
  description: z.string().max(500).optional(),

  /** Project version */
  version: z.string().optional(),

  /** Project authors */
  authors: z.array(z.string()).optional(),

  /** Project license */
  license: z.string().optional(),

  /** Project repository URL */
  repository: z.string().url().optional(),
});

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;

// =============================================================================
// Environment Section
// =============================================================================

/**
 * Language version specifications
 */
export const LanguageVersionsSchema = z.object({
  /** Node.js version (e.g., "22", "20", "18") */
  node: z.string().optional(),

  /** Python version (e.g., "3.12", "3.11") */
  python: z.string().optional(),

  /** Go version (e.g., "1.22", "1.21") */
  go: z.string().optional(),

  /** Rust version (e.g., "1.75", "stable", "nightly") */
  rust: z.string().optional(),

  /** Java version (e.g., "21", "17") */
  java: z.string().optional(),

  /** Ruby version (e.g., "3.3", "3.2") */
  ruby: z.string().optional(),

  /** PHP version (e.g., "8.3", "8.2") */
  php: z.string().optional(),
});

export type LanguageVersions = z.infer<typeof LanguageVersionsSchema>;

/**
 * Package manager configurations
 */
export const PackagesConfigSchema = z.object({
  /** APT packages to install */
  apt: z.array(z.string()).optional(),

  /** NPM packages to install globally */
  npm: z.array(z.string()).optional(),

  /** Pip packages to install */
  pip: z.array(z.string()).optional(),

  /** Cargo crates to install */
  cargo: z.array(z.string()).optional(),

  /** Go modules to install */
  go: z.array(z.string()).optional(),
});

export type PackagesConfig = z.infer<typeof PackagesConfigSchema>;

/**
 * [environment] section schema
 */
export const EnvironmentConfigSchema = z.object({
  /** Base flavor: js, python, go, rust, fullstack, polyglot */
  base: FlavorId.default("js"),

  /** Language version specifications */
  languages: LanguageVersionsSchema.optional(),

  /** Additional packages to install */
  packages: PackagesConfigSchema.optional(),

  /** Environment variables to set */
  variables: z.record(z.string()).optional(),
});

export type EnvironmentConfig = z.infer<typeof EnvironmentConfigSchema>;

// =============================================================================
// Services Section
// =============================================================================

/**
 * Database service configuration
 */
export const DatabaseServiceSchema = z.union([
  z.boolean(),
  z.object({
    enabled: z.boolean().default(true),
    version: z.string().optional(),
  }),
]);

/**
 * [services] section schema
 */
export const ServicesConfigSchema = z.object({
  /** PostgreSQL database */
  postgres: DatabaseServiceSchema.optional(),

  /** MySQL database */
  mysql: DatabaseServiceSchema.optional(),

  /** Redis cache */
  redis: DatabaseServiceSchema.optional(),

  /** MongoDB database */
  mongodb: DatabaseServiceSchema.optional(),

  /** SQLite (always available, just for explicit config) */
  sqlite: z.boolean().optional(),
});

export type ServicesConfig = z.infer<typeof ServicesConfigSchema>;

// =============================================================================
// Ports Section
// =============================================================================

/**
 * Port configuration
 */
export const PortConfigSchema = z.union([
  z.number().int().min(1).max(65535),
  z.object({
    /** Port number */
    port: z.number().int().min(1).max(65535).optional(),

    /** Display label for the port */
    label: z.string().optional(),

    /** Whether the port is publicly accessible */
    public: z.boolean().default(false),

    /** Protocol (http, https, tcp) */
    protocol: z.enum(["http", "https", "tcp"]).default("http"),
  }),
]);

/**
 * [ports] section schema
 * Keys are port numbers, values are port configurations
 */
export const PortsConfigSchema = z.record(
  z.string().regex(/^\d+$/),
  PortConfigSchema
);

export type PortsConfig = z.infer<typeof PortsConfigSchema>;

// =============================================================================
// Resources Section
// =============================================================================

/**
 * [resources] section schema
 */
export const ResourcesConfigSchema = z.object({
  /** Resource tier: starter, builder, creator, power */
  tier: ResourceTierId.default("builder"),

  /** Override CPU cores (if allowed) */
  cpuCores: z.number().int().min(1).max(16).optional(),

  /** Override memory in GB (if allowed) */
  memoryGb: z.number().min(0.5).max(64).optional(),

  /** Override storage in GB (if allowed) */
  storageGb: z.number().min(1).max(500).optional(),
});

export type ResourcesConfig = z.infer<typeof ResourcesConfigSchema>;

// =============================================================================
// Addons Section
// =============================================================================

/**
 * Addon configuration
 */
export const AddonConfigSchema = z.union([
  z.boolean(),
  z.object({
    enabled: z.boolean().default(true),
    config: z.record(z.unknown()).optional(),
  }),
]);

/**
 * [addons] section schema
 */
export const AddonsConfigSchema = z.object({
  /** Code Server (VS Code in browser) */
  "code-server": AddonConfigSchema.optional(),

  /** GUI support (VNC/noVNC desktop) */
  gui: AddonConfigSchema.optional(),

  /** GPU support */
  gpu: AddonConfigSchema.optional(),

  /** Database tools (pgAdmin, etc.) */
  databases: AddonConfigSchema.optional(),

  /** Cloud CLI tools (AWS, GCP, Azure) */
  cloud: AddonConfigSchema.optional(),
});

export type AddonsConfig = z.infer<typeof AddonsConfigSchema>;

// =============================================================================
// Lifecycle Section
// =============================================================================

/**
 * [lifecycle] section schema
 */
export const LifecycleConfigSchema = z.object({
  /** Command to run on container start (before any other commands) */
  init: z.string().optional(),

  /** Setup command (run once after clone/create) */
  setup: z.string().optional(),

  /** Development server command */
  dev: z.string().optional(),

  /** Build command */
  build: z.string().optional(),

  /** Test command */
  test: z.string().optional(),

  /** Lint command */
  lint: z.string().optional(),

  /** Format command */
  format: z.string().optional(),
});

export type LifecycleConfig = z.infer<typeof LifecycleConfigSchema>;

// =============================================================================
// Git Section
// =============================================================================

/**
 * [git] section schema
 */
export const GitConfigSchema = z.object({
  /** Default branch name */
  defaultBranch: z.string().default("main"),

  /** Git user name (for commits) */
  userName: z.string().optional(),

  /** Git user email (for commits) */
  userEmail: z.string().email().optional(),

  /** Auto-commit changes */
  autoCommit: z.boolean().default(false),

  /** Commit message template */
  commitTemplate: z.string().optional(),
});

export type GitConfig = z.infer<typeof GitConfigSchema>;

// =============================================================================
// OpenCode Section
// =============================================================================

/**
 * [opencode] section schema
 * Configuration specific to OpenCode AI agent
 */
export const OpenCodeConfigSchema = z.object({
  /** Default AI provider */
  provider: z.string().optional(),

  /** Default AI model */
  model: z.string().optional(),

  /** Custom system prompt */
  systemPrompt: z.string().optional(),

  /** Enable auto-approval for certain operations */
  autoApprove: z
    .object({
      /** Auto-approve file reads */
      read: z.boolean().default(true),
      /** Auto-approve file writes */
      write: z.boolean().default(false),
      /** Auto-approve command execution */
      execute: z.boolean().default(false),
    })
    .optional(),

  /** Custom AGENTS.md content */
  agentsMd: z.string().optional(),
});

export type OpenCodeConfig = z.infer<typeof OpenCodeConfigSchema>;

// =============================================================================
// Complete AgentPod Configuration
// =============================================================================

/**
 * Complete agentpod.toml configuration schema
 */
export const AgentPodConfigSchema = z.object({
  /** Project metadata */
  project: ProjectConfigSchema,

  /** Environment configuration */
  environment: EnvironmentConfigSchema.optional(),

  /** Services (databases, caches) */
  services: ServicesConfigSchema.optional(),

  /** Port mappings */
  ports: PortsConfigSchema.optional(),

  /** Resource allocation */
  resources: ResourcesConfigSchema.optional(),

  /** Container addons */
  addons: AddonsConfigSchema.optional(),

  /** Lifecycle commands */
  lifecycle: LifecycleConfigSchema.optional(),

  /** Git configuration */
  git: GitConfigSchema.optional(),

  /** OpenCode AI configuration */
  opencode: OpenCodeConfigSchema.optional(),
});

export type AgentPodConfig = z.infer<typeof AgentPodConfigSchema>;

// =============================================================================
// Validation Result
// =============================================================================

/**
 * Result of configuration validation
 */
export interface ConfigValidationResult {
  valid: boolean;
  config: AgentPodConfig | null;
  errors: ConfigValidationError[];
  warnings: string[];
}

/**
 * Configuration validation error
 */
export interface ConfigValidationError {
  path: string;
  message: string;
  code: string;
}

// =============================================================================
// Default Configuration
// =============================================================================

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: Partial<AgentPodConfig> = {
  environment: {
    base: "js",
  },
  resources: {
    tier: "builder",
  },
  git: {
    defaultBranch: "main",
    autoCommit: false,
  },
};
