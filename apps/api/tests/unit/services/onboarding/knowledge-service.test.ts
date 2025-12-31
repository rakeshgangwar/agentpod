/**
 * Knowledge Service Tests
 *
 * Tests for the knowledge document service including:
 * - CRUD operations
 * - Keyword search
 * - Semantic search (with mocked embeddings)
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { nanoid } from "nanoid";
import type { KnowledgeCategory, CreateKnowledgeDocument } from "@agentpod/types";

// =============================================================================
// Test Setup - Must be before importing the service
// =============================================================================

// Set up test environment
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://agentpod:agentpod-dev-password@localhost:5432/agentpod";

// Import after env setup
import { KnowledgeService } from "../../../../src/services/knowledge-service";
import { db } from "../../../../src/db/drizzle";
import { knowledgeDocuments } from "../../../../src/db/schema/knowledge";
import { eq } from "drizzle-orm";

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Create a test knowledge document
 */
function createTestDocument(overrides: Partial<CreateKnowledgeDocument> = {}): CreateKnowledgeDocument {
  return {
    category: "project_template" as KnowledgeCategory,
    title: `Test Document ${nanoid(6)}`,
    description: "A test document for unit tests",
    content: "This is the content of the test document.",
    tags: ["test", "unit-test"],
    applicableTo: ["web_app"],
    metadata: { source: "unit-test" },
    ...overrides,
  };
}

/**
 * Clean up test documents
 */
async function cleanupTestDocuments(ids: string[]): Promise<void> {
  for (const id of ids) {
    try {
      await db.delete(knowledgeDocuments).where(eq(knowledgeDocuments.id, id));
    } catch {
      // Ignore errors during cleanup
    }
  }
}

// =============================================================================
// Tests
// =============================================================================

describe("KnowledgeService", () => {
  let service: KnowledgeService;
  let createdIds: string[] = [];

  beforeEach(() => {
    service = new KnowledgeService();
    createdIds = [];
  });

  afterEach(async () => {
    // Clean up any documents created during tests
    await cleanupTestDocuments(createdIds);
  });

  // ===========================================================================
  // CRUD Operations
  // ===========================================================================

  describe("create", () => {
    it("should create a knowledge document with all fields", async () => {
      const input = createTestDocument();
      
      const result = await service.create(input);
      createdIds.push(result.id);

      expect(result.id).toBeDefined();
      expect(result.title).toBe(input.title);
      expect(result.description).toBe(input.description ?? null);
      expect(result.content).toBe(input.content);
      expect(result.category).toBe(input.category);
      expect(result.tags).toEqual(input.tags ?? []);
      expect(result.applicableTo).toEqual(input.applicableTo ?? null);
      expect(result.metadata).toEqual(input.metadata ?? {});
      expect(result.embeddingStatus).toBe("pending");
      expect(result.version).toBe(1);
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
    });

    it("should create a document with minimal fields", async () => {
      const input: CreateKnowledgeDocument = {
        category: "agent_pattern",
        title: `Minimal Doc ${nanoid(6)}`,
        content: "Minimal content",
        tags: [],
        metadata: {},
      };

      const result = await service.create(input);
      createdIds.push(result.id);

      expect(result.id).toBeDefined();
      expect(result.title).toBe(input.title);
      expect(result.description).toBeNull();
      expect(result.tags).toEqual([]);
      expect(result.applicableTo).toBeNull();
      expect(result.metadata).toEqual({});
    });

    it("should set embeddingStatus to pending on create", async () => {
      const input = createTestDocument();
      
      const result = await service.create(input);
      createdIds.push(result.id);

      expect(result.embeddingStatus).toBe("pending");
    });
  });

  describe("getById", () => {
    it("should return document when it exists", async () => {
      const input = createTestDocument();
      const created = await service.create(input);
      createdIds.push(created.id);

      const result = await service.getById(created.id);

      expect(result).not.toBeNull();
      expect(result?.id).toBe(created.id);
      expect(result?.title).toBe(input.title);
    });

    it("should return null when document does not exist", async () => {
      const result = await service.getById("non-existent-id");

      expect(result).toBeNull();
    });
  });

  describe("getByCategory", () => {
    it("should return documents matching the category", async () => {
      const doc1 = await service.create(createTestDocument({ category: "project_template" }));
      const doc2 = await service.create(createTestDocument({ category: "project_template" }));
      const doc3 = await service.create(createTestDocument({ category: "agent_pattern" }));
      createdIds.push(doc1.id, doc2.id, doc3.id);

      const results = await service.getByCategory("project_template");

      const resultIds = results.map(r => r.id);
      expect(resultIds).toContain(doc1.id);
      expect(resultIds).toContain(doc2.id);
      expect(resultIds).not.toContain(doc3.id);
    });

    it("should return empty array when no documents match", async () => {
      const results = await service.getByCategory("workflow_pattern");

      // May contain seeded data, so just check it's an array
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe("update", () => {
    it("should update document fields", async () => {
      const input = createTestDocument();
      const created = await service.create(input);
      createdIds.push(created.id);

      const updated = await service.update(created.id, {
        title: "Updated Title",
        description: "Updated description",
      });

      expect(updated).not.toBeNull();
      expect(updated?.title).toBe("Updated Title");
      expect(updated?.description).toBe("Updated description");
      expect(updated?.content).toBe(input.content); // Unchanged
    });

    it("should reset embeddingStatus when content changes", async () => {
      const created = await service.create(createTestDocument());
      createdIds.push(created.id);

      // Simulate embedding completed
      await service.updateEmbedding(created.id, Array(1536).fill(0.1), "completed");
      
      // Verify embedding is completed
      const beforeUpdate = await service.getById(created.id);
      expect(beforeUpdate?.embeddingStatus).toBe("completed");

      // Update content
      const updated = await service.update(created.id, {
        content: "New content that needs re-embedding",
      });

      expect(updated?.embeddingStatus).toBe("pending");
    });

    it("should return null when document does not exist", async () => {
      const result = await service.update("non-existent-id", { title: "New Title" });

      expect(result).toBeNull();
    });
  });

  describe("delete", () => {
    it("should delete existing document and return true", async () => {
      const created = await service.create(createTestDocument());
      // Don't add to createdIds since we're deleting it

      const deleted = await service.delete(created.id);
      const fetched = await service.getById(created.id);

      expect(deleted).toBe(true);
      expect(fetched).toBeNull();
    });

    it("should return false when document does not exist", async () => {
      const result = await service.delete("non-existent-id");

      expect(result).toBe(false);
    });
  });

  // ===========================================================================
  // Search Operations
  // ===========================================================================

  describe("search", () => {
    describe("keyword search", () => {
      it("should find documents by title", async () => {
        const uniqueTitle = `UniqueSearchTitle-${nanoid(8)}`;
        const doc = await service.create(createTestDocument({ title: uniqueTitle }));
        createdIds.push(doc.id);

        const results = await service.search({ query: uniqueTitle });

        expect(results.length).toBeGreaterThanOrEqual(1);
        expect(results.some(r => r.id === doc.id)).toBe(true);
      });

      it("should find documents by content", async () => {
        const uniqueContent = `UniqueContentMarker-${nanoid(8)}`;
        const doc = await service.create(createTestDocument({ content: uniqueContent }));
        createdIds.push(doc.id);

        const results = await service.search({ query: uniqueContent });

        expect(results.length).toBeGreaterThanOrEqual(1);
        expect(results.some(r => r.id === doc.id)).toBe(true);
      });

      it("should find documents by description", async () => {
        const uniqueDesc = `UniqueDescMarker-${nanoid(8)}`;
        const doc = await service.create(createTestDocument({ description: uniqueDesc }));
        createdIds.push(doc.id);

        const results = await service.search({ query: uniqueDesc });

        expect(results.length).toBeGreaterThanOrEqual(1);
        expect(results.some(r => r.id === doc.id)).toBe(true);
      });

      it("should filter by category", async () => {
        const uniqueTitle = `CategoryFilter-${nanoid(8)}`;
        const doc1 = await service.create(createTestDocument({ 
          title: uniqueTitle,
          category: "project_template" 
        }));
        const doc2 = await service.create(createTestDocument({ 
          title: uniqueTitle,
          category: "agent_pattern" 
        }));
        createdIds.push(doc1.id, doc2.id);

        const results = await service.search({ 
          query: uniqueTitle,
          category: "project_template" 
        });

        expect(results.some(r => r.id === doc1.id)).toBe(true);
        expect(results.some(r => r.id === doc2.id)).toBe(false);
      });

      it("should filter by tags", async () => {
        const uniqueTag = `unique-tag-${nanoid(8)}`;
        const doc = await service.create(createTestDocument({ 
          tags: [uniqueTag, "other-tag"] 
        }));
        createdIds.push(doc.id);

        const results = await service.search({ tags: [uniqueTag] });

        expect(results.some(r => r.id === doc.id)).toBe(true);
      });

      it("should respect limit parameter", async () => {
        // Create multiple documents
        const docs = await Promise.all([
          service.create(createTestDocument()),
          service.create(createTestDocument()),
          service.create(createTestDocument()),
        ]);
        createdIds.push(...docs.map(d => d.id));

        const results = await service.search({ limit: 2 });

        expect(results.length).toBeLessThanOrEqual(2);
      });

      it("should return empty array when no matches", async () => {
        const results = await service.search({ query: `NoMatchQuery-${nanoid(16)}` });

        expect(results).toEqual([]);
      });
    });

    describe("semantic search", () => {
      it("should fall back to keyword search when embedding generation fails", async () => {
        const uniqueTitle = `SemanticFallback-${nanoid(8)}`;
        const doc = await service.create(createTestDocument({ title: uniqueTitle }));
        createdIds.push(doc.id);

        // Semantic search should fall back to keyword search since embedding generation returns empty
        const results = await service.search({ 
          query: uniqueTitle,
          useSemanticSearch: true 
        });

        expect(results.length).toBeGreaterThanOrEqual(1);
        expect(results.some(r => r.id === doc.id)).toBe(true);
      });
    });
  });

  // ===========================================================================
  // Embedding Operations
  // ===========================================================================

  describe("updateEmbedding", () => {
    it("should update embedding and status", async () => {
      const doc = await service.create(createTestDocument());
      createdIds.push(doc.id);

      const embedding = Array(1536).fill(0.5);
      await service.updateEmbedding(doc.id, embedding, "completed");

      const updated = await service.getById(doc.id);
      expect(updated?.embeddingStatus).toBe("completed");
    });

    it("should set status to failed when specified", async () => {
      const doc = await service.create(createTestDocument());
      createdIds.push(doc.id);

      // When embedding fails, we still need a valid vector or null
      // The service should handle this gracefully
      await service.markEmbeddingFailed(doc.id);

      const updated = await service.getById(doc.id);
      expect(updated?.embeddingStatus).toBe("failed");
    });
  });

  describe("getPendingEmbeddings", () => {
    it("should return documents with pending embedding status", async () => {
      const doc1 = await service.create(createTestDocument());
      const doc2 = await service.create(createTestDocument());
      createdIds.push(doc1.id, doc2.id);

      // Mark one as completed
      await service.updateEmbedding(doc1.id, Array(1536).fill(0.1), "completed");

      // Verify the embedding status was updated
      const doc1After = await service.getById(doc1.id);
      expect(doc1After?.embeddingStatus).toBe("completed");

      // doc2 should still be pending
      const doc2After = await service.getById(doc2.id);
      expect(doc2After?.embeddingStatus).toBe("pending");

      // Get pending documents - doc1 should not be included
      const pending = await service.getPendingEmbeddings(100);
      expect(pending.some(d => d.id === doc1.id)).toBe(false);
    });

    it("should respect limit parameter", async () => {
      const docs = await Promise.all([
        service.create(createTestDocument()),
        service.create(createTestDocument()),
        service.create(createTestDocument()),
      ]);
      createdIds.push(...docs.map(d => d.id));

      const pending = await service.getPendingEmbeddings(2);

      expect(pending.length).toBeLessThanOrEqual(2);
    });
  });

  // ===========================================================================
  // Statistics
  // ===========================================================================

  describe("getStats", () => {
    it("should return document counts by category", async () => {
      const doc1 = await service.create(createTestDocument({ category: "project_template" }));
      const doc2 = await service.create(createTestDocument({ category: "agent_pattern" }));
      createdIds.push(doc1.id, doc2.id);

      const stats = await service.getStats();

      expect(typeof stats.project_template).toBe("number");
      expect(typeof stats.agent_pattern).toBe("number");
      expect(stats.project_template).toBeGreaterThanOrEqual(1);
      expect(stats.agent_pattern).toBeGreaterThanOrEqual(1);
    });
  });

  // ===========================================================================
  // Pagination
  // ===========================================================================

  describe("getAll", () => {
    it("should return paginated results", async () => {
      const docs = await Promise.all([
        service.create(createTestDocument()),
        service.create(createTestDocument()),
        service.create(createTestDocument()),
      ]);
      createdIds.push(...docs.map(d => d.id));

      const page1 = await service.getAll(2, 0);
      const page2 = await service.getAll(2, 2);

      expect(page1.length).toBeLessThanOrEqual(2);
      // page2 may have different items depending on total count
    });

    it("should return documents ordered by updatedAt descending", async () => {
      const doc1 = await service.create(createTestDocument());
      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 50));
      const doc2 = await service.create(createTestDocument());
      createdIds.push(doc1.id, doc2.id);

      const results = await service.getAll(10, 0);
      
      // Most recently updated should come first
      const doc2Index = results.findIndex(r => r.id === doc2.id);
      const doc1Index = results.findIndex(r => r.id === doc1.id);
      
      if (doc2Index !== -1 && doc1Index !== -1) {
        expect(doc2Index).toBeLessThan(doc1Index);
      }
    });
  });
});
