/**
 * Resource Tier Model
 * Defines available resource tiers with CPU, memory, and storage limits
 * Replaces the old container-tier model with a more granular resource allocation
 */

import { db } from '../db/index.ts';

// =============================================================================
// Types
// =============================================================================

export interface ResourceTier {
  id: string;                    // 'starter', 'builder', 'creator', 'power'
  name: string;                  // Display name
  description: string | null;    // Description of the tier
  cpuCores: number;              // Number of CPU cores
  memoryGb: number;              // Memory in GB
  storageGb: number;             // Storage in GB
  priceMonthly: number;          // Price per month in USD
  isDefault: boolean;            // Default tier for new projects
  sortOrder: number;             // Display order
  createdAt: string;
  updatedAt: string;
}

// Database row type (sqlite uses 0/1 for booleans)
interface ResourceTierRow {
  id: string;
  name: string;
  description: string | null;
  cpu_cores: number;
  memory_gb: number;
  storage_gb: number;
  price_monthly: number;
  is_default: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// Helpers
// =============================================================================

function rowToResourceTier(row: ResourceTierRow): ResourceTier {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    cpuCores: row.cpu_cores,
    memoryGb: row.memory_gb,
    storageGb: row.storage_gb,
    priceMonthly: row.price_monthly,
    isDefault: row.is_default === 1,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// =============================================================================
// CRUD Operations
// =============================================================================

/**
 * Get all resource tiers, ordered by sort_order
 */
export function getAllResourceTiers(): ResourceTier[] {
  const rows = db.query(`
    SELECT * FROM resource_tiers 
    ORDER BY sort_order ASC
  `).all() as ResourceTierRow[];
  
  return rows.map(rowToResourceTier);
}

/**
 * Get a resource tier by ID
 */
export function getResourceTierById(id: string): ResourceTier | null {
  const row = db.query(`
    SELECT * FROM resource_tiers 
    WHERE id = $id
  `).get({ $id: id }) as ResourceTierRow | null;
  
  return row ? rowToResourceTier(row) : null;
}

/**
 * Get the default resource tier
 */
export function getDefaultResourceTier(): ResourceTier | null {
  const row = db.query(`
    SELECT * FROM resource_tiers 
    WHERE is_default = 1
    LIMIT 1
  `).get() as ResourceTierRow | null;
  
  return row ? rowToResourceTier(row) : null;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get Docker resource limits for a tier (for Coolify API)
 * Note: Docker Compose expects lowercase 'g' suffix (e.g., '2g'), not 'Gi' (Kubernetes notation)
 */
export function getResourceLimits(tier: ResourceTier): {
  limits_memory: string;
  limits_memory_reservation: string;
  limits_cpus: string;
} {
  return {
    limits_memory: `${tier.memoryGb}g`,
    limits_memory_reservation: `${Math.floor(tier.memoryGb * 0.75)}g`,
    limits_cpus: String(tier.cpuCores),
  };
}

/**
 * Check if a tier has enough resources for GPU workloads
 */
export function hasGpuCapacity(tier: ResourceTier): boolean {
  // GPU workloads typically need at least 4 cores and 8GB RAM
  return tier.cpuCores >= 4 && tier.memoryGb >= 8;
}
