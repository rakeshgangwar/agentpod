/**
 * Container Addon Model
 * Optional features that can be added to containers
 */

import { db } from '../db/index.ts';

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
  createdAt: string;
  updatedAt: string;
}

// Database row type
interface ContainerAddonRow {
  id: string;
  name: string;
  description: string | null;
  category: string;
  image_size_mb: number | null;
  port: number | null;
  requires_gpu: number;
  requires_flavor: string | null;
  price_monthly: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// Helpers
// =============================================================================

function rowToContainerAddon(row: ContainerAddonRow): ContainerAddon {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category as AddonCategory,
    imageSizeMb: row.image_size_mb,
    port: row.port,
    requiresGpu: row.requires_gpu === 1,
    requiresFlavor: row.requires_flavor,
    priceMonthly: row.price_monthly,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// =============================================================================
// CRUD Operations
// =============================================================================

/**
 * Get all container addons, ordered by sort_order
 */
export function getAllAddons(): ContainerAddon[] {
  const rows = db.query(`
    SELECT * FROM container_addons 
    ORDER BY sort_order ASC
  `).all() as ContainerAddonRow[];
  
  return rows.map(rowToContainerAddon);
}

/**
 * Get a container addon by ID
 */
export function getAddonById(id: string): ContainerAddon | null {
  const row = db.query(`
    SELECT * FROM container_addons 
    WHERE id = $id
  `).get({ $id: id }) as ContainerAddonRow | null;
  
  return row ? rowToContainerAddon(row) : null;
}

/**
 * Get addons by category
 */
export function getAddonsByCategory(category: AddonCategory): ContainerAddon[] {
  const rows = db.query(`
    SELECT * FROM container_addons 
    WHERE category = $category
    ORDER BY sort_order ASC
  `).all({ $category: category }) as ContainerAddonRow[];
  
  return rows.map(rowToContainerAddon);
}

/**
 * Get addons by IDs
 */
export function getAddonsByIds(ids: string[]): ContainerAddon[] {
  if (ids.length === 0) return [];
  
  const placeholders = ids.map((_, i) => `$id${i}`).join(', ');
  const params = Object.fromEntries(ids.map((id, i) => [`$id${i}`, id]));
  
  const rows = db.query(`
    SELECT * FROM container_addons 
    WHERE id IN (${placeholders})
    ORDER BY sort_order ASC
  `).all(params) as ContainerAddonRow[];
  
  return rows.map(rowToContainerAddon);
}

/**
 * Get addons that don't require GPU
 */
export function getNonGpuAddons(): ContainerAddon[] {
  const rows = db.query(`
    SELECT * FROM container_addons 
    WHERE requires_gpu = 0
    ORDER BY sort_order ASC
  `).all() as ContainerAddonRow[];
  
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
