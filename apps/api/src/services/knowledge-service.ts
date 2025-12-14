/**
 * Knowledge Service
 *
 * Manages knowledge documents for the onboarding system.
 * Provides CRUD operations and vector similarity search using pgvector.
 */

import { db } from "../db/drizzle";
import { knowledgeDocuments } from "../db/schema/knowledge";
import { eq, ilike, or, desc, sql, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import { createLogger } from "../utils/logger";
import type {
  KnowledgeDocument,
  KnowledgeSearchParams,
  KnowledgeSearchResult,
  CreateKnowledgeDocument,
  UpdateKnowledgeDocument,
  KnowledgeCategory,
} from "@agentpod/types";

const log = createLogger("knowledge-service");

// =============================================================================
// Knowledge Service Class
// =============================================================================

export class KnowledgeService {
  // ===========================================================================
  // Search Operations
  // ===========================================================================

  /**
   * Search knowledge documents by query, category, and tags.
   * Supports both keyword and semantic (vector) search.
   */
  async search(params: KnowledgeSearchParams): Promise<KnowledgeSearchResult[]> {
    const {
      query,
      category,
      tags,
      limit = 10,
      useSemanticSearch = false,
    } = params;

    log.debug("Searching knowledge", { query, category, tags, useSemanticSearch });

    if (useSemanticSearch && query) {
      return this.semanticSearch(query, { category, tags, limit });
    }

    return this.keywordSearch({ query, category, tags, limit });
  }

  /**
   * Semantic search using pgvector cosine similarity.
   * Falls back to keyword search if embedding generation fails.
   */
  private async semanticSearch(
    query: string,
    filters: { category?: KnowledgeCategory; tags?: string[]; limit: number }
  ): Promise<KnowledgeSearchResult[]> {
    const embedding = await this.generateEmbedding(query);

    if (!embedding || embedding.length === 0) {
      log.warn("Embedding generation failed, falling back to keyword search");
      return this.keywordSearch({ query, ...filters });
    }

    // Build conditions array
    const conditions = [
      eq(knowledgeDocuments.embeddingStatus, "completed"),
    ];

    if (filters.category) {
      conditions.push(eq(knowledgeDocuments.category, filters.category));
    }

    // Calculate cosine similarity: 1 - cosine_distance
    // pgvector uses <=> operator for cosine distance
    const embeddingStr = `[${embedding.join(",")}]`;
    const similarity = sql<number>`1 - (${knowledgeDocuments.embedding} <=> ${embeddingStr}::vector)`;

    const results = await db
      .select({
        id: knowledgeDocuments.id,
        category: knowledgeDocuments.category,
        title: knowledgeDocuments.title,
        description: knowledgeDocuments.description,
        content: knowledgeDocuments.content,
        tags: knowledgeDocuments.tags,
        applicableTo: knowledgeDocuments.applicableTo,
        metadata: knowledgeDocuments.metadata,
        embeddingStatus: knowledgeDocuments.embeddingStatus,
        version: knowledgeDocuments.version,
        createdAt: knowledgeDocuments.createdAt,
        updatedAt: knowledgeDocuments.updatedAt,
        similarity,
      })
      .from(knowledgeDocuments)
      .where(and(...conditions))
      .orderBy(desc(similarity))
      .limit(filters.limit);

    // Filter by similarity threshold (> 0.5)
    return results
      .filter((row) => (row.similarity ?? 0) > 0.5)
      .map((row) => this.rowToDocument(row, row.similarity));
  }

  /**
   * Keyword-based search using ILIKE patterns.
   */
  private async keywordSearch(params: {
    query?: string;
    category?: KnowledgeCategory;
    tags?: string[];
    limit: number;
  }): Promise<KnowledgeSearchResult[]> {
    const conditions = [];

    if (params.category) {
      conditions.push(eq(knowledgeDocuments.category, params.category));
    }

    if (params.query) {
      const pattern = `%${params.query}%`;
      conditions.push(
        or(
          ilike(knowledgeDocuments.title, pattern),
          ilike(knowledgeDocuments.description, pattern),
          ilike(knowledgeDocuments.content, pattern)
        )
      );
    }

    // Tags search - check if any tag is in the tags JSON array
    if (params.tags && params.tags.length > 0) {
      // Simple approach: search for tag strings in the JSON text
      const tagConditions = params.tags.map((tag) =>
        ilike(knowledgeDocuments.tags, `%"${tag}"%`)
      );
      conditions.push(or(...tagConditions));
    }

    const query =
      conditions.length > 0
        ? db
            .select()
            .from(knowledgeDocuments)
            .where(and(...conditions))
        : db.select().from(knowledgeDocuments);

    const results = await query
      .orderBy(desc(knowledgeDocuments.updatedAt))
      .limit(params.limit);

    return results.map((row) => this.rowToDocument(row));
  }

  // ===========================================================================
  // CRUD Operations
  // ===========================================================================

  /**
   * Get a single knowledge document by ID.
   */
  async getById(id: string): Promise<KnowledgeDocument | null> {
    const results = await db
      .select()
      .from(knowledgeDocuments)
      .where(eq(knowledgeDocuments.id, id))
      .limit(1);

    const row = results[0];
    if (!row) {
      return null;
    }
    return this.rowToDocument(row);
  }

  /**
   * Get all documents by category.
   */
  async getByCategory(
    category: KnowledgeCategory
  ): Promise<KnowledgeDocument[]> {
    const results = await db
      .select()
      .from(knowledgeDocuments)
      .where(eq(knowledgeDocuments.category, category))
      .orderBy(desc(knowledgeDocuments.updatedAt));

    return results.map((row) => this.rowToDocument(row));
  }

  /**
   * Get all documents (paginated).
   */
  async getAll(limit = 100, offset = 0): Promise<KnowledgeDocument[]> {
    const results = await db
      .select()
      .from(knowledgeDocuments)
      .orderBy(desc(knowledgeDocuments.updatedAt))
      .limit(limit)
      .offset(offset);

    return results.map((row) => this.rowToDocument(row));
  }

  /**
   * Create a new knowledge document.
   */
  async create(data: CreateKnowledgeDocument): Promise<KnowledgeDocument> {
    const id = nanoid();
    const now = new Date();

    const results = await db
      .insert(knowledgeDocuments)
      .values({
        id,
        category: data.category,
        title: data.title,
        description: data.description || null,
        content: data.content,
        tags: JSON.stringify(data.tags || []),
        applicableTo: data.applicableTo
          ? JSON.stringify(data.applicableTo)
          : null,
        metadata: JSON.stringify(data.metadata || {}),
        embeddingStatus: "pending",
        version: 1,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    const result = results[0];
    if (!result) {
      throw new Error("Failed to create knowledge document");
    }

    log.info("Created knowledge document", { id, title: data.title });

    return this.rowToDocument(result);
  }

  /**
   * Update an existing knowledge document.
   */
  async update(
    id: string,
    data: UpdateKnowledgeDocument
  ): Promise<KnowledgeDocument | null> {
    const existing = await this.getById(id);
    if (!existing) {
      return null;
    }

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.content !== undefined) {
      updateData.content = data.content;
      // Reset embedding status when content changes
      updateData.embeddingStatus = "pending";
      updateData.embedding = null;
    }
    if (data.tags !== undefined) updateData.tags = JSON.stringify(data.tags);
    if (data.applicableTo !== undefined) {
      updateData.applicableTo = data.applicableTo
        ? JSON.stringify(data.applicableTo)
        : null;
    }
    if (data.metadata !== undefined) {
      updateData.metadata = JSON.stringify(data.metadata);
    }

    const results = await db
      .update(knowledgeDocuments)
      .set(updateData)
      .where(eq(knowledgeDocuments.id, id))
      .returning();

    const result = results[0];
    if (!result) {
      return null;
    }

    log.info("Updated knowledge document", { id });

    return this.rowToDocument(result);
  }

  /**
   * Delete a knowledge document.
   */
  async delete(id: string): Promise<boolean> {
    const result = await db
      .delete(knowledgeDocuments)
      .where(eq(knowledgeDocuments.id, id))
      .returning({ id: knowledgeDocuments.id });

    const deleted = result.length > 0;
    if (deleted) {
      log.info("Deleted knowledge document", { id });
    }

    return deleted;
  }

  // ===========================================================================
  // Embedding Operations
  // ===========================================================================

  /**
   * Update embedding for a document.
   * Called after embedding generation completes.
   */
  async updateEmbedding(
    id: string,
    embedding: number[],
    status: "completed" | "failed" = "completed"
  ): Promise<void> {
    if (embedding.length === 0) {
      // Cannot store empty vector, just update status
      await this.markEmbeddingFailed(id);
      return;
    }

    const embeddingStr = `[${embedding.join(",")}]`;

    await db
      .update(knowledgeDocuments)
      .set({
        embedding: sql`${embeddingStr}::vector`,
        embeddingStatus: status,
        updatedAt: new Date(),
      })
      .where(eq(knowledgeDocuments.id, id));

    log.debug("Updated embedding", { id, status });
  }

  /**
   * Mark embedding generation as failed (without setting embedding).
   */
  async markEmbeddingFailed(id: string): Promise<void> {
    await db
      .update(knowledgeDocuments)
      .set({
        embeddingStatus: "failed",
        updatedAt: new Date(),
      })
      .where(eq(knowledgeDocuments.id, id));

    log.debug("Marked embedding as failed", { id });
  }

  /**
   * Get documents that need embedding generation.
   */
  async getPendingEmbeddings(limit = 10): Promise<KnowledgeDocument[]> {
    const results = await db
      .select()
      .from(knowledgeDocuments)
      .where(eq(knowledgeDocuments.embeddingStatus, "pending"))
      .limit(limit);

    return results.map((row) => this.rowToDocument(row));
  }

  /**
   * Generate embedding for text content.
   * Currently returns empty array - implement with OpenAI/Anthropic.
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    // TODO: Implement embedding generation with OpenAI or other provider
    // Example with OpenAI:
    // const response = await openai.embeddings.create({
    //   model: "text-embedding-3-small",
    //   input: text,
    // });
    // return response.data[0].embedding;

    log.warn("Embedding generation not implemented - using keyword search");
    return [];
  }

  // ===========================================================================
  // Statistics
  // ===========================================================================

  /**
   * Get document count by category.
   */
  async getStats(): Promise<Record<KnowledgeCategory, number>> {
    const results = await db
      .select({
        category: knowledgeDocuments.category,
        count: sql<number>`count(*)::int`,
      })
      .from(knowledgeDocuments)
      .groupBy(knowledgeDocuments.category);

    const stats: Record<string, number> = {};
    for (const row of results) {
      stats[row.category] = row.count;
    }

    return stats as Record<KnowledgeCategory, number>;
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  /**
   * Convert database row to KnowledgeDocument type.
   */
  private rowToDocument(
    row: {
      id: string;
      category: string;
      title: string;
      description: string | null;
      content: string;
      tags: string | null;
      applicableTo: string | null;
      metadata: string | null;
      embeddingStatus: string | null;
      version: number | null;
      createdAt: Date;
      updatedAt: Date;
    },
    similarity?: number
  ): KnowledgeSearchResult {
    return {
      id: row.id,
      category: row.category as KnowledgeCategory,
      title: row.title,
      description: row.description,
      content: row.content,
      tags: row.tags ? JSON.parse(row.tags) : [],
      applicableTo: row.applicableTo ? JSON.parse(row.applicableTo) : null,
      metadata: row.metadata ? JSON.parse(row.metadata) : {},
      embeddingStatus: (row.embeddingStatus || "pending") as KnowledgeDocument["embeddingStatus"],
      version: row.version ?? 1,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      similarity,
    };
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

export const knowledgeService = new KnowledgeService();
