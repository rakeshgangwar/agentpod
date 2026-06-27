/**
 * Resource Tier Model
 * Defines available resource tiers with CPU, memory, and storage limits
 * Replaces the old container-tier model with a more granular resource allocation
 * 
 * MIGRATED: Now uses PostgreSQL via Drizzle ORM
 */

import { db } from '../db/drizzle';
import { resourceTiers } from '../db/schema/containers';
import { eq, asc } from 'drizzle-orm';

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
  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// CRUD Operations (Async)
// =============================================================================

/**
 * Get all resource tiers, ordered by sort_order
 */
export async function getAllResourceTiers(): Promise<ResourceTier[]> {
  const rows = await db
    .select()
    .from(resourceTiers)
    .orderBy(asc(resourceTiers.sortOrder));
  
  return rows.map(row => ({
    id: row.id,
    name: row.name,
    description: row.description,
    cpuCores: row.cpuCores,
    memoryGb: row.memoryGb,
    storageGb: row.storageGb,
    priceMonthly: row.priceMonthly,
    isDefault: row.isDefault,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

/**
 * Get a resource tier by ID
 */
export async function getResourceTierById(id: string): Promise<ResourceTier | null> {
  const [row] = await db
    .select()
    .from(resourceTiers)
    .where(eq(resourceTiers.id, id));
  
  if (!row) return null;
  
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    cpuCores: row.cpuCores,
    memoryGb: row.memoryGb,
    storageGb: row.storageGb,
    priceMonthly: row.priceMonthly,
    isDefault: row.isDefault,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Get the default resource tier
 */
export async function getDefaultResourceTier(): Promise<ResourceTier | null> {
  const [row] = await db
    .select()
    .from(resourceTiers)
    .where(eq(resourceTiers.isDefault, true))
    .limit(1);
  
  if (!row) return null;
  
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    cpuCores: row.cpuCores,
    memoryGb: row.memoryGb,
    storageGb: row.storageGb,
    priceMonthly: row.priceMonthly,
    isDefault: row.isDefault,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
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
