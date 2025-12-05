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
  updateProject,
  updateProjectStatus,
  deleteProject as dbDeleteProject,
  generateUniqueSlug,
  type Project,
  type CreateProjectInput,
} from '../models/project.ts';
import { getProviderEnvVars, getDefaultProvider } from '../models/provider.ts';
import { createLogger } from '../utils/logger.ts';
import { ProjectCreationError, ProjectNotFoundError } from '../utils/errors.ts';

const log = createLogger('project-manager');

// =============================================================================
// Types
// =============================================================================

export interface CreateProjectOptions {
  name: string;
  description?: string;
  /** Import from GitHub URL (uses Forgejo mirror) */
  githubUrl?: string;
  /** Use specific LLM provider (defaults to default provider) */
  llmProviderId?: string;
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
 */
export async function createNewProject(options: CreateProjectOptions): Promise<Project> {
  const { name, description, githubUrl, llmProviderId } = options;
  
  log.info('Creating new project', { name, githubUrl });
  
  const slug = generateUniqueSlug(name);
  const owner = config.forgejo.owner;
  
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
    
    // Step 2: Calculate container port
    // Use a simple incrementing port based on repo ID
    const containerPort = config.opencode.basePort + (forgejoRepo.id % 1000);
    
    // Step 3: Create Coolify application
    log.info('Step 2: Creating Coolify application', { slug });
    
    coolifyApp = await coolify.createDockerImageApp({
      projectUuid: config.coolify.projectUuid,
      serverUuid: config.coolify.serverUuid,
      environmentName: 'production',
      imageName: config.opencode.image,
      imageTag: 'latest',
      portsExposes: String(containerPort),
      name: `opencode-${slug}`,
      description: `OpenCode container for ${name}`,
      instantDeploy: false, // We'll set env vars first
    });
    
    log.info('Coolify application created', { uuid: coolifyApp.uuid });
    
    // Step 4: Set environment variables
    log.info('Step 3: Setting environment variables');
    
    const envVars: Record<string, string> = {
      // Forgejo repo URL for OpenCode to clone
      REPO_URL: forgejoRepo.clone_url,
      REPO_BRANCH: forgejoRepo.default_branch,
      PROJECT_NAME: name,
    };
    
    // Add LLM credentials
    const llmEnvVars = getProviderEnvVars(llmProviderId);
    Object.assign(envVars, llmEnvVars);
    
    await coolify.setEnvVars(coolifyApp.uuid, envVars);
    
    log.info('Environment variables set', { 
      vars: Object.keys(envVars) 
    });
    
    // Step 5: Save to database
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
      githubRepoUrl: githubUrl,
      githubSyncEnabled: !!githubUrl,
      githubSyncDirection: 'push',
      llmProvider: llmProviderId ?? getDefaultProvider()?.id,
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
  const envVars = getProviderEnvVars(providerId);
  
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
