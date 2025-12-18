/**
 * Settings Schema
 *
 * Stores global settings, user OpenCode config, and user preferences.
 */

import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  index,
  unique,
  pgEnum,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

// =============================================================================
// Enums
// =============================================================================
export const themeModeEnum = pgEnum("theme_mode", ["light", "dark", "system"]);

export const openCodeFileTypeEnum = pgEnum("opencode_file_type", [
  "agent",
  "command",
  "tool",
  "plugin",
]);

export const openCodeFileExtensionEnum = pgEnum("opencode_file_extension", [
  "md",
  "ts",
  "js",
]);

// =============================================================================
// Settings Table (Key-Value Store)
// =============================================================================
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// =============================================================================
// User OpenCode Config Table
// =============================================================================
export const userOpencodeConfig = pgTable(
  "user_opencode_config",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: "cascade" }),

    // opencode.json content (Layer 3)
    settings: text("settings").notNull().default("{}"), // JSON

    // AGENTS.md content (optional global instructions)
    agentsMd: text("agents_md"),

    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("user_opencode_config_user_id_idx").on(table.userId)]
);

// =============================================================================
// User OpenCode Files Table
// =============================================================================
export const userOpencodeFiles = pgTable(
  "user_opencode_files",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    // File type and name
    type: openCodeFileTypeEnum("type").notNull(),
    name: text("name").notNull(),
    extension: openCodeFileExtensionEnum("extension").notNull(),

    // File content
    content: text("content").notNull(),

    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("user_opencode_files_user_id_idx").on(table.userId),
    index("user_opencode_files_type_idx").on(table.userId, table.type),
    unique("user_opencode_files_unique").on(
      table.userId,
      table.type,
      table.name
    ),
  ]
);

// =============================================================================
// User Preferences Table
// =============================================================================
export const userPreferences = pgTable(
  "user_preferences",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: "cascade" }),

    // Theme
    themeMode: themeModeEnum("theme_mode").default("system"),
    themePreset: text("theme_preset").default("default-neutral"),

    // App behavior
    autoRefreshInterval: integer("auto_refresh_interval").default(30),
    inAppNotifications: boolean("in_app_notifications").default(true),
    systemNotifications: boolean("system_notifications").default(true),

    // Default sandbox configuration
    defaultResourceTierId: text("default_resource_tier_id").default("starter"),
    defaultFlavorId: text("default_flavor_id").default("js"),
    defaultAddonIds: text("default_addon_ids").default('["code-server"]'), // JSON
    defaultAgentId: text("default_agent_id").default("opencode"),

    // Sync tracking
    settingsVersion: integer("settings_version").default(1),

    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("user_preferences_user_id_idx").on(table.userId)]
);
