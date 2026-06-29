/**
 * Containers Schema
 *
 * Stores resource tiers, container flavors, and addons for modular container system.
 */

import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  real,
  index,
} from "drizzle-orm/pg-core";

// =============================================================================
// Resource Tiers Table
// =============================================================================
export const resourceTiers = pgTable(
  "resource_tiers",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    cpuCores: integer("cpu_cores").notNull(),
    memoryGb: integer("memory_gb").notNull(),
    storageGb: integer("storage_gb").notNull(),
    priceMonthly: real("price_monthly").notNull().default(0),
    isDefault: boolean("is_default").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("resource_tiers_is_default_idx").on(table.isDefault)]
);

// =============================================================================
// Container Flavors Table
// =============================================================================
export const containerFlavors = pgTable(
  "container_flavors",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    languages: text("languages").notNull().default("[]"), // JSON array
    imageSizeMb: integer("image_size_mb"),
    isDefault: boolean("is_default").notNull().default(false),
    enabled: boolean("enabled").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("container_flavors_is_default_idx").on(table.isDefault)]
);

// =============================================================================
// Container Addons Table
// =============================================================================
export const containerAddons = pgTable(
  "container_addons",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    category: text("category").notNull(),
    imageSizeMb: integer("image_size_mb"),
    port: integer("port"),
    requiresGpu: boolean("requires_gpu").notNull().default(false),
    requiresFlavor: text("requires_flavor"),
    priceMonthly: real("price_monthly").notNull().default(0),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("container_addons_category_idx").on(table.category)]
);

// =============================================================================
// Legacy Container Tiers Table (deprecated, kept for backwards compatibility)
// =============================================================================
export const containerTiers = pgTable(
  "container_tiers",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    imageType: text("image_type").notNull(), // 'cli' or 'desktop'
    cpuLimit: text("cpu_limit").notNull(),
    memoryLimit: text("memory_limit").notNull(),
    memoryReservation: text("memory_reservation"),
    storageGb: integer("storage_gb").notNull(),
    hasDesktopAccess: boolean("has_desktop_access").default(false),
    isDefault: boolean("is_default").default(false),
    sortOrder: integer("sort_order").default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("container_tiers_is_default_idx").on(table.isDefault)]
);
