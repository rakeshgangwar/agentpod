/**
 * Chat Schema
 *
 * Stores chat sessions and messages for OpenCode and ACP Gateway.
 * Enables cross-device chat history access.
 */

import {
  pgTable,
  text,
  timestamp,
  integer,
  index,
  unique,
  pgEnum,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { sandboxes } from "./sandboxes";

// =============================================================================
// Enums
// =============================================================================
export const chatSourceEnum = pgEnum("chat_source", ["opencode", "acp_gateway"]);

export const chatSessionStatusEnum = pgEnum("chat_session_status", [
  "active",
  "archived",
  "deleted",
]);

export const chatMessageRoleEnum = pgEnum("chat_message_role", [
  "user",
  "assistant",
  "system",
]);

export const chatMessageStatusEnum = pgEnum("chat_message_status", [
  "streaming",
  "complete",
  "error",
  "cancelled",
]);

// =============================================================================
// Chat Sessions Table
// =============================================================================
export const chatSessions = pgTable(
  "chat_sessions",
  {
    id: text("id").primaryKey(),
    sandboxId: text("sandbox_id")
      .notNull()
      .references(() => sandboxes.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    // Session source
    source: chatSourceEnum("source").notNull(),

    // External references
    opencodeSessionId: text("opencode_session_id"),
    acpSessionId: text("acp_session_id"),
    acpAgentId: text("acp_agent_id"),

    // Session metadata
    title: text("title"),
    status: chatSessionStatusEnum("status").default("active"),

    // Statistics
    messageCount: integer("message_count").default(0),
    userMessageCount: integer("user_message_count").default(0),
    assistantMessageCount: integer("assistant_message_count").default(0),
    totalInputTokens: integer("total_input_tokens").default(0),
    totalOutputTokens: integer("total_output_tokens").default(0),

    // Timestamps
    lastMessageAt: timestamp("last_message_at"),
    lastSyncedAt: timestamp("last_synced_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    // Unique constraint on external IDs per sandbox
    unique("chat_sessions_opencode_unique").on(
      table.sandboxId,
      table.opencodeSessionId
    ),
    unique("chat_sessions_acp_unique").on(table.sandboxId, table.acpSessionId),
    index("chat_sessions_user_idx").on(table.userId),
    index("chat_sessions_sandbox_idx").on(table.sandboxId),
    index("chat_sessions_status_idx").on(table.status),
  ]
);

// =============================================================================
// Chat Messages Table
// =============================================================================
export const chatMessages = pgTable(
  "chat_messages",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => chatSessions.id, { onDelete: "cascade" }),

    // External reference
    externalMessageId: text("external_message_id"),

    // Message content (raw format from source)
    role: chatMessageRoleEnum("role").notNull(),
    content: text("content").notNull(),
    toolCalls: text("tool_calls"), // JSON
    toolResults: text("tool_results"), // JSON
    thinking: text("thinking"),

    // Model info
    modelProvider: text("model_provider"),
    modelId: text("model_id"),
    agentId: text("agent_id"),

    // Token usage
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),

    // Message status
    status: chatMessageStatusEnum("status").default("complete"),
    errorMessage: text("error_message"),

    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
  },
  (table) => [
    index("chat_messages_session_idx").on(table.sessionId),
    index("chat_messages_external_idx").on(
      table.sessionId,
      table.externalMessageId
    ),
    index("chat_messages_created_idx").on(table.createdAt),
  ]
);
