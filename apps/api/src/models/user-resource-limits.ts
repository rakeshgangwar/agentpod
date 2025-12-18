/**
 * User Resource Limits Model
 * 
 * Manages per-user resource constraints for sandboxes.
 * Provides CRUD operations and limit checking utilities.
 */

import { db } from "../db/drizzle";
import { 
  userResourceLimits, 
  DEFAULT_RESOURCE_LIMITS,
  type UserResourceLimits as DBUserResourceLimits,
} from "../db/schema/admin";
import { sandboxes } from "../db/schema/sandboxes";
import { resourceTiers } from "../db/schema/containers";
import { eq, and, inArray, count } from "drizzle-orm";
import { createLogger } from "../utils/logger";

const log = createLogger("user-resource-limits");

// =============================================================================
// Types
// =============================================================================

export interface UserResourceLimits {
  id: string;
  userId: string;
  maxSandboxes: number;
  maxConcurrentRunning: number;
  allowedTierIds: string[];
  maxTierId: string;
  maxTotalStorageGb: number;
  maxTotalCpuCores: number;
  maxTotalMemoryGb: number;
  allowedAddonIds: string[] | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdateUserResourceLimitsInput {
  maxSandboxes?: number;
  maxConcurrentRunning?: number;
  allowedTierIds?: string[];
  maxTierId?: string;
  maxTotalStorageGb?: number;
  maxTotalCpuCores?: number;
  maxTotalMemoryGb?: number;
  allowedAddonIds?: string[] | null;
  notes?: string | null;
}

export interface LimitCheckResult {
  allowed: boolean;
  reason?: string;
  current?: number;
  limit?: number;
}

// =============================================================================
// Helpers
// =============================================================================

function parseJsonArray(value: string | null): string[] {
  if (!value) return [];
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

function rowToLimits(row: DBUserResourceLimits): UserResourceLimits {
  return {
    id: row.id,
    userId: row.userId,
    maxSandboxes: row.maxSandboxes,
    maxConcurrentRunning: row.maxConcurrentRunning,
    allowedTierIds: parseJsonArray(row.allowedTierIds),
    maxTierId: row.maxTierId,
    maxTotalStorageGb: row.maxTotalStorageGb,
    maxTotalCpuCores: row.maxTotalCpuCores,
    maxTotalMemoryGb: row.maxTotalMemoryGb,
    allowedAddonIds: row.allowedAddonIds ? parseJsonArray(row.allowedAddonIds) : null,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// =============================================================================
// CRUD Operations
// =============================================================================

/**
 * Get resource limits for a user
 * Creates default limits if they don't exist
 */
export async function getUserResourceLimits(userId: string): Promise<UserResourceLimits> {
  const [row] = await db
    .select()
    .from(userResourceLimits)
    .where(eq(userResourceLimits.userId, userId));

  if (row) {
    return rowToLimits(row);
  }

  // Create default limits if they don't exist
  return createDefaultResourceLimits(userId);
}

/**
 * Create default resource limits for a user
 */
export async function createDefaultResourceLimits(userId: string): Promise<UserResourceLimits> {
  const id = crypto.randomUUID();
  const now = new Date();

  const [row] = await db
    .insert(userResourceLimits)
    .values({
      id,
      userId,
      maxSandboxes: DEFAULT_RESOURCE_LIMITS.maxSandboxes,
      maxConcurrentRunning: DEFAULT_RESOURCE_LIMITS.maxConcurrentRunning,
      allowedTierIds: JSON.stringify(DEFAULT_RESOURCE_LIMITS.allowedTierIds),
      maxTierId: DEFAULT_RESOURCE_LIMITS.maxTierId,
      maxTotalStorageGb: DEFAULT_RESOURCE_LIMITS.maxTotalStorageGb,
      maxTotalCpuCores: DEFAULT_RESOURCE_LIMITS.maxTotalCpuCores,
      maxTotalMemoryGb: DEFAULT_RESOURCE_LIMITS.maxTotalMemoryGb,
      allowedAddonIds: DEFAULT_RESOURCE_LIMITS.allowedAddonIds
        ? JSON.stringify(DEFAULT_RESOURCE_LIMITS.allowedAddonIds)
        : null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .returning();

  if (row) {
    log.info("Created default resource limits", { userId });
    return rowToLimits(row);
  }

  // If conflict (already exists), fetch and return
  const [existing] = await db
    .select()
    .from(userResourceLimits)
    .where(eq(userResourceLimits.userId, userId));

  if (!existing) {
    throw new Error(`Failed to create or find resource limits for user ${userId}`);
  }

  return rowToLimits(existing);
}

/**
 * Update resource limits for a user
 */
export async function updateUserResourceLimits(
  userId: string,
  input: UpdateUserResourceLimitsInput
): Promise<UserResourceLimits> {
  const updateData: Partial<typeof userResourceLimits.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (input.maxSandboxes !== undefined) {
    updateData.maxSandboxes = input.maxSandboxes;
  }
  if (input.maxConcurrentRunning !== undefined) {
    updateData.maxConcurrentRunning = input.maxConcurrentRunning;
  }
  if (input.allowedTierIds !== undefined) {
    updateData.allowedTierIds = JSON.stringify(input.allowedTierIds);
  }
  if (input.maxTierId !== undefined) {
    updateData.maxTierId = input.maxTierId;
  }
  if (input.maxTotalStorageGb !== undefined) {
    updateData.maxTotalStorageGb = input.maxTotalStorageGb;
  }
  if (input.maxTotalCpuCores !== undefined) {
    updateData.maxTotalCpuCores = input.maxTotalCpuCores;
  }
  if (input.maxTotalMemoryGb !== undefined) {
    updateData.maxTotalMemoryGb = input.maxTotalMemoryGb;
  }
  if (input.allowedAddonIds !== undefined) {
    updateData.allowedAddonIds = input.allowedAddonIds
      ? JSON.stringify(input.allowedAddonIds)
      : null;
  }
  if (input.notes !== undefined) {
    updateData.notes = input.notes;
  }

  const [row] = await db
    .update(userResourceLimits)
    .set(updateData)
    .where(eq(userResourceLimits.userId, userId))
    .returning();

  if (!row) {
    // Create if doesn't exist, then update
    await createDefaultResourceLimits(userId);
    return updateUserResourceLimits(userId, input);
  }

  log.info("Updated resource limits", { userId, changes: Object.keys(input) });
  return rowToLimits(row);
}

/**
 * Delete resource limits for a user (usually called when user is deleted)
 */
export async function deleteUserResourceLimits(userId: string): Promise<boolean> {
  const result = await db
    .delete(userResourceLimits)
    .where(eq(userResourceLimits.userId, userId))
    .returning({ id: userResourceLimits.id });

  return result.length > 0;
}

// =============================================================================
// Limit Checking Functions
// =============================================================================

/**
 * Check if user can create a new sandbox
 */
export async function checkSandboxCreationLimit(userId: string): Promise<LimitCheckResult> {
  const limits = await getUserResourceLimits(userId);

  // Count current sandboxes
  const [result] = await db
    .select({ count: count() })
    .from(sandboxes)
    .where(eq(sandboxes.userId, userId));

  const currentCount = result?.count ?? 0;

  if (currentCount >= limits.maxSandboxes) {
    return {
      allowed: false,
      reason: `Sandbox limit reached. You can have up to ${limits.maxSandboxes} sandbox(es).`,
      current: currentCount,
      limit: limits.maxSandboxes,
    };
  }

  return { allowed: true, current: currentCount, limit: limits.maxSandboxes };
}

/**
 * Check if user can start a sandbox (concurrent running limit)
 */
export async function checkConcurrentRunningLimit(userId: string): Promise<LimitCheckResult> {
  const limits = await getUserResourceLimits(userId);

  // Count running sandboxes
  const [result] = await db
    .select({ count: count() })
    .from(sandboxes)
    .where(and(
      eq(sandboxes.userId, userId),
      eq(sandboxes.status, "running")
    ));

  const runningCount = result?.count ?? 0;

  if (runningCount >= limits.maxConcurrentRunning) {
    return {
      allowed: false,
      reason: `Concurrent running limit reached. Stop a running sandbox before starting another.`,
      current: runningCount,
      limit: limits.maxConcurrentRunning,
    };
  }

  return { allowed: true, current: runningCount, limit: limits.maxConcurrentRunning };
}

/**
 * Check if user can use a specific resource tier
 */
export async function checkTierAllowed(
  userId: string,
  tierId: string
): Promise<LimitCheckResult> {
  const limits = await getUserResourceLimits(userId);

  if (!limits.allowedTierIds.includes(tierId)) {
    return {
      allowed: false,
      reason: `Resource tier '${tierId}' is not available for your account. Allowed tiers: ${limits.allowedTierIds.join(", ")}.`,
    };
  }

  return { allowed: true };
}

/**
 * Check if user can use specific addons
 */
export async function checkAddonsAllowed(
  userId: string,
  addonIds: string[]
): Promise<LimitCheckResult> {
  const limits = await getUserResourceLimits(userId);

  // If allowedAddonIds is null, all addons are allowed
  if (limits.allowedAddonIds === null) {
    return { allowed: true };
  }

  const disallowed = addonIds.filter(id => !limits.allowedAddonIds!.includes(id));

  if (disallowed.length > 0) {
    return {
      allowed: false,
      reason: `Addon(s) not available for your account: ${disallowed.join(", ")}.`,
    };
  }

  return { allowed: true };
}

/**
 * Check aggregate resource usage (CPU cores across all running sandboxes)
 */
export async function checkAggregateResourceLimit(
  userId: string,
  additionalCpuCores: number,
  additionalMemoryGb: number
): Promise<LimitCheckResult> {
  const limits = await getUserResourceLimits(userId);

  // Get all running sandboxes for user
  const runningSandboxes = await db
    .select({
      resourceTierId: sandboxes.resourceTierId,
    })
    .from(sandboxes)
    .where(and(
      eq(sandboxes.userId, userId),
      eq(sandboxes.status, "running")
    ));

  // Get tier IDs
  const tierIds = runningSandboxes.map(s => s.resourceTierId).filter(Boolean) as string[];

  // Calculate current resource usage
  let currentCpuCores = 0;
  let currentMemoryGb = 0;

  if (tierIds.length > 0) {
    const tiers = await db
      .select({
        id: resourceTiers.id,
        cpuCores: resourceTiers.cpuCores,
        memoryGb: resourceTiers.memoryGb,
      })
      .from(resourceTiers)
      .where(inArray(resourceTiers.id, tierIds));

    const tierMap = new Map(tiers.map(t => [t.id, t]));

    for (const sandbox of runningSandboxes) {
      const tier = tierMap.get(sandbox.resourceTierId ?? "starter");
      if (tier) {
        currentCpuCores += tier.cpuCores;
        currentMemoryGb += tier.memoryGb;
      }
    }
  }

  // Check CPU limit
  if (currentCpuCores + additionalCpuCores > limits.maxTotalCpuCores) {
    return {
      allowed: false,
      reason: `CPU limit would be exceeded. Current: ${currentCpuCores} cores, requesting: ${additionalCpuCores} cores, limit: ${limits.maxTotalCpuCores} cores.`,
      current: currentCpuCores,
      limit: limits.maxTotalCpuCores,
    };
  }

  // Check memory limit
  if (currentMemoryGb + additionalMemoryGb > limits.maxTotalMemoryGb) {
    return {
      allowed: false,
      reason: `Memory limit would be exceeded. Current: ${currentMemoryGb}GB, requesting: ${additionalMemoryGb}GB, limit: ${limits.maxTotalMemoryGb}GB.`,
      current: currentMemoryGb,
      limit: limits.maxTotalMemoryGb,
    };
  }

  return { allowed: true };
}

/**
 * Comprehensive limit check for sandbox creation
 */
export async function checkAllLimitsForSandboxCreation(
  userId: string,
  tierId: string,
  addonIds: string[]
): Promise<LimitCheckResult> {
  // Check sandbox count
  const sandboxCheck = await checkSandboxCreationLimit(userId);
  if (!sandboxCheck.allowed) return sandboxCheck;

  // Check tier allowed
  const tierCheck = await checkTierAllowed(userId, tierId);
  if (!tierCheck.allowed) return tierCheck;

  // Check addons allowed
  const addonCheck = await checkAddonsAllowed(userId, addonIds);
  if (!addonCheck.allowed) return addonCheck;

  return { allowed: true };
}

/**
 * Comprehensive limit check for starting a sandbox
 */
export async function checkAllLimitsForSandboxStart(
  userId: string,
  tierId: string
): Promise<LimitCheckResult> {
  // Check concurrent running limit
  const concurrentCheck = await checkConcurrentRunningLimit(userId);
  if (!concurrentCheck.allowed) return concurrentCheck;

  // Get tier resources
  const [tier] = await db
    .select({
      cpuCores: resourceTiers.cpuCores,
      memoryGb: resourceTiers.memoryGb,
    })
    .from(resourceTiers)
    .where(eq(resourceTiers.id, tierId));

  if (tier) {
    // Check aggregate resources
    const aggregateCheck = await checkAggregateResourceLimit(
      userId,
      tier.cpuCores,
      tier.memoryGb
    );
    if (!aggregateCheck.allowed) return aggregateCheck;
  }

  return { allowed: true };
}

// =============================================================================
// Usage Statistics
// =============================================================================

/**
 * Get current resource usage for a user
 */
export async function getUserResourceUsage(userId: string): Promise<{
  sandboxCount: number;
  runningSandboxCount: number;
  totalCpuCores: number;
  totalMemoryGb: number;
}> {
  // Count sandboxes
  const [sandboxResult] = await db
    .select({ count: count() })
    .from(sandboxes)
    .where(eq(sandboxes.userId, userId));

  // Count running sandboxes
  const [runningResult] = await db
    .select({ count: count() })
    .from(sandboxes)
    .where(and(
      eq(sandboxes.userId, userId),
      eq(sandboxes.status, "running")
    ));

  // Get running sandbox tiers for resource calculation
  const runningSandboxes = await db
    .select({ resourceTierId: sandboxes.resourceTierId })
    .from(sandboxes)
    .where(and(
      eq(sandboxes.userId, userId),
      eq(sandboxes.status, "running")
    ));

  const tierIds = runningSandboxes
    .map(s => s.resourceTierId)
    .filter(Boolean) as string[];

  let totalCpuCores = 0;
  let totalMemoryGb = 0;

  if (tierIds.length > 0) {
    const tiers = await db
      .select({
        id: resourceTiers.id,
        cpuCores: resourceTiers.cpuCores,
        memoryGb: resourceTiers.memoryGb,
      })
      .from(resourceTiers)
      .where(inArray(resourceTiers.id, tierIds));

    const tierMap = new Map(tiers.map(t => [t.id, t]));

    for (const sandbox of runningSandboxes) {
      const tier = tierMap.get(sandbox.resourceTierId ?? "starter");
      if (tier) {
        totalCpuCores += tier.cpuCores;
        totalMemoryGb += tier.memoryGb;
      }
    }
  }

  return {
    sandboxCount: sandboxResult?.count ?? 0,
    runningSandboxCount: runningResult?.count ?? 0,
    totalCpuCores,
    totalMemoryGb,
  };
}
