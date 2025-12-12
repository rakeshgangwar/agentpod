/**
 * User Preferences Model
 * Server-side storage for user app settings
 * Enables bidirectional sync across devices
 */

import { db } from '../db/index.ts';
import { createLogger } from '../utils/logger.ts';

const log = createLogger('user-preferences-model');

// =============================================================================
// Types
// =============================================================================

export type ThemeMode = 'light' | 'dark' | 'system';

export interface UserPreferences {
  id: string;
  userId: string;
  
  // Theme
  themeMode: ThemeMode;
  themePreset: string;
  
  // App behavior
  autoRefreshInterval: number;
  inAppNotifications: boolean;
  systemNotifications: boolean;
  
  // Default sandbox configuration
  defaultResourceTierId: string;
  defaultFlavorId: string;
  defaultAddonIds: string[];
  defaultAgentId: string;
  
  // Sync tracking
  settingsVersion: number;
  
  // Timestamps
  createdAt: string;
  updatedAt: string;
}

export interface UpdateUserPreferencesInput {
  themeMode?: ThemeMode;
  themePreset?: string;
  autoRefreshInterval?: number;
  inAppNotifications?: boolean;
  systemNotifications?: boolean;
  defaultResourceTierId?: string;
  defaultFlavorId?: string;
  defaultAddonIds?: string[];
  defaultAgentId?: string;
}

// Database row type
interface UserPreferencesRow {
  id: string;
  user_id: string;
  theme_mode: string;
  theme_preset: string;
  auto_refresh_interval: number;
  in_app_notifications: number;
  system_notifications: number;
  default_resource_tier_id: string;
  default_flavor_id: string;
  default_addon_ids: string;
  default_agent_id: string;
  settings_version: number;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// Helpers
// =============================================================================

function rowToUserPreferences(row: UserPreferencesRow): UserPreferences {
  return {
    id: row.id,
    userId: row.user_id,
    themeMode: row.theme_mode as ThemeMode,
    themePreset: row.theme_preset,
    autoRefreshInterval: row.auto_refresh_interval,
    inAppNotifications: row.in_app_notifications === 1,
    systemNotifications: row.system_notifications === 1,
    defaultResourceTierId: row.default_resource_tier_id,
    defaultFlavorId: row.default_flavor_id,
    defaultAddonIds: JSON.parse(row.default_addon_ids || '["code-server"]'),
    defaultAgentId: row.default_agent_id,
    settingsVersion: row.settings_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// =============================================================================
// CRUD Operations
// =============================================================================

/**
 * Get user preferences by user ID
 */
export function getUserPreferences(userId: string): UserPreferences | null {
  const row = db.query<UserPreferencesRow, [string]>(
    'SELECT * FROM user_preferences WHERE user_id = ?'
  ).get(userId);
  
  return row ? rowToUserPreferences(row) : null;
}

/**
 * Create default preferences for a user
 */
export function createUserPreferences(userId: string): UserPreferences {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  
  db.run(
    `INSERT INTO user_preferences (
      id, user_id, theme_mode, theme_preset, auto_refresh_interval,
      in_app_notifications, system_notifications, default_resource_tier_id,
      default_flavor_id, default_addon_ids, default_agent_id, settings_version,
      created_at, updated_at
    ) VALUES (?, ?, 'system', 'default-neutral', 30, 1, 1, 'starter', 
              'fullstack', '["code-server"]', 'opencode', 1, ?, ?)`,
    [id, userId, now, now]
  );
  
  log.info('Created user preferences', { userId });
  return getUserPreferences(userId)!;
}

/**
 * Get or create user preferences
 */
export function getOrCreateUserPreferences(userId: string): UserPreferences {
  const existing = getUserPreferences(userId);
  if (existing) return existing;
  return createUserPreferences(userId);
}

/**
 * Update user preferences
 */
export function updateUserPreferences(
  userId: string,
  input: UpdateUserPreferencesInput
): UserPreferences | null {
  const existing = getUserPreferences(userId);
  if (!existing) return null;
  
  const updates: string[] = [];
  const values: (string | number | null)[] = [];
  
  if (input.themeMode !== undefined) {
    updates.push('theme_mode = ?');
    values.push(input.themeMode);
  }
  if (input.themePreset !== undefined) {
    updates.push('theme_preset = ?');
    values.push(input.themePreset);
  }
  if (input.autoRefreshInterval !== undefined) {
    updates.push('auto_refresh_interval = ?');
    values.push(input.autoRefreshInterval);
  }
  if (input.inAppNotifications !== undefined) {
    updates.push('in_app_notifications = ?');
    values.push(input.inAppNotifications ? 1 : 0);
  }
  if (input.systemNotifications !== undefined) {
    updates.push('system_notifications = ?');
    values.push(input.systemNotifications ? 1 : 0);
  }
  if (input.defaultResourceTierId !== undefined) {
    updates.push('default_resource_tier_id = ?');
    values.push(input.defaultResourceTierId);
  }
  if (input.defaultFlavorId !== undefined) {
    updates.push('default_flavor_id = ?');
    values.push(input.defaultFlavorId);
  }
  if (input.defaultAddonIds !== undefined) {
    updates.push('default_addon_ids = ?');
    values.push(JSON.stringify(input.defaultAddonIds));
  }
  if (input.defaultAgentId !== undefined) {
    updates.push('default_agent_id = ?');
    values.push(input.defaultAgentId);
  }
  
  if (updates.length === 0) return existing;
  
  // Increment version for sync tracking
  updates.push('settings_version = settings_version + 1');
  updates.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(userId);
  
  db.run(
    `UPDATE user_preferences SET ${updates.join(', ')} WHERE user_id = ?`,
    values
  );
  
  log.info('Updated user preferences', { userId, updates: Object.keys(input) });
  return getUserPreferences(userId);
}

/**
 * Delete user preferences
 */
export function deleteUserPreferences(userId: string): boolean {
  const result = db.run('DELETE FROM user_preferences WHERE user_id = ?', [userId]);
  
  if (result.changes > 0) {
    log.info('Deleted user preferences', { userId });
    return true;
  }
  return false;
}

// =============================================================================
// Sync Utilities
// =============================================================================

/**
 * Get current settings version
 */
export function getSettingsVersion(userId: string): number {
  const result = db.query<{ settings_version: number }, [string]>(
    'SELECT settings_version FROM user_preferences WHERE user_id = ?'
  ).get(userId);
  
  return result?.settings_version ?? 0;
}

/**
 * Check if local version is out of sync
 */
export function isOutOfSync(userId: string, localVersion: number): boolean {
  const serverVersion = getSettingsVersion(userId);
  return serverVersion > localVersion;
}
