/**
 * Sandbox Manager Service
 *
 * High-level service that coordinates:
 * - Database (source of truth for sandbox metadata)
 * - Docker orchestrator (container lifecycle)
 * - Git backend (repository management)
 * - Configuration service (agentpod.toml parsing)
 *
 * Architecture:
 * - Database is the primary source of truth for sandbox metadata
 * - Docker containers are managed based on DB state
 * - Container IDs, status, and URLs are synced back to DB
 *
 * This replaces the old project-manager.ts which used Coolify + Forgejo.
 */

import { nanoid } from "nanoid";
import { config } from "../config.ts";
import { db } from "../db/drizzle";
import { settings } from "../db/schema/settings";
import { eq } from "drizzle-orm";
import { DockerOrchestrator } from "./orchestrator/docker.ts";
import { FileSystemGitBackend } from "./git/filesystem.ts";
import {
  loadOrDetectConfig,
  configToContainerSpec,
  createMinimalContainerSpec,
} from "./config/index.ts";
import type { Sandbox as DockerSandbox, SandboxConfig, SandboxStats, SandboxStatus as DockerStatus, InteractiveExecOptions, InteractiveExecSession } from "./orchestrator/types.ts";
import type { Repository } from "./git/types.ts";
import { createLogger } from "../utils/logger.ts";
import { buildOpenCodeAuthJson } from "../models/provider.ts";
import { getUserOpencodeFullConfig } from "../models/user-opencode-config.ts";
import * as SandboxModel from "../models/sandbox.ts";
import type { Sandbox as DbSandbox, SandboxStatus as DbSandboxStatus } from "../models/sandbox.ts";
import { getOpenCodeSyncService } from "./sync/opencode-sync.ts";
import { onboardingService } from "./onboarding-service.ts";

const log = createLogger("sandbox-manager");

// =============================================================================
// Type Mapping & Types
// =============================================================================

/**
 * Maps Docker container status to database sandbox status
 */
function dockerStatusToDbStatus(dockerStatus: DockerStatus): DbSandboxStatus {
  const statusMap: Record<DockerStatus, DbSandboxStatus> = {
    creating: 'starting',
    running: 'running',
    stopped: 'stopped',
    paused: 'stopped',
    restarting: 'starting',
    removing: 'stopping',
    exited: 'stopped',
    dead: 'error',
    error: 'error',
    unknown: 'error',
  };
  return statusMap[dockerStatus] ?? 'error';
}

/**
 * Combined sandbox type that includes both DB metadata and Docker runtime info
 * This is what the API returns to clients
 */
export interface Sandbox extends DbSandbox {
  // URLs object for backward compatibility with orchestrator types
  urls: {
    opencode?: string;
    codeServer?: string;
    vnc?: string;
    homepage?: string;
    acpGateway?: string;
    [service: string]: string | undefined;
  };
  
  // Additional Docker runtime info (not stored in DB, enriched at runtime)
  image?: string;
  labels?: Record<string, string>;
  health?: {
    status: "healthy" | "unhealthy" | "starting" | "none";
    failingStreak: number;
    lastCheck?: Date;
  };
  startedAt?: Date;
}

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
  private migrationChecked = false;

  constructor() {
    // Initialize Docker orchestrator
    this.orchestrator = new DockerOrchestrator({
      socketPath: config.docker.socketPath,
      host: config.docker.host || undefined,
      port: config.docker.port,
      containerPrefix: config.docker.containerPrefix,
      defaultNetwork: config.docker.network,
      // Host path prefix for bind mounts (when API runs in Docker)
      hostPathPrefix: config.data.hostPathPrefix || undefined,
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
  // Migration from Docker labels to Database
  // ===========================================================================

  /**
   * Check if Docker-to-DB migration is needed and run it
   * This is called lazily on first sandbox operation
   */
  private async checkAndRunMigration(): Promise<void> {
    if (this.migrationChecked) return;
    this.migrationChecked = true;

    try {
      // Check if migration is pending
      const [result] = await db
        .select()
        .from(settings)
        .where(eq(settings.key, 'docker_sandbox_migration_pending'));

      if (result?.value !== 'true') {
        return; // Migration already done or not needed
      }

      log.info("Running Docker-to-DB sandbox migration");
      await this.migrateDockerSandboxesToDb();

      // Mark migration as complete
      await db
        .update(settings)
        .set({ value: 'false', updatedAt: new Date() })
        .where(eq(settings.key, 'docker_sandbox_migration_pending'));
      log.info("Docker-to-DB sandbox migration complete");
    } catch (error) {
      log.error("Docker-to-DB migration failed", { error });
      // Don't throw - allow operations to continue
    }
  }

  /**
   * Migrate existing Docker containers (with agentpod labels) to the database
   */
  private async migrateDockerSandboxesToDb(): Promise<void> {
    const dockerSandboxes = await this.orchestrator.listSandboxes({});
    let migrated = 0;

    for (const dockerSandbox of dockerSandboxes) {
      const labels = dockerSandbox.labels ?? {};
      const sandboxId = labels["agentpod.sandbox.id"];
      const userId = labels["agentpod.sandbox.user"];

      if (!sandboxId || !userId) {
        log.debug("Skipping container without agentpod labels", { containerId: dockerSandbox.containerId });
        continue;
      }

      // Check if already in database
      const existing = await SandboxModel.getSandboxById(sandboxId);
      if (existing) {
        // Update container info if changed
        if (existing.containerId !== dockerSandbox.containerId || existing.status !== dockerStatusToDbStatus(dockerSandbox.status)) {
          await SandboxModel.updateSandbox(sandboxId, {
            containerId: dockerSandbox.containerId,
            containerName: labels["agentpod.sandbox.name"],
            status: dockerStatusToDbStatus(dockerSandbox.status),
            opencodeUrl: dockerSandbox.urls.opencode,
            vncUrl: dockerSandbox.urls.vnc,
            codeServerUrl: dockerSandbox.urls.codeServer,
          });
        }
        continue;
      }

      // Create new DB record from Docker labels
      try {
        await SandboxModel.createSandbox({
          id: sandboxId,
          userId,
          name: labels["agentpod.sandbox.name"] ?? `Sandbox ${sandboxId}`,
          slug: labels["agentpod.sandbox.slug"] ?? sandboxId,
          description: undefined,
          repoName: labels["agentpod.sandbox.repo"] ?? `repo-${sandboxId}`,
          githubUrl: labels["agentpod.sandbox.github"],
          resourceTierId: 'starter', // Default, not stored in labels
          flavorId: 'fullstack', // Default, not stored in labels
          addonIds: ['code-server'], // Default
        });

        // Update with container runtime info
        await SandboxModel.updateSandbox(sandboxId, {
          containerId: dockerSandbox.containerId,
          containerName: labels["agentpod.sandbox.name"],
          status: dockerStatusToDbStatus(dockerSandbox.status),
          opencodeUrl: dockerSandbox.urls.opencode,
          vncUrl: dockerSandbox.urls.vnc,
          codeServerUrl: dockerSandbox.urls.codeServer,
        });

        migrated++;
        log.info("Migrated sandbox from Docker to DB", { sandboxId, userId });
      } catch (error) {
        log.warn("Failed to migrate sandbox", { sandboxId, error });
      }
    }

    log.info("Docker-to-DB migration complete", { migrated, total: dockerSandboxes.length });
  }

  // ===========================================================================
  // Helper: Enrich DB sandbox with Docker runtime info
  // ===========================================================================

  /**
   * Enrich a DB sandbox with live Docker container info
   */
  private async enrichSandboxWithDocker(dbSandbox: DbSandbox): Promise<Sandbox> {
    // Build the urls object from DB fields
    const sandbox: Sandbox = {
      ...dbSandbox,
      urls: {
        opencode: dbSandbox.opencodeUrl,
        codeServer: dbSandbox.codeServerUrl,
        vnc: dbSandbox.vncUrl,
        acpGateway: dbSandbox.acpGatewayUrl,
      },
    };

    if (dbSandbox.containerId) {
      try {
        const dockerSandbox = await this.orchestrator.getSandbox(dbSandbox.id);
        if (dockerSandbox) {
          sandbox.image = dockerSandbox.image;
          sandbox.labels = dockerSandbox.labels;
          sandbox.health = dockerSandbox.health;
          sandbox.startedAt = dockerSandbox.startedAt;

          // Sync status if different
          const currentDbStatus = dockerStatusToDbStatus(dockerSandbox.status);
          if (dbSandbox.status !== currentDbStatus) {
            await SandboxModel.updateSandboxStatus(dbSandbox.id, currentDbStatus);
            sandbox.status = currentDbStatus;
          }

          // Update URLs if changed
          if (dockerSandbox.urls.opencode !== dbSandbox.opencodeUrl ||
              dockerSandbox.urls.vnc !== dbSandbox.vncUrl ||
              dockerSandbox.urls.codeServer !== dbSandbox.codeServerUrl) {
            await SandboxModel.updateSandbox(dbSandbox.id, {
              opencodeUrl: dockerSandbox.urls.opencode,
              vncUrl: dockerSandbox.urls.vnc,
              codeServerUrl: dockerSandbox.urls.codeServer,
            });
            sandbox.opencodeUrl = dockerSandbox.urls.opencode;
            sandbox.vncUrl = dockerSandbox.urls.vnc;
            sandbox.codeServerUrl = dockerSandbox.urls.codeServer;
          }
        }
      } catch (error) {
        log.debug("Failed to get Docker info for sandbox", { sandboxId: dbSandbox.id, error });
      }
    }

    return sandbox;
  }

  // ===========================================================================
  // Sandbox Lifecycle
  // ===========================================================================

  /**
   * Create a new sandbox with a Git repository and container
   * Creates DB record first, then Docker container
   */
  async createSandbox(options: CreateSandboxOptions): Promise<SandboxWithRepo> {
    await this.checkAndRunMigration();

    const {
      name,
      description,
      githubUrl,
      userId,
      flavor = "fullstack",
      resourceTier = "starter",
      addons = ["code-server"],
      autoStart = false,
    } = options;

    // Generate unique sandbox ID and slug
    const sandboxId = nanoid(12);
    const slug = await SandboxModel.generateUniqueSlug(userId, name);
    const repoName = `${slug}-${sandboxId}`;

    log.info("Creating sandbox", { sandboxId, name, slug, githubUrl, userId });

    // Step 1: Create or clone the repository
    let repository: Repository;

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

    // Step 2: Create DB record (before Docker container)
    let dbSandbox: DbSandbox;
    try {
      dbSandbox = await SandboxModel.createSandbox({
        id: sandboxId,
        userId,
        name,
        slug,
        description,
        repoName,
        githubUrl,
        resourceTierId: resourceTier,
        flavorId: flavor,
        addonIds: addons,
      });
      log.info("Created sandbox DB record", { sandboxId });
    } catch (error) {
      // Cleanup repository on failure
      log.error("Failed to create sandbox DB record, cleaning up repository", { error });
      try {
        await this.gitBackend.deleteRepo(repoName);
      } catch (cleanupError) {
        log.warn("Failed to cleanup repository", { cleanupError });
      }
      throw new Error(`Failed to create sandbox: ${error instanceof Error ? error.message : "Unknown error"}`);
    }

    // Step 2.5: Create onboarding session for new sandbox
    let onboardingSessionId: string | undefined;
    try {
      const session = await onboardingService.create({
        userId,
        sandboxId,
      });
      onboardingSessionId = session.id;
      log.info("Created onboarding session", { sandboxId, sessionId: session.id });
    } catch (error) {
      log.warn("Failed to create onboarding session", { sandboxId, error });
      // Don't fail sandbox creation if onboarding session fails
    }

    // Step 3: Load or detect configuration
    const configResult = await loadOrDetectConfig(repository.path);
    if (!configResult.valid) {
      log.warn("Configuration validation failed", { errors: configResult.errors });
    }

    // Step 4: Create container specification
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
    containerSpec.image = this.getImageForFlavor(flavor);
    const tierResources = this.getResourcesForTier(resourceTier);
    containerSpec.resources = {
      ...containerSpec.resources,
      ...tierResources,
    };

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

    // Step 5: Inject OpenCode configuration
    try {
      const authJson = await buildOpenCodeAuthJson(userId);
      if (authJson && authJson !== "{}") {
        containerSpec.env = {
          ...containerSpec.env,
          OPENCODE_AUTH_JSON: authJson,
        };
        log.debug("Injected OpenCode auth configuration");
      }

      const userConfig = await getUserOpencodeFullConfig(userId);
      if (userConfig) {
        containerSpec.env = {
          ...containerSpec.env,
          OPENCODE_USER_CONFIG: JSON.stringify(userConfig),
        };
        log.debug("Injected user OpenCode configuration", {
          hasSettings: !!userConfig.settings,
          hasAgentsMd: !!userConfig.agents_md,
          filesCount: userConfig.files?.length ?? 0,
        });
      }
    } catch (configError) {
      log.warn("Failed to build OpenCode config, continuing without it", { error: configError });
    }

    // Step 5.5: Add onboarding environment variables
    if (onboardingSessionId) {
      containerSpec.env = {
        ...containerSpec.env,
        ONBOARDING_MODE: "true",
        ONBOARDING_SESSION_ID: onboardingSessionId,
        MANAGEMENT_API_URL: config.publicUrl,
      };
      log.debug("Added onboarding environment variables", {
        sessionId: onboardingSessionId,
        apiUrl: config.publicUrl,
      });
    }

    // Step 6: Create the Docker container
    let dockerSandbox: DockerSandbox;
    try {
      log.info("Creating container", { sandboxId, image: containerSpec.image });
      await SandboxModel.updateSandboxStatus(sandboxId, 'starting');
      dockerSandbox = await this.orchestrator.createSandbox(containerSpec);
      log.info("Container created", { sandboxId, containerId: dockerSandbox.containerId });
    } catch (error) {
      // Update DB status to error, cleanup repository
      log.error("Failed to create container", { error });
      await SandboxModel.updateSandboxStatus(sandboxId, 'error', error instanceof Error ? error.message : "Container creation failed");
      
      try {
        await this.gitBackend.deleteRepo(repoName);
        await SandboxModel.deleteSandbox(sandboxId);
      } catch (cleanupError) {
        log.warn("Failed to cleanup after container creation failure", { cleanupError });
      }
      throw new Error(`Failed to create container: ${error instanceof Error ? error.message : "Unknown error"}`);
    }

    // Step 7: Update DB with container info
    await SandboxModel.updateSandbox(sandboxId, {
      containerId: dockerSandbox.containerId,
      containerName: dockerSandbox.name,
      status: dockerStatusToDbStatus(dockerSandbox.status),
      opencodeUrl: dockerSandbox.urls.opencode,
      vncUrl: dockerSandbox.urls.vnc,
      codeServerUrl: dockerSandbox.urls.codeServer,
    });

    // Step 8: Start if requested
    if (autoStart) {
      try {
        await this.orchestrator.startSandbox(sandboxId);
        await SandboxModel.updateSandboxStatus(sandboxId, 'running');
        log.info("Container started", { sandboxId });
        
        // Start sync service for this sandbox
        try {
          await getOpenCodeSyncService().startSync(sandboxId);
        } catch (syncError) {
          log.warn("Failed to start sync for sandbox", { sandboxId, error: syncError });
          // Don't fail the creation if sync fails
        }
      } catch (error: unknown) {
        // Check if container is already started (304 status code)
        const errObj = error as Record<string, unknown> | null;
        const isAlreadyStarted = errObj && (
          errObj.statusCode === 304 ||
          (typeof errObj.reason === 'string' && errObj.reason.includes('already started'))
        );
        
        if (isAlreadyStarted) {
          // Container already running, this is fine
          log.info("Container already started", { sandboxId });
          await SandboxModel.updateSandboxStatus(sandboxId, 'running');
          
          // Start sync service for this sandbox
          try {
            await getOpenCodeSyncService().startSync(sandboxId);
          } catch (syncError) {
            log.warn("Failed to start sync for sandbox", { sandboxId, error: syncError });
          }
        } else {
          log.warn("Failed to auto-start container", { sandboxId, error });
          await SandboxModel.updateSandboxStatus(sandboxId, 'error', 'Failed to auto-start');
        }
      }
    } else {
      await SandboxModel.updateSandboxStatus(sandboxId, 'stopped');
    }

    // Get final sandbox state
    const finalSandbox = await SandboxModel.getSandboxById(sandboxId);
    if (!finalSandbox) {
      throw new Error("Sandbox created but not found in database");
    }

    const sandbox = await this.enrichSandboxWithDocker(finalSandbox);
    return { sandbox, repository };
  }

  /**
   * Start a sandbox container
   */
  async startSandbox(sandboxId: string): Promise<void> {
    await this.checkAndRunMigration();
    log.info("Starting sandbox", { sandboxId });

    const dbSandbox = await SandboxModel.getSandboxById(sandboxId);
    if (!dbSandbox) {
      throw new Error(`Sandbox not found: ${sandboxId}`);
    }

    await SandboxModel.updateSandboxStatus(sandboxId, 'starting');
    
    try {
      await this.orchestrator.startSandbox(sandboxId);
      await SandboxModel.updateSandboxStatus(sandboxId, 'running');
      await SandboxModel.touchSandbox(sandboxId);
      
      // Start sync service for this sandbox
      try {
        await getOpenCodeSyncService().startSync(sandboxId);
      } catch (syncError) {
        log.warn("Failed to start sync for sandbox", { sandboxId, error: syncError });
        // Don't fail the start if sync fails
      }
    } catch (error) {
      await SandboxModel.updateSandboxStatus(sandboxId, 'error', error instanceof Error ? error.message : 'Start failed');
      throw error;
    }
  }

  /**
   * Stop a sandbox container
   */
  async stopSandbox(sandboxId: string, timeout?: number): Promise<void> {
    await this.checkAndRunMigration();
    log.info("Stopping sandbox", { sandboxId, timeout });

    const dbSandbox = await SandboxModel.getSandboxById(sandboxId);
    if (!dbSandbox) {
      throw new Error(`Sandbox not found: ${sandboxId}`);
    }

    // Stop sync service before stopping container
    try {
      getOpenCodeSyncService().stopSync(sandboxId);
    } catch (syncError) {
      log.warn("Failed to stop sync for sandbox", { sandboxId, error: syncError });
      // Don't fail the stop if sync stop fails
    }

    await SandboxModel.updateSandboxStatus(sandboxId, 'stopping');
    
    try {
      await this.orchestrator.stopSandbox(sandboxId, timeout);
      await SandboxModel.updateSandboxStatus(sandboxId, 'stopped');
    } catch (error) {
      await SandboxModel.updateSandboxStatus(sandboxId, 'error', error instanceof Error ? error.message : 'Stop failed');
      throw error;
    }
  }

  /**
   * Restart a sandbox container
   */
  async restartSandbox(sandboxId: string, timeout?: number): Promise<void> {
    await this.checkAndRunMigration();
    log.info("Restarting sandbox", { sandboxId });

    const dbSandbox = await SandboxModel.getSandboxById(sandboxId);
    if (!dbSandbox) {
      throw new Error(`Sandbox not found: ${sandboxId}`);
    }

    await SandboxModel.updateSandboxStatus(sandboxId, 'starting');
    
    try {
      await this.orchestrator.restartSandbox(sandboxId, timeout);
      await SandboxModel.updateSandboxStatus(sandboxId, 'running');
      await SandboxModel.touchSandbox(sandboxId);
    } catch (error) {
      await SandboxModel.updateSandboxStatus(sandboxId, 'error', error instanceof Error ? error.message : 'Restart failed');
      throw error;
    }
  }

  /**
   * Pause a sandbox container
   */
  async pauseSandbox(sandboxId: string): Promise<void> {
    await this.checkAndRunMigration();
    log.info("Pausing sandbox", { sandboxId });

    if (!(await SandboxModel.getSandboxById(sandboxId))) {
      throw new Error(`Sandbox not found: ${sandboxId}`);
    }

    await this.orchestrator.pauseSandbox(sandboxId);
    await SandboxModel.updateSandboxStatus(sandboxId, 'stopped');
  }

  /**
   * Unpause a sandbox container
   */
  async unpauseSandbox(sandboxId: string): Promise<void> {
    await this.checkAndRunMigration();
    log.info("Unpausing sandbox", { sandboxId });

    const dbSandbox = await SandboxModel.getSandboxById(sandboxId);
    if (!dbSandbox) {
      throw new Error(`Sandbox not found: ${sandboxId}`);
    }

    await this.orchestrator.unpauseSandbox(sandboxId);
    await SandboxModel.updateSandboxStatus(sandboxId, 'running');
    await SandboxModel.touchSandbox(sandboxId);
  }

  /**
   * Delete a sandbox and its repository
   */
  async deleteSandbox(
    sandboxId: string,
    options: { deleteRepo?: boolean; removeVolumes?: boolean } = {}
  ): Promise<void> {
    await this.checkAndRunMigration();
    const { deleteRepo = true, removeVolumes = false } = options;

    log.info("Deleting sandbox", { sandboxId, deleteRepo, removeVolumes });

    // Stop sync service before deleting
    try {
      getOpenCodeSyncService().stopSync(sandboxId);
    } catch (syncError) {
      log.warn("Failed to stop sync for sandbox", { sandboxId, error: syncError });
      // Don't fail the delete if sync stop fails
    }

    // Get sandbox from DB (source of truth)
    const dbSandbox = await SandboxModel.getSandboxById(sandboxId);
    const repoName = dbSandbox?.repoName;

    // Delete container
    try {
      await this.orchestrator.deleteSandbox(sandboxId, removeVolumes);
      log.info("Container deleted", { sandboxId });
    } catch (error) {
      log.warn("Failed to delete container (may not exist)", { sandboxId, error });
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

    // Delete from database
    if (dbSandbox) {
      await SandboxModel.deleteSandbox(sandboxId);
      log.info("Sandbox DB record deleted", { sandboxId });
    }
  }

  // ===========================================================================
  // Sandbox Information
  // ===========================================================================

  /**
   * Get sandbox by ID (from DB, enriched with Docker info)
   */
  async getSandbox(sandboxId: string): Promise<Sandbox | null> {
    await this.checkAndRunMigration();
    
    const dbSandbox = await SandboxModel.getSandboxById(sandboxId);
    if (!dbSandbox) return null;

    return this.enrichSandboxWithDocker(dbSandbox);
  }

  /**
   * Get sandbox with associated repository info
   */
  async getSandboxInfo(sandboxId: string): Promise<SandboxInfo | null> {
    await this.checkAndRunMigration();
    
    const dbSandbox = await SandboxModel.getSandboxById(sandboxId);
    if (!dbSandbox) return null;

    const sandbox = await this.enrichSandboxWithDocker(dbSandbox);
    let repository: Repository | null = null;
    let sandboxConfig: Record<string, unknown> | null = null;

    if (dbSandbox.repoName) {
      repository = await this.gitBackend.getRepo(dbSandbox.repoName);
      if (repository) {
        const configResult = await loadOrDetectConfig(repository.path);
        if (configResult.config) {
          sandboxConfig = configResult.config as unknown as Record<string, unknown>;
        }
      }
    }

    // Update last accessed
    await SandboxModel.touchSandbox(sandboxId);

    return { sandbox, repository, config: sandboxConfig };
  }

  /**
   * List all sandboxes (from DB, enriched with Docker info)
   */
  async listSandboxes(filter?: {
    userId?: string;
    status?: string | string[];
  }): Promise<Sandbox[]> {
    await this.checkAndRunMigration();

    let dbSandboxes: DbSandbox[];

    if (filter?.userId) {
      dbSandboxes = await SandboxModel.listSandboxesByUserId(filter.userId);
    } else {
      dbSandboxes = await SandboxModel.listAllSandboxes();
    }

    // Filter by status if provided
    if (filter?.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      dbSandboxes = dbSandboxes.filter(s => statuses.includes(s.status));
    }

    // Enrich with Docker info (in parallel for performance)
    const sandboxes = await Promise.all(
      dbSandboxes.map(s => this.enrichSandboxWithDocker(s))
    );

    return sandboxes;
  }

  /**
   * Get sandbox status
   */
  async getSandboxStatus(sandboxId: string) {
    await this.checkAndRunMigration();
    
    const dbSandbox = await SandboxModel.getSandboxById(sandboxId);
    if (!dbSandbox) {
      throw new Error(`Sandbox not found: ${sandboxId}`);
    }

    // Get live status from Docker
    return this.orchestrator.getSandboxStatus(sandboxId);
  }

  /**
   * Get sandbox resource stats
   */
  async getSandboxStats(sandboxId: string): Promise<SandboxStats> {
    await this.checkAndRunMigration();
    
    const dbSandbox = await SandboxModel.getSandboxById(sandboxId);
    if (!dbSandbox) {
      throw new Error(`Sandbox not found: ${sandboxId}`);
    }

    return this.orchestrator.getSandboxStats(sandboxId);
  }

  /**
   * Get sandbox logs
   */
  async getSandboxLogs(
    sandboxId: string,
    options?: { tail?: number; since?: Date; timestamps?: boolean }
  ): Promise<string> {
    await this.checkAndRunMigration();
    
    const dbSandbox = await SandboxModel.getSandboxById(sandboxId);
    if (!dbSandbox) {
      throw new Error(`Sandbox not found: ${sandboxId}`);
    }

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
    await this.checkAndRunMigration();
    
    const dbSandbox = await SandboxModel.getSandboxById(sandboxId);
    if (!dbSandbox) {
      throw new Error(`Sandbox not found: ${sandboxId}`);
    }

    return this.orchestrator.exec(sandboxId, command, options);
  }

  /**
   * Start an interactive terminal session in a sandbox
   */
  async execInteractive(
    sandboxId: string,
    options?: InteractiveExecOptions
  ): Promise<InteractiveExecSession> {
    await this.checkAndRunMigration();

    const dbSandbox = await SandboxModel.getSandboxById(sandboxId);
    if (!dbSandbox) {
      throw new Error(`Sandbox not found: ${sandboxId}`);
    }

    return this.orchestrator.execInteractive(sandboxId, options);
  }

  /**
   * Detect available shell in a sandbox container
   */
  async detectShell(sandboxId: string): Promise<string> {
    await this.checkAndRunMigration();

    const dbSandbox = await SandboxModel.getSandboxById(sandboxId);
    if (!dbSandbox) {
      throw new Error(`Sandbox not found: ${sandboxId}`);
    }

    return this.orchestrator.detectShell(sandboxId);
  }

  // ===========================================================================
  // Repository Operations
  // ===========================================================================

  /**
   * Get repository for a sandbox
   */
  async getRepository(sandboxId: string): Promise<Repository | null> {
    await this.checkAndRunMigration();
    
    const dbSandbox = await SandboxModel.getSandboxById(sandboxId);
    if (!dbSandbox) return null;

    return this.gitBackend.getRepo(dbSandbox.repoName);
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
   * Get Docker image for a flavor
   */
  private getImageForFlavor(flavor: string): string {
    const flavorImages: Record<string, string> = {
      js: "codeopen-js",
      python: "codeopen-python",
      go: "codeopen-go",
      rust: "codeopen-rust",
      fullstack: "codeopen-fullstack",
      polyglot: "codeopen-polyglot",
    };

    const imageName = flavorImages[flavor] ?? flavorImages.fullstack;

    // In development mode, use local images with :latest or :dev tag
    if (config.nodeEnv === "development") {
      // Try local image with version tag first, fallback to latest
      const devImage = `${imageName}:${config.registry.version}`;
      
      log.debug("Using development image", { 
        flavor, 
        image: devImage,
      });
      
      return devImage;
    }

    // Production: use registry images
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
