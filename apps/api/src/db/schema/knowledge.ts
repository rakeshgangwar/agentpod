/**
 * Knowledge Schema
 *
 * Stores knowledge documents for the onboarding system.
 * Uses pgvector for semantic similarity search.
 */

import {
  pgTable,
  text,
  timestamp,
  integer,
  index,
  pgEnum,
  customType,
} from "drizzle-orm/pg-core";

// =============================================================================
// Custom Types for pgvector
// =============================================================================
// Note: pgvector extension must be enabled: CREATE EXTENSION IF NOT EXISTS vector;
export const vector = customType<{
  data: number[];
  driverData: string;
  config: { dimensions: number };
}>({
  dataType(config) {
    return `vector(${config?.dimensions ?? 1536})`;
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: string): number[] {
    // Parse PostgreSQL vector format: [1,2,3]
    return value
      .slice(1, -1)
      .split(",")
      .map((v) => parseFloat(v));
  },
});

// =============================================================================
// Enums
// =============================================================================
export const knowledgeCategoryEnum = pgEnum("knowledge_category", [
  "project_template",
  "agent_pattern",
  "command_template",
  "tool_template",
  "plugin_template",
  "mcp_template",
  "workflow_pattern",
  "best_practice",
  "provider_guide",
]);

export const embeddingStatusEnum = pgEnum("embedding_status", [
  "pending",
  "processing",
  "completed",
  "failed",
]);

// =============================================================================
// Knowledge Documents Table
// =============================================================================
export const knowledgeDocuments = pgTable(
  "knowledge_documents",
  {
    id: text("id").primaryKey(),
    category: knowledgeCategoryEnum("category").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    content: text("content").notNull(),
    tags: text("tags").default("[]"), // JSON array
    applicableTo: text("applicable_to"), // JSON array or null
    metadata: text("metadata").default("{}"), // JSON object

    // Vector embedding for semantic search
    embedding: vector("embedding", { dimensions: 1536 }),
    embeddingStatus: embeddingStatusEnum("embedding_status").default("pending"),

    version: integer("version").default(1),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("knowledge_category_idx").on(table.category),
    index("knowledge_updated_idx").on(table.updatedAt),
    index("knowledge_embedding_status_idx").on(table.embeddingStatus),
    // Note: HNSW index for vector similarity should be created manually:
    // CREATE INDEX knowledge_embedding_idx ON knowledge_documents
    // USING hnsw (embedding vector_cosine_ops);
  ]
);
