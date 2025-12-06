/**
 * User OpenCode Config Model
 * Manages user's global OpenCode settings (opencode.json, agents, commands, tools, plugins)
 * 
 * These settings are loaded at container startup via:
 * - OPENCODE_CONFIG: Points to user's opencode.json settings
 * - OPENCODE_CONFIG_DIR: Points to user's config directory (agents, commands, etc.)
 */

import { db } from '../db/index.ts';
import { createLogger } from '../utils/logger.ts';

const log = createLogger('user-opencode-config');

// =============================================================================
// Types
// =============================================================================

export interface OpencodeSettings {
  $schema?: string;
  theme?: string;
  model?: string;
  small_model?: string;
  autoupdate?: boolean;
  share?: string;
  keybinds?: Record<string, string>;
  permission?: {
    bash?: string | Record<string, string>;
    write?: string;
    edit?: string;
    webfetch?: string;
    mcp?: string;
    doom_loop?: string;
    external_directory?: string;
  };
  tools?: Record<string, boolean>;
  mcp?: Record<string, {
    type: 'local' | 'remote';
    command?: string[];
    url?: string;
    enabled?: boolean;
    environment?: Record<string, string>;
    headers?: Record<string, string>;
    timeout?: number;
  }>;
  agent?: Record<string, {
    description?: string;
    mode?: 'primary' | 'subagent' | 'all';
    model?: string;
    temperature?: number;
    maxSteps?: number;
    prompt?: string;
    tools?: Record<string, boolean>;
    permission?: Record<string, string | Record<string, string>>;
  }>;
  command?: Record<string, {
    template: string;
    description?: string;
    agent?: string;
    model?: string;
    subtask?: boolean;
  }>;
  instructions?: string[];
  disabled_providers?: string[];
  provider?: Record<string, {
    npm?: string;
    name?: string;
    options?: Record<string, unknown>;
    models?: Record<string, unknown>;
  }>;
}

export interface UserOpencodeConfig {
  id: string;
  userId: string;
  settings: OpencodeSettings;
  agentsMd?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserOpencodeFile {
  id: string;
  userId: string;
  type: 'agent' | 'command' | 'tool' | 'plugin';
  name: string;
  extension: 'md' | 'ts' | 'js';
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserOpencodeFullConfig {
  settings: OpencodeSettings;
  agents_md?: string;
  files: Array<{
    type: string;
    name: string;
    extension: string;
    content: string;
  }>;
}

// =============================================================================
// User Config CRUD
// =============================================================================

/**
 * Get user's OpenCode config (settings + AGENTS.md)
 */
export function getUserOpencodeConfig(userId: string): UserOpencodeConfig | null {
  const row = db.query<{
    id: string;
    user_id: string;
    settings: string;
    agents_md: string | null;
    created_at: string;
    updated_at: string;
  }, [string]>(
    'SELECT * FROM user_opencode_config WHERE user_id = ?'
  ).get(userId);

  if (!row) return null;

  return {
    id: row.id,
    userId: row.user_id,
    settings: JSON.parse(row.settings || '{}'),
    agentsMd: row.agents_md ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Create or update user's OpenCode config
 */
export function upsertUserOpencodeConfig(
  userId: string,
  settings: OpencodeSettings,
  agentsMd?: string
): UserOpencodeConfig {
  const existing = getUserOpencodeConfig(userId);
  const now = new Date().toISOString();

  if (existing) {
    db.run(
      `UPDATE user_opencode_config 
       SET settings = ?, agents_md = ?, updated_at = ? 
       WHERE user_id = ?`,
      [JSON.stringify(settings), agentsMd ?? null, now, userId]
    );
    log.info('Updated user OpenCode config', { userId });
  } else {
    const id = crypto.randomUUID();
    db.run(
      `INSERT INTO user_opencode_config (id, user_id, settings, agents_md, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, userId, JSON.stringify(settings), agentsMd ?? null, now, now]
    );
    log.info('Created user OpenCode config', { userId });
  }

  return getUserOpencodeConfig(userId)!;
}

/**
 * Update only the settings portion
 */
export function updateUserOpencodeSettings(
  userId: string,
  settings: OpencodeSettings
): UserOpencodeConfig {
  const existing = getUserOpencodeConfig(userId);
  return upsertUserOpencodeConfig(userId, settings, existing?.agentsMd);
}

/**
 * Update only the AGENTS.md portion
 */
export function updateUserAgentsMd(
  userId: string,
  agentsMd: string
): UserOpencodeConfig {
  const existing = getUserOpencodeConfig(userId);
  return upsertUserOpencodeConfig(userId, existing?.settings ?? {}, agentsMd);
}

/**
 * Delete user's OpenCode config
 */
export function deleteUserOpencodeConfig(userId: string): boolean {
  const result = db.run('DELETE FROM user_opencode_config WHERE user_id = ?', [userId]);
  if (result.changes > 0) {
    log.info('Deleted user OpenCode config', { userId });
    return true;
  }
  return false;
}

// =============================================================================
// User Files CRUD
// =============================================================================

/**
 * List all files for a user
 */
export function listUserOpencodeFiles(
  userId: string,
  type?: 'agent' | 'command' | 'tool' | 'plugin'
): UserOpencodeFile[] {
  let query = 'SELECT * FROM user_opencode_files WHERE user_id = ?';
  const params: (string)[] = [userId];

  if (type) {
    query += ' AND type = ?';
    params.push(type);
  }

  query += ' ORDER BY type, name';

  const rows = db.query<{
    id: string;
    user_id: string;
    type: string;
    name: string;
    extension: string;
    content: string;
    created_at: string;
    updated_at: string;
  }, (string)[]>(query).all(...params);

  return rows.map(row => ({
    id: row.id,
    userId: row.user_id,
    type: row.type as 'agent' | 'command' | 'tool' | 'plugin',
    name: row.name,
    extension: row.extension as 'md' | 'ts' | 'js',
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/**
 * Get a specific file
 */
export function getUserOpencodeFile(
  userId: string,
  type: string,
  name: string
): UserOpencodeFile | null {
  const row = db.query<{
    id: string;
    user_id: string;
    type: string;
    name: string;
    extension: string;
    content: string;
    created_at: string;
    updated_at: string;
  }, [string, string, string]>(
    'SELECT * FROM user_opencode_files WHERE user_id = ? AND type = ? AND name = ?'
  ).get(userId, type, name);

  if (!row) return null;

  return {
    id: row.id,
    userId: row.user_id,
    type: row.type as 'agent' | 'command' | 'tool' | 'plugin',
    name: row.name,
    extension: row.extension as 'md' | 'ts' | 'js',
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Create or update a file
 */
export function upsertUserOpencodeFile(
  userId: string,
  type: 'agent' | 'command' | 'tool' | 'plugin',
  name: string,
  extension: 'md' | 'ts' | 'js',
  content: string
): UserOpencodeFile {
  const existing = getUserOpencodeFile(userId, type, name);
  const now = new Date().toISOString();

  if (existing) {
    db.run(
      `UPDATE user_opencode_files 
       SET extension = ?, content = ?, updated_at = ? 
       WHERE user_id = ? AND type = ? AND name = ?`,
      [extension, content, now, userId, type, name]
    );
    log.info('Updated user OpenCode file', { userId, type, name });
  } else {
    const id = crypto.randomUUID();
    db.run(
      `INSERT INTO user_opencode_files (id, user_id, type, name, extension, content, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, userId, type, name, extension, content, now, now]
    );
    log.info('Created user OpenCode file', { userId, type, name });
  }

  return getUserOpencodeFile(userId, type, name)!;
}

/**
 * Delete a file
 */
export function deleteUserOpencodeFile(
  userId: string,
  type: string,
  name: string
): boolean {
  const result = db.run(
    'DELETE FROM user_opencode_files WHERE user_id = ? AND type = ? AND name = ?',
    [userId, type, name]
  );
  if (result.changes > 0) {
    log.info('Deleted user OpenCode file', { userId, type, name });
    return true;
  }
  return false;
}

/**
 * Delete all files of a type
 */
export function deleteUserOpencodeFilesByType(
  userId: string,
  type: string
): number {
  const result = db.run(
    'DELETE FROM user_opencode_files WHERE user_id = ? AND type = ?',
    [userId, type]
  );
  if (result.changes > 0) {
    log.info('Deleted user OpenCode files', { userId, type, count: result.changes });
  }
  return result.changes;
}

/**
 * Delete all files for a user
 */
export function deleteAllUserOpencodeFiles(userId: string): number {
  const result = db.run(
    'DELETE FROM user_opencode_files WHERE user_id = ?',
    [userId]
  );
  if (result.changes > 0) {
    log.info('Deleted all user OpenCode files', { userId, count: result.changes });
  }
  return result.changes;
}

// =============================================================================
// Full Config (for container fetch)
// =============================================================================

/**
 * Get full user config (settings + files) for container startup
 * This is what the entrypoint script fetches
 */
export function getUserOpencodeFullConfig(userId: string): UserOpencodeFullConfig {
  const config = getUserOpencodeConfig(userId);
  const files = listUserOpencodeFiles(userId);

  return {
    settings: config?.settings ?? {},
    agents_md: config?.agentsMd,
    files: files.map(f => ({
      type: f.type,
      name: f.name,
      extension: f.extension,
      content: f.content,
    })),
  };
}

// =============================================================================
// Default Config
// =============================================================================

/**
 * Get default settings for new users
 */
export function getDefaultOpencodeSettings(): OpencodeSettings {
  return {
    $schema: 'https://opencode.ai/config.json',
    // Theme and model left unset (use platform defaults)
    // Permissions left unset (use platform defaults)
  };
}

/**
 * Initialize config for a new user with defaults
 */
export function initializeUserOpencodeConfig(userId: string): UserOpencodeConfig {
  const existing = getUserOpencodeConfig(userId);
  if (existing) return existing;

  return upsertUserOpencodeConfig(userId, getDefaultOpencodeSettings());
}
