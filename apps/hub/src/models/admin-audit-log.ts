/**
 * Admin Audit Log Model
 * 
 * Records all admin actions for accountability and debugging.
 * Provides functions to log and query admin actions.
 */

import { db } from "../db/drizzle";
import { 
  adminAuditLog,
  type AdminAction,
} from "../db/schema/admin";
import { user } from "../db/schema/auth";
import { eq, desc, and, gte, lte, sql, inArray } from "drizzle-orm";
import { createLogger } from "../utils/logger";

const log = createLogger("admin-audit-log");

// =============================================================================
// Types
// =============================================================================

export interface AdminAuditLogEntry {
  id: string;
  adminUserId: string;
  adminEmail?: string;
  adminName?: string;
  action: AdminAction;
  targetUserId: string | null;
  targetEmail?: string;
  targetName?: string;
  targetResourceId: string | null;
  targetResourceType: string | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}

export interface LogAdminActionInput {
  adminUserId: string;
  action: AdminAction;
  targetUserId?: string;
  targetResourceId?: string;
  targetResourceType?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuditLogQueryOptions {
  adminUserId?: string;
  targetUserId?: string;
  action?: AdminAction;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

// =============================================================================
// Helpers
// =============================================================================

function parseDetails(details: string | null): Record<string, unknown> | null {
  if (!details) return null;
  try {
    return JSON.parse(details);
  } catch {
    return null;
  }
}

// =============================================================================
// Logging Functions
// =============================================================================

/**
 * Log an admin action
 */
export async function logAdminAction(input: LogAdminActionInput): Promise<string> {
  const id = crypto.randomUUID();

  await db.insert(adminAuditLog).values({
    id,
    adminUserId: input.adminUserId,
    action: input.action,
    targetUserId: input.targetUserId ?? null,
    targetResourceId: input.targetResourceId ?? null,
    targetResourceType: input.targetResourceType ?? null,
    details: input.details ? JSON.stringify(input.details) : null,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
  });

  log.info("Admin action logged", {
    id,
    action: input.action,
    adminUserId: input.adminUserId,
    targetUserId: input.targetUserId,
  });

  return id;
}

/**
 * Helper to log user ban action
 */
export async function logUserBan(
  adminUserId: string,
  targetUserId: string,
  reason: string,
  ipAddress?: string,
  userAgent?: string
): Promise<string> {
  return logAdminAction({
    adminUserId,
    action: "user_ban",
    targetUserId,
    details: { reason },
    ipAddress,
    userAgent,
  });
}

/**
 * Helper to log user unban action
 */
export async function logUserUnban(
  adminUserId: string,
  targetUserId: string,
  ipAddress?: string,
  userAgent?: string
): Promise<string> {
  return logAdminAction({
    adminUserId,
    action: "user_unban",
    targetUserId,
    ipAddress,
    userAgent,
  });
}

/**
 * Helper to log role change action
 */
export async function logRoleChange(
  adminUserId: string,
  targetUserId: string,
  oldRole: string,
  newRole: string,
  ipAddress?: string,
  userAgent?: string
): Promise<string> {
  return logAdminAction({
    adminUserId,
    action: "user_role_change",
    targetUserId,
    details: { oldRole, newRole },
    ipAddress,
    userAgent,
  });
}

/**
 * Helper to log resource limits update
 */
export async function logLimitsUpdate(
  adminUserId: string,
  targetUserId: string,
  changes: Record<string, unknown>,
  ipAddress?: string,
  userAgent?: string
): Promise<string> {
  return logAdminAction({
    adminUserId,
    action: "limits_update",
    targetUserId,
    details: { changes },
    ipAddress,
    userAgent,
  });
}

/**
 * Helper to log sandbox force delete
 */
export async function logSandboxForceDelete(
  adminUserId: string,
  targetUserId: string,
  sandboxId: string,
  sandboxName: string,
  ipAddress?: string,
  userAgent?: string
): Promise<string> {
  return logAdminAction({
    adminUserId,
    action: "sandbox_force_delete",
    targetUserId,
    targetResourceId: sandboxId,
    targetResourceType: "sandbox",
    details: { sandboxName },
    ipAddress,
    userAgent,
  });
}

/**
 * Helper to log sandbox force stop
 */
export async function logSandboxForceStop(
  adminUserId: string,
  targetUserId: string,
  sandboxId: string,
  sandboxName: string,
  ipAddress?: string,
  userAgent?: string
): Promise<string> {
  return logAdminAction({
    adminUserId,
    action: "sandbox_force_stop",
    targetUserId,
    targetResourceId: sandboxId,
    targetResourceType: "sandbox",
    details: { sandboxName },
    ipAddress,
    userAgent,
  });
}

/**
 * Helper to log settings update
 */
export async function logSettingsUpdate(
  adminUserId: string,
  settingKey: string,
  newValue: string,
  ipAddress?: string,
  userAgent?: string
): Promise<string> {
  return logAdminAction({
    adminUserId,
    action: "settings_update",
    targetResourceId: settingKey,
    targetResourceType: "setting",
    details: { settingKey, newValue },
    ipAddress,
    userAgent,
  });
}

/**
 * Helper to log user creation by admin
 */
export async function logUserCreate(
  adminUserId: string,
  targetUserId: string,
  email: string,
  role: string,
  ipAddress?: string,
  userAgent?: string
): Promise<string> {
  return logAdminAction({
    adminUserId,
    action: "user_create",
    targetUserId,
    details: { email, role },
    ipAddress,
    userAgent,
  });
}

// =============================================================================
// Query Functions
// =============================================================================

/**
 * Get audit log entries with filters
 */
export async function getAuditLogs(
  options: AuditLogQueryOptions = {}
): Promise<{ entries: AdminAuditLogEntry[]; total: number }> {
  const {
    adminUserId,
    targetUserId,
    action,
    startDate,
    endDate,
    limit = 50,
    offset = 0,
  } = options;

  // Build conditions
  const conditions = [];
  
  if (adminUserId) {
    conditions.push(eq(adminAuditLog.adminUserId, adminUserId));
  }
  if (targetUserId) {
    conditions.push(eq(adminAuditLog.targetUserId, targetUserId));
  }
  if (action) {
    conditions.push(eq(adminAuditLog.action, action));
  }
  if (startDate) {
    conditions.push(gte(adminAuditLog.createdAt, startDate));
  }
  if (endDate) {
    conditions.push(lte(adminAuditLog.createdAt, endDate));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Get total count
  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(adminAuditLog)
    .where(whereClause);

  const total = countResult?.count ?? 0;

  // Get entries
  const rows = await db
    .select({
      id: adminAuditLog.id,
      adminUserId: adminAuditLog.adminUserId,
      action: adminAuditLog.action,
      targetUserId: adminAuditLog.targetUserId,
      targetResourceId: adminAuditLog.targetResourceId,
      targetResourceType: adminAuditLog.targetResourceType,
      details: adminAuditLog.details,
      ipAddress: adminAuditLog.ipAddress,
      userAgent: adminAuditLog.userAgent,
      createdAt: adminAuditLog.createdAt,
    })
    .from(adminAuditLog)
    .where(whereClause)
    .orderBy(desc(adminAuditLog.createdAt))
    .limit(limit)
    .offset(offset);

  // Fetch user info for entries
  const adminUserIds = [...new Set(rows.map(r => r.adminUserId))];
  const targetUserIds = [...new Set(rows.map(r => r.targetUserId).filter(Boolean))] as string[];

  const allUserIds = [...new Set([...adminUserIds, ...targetUserIds])];
  
  const users = allUserIds.length > 0
    ? await db
        .select({ id: user.id, email: user.email, name: user.name })
        .from(user)
        .where(inArray(user.id, allUserIds))
    : [];

  const userMap = new Map(users.map(u => [u.id, u]));

  const entries: AdminAuditLogEntry[] = rows.map(row => {
    const adminInfo = userMap.get(row.adminUserId);
    const targetInfo = row.targetUserId ? userMap.get(row.targetUserId) : undefined;

    return {
      id: row.id,
      adminUserId: row.adminUserId,
      adminEmail: adminInfo?.email,
      adminName: adminInfo?.name,
      action: row.action as AdminAction,
      targetUserId: row.targetUserId,
      targetEmail: targetInfo?.email,
      targetName: targetInfo?.name,
      targetResourceId: row.targetResourceId,
      targetResourceType: row.targetResourceType,
      details: parseDetails(row.details),
      ipAddress: row.ipAddress,
      userAgent: row.userAgent,
      createdAt: row.createdAt,
    };
  });

  return { entries, total };
}

/**
 * Get audit log entries for a specific user (as target)
 */
export async function getAuditLogsForUser(
  targetUserId: string,
  limit = 50,
  offset = 0
): Promise<{ entries: AdminAuditLogEntry[]; total: number }> {
  return getAuditLogs({ targetUserId, limit, offset });
}

/**
 * Get audit log entries by a specific admin
 */
export async function getAuditLogsByAdmin(
  adminUserId: string,
  limit = 50,
  offset = 0
): Promise<{ entries: AdminAuditLogEntry[]; total: number }> {
  return getAuditLogs({ adminUserId, limit, offset });
}

/**
 * Get recent audit log entries
 */
export async function getRecentAuditLogs(
  limit = 20
): Promise<AdminAuditLogEntry[]> {
  const result = await getAuditLogs({ limit });
  return result.entries;
}
