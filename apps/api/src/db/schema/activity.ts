/**
 * Activity Schema
 *
 * Activity logging with 90-day retention, then archived (anonymized).
 * Supports audit trail and analytics.
 */

import {
  pgTable,
  text,
  timestamp,
  boolean,
  index,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

// =============================================================================
// Activity Log Table (90-day retention)
// =============================================================================
export const activityLog = pgTable(
  "activity_log",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),

    // Action details
    action: text("action").notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),

    // Context
    metadata: text("metadata"), // JSON
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),

    // For anonymization
    anonymized: boolean("anonymized").default(false),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("activity_log_user_idx").on(table.userId),
    index("activity_log_action_idx").on(table.action),
    index("activity_log_entity_idx").on(table.entityType, table.entityId),
    index("activity_log_created_idx").on(table.createdAt),
  ]
);

// =============================================================================
// Activity Log Archive Table (permanent, anonymized)
// =============================================================================
export const activityLogArchive = pgTable(
  "activity_log_archive",
  {
    id: text("id").primaryKey(),

    // Anonymized action details
    action: text("action").notNull(),
    entityType: text("entity_type"),

    // Aggregated metadata (no PII)
    metadata: text("metadata"), // JSON

    // Timestamps
    originalCreatedAt: timestamp("original_created_at").notNull(),
    archivedAt: timestamp("archived_at").defaultNow().notNull(),
  },
  (table) => [
    index("activity_archive_action_idx").on(table.action),
    index("activity_archive_original_idx").on(table.originalCreatedAt),
  ]
);
