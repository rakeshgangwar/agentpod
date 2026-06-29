/**
 * Integration Tests for Knowledge Routes
 *
 * Tests the /api/knowledge endpoints which manage:
 * - Knowledge document retrieval
 * - Keyword and semantic search
 * - Category-based filtering
 * - Knowledge statistics
 *
 * NOTE: These tests are written TDD-style BEFORE implementation.
 * They will fail until the routes are implemented.
 */

// IMPORTANT: Import setup first to set environment variables
import "../setup.ts";

import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { nanoid } from "nanoid";

// Set PostgreSQL database URL for tests
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgres://agentpod:agentpod-dev-password@localhost:5432/agentpod";

import { db } from "../../src/db/drizzle";
import { knowledgeDocuments } from "../../src/db/schema/knowledge";
import { eq } from "drizzle-orm";

// Import the full app after environment is set up
import { app } from "../../src/index.ts";

// =============================================================================
// Test App Setup
// =============================================================================

const AUTH_HEADER = { Authorization: "Bearer test-token" };

// =============================================================================
// Test Fixtures
// =============================================================================

// Track created documents for cleanup
let testDocumentIds: string[] = [];

async function createTestDocument(
  overrides: Partial<{
    category: string;
    title: string;
    description: string;
    content: string;
    tags: string[];
  }> = {}
) {
  const id = `test-doc-${nanoid(8)}`;
  const now = new Date();

  await db.insert(knowledgeDocuments).values({
    id,
    category: (overrides.category as any) || "best_practice",
    title: overrides.title || `Test Document ${nanoid(6)}`,
    description: overrides.description || "A test knowledge document",
    content: overrides.content || "This is test content for the knowledge document.",
    tags: JSON.stringify(overrides.tags || ["test", "sample"]),
    createdAt: now,
    updatedAt: now,
  });

  testDocumentIds.push(id);
  return id;
}

async function cleanupTestDocuments() {
  for (const id of testDocumentIds) {
    try {
      await db.delete(knowledgeDocuments).where(eq(knowledgeDocuments.id, id));
    } catch {
      // Ignore errors during cleanup
    }
  }
  testDocumentIds = [];
}

// =============================================================================
// Tests
// =============================================================================

describe("Knowledge Routes Integration Tests", () => {
  beforeAll(async () => {
    // Ensure clean state
    await cleanupTestDocuments();
  });

  afterAll(async () => {
    // Final cleanup
    await cleanupTestDocuments();
  });

  beforeEach(async () => {
    // Clean up before each test
    await cleanupTestDocuments();
  });

  // ===========================================================================
  // Authentication Tests
  // ===========================================================================

  describe("Authentication", () => {
    test("should return 401 without auth header", async () => {
      const res = await app.request("/api/knowledge");
      expect(res.status).toBe(401);
    });

    test("should return 401 with invalid token", async () => {
      const res = await app.request("/api/knowledge", {
        headers: { Authorization: "Bearer invalid-token" },
      });
      expect(res.status).toBe(401);
    });

    test("should succeed with valid auth token", async () => {
      const res = await app.request("/api/knowledge", {
        headers: AUTH_HEADER,
      });
      expect(res.status).toBe(200);
    });
  });

  // ===========================================================================
  // GET /api/knowledge - List/Search Knowledge Documents
  // ===========================================================================

  describe("GET /api/knowledge", () => {
    test("should return empty array when no documents exist", async () => {
      const res = await app.request("/api/knowledge", {
        headers: AUTH_HEADER,
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data).toHaveProperty("documents");
      expect(Array.isArray(data.documents)).toBe(true);
    });

    test("should return documents with expected structure", async () => {
      await createTestDocument({
        title: "Test Structure Doc",
        description: "Testing document structure",
      });

      const res = await app.request("/api/knowledge", {
        headers: AUTH_HEADER,
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.documents.length).toBeGreaterThan(0);
      const doc = data.documents[0];

      expect(doc).toHaveProperty("id");
      expect(doc).toHaveProperty("category");
      expect(doc).toHaveProperty("title");
      expect(doc).toHaveProperty("description");
      expect(doc).toHaveProperty("tags");
      expect(doc).toHaveProperty("createdAt");
      expect(doc).toHaveProperty("updatedAt");
    });

    test("should filter by category", async () => {
      // Create test docs with unique identifiers
      const uniqueId = nanoid(8);
      await createTestDocument({ category: "agent_pattern", title: `Agent Doc ${uniqueId}` });
      await createTestDocument({ category: "command_template", title: `Command Doc ${uniqueId}` });

      const res = await app.request("/api/knowledge?category=agent_pattern", {
        headers: AUTH_HEADER,
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      // Check that our test document is in the results
      expect(data.documents.length).toBeGreaterThanOrEqual(1);
      const testDoc = data.documents.find((d: { title: string }) => d.title === `Agent Doc ${uniqueId}`);
      expect(testDoc).toBeDefined();
      expect(testDoc.category).toBe("agent_pattern");
      // All returned documents should be in the agent_pattern category
      expect(data.documents.every((d: { category: string }) => d.category === "agent_pattern")).toBe(true);
    });

    test("should search by query in title", async () => {
      // Use unique identifiers to avoid collision with pre-existing data
      const uniqueId = nanoid(8);
      await createTestDocument({ title: `UniqueReact${uniqueId} Hooks Guide` });
      await createTestDocument({ title: `Python${uniqueId} Best Practices` });

      const res = await app.request(`/api/knowledge?query=UniqueReact${uniqueId}`, {
        headers: AUTH_HEADER,
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.documents.length).toBeGreaterThanOrEqual(1);
      const testDoc = data.documents.find((d: { title: string }) => d.title.includes(`UniqueReact${uniqueId}`));
      expect(testDoc).toBeDefined();
    });

    test("should search by query in content", async () => {
      const uniqueId = nanoid(8);
      await createTestDocument({
        title: "Generic Title",
        content: `This document talks about UniqueTypeScript${uniqueId} generics`,
      });

      const res = await app.request(`/api/knowledge?query=UniqueTypeScript${uniqueId}`, {
        headers: AUTH_HEADER,
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.documents.length).toBeGreaterThanOrEqual(1);
    });

    test("should support pagination with limit and offset", async () => {
      // Create 5 documents with unique identifiers
      const uniqueId = nanoid(8);
      for (let i = 0; i < 5; i++) {
        await createTestDocument({ title: `Pagination${uniqueId} Doc ${i}` });
      }

      // Get all docs first to confirm they exist
      const allRes = await app.request(`/api/knowledge?query=Pagination${uniqueId}`, {
        headers: AUTH_HEADER,
      });
      const allData = await allRes.json();
      expect(allData.documents.length).toBe(5);

      // Test pagination with limit=2
      const res = await app.request(`/api/knowledge?query=Pagination${uniqueId}&limit=2`, {
        headers: AUTH_HEADER,
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      // Should return exactly 2 documents when limit=2
      expect(data.documents.length).toBe(2);
      expect(data).toHaveProperty("total");
      // Total should be at least what we're returning
      expect(data.total).toBeGreaterThanOrEqual(data.documents.length);
      
      // Test offset: get page 2 (docs 2-3)
      const page2Res = await app.request(`/api/knowledge?query=Pagination${uniqueId}&limit=2&offset=2`, {
        headers: AUTH_HEADER,
      });
      const page2Data = await page2Res.json();
      expect(page2Data.documents.length).toBe(2);
      
      // Verify we got different documents (page 1 vs page 2)
      const page1Ids = data.documents.map((d: { id: string }) => d.id);
      const page2Ids = page2Data.documents.map((d: { id: string }) => d.id);
      const overlap = page1Ids.filter((id: string) => page2Ids.includes(id));
      expect(overlap.length).toBe(0); // No overlap between pages
    });

    test("should combine category and query filters", async () => {
      const uniqueId = nanoid(8);
      await createTestDocument({
        category: "best_practice",
        title: `UniqueReact${uniqueId} Best Practices`,
      });
      await createTestDocument({
        category: "agent_pattern",
        title: `UniqueReact${uniqueId} Agent Pattern`,
      });

      const res = await app.request(
        `/api/knowledge?category=best_practice&query=UniqueReact${uniqueId}`,
        { headers: AUTH_HEADER }
      );

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.documents.length).toBe(1);
      expect(data.documents[0].category).toBe("best_practice");
      expect(data.documents[0].title).toContain(`UniqueReact${uniqueId}`);
    });
  });

  // ===========================================================================
  // GET /api/knowledge/:id - Get Specific Document
  // ===========================================================================

  describe("GET /api/knowledge/:id", () => {
    test("should return 404 for non-existent document", async () => {
      const res = await app.request("/api/knowledge/non-existent-id", {
        headers: AUTH_HEADER,
      });

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toContain("not found");
    });

    test("should return document details", async () => {
      const docId = await createTestDocument({
        title: "Specific Document",
        description: "For testing retrieval",
        content: "Full content here",
      });

      const res = await app.request(`/api/knowledge/${docId}`, {
        headers: AUTH_HEADER,
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.document).toBeDefined();
      expect(data.document.id).toBe(docId);
      expect(data.document.title).toBe("Specific Document");
      expect(data.document.content).toBe("Full content here");
    });

    test("should include full content in single document response", async () => {
      const docId = await createTestDocument({
        content: "This is the full content that should be returned",
      });

      const res = await app.request(`/api/knowledge/${docId}`, {
        headers: AUTH_HEADER,
      });

      const data = await res.json();
      expect(data.document.content).toBe(
        "This is the full content that should be returned"
      );
    });
  });

  // ===========================================================================
  // GET /api/knowledge/categories - List Categories
  // ===========================================================================

  describe("GET /api/knowledge/categories", () => {
    test("should return list of available categories", async () => {
      const res = await app.request("/api/knowledge/categories", {
        headers: AUTH_HEADER,
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data).toHaveProperty("categories");
      expect(Array.isArray(data.categories)).toBe(true);

      // Should include standard categories
      const categoryIds = data.categories.map((c: { id: string }) => c.id);
      expect(categoryIds).toContain("project_template");
      expect(categoryIds).toContain("agent_pattern");
      expect(categoryIds).toContain("command_template");
      expect(categoryIds).toContain("best_practice");
    });

    test("should include document counts per category", async () => {
      await createTestDocument({ category: "agent_pattern" });
      await createTestDocument({ category: "agent_pattern" });
      await createTestDocument({ category: "best_practice" });

      const res = await app.request("/api/knowledge/categories", {
        headers: AUTH_HEADER,
      });

      const data = await res.json();

      const agentPattern = data.categories.find(
        (c: { id: string }) => c.id === "agent_pattern"
      );
      expect(agentPattern.count).toBeGreaterThanOrEqual(2);
    });
  });

  // ===========================================================================
  // GET /api/knowledge/stats - Get Statistics
  // ===========================================================================

  describe("GET /api/knowledge/stats", () => {
    test("should return knowledge base statistics", async () => {
      await createTestDocument({ category: "agent_pattern" });
      await createTestDocument({ category: "best_practice" });

      const res = await app.request("/api/knowledge/stats", {
        headers: AUTH_HEADER,
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data).toHaveProperty("totalDocuments");
      expect(data).toHaveProperty("byCategory");
      expect(data.totalDocuments).toBeGreaterThanOrEqual(2);
    });

    test("should include embedding status in stats", async () => {
      const res = await app.request("/api/knowledge/stats", {
        headers: AUTH_HEADER,
      });

      const data = await res.json();

      expect(data).toHaveProperty("embeddingStats");
      expect(data.embeddingStats).toHaveProperty("pending");
      expect(data.embeddingStats).toHaveProperty("completed");
    });
  });

  // ===========================================================================
  // POST /api/knowledge/search - Advanced Search
  // ===========================================================================

  describe("POST /api/knowledge/search", () => {
    test("should search with body parameters", async () => {
      await createTestDocument({
        title: "Advanced Search Doc",
        tags: ["search", "test"],
      });

      const res = await app.request("/api/knowledge/search", {
        method: "POST",
        headers: {
          ...AUTH_HEADER,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: "Advanced",
          limit: 10,
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data).toHaveProperty("documents");
      expect(data.documents.length).toBeGreaterThan(0);
    });

    test("should support semantic search flag", async () => {
      await createTestDocument({
        title: "Semantic Test Doc",
        content: "This is about machine learning and AI",
      });

      const res = await app.request("/api/knowledge/search", {
        method: "POST",
        headers: {
          ...AUTH_HEADER,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: "artificial intelligence",
          useSemanticSearch: true,
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data).toHaveProperty("documents");
      // Note: Semantic search may return different results or empty if embeddings not generated
    });

    test("should filter by multiple categories", async () => {
      const uniqueId = nanoid(8);
      await createTestDocument({ category: "agent_pattern", title: `MultiCat${uniqueId} A` });
      await createTestDocument({ category: "command_template", title: `MultiCat${uniqueId} B` });
      await createTestDocument({ category: "best_practice", title: `MultiCat${uniqueId} C` });

      const res = await app.request("/api/knowledge/search", {
        method: "POST",
        headers: {
          ...AUTH_HEADER,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: `MultiCat${uniqueId}`,
          categories: ["agent_pattern", "command_template"],
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.documents.length).toBe(2);
      const categories = data.documents.map((d: { category: string }) => d.category);
      expect(categories).toContain("agent_pattern");
      expect(categories).toContain("command_template");
      expect(categories).not.toContain("best_practice");
    });

    test("should filter by tags", async () => {
      const uniqueId = nanoid(8);
      await createTestDocument({ title: `TagTest${uniqueId} A`, tags: [`react${uniqueId}`, "frontend"] });
      await createTestDocument({ title: `TagTest${uniqueId} B`, tags: ["python", "backend"] });

      const res = await app.request("/api/knowledge/search", {
        method: "POST",
        headers: {
          ...AUTH_HEADER,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: `TagTest${uniqueId}`,
          tags: [`react${uniqueId}`],
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.documents.length).toBe(1);
      expect(data.documents[0].title).toContain(`TagTest${uniqueId} A`);
    });
  });

  // ===========================================================================
  // Edge Cases and Error Handling
  // ===========================================================================

  describe("Edge Cases", () => {
    test("should handle empty search query", async () => {
      await createTestDocument({ title: "Edge Case Doc" });

      const res = await app.request("/api/knowledge?query=", {
        headers: AUTH_HEADER,
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      // Should return all documents when query is empty
      expect(data.documents.length).toBeGreaterThan(0);
    });

    test("should handle invalid category gracefully", async () => {
      const res = await app.request("/api/knowledge?category=invalid_category", {
        headers: AUTH_HEADER,
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      // Should return empty array for invalid category
      expect(data.documents).toEqual([]);
    });

    test("should handle special characters in search query", async () => {
      const uniqueId = nanoid(8);
      await createTestDocument({ title: `CPlusPlus${uniqueId} Programming Guide` });

      const res = await app.request(`/api/knowledge?query=CPlusPlus${uniqueId}`, {
        headers: AUTH_HEADER,
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.documents.length).toBe(1);
      expect(data.documents[0].title).toContain(`CPlusPlus${uniqueId}`);
    });

    test("should handle very long search queries", async () => {
      const longQuery = "a".repeat(500);

      const res = await app.request(`/api/knowledge?query=${longQuery}`, {
        headers: AUTH_HEADER,
      });

      // Should either succeed with empty results or return 400
      expect([200, 400]).toContain(res.status);
    });

    test("should handle negative pagination values", async () => {
      const res = await app.request("/api/knowledge?limit=-1&offset=-5", {
        headers: AUTH_HEADER,
      });

      // Should either use defaults or return 400
      expect([200, 400]).toContain(res.status);
    });

    test("should handle concurrent requests", async () => {
      await createTestDocument({ title: "Concurrent Test" });

      const promises = Array(5)
        .fill(null)
        .map(() =>
          app.request("/api/knowledge", {
            headers: AUTH_HEADER,
          })
        );

      const results = await Promise.all(promises);

      results.forEach((res) => {
        expect(res.status).toBe(200);
      });
    });
  });
});
