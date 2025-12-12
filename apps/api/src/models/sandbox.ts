/**
 * Sandbox Model
 * Manages sandbox metadata in the database, replacing Docker labels as source of truth
 * 
 * A sandbox represents a user's development environment with:
 * - Git repository
 * - Container configuration (resource tier, flavor, addons)
 * - Runtime state (container ID, status, URLs)
 */

import { db } from '../db/index.ts';
import { createLogger } from '../utils/logger.ts';

const log = createLogger('sandbox-model');

// =============================================================================
// Types
// =============================================================================

export type SandboxStatus = 'created' | 'starting' | 'running' | 'stopping' | 'stopped' | 'error';

export interface Sandbox {
  id: string;
  userId: string;
  name: string;
  slug: string;
  description?: string;
  
  // Git/Repository info
  repoName: string;
  githubUrl?: string;
  
  // Container configuration
  resourceTierId: string;
  flavorId: string;
  addonIds: string[];
  
  // Container runtime info
  containerId?: string;
  containerName?: string;
  status: SandboxStatus;
  errorMessage?: string;
  
  // URLs
  opencodeUrl?: string;
  acpGatewayUrl?: string;
  vncUrl?: string;
  codeServerUrl?: string;
  
  // Timestamps
  createdAt: string;
  updatedAt: string;
  lastAccessedAt?: string;
}

export interface CreateSandboxInput {
  id: string;
  userId: string;
  name: string;
  slug: string;
  description?: string;
  repoName: string;
  githubUrl?: string;
  resourceTierId?: string;
  flavorId?: string;
  addonIds?: string[];
}

export interface UpdateSandboxInput {
  name?: string;
  description?: string;
  resourceTierId?: string;
  flavorId?: string;
  addonIds?: string[];
  containerId?: string;
  containerName?: string;
  status?: SandboxStatus;
  errorMessage?: string;
  opencodeUrl?: string;
  acpGatewayUrl?: string;
  vncUrl?: string;
  codeServerUrl?: string;
}

// Database row type
interface SandboxRow {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  description: string | null;
  repo_name: string;
  github_url: string | null;
  resource_tier_id: string;
  flavor_id: string;
  addon_ids: string;
  container_id: string | null;
  container_name: string | null;
  status: string;
  error_message: string | null;
  opencode_url: string | null;
  acp_gateway_url: string | null;
  vnc_url: string | null;
  code_server_url: string | null;
  created_at: string;
  updated_at: string;
  last_accessed_at: string | null;
}

// =============================================================================
// Helpers
// =============================================================================

function rowToSandbox(row: SandboxRow): Sandbox {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    slug: row.slug,
    description: row.description ?? undefined,
    repoName: row.repo_name,
    githubUrl: row.github_url ?? undefined,
    resourceTierId: row.resource_tier_id,
    flavorId: row.flavor_id,
    addonIds: JSON.parse(row.addon_ids || '[]'),
    containerId: row.container_id ?? undefined,
    containerName: row.container_name ?? undefined,
    status: row.status as SandboxStatus,
    errorMessage: row.error_message ?? undefined,
    opencodeUrl: row.opencode_url ?? undefined,
    acpGatewayUrl: row.acp_gateway_url ?? undefined,
    vncUrl: row.vnc_url ?? undefined,
    codeServerUrl: row.code_server_url ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastAccessedAt: row.last_accessed_at ?? undefined,
  };
}

// =============================================================================
// CRUD Operations
// =============================================================================

/**
 * Create a new sandbox
 */
export function createSandbox(input: CreateSandboxInput): Sandbox {
  const now = new Date().toISOString();
  
  db.run(
    `INSERT INTO sandboxes (
      id, user_id, name, slug, description, repo_name, github_url,
      resource_tier_id, flavor_id, addon_ids, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'created', ?, ?)`,
    [
      input.id,
      input.userId,
      input.name,
      input.slug,
      input.description ?? null,
      input.repoName,
      input.githubUrl ?? null,
      input.resourceTierId ?? 'starter',
      input.flavorId ?? 'fullstack',
      JSON.stringify(input.addonIds ?? ['code-server']),
      now,
      now,
    ]
  );
  
  log.info('Created sandbox', { sandboxId: input.id, userId: input.userId, name: input.name });
  return getSandboxById(input.id)!;
}

/**
 * Get a sandbox by ID
 */
export function getSandboxById(id: string): Sandbox | null {
  const row = db.query<SandboxRow, [string]>(
    'SELECT * FROM sandboxes WHERE id = ?'
  ).get(id);
  
  return row ? rowToSandbox(row) : null;
}

/**
 * Get a sandbox by user ID and slug
 */
export function getSandboxBySlug(userId: string, slug: string): Sandbox | null {
  const row = db.query<SandboxRow, [string, string]>(
    'SELECT * FROM sandboxes WHERE user_id = ? AND slug = ?'
  ).get(userId, slug);
  
  return row ? rowToSandbox(row) : null;
}

/**
 * Get a sandbox by container ID
 */
export function getSandboxByContainerId(containerId: string): Sandbox | null {
  const row = db.query<SandboxRow, [string]>(
    'SELECT * FROM sandboxes WHERE container_id = ?'
  ).get(containerId);
  
  return row ? rowToSandbox(row) : null;
}

/**
 * List all sandboxes for a user
 */
export function listSandboxesByUserId(userId: string): Sandbox[] {
  const rows = db.query<SandboxRow, [string]>(
    'SELECT * FROM sandboxes WHERE user_id = ? ORDER BY created_at DESC'
  ).all(userId);
  
  return rows.map(rowToSandbox);
}

/**
 * List all sandboxes (admin)
 */
export function listAllSandboxes(): Sandbox[] {
  const rows = db.query<SandboxRow, []>(
    'SELECT * FROM sandboxes ORDER BY created_at DESC'
  ).all();
  
  return rows.map(rowToSandbox);
}

/**
 * List sandboxes by status
 */
export function listSandboxesByStatus(status: SandboxStatus): Sandbox[] {
  const rows = db.query<SandboxRow, [string]>(
    'SELECT * FROM sandboxes WHERE status = ? ORDER BY created_at DESC'
  ).all(status);
  
  return rows.map(rowToSandbox);
}

/**
 * Update a sandbox
 */
export function updateSandbox(id: string, input: UpdateSandboxInput): Sandbox | null {
  const existing = getSandboxById(id);
  if (!existing) return null;
  
  const updates: string[] = [];
  const values: (string | null)[] = [];
  
  if (input.name !== undefined) {
    updates.push('name = ?');
    values.push(input.name);
  }
  if (input.description !== undefined) {
    updates.push('description = ?');
    values.push(input.description ?? null);
  }
  if (input.resourceTierId !== undefined) {
    updates.push('resource_tier_id = ?');
    values.push(input.resourceTierId);
  }
  if (input.flavorId !== undefined) {
    updates.push('flavor_id = ?');
    values.push(input.flavorId);
  }
  if (input.addonIds !== undefined) {
    updates.push('addon_ids = ?');
    values.push(JSON.stringify(input.addonIds));
  }
  if (input.containerId !== undefined) {
    updates.push('container_id = ?');
    values.push(input.containerId ?? null);
  }
  if (input.containerName !== undefined) {
    updates.push('container_name = ?');
    values.push(input.containerName ?? null);
  }
  if (input.status !== undefined) {
    updates.push('status = ?');
    values.push(input.status);
  }
  if (input.errorMessage !== undefined) {
    updates.push('error_message = ?');
    values.push(input.errorMessage ?? null);
  }
  if (input.opencodeUrl !== undefined) {
    updates.push('opencode_url = ?');
    values.push(input.opencodeUrl ?? null);
  }
  if (input.acpGatewayUrl !== undefined) {
    updates.push('acp_gateway_url = ?');
    values.push(input.acpGatewayUrl ?? null);
  }
  if (input.vncUrl !== undefined) {
    updates.push('vnc_url = ?');
    values.push(input.vncUrl ?? null);
  }
  if (input.codeServerUrl !== undefined) {
    updates.push('code_server_url = ?');
    values.push(input.codeServerUrl ?? null);
  }
  
  if (updates.length === 0) return existing;
  
  updates.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(id);
  
  db.run(
    `UPDATE sandboxes SET ${updates.join(', ')} WHERE id = ?`,
    values
  );
  
  log.info('Updated sandbox', { sandboxId: id, updates: Object.keys(input) });
  return getSandboxById(id);
}

/**
 * Update sandbox status
 */
export function updateSandboxStatus(
  id: string,
  status: SandboxStatus,
  errorMessage?: string
): Sandbox | null {
  return updateSandbox(id, { status, errorMessage });
}

/**
 * Update last accessed timestamp
 */
export function touchSandbox(id: string): void {
  db.run(
    'UPDATE sandboxes SET last_accessed_at = ? WHERE id = ?',
    [new Date().toISOString(), id]
  );
}

/**
 * Delete a sandbox
 */
export function deleteSandbox(id: string): boolean {
  const result = db.run('DELETE FROM sandboxes WHERE id = ?', [id]);
  
  if (result.changes > 0) {
    log.info('Deleted sandbox', { sandboxId: id });
    return true;
  }
  return false;
}

/**
 * Delete all sandboxes for a user
 */
export function deleteSandboxesByUserId(userId: string): number {
  const result = db.run('DELETE FROM sandboxes WHERE user_id = ?', [userId]);
  
  if (result.changes > 0) {
    log.info('Deleted user sandboxes', { userId, count: result.changes });
  }
  return result.changes;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Check if a slug is available for a user
 */
export function isSlugAvailable(userId: string, slug: string, excludeId?: string): boolean {
  let query = 'SELECT COUNT(*) as count FROM sandboxes WHERE user_id = ? AND slug = ?';
  const params: string[] = [userId, slug];
  
  if (excludeId) {
    query += ' AND id != ?';
    params.push(excludeId);
  }
  
  const result = db.query<{ count: number }, string[]>(query).get(...params);
  return result?.count === 0;
}

/**
 * Generate a unique slug for a user
 */
export function generateUniqueSlug(userId: string, baseName: string): string {
  const baseSlug = baseName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  
  let slug = baseSlug;
  let counter = 1;
  
  while (!isSlugAvailable(userId, slug)) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }
  
  return slug;
}

/**
 * Get sandbox counts by status for a user
 */
export function getSandboxCountsByStatus(userId: string): Record<SandboxStatus, number> {
  const rows = db.query<{ status: string; count: number }, [string]>(
    `SELECT status, COUNT(*) as count FROM sandboxes 
     WHERE user_id = ? GROUP BY status`
  ).all(userId);
  
  const counts: Record<SandboxStatus, number> = {
    created: 0,
    starting: 0,
    running: 0,
    stopping: 0,
    stopped: 0,
    error: 0,
  };
  
  for (const row of rows) {
    counts[row.status as SandboxStatus] = row.count;
  }
  
  return counts;
}
