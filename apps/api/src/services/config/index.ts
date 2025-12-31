/**
 * AgentPod Configuration Service
 *
 * This service handles parsing, validation, and transformation of
 * agentpod.toml configuration files.
 *
 * Key functionality:
 * - Parse agentpod.toml files
 * - Validate configurations against the schema
 * - Auto-detect project type when no config exists
 * - Convert configurations to container specifications
 *
 * @example
 * ```typescript
 * import {
 *   parseConfigFile,
 *   detectProjectType,
 *   configToContainerSpec,
 * } from './services/config';
 *
 * // Parse an existing config file
 * const result = await parseConfigFile('/path/to/agentpod.toml');
 * if (result.valid) {
 *   const containerSpec = configToContainerSpec(result.config, {
 *     sandboxId: 'my-sandbox',
 *     userId: 'user-123',
 *     repoPath: '/path/to/repo',
 *   });
 * }
 *
 * // Or auto-detect from a repository
 * const detected = await detectProjectType('/path/to/repo');
 * console.log(`Detected: ${detected.flavor} (${detected.confidence * 100}% confident)`);
 * ```
 */

// =============================================================================
// Schema Types and Validation
// =============================================================================

export {
  // Flavor, Resource, Addon IDs
  FlavorId,
  ResourceTierId,
  AddonId,

  // Section schemas
  ProjectConfigSchema,
  EnvironmentConfigSchema,
  ServicesConfigSchema,
  PortsConfigSchema,
  ResourcesConfigSchema,
  AddonsConfigSchema,
  LifecycleConfigSchema,
  GitConfigSchema,
  OpenCodeConfigSchema,

  // Complete config schema
  AgentPodConfigSchema,

  // Types
  type ProjectConfig,
  type EnvironmentConfig,
  type LanguageVersions,
  type PackagesConfig,
  type ServicesConfig,
  type PortsConfig,
  type ResourcesConfig,
  type AddonsConfig,
  type LifecycleConfig,
  type GitConfig,
  type OpenCodeConfig,
  type AgentPodConfig,
  type ConfigValidationResult,
  type ConfigValidationError,

  // Defaults
  DEFAULT_CONFIG,
} from "./schema.ts";

// =============================================================================
// Parser Functions
// =============================================================================

export {
  // Constants
  CONFIG_FILENAME,
  ALTERNATIVE_CONFIG_FILENAMES,

  // Parser functions
  parseConfig,
  parseConfigFile,
  findAndParseConfig,
  mergeWithDefaults,
  serializeConfig,
  validatePartialConfig,
} from "./parser.ts";

// =============================================================================
// Auto-Detection Functions
// =============================================================================

export {
  // Types
  type AutoDetectResult,
  type DetectedFeatures,

  // Functions
  detectProjectType,
  generateSampleConfig,
} from "./autodetect.ts";

// =============================================================================
// Container Specification Functions
// =============================================================================

export {
  // Types
  type ContainerSpecOptions,

  // Functions
  getFlavorImage,
  getTierResources,
  configToContainerSpec,
  createMinimalContainerSpec,
  validateContainerSpec,
} from "./container.ts";

// =============================================================================
// Convenience Functions
// =============================================================================

import { existsSync } from "node:fs";
import { findAndParseConfig } from "./parser.ts";
import { detectProjectType } from "./autodetect.ts";
import { configToContainerSpec, createMinimalContainerSpec } from "./container.ts";
import type { AgentPodConfig, ConfigValidationResult } from "./schema.ts";
import type { ContainerSpecOptions } from "./container.ts";
import type { SandboxConfig } from "../orchestrator/types.ts";

/**
 * Load or detect configuration for a repository
 *
 * This is the main entry point for getting a configuration.
 * It first tries to load an existing agentpod.toml file,
 * and falls back to auto-detection if none exists.
 *
 * @param repoPath - Path to the repository
 * @returns Configuration validation result
 */
export async function loadOrDetectConfig(
  repoPath: string
): Promise<ConfigValidationResult> {
  // Try to find and parse existing config
  const existingConfig = await findAndParseConfig(repoPath);
  if (existingConfig) {
    return existingConfig;
  }

  // Fall back to auto-detection
  const detected = await detectProjectType(repoPath);

  // Build a valid config from detected features
  const config: AgentPodConfig = {
    project: detected.config.project ?? { name: repoPath.split("/").pop() ?? "untitled" },
    environment: detected.config.environment,
    services: detected.config.services,
    ports: detected.config.ports,
    lifecycle: detected.config.lifecycle,
  };

  return {
    valid: true,
    config,
    errors: [],
    warnings: [
      "No agentpod.toml found. Configuration was auto-detected.",
      ...detected.messages,
    ],
  };
}

/**
 * Create a container specification from a repository
 *
 * This is the highest-level convenience function that:
 * 1. Loads or detects configuration
 * 2. Converts it to a container specification
 *
 * @param repoPath - Path to the repository
 * @param options - Container specification options
 * @returns Container specification or null if invalid
 */
export async function createContainerSpecFromRepo(
  repoPath: string,
  options: ContainerSpecOptions
): Promise<{
  spec: SandboxConfig | null;
  config: AgentPodConfig | null;
  errors: string[];
  warnings: string[];
}> {
  const configResult = await loadOrDetectConfig(repoPath);

  if (!configResult.valid || !configResult.config) {
    return {
      spec: null,
      config: null,
      errors: configResult.errors.map((e) => `${e.path}: ${e.message}`),
      warnings: configResult.warnings,
    };
  }

  const spec = configToContainerSpec(configResult.config, options);

  return {
    spec,
    config: configResult.config,
    errors: [],
    warnings: configResult.warnings,
  };
}

/**
 * Check if a repository has an agentpod.toml configuration file
 *
 * @param repoPath - Path to the repository
 * @returns True if config file exists
 */
export function hasConfigFile(repoPath: string): boolean {
  const configFiles = ["agentpod.toml", ".agentpod.toml", "agentpod.config.toml"];
  return configFiles.some((file) => existsSync(`${repoPath}/${file}`));
}
