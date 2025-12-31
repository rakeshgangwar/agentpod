/**
 * Knowledge Routes
 *
 * Manage knowledge documents for the onboarding system.
 * Provides search, retrieval, and statistics endpoints.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { knowledgeService } from "../services/knowledge-service";
import { createLogger } from "../utils/logger";
import type { KnowledgeCategory } from "@agentpod/types";

const log = createLogger("knowledge-routes");

// =============================================================================
// Validation Schemas
// =============================================================================

const searchBodySchema = z.object({
  query: z.string().optional(),
  categories: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  limit: z.number().min(1).max(100).optional().default(10),
  useSemanticSearch: z.boolean().optional().default(false),
});

// =============================================================================
// Known Categories
// =============================================================================

const KNOWLEDGE_CATEGORIES = [
  {
    id: "project_template",
    name: "Project Templates",
    description: "Templates for common project types",
  },
  {
    id: "agent_pattern",
    name: "Agent Patterns",
    description: "Patterns for AI agent behavior",
  },
  {
    id: "command_template",
    name: "Command Templates",
    description: "Templates for custom commands",
  },
  {
    id: "best_practice",
    name: "Best Practices",
    description: "Coding and workflow best practices",
  },
  {
    id: "workflow_example",
    name: "Workflow Examples",
    description: "Example development workflows",
  },
  {
    id: "troubleshooting",
    name: "Troubleshooting",
    description: "Common issues and solutions",
  },
] as const;

// =============================================================================
// Routes
// =============================================================================

export const knowledgeRoutes = new Hono()
  /**
   * GET /api/knowledge
   * List/search knowledge documents
   * Query params:
   * - query: text search query
   * - category: filter by category
   * - limit: max results (default: 20)
   * - offset: pagination offset (default: 0)
   */
  .get("/", async (c) => {
    try {
      const query = c.req.query("query") || undefined;
      const category = c.req.query("category") as KnowledgeCategory | undefined;
      const limitStr = c.req.query("limit");
      const offsetStr = c.req.query("offset");

      // Parse pagination with defaults
      let limit = 20;
      let offset = 0;

      if (limitStr) {
        const parsedLimit = parseInt(limitStr, 10);
        if (!isNaN(parsedLimit) && parsedLimit > 0) {
          limit = Math.min(parsedLimit, 100);
        }
      }

      if (offsetStr) {
        const parsedOffset = parseInt(offsetStr, 10);
        if (!isNaN(parsedOffset) && parsedOffset >= 0) {
          offset = parsedOffset;
        }
      }

      // If category is provided but invalid, return empty results
      if (
        category &&
        !KNOWLEDGE_CATEGORIES.some((c) => c.id === category)
      ) {
        return c.json({
          documents: [],
          total: 0,
        });
      }

      // Search or list documents
      const documents = await knowledgeService.search({
        query,
        category,
        limit: limit + offset, // Fetch enough for pagination
        useSemanticSearch: false,
      });

      // Apply pagination manually (service doesn't support offset in search)
      const paginatedDocs = documents.slice(offset, offset + limit);

      // Strip content from list view (only include in single document view)
      const docsWithoutContent = paginatedDocs.map((doc) => ({
        id: doc.id,
        category: doc.category,
        title: doc.title,
        description: doc.description,
        tags: doc.tags,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      }));

      return c.json({
        documents: docsWithoutContent,
        total: documents.length,
      });
    } catch (error) {
      log.error("Failed to list knowledge documents", { error });
      return c.json({ error: "Failed to list knowledge documents" }, 500);
    }
  })

  /**
   * GET /api/knowledge/categories
   * List available categories with document counts
   */
  .get("/categories", async (c) => {
    try {
      const stats = await knowledgeService.getStats();

      const categories = KNOWLEDGE_CATEGORIES.map((cat) => ({
        id: cat.id,
        name: cat.name,
        description: cat.description,
        count: stats[cat.id as KnowledgeCategory] || 0,
      }));

      return c.json({ categories });
    } catch (error) {
      log.error("Failed to list categories", { error });
      return c.json({ error: "Failed to list categories" }, 500);
    }
  })

  /**
   * GET /api/knowledge/stats
   * Get knowledge base statistics
   */
  .get("/stats", async (c) => {
    try {
      const byCategory = await knowledgeService.getStats();

      // Calculate totals
      const totalDocuments = Object.values(byCategory).reduce(
        (sum, count) => sum + count,
        0
      );

      // Get embedding status counts
      const allDocs = await knowledgeService.getAll(1000, 0);
      const embeddingStats = {
        pending: allDocs.filter((d) => d.embeddingStatus === "pending").length,
        completed: allDocs.filter((d) => d.embeddingStatus === "completed")
          .length,
        failed: allDocs.filter((d) => d.embeddingStatus === "failed").length,
      };

      return c.json({
        totalDocuments,
        byCategory,
        embeddingStats,
      });
    } catch (error) {
      log.error("Failed to get knowledge stats", { error });
      return c.json({ error: "Failed to get knowledge stats" }, 500);
    }
  })

  /**
   * GET /api/knowledge/:id
   * Get a specific knowledge document with full content
   */
  .get("/:id", async (c) => {
    const id = c.req.param("id");

    try {
      const document = await knowledgeService.getById(id);

      if (!document) {
        return c.json({ error: `Document not found: ${id}` }, 404);
      }

      return c.json({ document });
    } catch (error) {
      log.error("Failed to get knowledge document", { id, error });
      return c.json({ error: "Failed to get knowledge document" }, 500);
    }
  })

  /**
   * POST /api/knowledge/search
   * Advanced search with body parameters
   */
  .post("/search", zValidator("json", searchBodySchema), async (c) => {
    try {
      const { query, categories, tags, limit, useSemanticSearch } =
        c.req.valid("json");

      // If multiple categories, search each and combine
      if (categories && categories.length > 0) {
        const allResults: Awaited<
          ReturnType<typeof knowledgeService.search>
        > = [];

        for (const cat of categories) {
          const results = await knowledgeService.search({
            query,
            category: cat as KnowledgeCategory,
            tags,
            limit,
            useSemanticSearch,
          });
          allResults.push(...results);
        }

        // Deduplicate by id
        const seen = new Set<string>();
        const uniqueResults = allResults.filter((doc) => {
          if (seen.has(doc.id)) return false;
          seen.add(doc.id);
          return true;
        });

        return c.json({
          documents: uniqueResults.slice(0, limit),
        });
      }

      // Single category or no category
      const documents = await knowledgeService.search({
        query,
        tags,
        limit,
        useSemanticSearch,
      });

      return c.json({ documents });
    } catch (error) {
      log.error("Failed to search knowledge", { error });
      return c.json({ error: "Failed to search knowledge" }, 500);
    }
  });
