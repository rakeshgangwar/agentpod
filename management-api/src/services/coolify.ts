/**
 * Coolify API Client
 * Handles container orchestration via Coolify's REST API
 * 
 * API Docs: https://coolify.io/docs/api-reference/authorization
 * Base URL: http://<ip>:8000/api/v1
 * Auth: Bearer token
 */

import { config } from '../config.ts';
import { CoolifyApiError } from '../utils/errors.ts';
import { createLogger } from '../utils/logger.ts';

const log = createLogger('coolify');

// =============================================================================
// Types
// =============================================================================

export interface CoolifyServer {
  id: number;
  uuid: string;
  name: string;
  description: string | null;
  ip: string;
  user: string;
  port: number;
  settings?: {
    is_reachable: boolean;
    is_usable: boolean;
  };
}

export interface CoolifyApplication {
  id: number;
  uuid: string;
  name: string;
  description: string | null;
  fqdn: string | null;
  status: string;
  repository_project_id?: number;
  git_repository?: string;
  git_branch?: string;
  docker_registry_image_name?: string;
  docker_registry_image_tag?: string;
  ports_exposes?: string;
  created_at: string;
  updated_at: string;
}

export interface CoolifyEnvVar {
  id: number;
  uuid: string;
  key: string;
  value: string;
  is_preview: boolean;
  is_build_time: boolean;
  is_literal: boolean;
  is_multiline: boolean;
  is_shown_once: boolean;
}

export interface CoolifyProject {
  id: number;
  uuid: string;
  name: string;
  description: string | null;
}

export interface CreateDockerImageAppInput {
  projectUuid: string;
  serverUuid: string;
  environmentName: string;
  imageName: string;
  imageTag: string;
  portsExposes: string;
  name: string;
  description?: string;
  domains?: string;
  instantDeploy?: boolean;
}

export interface CreatePublicGitAppInput {
  projectUuid: string;
  serverUuid: string;
  environmentName: string;
  gitRepository: string;
  gitBranch: string;
  buildPack: 'dockerfile' | 'nixpacks' | 'static';
  portsExposes: string;
  name: string;
  description?: string;
  baseDirectory?: string;
  domains?: string;
  instantDeploy?: boolean;
}

export interface CreateDockerfileAppInput {
  projectUuid: string;
  serverUuid: string;
  environmentName: string;
  dockerfile: string;  // Raw Dockerfile content - no git cloning needed!
  portsExposes: string;
  name: string;
  description?: string;
  domains?: string;
  instantDeploy?: boolean;
  // Health check options
  healthCheckEnabled?: boolean;
  healthCheckPath?: string;
  healthCheckPort?: string;
}

export interface CreateEnvVarInput {
  key: string;
  value: string;
  isPreview?: boolean;
  isBuildTime?: boolean;
  isLiteral?: boolean;
  isMultiline?: boolean;
  isShownOnce?: boolean;
}

// =============================================================================
// HTTP Client
// =============================================================================

const BASE_URL = `${config.coolify.url}/api/v1`;

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const url = `${BASE_URL}${path}`;
  
  log.debug(`${method} ${path}`, body ? { body } : undefined);
  
  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${config.coolify.token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    
    const text = await response.text();
    let data: unknown;
    
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    
    if (!response.ok) {
      log.error(`Coolify API error: ${response.status}`, { path, data });
      throw new CoolifyApiError(
        `Coolify API error: ${response.status} ${response.statusText}`,
        response.status,
        data
      );
    }
    
    log.debug(`Response ${response.status}`, { path });
    return data as T;
  } catch (error) {
    if (error instanceof CoolifyApiError) {
      throw error;
    }
    log.error('Coolify API request failed', { path, error });
    throw new CoolifyApiError(
      `Failed to connect to Coolify: ${error instanceof Error ? error.message : 'Unknown error'}`,
      500,
      error
    );
  }
}

// =============================================================================
// API Methods
// =============================================================================

export const coolify = {
  // ---------------------------------------------------------------------------
  // Servers
  // ---------------------------------------------------------------------------
  
  /**
   * List all servers
   */
  async listServers(): Promise<CoolifyServer[]> {
    return request<CoolifyServer[]>('GET', '/servers');
  },
  
  /**
   * Get server by UUID
   */
  async getServer(uuid: string): Promise<CoolifyServer> {
    return request<CoolifyServer>('GET', `/servers/${uuid}`);
  },
  
  // ---------------------------------------------------------------------------
  // Applications
  // ---------------------------------------------------------------------------
  
  /**
   * List all applications
   */
  async listApplications(): Promise<CoolifyApplication[]> {
    return request<CoolifyApplication[]>('GET', '/applications');
  },
  
  /**
   * Get application by UUID
   */
  async getApplication(uuid: string): Promise<CoolifyApplication> {
    return request<CoolifyApplication>('GET', `/applications/${uuid}`);
  },
  
  /**
   * Create application from Docker image
   */
  async createDockerImageApp(input: CreateDockerImageAppInput): Promise<{ uuid: string }> {
    return request<{ uuid: string }>('POST', '/applications/dockerimage', {
      project_uuid: input.projectUuid,
      server_uuid: input.serverUuid,
      environment_name: input.environmentName,
      docker_registry_image_name: input.imageName,
      docker_registry_image_tag: input.imageTag,
      ports_exposes: input.portsExposes,
      name: input.name,
      description: input.description,
      domains: input.domains,
      instant_deploy: input.instantDeploy ?? false,
    });
  },
  
  /**
   * Create application from public Git repository (Dockerfile build)
   * WARNING: Coolify strips the domain from git URLs and defaults to GitHub!
   * For self-hosted Forgejo, use createDockerfileApp instead.
   */
  async createPublicGitApp(input: CreatePublicGitAppInput): Promise<{ uuid: string }> {
    return request<{ uuid: string }>('POST', '/applications/public', {
      project_uuid: input.projectUuid,
      server_uuid: input.serverUuid,
      environment_name: input.environmentName,
      git_repository: input.gitRepository,
      git_branch: input.gitBranch,
      build_pack: input.buildPack,
      ports_exposes: input.portsExposes,
      name: input.name,
      description: input.description,
      base_directory: input.baseDirectory,
      domains: input.domains,
      instant_deploy: input.instantDeploy ?? false,
    });
  },
  
  /**
   * Create application from raw Dockerfile content
   * This is the preferred method for OpenCode containers as it:
   * 1. Doesn't require git cloning (avoids Forgejo URL stripping issue)
   * 2. Embeds the Dockerfile directly
   * 3. Works reliably with self-hosted infrastructure
   * Note: Coolify requires the dockerfile to be base64 encoded
   */
  async createDockerfileApp(input: CreateDockerfileAppInput): Promise<{ uuid: string }> {
    // Base64 encode the Dockerfile content as required by Coolify API
    const dockerfileBase64 = Buffer.from(input.dockerfile).toString('base64');
    
    return request<{ uuid: string }>('POST', '/applications/dockerfile', {
      project_uuid: input.projectUuid,
      server_uuid: input.serverUuid,
      environment_name: input.environmentName,
      dockerfile: dockerfileBase64,
      ports_exposes: input.portsExposes,
      name: input.name,
      description: input.description,
      domains: input.domains,
      instant_deploy: input.instantDeploy ?? false,
      health_check_enabled: input.healthCheckEnabled ?? true,
      health_check_path: input.healthCheckPath ?? '/app',
      health_check_port: input.healthCheckPort ?? input.portsExposes,
    });
  },
  
  /**
   * Update application settings
   * Use this after creation to set ports, domains, health checks, etc.
   * The Coolify dockerfile creation endpoint doesn't reliably accept all parameters.
   */
  async updateApplication(uuid: string, settings: {
    ports_exposes?: string;
    domains?: string;
    health_check_enabled?: boolean;
    health_check_path?: string;
    health_check_port?: string;
    dockerfile?: string; // Base64 encoded Dockerfile content
  }): Promise<void> {
    await request<unknown>('PATCH', `/applications/${uuid}`, settings);
  },
  
  /**
   * Update application Dockerfile
   * Use this to update the Dockerfile content for an existing application
   */
  async updateDockerfile(uuid: string, dockerfile: string): Promise<void> {
    const dockerfileBase64 = Buffer.from(dockerfile).toString('base64');
    await request<unknown>('PATCH', `/applications/${uuid}`, {
      dockerfile: dockerfileBase64,
    });
  },

  /**
   * Delete application
   */
  async deleteApplication(uuid: string): Promise<void> {
    await request<unknown>('DELETE', `/applications/${uuid}`);
  },
  
  /**
   * Start application
   * Note: Coolify uses GET for start/stop/restart
   */
  async startApplication(uuid: string): Promise<void> {
    await request<unknown>('GET', `/applications/${uuid}/start`);
  },
  
  /**
   * Stop application
   */
  async stopApplication(uuid: string): Promise<void> {
    await request<unknown>('GET', `/applications/${uuid}/stop`);
  },
  
  /**
   * Restart application
   */
  async restartApplication(uuid: string): Promise<void> {
    await request<unknown>('GET', `/applications/${uuid}/restart`);
  },
  
  /**
   * Deploy/rebuild application (triggers a new build for Dockerfile apps)
   * Uses the /deploy endpoint with uuid query parameter
   * See: https://coolify.io/docs/api-reference/api/operations/deploy-by-tag-or-uuid
   */
  async deployApplication(uuid: string, force: boolean = false): Promise<{ deployments: Array<{ message: string; resource_uuid: string; deployment_uuid: string }> }> {
    const forceParam = force ? '&force=true' : '';
    return request<{ deployments: Array<{ message: string; resource_uuid: string; deployment_uuid: string }> }>('GET', `/deploy?uuid=${uuid}${forceParam}`);
  },
  
  /**
   * Get container logs for an application
   * Returns stdout/stderr logs from the running container
   * See: https://coolify.io/docs/api-reference/api/operations/get-logs-by-application-uuid
   * 
   * @param uuid - Application UUID
   * @param lines - Number of lines to return (default 100)
   * @returns Log output as a string
   */
  async getApplicationLogs(uuid: string, lines: number = 100): Promise<string> {
    const response = await request<{ logs?: string | string[]; stdout?: string; stderr?: string } | string>(
      'GET', 
      `/applications/${uuid}/logs?lines=${lines}`
    );
    
    // The Coolify API can return logs in different formats:
    // 1. Direct string
    // 2. { logs: string | string[] }
    // 3. { stdout: string, stderr: string }
    if (typeof response === 'string') {
      return response;
    }
    
    if (response.logs) {
      return Array.isArray(response.logs) ? response.logs.join('\n') : response.logs;
    }
    
    if (response.stdout || response.stderr) {
      return [response.stdout, response.stderr].filter(Boolean).join('\n');
    }
    
    return '';
  },
  
  // ---------------------------------------------------------------------------
  // Environment Variables
  // ---------------------------------------------------------------------------
  
  /**
   * List environment variables for an application
   * Note: Coolify creates both preview and non-preview versions of each env var.
   * By default, this returns all. Use filterPreview to get only production vars.
   */
  async listEnvVars(appUuid: string, filterPreview: boolean = false): Promise<CoolifyEnvVar[]> {
    const envVars = await request<CoolifyEnvVar[]>('GET', `/applications/${appUuid}/envs`);
    if (filterPreview) {
      return envVars.filter(e => !e.is_preview);
    }
    return envVars;
  },
  
  /**
   * Create environment variable
   */
  async createEnvVar(appUuid: string, input: CreateEnvVarInput): Promise<{ uuid: string }> {
    // Note: is_build_time is not valid for Docker Image apps (no build step)
    // Only include fields that are universally supported
    return request<{ uuid: string }>('POST', `/applications/${appUuid}/envs`, {
      key: input.key,
      value: input.value,
      is_preview: input.isPreview ?? false,
      is_literal: input.isLiteral ?? true,
    });
  },
  
  /**
   * Delete environment variable
   */
  async deleteEnvVar(appUuid: string, envUuid: string): Promise<void> {
    await request<unknown>('DELETE', `/applications/${appUuid}/envs/${envUuid}`);
  },
  
  /**
   * Set multiple environment variables using bulk update
   * Note: Coolify automatically creates both preview and non-preview versions.
   * This is normal behavior for supporting preview deployments.
   * See: https://coolify.io/docs/api-reference/api/operations/update-envs-by-application-uuid
   */
  async setEnvVars(appUuid: string, vars: Record<string, string>): Promise<void> {
    const data = Object.entries(vars).map(([key, value]) => ({
      key,
      value,
      is_preview: false,
      is_literal: true,
      is_multiline: false,
      is_shown_once: false,
    }));
    
    await request('PATCH', `/applications/${appUuid}/envs/bulk`, { data });
  },
  
  // ---------------------------------------------------------------------------
  // Projects (Coolify's project concept, not our projects)
  // ---------------------------------------------------------------------------
  
  /**
   * List Coolify projects
   */
  async listProjects(): Promise<CoolifyProject[]> {
    return request<CoolifyProject[]>('GET', '/projects');
  },
  
  /**
   * Get Coolify project by UUID
   */
  async getProject(uuid: string): Promise<CoolifyProject> {
    return request<CoolifyProject>('GET', `/projects/${uuid}`);
  },
  
  // ---------------------------------------------------------------------------
  // Health
  // ---------------------------------------------------------------------------
  
  /**
   * Check Coolify API health by listing servers
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Use /servers endpoint as health check since /healthcheck doesn't exist
      await this.listServers();
      return true;
    } catch {
      return false;
    }
  },
};
