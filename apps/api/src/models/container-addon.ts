/**
 * Container Addon Model
 * Optional features that can be added to containers
 * 
 * MIGRATED: Now uses PostgreSQL via Drizzle ORM
 */

import { db } from '../db/drizzle';
import { containerAddons } from '../db/schema/containers';
import { eq, asc, inArray } from 'drizzle-orm';

// =============================================================================
// Types
// =============================================================================

export type AddonCategory = 'interface' | 'compute' | 'storage' | 'devops';

export interface ContainerAddon {
  id: string;                    // 'gui', 'code-server', 'gpu', 'databases', 'cloud'
  name: string;                  // Display name
  description: string | null;    // Description of the addon
  category: AddonCategory;       // Category for grouping
  imageSizeMb: number | null;    // Additional image size in MB
  port: number | null;           // Port exposed by the addon (if any)
  requiresGpu: boolean;          // Whether the addon requires GPU
  requiresFlavor: string | null; // Required flavor (if any)
  priceMonthly: number;          // Additional price per month in USD
  sortOrder: number;             // Display order
  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// Helpers
// =============================================================================

function rowToContainerAddon(row: typeof containerAddons.$inferSelect): ContainerAddon {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category as AddonCategory,
    imageSizeMb: row.imageSizeMb,
    port: row.port,
    requiresGpu: row.requiresGpu,
    requiresFlavor: row.requiresFlavor,
    priceMonthly: row.priceMonthly,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// =============================================================================
// CRUD Operations (Async)
// =============================================================================

/**
 * Get all container addons, ordered by sort_order
 */
export async function getAllAddons(): Promise<ContainerAddon[]> {
  const rows = await db
    .select()
    .from(containerAddons)
    .orderBy(asc(containerAddons.sortOrder));
  
  return rows.map(rowToContainerAddon);
}

/**
 * Get a container addon by ID
 */
export async function getAddonById(id: string): Promise<ContainerAddon | null> {
  const [row] = await db
    .select()
    .from(containerAddons)
    .where(eq(containerAddons.id, id));
  
  return row ? rowToContainerAddon(row) : null;
}

/**
 * Get addons by category
 */
export async function getAddonsByCategory(category: AddonCategory): Promise<ContainerAddon[]> {
  const rows = await db
    .select()
    .from(containerAddons)
    .where(eq(containerAddons.category, category))
    .orderBy(asc(containerAddons.sortOrder));
  
  return rows.map(rowToContainerAddon);
}

/**
 * Get addons by IDs
 */
export async function getAddonsByIds(ids: string[]): Promise<ContainerAddon[]> {
  if (ids.length === 0) return [];
  
  const rows = await db
    .select()
    .from(containerAddons)
    .where(inArray(containerAddons.id, ids))
    .orderBy(asc(containerAddons.sortOrder));
  
  return rows.map(rowToContainerAddon);
}

/**
 * Get addons that don't require GPU
 */
export async function getNonGpuAddons(): Promise<ContainerAddon[]> {
  const rows = await db
    .select()
    .from(containerAddons)
    .where(eq(containerAddons.requiresGpu, false))
    .orderBy(asc(containerAddons.sortOrder));
  
  return rows.map(rowToContainerAddon);
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get all ports exposed by a list of addons
 */
export function getExposedPorts(addons: ContainerAddon[]): number[] {
  return addons
    .filter(addon => addon.port !== null)
    .map(addon => addon.port as number);
}

/**
 * Calculate total additional price for addons
 */
export function calculateAddonsPrice(addons: ContainerAddon[]): number {
  return addons.reduce((total, addon) => total + addon.priceMonthly, 0);
}

/**
 * Check if addons configuration is valid
 */
export function validateAddons(
  addons: ContainerAddon[],
  flavorId: string,
  hasGpu: boolean
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const addon of addons) {
    // Check GPU requirement
    if (addon.requiresGpu && !hasGpu) {
      errors.push(`Addon '${addon.id}' requires GPU support`);
    }

    // Check flavor requirement
    if (addon.requiresFlavor && addon.requiresFlavor !== flavorId) {
      errors.push(`Addon '${addon.id}' requires flavor '${addon.requiresFlavor}'`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
