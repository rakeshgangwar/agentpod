/**
 * Onboarding Schema
 *
 * Tracks onboarding sessions for sandboxes.
 * One onboarding session per sandbox.
 */

import {
  pgTable,
  text,
  timestamp,
  index,
  unique,
  pgEnum,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { sandboxes } from "./sandboxes";

// =============================================================================
// Enums
// =============================================================================
export const onboardingStatusEnum = pgEnum("onboarding_status", [
  "pending",
  "started",
  "gathering",
  "generating",
  "applying",
  "completed",
  "skipped",
  "failed",
]);

// =============================================================================
// Onboarding Sessions Table
// =============================================================================
export const onboardingSessions = pgTable(
  "onboarding_sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    sandboxId: text("sandbox_id").references(() => sandboxes.id, {
      onDelete: "set null",
    }),
    status: onboardingStatusEnum("status").default("pending").notNull(),

    // Project information
    projectType: text("project_type"),
    projectName: text("project_name"),
    projectDescription: text("project_description"),

    // JSON fields
    gatheredRequirements: text("gathered_requirements"), // JSON
    generatedConfig: text("generated_config"), // JSON

    // Selected models
    selectedModel: text("selected_model"),
    selectedSmallModel: text("selected_small_model"),

    // Error info
    errorMessage: text("error_message"),

    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
  },
  (table) => [
    index("onboarding_user_id_idx").on(table.userId),
    index("onboarding_sandbox_id_idx").on(table.sandboxId),
    index("onboarding_status_idx").on(table.status),
    unique("onboarding_sandbox_unique").on(table.sandboxId),
  ]
);
