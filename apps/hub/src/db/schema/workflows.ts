import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  index,
  unique,
  pgEnum,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

export const workflowExecutionStatusEnum = pgEnum("workflow_execution_status", [
  "queued",
  "running",
  "waiting",
  "completed",
  "errored",
  "cancelled",
]);

export const workflowTriggerTypeEnum = pgEnum("workflow_trigger_type", [
  "manual",
  "webhook",
  "schedule",
  "event",
]);

export const workflowStepStatusEnum = pgEnum("workflow_step_status", [
  "pending",
  "running",
  "success",
  "error",
  "retrying",
  "skipped",
  "waiting",
]);

export const workflows = pgTable(
  "workflows",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    active: boolean("active").default(false).notNull(),
    nodes: jsonb("nodes").notNull().$type<unknown[]>(),
    connections: jsonb("connections").notNull().$type<Record<string, unknown>>(),
    settings: jsonb("settings").$type<Record<string, unknown>>(),
    isPublic: boolean("is_public").default(false).notNull(),
    isTemplate: boolean("is_template").default(false).notNull(),
    tags: jsonb("tags").default([]).$type<string[]>(),
    category: text("category"),
    executionCount: integer("execution_count").default(0).notNull(),
    lastExecutedAt: timestamp("last_executed_at"),
    forkCount: integer("fork_count").default(0),
    forkedFromId: text("forked_from_id"),
    version: integer("version").default(1).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("workflows_user_id_idx").on(table.userId),
    index("workflows_active_idx").on(table.active),
    index("workflows_is_public_idx").on(table.isPublic),
    index("workflows_is_template_idx").on(table.isTemplate),
    unique("workflows_user_name_unique").on(table.userId, table.name),
  ]
);

export const workflowExecutions = pgTable(
  "workflow_executions",
  {
    id: text("id").primaryKey(),
    workflowId: text("workflow_id")
      .notNull()
      .references(() => workflows.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    instanceId: text("instance_id").notNull(),
    status: workflowExecutionStatusEnum("status").default("queued").notNull(),
    triggerType: workflowTriggerTypeEnum("trigger_type").notNull(),
    triggerData: jsonb("trigger_data").$type<Record<string, unknown>>(),
    result: jsonb("result").$type<Record<string, unknown>>(),
    error: text("error"),
    currentStep: text("current_step"),
    completedSteps: jsonb("completed_steps").default([]).$type<string[]>(),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
    durationMs: integer("duration_ms"),
  },
  (table) => [
    index("workflow_executions_workflow_id_idx").on(table.workflowId),
    index("workflow_executions_user_id_idx").on(table.userId),
    index("workflow_executions_status_idx").on(table.status),
    index("workflow_executions_started_at_idx").on(table.startedAt),
  ]
);

export const workflowStepLogs = pgTable(
  "workflow_step_logs",
  {
    id: text("id").primaryKey(),
    executionId: text("execution_id")
      .notNull()
      .references(() => workflowExecutions.id, { onDelete: "cascade" }),
    nodeId: text("node_id").notNull(),
    stepName: text("step_name").notNull(),
    status: workflowStepStatusEnum("status").default("pending").notNull(),
    attemptNumber: integer("attempt_number").default(1).notNull(),
    input: jsonb("input").$type<Record<string, unknown>>(),
    output: jsonb("output").$type<Record<string, unknown>>(),
    error: text("error"),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
    durationMs: integer("duration_ms"),
  },
  (table) => [
    index("workflow_step_logs_execution_id_idx").on(table.executionId),
    index("workflow_step_logs_node_id_idx").on(table.nodeId),
    index("workflow_step_logs_status_idx").on(table.status),
  ]
);

export const workflowWebhooks = pgTable(
  "workflow_webhooks",
  {
    id: text("id").primaryKey(),
    workflowId: text("workflow_id")
      .notNull()
      .references(() => workflows.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    method: text("method").notNull(),
    authentication: text("authentication").default("none"),
    authConfig: jsonb("auth_config").$type<Record<string, unknown>>(),
    lastTriggeredAt: timestamp("last_triggered_at"),
    triggerCount: integer("trigger_count").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("workflow_webhooks_workflow_id_idx").on(table.workflowId),
    unique("workflow_webhooks_path_method_unique").on(table.path, table.method),
  ]
);

export type Workflow = typeof workflows.$inferSelect;
export type InsertWorkflow = typeof workflows.$inferInsert;
export type WorkflowExecution = typeof workflowExecutions.$inferSelect;
export type InsertWorkflowExecution = typeof workflowExecutions.$inferInsert;
export type WorkflowStepLog = typeof workflowStepLogs.$inferSelect;
export type InsertWorkflowStepLog = typeof workflowStepLogs.$inferInsert;
export type WorkflowWebhook = typeof workflowWebhooks.$inferSelect;
export type InsertWorkflowWebhook = typeof workflowWebhooks.$inferInsert;
