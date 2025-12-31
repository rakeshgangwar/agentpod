/**
 * Agent Catalog Schema
 *
 * Tables for agent catalog, user agent library, sandbox agent assignment,
 * and marketplace reviews.
 *
 * Note: agent_presets table has been deprecated in favor of squad-based selection.
 */

import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  real,
  index,
  unique,
  pgEnum,
  jsonb,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { sandboxes } from "./sandboxes";

// =============================================================================
// Enums
// =============================================================================

export const agentSquadEnum = pgEnum("agent_squad", [
  "orchestration",
  "development",
  "product",
  "operations",
  "security",
  "research",
  "communication",
  "data",
]);

export const agentModeEnum = pgEnum("agent_mode", [
  "primary",
  "subagent",
]);

export const agentTierEnum = pgEnum("agent_tier", [
  "central",
  "foundation",
  "specialized",
  "premium",
]);

export const agentStatusEnum = pgEnum("agent_status", [
  "active",
  "deprecated",
  "hidden",
  "pending_review",
]);

export const agentSourceEnum = pgEnum("agent_source", [
  "default",
  "marketplace",
  "custom",
  "gift",
]);

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "active",
  "cancelled",
  "expired",
]);

export const subscriptionPlanEnum = pgEnum("subscription_plan", [
  "monthly",
  "yearly",
]);

export const reviewStatusEnum = pgEnum("review_status", [
  "pending",
  "published",
  "hidden",
]);

// =============================================================================
// Agents Table - Central Agent Catalog
// =============================================================================

export const agents = pgTable(
  "agents",
  {
    id: text("id").primaryKey(),
    slug: text("slug").unique().notNull(),
    name: text("name").notNull(),
    role: text("role").notNull(),
    emoji: text("emoji"),
    description: text("description"),

    squad: agentSquadEnum("squad").notNull(),
    tier: agentTierEnum("tier").default("foundation"),
    mode: agentModeEnum("mode").default("subagent"),

    tags: text("tags").array(),
    category: text("category"),

    isBuiltin: boolean("is_builtin").default(true),
    isPremium: boolean("is_premium").default(false),
    isDefault: boolean("is_default").default(false),
    isMandatory: boolean("is_mandatory").default(false),
    priceMonthly: real("price_monthly"),
    priceYearly: real("price_yearly"),

    publisherId: text("publisher_id").references(() => user.id, {
      onDelete: "set null",
    }),
    publisherName: text("publisher_name"),

    installCount: integer("install_count").default(0),
    ratingAvg: real("rating_avg"),
    ratingCount: integer("rating_count").default(0),

    config: jsonb("config").notNull(),
    opencodeContent: text("opencode_content").notNull(),

    version: integer("version").default(1),
    versionHistory: jsonb("version_history").default([]),

    status: agentStatusEnum("status").default("active"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("agents_squad_idx").on(table.squad),
    index("agents_tier_idx").on(table.tier),
    index("agents_mode_idx").on(table.mode),
    index("agents_category_idx").on(table.category),
    index("agents_is_builtin_idx").on(table.isBuiltin),
    index("agents_is_mandatory_idx").on(table.isMandatory),
    index("agents_status_idx").on(table.status),
    index("agents_publisher_idx").on(table.publisherId),
  ]
);

// =============================================================================
// User Agents Table - User's Agent Library
// =============================================================================

export const userAgents = pgTable(
  "user_agents",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),

    // Acquisition
    source: agentSourceEnum("source").default("default"),

    // Subscription (for premium agents)
    subscriptionStatus: subscriptionStatusEnum("subscription_status"),
    subscriptionStartedAt: timestamp("subscription_started_at"),
    subscriptionExpiresAt: timestamp("subscription_expires_at"),
    subscriptionPlan: subscriptionPlanEnum("subscription_plan"),

    // User customizations
    customName: text("custom_name"),
    customConfig: jsonb("custom_config"),

    acquiredAt: timestamp("acquired_at").defaultNow().notNull(),
  },
  (table) => [
    unique("user_agents_user_agent_unique").on(table.userId, table.agentId),
    index("user_agents_user_idx").on(table.userId),
    index("user_agents_source_idx").on(table.source),
    index("user_agents_subscription_idx").on(table.subscriptionStatus),
  ]
);

// =============================================================================
// Sandbox Agents Table - Per-Sandbox Agent Assignment
// =============================================================================

export const sandboxAgents = pgTable(
  "sandbox_agents",
  {
    id: text("id").primaryKey(),
    sandboxId: text("sandbox_id")
      .notNull()
      .references(() => sandboxes.id, { onDelete: "cascade" }),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),

    // Per-sandbox settings
    enabled: boolean("enabled").default(true),
    priority: integer("priority").default(0),
    settings: jsonb("settings"),

    addedAt: timestamp("added_at").defaultNow().notNull(),
    addedBy: text("added_by").references(() => user.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    unique("sandbox_agents_sandbox_agent_unique").on(
      table.sandboxId,
      table.agentId
    ),
    index("sandbox_agents_sandbox_idx").on(table.sandboxId),
    index("sandbox_agents_agent_idx").on(table.agentId),
    index("sandbox_agents_enabled_idx").on(table.enabled),
  ]
);



// =============================================================================
// Agent Reviews Table - Marketplace Reviews
// =============================================================================

export const agentReviews = pgTable(
  "agent_reviews",
  {
    id: text("id").primaryKey(),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    rating: integer("rating").notNull(),
    title: text("title"),
    review: text("review"),

    // Moderation
    status: reviewStatusEnum("status").default("published"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    unique("agent_reviews_agent_user_unique").on(table.agentId, table.userId),
    index("agent_reviews_agent_idx").on(table.agentId),
    index("agent_reviews_status_idx").on(table.status),
  ]
);

// =============================================================================
// Type Exports
// =============================================================================

export type Agent = typeof agents.$inferSelect;
export type InsertAgent = typeof agents.$inferInsert;

export type UserAgent = typeof userAgents.$inferSelect;
export type InsertUserAgent = typeof userAgents.$inferInsert;

export type SandboxAgent = typeof sandboxAgents.$inferSelect;
export type InsertSandboxAgent = typeof sandboxAgents.$inferInsert;



export type AgentReview = typeof agentReviews.$inferSelect;
export type InsertAgentReview = typeof agentReviews.$inferInsert;

export type AgentSquad = (typeof agentSquadEnum.enumValues)[number];
export type AgentTier = (typeof agentTierEnum.enumValues)[number];
export type AgentMode = (typeof agentModeEnum.enumValues)[number];
export type AgentStatus = (typeof agentStatusEnum.enumValues)[number];
export type AgentSource = (typeof agentSourceEnum.enumValues)[number];
export type SubscriptionStatus =
  (typeof subscriptionStatusEnum.enumValues)[number];
export type SubscriptionPlan = (typeof subscriptionPlanEnum.enumValues)[number];
export type ReviewStatus = (typeof reviewStatusEnum.enumValues)[number];
