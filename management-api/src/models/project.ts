import { db } from '../db/index.ts';
import { nanoid } from 'nanoid';

// =============================================================================
// Types
// =============================================================================

export type ProjectStatus = 'creating' | 'running' | 'stopped' | 'error';
export type SyncDirection = 'push' | 'pull' | 'bidirectional';

export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  
  // Forgejo
  forgejoRepoUrl: string;
  forgejoRepoId: number | null;
  forgejoOwner: string;
  
  // Coolify
  coolifyAppUuid: string;
  coolifyServerUuid: string;
  containerPort: number;
  fqdnUrl: string | null;  // Public URL for the OpenCode container
  
  // GitHub sync
  githubRepoUrl: string | null;
  githubSyncEnabled: boolean;
  githubSyncDirection: SyncDirection;
  lastSyncAt: string | null;
  
  // LLM
  llmProvider: string | null;  // Provider ID: 'zai', 'anthropic', etc.
  llmModel: string | null;     // Model ID: 'glm-4.6', 'claude-3-5-sonnet', etc.
  
  // Status
  status: ProjectStatus;
  errorMessage: string | null;
  
  // Timestamps
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  forgejoRepoUrl: string;
  forgejoRepoId?: number;
  forgejoOwner: string;
  coolifyAppUuid: string;
  coolifyServerUuid: string;
  containerPort: number;
  fqdnUrl?: string;
  githubRepoUrl?: string;
  githubSyncEnabled?: boolean;
  githubSyncDirection?: SyncDirection;
  llmProvider?: string;
  llmModel?: string;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string;
  status?: ProjectStatus;
  errorMessage?: string;
  fqdnUrl?: string;
  githubSyncEnabled?: boolean;
  githubSyncDirection?: SyncDirection;
  lastSyncAt?: string;
  llmProvider?: string;
  llmModel?: string;
}

// =============================================================================
// Database Row Mapping
// =============================================================================

interface ProjectRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  forgejo_repo_url: string;
  forgejo_repo_id: number | null;
  forgejo_owner: string;
  coolify_app_uuid: string;
  coolify_server_uuid: string;
  container_port: number;
  fqdn_url: string | null;
  github_repo_url: string | null;
  github_sync_enabled: number;
  github_sync_direction: string;
  last_sync_at: string | null;
  llm_provider: string | null;
  llm_model: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    forgejoRepoUrl: row.forgejo_repo_url,
    forgejoRepoId: row.forgejo_repo_id,
    forgejoOwner: row.forgejo_owner,
    coolifyAppUuid: row.coolify_app_uuid,
    coolifyServerUuid: row.coolify_server_uuid,
    containerPort: row.container_port,
    fqdnUrl: row.fqdn_url,
    githubRepoUrl: row.github_repo_url,
    githubSyncEnabled: row.github_sync_enabled === 1,
    githubSyncDirection: row.github_sync_direction as SyncDirection,
    lastSyncAt: row.last_sync_at,
    llmProvider: row.llm_provider,
    llmModel: row.llm_model,
    status: row.status as ProjectStatus,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// =============================================================================
// CRUD Operations
// =============================================================================

/**
 * Create a new project
 */
export function createProject(input: CreateProjectInput): Project {
  const id = nanoid();
  const slug = input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  
  const query = db.query(`
    INSERT INTO projects (
      id, name, slug, description,
      forgejo_repo_url, forgejo_repo_id, forgejo_owner,
      coolify_app_uuid, coolify_server_uuid, container_port, fqdn_url,
      github_repo_url, github_sync_enabled, github_sync_direction,
      llm_provider, llm_model, status
    ) VALUES (
      $id, $name, $slug, $description,
      $forgejoRepoUrl, $forgejoRepoId, $forgejoOwner,
      $coolifyAppUuid, $coolifyServerUuid, $containerPort, $fqdnUrl,
      $githubRepoUrl, $githubSyncEnabled, $githubSyncDirection,
      $llmProvider, $llmModel, $status
    )
  `);
  
  query.run({
    $id: id,
    $name: input.name,
    $slug: slug,
    $description: input.description ?? null,
    $forgejoRepoUrl: input.forgejoRepoUrl,
    $forgejoRepoId: input.forgejoRepoId ?? null,
    $forgejoOwner: input.forgejoOwner,
    $coolifyAppUuid: input.coolifyAppUuid,
    $coolifyServerUuid: input.coolifyServerUuid,
    $containerPort: input.containerPort,
    $fqdnUrl: input.fqdnUrl ?? null,
    $githubRepoUrl: input.githubRepoUrl ?? null,
    $githubSyncEnabled: input.githubSyncEnabled ? 1 : 0,
    $githubSyncDirection: input.githubSyncDirection ?? 'push',
    $llmProvider: input.llmProvider ?? null,
    $llmModel: input.llmModel ?? null,
    $status: 'creating',
  });
  
  return getProjectById(id)!;
}

/**
 * Get project by ID
 */
export function getProjectById(id: string): Project | null {
  const row = db.query('SELECT * FROM projects WHERE id = $id').get({ $id: id }) as ProjectRow | null;
  return row ? rowToProject(row) : null;
}

/**
 * Get project by slug
 */
export function getProjectBySlug(slug: string): Project | null {
  const row = db.query('SELECT * FROM projects WHERE slug = $slug').get({ $slug: slug }) as ProjectRow | null;
  return row ? rowToProject(row) : null;
}

/**
 * List all projects
 */
export function listProjects(): Project[] {
  const rows = db.query('SELECT * FROM projects ORDER BY created_at DESC').all() as ProjectRow[];
  return rows.map(rowToProject);
}

/**
 * Update project
 */
export function updateProject(id: string, input: UpdateProjectInput): Project | null {
  const updates: string[] = [];
  const params: Record<string, unknown> = { $id: id };
  
  if (input.name !== undefined) {
    updates.push('name = $name');
    params.$name = input.name;
  }
  if (input.description !== undefined) {
    updates.push('description = $description');
    params.$description = input.description;
  }
  if (input.status !== undefined) {
    updates.push('status = $status');
    params.$status = input.status;
  }
  if (input.errorMessage !== undefined) {
    updates.push('error_message = $errorMessage');
    params.$errorMessage = input.errorMessage;
  }
  if (input.fqdnUrl !== undefined) {
    updates.push('fqdn_url = $fqdnUrl');
    params.$fqdnUrl = input.fqdnUrl;
  }
  if (input.githubSyncEnabled !== undefined) {
    updates.push('github_sync_enabled = $githubSyncEnabled');
    params.$githubSyncEnabled = input.githubSyncEnabled ? 1 : 0;
  }
  if (input.githubSyncDirection !== undefined) {
    updates.push('github_sync_direction = $githubSyncDirection');
    params.$githubSyncDirection = input.githubSyncDirection;
  }
  if (input.lastSyncAt !== undefined) {
    updates.push('last_sync_at = $lastSyncAt');
    params.$lastSyncAt = input.lastSyncAt;
  }
  if (input.llmProvider !== undefined) {
    updates.push('llm_provider = $llmProvider');
    params.$llmProvider = input.llmProvider;
  }
  if (input.llmModel !== undefined) {
    updates.push('llm_model = $llmModel');
    params.$llmModel = input.llmModel;
  }
  
  if (updates.length === 0) {
    return getProjectById(id);
  }
  
  updates.push("updated_at = datetime('now')");
  
  const sql = `UPDATE projects SET ${updates.join(', ')} WHERE id = $id`;
  db.query(sql).run(params as Record<string, string | number | boolean | null>);
  
  return getProjectById(id);
}

/**
 * Delete project
 */
export function deleteProject(id: string): boolean {
  const result = db.query('DELETE FROM projects WHERE id = $id').run({ $id: id });
  return result.changes > 0;
}

/**
 * Update project status
 */
export function updateProjectStatus(id: string, status: ProjectStatus, errorMessage?: string): Project | null {
  return updateProject(id, { status, errorMessage: errorMessage ?? undefined });
}

/**
 * Check if slug exists
 */
export function slugExists(slug: string): boolean {
  const row = db.query('SELECT 1 FROM projects WHERE slug = $slug').get({ $slug: slug });
  return !!row;
}

/**
 * Generate unique slug
 */
export function generateUniqueSlug(baseName: string): string {
  let slug = baseName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  let counter = 0;
  let uniqueSlug = slug;
  
  while (slugExists(uniqueSlug)) {
    counter++;
    uniqueSlug = `${slug}-${counter}`;
  }
  
  return uniqueSlug;
}
