/**
 * Database Test Helpers
 * 
 * Utilities for setting up and tearing down test database state.
 */

import { db } from '../../src/db/index';
import type { 
  SandboxData, 
  UserData, 
  ChatSessionData, 
  ChatMessageData,
  UserPreferencesData,
  ActivityLogData,
  ProviderConfigData,
} from './factories';

// ============================================================================
// Types
// ============================================================================

export interface SeedData {
  users?: UserData[];
  sandboxes?: SandboxData[];
  chatSessions?: ChatSessionData[];
  chatMessages?: ChatMessageData[];
  userPreferences?: UserPreferencesData[];
  activityLogs?: ActivityLogData[];
  providerConfigs?: ProviderConfigData[];
}

// ============================================================================
// Database Operations
// ============================================================================

/**
 * Clear all data from the test database
 */
export async function clearDatabase(): Promise<void> {
  
  // Delete in order to respect foreign key constraints
  // (child tables first, then parent tables)
  const tables = [
    'chat_messages',
    'chat_sessions',
    'activity_log',
    'activity_log_archive',
    'user_preferences',
    'provider_configs',
    'sandboxes',
    'repositories',
    'resource_tiers',
    // Better Auth tables
    'session',
    'account',
    'verification',
    'user',
  ];

  for (const table of tables) {
    try {
      db.run(`DELETE FROM ${table}`);
    } catch {
      // Table might not exist, continue
    }
  }
}

/**
 * Seed the database with test data
 */
export async function seedDatabase(data: SeedData): Promise<void> {

  // Insert users
  if (data.users) {
    const stmt = db.prepare(`
      INSERT INTO user (id, email, name, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const user of data.users) {
      stmt.run(user.id, user.email, user.name, user.createdAt, user.updatedAt);
    }
  }

  // Insert sandboxes
  if (data.sandboxes) {
    const stmt = db.prepare(`
      INSERT INTO sandboxes (id, user_id, name, container_id, flavor, status, port, created_at, updated_at, last_accessed_at, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const sandbox of data.sandboxes) {
      stmt.run(
        sandbox.id,
        sandbox.userId,
        sandbox.name,
        sandbox.containerId,
        sandbox.flavor,
        sandbox.status,
        sandbox.port,
        sandbox.createdAt,
        sandbox.updatedAt,
        sandbox.lastAccessedAt,
        sandbox.metadata ? JSON.stringify(sandbox.metadata) : null
      );
    }
  }

  // Insert chat sessions
  if (data.chatSessions) {
    const stmt = db.prepare(`
      INSERT INTO chat_sessions (id, sandbox_id, user_id, session_type, external_session_id, title, created_at, updated_at, last_message_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const session of data.chatSessions) {
      stmt.run(
        session.id,
        session.sandboxId,
        session.userId,
        session.sessionType,
        session.externalSessionId,
        session.title,
        session.createdAt,
        session.updatedAt,
        session.lastMessageAt
      );
    }
  }

  // Insert chat messages
  if (data.chatMessages) {
    const stmt = db.prepare(`
      INSERT INTO chat_messages (id, session_id, role, content, parts, tool_calls, created_at, token_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const message of data.chatMessages) {
      stmt.run(
        message.id,
        message.sessionId,
        message.role,
        message.content,
        message.parts,
        message.toolCalls,
        message.createdAt,
        message.tokenCount
      );
    }
  }

  // Insert user preferences
  if (data.userPreferences) {
    const stmt = db.prepare(`
      INSERT INTO user_preferences (id, user_id, category, key, value, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const pref of data.userPreferences) {
      stmt.run(
        pref.id,
        pref.userId,
        pref.category,
        pref.key,
        pref.value,
        pref.createdAt,
        pref.updatedAt
      );
    }
  }

  // Insert activity logs
  if (data.activityLogs) {
    const stmt = db.prepare(`
      INSERT INTO activity_log (id, user_id, action, resource_type, resource_id, metadata, ip_address, user_agent, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const log of data.activityLogs) {
      stmt.run(
        log.id,
        log.userId,
        log.action,
        log.resourceType,
        log.resourceId,
        log.metadata,
        log.ipAddress,
        log.userAgent,
        log.createdAt
      );
    }
  }

  // Insert provider configs
  if (data.providerConfigs) {
    const stmt = db.prepare(`
      INSERT INTO provider_configs (id, user_id, provider_id, api_key, is_enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const config of data.providerConfigs) {
      stmt.run(
        config.id,
        config.userId,
        config.providerId,
        config.apiKey,
        config.isEnabled ? 1 : 0,
        config.createdAt,
        config.updatedAt
      );
    }
  }
}

/**
 * Get count of records in a table
 */
export function getTableCount(table: string): number {
  const result = db.query(`SELECT COUNT(*) as count FROM ${table}`).get() as { count: number };
  return result.count;
}

/**
 * Get a record by ID from a table
 */
export function getById<T>(table: string, id: string): T | null {
  return db.query(`SELECT * FROM ${table} WHERE id = ?`).get(id) as T | null;
}

/**
 * Check if a record exists
 */
export function exists(table: string, id: string): boolean {
  return getById(table, id) !== null;
}

/**
 * Run a raw SQL query (for complex test scenarios)
 */
export function rawQuery<T>(sql: string, params: unknown[] = []): T[] {
  return db.query(sql).all(...params) as T[];
}

/**
 * Run a raw SQL statement (for inserts, updates, deletes)
 */
export function rawRun(sql: string, params: unknown[] = []): void {
  db.run(sql, ...params);
}
