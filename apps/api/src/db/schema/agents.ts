import {
  pgTable,
  text,
  timestamp,
  integer,
  real,
  index,
  pgEnum,
  jsonb,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { sandboxes } from "./sandboxes";
import { chatSessions } from "./chat";

export const agentSessionStatusEnum = pgEnum("agent_session_status", [
  "active",
  "completed",
  "abandoned",
]);

export const agentRoutingTypeEnum = pgEnum("agent_routing_type", [
  "single",
  "team",
  "workflow",
]);

export const agentSessions = pgTable(
  "agent_sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    sandboxId: text("sandbox_id")
      .notNull()
      .references(() => sandboxes.id, { onDelete: "cascade" }),
    chatSessionId: text("chat_session_id")
      .references(() => chatSessions.id, { onDelete: "set null" }),

    agentName: text("agent_name").notNull(),
    agentRole: text("agent_role").notNull(),
    agentSquad: text("agent_squad").notNull(),

    routingType: agentRoutingTypeEnum("routing_type").notNull(),
    workflowId: text("workflow_id"),

    status: agentSessionStatusEnum("status").default("active"),
    messageCount: integer("message_count").default(0),

    startedAt: timestamp("started_at").defaultNow().notNull(),
    endedAt: timestamp("ended_at"),
    lastActivityAt: timestamp("last_activity_at").defaultNow().notNull(),
  },
  (table) => [
    index("agent_sessions_user_idx").on(table.userId),
    index("agent_sessions_sandbox_idx").on(table.sandboxId),
    index("agent_sessions_agent_idx").on(table.agentName),
    index("agent_sessions_status_idx").on(table.status),
  ]
);

export const agentRoutingLogs = pgTable(
  "agent_routing_logs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    sandboxId: text("sandbox_id")
      .notNull()
      .references(() => sandboxes.id, { onDelete: "cascade" }),
    sessionId: text("session_id")
      .references(() => agentSessions.id, { onDelete: "cascade" }),

    userMessage: text("user_message").notNull(),

    routingType: agentRoutingTypeEnum("routing_type").notNull(),
    selectedAgents: text("selected_agents").array().notNull(),
    workflowId: text("workflow_id"),

    intent: jsonb("intent"),
    reasoning: text("reasoning"),

    processingTimeMs: integer("processing_time_ms"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("agent_routing_logs_user_idx").on(table.userId),
    index("agent_routing_logs_created_idx").on(table.createdAt),
  ]
);

export const agentMetrics = pgTable(
  "agent_metrics",
  {
    id: text("id").primaryKey(),
    agentName: text("agent_name").notNull(),
    
    date: timestamp("date").notNull(),
    
    totalSessions: integer("total_sessions").default(0),
    completedSessions: integer("completed_sessions").default(0),
    abandonedSessions: integer("abandoned_sessions").default(0),
    
    totalMessages: integer("total_messages").default(0),
    avgMessagesPerSession: real("avg_messages_per_session"),
    avgSessionDurationSec: real("avg_session_duration_sec"),
    
    routedFromCentral: integer("routed_from_central").default(0),
    escalatedToOther: integer("escalated_to_other").default(0),
    
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("agent_metrics_agent_idx").on(table.agentName),
    index("agent_metrics_date_idx").on(table.date),
  ]
);

export const agentFeedback = pgTable(
  "agent_feedback",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => agentSessions.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    
    agentName: text("agent_name").notNull(),
    
    rating: integer("rating"),
    helpful: integer("helpful"),
    feedback: text("feedback"),
    
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("agent_feedback_session_idx").on(table.sessionId),
    index("agent_feedback_agent_idx").on(table.agentName),
  ]
);
