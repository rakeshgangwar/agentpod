/**
 * Project Manager Service
 * Handles high-level project orchestration:
 * - Creating projects (Forgejo repo + Coolify app)
 * - Starting/stopping containers
 * - Injecting LLM credentials
 * - Deleting projects and cleaning up resources
 */

import { config } from '../config.ts';
import { coolify } from './coolify.ts';
import { forgejo } from './forgejo.ts';
import {
  createProject as dbCreateProject,
  getProjectById,
  listProjects,
  updateProject,
  updateProjectStatus,
  deleteProject as dbDeleteProject,
  generateUniqueSlug,
  type Project,
  type CreateProjectInput,
} from '../models/project.ts';
import { getProviderEnvVars, getSetting } from '../models/provider.ts';
import { 
  getTierById, 
  getDefaultTier, 
  getImageNameForTier,
  getResourceLimitsForTier,
  getExposedPortsForTier,
  type ContainerTier,
} from '../models/container-tier.ts';
import {
  resolveImage,
  validateContainerConfig,
} from './image-resolver.ts';
import { createLogger } from '../utils/logger.ts';
import { ProjectCreationError, ProjectNotFoundError } from '../utils/errors.ts';

const log = createLogger('project-manager');

// =============================================================================
// OpenCode Dockerfile (embedded to avoid git URL issues with Coolify)
// =============================================================================

// Base64 encoded entrypoint script to avoid escaping issues
// The script sets up platform defaults, fetches user config, auth, clones repo, and starts opencode
const ENTRYPOINT_SCRIPT = `#!/bin/bash
set -e

echo "=== OpenCode Container Starting ==="

# Platform defaults (Layer 1)
echo "Layer 1: Platform defaults from ~/.config/opencode/"
cat ~/.config/opencode/opencode.json | jq -c . 2>/dev/null || echo "(parse error)"

# Setup directories
OPENCODE_DATA_DIR="\$HOME/.local/share/opencode"
AUTH_FILE="\$OPENCODE_DATA_DIR/auth.json"
USER_CONFIG_FILE="/app/user-config.json"
USER_CONFIG_DIR="/app/user-config-dir"
mkdir -p "\$OPENCODE_DATA_DIR" "\$USER_CONFIG_DIR"/{agent,command,tool,plugin}

# Auth configuration
if [ -n "\$OPENCODE_AUTH_JSON" ]; then
    echo "Writing auth.json from OPENCODE_AUTH_JSON..."
    echo "\$OPENCODE_AUTH_JSON" > "\$AUTH_FILE"
    echo "Providers: \$(cat \$AUTH_FILE | jq -c keys 2>/dev/null || echo unknown)"
else
    echo "No OPENCODE_AUTH_JSON provided."
    echo "{}" > "\$AUTH_FILE"
fi

# Fetch user config from Management API (Layer 3 & 4)
if [ -n "\$MANAGEMENT_API_URL" ] && [ -n "\$USER_ID" ]; then
    echo "Fetching user config from Management API..."
    
    max_retries=3
    retry_delay=2
    
    for i in \$(seq 1 \$max_retries); do
        if curl -sf "\$MANAGEMENT_API_URL/api/users/\$USER_ID/opencode/config" \\
            -H "Authorization: Bearer \$AUTH_TOKEN" \\
            -o /tmp/user-config.json 2>/dev/null; then
            
            # Extract settings (Layer 3)
            jq -r '.settings // {}' /tmp/user-config.json > "\$USER_CONFIG_FILE"
            echo "Layer 3: User settings loaded"
            cat "\$USER_CONFIG_FILE" | jq -c . 2>/dev/null || echo "{}"
            
            # Write AGENTS.md if present - goes to ~/.config/opencode/ for global rules
            agents_md=\$(jq -r '.agents_md // empty' /tmp/user-config.json)
            if [ -n "\$agents_md" ] && [ "\$agents_md" != "null" ]; then
                echo "\$agents_md" > /root/.config/opencode/AGENTS.md
                echo "User AGENTS.md loaded to ~/.config/opencode/"
            fi
            
            # Write agent files (Layer 4)
            jq -r '.files[]? | select(.type=="agent") | "\\(.name).\\(.extension) \\(.content)"' /tmp/user-config.json 2>/dev/null | \\
                while read -r filename content; do
                    [ -n "\$filename" ] && echo "\$content" > "\$USER_CONFIG_DIR/agent/\$filename"
                done
            
            # Write command files
            jq -r '.files[]? | select(.type=="command") | "\\(.name).\\(.extension) \\(.content)"' /tmp/user-config.json 2>/dev/null | \\
                while read -r filename content; do
                    [ -n "\$filename" ] && echo "\$content" > "\$USER_CONFIG_DIR/command/\$filename"
                done
            
            rm -f /tmp/user-config.json
            export OPENCODE_CONFIG="\$USER_CONFIG_FILE"
            export OPENCODE_CONFIG_DIR="\$USER_CONFIG_DIR"
            echo "Layer 4: User config dir set to \$USER_CONFIG_DIR"
            break
        fi
        
        echo "Attempt \$i/\$max_retries failed, retrying in \${retry_delay}s..."
        sleep \$retry_delay
        retry_delay=\$((retry_delay * 2))
    done
else
    echo "No MANAGEMENT_API_URL or USER_ID set, skipping user config"
    echo "{}" > "\$USER_CONFIG_FILE"
fi

# Clone repository (Layer 2 - project config)
if [ ! -d "/workspace/.git" ] && [ -n "\$FORGEJO_REPO_URL" ]; then
    echo "Layer 2: Cloning repository from Forgejo..."
    if [ -n "\$FORGEJO_USER" ] && [ -n "\$FORGEJO_TOKEN" ]; then
        REPO_URL_WITH_AUTH=\$(echo "\$FORGEJO_REPO_URL" | sed "s|://|://\$FORGEJO_USER:\$FORGEJO_TOKEN@|")
        git clone "\$REPO_URL_WITH_AUTH" /workspace
    else
        git clone "\$FORGEJO_REPO_URL" /workspace
    fi
    echo "Repository cloned."
elif [ -d "/workspace/.git" ]; then
    echo "Layer 2: Existing git repository found."
else
    echo "Layer 2: No repository URL provided."
fi

# Git configuration
git config --global user.email "\${GIT_USER_EMAIL:-opencode@local}"
git config --global user.name "\${GIT_USER_NAME:-OpenCode}"
git config --global --add safe.directory /workspace

# Summary
echo "=== Configuration Summary ==="
echo "Layer 1 (Platform): ~/.config/opencode/opencode.json"
echo "Layer 2 (Project):  /workspace/.opencode/"
echo "Layer 3 (User):     \$OPENCODE_CONFIG"
echo "Layer 4 (User Dir): \$OPENCODE_CONFIG_DIR"
echo "Port: \${OPENCODE_PORT:-4096}"
echo "============================="

cd /workspace
echo "Starting OpenCode server..."
exec opencode serve --port "\${OPENCODE_PORT:-4096}" --hostname "\${OPENCODE_HOST:-0.0.0.0}"
`;

// Base64 encode the script
const ENTRYPOINT_BASE64 = Buffer.from(ENTRYPOINT_SCRIPT).toString('base64');

const OPENCODE_DOCKERFILE = `FROM node:20-slim

# Install required packages (including jq for JSON parsing, wget for Coolify healthcheck fallback)
RUN apt-get update && \\
    apt-get install -y git curl wget jq && \\
    rm -rf /var/lib/apt/lists/*

# Install OpenCode globally
RUN npm install -g opencode-ai

# Create workspace and config directories
WORKDIR /workspace
RUN mkdir -p /root/.config/opencode

# Environment variables (will be overridden by Coolify env vars)
ENV OPENCODE_PORT=4096
ENV OPENCODE_HOST=0.0.0.0

# Create platform defaults in ~/.config/opencode/ (Layer 1 - lowest priority)
# These provide secure baseline settings for all containers
RUN echo '{"autoupdate":false,"share":"disabled","permission":{"bash":"ask","write":"ask","edit":"allow","webfetch":"ask","mcp":"ask","doom_loop":"ask","external_directory":"ask"}}' > /root/.config/opencode/opencode.json

# Create entrypoint script from base64
RUN echo "${ENTRYPOINT_BASE64}" | base64 -d > /entrypoint.sh && chmod +x /entrypoint.sh

# Expose OpenCode port
EXPOSE 4096

# No HEALTHCHECK - Coolify's healthcheck doesn't work well with dynamic ports
# The container is healthy when OpenCode logs "opencode server listening on..."

ENTRYPOINT ["/entrypoint.sh"]
`;

// =============================================================================
// Types
// =============================================================================

export interface CreateProjectOptions {
  name: string;
  description?: string;
  /** Import from GitHub URL (uses Forgejo mirror) */
  githubUrl?: string;
  /** Use specific LLM provider ID (defaults to default provider) */
  llmProviderId?: string;
  /** Use specific LLM model ID */
  llmModelId?: string;
  /** Container tier ID (defaults to 'lite') - DEPRECATED: use resourceTierId */
  containerTierId?: string;
  /** Resource tier ID (CPU/memory/storage): 'starter', 'builder', 'creator', 'power' */
  resourceTierId?: string;
  /** Container flavor ID (language environment): 'js', 'python', 'go', 'rust', 'fullstack', 'polyglot' */
  flavorId?: string;
  /** Container addon IDs: ['gui', 'code-server', 'databases', 'cloud', 'gpu'] */
  addonIds?: string[];
}

export interface ProjectWithStatus extends Project {
  /** Live container status from Coolify */
  containerStatus?: string;
}

// =============================================================================
// Project Creation
// =============================================================================

/**
 * Create a new project with Forgejo repo and Coolify container
 * Now uses Docker Image deployment from Forgejo Container Registry
 * Supports both legacy container-tier and new modular container configuration
 */
export async function createNewProject(options: CreateProjectOptions): Promise<Project> {
  const { 
    name, 
    description, 
    githubUrl, 
    llmProviderId, 
    llmModelId, 
    containerTierId,
    resourceTierId,
    flavorId,
    addonIds,
  } = options;
  
  log.info('Creating new project', { name, githubUrl, containerTierId, resourceTierId, flavorId, addonIds });
  
  const slug = generateUniqueSlug(name);
  const owner = config.forgejo.owner;
  
  // Determine if we're using the new modular system or legacy tier system
  const useModularSystem = resourceTierId || flavorId || addonIds;
  
  // Resolve container configuration
  let imageName: string;
  let imageTag: string;
  let exposedPorts: string;
  let resourceLimits: {
    limits_memory: string;
    limits_memory_reservation: string;
    limits_cpus: string;
  };
  let resolvedResourceTierId: string;
  let resolvedFlavorId: string;
  let resolvedAddonIds: string[];
  let tier: ContainerTier | null = null;
  
  if (useModularSystem) {
    // New modular container system
    log.info('Using modular container system');
    
    // Validate configuration first
    const validation = validateContainerConfig({
      resourceTierId,
      flavorId,
      addonIds,
    });
    
    if (!validation.valid) {
      throw new ProjectCreationError(`Invalid container configuration: ${validation.errors.join(', ')}`);
    }
    
    // Resolve image and settings
    const resolution = resolveImage({
      resourceTierId,
      flavorId,
      addonIds,
    });
    
    if (resolution.warnings.length > 0) {
      log.warn('Container resolution warnings', { warnings: resolution.warnings });
    }
    
    imageName = resolution.imageName;
    imageTag = resolution.imageTag;
    exposedPorts = resolution.portsExposes;
    resourceLimits = resolution.resourceLimits;
    resolvedResourceTierId = resolution.resourceTier.id;
    resolvedFlavorId = resolution.flavor.id;
    resolvedAddonIds = resolution.addons.map(a => a.id);
    
    log.info('Resolved modular container', {
      imageName,
      imageTag,
      resourceTier: resolvedResourceTierId,
      flavor: resolvedFlavorId,
      addons: resolvedAddonIds,
      exposedPorts,
    });
  } else {
    // Legacy container tier system
    log.info('Using legacy container tier system');
    
    tier = containerTierId 
      ? getTierById(containerTierId) 
      : getDefaultTier();
    
    if (!tier) {
      throw new ProjectCreationError(`Container tier '${containerTierId || 'default'}' not found`);
    }
    
    log.info('Using container tier', { 
      tierId: tier.id, 
      tierName: tier.name, 
      imageType: tier.image_type 
    });
    
    imageName = getImageNameForTier(tier, config.registry.url, config.registry.owner);
    imageTag = config.registry.version;
    exposedPorts = getExposedPortsForTier(tier);
    resourceLimits = getResourceLimitsForTier(tier);
    
    // Map legacy tier to new fields for database storage
    resolvedResourceTierId = tier.id === 'lite' ? 'starter' 
      : tier.id === 'standard' ? 'builder'
      : tier.id === 'pro' ? 'creator'
      : tier.id === 'desktop' ? 'creator'
      : 'starter';
    resolvedFlavorId = 'fullstack';
    resolvedAddonIds = tier.has_desktop_access ? ['gui', 'code-server'] : ['code-server'];
  }
  
  let forgejoRepo;
  let coolifyApp;
  
  try {
    // Step 1: Create or mirror Forgejo repository
    log.info('Step 1: Creating Forgejo repository', { slug });
    
    if (githubUrl) {
      // Mirror from GitHub
      forgejoRepo = await forgejo.createMirror({
        cloneAddr: githubUrl,
        repoName: slug,
        mirror: false, // One-time import, not continuous mirror
        private: false,
        description: description ?? `Imported from ${githubUrl}`,
      });
    } else {
      // Create empty repo
      forgejoRepo = await forgejo.createRepo({
        name: slug,
        description: description ?? '',
        private: false,
        autoInit: true,
        defaultBranch: 'main',
      });
    }
    
    log.info('Forgejo repository created', { 
      repoId: forgejoRepo.id, 
      fullName: forgejoRepo.full_name 
    });
    
    // Step 2: Container port - use fixed port 4096
    // Each container is isolated, so no port conflicts. Traefik routes by domain.
    const containerPort = 4096;
    
    // Step 3: Generate FQDNs for the container based on addons
    let fqdnUrl: string | null = null;
    let vncUrl: string | null = null;
    let codeServerUrl: string | null = null;
    let domainsConfig: string | undefined;
    
    if (useModularSystem) {
      // Use image-resolver's URL generation for modular system
      // The addons are already resolved, so we just need to build URLs
      if (config.opencode.wildcardDomain) {
        fqdnUrl = `https://${slug}.${config.opencode.wildcardDomain}`;
        
        // Build domains config based on resolved addons
        // Coolify requires FQDN format with protocol prefix: https://domain:port
        const domains: string[] = [`https://${slug}.${config.opencode.wildcardDomain}:4096`];
        domains.push(`https://acp-${slug}.${config.opencode.wildcardDomain}:4097`);
        
        if (resolvedAddonIds.includes('code-server')) {
          codeServerUrl = `https://code-${slug}.${config.opencode.wildcardDomain}`;
          domains.push(`https://code-${slug}.${config.opencode.wildcardDomain}:8080`);
        }
        if (resolvedAddonIds.includes('gui')) {
          vncUrl = `https://vnc-${slug}.${config.opencode.wildcardDomain}`;
          domains.push(`https://vnc-${slug}.${config.opencode.wildcardDomain}:6080`);
        }
        
        domainsConfig = domains.join(',');
      }
    } else if (tier && config.opencode.wildcardDomain) {
      // Legacy tier-based URL generation
      fqdnUrl = `https://opencode-${slug}.${config.opencode.wildcardDomain}`;
      codeServerUrl = `https://code-${slug}.${config.opencode.wildcardDomain}`;
      
      if (tier.has_desktop_access) {
        vncUrl = `https://vnc-${slug}.${config.opencode.wildcardDomain}`;
        domainsConfig = `${fqdnUrl}:4096,${codeServerUrl}:8080,${vncUrl}:6080`;
      } else {
        domainsConfig = `${fqdnUrl}:4096,${codeServerUrl}:8080`;
      }
    }
    
    // Step 4: Create Coolify application using Docker Image from Forgejo Registry
    log.info('Step 2: Creating Coolify application (Docker Image)', { 
      slug, 
      fqdnUrl,
      codeServerUrl,
      vncUrl,
      domainsConfig,
      imageName,
      imageTag,
    });
    
    coolifyApp = await coolify.createDockerImageApp({
      projectUuid: config.coolify.projectUuid,
      serverUuid: config.coolify.serverUuid,
      environmentName: 'production',
      imageName: imageName,
      imageTag: imageTag,
      portsExposes: exposedPorts,
      name: `opencode-${slug}`,
      description: `OpenCode container for ${name}`,
      domains: domainsConfig,
      instantDeploy: false, // We'll set env vars first, then deploy
    });
    
    log.info('Coolify application created', { uuid: coolifyApp.uuid });
    
    // Step 4a: Update application settings with resource limits and health check
    log.info('Step 2b: Updating Coolify application settings with resource limits');
    await coolify.updateApplication(coolifyApp.uuid, {
      ports_exposes: exposedPorts,
      domains: domainsConfig,
      // Disable Coolify healthcheck for now - container has its own HEALTHCHECK
      health_check_enabled: false,
      // Apply resource limits from tier
      ...resourceLimits,
    });
    
    log.info('Coolify application settings updated', { 
      ports: exposedPorts, 
      domains: domainsConfig,
      resourceLimits,
    });
    
    // Step 5: Set environment variables
    log.info('Step 3: Setting environment variables');
    
    // Transform the clone URL to use the public HTTPS URL (accessible from containers)
    let publicCloneUrl = forgejoRepo.clone_url;
    
    if (config.forgejo.publicUrl !== config.forgejo.url) {
      publicCloneUrl = forgejoRepo.clone_url.replace(
        new RegExp(`^${config.forgejo.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
        config.forgejo.publicUrl
      );
    } else {
      publicCloneUrl = forgejoRepo.clone_url.replace(
        /^(https:\/\/[^/:]+):\d+(\/.*)/,
        '$1$2'
      );
    }
    
    log.info('Clone URL transformation', {
      original: forgejoRepo.clone_url,
      public: publicCloneUrl,
    });
    
    const envVars: Record<string, string> = {
      OPENCODE_PORT: String(containerPort),
      OPENCODE_HOST: '0.0.0.0',
      FORGEJO_REPO_URL: publicCloneUrl,
      FORGEJO_USER: config.forgejo.owner,
      FORGEJO_TOKEN: config.forgejo.token,
      GIT_USER_EMAIL: 'opencode@portable-command-center.local',
      GIT_USER_NAME: 'OpenCode',
      PROJECT_NAME: name,
      MANAGEMENT_API_URL: config.publicUrl,
      USER_ID: config.defaultUserId,
      AUTH_TOKEN: config.auth.token,
    };
    
    // Add LLM credentials
    const llmEnvVars = await getProviderEnvVars(llmProviderId);
    Object.assign(envVars, llmEnvVars);
    
    await coolify.setEnvVars(coolifyApp.uuid, envVars);
    
    log.info('Environment variables set', { 
      vars: Object.keys(envVars) 
    });
    
    // Step 6: Save to database
    log.info('Step 4: Saving project to database');
    
    const projectInput: CreateProjectInput = {
      name,
      description,
      forgejoRepoUrl: forgejoRepo.clone_url,
      forgejoRepoId: forgejoRepo.id,
      forgejoOwner: owner,
      coolifyAppUuid: coolifyApp.uuid,
      coolifyServerUuid: config.coolify.serverUuid,
      containerPort,
      fqdnUrl: fqdnUrl ?? undefined,
      vncUrl: vncUrl ?? undefined,
      codeServerUrl: codeServerUrl ?? undefined,
      containerTierId: tier?.id ?? 'lite',
      containerVersion: config.registry.version,
      resourceTierId: resolvedResourceTierId,
      flavorId: resolvedFlavorId,
      addonIds: resolvedAddonIds,
      githubRepoUrl: githubUrl,
      githubSyncEnabled: !!githubUrl,
      githubSyncDirection: 'push',
      llmProvider: llmProviderId ?? getSetting('default_provider') ?? undefined,
      llmModel: llmModelId,
    };
    
    const project = dbCreateProject(projectInput);
    
    // Update status to stopped (created but not running)
    updateProjectStatus(project.id, 'stopped');
    
    log.info('Project created successfully', { projectId: project.id });
    
    return getProjectById(project.id)!;
    
  } catch (error) {
    log.error('Project creation failed', { name, error });
    
    // Cleanup on failure
    try {
      if (coolifyApp?.uuid) {
        log.info('Cleaning up: Deleting Coolify app');
        await coolify.deleteApplication(coolifyApp.uuid);
      }
      if (forgejoRepo) {
        log.info('Cleaning up: Deleting Forgejo repo');
        await forgejo.deleteRepo(owner, slug);
      }
    } catch (cleanupError) {
      log.error('Cleanup failed', { cleanupError });
    }
    
    throw new ProjectCreationError(
      `Failed to create project: ${error instanceof Error ? error.message : 'Unknown error'}`,
      error
    );
  }
}

// =============================================================================
// Container Management
// =============================================================================

/**
 * Start a project's container
 */
export async function startProject(projectId: string): Promise<Project> {
  const project = getProjectById(projectId);
  if (!project) {
    throw new ProjectNotFoundError(projectId);
  }
  
  log.info('Starting project', { projectId, name: project.name });
  
  try {
    await coolify.startApplication(project.coolifyAppUuid);
    updateProjectStatus(projectId, 'running');
    log.info('Project started', { projectId });
    return getProjectById(projectId)!;
  } catch (error) {
    log.error('Failed to start project', { projectId, error });
    updateProjectStatus(projectId, 'error', `Failed to start: ${error instanceof Error ? error.message : 'Unknown error'}`);
    throw error;
  }
}

/**
 * Stop a project's container
 */
export async function stopProject(projectId: string): Promise<Project> {
  const project = getProjectById(projectId);
  if (!project) {
    throw new ProjectNotFoundError(projectId);
  }
  
  log.info('Stopping project', { projectId, name: project.name });
  
  try {
    await coolify.stopApplication(project.coolifyAppUuid);
    updateProjectStatus(projectId, 'stopped');
    log.info('Project stopped', { projectId });
    return getProjectById(projectId)!;
  } catch (error) {
    log.error('Failed to stop project', { projectId, error });
    updateProjectStatus(projectId, 'error', `Failed to stop: ${error instanceof Error ? error.message : 'Unknown error'}`);
    throw error;
  }
}

/**
 * Restart a project's container
 */
export async function restartProject(projectId: string): Promise<Project> {
  const project = getProjectById(projectId);
  if (!project) {
    throw new ProjectNotFoundError(projectId);
  }
  
  log.info('Restarting project', { projectId, name: project.name });
  
  try {
    await coolify.restartApplication(project.coolifyAppUuid);
    updateProjectStatus(projectId, 'running');
    log.info('Project restarted', { projectId });
    return getProjectById(projectId)!;
  } catch (error) {
    log.error('Failed to restart project', { projectId, error });
    updateProjectStatus(projectId, 'error', `Failed to restart: ${error instanceof Error ? error.message : 'Unknown error'}`);
    throw error;
  }
}

/**
 * Get project with live container status from Coolify
 */
export async function getProjectWithStatus(projectId: string): Promise<ProjectWithStatus> {
  const project = getProjectById(projectId);
  if (!project) {
    throw new ProjectNotFoundError(projectId);
  }
  
  try {
    const coolifyApp = await coolify.getApplication(project.coolifyAppUuid);
    return {
      ...project,
      containerStatus: coolifyApp.status,
    };
  } catch (error) {
    log.warn('Failed to get container status', { projectId, error });
    return {
      ...project,
      containerStatus: 'unknown',
    };
  }
}

/**
 * Get container logs for a project
 * @param projectId - Project ID
 * @param lines - Number of lines to return (default 100)
 * @returns Log output as a string
 */
export async function getProjectLogs(projectId: string, lines: number = 100): Promise<string> {
  const project = getProjectById(projectId);
  if (!project) {
    throw new ProjectNotFoundError(projectId);
  }
  
  log.info('Getting project logs', { projectId, lines });
  
  try {
    const logs = await coolify.getApplicationLogs(project.coolifyAppUuid, lines);
    return logs;
  } catch (error) {
    log.error('Failed to get project logs', { projectId, error });
    throw error;
  }
}

/**
 * Deploy/rebuild a project's container
 * Triggers a new build for Dockerfile-based containers
 * @param projectId - Project ID
 * @param force - Force deployment even if no changes (default false)
 * @returns Deployment info
 */
export async function deployProject(
  projectId: string,
  force: boolean = false
): Promise<{ message: string; deploymentId?: string }> {
  const project = getProjectById(projectId);
  if (!project) {
    throw new ProjectNotFoundError(projectId);
  }
  
  log.info('Deploying project', { projectId, name: project.name, force });
  
  try {
    // Try to update the Dockerfile before deployment
    // Note: Coolify's PATCH API may not support updating dockerfile field directly
    // In that case, we log a warning and continue with deployment using the cached Dockerfile
    try {
      log.info('Attempting to update Dockerfile before deployment', { projectId });
      await coolify.updateDockerfile(project.coolifyAppUuid, OPENCODE_DOCKERFILE);
      log.info('Dockerfile updated successfully');
    } catch (updateError) {
      // Log warning but continue - the cached Dockerfile from creation will be used
      log.warn('Failed to update Dockerfile (will use cached version)', { 
        projectId, 
        error: updateError instanceof Error ? updateError.message : 'Unknown error'
      });
    }
    
    const result = await coolify.deployApplication(project.coolifyAppUuid, force);
    
    // Extract deployment info from the response
    const deployment = result.deployments?.[0];
    
    log.info('Project deployment triggered', { 
      projectId, 
      deploymentId: deployment?.deployment_uuid,
      message: deployment?.message 
    });
    
    return {
      message: deployment?.message ?? 'Deployment triggered',
      deploymentId: deployment?.deployment_uuid,
    };
  } catch (error) {
    log.error('Failed to deploy project', { projectId, error });
    throw error;
  }
}

// =============================================================================
// Credential Injection
// =============================================================================

/**
 * Update LLM credentials for a project
 */
export async function updateProjectCredentials(
  projectId: string, 
  providerId?: string
): Promise<Project> {
  const project = getProjectById(projectId);
  if (!project) {
    throw new ProjectNotFoundError(projectId);
  }
  
  log.info('Updating project credentials', { projectId, providerId });
  
  // Get credentials from provider
  const envVars = await getProviderEnvVars(providerId);
  
  if (Object.keys(envVars).length === 0) {
    log.warn('No credentials found for provider', { providerId });
  }
  
  // Update Coolify env vars
  await coolify.setEnvVars(project.coolifyAppUuid, envVars);
  
  // Update project's LLM provider
  updateProject(projectId, { llmProvider: providerId });
  
  // Restart if running to pick up new credentials
  if (project.status === 'running') {
    log.info('Restarting project to apply new credentials');
    await coolify.restartApplication(project.coolifyAppUuid);
  }
  
  log.info('Project credentials updated', { projectId });
  return getProjectById(projectId)!;
}

/**
 * Sync credentials to all running projects
 * Called when a new provider is configured or credentials change
 * This ensures all running containers have the latest auth.json
 */
export async function syncCredentialsToAllProjects(): Promise<{ updated: number; failed: number }> {
  log.info('Syncing credentials to all running projects');
  
  // Get all running projects
  const allProjects = listProjects();
  const runningProjects = allProjects.filter(p => p.status === 'running');
  
  if (runningProjects.length === 0) {
    log.info('No running projects to update');
    return { updated: 0, failed: 0 };
  }
  
  log.info('Found running projects to update', { count: runningProjects.length });
  
  // Get the latest auth.json with all credentials
  const envVars = await getProviderEnvVars();
  
  let updated = 0;
  let failed = 0;
  
  for (const project of runningProjects) {
    try {
      // Update Coolify env vars
      await coolify.setEnvVars(project.coolifyAppUuid, envVars);
      
      // Restart to apply new credentials
      await coolify.restartApplication(project.coolifyAppUuid);
      
      log.info('Updated credentials for project', { projectId: project.id, name: project.name });
      updated++;
    } catch (error) {
      log.error('Failed to update credentials for project', { 
        projectId: project.id, 
        name: project.name, 
        error 
      });
      failed++;
    }
  }
  
  log.info('Credentials sync complete', { updated, failed });
  return { updated, failed };
}

// =============================================================================
// Project Deletion
// =============================================================================

/**
 * Delete a project and all associated resources
 */
export async function deleteProjectFully(
  projectId: string,
  options: { deleteRepo?: boolean } = {}
): Promise<void> {
  const { deleteRepo = true } = options;
  
  const project = getProjectById(projectId);
  if (!project) {
    throw new ProjectNotFoundError(projectId);
  }
  
  log.info('Deleting project', { projectId, name: project.name, deleteRepo });
  
  const errors: Error[] = [];
  
  // Step 1: Stop container if running
  if (project.status === 'running') {
    try {
      log.info('Stopping container before deletion');
      await coolify.stopApplication(project.coolifyAppUuid);
    } catch (error) {
      log.warn('Failed to stop container', { error });
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }
  }
  
  // Step 2: Delete Coolify application
  try {
    log.info('Deleting Coolify application');
    await coolify.deleteApplication(project.coolifyAppUuid);
  } catch (error) {
    log.warn('Failed to delete Coolify application', { error });
    errors.push(error instanceof Error ? error : new Error(String(error)));
  }
  
  // Step 3: Delete Forgejo repository (optional)
  if (deleteRepo) {
    try {
      log.info('Deleting Forgejo repository');
      await forgejo.deleteRepo(project.forgejoOwner, project.slug);
    } catch (error) {
      log.warn('Failed to delete Forgejo repository', { error });
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }
  }
  
  // Step 4: Delete from database
  dbDeleteProject(projectId);
  
  log.info('Project deleted', { projectId, errors: errors.length });
  
  // If there were errors during cleanup, log them but don't fail
  if (errors.length > 0) {
    log.warn('Project deleted with errors', { 
      projectId, 
      errorCount: errors.length,
      errors: errors.map(e => e.message)
    });
  }
}
