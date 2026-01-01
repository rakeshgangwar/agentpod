import {
  pgTable,
  text,
  timestamp,
  index,
  unique,
  pgEnum,
  integer,
  boolean,
  jsonb,
} from "drizzle-orm/pg-core";

export const forkTypeEnum = pgEnum("fork_type", [
  "explicit",
  "auto-edit",
  "auto-regenerate",
]);

export const forkCreatorEnum = pgEnum("fork_creator", ["user", "system"]);

export const sessionForks = pgTable(
  "session_forks",
  {
    id: text("id").primaryKey(),
    sandboxId: text("sandbox_id").notNull(),
    parentSessionId: text("parent_session_id"),
    forkedAtMessageId: text("forked_at_message_id"),
    forkType: forkTypeEnum("fork_type").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    createdBy: forkCreatorEnum("created_by").notNull().default("user"),
    tags: text("tags").array().default([]),
    reason: text("reason"),
    agentConfig: jsonb("agent_config"),
    mergedInto: text("merged_into"),
    originalTitle: text("original_title"),
  },
  (table) => [
    index("session_forks_sandbox_id_idx").on(table.sandboxId),
    index("session_forks_parent_session_id_idx").on(table.parentSessionId),
    index("session_forks_created_at_idx").on(table.createdAt),
  ]
);

export const messageBranches = pgTable(
  "message_branches",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    sandboxId: text("sandbox_id").notNull(),
    sessionId: text("session_id").notNull(),
    branchId: text("branch_id").notNull(),
    messageId: text("message_id").notNull(),
    branchNumber: integer("branch_number").notNull(),
    parentBranchId: text("parent_branch_id"),
    isCurrent: boolean("is_current").default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("message_branches_sandbox_id_idx").on(table.sandboxId),
    index("message_branches_session_id_idx").on(table.sessionId),
    index("message_branches_message_id_idx").on(table.messageId),
    unique("message_branches_session_branch_unique").on(
      table.sessionId,
      table.branchId
    ),
    unique("message_branches_session_message_branch_unique").on(
      table.sessionId,
      table.messageId,
      table.branchNumber
    ),
  ]
);

export type SessionForkRecord = typeof sessionForks.$inferSelect;
export type NewSessionForkRecord = typeof sessionForks.$inferInsert;
export type MessageBranchRecord = typeof messageBranches.$inferSelect;
export type NewMessageBranchRecord = typeof messageBranches.$inferInsert;
