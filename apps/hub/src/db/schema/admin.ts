/**
 * Admin Schema
 *
 * Tables for admin functionality:
 * - system_settings: Global system configuration
 * - user_resource_limits: Per-user resource constraints
 * - admin_audit_log: Audit trail for admin actions
 */

import {
  pgTable,
  text,
  timestamp,
  integer,
  index,
  boolean,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

// =============================================================================
// System Settings Table
// =============================================================================

/**
 * System Settings
 * 
 * Global configuration for the system.
 * Uses a key-value pattern for flexibility.
 */
export const systemSettings = pgTable(
  "system_settings",
  {
    key: text("key").primaryKey(),
    value: text("value").notNull(),
    description: text("description"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
  }
);

export type SystemSetting = typeof systemSettings.$inferSelect;
export type InsertSystemSetting = typeof systemSettings.$inferInsert;

// =============================================================================
// User Resource Limits Table
// =============================================================================

/**
 * User Resource Limits
 * 
 * Defines per-user constraints on sandbox creation and resource usage.
 * Each user has exactly one limits record, created automatically on signup.
 */
export const userResourceLimits = pgTable(
  "user_resource_limits",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" })
      .unique(),

    // Sandbox limits
    maxSandboxes: integer("max_sandboxes").notNull().default(1),
    maxConcurrentRunning: integer("max_concurrent_running").notNull().default(1),

    // Tier restrictions (JSON array of allowed tier IDs)
    allowedTierIds: text("allowed_tier_ids").notNull().default('["starter"]'),
    maxTierId: text("max_tier_id").notNull().default("starter"),

    // Storage limits (in GB)
    maxTotalStorageGb: integer("max_total_storage_gb").notNull().default(10),

    // Aggregate resource limits (across all running sandboxes)
    maxTotalCpuCores: integer("max_total_cpu_cores").notNull().default(2),
    maxTotalMemoryGb: integer("max_total_memory_gb").notNull().default(4),

    // Addon restrictions (JSON array, null = all allowed)
    allowedAddonIds: text("allowed_addon_ids"),

    // Admin notes (for internal documentation)
    notes: text("notes"),

    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("user_resource_limits_user_id_idx").on(table.userId),
  ]
);

// =============================================================================
// Admin Audit Log Table
// =============================================================================

/**
 * Admin Audit Log
 * 
 * Records all admin actions for accountability and debugging.
 * Immutable log - entries are never deleted or modified.
 */
export const adminAuditLog = pgTable(
  "admin_audit_log",
  {
    id: text("id").primaryKey(),
    
    // Who performed the action
    adminUserId: text("admin_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "set null" }),
    
    // What action was performed
    action: text("action").notNull(),
    
    // Who/what was affected
    targetUserId: text("target_user_id")
      .references(() => user.id, { onDelete: "set null" }),
    targetResourceId: text("target_resource_id"),
    targetResourceType: text("target_resource_type"),
    
    // Action-specific details (JSON)
    details: text("details"),
    
    // Request context
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    
    // Timestamp
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("admin_audit_log_admin_user_id_idx").on(table.adminUserId),
    index("admin_audit_log_target_user_id_idx").on(table.targetUserId),
    index("admin_audit_log_action_idx").on(table.action),
    index("admin_audit_log_created_at_idx").on(table.createdAt),
  ]
);

// =============================================================================
// Type Exports
// =============================================================================

export type UserResourceLimits = typeof userResourceLimits.$inferSelect;
export type InsertUserResourceLimits = typeof userResourceLimits.$inferInsert;

export type AdminAuditLog = typeof adminAuditLog.$inferSelect;
export type InsertAdminAuditLog = typeof adminAuditLog.$inferInsert;

/**
 * Admin action types for audit logging
 */
export type AdminAction =
  | "user_ban"
  | "user_unban"
  | "user_role_change"
  | "user_create"
  | "limits_update"
  | "sandbox_force_delete"
  | "sandbox_force_stop"
  | "settings_update";

/**
 * Default resource limits for new users
 */
export const DEFAULT_RESOURCE_LIMITS = {
  maxSandboxes: 1,
  maxConcurrentRunning: 1,
  allowedTierIds: ["starter"],
  maxTierId: "starter",
  maxTotalStorageGb: 10,
  maxTotalCpuCores: 2,
  maxTotalMemoryGb: 4,
  allowedAddonIds: null as string[] | null,
} as const;
