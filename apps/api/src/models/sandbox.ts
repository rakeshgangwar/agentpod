/**
 * Sandbox Model
 * Manages sandbox metadata in the database, replacing Docker labels as source of truth
 * 
 * A sandbox represents a user's development environment with:
 * - Git repository
 * - Container configuration (resource tier, flavor, addons)
 * - Runtime state (container ID, status, URLs)
 * 
 * MIGRATED: Now uses PostgreSQL via Drizzle ORM
 */

import { db } from '../db/drizzle';
import { sandboxes } from '../db/schema/sandboxes';
import { eq, and, desc, sql, count } from 'drizzle-orm';
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
  createdAt: Date;
  updatedAt: Date;
  lastAccessedAt?: Date;
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

// =============================================================================
// Helpers
// =============================================================================

function parseAddonIds(addonIds: string | null): string[] {
  if (!addonIds) return [];
  try {
    return JSON.parse(addonIds);
  } catch {
    return [];
  }
}

function rowToSandbox(row: typeof sandboxes.$inferSelect): Sandbox {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    slug: row.slug,
    description: row.description ?? undefined,
    repoName: row.repoName,
    githubUrl: row.githubUrl ?? undefined,
    resourceTierId: row.resourceTierId ?? 'starter',
    flavorId: row.flavorId ?? 'js',
    addonIds: parseAddonIds(row.addonIds),
    containerId: row.containerId ?? undefined,
    containerName: row.containerName ?? undefined,
    status: (row.status ?? 'created') as SandboxStatus,
    errorMessage: row.errorMessage ?? undefined,
    opencodeUrl: row.opencodeUrl ?? undefined,
    acpGatewayUrl: row.acpGatewayUrl ?? undefined,
    vncUrl: row.vncUrl ?? undefined,
    codeServerUrl: row.codeServerUrl ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastAccessedAt: row.lastAccessedAt ?? undefined,
  };
}

// =============================================================================
// CRUD Operations (Async)
// =============================================================================

/**
 * Create a new sandbox
 */
export async function createSandbox(input: CreateSandboxInput): Promise<Sandbox> {
  const now = new Date();
  
  const rows = await db
    .insert(sandboxes)
    .values({
      id: input.id,
      userId: input.userId,
      name: input.name,
      slug: input.slug,
      description: input.description ?? null,
      repoName: input.repoName,
      githubUrl: input.githubUrl ?? null,
      resourceTierId: input.resourceTierId ?? 'starter',
      flavorId: input.flavorId ?? 'js',
      addonIds: JSON.stringify(input.addonIds ?? ['code-server']),
      status: 'created',
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  
  const row = rows[0];
  if (!row) {
    throw new Error('Failed to create sandbox');
  }
  
  log.info('Created sandbox', { sandboxId: input.id, userId: input.userId, name: input.name });
  return rowToSandbox(row);
}

/**
 * Get a sandbox by ID
 */
export async function getSandboxById(id: string): Promise<Sandbox | null> {
  const [row] = await db
    .select()
    .from(sandboxes)
    .where(eq(sandboxes.id, id));
  
  return row ? rowToSandbox(row) : null;
}

/**
 * Get a sandbox by user ID and slug
 */
export async function getSandboxBySlug(userId: string, slug: string): Promise<Sandbox | null> {
  const [row] = await db
    .select()
    .from(sandboxes)
    .where(and(eq(sandboxes.userId, userId), eq(sandboxes.slug, slug)));
  
  return row ? rowToSandbox(row) : null;
}

/**
 * Get a sandbox by container ID
 */
export async function getSandboxByContainerId(containerId: string): Promise<Sandbox | null> {
  const rows = await db
    .select()
    .from(sandboxes)
    .where(eq(sandboxes.containerId, containerId));
  
  const row = rows[0];
  return row ? rowToSandbox(row) : null;
}

/**
 * List all sandboxes for a user
 */
export async function listSandboxesByUserId(userId: string): Promise<Sandbox[]> {
  const rows = await db
    .select()
    .from(sandboxes)
    .where(eq(sandboxes.userId, userId))
    .orderBy(desc(sandboxes.createdAt));
  
  return rows.map(rowToSandbox);
}

/**
 * List all sandboxes (admin)
 */
export async function listAllSandboxes(): Promise<Sandbox[]> {
  const rows = await db
    .select()
    .from(sandboxes)
    .orderBy(desc(sandboxes.createdAt));
  
  return rows.map(rowToSandbox);
}

/**
 * List sandboxes by status
 */
export async function listSandboxesByStatus(status: SandboxStatus): Promise<Sandbox[]> {
  const rows = await db
    .select()
    .from(sandboxes)
    .where(eq(sandboxes.status, status))
    .orderBy(desc(sandboxes.createdAt));
  
  return rows.map(rowToSandbox);
}

/**
 * Update a sandbox
 */
export async function updateSandbox(id: string, input: UpdateSandboxInput): Promise<Sandbox | null> {
  const existing = await getSandboxById(id);
  if (!existing) return null;
  
  // Build update object with only defined values
  const updateData: Partial<typeof sandboxes.$inferInsert> = {
    updatedAt: new Date(),
  };
  
  if (input.name !== undefined) updateData.name = input.name;
  if (input.description !== undefined) updateData.description = input.description ?? null;
  if (input.resourceTierId !== undefined) updateData.resourceTierId = input.resourceTierId;
  if (input.flavorId !== undefined) updateData.flavorId = input.flavorId;
  if (input.addonIds !== undefined) updateData.addonIds = JSON.stringify(input.addonIds);
  if (input.containerId !== undefined) updateData.containerId = input.containerId ?? null;
  if (input.containerName !== undefined) updateData.containerName = input.containerName ?? null;
  if (input.status !== undefined) updateData.status = input.status;
  if (input.errorMessage !== undefined) updateData.errorMessage = input.errorMessage ?? null;
  if (input.opencodeUrl !== undefined) updateData.opencodeUrl = input.opencodeUrl ?? null;
  if (input.acpGatewayUrl !== undefined) updateData.acpGatewayUrl = input.acpGatewayUrl ?? null;
  if (input.vncUrl !== undefined) updateData.vncUrl = input.vncUrl ?? null;
  if (input.codeServerUrl !== undefined) updateData.codeServerUrl = input.codeServerUrl ?? null;
  
  const [row] = await db
    .update(sandboxes)
    .set(updateData)
    .where(eq(sandboxes.id, id))
    .returning();
  
  log.info('Updated sandbox', { sandboxId: id, updates: Object.keys(input) });
  return row ? rowToSandbox(row) : null;
}

/**
 * Update sandbox status
 */
export async function updateSandboxStatus(
  id: string,
  status: SandboxStatus,
  errorMessage?: string
): Promise<Sandbox | null> {
  return updateSandbox(id, { status, errorMessage });
}

/**
 * Update last accessed timestamp
 */
export async function touchSandbox(id: string): Promise<void> {
  await db
    .update(sandboxes)
    .set({ lastAccessedAt: new Date() })
    .where(eq(sandboxes.id, id));
}

/**
 * Delete a sandbox
 */
export async function deleteSandbox(id: string): Promise<boolean> {
  const result = await db
    .delete(sandboxes)
    .where(eq(sandboxes.id, id))
    .returning({ id: sandboxes.id });
  
  if (result.length > 0) {
    log.info('Deleted sandbox', { sandboxId: id });
    return true;
  }
  return false;
}

/**
 * Delete all sandboxes for a user
 */
export async function deleteSandboxesByUserId(userId: string): Promise<number> {
  const result = await db
    .delete(sandboxes)
    .where(eq(sandboxes.userId, userId))
    .returning({ id: sandboxes.id });
  
  if (result.length > 0) {
    log.info('Deleted user sandboxes', { userId, count: result.length });
  }
  return result.length;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Check if a slug is available for a user
 */
export async function isSlugAvailable(userId: string, slug: string, excludeId?: string): Promise<boolean> {
  let query = db
    .select({ count: count() })
    .from(sandboxes)
    .where(and(eq(sandboxes.userId, userId), eq(sandboxes.slug, slug)));
  
  if (excludeId) {
    query = db
      .select({ count: count() })
      .from(sandboxes)
      .where(and(
        eq(sandboxes.userId, userId),
        eq(sandboxes.slug, slug),
        sql`${sandboxes.id} != ${excludeId}`
      ));
  }
  
  const [result] = await query;
  return result?.count === 0;
}

/**
 * Generate a unique slug for a user
 */
export async function generateUniqueSlug(userId: string, baseName: string): Promise<string> {
  const baseSlug = baseName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  
  let slug = baseSlug;
  let counter = 1;
  
  while (!(await isSlugAvailable(userId, slug))) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }
  
  return slug;
}

/**
 * Get sandbox counts by status for a user
 */
export async function getSandboxCountsByStatus(userId: string): Promise<Record<SandboxStatus, number>> {
  const rows = await db
    .select({
      status: sandboxes.status,
      count: count(),
    })
    .from(sandboxes)
    .where(eq(sandboxes.userId, userId))
    .groupBy(sandboxes.status);
  
  const counts: Record<SandboxStatus, number> = {
    created: 0,
    starting: 0,
    running: 0,
    stopping: 0,
    stopped: 0,
    error: 0,
  };
  
  for (const row of rows) {
    if (row.status) {
      counts[row.status as SandboxStatus] = row.count;
    }
  }
  
  return counts;
}
