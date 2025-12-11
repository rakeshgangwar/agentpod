/**
 * Application settings and user configuration types.
 */

/** Application theme */
export type Theme = "light" | "dark" | "system";

/** Application settings stored locally */
export interface AppSettings {
  theme: Theme;
  api_url: string;
  api_token?: string;
}

/** Connection status to the API */
export interface ConnectionStatus {
  connected: boolean;
  api_url: string;
  version?: string;
  error?: string;
}

/** Export data structure for backup/restore */
export interface ExportData {
  version: string;
  exported_at: string;
  settings: AppSettings;
  providers?: unknown[];
}

/** Permission level for OpenCode operations */
export type PermissionLevel = "allow" | "ask" | "deny";

/** Permission settings for different operations */
export interface PermissionSettings {
  file_read: PermissionLevel;
  file_write: PermissionLevel;
  file_delete: PermissionLevel;
  shell_execute: PermissionLevel;
  network: PermissionLevel;
}

/** User OpenCode settings */
export interface UserOpencodeSettings {
  provider: string;
  model: string;
  permissions: PermissionSettings;
}

/** OpenCode configuration file (agents, commands, etc.) */
export interface UserOpencodeFile {
  name: string;
  content: string;
  type: "agents" | "commands" | "mcp" | "config";
}

/** Complete user OpenCode configuration */
export interface UserOpencodeConfig {
  settings: UserOpencodeSettings;
  files: UserOpencodeFile[];
}
