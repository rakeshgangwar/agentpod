/**
 * Container Addon Model
 * Defines available container add-ons (optional features)
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
  imageSizeMb: number | null;    // Approximate image size in MB
  port: number | null;           // Primary port exposed by addon
  requiresGpu: boolean;          // Whether addon requires GPU
  requiresFlavor: string | null; // Comma-separated flavor IDs that support this addon
  priceMonthly: number;          // Monthly price in USD
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

function rowToAddon(row: ContainerAddonRow): ContainerAddon {
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
  
  return rows.map(rowToAddon);
}

/**
 * Get a container addon by ID
 */
export function getAddonById(id: string): ContainerAddon | null {
  const row = db.query(`
    SELECT * FROM container_addons 
    WHERE id = $id
  `).get({ $id: id }) as ContainerAddonRow | null;
  
  return row ? rowToAddon(row) : null;
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
  
  return rows.map(rowToAddon);
}

/**
 * Get multiple addons by IDs
 */
export function getAddonsByIds(ids: string[]): ContainerAddon[] {
  if (ids.length === 0) return [];
  
  const placeholders = ids.map(() => '?').join(',');
  const rows = db.query(`
    SELECT * FROM container_addons 
    WHERE id IN (${placeholders})
    ORDER BY sort_order ASC
  `).all(...ids) as ContainerAddonRow[];
  
  return rows.map(rowToAddon);
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get Docker image name for a flavor with addon
 */
export function getImageNameForFlavorWithAddon(
  flavorId: string, 
  addonId: string, 
  registry: string, 
  owner: string
): string {
  return `${registry}/${owner}/codeopen-${flavorId}-${addonId}`;
}

/**
 * Check if an addon is compatible with a flavor
 */
export function addonCompatibleWithFlavor(addon: ContainerAddon, flavorId: string): boolean {
  if (!addon.requiresFlavor) {
    return true; // No restriction
  }
  
  const allowedFlavors = addon.requiresFlavor.split(',').map(f => f.trim());
  return allowedFlavors.includes(flavorId);
}

/**
 * Get exposed ports for a set of addons
 */
export function getExposedPortsForAddons(addons: ContainerAddon[]): number[] {
  return addons
    .filter(a => a.port !== null)
    .map(a => a.port as number);
}

/**
 * Calculate total additional image size for addons
 */
export function getTotalAddonSize(addons: ContainerAddon[]): number {
  return addons.reduce((total, addon) => total + (addon.imageSizeMb || 0), 0);
}

/**
 * Calculate total monthly price for addons
 */
export function getTotalAddonPrice(addons: ContainerAddon[]): number {
  return addons.reduce((total, addon) => total + addon.priceMonthly, 0);
}
