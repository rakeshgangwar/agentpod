/**
 * Activity Log Model
 * Tracks user actions for audit trail and analytics
 * 90-day retention, then archived (anonymized)
 */

import { db } from '../db/index.ts';
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

// Database row types
interface ActivityLogRow {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: string | null;
  ip_address: string | null;
  user_agent: string | null;
  anonymized: number;
  created_at: string;
}

interface ActivityLogArchiveRow {
  id: string;
  action: string;
  entity_type: string | null;
  metadata: string | null;
  original_created_at: string;
  archived_at: string;
}

// =============================================================================
// Helpers
// =============================================================================

function rowToActivityLog(row: ActivityLogRow): ActivityLog {
  return {
    id: row.id,
    userId: row.user_id ?? undefined,
    action: row.action as ActivityAction,
    entityType: row.entity_type as EntityType ?? undefined,
    entityId: row.entity_id ?? undefined,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    ipAddress: row.ip_address ?? undefined,
    userAgent: row.user_agent ?? undefined,
    anonymized: row.anonymized === 1,
    createdAt: row.created_at,
  };
}

function rowToActivityLogArchive(row: ActivityLogArchiveRow): ActivityLogArchive {
  return {
    id: row.id,
    action: row.action as ActivityAction,
    entityType: row.entity_type as EntityType ?? undefined,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    originalCreatedAt: row.original_created_at,
    archivedAt: row.archived_at,
  };
}

// =============================================================================
// CRUD Operations
// =============================================================================

/**
 * Create an activity log entry
 */
export function createActivityLog(input: CreateActivityLogInput): ActivityLog {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  
  db.run(
    `INSERT INTO activity_log (
      id, user_id, action, entity_type, entity_id, metadata,
      ip_address, user_agent, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.userId ?? null,
      input.action,
      input.entityType ?? null,
      input.entityId ?? null,
      input.metadata ? JSON.stringify(input.metadata) : null,
      input.ipAddress ?? null,
      input.userAgent ?? null,
      now,
    ]
  );
  
  log.debug('Created activity log', { id, action: input.action, userId: input.userId });
  return getActivityLogById(id)!;
}

/**
 * Get an activity log by ID
 */
export function getActivityLogById(id: string): ActivityLog | null {
  const row = db.query<ActivityLogRow, [string]>(
    'SELECT * FROM activity_log WHERE id = ?'
  ).get(id);
  
  return row ? rowToActivityLog(row) : null;
}

/**
 * List activity logs for a user (paginated)
 */
export function listActivityLogsByUserId(
  userId: string,
  options?: { limit?: number; offset?: number; action?: ActivityAction }
): ActivityLog[] {
  let query = 'SELECT * FROM activity_log WHERE user_id = ?';
  const params: (string | number)[] = [userId];
  
  if (options?.action) {
    query += ' AND action = ?';
    params.push(options.action);
  }
  
  query += ' ORDER BY created_at DESC';
  
  if (options?.limit) {
    query += ' LIMIT ?';
    params.push(options.limit);
    
    if (options?.offset) {
      query += ' OFFSET ?';
      params.push(options.offset);
    }
  }
  
  const rows = db.query<ActivityLogRow, (string | number)[]>(query).all(...params);
  return rows.map(rowToActivityLog);
}

/**
 * List activity logs for an entity
 */
export function listActivityLogsByEntity(
  entityType: EntityType,
  entityId: string,
  options?: { limit?: number }
): ActivityLog[] {
  let query = 'SELECT * FROM activity_log WHERE entity_type = ? AND entity_id = ? ORDER BY created_at DESC';
  const params: (string | number)[] = [entityType, entityId];
  
  if (options?.limit) {
    query += ' LIMIT ?';
    params.push(options.limit);
  }
  
  const rows = db.query<ActivityLogRow, (string | number)[]>(query).all(...params);
  return rows.map(rowToActivityLog);
}

/**
 * Count activity logs for a user
 */
export function countActivityLogsByUserId(userId: string): number {
  const result = db.query<{ count: number }, [string]>(
    'SELECT COUNT(*) as count FROM activity_log WHERE user_id = ?'
  ).get(userId);
  
  return result?.count ?? 0;
}

// =============================================================================
// Archival Operations
// =============================================================================

/**
 * Archive logs older than specified days
 * Returns number of archived records
 */
export function archiveOldLogs(daysOld: number = 90): number {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);
  const cutoffIso = cutoffDate.toISOString();
  
  // Get logs to archive
  const oldLogs = db.query<ActivityLogRow, [string]>(
    `SELECT * FROM activity_log 
     WHERE created_at < ? AND anonymized = 0`
  ).all(cutoffIso);
  
  if (oldLogs.length === 0) {
    return 0;
  }
  
  // Archive each log (anonymize metadata)
  const now = new Date().toISOString();
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
    db.run(
      `INSERT INTO activity_log_archive (
        id, action, entity_type, metadata, original_created_at, archived_at
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        logRow.id,
        logRow.action,
        logRow.entity_type,
        sanitizedMetadata ? JSON.stringify(sanitizedMetadata) : null,
        logRow.created_at,
        now,
      ]
    );
  }
  
  // Delete archived logs from main table
  const deleteResult = db.run(
    'DELETE FROM activity_log WHERE created_at < ? AND anonymized = 0',
    [cutoffIso]
  );
  
  log.info('Archived old activity logs', { 
    archived: deleteResult.changes, 
    cutoffDate: cutoffIso 
  });
  
  return deleteResult.changes;
}

/**
 * Anonymize logs for a deleted user
 * Called during user deletion
 */
export function anonymizeUserLogs(userId: string): number {
  const result = db.run(
    `UPDATE activity_log 
     SET user_id = NULL, 
         anonymized = 1,
         ip_address = NULL,
         user_agent = NULL,
         metadata = json_remove(COALESCE(metadata, '{}'), '$.email', '$.name', '$.ip', '$.userAgent')
     WHERE user_id = ?`,
    [userId]
  );
  
  if (result.changes > 0) {
    log.info('Anonymized user activity logs', { userId, count: result.changes });
  }
  
  return result.changes;
}

// =============================================================================
// Archive Queries
// =============================================================================

/**
 * List archived activity logs (for analytics)
 */
export function listArchivedLogs(
  options?: { limit?: number; offset?: number; action?: ActivityAction }
): ActivityLogArchive[] {
  let query = 'SELECT * FROM activity_log_archive';
  const params: (string | number)[] = [];
  
  if (options?.action) {
    query += ' WHERE action = ?';
    params.push(options.action);
  }
  
  query += ' ORDER BY original_created_at DESC';
  
  if (options?.limit) {
    query += ' LIMIT ?';
    params.push(options.limit);
    
    if (options?.offset) {
      query += ' OFFSET ?';
      params.push(options.offset);
    }
  }
  
  const rows = db.query<ActivityLogArchiveRow, (string | number)[]>(query).all(...params);
  return rows.map(rowToActivityLogArchive);
}

/**
 * Get activity statistics by action type
 */
export function getActivityStats(
  options?: { startDate?: string; endDate?: string }
): Array<{ action: string; count: number }> {
  let query = 'SELECT action, COUNT(*) as count FROM activity_log';
  const params: string[] = [];
  const conditions: string[] = [];
  
  if (options?.startDate) {
    conditions.push('created_at >= ?');
    params.push(options.startDate);
  }
  if (options?.endDate) {
    conditions.push('created_at <= ?');
    params.push(options.endDate);
  }
  
  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }
  
  query += ' GROUP BY action ORDER BY count DESC';
  
  const rows = db.query<{ action: string; count: number }, string[]>(query).all(...params);
  return rows;
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Log a user login event
 */
export function logLogin(
  userId: string,
  ipAddress?: string,
  userAgent?: string
): ActivityLog {
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
export function logSandboxCreate(
  userId: string,
  sandboxId: string,
  sandboxName: string
): ActivityLog {
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
export function logChatMessage(
  userId: string,
  sessionId: string,
  messageId: string,
  role: 'user' | 'assistant'
): ActivityLog {
  return createActivityLog({
    userId,
    action: role === 'user' ? 'chat.message_send' : 'chat.message_receive',
    entityType: 'chat_message',
    entityId: messageId,
    metadata: { sessionId, role },
  });
}
