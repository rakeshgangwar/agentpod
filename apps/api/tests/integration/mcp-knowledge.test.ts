/**
 * Integration Tests for MCP Knowledge Endpoint
 *
 * Tests the /api/mcp/knowledge endpoint which serves as an MCP server
 * for the onboarding agent to query the knowledge base.
 *
 * MCP Protocol Reference:
 * - POST /api/mcp/knowledge (handles JSON-RPC style requests)
 * - tools/list - List available tools
 * - tools/call - Execute a tool
 *
 * Available tools:
 * - search_knowledge - Search knowledge documents
 * - get_project_template - Get a project template by type
 * - get_agent_pattern - Get an agent pattern by role
 * - get_command_template - Get a command template by name
 * - list_project_types - List available project types
 * - get_available_models - Get available AI models
 * - get_provider_setup_guide - Get provider setup guide
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
    applicableTo: string[];
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
    applicableTo: JSON.stringify(overrides.applicableTo || []),
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

// Helper to make MCP requests
async function mcpRequest(method: string, params?: Record<string, unknown>) {
  const body: any = { method };
  if (params) {
    body.params = params;
  }

  return app.request("/api/mcp/knowledge", {
    method: "POST",
    headers: {
      ...AUTH_HEADER,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

// =============================================================================
// Tests
// =============================================================================

describe("MCP Knowledge Endpoint Integration Tests", () => {
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
  // tools/list Tests
  // ===========================================================================

  describe("tools/list", () => {
    test("should return list of available tools", async () => {
      const res = await mcpRequest("tools/list");
      
      expect(res.status).toBe(200);
      
      const data = await res.json();
      expect(data.tools).toBeDefined();
      expect(Array.isArray(data.tools)).toBe(true);
      expect(data.tools.length).toBeGreaterThan(0);
    });

    test("should include search_knowledge tool", async () => {
      const res = await mcpRequest("tools/list");
      const data = await res.json();
      
      const searchTool = data.tools.find((t: any) => t.name === "search_knowledge");
      expect(searchTool).toBeDefined();
      expect(searchTool.description).toBeDefined();
      expect(searchTool.inputSchema).toBeDefined();
      expect(searchTool.inputSchema.properties.query).toBeDefined();
    });

    test("should include get_project_template tool", async () => {
      const res = await mcpRequest("tools/list");
      const data = await res.json();
      
      const tool = data.tools.find((t: any) => t.name === "get_project_template");
      expect(tool).toBeDefined();
      expect(tool.inputSchema.properties.project_type).toBeDefined();
    });

    test("should include get_agent_pattern tool", async () => {
      const res = await mcpRequest("tools/list");
      const data = await res.json();
      
      const tool = data.tools.find((t: any) => t.name === "get_agent_pattern");
      expect(tool).toBeDefined();
      expect(tool.inputSchema.properties.role).toBeDefined();
    });

    test("should include get_command_template tool", async () => {
      const res = await mcpRequest("tools/list");
      const data = await res.json();
      
      const tool = data.tools.find((t: any) => t.name === "get_command_template");
      expect(tool).toBeDefined();
      expect(tool.inputSchema.properties.name).toBeDefined();
    });

    test("should include list_project_types tool", async () => {
      const res = await mcpRequest("tools/list");
      const data = await res.json();
      
      const tool = data.tools.find((t: any) => t.name === "list_project_types");
      expect(tool).toBeDefined();
    });

    test("should include get_available_models tool", async () => {
      const res = await mcpRequest("tools/list");
      const data = await res.json();
      
      const tool = data.tools.find((t: any) => t.name === "get_available_models");
      expect(tool).toBeDefined();
    });

    test("should include get_provider_setup_guide tool", async () => {
      const res = await mcpRequest("tools/list");
      const data = await res.json();
      
      const tool = data.tools.find((t: any) => t.name === "get_provider_setup_guide");
      expect(tool).toBeDefined();
      expect(tool.inputSchema.properties.provider).toBeDefined();
    });
  });

  // ===========================================================================
  // tools/call - search_knowledge Tests
  // ===========================================================================

  describe("tools/call - search_knowledge", () => {
    test("should search knowledge documents", async () => {
      // Create test documents
      await createTestDocument({
        title: "React Testing Guide",
        content: "Learn how to test React components with Jest and Testing Library.",
        tags: ["react", "testing"],
      });

      const res = await mcpRequest("tools/call", {
        name: "search_knowledge",
        arguments: { query: "React testing" },
      });

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.content).toBeDefined();
      expect(data.content[0].type).toBe("text");
      
      // Parse the text content as JSON
      const results = JSON.parse(data.content[0].text);
      expect(Array.isArray(results)).toBe(true);
    });

    test("should filter by category", async () => {
      await createTestDocument({
        category: "project_template",
        title: "Web App Template",
        content: "Template for web applications",
      });
      
      await createTestDocument({
        category: "best_practice",
        title: "Coding Standards",
        content: "Best practices for coding",
      });

      const res = await mcpRequest("tools/call", {
        name: "search_knowledge",
        arguments: { 
          query: "template",
          category: "project_template",
        },
      });

      const data = await res.json();
      const results = JSON.parse(data.content[0].text);
      
      // Should only find project_template category
      expect(results.every((r: any) => r.category === "project_template")).toBe(true);
    });

    test("should return empty array when no matches", async () => {
      const res = await mcpRequest("tools/call", {
        name: "search_knowledge",
        arguments: { query: "nonexistent-xyz-query-12345" },
      });

      const data = await res.json();
      const results = JSON.parse(data.content[0].text);
      
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(0);
    });

    test("should respect limit parameter", async () => {
      // Create multiple documents
      for (let i = 0; i < 5; i++) {
        await createTestDocument({
          title: `Test Doc ${i}`,
          content: "Common content for search",
          tags: ["batch-test"],
        });
      }

      const res = await mcpRequest("tools/call", {
        name: "search_knowledge",
        arguments: { 
          query: "Common content",
          limit: 2,
        },
      });

      const data = await res.json();
      const results = JSON.parse(data.content[0].text);
      
      expect(results.length).toBeLessThanOrEqual(2);
    });
  });

  // ===========================================================================
  // tools/call - get_project_template Tests
  // ===========================================================================

  describe("tools/call - get_project_template", () => {
    test("should get project template by type", async () => {
      await createTestDocument({
        category: "project_template",
        title: "Web App",
        description: "Web application template",
        content: "# Web App Template\n\nSetup instructions for web apps.",
        applicableTo: ["web_app"],
      });

      const res = await mcpRequest("tools/call", {
        name: "get_project_template",
        arguments: { project_type: "web_app" },
      });

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.content).toBeDefined();
      
      const result = JSON.parse(data.content[0].text);
      expect(result).toBeDefined();
      expect(result.content).toContain("Web App Template");
    });

    test("should return null for non-existent project type", async () => {
      const res = await mcpRequest("tools/call", {
        name: "get_project_template",
        arguments: { project_type: "nonexistent_type_xyz" },
      });

      const data = await res.json();
      const result = JSON.parse(data.content[0].text);
      
      expect(result).toBeNull();
    });
  });

  // ===========================================================================
  // tools/call - get_agent_pattern Tests
  // ===========================================================================

  describe("tools/call - get_agent_pattern", () => {
    test("should get agent pattern by role", async () => {
      await createTestDocument({
        category: "agent_pattern",
        title: "Code Reviewer",
        description: "Agent pattern for code review",
        content: "# Code Reviewer Agent\n\nReviews code for quality.",
        applicableTo: ["reviewer"],
      });

      const res = await mcpRequest("tools/call", {
        name: "get_agent_pattern",
        arguments: { role: "reviewer" },
      });

      expect(res.status).toBe(200);

      const data = await res.json();
      const result = JSON.parse(data.content[0].text);
      
      expect(result).toBeDefined();
      expect(result.title).toContain("Reviewer");
    });

    test("should return null for non-existent role", async () => {
      const res = await mcpRequest("tools/call", {
        name: "get_agent_pattern",
        arguments: { role: "nonexistent_role_xyz" },
      });

      const data = await res.json();
      const result = JSON.parse(data.content[0].text);
      
      expect(result).toBeNull();
    });
  });

  // ===========================================================================
  // tools/call - get_command_template Tests
  // ===========================================================================

  describe("tools/call - get_command_template", () => {
    test("should get command template by name", async () => {
      await createTestDocument({
        category: "command_template",
        title: "Test Command",
        description: "Command for running tests",
        content: "# Test Command\n\nRun tests for the project.",
        applicableTo: ["test"],
      });

      const res = await mcpRequest("tools/call", {
        name: "get_command_template",
        arguments: { name: "test" },
      });

      expect(res.status).toBe(200);

      const data = await res.json();
      const result = JSON.parse(data.content[0].text);
      
      expect(result).toBeDefined();
      expect(result.content).toContain("Test Command");
    });

    test("should return null for non-existent command", async () => {
      const res = await mcpRequest("tools/call", {
        name: "get_command_template",
        arguments: { name: "nonexistent_command_xyz" },
      });

      const data = await res.json();
      const result = JSON.parse(data.content[0].text);
      
      expect(result).toBeNull();
    });
  });

  // ===========================================================================
  // tools/call - list_project_types Tests
  // ===========================================================================

  describe("tools/call - list_project_types", () => {
    test("should list available project types", async () => {
      const res = await mcpRequest("tools/call", {
        name: "list_project_types",
        arguments: {},
      });

      expect(res.status).toBe(200);

      const data = await res.json();
      const results = JSON.parse(data.content[0].text);
      
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
      
      // Each project type should have name and description
      for (const type of results) {
        expect(type.name).toBeDefined();
        expect(type.description).toBeDefined();
      }
    });
  });

  // ===========================================================================
  // tools/call - get_available_models Tests
  // ===========================================================================

  describe("tools/call - get_available_models", () => {
    test("should return available models", async () => {
      const res = await mcpRequest("tools/call", {
        name: "get_available_models",
        arguments: {},
      });

      expect(res.status).toBe(200);

      const data = await res.json();
      const results = JSON.parse(data.content[0].text);
      
      expect(results).toBeDefined();
      expect(results.models).toBeDefined();
      expect(Array.isArray(results.models)).toBe(true);
    });

    test("should filter by capability", async () => {
      const res = await mcpRequest("tools/call", {
        name: "get_available_models",
        arguments: { capability: "code" },
      });

      const data = await res.json();
      const results = JSON.parse(data.content[0].text);
      
      expect(results.models).toBeDefined();
    });
  });

  // ===========================================================================
  // tools/call - get_provider_setup_guide Tests
  // ===========================================================================

  describe("tools/call - get_provider_setup_guide", () => {
    test("should return provider setup guide", async () => {
      const res = await mcpRequest("tools/call", {
        name: "get_provider_setup_guide",
        arguments: { provider: "anthropic" },
      });

      expect(res.status).toBe(200);

      const data = await res.json();
      const result = JSON.parse(data.content[0].text);
      
      expect(result).toBeDefined();
      expect(result.provider).toBe("anthropic");
      expect(result.steps).toBeDefined();
      expect(Array.isArray(result.steps)).toBe(true);
    });

    test("should return guide for openai", async () => {
      const res = await mcpRequest("tools/call", {
        name: "get_provider_setup_guide",
        arguments: { provider: "openai" },
      });

      const data = await res.json();
      const result = JSON.parse(data.content[0].text);
      
      expect(result).toBeDefined();
      expect(result.provider).toBe("openai");
    });

    test("should handle unknown provider gracefully", async () => {
      const res = await mcpRequest("tools/call", {
        name: "get_provider_setup_guide",
        arguments: { provider: "unknown_provider_xyz" },
      });

      const data = await res.json();
      const result = JSON.parse(data.content[0].text);
      
      // Should return null or a generic guide
      expect(result).toBeDefined();
    });
  });

  // ===========================================================================
  // Error Handling Tests
  // ===========================================================================

  describe("Error Handling", () => {
    test("should return error for unknown method", async () => {
      const res = await mcpRequest("unknown/method");

      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.error).toBeDefined();
    });

    test("should return error for unknown tool", async () => {
      const res = await mcpRequest("tools/call", {
        name: "unknown_tool_xyz",
        arguments: {},
      });

      const data = await res.json();
      expect(data.isError).toBe(true);
    });

    test("should return error for missing required arguments", async () => {
      const res = await mcpRequest("tools/call", {
        name: "get_project_template",
        arguments: {},  // Missing project_type
      });

      const data = await res.json();
      expect(data.isError).toBe(true);
    });
  });

  // ===========================================================================
  // Authentication Tests
  // ===========================================================================

  describe("Authentication", () => {
    test("should require authentication", async () => {
      const res = await app.request("/api/mcp/knowledge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ method: "tools/list" }),
      });

      // Should fail without auth
      expect(res.status).toBe(401);
    });
  });
});
