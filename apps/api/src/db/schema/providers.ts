/**
 * Providers Schema
 *
 * Stores LLM provider configurations and credentials.
 * Includes OAuth state management for device flow authentication.
 */

import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  index,
  pgEnum,
  unique,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

// =============================================================================
// Enums
// =============================================================================
export const authTypeEnum = pgEnum("auth_type", [
  "api_key",
  "oauth",
  "device_flow",
]);

export const oauthStatusEnum = pgEnum("oauth_status", [
  "pending",
  "completed",
  "expired",
  "error",
]);

// =============================================================================
// Provider Credentials Table
// =============================================================================
export const providerCredentials = pgTable(
  "provider_credentials",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    providerId: text("provider_id").notNull(),
    authType: authTypeEnum("auth_type").notNull(),

    // All credential fields are encrypted before storage
    apiKeyEncrypted: text("api_key_encrypted"),

    // OAuth/Device Flow authentication
    accessTokenEncrypted: text("access_token_encrypted"),
    refreshTokenEncrypted: text("refresh_token_encrypted"),
    tokenExpiresAt: timestamp("token_expires_at"),

    // OAuth metadata
    oauthProvider: text("oauth_provider"),
    oauthScopes: text("oauth_scopes"), // JSON array

    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("provider_credentials_user_id_idx").on(table.userId),
    index("provider_credentials_provider_id_idx").on(table.providerId),
    // Each user can only have one credential per provider
    unique("provider_credentials_user_provider_unique").on(table.userId, table.providerId),
  ]
);

// =============================================================================
// OAuth State Table (for device flow)
// =============================================================================
export const oauthState = pgTable(
  "oauth_state",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    providerId: text("provider_id").notNull(),
    deviceCode: text("device_code").notNull(),
    userCode: text("user_code").notNull(),
    verificationUri: text("verification_uri").notNull(),
    intervalSeconds: integer("interval_seconds").default(5),
    expiresAt: timestamp("expires_at").notNull(),
    status: oauthStatusEnum("status").default("pending"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("oauth_state_user_id_idx").on(table.userId),
    index("oauth_state_provider_id_idx").on(table.providerId),
    index("oauth_state_status_idx").on(table.status),
  ]
);

// =============================================================================
// Legacy Providers Table (kept for backwards compatibility)
// =============================================================================
export const providers = pgTable(
  "providers",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    type: text("type").notNull(), // 'api_key', 'oauth'

    // Credentials (encrypted in production)
    apiKey: text("api_key"),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    tokenExpiresAt: timestamp("token_expires_at"),

    // Configuration
    isDefault: boolean("is_default").default(false),
    isConfigured: boolean("is_configured").default(false),

    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("providers_is_default_idx").on(table.isDefault)]
);
