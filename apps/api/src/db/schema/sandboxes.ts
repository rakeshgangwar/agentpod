/**
 * Sandboxes Schema
 *
 * Stores sandbox metadata and configuration.
 * Replaces Docker labels as source of truth for sandbox data.
 */

import { pgTable, text, timestamp, index, unique, pgEnum } from "drizzle-orm/pg-core";
import { user } from "./auth";

// =============================================================================
// Enums
// =============================================================================
export const sandboxStatusEnum = pgEnum("sandbox_status", [
  "created",
  "starting",
  "running",
  "stopping",
  "stopped",
  "error",
]);

// =============================================================================
// Sandboxes Table
// =============================================================================
export const sandboxes = pgTable(
  "sandboxes",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),

    // Git/Repository info
    repoName: text("repo_name").notNull(),
    githubUrl: text("github_url"),

    // Container configuration (modular system)
    resourceTierId: text("resource_tier_id").default("starter"),
    flavorId: text("flavor_id").default("fullstack"),
    addonIds: text("addon_ids").default("[]"), // JSON array

    // Container runtime info
    containerId: text("container_id"),
    containerName: text("container_name"),
    status: sandboxStatusEnum("status").default("created"),
    errorMessage: text("error_message"),

    // URLs
    opencodeUrl: text("opencode_url"),
    acpGatewayUrl: text("acp_gateway_url"),
    vncUrl: text("vnc_url"),
    codeServerUrl: text("code_server_url"),

    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    lastAccessedAt: timestamp("last_accessed_at"),
  },
  (table) => [
    index("sandboxes_user_id_idx").on(table.userId),
    index("sandboxes_status_idx").on(table.status),
    index("sandboxes_container_id_idx").on(table.containerId),
    unique("sandboxes_user_slug_unique").on(table.userId, table.slug),
  ]
);
