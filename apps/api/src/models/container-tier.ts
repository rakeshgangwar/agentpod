/**
 * Container Tier Model
 * Defines available container tiers with resource limits
 */

import { db } from '../db/index.ts';

// =============================================================================
// Types
// =============================================================================

export interface ContainerTier {
  id: string;                    // 'lite', 'standard', 'pro', 'desktop'
  name: string;                  // Display name
  description: string | null;    // Description of the tier
  image_type: 'cli' | 'desktop'; // Image type to use
  cpu_limit: string;             // Docker CPU limit (e.g., '1', '2', '4')
  memory_limit: string;          // Docker memory limit (e.g., '2Gi', '4Gi')
  memory_reservation: string | null; // Docker memory reservation
  storage_gb: number;            // Storage allocation in GB
  has_desktop_access: boolean;   // Whether VNC/noVNC is available
  is_default: boolean;           // Default tier for new projects
  sort_order: number;            // Display order
  created_at: string;
  updated_at: string;
}

// Database row type (sqlite uses 0/1 for booleans)
interface ContainerTierRow {
  id: string;
  name: string;
  description: string | null;
  image_type: string;
  cpu_limit: string;
  memory_limit: string;
  memory_reservation: string | null;
  storage_gb: number;
  has_desktop_access: number;
  is_default: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// Helpers
// =============================================================================

function rowToTier(row: ContainerTierRow): ContainerTier {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    image_type: row.image_type as 'cli' | 'desktop',
    cpu_limit: row.cpu_limit,
    memory_limit: row.memory_limit,
    memory_reservation: row.memory_reservation,
    storage_gb: row.storage_gb,
    has_desktop_access: row.has_desktop_access === 1,
    is_default: row.is_default === 1,
    sort_order: row.sort_order,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// =============================================================================
// CRUD Operations
// =============================================================================

/**
 * Get all container tiers, ordered by sort_order
 */
export function getAllTiers(): ContainerTier[] {
  const rows = db.query(`
    SELECT * FROM container_tiers 
    ORDER BY sort_order ASC
  `).all() as ContainerTierRow[];
  
  return rows.map(rowToTier);
}

/**
 * Get a container tier by ID
 */
export function getTierById(id: string): ContainerTier | null {
  const row = db.query(`
    SELECT * FROM container_tiers 
    WHERE id = $id
  `).get({ $id: id }) as ContainerTierRow | null;
  
  return row ? rowToTier(row) : null;
}

/**
 * Get the default container tier
 */
export function getDefaultTier(): ContainerTier | null {
  const row = db.query(`
    SELECT * FROM container_tiers 
    WHERE is_default = 1
    LIMIT 1
  `).get() as ContainerTierRow | null;
  
  return row ? rowToTier(row) : null;
}

/**
 * Get container tiers by image type
 */
export function getTiersByImageType(imageType: 'cli' | 'desktop'): ContainerTier[] {
  const rows = db.query(`
    SELECT * FROM container_tiers 
    WHERE image_type = $imageType
    ORDER BY sort_order ASC
  `).all({ $imageType: imageType }) as ContainerTierRow[];
  
  return rows.map(rowToTier);
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get the Docker image name for a tier
 */
export function getImageNameForTier(tier: ContainerTier, registry: string, owner: string): string {
  const imageName = tier.image_type === 'desktop' ? 'opencode-desktop' : 'opencode-cli';
  return `${registry}/${owner}/${imageName}`;
}

/**
 * Get the Docker resource limits for a tier (for Coolify API)
 */
export function getResourceLimitsForTier(tier: ContainerTier): {
  limits_memory: string;
  limits_memory_reservation: string;
  limits_cpus: string;
} {
  return {
    limits_memory: tier.memory_limit,
    limits_memory_reservation: tier.memory_reservation || tier.memory_limit,
    limits_cpus: tier.cpu_limit,
  };
}

/**
 * Get exposed ports for a tier
 * All tiers expose: OpenCode (4096) + Code Server (8080)
 * Desktop tier additionally exposes: noVNC (6080)
 */
export function getExposedPortsForTier(tier: ContainerTier): string {
  if (tier.has_desktop_access) {
    // OpenCode + Code Server + noVNC
    return '4096,8080,6080';
  }
  // OpenCode + Code Server
  return '4096,8080';
}
