/**
 * Activity Log Model
 * Tracks user actions for audit trail and analytics
 * 90-day retention, then archived (anonymized)
 */

import { db } from '../db/drizzle';
import { activityLog, activityLogArchive } from '../db/schema/activity';
import { eq, and, lte, desc, sql, count } from 'drizzle-orm';
import { createLogger } from '../utils/logger.ts';

const log = createLogger('activity-log-model');

// =============================================================================
// Types
// =============================================================================

// Standard action types
export type ActivityAction =
  | 'auth.login'
  | 'auth.logout'
  | 'auth.token_refresh'
  | 'sandbox.create'
  | 'sandbox.start'
  | 'sandbox.stop'
  | 'sandbox.delete'
  | 'sandbox.update'
  | 'chat.session_create'
  | 'chat.message_send'
  | 'chat.message_receive'
  | 'chat.session_archive'
  | 'preferences.update'
  | 'provider.configure'
  | 'provider.oauth_complete'
  | string;  // Allow custom actions

export type EntityType = 'user' | 'sandbox' | 'chat_session' | 'chat_message' | 'provider' | string;

export interface ActivityLog {
  id: string;
  userId?: string;
  action: ActivityAction;
  entityType?: EntityType;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  anonymized: boolean;
  createdAt: string;
}

export interface ActivityLogArchive {
  id: string;
  action: ActivityAction;
  entityType?: EntityType;
  metadata?: Record<string, unknown>;
  originalCreatedAt: string;
  archivedAt: string;
}

export interface CreateActivityLogInput {
  userId?: string;
  action: ActivityAction;
  entityType?: EntityType;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

// =============================================================================
// Helpers
// =============================================================================

function rowToActivityLog(row: typeof activityLog.$inferSelect): ActivityLog {
  return {
    id: row.id,
    userId: row.userId ?? undefined,
    action: row.action as ActivityAction,
    entityType: (row.entityType as EntityType) ?? undefined,
    entityId: row.entityId ?? undefined,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    ipAddress: row.ipAddress ?? undefined,
    userAgent: row.userAgent ?? undefined,
    anonymized: row.anonymized ?? false,
    createdAt: row.createdAt.toISOString(),
  };
}

function rowToActivityLogArchive(row: typeof activityLogArchive.$inferSelect): ActivityLogArchive {
  return {
    id: row.id,
    action: row.action as ActivityAction,
    entityType: (row.entityType as EntityType) ?? undefined,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    originalCreatedAt: row.originalCreatedAt.toISOString(),
    archivedAt: row.archivedAt.toISOString(),
  };
}

// =============================================================================
// CRUD Operations
// =============================================================================

/**
 * Create an activity log entry
 */
export async function createActivityLog(input: CreateActivityLogInput): Promise<ActivityLog> {
  const id = crypto.randomUUID();
  const now = new Date();
  
  await db.insert(activityLog).values({
    id,
    userId: input.userId ?? null,
    action: input.action,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
    createdAt: now,
  });
  
  log.debug('Created activity log', { id, action: input.action, userId: input.userId });
  const created = await getActivityLogById(id);
  return created!;
}

/**
 * Get an activity log by ID
 */
export async function getActivityLogById(id: string): Promise<ActivityLog | null> {
  const [row] = await db.select().from(activityLog).where(eq(activityLog.id, id));
  return row ? rowToActivityLog(row) : null;
}

/**
 * List activity logs for a user (paginated)
 */
export async function listActivityLogsByUserId(
  userId: string,
  options?: { limit?: number; offset?: number; action?: ActivityAction }
): Promise<ActivityLog[]> {
  const conditions = [eq(activityLog.userId, userId)];
  
  if (options?.action) {
    conditions.push(eq(activityLog.action, options.action));
  }
  
  let query = db
    .select()
    .from(activityLog)
    .where(and(...conditions))
    .orderBy(desc(activityLog.createdAt));
  
  if (options?.limit) {
    query = query.limit(options.limit) as typeof query;
  }
  if (options?.offset) {
    query = query.offset(options.offset) as typeof query;
  }
  
  const rows = await query;
  return rows.map(rowToActivityLog);
}

/**
 * List activity logs for an entity
 */
export async function listActivityLogsByEntity(
  entityType: EntityType,
  entityId: string,
  options?: { limit?: number }
): Promise<ActivityLog[]> {
  let query = db
    .select()
    .from(activityLog)
    .where(and(
      eq(activityLog.entityType, entityType),
      eq(activityLog.entityId, entityId)
    ))
    .orderBy(desc(activityLog.createdAt));
  
  if (options?.limit) {
    query = query.limit(options.limit) as typeof query;
  }
  
  const rows = await query;
  return rows.map(rowToActivityLog);
}

/**
 * Count activity logs for a user
 */
export async function countActivityLogsByUserId(userId: string): Promise<number> {
  const [result] = await db
    .select({ count: count() })
    .from(activityLog)
    .where(eq(activityLog.userId, userId));
  
  return result?.count ?? 0;
}

// =============================================================================
// Archival Operations
// =============================================================================

/**
 * Archive logs older than specified days
 * Returns number of archived records
 */
export async function archiveOldLogs(daysOld: number = 90): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);
  
  // Get logs to archive
  const oldLogs = await db
    .select()
    .from(activityLog)
    .where(and(
      lte(activityLog.createdAt, cutoffDate),
      eq(activityLog.anonymized, false)
    ));
  
  if (oldLogs.length === 0) {
    return 0;
  }
  
  // Archive each log (anonymize metadata)
  const now = new Date();
  for (const logRow of oldLogs) {
    // Remove PII from metadata
    let sanitizedMetadata: Record<string, unknown> | null = null;
    if (logRow.metadata) {
      const metadata = JSON.parse(logRow.metadata);
      // Remove known PII fields
      delete metadata.email;
      delete metadata.name;
      delete metadata.ip;
      delete metadata.userAgent;
      if (Object.keys(metadata).length > 0) {
        sanitizedMetadata = metadata;
      }
    }
    
    // Insert into archive
    await db.insert(activityLogArchive).values({
      id: logRow.id,
      action: logRow.action,
      entityType: logRow.entityType,
      metadata: sanitizedMetadata ? JSON.stringify(sanitizedMetadata) : null,
      originalCreatedAt: logRow.createdAt,
      archivedAt: now,
    });
  }
  
  // Delete archived logs from main table
  await db
    .delete(activityLog)
    .where(and(
      lte(activityLog.createdAt, cutoffDate),
      eq(activityLog.anonymized, false)
    ));
  
  const archivedCount = oldLogs.length;
  log.info('Archived old activity logs', { 
    archived: archivedCount, 
    cutoffDate: cutoffDate.toISOString() 
  });
  
  return archivedCount;
}

/**
 * Anonymize logs for a deleted user
 * Called during user deletion
 */
export async function anonymizeUserLogs(userId: string): Promise<number> {
  // Get logs to anonymize
  const logsToAnonymize = await db
    .select()
    .from(activityLog)
    .where(eq(activityLog.userId, userId));
  
  if (logsToAnonymize.length === 0) {
    return 0;
  }
  
  // Update each log to remove PII
  for (const logRow of logsToAnonymize) {
    let sanitizedMetadata: string | null = null;
    if (logRow.metadata) {
      const metadata = JSON.parse(logRow.metadata);
      delete metadata.email;
      delete metadata.name;
      delete metadata.ip;
      delete metadata.userAgent;
      if (Object.keys(metadata).length > 0) {
        sanitizedMetadata = JSON.stringify(metadata);
      }
    }
    
    await db
      .update(activityLog)
      .set({
        userId: null,
        anonymized: true,
        ipAddress: null,
        userAgent: null,
        metadata: sanitizedMetadata,
      })
      .where(eq(activityLog.id, logRow.id));
  }
  
  const count = logsToAnonymize.length;
  log.info('Anonymized user activity logs', { userId, count });
  
  return count;
}

// =============================================================================
// Archive Queries
// =============================================================================

/**
 * List archived activity logs (for analytics)
 */
export async function listArchivedLogs(
  options?: { limit?: number; offset?: number; action?: ActivityAction }
): Promise<ActivityLogArchive[]> {
  const conditions = [];
  
  if (options?.action) {
    conditions.push(eq(activityLogArchive.action, options.action));
  }
  
  let query = db
    .select()
    .from(activityLogArchive)
    .orderBy(desc(activityLogArchive.originalCreatedAt));
  
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as typeof query;
  }
  
  if (options?.limit) {
    query = query.limit(options.limit) as typeof query;
  }
  if (options?.offset) {
    query = query.offset(options.offset) as typeof query;
  }
  
  const rows = await query;
  return rows.map(rowToActivityLogArchive);
}

/**
 * Get activity statistics by action type
 */
export async function getActivityStats(
  options?: { startDate?: string; endDate?: string }
): Promise<Array<{ action: string; count: number }>> {
  const conditions = [];
  
  if (options?.startDate) {
    conditions.push(sql`${activityLog.createdAt} >= ${new Date(options.startDate)}`);
  }
  if (options?.endDate) {
    conditions.push(sql`${activityLog.createdAt} <= ${new Date(options.endDate)}`);
  }
  
  let query = db
    .select({
      action: activityLog.action,
      count: count(),
    })
    .from(activityLog)
    .groupBy(activityLog.action)
    .orderBy(desc(count()));
  
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as typeof query;
  }
  
  const rows = await query;
  return rows.map(r => ({ action: r.action, count: r.count }));
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Log a user login event
 */
export async function logLogin(
  userId: string,
  ipAddress?: string,
  userAgent?: string
): Promise<ActivityLog> {
  return createActivityLog({
    userId,
    action: 'auth.login',
    entityType: 'user',
    entityId: userId,
    ipAddress,
    userAgent,
  });
}

/**
 * Log a sandbox creation event
 */
export async function logSandboxCreate(
  userId: string,
  sandboxId: string,
  sandboxName: string
): Promise<ActivityLog> {
  return createActivityLog({
    userId,
    action: 'sandbox.create',
    entityType: 'sandbox',
    entityId: sandboxId,
    metadata: { sandboxName },
  });
}

/**
 * Log a chat message event
 */
export async function logChatMessage(
  userId: string,
  sessionId: string,
  messageId: string,
  role: 'user' | 'assistant'
): Promise<ActivityLog> {
  return createActivityLog({
    userId,
    action: role === 'user' ? 'chat.message_send' : 'chat.message_receive',
    entityType: 'chat_message',
    entityId: messageId,
    metadata: { sessionId, role },
  });
}
