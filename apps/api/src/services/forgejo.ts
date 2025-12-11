/**
 * Forgejo API Client
 * Handles Git repository management via Forgejo's REST API
 * 
 * API Docs: https://forgejo.org/docs/latest/user/api-usage/
 * Swagger: https://<host>/api/swagger
 * Base URL: https://<host>/api/v1
 * Auth: Authorization: token <token>
 */

import { config } from '../config.ts';
import { ForgejoApiError } from '../utils/errors.ts';
import { createLogger } from '../utils/logger.ts';

const log = createLogger('forgejo');

// =============================================================================
// Types
// =============================================================================

export interface ForgejoUser {
  id: number;
  login: string;
  full_name: string;
  email: string;
  avatar_url: string;
  is_admin: boolean;
  created: string;
}

export interface ForgejoRepository {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  private: boolean;
  fork: boolean;
  empty: boolean;
  size: number;
  html_url: string;
  ssh_url: string;
  clone_url: string;
  default_branch: string;
  created_at: string;
  updated_at: string;
  owner: {
    id: number;
    login: string;
    full_name: string;
    avatar_url: string;
  };
}

export interface ForgejoContent {
  name: string;
  path: string;
  sha: string;
  type: 'file' | 'dir' | 'symlink' | 'submodule';
  size: number;
  encoding?: string;
  content?: string;
  download_url?: string;
  html_url: string;
}

export interface CreateRepoInput {
  name: string;
  description?: string;
  private?: boolean;
  autoInit?: boolean;
  defaultBranch?: string;
  readme?: string;
  gitignores?: string;
  license?: string;
}

export interface MirrorRepoInput {
  cloneAddr: string;
  repoName: string;
  mirror: boolean;
  private?: boolean;
  authUsername?: string;
  authPassword?: string;
  description?: string;
}

// =============================================================================
// HTTP Client
// =============================================================================

const BASE_URL = `${config.forgejo.url}/api/v1`;

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  options?: { params?: Record<string, string | number> }
): Promise<T> {
  let url = `${BASE_URL}${path}`;
  
  // Add query parameters
  if (options?.params) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(options.params)) {
      searchParams.set(key, String(value));
    }
    url += `?${searchParams.toString()}`;
  }
  
  log.debug(`${method} ${path}`, body ? { body } : undefined);
  
  try {
    const response = await fetch(url, {
      method,
      headers: {
        // Forgejo uses "token" keyword, not "Bearer"
        'Authorization': `token ${config.forgejo.token}`,
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
      log.error(`Forgejo API error: ${response.status}`, { path, data });
      throw new ForgejoApiError(
        `Forgejo API error: ${response.status} ${response.statusText}`,
        response.status,
        data
      );
    }
    
    log.debug(`Response ${response.status}`, { path });
    return data as T;
  } catch (error) {
    if (error instanceof ForgejoApiError) {
      throw error;
    }
    log.error('Forgejo API request failed', { path, error });
    throw new ForgejoApiError(
      `Failed to connect to Forgejo: ${error instanceof Error ? error.message : 'Unknown error'}`,
      500,
      error
    );
  }
}

// =============================================================================
// API Methods
// =============================================================================

export const forgejo = {
  // ---------------------------------------------------------------------------
  // User
  // ---------------------------------------------------------------------------
  
  /**
   * Get the authenticated user
   */
  async getCurrentUser(): Promise<ForgejoUser> {
    return request<ForgejoUser>('GET', '/user');
  },
  
  // ---------------------------------------------------------------------------
  // Repositories
  // ---------------------------------------------------------------------------
  
  /**
   * List repositories for the authenticated user
   */
  async listUserRepos(page = 1, limit = 50): Promise<ForgejoRepository[]> {
    return request<ForgejoRepository[]>('GET', '/user/repos', undefined, {
      params: { page, limit },
    });
  },
  
  /**
   * Get repository by owner and name
   */
  async getRepo(owner: string, repo: string): Promise<ForgejoRepository> {
    return request<ForgejoRepository>('GET', `/repos/${owner}/${repo}`);
  },
  
  /**
   * Create a new repository
   */
  async createRepo(input: CreateRepoInput): Promise<ForgejoRepository> {
    return request<ForgejoRepository>('POST', '/user/repos', {
      name: input.name,
      description: input.description,
      private: input.private ?? false,
      auto_init: input.autoInit ?? true,
      default_branch: input.defaultBranch ?? 'main',
      readme: input.readme,
      gitignores: input.gitignores,
      license: input.license,
    });
  },
  
  /**
   * Delete a repository
   */
  async deleteRepo(owner: string, repo: string): Promise<void> {
    await request<unknown>('DELETE', `/repos/${owner}/${repo}`);
  },
  
  /**
   * Check if a repository exists
   */
  async repoExists(owner: string, repo: string): Promise<boolean> {
    try {
      await this.getRepo(owner, repo);
      return true;
    } catch (error) {
      if (error instanceof ForgejoApiError && error.statusCode === 404) {
        return false;
      }
      throw error;
    }
  },
  
  // ---------------------------------------------------------------------------
  // Repository Contents
  // ---------------------------------------------------------------------------
  
  /**
   * Get contents of a file or directory in a repository
   */
  async getContents(
    owner: string,
    repo: string,
    path: string,
    ref?: string
  ): Promise<ForgejoContent | ForgejoContent[]> {
    const params: Record<string, string> = {};
    if (ref) params.ref = ref;
    
    return request<ForgejoContent | ForgejoContent[]>(
      'GET',
      `/repos/${owner}/${repo}/contents/${path}`,
      undefined,
      { params }
    );
  },
  
  /**
   * List files in a directory
   */
  async listDirectory(
    owner: string,
    repo: string,
    path = '',
    ref?: string
  ): Promise<ForgejoContent[]> {
    const result = await this.getContents(owner, repo, path, ref);
    return Array.isArray(result) ? result : [result];
  },
  
  // ---------------------------------------------------------------------------
  // Mirroring (for GitHub imports)
  // ---------------------------------------------------------------------------
  
  /**
   * Create a mirror repository from an external source
   * This is used to import repos from GitHub
   */
  async createMirror(input: MirrorRepoInput): Promise<ForgejoRepository> {
    return request<ForgejoRepository>('POST', '/repos/migrate', {
      clone_addr: input.cloneAddr,
      repo_name: input.repoName,
      mirror: input.mirror,
      private: input.private ?? false,
      auth_username: input.authUsername,
      auth_password: input.authPassword,
      description: input.description,
      // Use the default owner from config
      uid: 0, // Will be set to authenticated user
    });
  },
  
  /**
   * Sync a mirror repository with its upstream
   */
  async syncMirror(owner: string, repo: string): Promise<void> {
    await request<unknown>('POST', `/repos/${owner}/${repo}/mirror-sync`);
  },
  
  // ---------------------------------------------------------------------------
  // Utility Methods
  // ---------------------------------------------------------------------------
  
  /**
   * Get the clone URL for a repository
   */
  getCloneUrl(owner: string, repo: string): string {
    return `${config.forgejo.url}/${owner}/${repo}.git`;
  },
  
  /**
   * Get the HTTP URL for a repository
   */
  getHtmlUrl(owner: string, repo: string): string {
    return `${config.forgejo.url}/${owner}/${repo}`;
  },
  
  /**
   * Check Forgejo API health
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.getCurrentUser();
      return true;
    } catch {
      return false;
    }
  },
  
  /**
   * Get API settings (pagination limits, etc.)
   */
  async getApiSettings(): Promise<{
    max_response_items: number;
    default_paging_num: number;
  }> {
    return request<{
      max_response_items: number;
      default_paging_num: number;
    }>('GET', '/settings/api');
  },
};
