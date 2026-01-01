/**
 * MCP (Model Context Protocol) Schema
 *
 * Stores MCP server configurations, namespaces, endpoints, and API keys.
 * Integrates with MetaMCP for server aggregation and management.
 */

import {
  pgTable,
  text,
  timestamp,
  index,
  unique,
  pgEnum,
  boolean,
  jsonb,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

// =============================================================================
// Enums
// =============================================================================

export const mcpServerTypeEnum = pgEnum("mcp_server_type", [
  "STDIO",
  "SSE",
  "STREAMABLE_HTTP",
]);

export const mcpAuthTypeEnum = pgEnum("mcp_auth_type", [
  "none",
  "api_key",
  "bearer_token",
  "oauth2",
  "env_vars",
]);

export const mcpEndpointAuthTypeEnum = pgEnum("mcp_endpoint_auth_type", [
  "api_key",
  "oauth",
]);

// =============================================================================
// MCP Servers Table
// =============================================================================

export const mcpServers = pgTable(
  "mcp_servers",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    type: mcpServerTypeEnum("type").notNull(),

    // STDIO configuration
    command: text("command"),
    args: jsonb("args").$type<string[]>().default([]),

    // Remote server configuration (SSE/HTTP)
    url: text("url"),

    // Authentication configuration (encrypted)
    authType: mcpAuthTypeEnum("auth_type").notNull().default("none"),
    authConfig: jsonb("auth_config").$type<Record<string, unknown>>().default({}),

    // Environment variables (encrypted)
    environment: jsonb("environment").$type<Record<string, string>>().default({}),

    // MetaMCP sync
    metamcpServerId: text("metamcp_server_id"),

    // Status flags
    enabled: boolean("enabled").default(true).notNull(),
    isPublic: boolean("is_public").default(false).notNull(),

    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("mcp_servers_user_id_idx").on(table.userId),
    index("mcp_servers_type_idx").on(table.type),
    index("mcp_servers_enabled_idx").on(table.enabled),
    unique("mcp_servers_user_name_unique").on(table.userId, table.name),
  ]
);

// =============================================================================
// MCP Namespaces Table
// =============================================================================

export const mcpNamespaces = pgTable(
  "mcp_namespaces",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),

    // MetaMCP sync
    metamcpNamespaceId: text("metamcp_namespace_id"),

    // Status flags
    isPublic: boolean("is_public").default(false).notNull(),

    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("mcp_namespaces_user_id_idx").on(table.userId),
    unique("mcp_namespaces_user_name_unique").on(table.userId, table.name),
  ]
);

// =============================================================================
// MCP Namespace Servers Junction Table
// =============================================================================

export const mcpNamespaceServers = pgTable(
  "mcp_namespace_servers",
  {
    namespaceId: text("namespace_id")
      .notNull()
      .references(() => mcpNamespaces.id, { onDelete: "cascade" }),
    serverId: text("server_id")
      .notNull()
      .references(() => mcpServers.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").default(true).notNull(),
  },
  (table) => [
    index("mcp_namespace_servers_namespace_idx").on(table.namespaceId),
    index("mcp_namespace_servers_server_idx").on(table.serverId),
    unique("mcp_namespace_servers_pk").on(table.namespaceId, table.serverId),
  ]
);

// =============================================================================
// MCP Tool Overrides Table
// =============================================================================

export const mcpToolOverrides = pgTable(
  "mcp_tool_overrides",
  {
    id: text("id").primaryKey(),
    namespaceId: text("namespace_id")
      .notNull()
      .references(() => mcpNamespaces.id, { onDelete: "cascade" }),
    serverId: text("server_id")
      .notNull()
      .references(() => mcpServers.id, { onDelete: "cascade" }),
    toolName: text("tool_name").notNull(),

    // Override settings
    enabled: boolean("enabled").default(true).notNull(),
    overrideName: text("override_name"),
    overrideDescription: text("override_description"),
    annotations: jsonb("annotations").$type<Record<string, unknown>>().default({}),
  },
  (table) => [
    index("mcp_tool_overrides_namespace_idx").on(table.namespaceId),
    unique("mcp_tool_overrides_unique").on(
      table.namespaceId,
      table.serverId,
      table.toolName
    ),
  ]
);

// =============================================================================
// MCP Endpoints Table
// =============================================================================

export const mcpEndpoints = pgTable(
  "mcp_endpoints",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    namespaceId: text("namespace_id")
      .notNull()
      .references(() => mcpNamespaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),

    // Auth settings
    authEnabled: boolean("auth_enabled").default(true).notNull(),
    authType: mcpEndpointAuthTypeEnum("auth_type").default("api_key").notNull(),

    // MetaMCP sync
    metamcpEndpointId: text("metamcp_endpoint_id"),

    // Status flags
    isPublic: boolean("is_public").default(false).notNull(),

    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("mcp_endpoints_user_id_idx").on(table.userId),
    index("mcp_endpoints_namespace_idx").on(table.namespaceId),
    unique("mcp_endpoints_name_unique").on(table.name),
  ]
);

// =============================================================================
// MCP API Keys Table
// =============================================================================

export const mcpApiKeys = pgTable(
  "mcp_api_keys",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    endpointId: text("endpoint_id").references(() => mcpEndpoints.id, {
      onDelete: "cascade",
    }),

    // Key data (hash stored, prefix for identification)
    keyHash: text("key_hash").notNull(),
    keyPrefix: text("key_prefix").notNull(),

    // Metadata
    description: text("description"),
    scopes: jsonb("scopes").$type<string[]>().default([]),

    // Expiration
    expiresAt: timestamp("expires_at"),
    lastUsedAt: timestamp("last_used_at"),

    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("mcp_api_keys_user_id_idx").on(table.userId),
    index("mcp_api_keys_endpoint_idx").on(table.endpointId),
    index("mcp_api_keys_prefix_idx").on(table.keyPrefix),
  ]
);

// =============================================================================
// MCP Connection Logs Table (for debugging)
// =============================================================================

export const mcpConnectionLogs = pgTable(
  "mcp_connection_logs",
  {
    id: text("id").primaryKey(),
    serverId: text("server_id").references(() => mcpServers.id, {
      onDelete: "set null",
    }),
    endpointId: text("endpoint_id").references(() => mcpEndpoints.id, {
      onDelete: "set null",
    }),

    // Connection info
    status: text("status").notNull(), // connected, disconnected, error
    errorMessage: text("error_message"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),

    // Timestamps
    timestamp: timestamp("timestamp").defaultNow().notNull(),
  },
  (table) => [
    index("mcp_connection_logs_server_idx").on(table.serverId),
    index("mcp_connection_logs_endpoint_idx").on(table.endpointId),
    index("mcp_connection_logs_timestamp_idx").on(table.timestamp),
  ]
);
