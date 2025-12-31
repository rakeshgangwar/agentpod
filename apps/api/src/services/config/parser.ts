/**
 * AgentPod Configuration Parser
 *
 * Parses agentpod.toml files and validates them against the schema.
 * Uses @iarna/toml for TOML parsing and Zod for validation.
 */

import * as TOML from "@iarna/toml";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import type { ZodIssue } from "zod";
import {
  AgentPodConfigSchema,
  type AgentPodConfig,
  type ConfigValidationResult,
  type ConfigValidationError,
  DEFAULT_CONFIG,
} from "./schema.ts";

// =============================================================================
// Constants
// =============================================================================

/** Default configuration filename */
export const CONFIG_FILENAME = "agentpod.toml";

/** Alternative configuration filenames to check */
export const ALTERNATIVE_CONFIG_FILENAMES = [
  "agentpod.toml",
  ".agentpod.toml",
  "agentpod.config.toml",
];

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Convert a Zod issue to a ConfigValidationError
 */
function zodIssueToError(issue: ZodIssue): ConfigValidationError {
  return {
    path: issue.path.join("."),
    message: issue.message,
    code: issue.code,
  };
}

/**
 * Generate warnings for configuration
 */
function generateWarnings(config: AgentPodConfig): string[] {
  const warnings: string[] = [];

  // Warn about missing description
  if (!config.project.description) {
    warnings.push(
      "Project description is not set. Consider adding a description for better documentation."
    );
  }

  // Warn about power tier resources
  if (config.resources?.tier === "power") {
    warnings.push(
      "Power tier uses significant resources. Consider if this is necessary for your project."
    );
  }

  // Warn about GPU addon without appropriate tier
  if (config.addons?.gpu) {
    const tier = config.resources?.tier ?? "builder";
    if (tier === "starter" || tier === "builder") {
      warnings.push(
        "GPU addon may not work optimally with starter/builder tiers. Consider using creator or power tier."
      );
    }
  }

  // Warn about missing lifecycle commands
  if (!config.lifecycle?.dev) {
    warnings.push(
      "No development command specified in [lifecycle]. Consider adding 'dev' command."
    );
  }

  // Warn about auto-approve settings
  if (config.opencode?.autoApprove?.execute) {
    warnings.push(
      "Auto-approve for command execution is enabled. This could be a security risk."
    );
  }

  return warnings;
}

// =============================================================================
// Main Parser Functions
// =============================================================================

/**
 * Parse TOML content string into AgentPodConfig
 *
 * @param content - TOML content as string
 * @returns Validation result with parsed config or errors
 */
export function parseConfig(content: string): ConfigValidationResult {
  try {
    // Parse TOML content
    const rawConfig = TOML.parse(content);

    // Validate against schema
    const result = AgentPodConfigSchema.safeParse(rawConfig);

    if (result.success) {
      const warnings = generateWarnings(result.data);
      return {
        valid: true,
        config: result.data,
        errors: [],
        warnings,
      };
    } else {
      // Collect validation errors
      const errors = result.error.issues.map(zodIssueToError);
      return {
        valid: false,
        config: null,
        errors,
        warnings: [],
      };
    }
  } catch (error) {
    // Handle TOML parse errors
    if (error instanceof Error) {
      return {
        valid: false,
        config: null,
        errors: [
          {
            path: "",
            message: `TOML parse error: ${error.message}`,
            code: "toml_parse_error",
          },
        ],
        warnings: [],
      };
    }
    throw error;
  }
}

/**
 * Parse an agentpod.toml file from disk
 *
 * @param filePath - Path to the configuration file
 * @returns Validation result with parsed config or errors
 */
export async function parseConfigFile(
  filePath: string
): Promise<ConfigValidationResult> {
  try {
    // Check if file exists
    if (!existsSync(filePath)) {
      return {
        valid: false,
        config: null,
        errors: [
          {
            path: "",
            message: `Configuration file not found: ${filePath}`,
            code: "file_not_found",
          },
        ],
        warnings: [],
      };
    }

    // Read file content
    const content = await readFile(filePath, "utf-8");

    // Parse content
    return parseConfig(content);
  } catch (error) {
    if (error instanceof Error) {
      return {
        valid: false,
        config: null,
        errors: [
          {
            path: "",
            message: `Failed to read file: ${error.message}`,
            code: "file_read_error",
          },
        ],
        warnings: [],
      };
    }
    throw error;
  }
}

/**
 * Find and parse configuration file in a repository
 * Checks for multiple possible config filenames
 *
 * @param repoPath - Path to the repository root
 * @returns Validation result, or null if no config file found
 */
export async function findAndParseConfig(
  repoPath: string
): Promise<ConfigValidationResult | null> {
  for (const filename of ALTERNATIVE_CONFIG_FILENAMES) {
    const filePath = `${repoPath}/${filename}`;
    if (existsSync(filePath)) {
      return parseConfigFile(filePath);
    }
  }
  return null;
}

/**
 * Merge parsed config with default values
 * Useful when some sections are missing from the config
 *
 * @param config - Parsed configuration (may be partial)
 * @returns Complete configuration with defaults applied
 */
export function mergeWithDefaults(
  config: Partial<AgentPodConfig>
): AgentPodConfig {
  return {
    project: config.project ?? { name: "untitled" },
    environment: {
      ...DEFAULT_CONFIG.environment,
      ...config.environment,
    },
    services: config.services,
    ports: config.ports,
    resources: {
      ...DEFAULT_CONFIG.resources,
      ...config.resources,
    },
    addons: config.addons,
    lifecycle: config.lifecycle,
    git: {
      ...DEFAULT_CONFIG.git,
      ...config.git,
    },
    opencode: config.opencode,
  } as AgentPodConfig;
}

/**
 * Serialize AgentPodConfig back to TOML string
 *
 * @param config - Configuration to serialize
 * @returns TOML string
 */
export function serializeConfig(config: AgentPodConfig): string {
  // Filter out undefined values for cleaner output
  const cleanConfig = JSON.parse(JSON.stringify(config));
  return TOML.stringify(cleanConfig);
}

/**
 * Validate a partial configuration (e.g., from auto-detection)
 * More lenient than full parsing - only validates present fields
 *
 * @param config - Partial configuration object
 * @returns Validation result
 */
export function validatePartialConfig(
  config: unknown
): ConfigValidationResult {
  try {
    const result = AgentPodConfigSchema.partial().safeParse(config);

    if (result.success) {
      return {
        valid: true,
        config: result.data as AgentPodConfig,
        errors: [],
        warnings: [],
      };
    } else {
      const errors = result.error.issues.map(zodIssueToError);
      return {
        valid: false,
        config: null,
        errors,
        warnings: [],
      };
    }
  } catch (error) {
    if (error instanceof Error) {
      return {
        valid: false,
        config: null,
        errors: [
          {
            path: "",
            message: error.message,
            code: "validation_error",
          },
        ],
        warnings: [],
      };
    }
    throw error;
  }
}
