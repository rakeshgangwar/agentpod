/**
 * Sandbox Manager Service
 *
 * High-level service that coordinates:
 * - Docker orchestrator (container lifecycle)
 * - Git backend (repository management)
 * - Configuration service (agentpod.toml parsing)
 *
 * This replaces the old project-manager.ts which used Coolify + Forgejo.
 */

import { nanoid } from "nanoid";
import { config } from "../config.ts";
import { DockerOrchestrator } from "./orchestrator/docker.ts";
import { FileSystemGitBackend } from "./git/filesystem.ts";
import {
  loadOrDetectConfig,
  configToContainerSpec,
  createMinimalContainerSpec,
} from "./config/index.ts";
import type { Sandbox, SandboxConfig, SandboxStats } from "./orchestrator/types.ts";
import type { Repository } from "./git/types.ts";
import { createLogger } from "../utils/logger.ts";

const log = createLogger("sandbox-manager");

// =============================================================================
// Types
// =============================================================================

export interface CreateSandboxOptions {
  /** Project name */
  name: string;
  /** Optional description */
  description?: string;
  /** Clone from GitHub URL */
  githubUrl?: string;
  /** User ID (owner) */
  userId: string;
  /** Container flavor (js, python, go, rust, fullstack, polyglot) */
  flavor?: string;
  /** Resource tier (starter, builder, creator, power) */
  resourceTier?: string;
  /** Addon IDs to enable */
  addons?: string[];
  /** Auto-start the container after creation */
  autoStart?: boolean;
}

export interface SandboxWithRepo {
  sandbox: Sandbox;
  repository: Repository;
}

export interface SandboxInfo {
  sandbox: Sandbox;
  repository: Repository | null;
  config: Record<string, unknown> | null;
}

// =============================================================================
// Sandbox Manager
// =============================================================================

export class SandboxManager {
  private orchestrator: DockerOrchestrator;
  private gitBackend: FileSystemGitBackend;

  constructor() {
    // Initialize Docker orchestrator
    this.orchestrator = new DockerOrchestrator({
      socketPath: config.docker.socketPath,
      host: config.docker.host || undefined,
      port: config.docker.port,
      containerPrefix: config.docker.containerPrefix,
      defaultNetwork: config.docker.network,
    });

    // Initialize Git backend
    this.gitBackend = new FileSystemGitBackend({
      reposDir: config.data.reposDir,
      defaultAuthor: {
        name: "AgentPod",
        email: "agent@agentpod.dev",
      },
      defaultBranch: "main",
    });

    log.info("SandboxManager initialized", {
      reposDir: config.data.reposDir,
      dockerNetwork: config.docker.network,
    });
  }

  // ===========================================================================
  // Sandbox Lifecycle
  // ===========================================================================

  /**
   * Create a new sandbox with a Git repository and container
   */
  async createSandbox(options: CreateSandboxOptions): Promise<SandboxWithRepo> {
    const {
      name,
      description,
      githubUrl,
      userId,
      flavor,
      resourceTier,
      // addons - reserved for future use
      autoStart = false,
    } = options;

    // Generate unique sandbox ID
    const sandboxId = nanoid(12);
    const slug = this.generateSlug(name);

    log.info("Creating sandbox", { sandboxId, name, slug, githubUrl });

    // Step 1: Create or clone the repository
    let repository: Repository;
    const repoName = `${slug}-${sandboxId}`;

    try {
      if (githubUrl) {
        log.info("Cloning repository from GitHub", { githubUrl, repoName });
        repository = await this.gitBackend.cloneRepo(githubUrl, repoName, {
          depth: 1, // Shallow clone for speed
        });
      } else {
        log.info("Creating new repository", { repoName });
        repository = await this.gitBackend.createRepo(repoName, {
          description: description ?? `Sandbox for ${name}`,
          template: {
            readme: true,
            gitignore: true,
            agentpodConfig: true,
          },
          initialCommit: true,
        });
      }
    } catch (error) {
      log.error("Failed to create/clone repository", { error });
      throw new Error(`Failed to create repository: ${error instanceof Error ? error.message : "Unknown error"}`);
    }

    // Step 2: Load or detect configuration
    const configResult = await loadOrDetectConfig(repository.path);
    if (!configResult.valid) {
      log.warn("Configuration validation failed", { errors: configResult.errors });
    }

    // Step 3: Create container specification
    let containerSpec: SandboxConfig;

    if (configResult.config) {
      // Use configuration from repo
      containerSpec = configToContainerSpec(configResult.config, {
        sandboxId,
        userId,
        repoPath: repository.path,
      });
    } else {
      // Use minimal defaults
      containerSpec = createMinimalContainerSpec(
        sandboxId,
        name,
        repository.path,
        userId
      );
    }

    // Override with explicit options if provided
    if (flavor) {
      containerSpec.image = this.getImageForFlavor(flavor);
    }
    if (resourceTier) {
      const tierResources = this.getResourcesForTier(resourceTier);
      containerSpec.resources = {
        ...containerSpec.resources,
        ...tierResources,
      };
    }

    // Add sandbox metadata to labels
    containerSpec.labels = {
      ...containerSpec.labels,
      "agentpod.sandbox.id": sandboxId,
      "agentpod.sandbox.name": name,
      "agentpod.sandbox.slug": slug,
      "agentpod.sandbox.user": userId,
      "agentpod.sandbox.repo": repoName,
      "agentpod.sandbox.created": new Date().toISOString(),
    };

    // Add GitHub URL if cloned
    if (githubUrl) {
      containerSpec.labels["agentpod.sandbox.github"] = githubUrl;
    }

    // Step 4: Create the container
    let sandbox: Sandbox;
    try {
      log.info("Creating container", { sandboxId, image: containerSpec.image });
      sandbox = await this.orchestrator.createSandbox(containerSpec);
      log.info("Container created", { sandboxId, containerId: sandbox.containerId });
    } catch (error) {
      // Cleanup repository on failure
      log.error("Failed to create container, cleaning up repository", { error });
      try {
        await this.gitBackend.deleteRepo(repoName);
      } catch (cleanupError) {
        log.warn("Failed to cleanup repository", { cleanupError });
      }
      throw new Error(`Failed to create container: ${error instanceof Error ? error.message : "Unknown error"}`);
    }

    // Step 5: Start if requested
    if (autoStart) {
      try {
        await this.orchestrator.startSandbox(sandboxId);
        log.info("Container started", { sandboxId });
      } catch (error) {
        log.warn("Failed to auto-start container", { sandboxId, error });
      }
    }

    return { sandbox, repository };
  }

  /**
   * Start a sandbox container
   */
  async startSandbox(sandboxId: string): Promise<void> {
    log.info("Starting sandbox", { sandboxId });
    await this.orchestrator.startSandbox(sandboxId);
  }

  /**
   * Stop a sandbox container
   */
  async stopSandbox(sandboxId: string, timeout?: number): Promise<void> {
    log.info("Stopping sandbox", { sandboxId, timeout });
    await this.orchestrator.stopSandbox(sandboxId, timeout);
  }

  /**
   * Restart a sandbox container
   */
  async restartSandbox(sandboxId: string, timeout?: number): Promise<void> {
    log.info("Restarting sandbox", { sandboxId });
    await this.orchestrator.restartSandbox(sandboxId, timeout);
  }

  /**
   * Pause a sandbox container
   */
  async pauseSandbox(sandboxId: string): Promise<void> {
    log.info("Pausing sandbox", { sandboxId });
    await this.orchestrator.pauseSandbox(sandboxId);
  }

  /**
   * Unpause a sandbox container
   */
  async unpauseSandbox(sandboxId: string): Promise<void> {
    log.info("Unpausing sandbox", { sandboxId });
    await this.orchestrator.unpauseSandbox(sandboxId);
  }

  /**
   * Delete a sandbox and its repository
   */
  async deleteSandbox(
    sandboxId: string,
    options: { deleteRepo?: boolean; removeVolumes?: boolean } = {}
  ): Promise<void> {
    const { deleteRepo = true, removeVolumes = false } = options;

    log.info("Deleting sandbox", { sandboxId, deleteRepo, removeVolumes });

    // Get sandbox info to find associated repository
    const sandbox = await this.orchestrator.getSandbox(sandboxId);
    const repoName = sandbox?.labels?.["agentpod.sandbox.repo"];

    // Delete container
    try {
      await this.orchestrator.deleteSandbox(sandboxId, removeVolumes);
      log.info("Container deleted", { sandboxId });
    } catch (error) {
      log.warn("Failed to delete container", { sandboxId, error });
    }

    // Delete repository if requested
    if (deleteRepo && repoName) {
      try {
        await this.gitBackend.deleteRepo(repoName);
        log.info("Repository deleted", { repoName });
      } catch (error) {
        log.warn("Failed to delete repository", { repoName, error });
      }
    }
  }

  // ===========================================================================
  // Sandbox Information
  // ===========================================================================

  /**
   * Get sandbox by ID
   */
  async getSandbox(sandboxId: string): Promise<Sandbox | null> {
    return this.orchestrator.getSandbox(sandboxId);
  }

  /**
   * Get sandbox with associated repository info
   */
  async getSandboxInfo(sandboxId: string): Promise<SandboxInfo | null> {
    const sandbox = await this.orchestrator.getSandbox(sandboxId);
    if (!sandbox) return null;

    const repoName = sandbox.labels?.["agentpod.sandbox.repo"];
    let repository: Repository | null = null;
    let sandboxConfig: Record<string, unknown> | null = null;

    if (repoName) {
      repository = await this.gitBackend.getRepo(repoName);
      if (repository) {
        const configResult = await loadOrDetectConfig(repository.path);
        if (configResult.config) {
          sandboxConfig = configResult.config as unknown as Record<string, unknown>;
        }
      }
    }

    return { sandbox, repository, config: sandboxConfig };
  }

  /**
   * List all sandboxes
   */
  async listSandboxes(filter?: {
    userId?: string;
    status?: string | string[];
  }): Promise<Sandbox[]> {
    const sandboxFilter: Record<string, unknown> = {};

    if (filter?.userId) {
      sandboxFilter.labels = { "agentpod.sandbox.user": filter.userId };
    }
    if (filter?.status) {
      sandboxFilter.status = filter.status;
    }

    return this.orchestrator.listSandboxes(sandboxFilter);
  }

  /**
   * Get sandbox status
   */
  async getSandboxStatus(sandboxId: string) {
    return this.orchestrator.getSandboxStatus(sandboxId);
  }

  /**
   * Get sandbox resource stats
   */
  async getSandboxStats(sandboxId: string): Promise<SandboxStats> {
    return this.orchestrator.getSandboxStats(sandboxId);
  }

  /**
   * Get sandbox logs
   */
  async getSandboxLogs(
    sandboxId: string,
    options?: { tail?: number; since?: Date; timestamps?: boolean }
  ): Promise<string> {
    return this.orchestrator.getLogs(sandboxId, options);
  }

  /**
   * Stream sandbox logs
   */
  streamSandboxLogs(
    sandboxId: string,
    options?: { tail?: number; timestamps?: boolean }
  ): AsyncIterable<string> {
    return this.orchestrator.streamLogs(sandboxId, options);
  }

  // ===========================================================================
  // Command Execution
  // ===========================================================================

  /**
   * Execute a command in a sandbox
   */
  async exec(
    sandboxId: string,
    command: string[],
    options?: {
      workingDir?: string;
      env?: Record<string, string>;
      user?: string;
    }
  ) {
    return this.orchestrator.exec(sandboxId, command, options);
  }

  // ===========================================================================
  // Repository Operations
  // ===========================================================================

  /**
   * Get repository for a sandbox
   */
  async getRepository(sandboxId: string): Promise<Repository | null> {
    const sandbox = await this.orchestrator.getSandbox(sandboxId);
    if (!sandbox) return null;

    const repoName = sandbox.labels?.["agentpod.sandbox.repo"];
    if (!repoName) return null;

    return this.gitBackend.getRepo(repoName);
  }

  /**
   * Commit changes in a sandbox's repository
   */
  async commitChanges(
    sandboxId: string,
    message: string,
    author?: { name: string; email: string }
  ): Promise<string> {
    const repo = await this.getRepository(sandboxId);
    if (!repo) {
      throw new Error(`Repository not found for sandbox: ${sandboxId}`);
    }

    // Stage all changes
    await this.gitBackend.stageFiles(repo.name);

    // Commit
    return this.gitBackend.commit(repo.name, {
      message,
      author: author ?? {
        name: "AgentPod User",
        email: "user@agentpod.dev",
        timestamp: new Date(),
      },
    });
  }

  /**
   * Get Git status for a sandbox's repository
   */
  async getGitStatus(sandboxId: string) {
    const repo = await this.getRepository(sandboxId);
    if (!repo) {
      throw new Error(`Repository not found for sandbox: ${sandboxId}`);
    }

    return this.gitBackend.getStatus(repo.name);
  }

  /**
   * Get Git log for a sandbox's repository
   */
  async getGitLog(sandboxId: string, options?: { limit?: number }) {
    const repo = await this.getRepository(sandboxId);
    if (!repo) {
      throw new Error(`Repository not found for sandbox: ${sandboxId}`);
    }

    return this.gitBackend.getLog(repo.name, options);
  }

  // ===========================================================================
  // Health & Docker Info
  // ===========================================================================

  /**
   * Check Docker health
   */
  async healthCheck(): Promise<boolean> {
    return this.orchestrator.healthCheck();
  }

  /**
   * Get Docker daemon info
   */
  async getDockerInfo() {
    return this.orchestrator.getInfo();
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  /**
   * Generate a URL-safe slug from a name
   */
  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .substring(0, 50);
  }

  /**
   * Get Docker image for a flavor
   */
  private getImageForFlavor(flavor: string): string {
    // In development mode, check for local agentpod images first, then fall back to base images
    if (config.nodeEnv === "development") {
      // Try to use local agentpod images if available (built with docker/base/Dockerfile)
      // These include OpenCode pre-installed
      const localAgentpodImages: Record<string, string> = {
        js: "agentpod/js:dev",
        python: "agentpod/python:dev",
        go: "agentpod/go:dev",
        rust: "agentpod/rust:dev",
        fullstack: "agentpod/fullstack:dev",
        polyglot: "agentpod/polyglot:dev",
      };
      
      // Fall back to glibc-based images (NOT Alpine - OpenCode requires glibc)
      // These don't have OpenCode pre-installed but can have it installed
      const devFlavorImages: Record<string, string> = {
        js: "node:20-bookworm-slim",
        python: "python:3.12-slim-bookworm",
        go: "golang:1.22-bookworm",
        rust: "rust:1.75-slim-bookworm",
        fullstack: "node:20-bookworm-slim",
        polyglot: "debian:bookworm-slim",
      };
      
      // Check if local agentpod image exists (async would be better but keeping simple)
      const localImage = localAgentpodImages[flavor] ?? localAgentpodImages["fullstack"];
      const fallbackImage = devFlavorImages[flavor] ?? devFlavorImages["fullstack"];
      
      log.debug("Using development image", { 
        flavor, 
        localImage,
        fallbackImage,
        note: "Use 'docker build -t agentpod/fullstack:dev docker/base' to build local image with OpenCode"
      });
      
      // For now, use fallback glibc images since we can't do async image check here
      // TODO: Add async check or config flag for using local agentpod images
      return fallbackImage as string;
    }

    // Production: use registry images
    const flavorImages: Record<string, string> = {
      js: "codeopen-js",
      python: "codeopen-python",
      go: "codeopen-go",
      rust: "codeopen-rust",
      fullstack: "codeopen-fullstack",
      polyglot: "codeopen-polyglot",
    };

    const imageName = flavorImages[flavor] ?? flavorImages.fullstack;
    return `${config.registry.url}/${config.registry.owner}/${imageName}:${config.registry.version}`;
  }

  /**
   * Get resource limits for a tier
   */
  private getResourcesForTier(tier: string) {
    const tierResources: Record<string, { cpus: string; memory: string; pidsLimit?: number }> = {
      starter: { cpus: "0.5", memory: "512m", pidsLimit: 128 },
      builder: { cpus: "1", memory: "2g", pidsLimit: 256 },
      creator: { cpus: "2", memory: "4g", pidsLimit: 512 },
      power: { cpus: "4", memory: "8g", pidsLimit: 1024 },
    };

    return tierResources[tier] ?? tierResources.builder;
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let sandboxManagerInstance: SandboxManager | null = null;

/**
 * Get the sandbox manager singleton instance
 */
export function getSandboxManager(): SandboxManager {
  if (!sandboxManagerInstance) {
    sandboxManagerInstance = new SandboxManager();
  }
  return sandboxManagerInstance;
}
