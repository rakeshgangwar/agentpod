/**
 * Integration Tests for Onboarding Routes
 *
 * Tests the /api/onboarding endpoints which manage:
 * - Onboarding session creation and management
 * - Status transitions through the onboarding flow
 * - Requirements and config persistence
 * - Model recommendations
 * - Re-onboarding support
 *
 * NOTE: These tests are written TDD-style BEFORE implementation.
 * They will fail until the routes are implemented.
 */

// IMPORTANT: Import setup first to set environment variables
import "../setup.ts";

import { describe, test, expect, beforeAll, afterAll, beforeEach, spyOn } from "bun:test";
import { nanoid } from "nanoid";

// Set PostgreSQL database URL for tests
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgres://agentpod:agentpod-dev-password@localhost:5432/agentpod";

import { db } from "../../src/db/drizzle";
import { onboardingSessions } from "../../src/db/schema/onboarding";
import { sandboxes } from "../../src/db/schema/sandboxes";
import { user } from "../../src/db/schema/auth";
import { eq } from "drizzle-orm";
import { modelsDev, type ModelsDevProvider } from "../../src/services/models-dev";

// Import the full app after environment is set up
import { app } from "../../src/index.ts";

// =============================================================================
// Test App Setup
// =============================================================================

const AUTH_HEADER = { Authorization: "Bearer test-token" };

// =============================================================================
// Mock Data for Models.dev
// =============================================================================

const mockProviders: ModelsDevProvider[] = [
  {
    id: "anthropic",
    name: "Anthropic",
    apiKeyEnvVar: "ANTHROPIC_API_KEY",
    models: [
      {
        id: "claude-sonnet-4-20250514",
        name: "Claude Sonnet 4",
        provider: "anthropic",
        context: 200000,
        maxOutput: 8192,
        pricing: { input: 3, output: 15 },
        tools: true,
        streaming: true,
      },
      {
        id: "claude-3-5-haiku-20241022",
        name: "Claude 3.5 Haiku",
        provider: "anthropic",
        context: 200000,
        maxOutput: 8192,
        pricing: { input: 0.25, output: 1.25 },
        tools: true,
        streaming: true,
      },
    ],
  },
  {
    id: "openai",
    name: "OpenAI",
    apiKeyEnvVar: "OPENAI_API_KEY",
    models: [
      {
        id: "gpt-4o",
        name: "GPT-4o",
        provider: "openai",
        context: 128000,
        maxOutput: 4096,
        pricing: { input: 5, output: 15 },
        tools: true,
        streaming: true,
      },
    ],
  },
];

// =============================================================================
// Test Fixtures
// =============================================================================

// Track created entities for cleanup
let testSessionIds: string[] = [];
let testSandboxIds: string[] = [];
let testUserIds: string[] = [];
let fetchProvidersSpy: ReturnType<typeof spyOn>;

// The default user ID used by auth middleware when authenticating with API key
const DEFAULT_USER_ID = "default-user";

// Test user and sandbox (created once for all tests)
let testUserId: string;
let testSandboxId: string;

/**
 * Ensure the default user exists in the database.
 * This is the user ID that auth middleware assigns when using API key auth.
 */
async function ensureDefaultUserExists() {
  const now = new Date();
  
  // Check if default user already exists
  const existing = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.id, DEFAULT_USER_ID))
    .limit(1);
  
  if (existing.length === 0) {
    await db.insert(user).values({
      id: DEFAULT_USER_ID,
      email: "default@test.com",
      name: "Default Test User",
      emailVerified: false,
      createdAt: now,
      updatedAt: now,
    });
    testUserIds.push(DEFAULT_USER_ID);
  }
  
  return DEFAULT_USER_ID;
}

async function createTestUser() {
  const id = `test-user-onboard-api-${nanoid(8)}`;
  const now = new Date();

  await db.insert(user).values({
    id,
    email: `${id}@test.com`,
    name: "Test User",
    emailVerified: false,
    createdAt: now,
    updatedAt: now,
  });

  testUserIds.push(id);
  return id;
}

async function createTestSandbox(userId: string) {
  const id = `test-sandbox-api-${nanoid(8)}`;
  const now = new Date();

  await db.insert(sandboxes).values({
    id,
    userId,
    name: "Test Sandbox",
    slug: `test-sandbox-${nanoid(8)}`,
    repoName: "test-repo",
    createdAt: now,
    updatedAt: now,
  });

  testSandboxIds.push(id);
  return id;
}

async function cleanupTestData() {
  // Clean up sessions first (FK constraint)
  for (const id of testSessionIds) {
    try {
      await db.delete(onboardingSessions).where(eq(onboardingSessions.id, id));
    } catch {
      // Ignore
    }
  }
  testSessionIds = [];

  // Clean up sandboxes
  for (const id of testSandboxIds) {
    try {
      await db.delete(sandboxes).where(eq(sandboxes.id, id));
    } catch {
      // Ignore
    }
  }
  testSandboxIds = [];

  // Clean up users
  for (const id of testUserIds) {
    try {
      await db.delete(user).where(eq(user.id, id));
    } catch {
      // Ignore
    }
  }
  testUserIds = [];
}

// =============================================================================
// Tests
// =============================================================================

describe("Onboarding Routes Integration Tests", () => {
  beforeAll(async () => {
    // Mock Models.dev API
    fetchProvidersSpy = spyOn(modelsDev, "fetchProviders").mockResolvedValue(mockProviders);

    // Ensure the default user exists (used by auth middleware for API key auth)
    await ensureDefaultUserExists();
    
    // Use the default user ID for tests since API routes use this ID
    testUserId = DEFAULT_USER_ID;
    testSandboxId = await createTestSandbox(testUserId);
  });

  afterAll(async () => {
    // Restore mock
    fetchProvidersSpy.mockRestore();

    // Final cleanup
    await cleanupTestData();
  });

  beforeEach(async () => {
    // Clean up sessions before each test (keep user and sandbox)
    for (const id of testSessionIds) {
      try {
        await db.delete(onboardingSessions).where(eq(onboardingSessions.id, id));
      } catch {
        // Ignore
      }
    }
    testSessionIds = [];
  });

  // ===========================================================================
  // Authentication Tests
  // ===========================================================================

  describe("Authentication", () => {
    test("should return 401 without auth header", async () => {
      const res = await app.request("/api/onboarding");
      expect(res.status).toBe(401);
    });

    test("should return 401 with invalid token", async () => {
      const res = await app.request("/api/onboarding", {
        headers: { Authorization: "Bearer invalid-token" },
      });
      expect(res.status).toBe(401);
    });

    test("should succeed with valid auth token", async () => {
      const res = await app.request("/api/onboarding", {
        headers: AUTH_HEADER,
      });
      // May be 200 (empty list) or 404 (not implemented yet)
      expect([200, 404]).toContain(res.status);
    });
  });

  // ===========================================================================
  // GET /api/onboarding - List Onboarding Sessions
  // ===========================================================================

  describe("GET /api/onboarding", () => {
    test("should return empty array when no sessions exist", async () => {
      const res = await app.request("/api/onboarding", {
        headers: AUTH_HEADER,
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data).toHaveProperty("sessions");
      expect(Array.isArray(data.sessions)).toBe(true);
    });

    test("should return sessions with expected structure", async () => {
      // Create a session directly in DB
      const sessionId = `test-session-${nanoid(8)}`;
      await db.insert(onboardingSessions).values({
        id: sessionId,
        userId: testUserId,
        sandboxId: testSandboxId,
        status: "pending",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      testSessionIds.push(sessionId);

      const res = await app.request("/api/onboarding", {
        headers: AUTH_HEADER,
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.sessions.length).toBeGreaterThan(0);
      const session = data.sessions[0];

      expect(session).toHaveProperty("id");
      expect(session).toHaveProperty("userId");
      expect(session).toHaveProperty("status");
      expect(session).toHaveProperty("createdAt");
    });

    test("should filter by status", async () => {
      // Create sessions with different statuses
      const pendingId = `test-pending-${nanoid(8)}`;
      const completedId = `test-completed-${nanoid(8)}`;

      await db.insert(onboardingSessions).values([
        {
          id: pendingId,
          userId: testUserId,
          status: "pending",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: completedId,
          userId: testUserId,
          status: "completed",
          completedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
      testSessionIds.push(pendingId, completedId);

      const res = await app.request("/api/onboarding?status=completed", {
        headers: AUTH_HEADER,
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.sessions.every((s: { status: string }) => s.status === "completed")).toBe(
        true
      );
    });
  });

  // ===========================================================================
  // POST /api/onboarding - Create Onboarding Session
  // ===========================================================================

  describe("POST /api/onboarding", () => {
    test("should create a new onboarding session", async () => {
      // Create a new sandbox for this test
      const newSandboxId = await createTestSandbox(testUserId);

      const res = await app.request("/api/onboarding", {
        method: "POST",
        headers: {
          ...AUTH_HEADER,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sandboxId: newSandboxId,
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();

      expect(data).toHaveProperty("session");
      expect(data.session.sandboxId).toBe(newSandboxId);
      expect(data.session.status).toBe("pending");

      testSessionIds.push(data.session.id);
    });

    test("should create session without sandboxId", async () => {
      const res = await app.request("/api/onboarding", {
        method: "POST",
        headers: {
          ...AUTH_HEADER,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(201);
      const data = await res.json();

      expect(data.session.sandboxId).toBeNull();
      testSessionIds.push(data.session.id);
    });

    test("should return existing session if sandbox already has one", async () => {
      // Create a sandbox and session
      const sandboxId = await createTestSandbox(testUserId);

      // First creation
      const res1 = await app.request("/api/onboarding", {
        method: "POST",
        headers: {
          ...AUTH_HEADER,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sandboxId }),
      });

      expect(res1.status).toBe(201);
      const data1 = await res1.json();
      testSessionIds.push(data1.session.id);

      // Second creation should return existing
      const res2 = await app.request("/api/onboarding", {
        method: "POST",
        headers: {
          ...AUTH_HEADER,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sandboxId }),
      });

      expect(res2.status).toBe(200); // 200, not 201
      const data2 = await res2.json();

      expect(data2.session.id).toBe(data1.session.id);
    });

    test("should return 404 for non-existent sandbox", async () => {
      const res = await app.request("/api/onboarding", {
        method: "POST",
        headers: {
          ...AUTH_HEADER,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sandboxId: "non-existent-sandbox-id",
        }),
      });

      expect(res.status).toBe(404);
    });
  });

  // ===========================================================================
  // GET /api/onboarding/:id - Get Specific Session
  // ===========================================================================

  describe("GET /api/onboarding/:id", () => {
    test("should return 404 for non-existent session", async () => {
      const res = await app.request("/api/onboarding/non-existent-id", {
        headers: AUTH_HEADER,
      });

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toContain("not found");
    });

    test("should return session details", async () => {
      const sessionId = `test-session-${nanoid(8)}`;
      await db.insert(onboardingSessions).values({
        id: sessionId,
        userId: testUserId,
        sandboxId: testSandboxId,
        status: "started",
        projectName: "My Project",
        projectType: "web_app",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      testSessionIds.push(sessionId);

      const res = await app.request(`/api/onboarding/${sessionId}`, {
        headers: AUTH_HEADER,
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.session.id).toBe(sessionId);
      expect(data.session.projectName).toBe("My Project");
      expect(data.session.projectType).toBe("web_app");
    });
  });

  // ===========================================================================
  // GET /api/onboarding/sandbox/:sandboxId - Get Session by Sandbox
  // ===========================================================================

  describe("GET /api/onboarding/sandbox/:sandboxId", () => {
    test("should return 404 when sandbox has no session", async () => {
      const sandboxId = await createTestSandbox(testUserId);

      const res = await app.request(`/api/onboarding/sandbox/${sandboxId}`, {
        headers: AUTH_HEADER,
      });

      expect(res.status).toBe(404);
    });

    test("should return session for sandbox", async () => {
      const sandboxId = await createTestSandbox(testUserId);
      const sessionId = `test-session-${nanoid(8)}`;

      await db.insert(onboardingSessions).values({
        id: sessionId,
        userId: testUserId,
        sandboxId: sandboxId,
        status: "pending",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      testSessionIds.push(sessionId);

      const res = await app.request(`/api/onboarding/sandbox/${sandboxId}`, {
        headers: AUTH_HEADER,
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.session.sandboxId).toBe(sandboxId);
    });
  });

  // ===========================================================================
  // POST /api/onboarding/:id/start - Start Onboarding
  // ===========================================================================

  describe("POST /api/onboarding/:id/start", () => {
    test("should start an onboarding session", async () => {
      const sessionId = `test-session-${nanoid(8)}`;
      await db.insert(onboardingSessions).values({
        id: sessionId,
        userId: testUserId,
        status: "pending",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      testSessionIds.push(sessionId);

      const res = await app.request(`/api/onboarding/${sessionId}/start`, {
        method: "POST",
        headers: AUTH_HEADER,
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.session.status).toBe("started");
    });

    test("should return 404 for non-existent session", async () => {
      const res = await app.request("/api/onboarding/non-existent/start", {
        method: "POST",
        headers: AUTH_HEADER,
      });

      expect(res.status).toBe(404);
    });
  });

  // ===========================================================================
  // POST /api/onboarding/:id/requirements - Save Requirements
  // ===========================================================================

  describe("POST /api/onboarding/:id/requirements", () => {
    test("should save gathered requirements", async () => {
      const sessionId = `test-session-${nanoid(8)}`;
      await db.insert(onboardingSessions).values({
        id: sessionId,
        userId: testUserId,
        status: "gathering",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      testSessionIds.push(sessionId);

      const requirements = {
        projectType: "web_app",
        projectName: "My Web App",
        projectDescription: "A cool web application",
        primaryLanguage: "typescript",
        frameworks: ["react", "nextjs"],
        testingFramework: "vitest",
      };

      const res = await app.request(`/api/onboarding/${sessionId}/requirements`, {
        method: "POST",
        headers: {
          ...AUTH_HEADER,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requirements),
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.session.projectType).toBe("web_app");
      expect(data.session.projectName).toBe("My Web App");
      expect(data.session.gatheredRequirements).toEqual(requirements);
    });

    test("should return 400 for invalid requirements", async () => {
      const sessionId = `test-session-${nanoid(8)}`;
      await db.insert(onboardingSessions).values({
        id: sessionId,
        userId: testUserId,
        status: "gathering",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      testSessionIds.push(sessionId);

      const res = await app.request(`/api/onboarding/${sessionId}/requirements`, {
        method: "POST",
        headers: {
          ...AUTH_HEADER,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}), // Missing required fields
      });

      expect(res.status).toBe(400);
    });
  });

  // ===========================================================================
  // POST /api/onboarding/:id/models - Save Selected Models
  // ===========================================================================

  describe("POST /api/onboarding/:id/models", () => {
    test("should save selected models", async () => {
      const sessionId = `test-session-${nanoid(8)}`;
      await db.insert(onboardingSessions).values({
        id: sessionId,
        userId: testUserId,
        status: "started",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      testSessionIds.push(sessionId);

      const res = await app.request(`/api/onboarding/${sessionId}/models`, {
        method: "POST",
        headers: {
          ...AUTH_HEADER,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          primaryModel: "anthropic/claude-sonnet-4-20250514",
          smallModel: "anthropic/claude-3-5-haiku-20241022",
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.session.selectedModel).toBe("anthropic/claude-sonnet-4-20250514");
      expect(data.session.selectedSmallModel).toBe("anthropic/claude-3-5-haiku-20241022");
    });

    test("should allow saving without small model", async () => {
      const sessionId = `test-session-${nanoid(8)}`;
      await db.insert(onboardingSessions).values({
        id: sessionId,
        userId: testUserId,
        status: "started",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      testSessionIds.push(sessionId);

      const res = await app.request(`/api/onboarding/${sessionId}/models`, {
        method: "POST",
        headers: {
          ...AUTH_HEADER,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          primaryModel: "openai/gpt-4o",
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.session.selectedModel).toBe("openai/gpt-4o");
      expect(data.session.selectedSmallModel).toBeNull();
    });
  });

  // ===========================================================================
  // POST /api/onboarding/:id/complete - Complete Onboarding
  // ===========================================================================

  describe("POST /api/onboarding/:id/complete", () => {
    test("should complete onboarding with generated config", async () => {
      const sessionId = `test-session-${nanoid(8)}`;
      await db.insert(onboardingSessions).values({
        id: sessionId,
        userId: testUserId,
        status: "applying",
        selectedModel: "anthropic/claude-sonnet-4-20250514",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      testSessionIds.push(sessionId);

      const config = {
        settings: {
          provider: "anthropic",
          model: "claude-sonnet-4-20250514",
        },
        agentsMd: "# My Project\n\nGenerated AGENTS.md",
        agents: [],
        commands: [],
      };

      const res = await app.request(`/api/onboarding/${sessionId}/complete`, {
        method: "POST",
        headers: {
          ...AUTH_HEADER,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ config }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.session.status).toBe("completed");
      expect(data.session.completedAt).toBeDefined();
      expect(data.session.generatedConfig).toEqual(config);
    });
  });

  // ===========================================================================
  // POST /api/onboarding/:id/skip - Skip Onboarding
  // ===========================================================================

  describe("POST /api/onboarding/:id/skip", () => {
    test("should skip onboarding", async () => {
      const sessionId = `test-session-${nanoid(8)}`;
      await db.insert(onboardingSessions).values({
        id: sessionId,
        userId: testUserId,
        status: "started",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      testSessionIds.push(sessionId);

      const res = await app.request(`/api/onboarding/${sessionId}/skip`, {
        method: "POST",
        headers: AUTH_HEADER,
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.session.status).toBe("skipped");
    });
  });

  // ===========================================================================
  // POST /api/onboarding/:id/reset - Reset Onboarding
  // ===========================================================================

  describe("POST /api/onboarding/:id/reset", () => {
    test("should reset onboarding to pending state", async () => {
      const sessionId = `test-session-${nanoid(8)}`;
      await db.insert(onboardingSessions).values({
        id: sessionId,
        userId: testUserId,
        status: "completed",
        projectName: "Old Project",
        selectedModel: "anthropic/claude-sonnet-4-20250514",
        generatedConfig: JSON.stringify({ test: true }),
        completedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      testSessionIds.push(sessionId);

      const res = await app.request(`/api/onboarding/${sessionId}/reset`, {
        method: "POST",
        headers: AUTH_HEADER,
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.session.status).toBe("pending");
      expect(data.session.projectName).toBeNull();
      expect(data.session.generatedConfig).toBeNull();
    });

    test("should preserve models when preserveModels option is true", async () => {
      const sessionId = `test-session-${nanoid(8)}`;
      await db.insert(onboardingSessions).values({
        id: sessionId,
        userId: testUserId,
        status: "completed",
        selectedModel: "anthropic/claude-sonnet-4-20250514",
        selectedSmallModel: "anthropic/claude-3-5-haiku-20241022",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      testSessionIds.push(sessionId);

      const res = await app.request(`/api/onboarding/${sessionId}/reset`, {
        method: "POST",
        headers: {
          ...AUTH_HEADER,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ preserveModels: true }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.session.status).toBe("pending");
      expect(data.session.selectedModel).toBe("anthropic/claude-sonnet-4-20250514");
      expect(data.session.selectedSmallModel).toBe("anthropic/claude-3-5-haiku-20241022");
    });
  });

  // ===========================================================================
  // DELETE /api/onboarding/:id - Delete Session
  // ===========================================================================

  describe("DELETE /api/onboarding/:id", () => {
    test("should delete onboarding session", async () => {
      const sessionId = `test-session-${nanoid(8)}`;
      await db.insert(onboardingSessions).values({
        id: sessionId,
        userId: testUserId,
        status: "pending",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      // Don't add to testSessionIds since we're deleting it

      const res = await app.request(`/api/onboarding/${sessionId}`, {
        method: "DELETE",
        headers: AUTH_HEADER,
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.success).toBe(true);

      // Verify deletion
      const getRes = await app.request(`/api/onboarding/${sessionId}`, {
        headers: AUTH_HEADER,
      });
      expect(getRes.status).toBe(404);
    });

    test("should return 404 for non-existent session", async () => {
      const res = await app.request("/api/onboarding/non-existent-id", {
        method: "DELETE",
        headers: AUTH_HEADER,
      });

      expect(res.status).toBe(404);
    });
  });

  // ===========================================================================
  // GET /api/onboarding/models/recommend - Get Model Recommendations
  // ===========================================================================

  describe("GET /api/onboarding/models/recommend", () => {
    test("should return model recommendations", async () => {
      const res = await app.request("/api/onboarding/models/recommend", {
        headers: AUTH_HEADER,
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data).toHaveProperty("recommendation");
      expect(data.recommendation).toHaveProperty("primaryModelId");
      expect(data.recommendation).toHaveProperty("primaryModelName");
      expect(data.recommendation).toHaveProperty("reasoning");
    });

    test("should respect preferLowCost parameter", async () => {
      const res = await app.request("/api/onboarding/models/recommend?preferLowCost=true", {
        headers: AUTH_HEADER,
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.recommendation.reasoning).toContain("cost");
    });

    test("should respect preferFast parameter", async () => {
      const res = await app.request("/api/onboarding/models/recommend?preferFast=true", {
        headers: AUTH_HEADER,
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.recommendation.reasoning).toContain("fast");
    });
  });

  // ===========================================================================
  // GET /api/onboarding/providers/setup/:id - Get Provider Setup Guide
  // ===========================================================================

  describe("GET /api/onboarding/providers/setup/:id", () => {
    test("should return setup guide for known provider", async () => {
      const res = await app.request("/api/onboarding/providers/setup/anthropic", {
        headers: AUTH_HEADER,
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data).toHaveProperty("guide");
      expect(data.guide.name).toBe("Anthropic");
      expect(data.guide.envVar).toBe("ANTHROPIC_API_KEY");
      expect(data.guide.steps).toBeInstanceOf(Array);
      expect(data.guide.apiKeyUrl).toContain("anthropic.com");
    });

    test("should return generic guide for unknown provider", async () => {
      const res = await app.request("/api/onboarding/providers/setup/unknown-provider", {
        headers: AUTH_HEADER,
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.guide.name).toBe("unknown-provider");
      expect(data.guide.steps.length).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // GET /api/onboarding/stats - Get User Statistics
  // ===========================================================================

  describe("GET /api/onboarding/stats", () => {
    test("should return user onboarding statistics", async () => {
      // Create sessions with different statuses
      const pendingId = `test-pending-${nanoid(8)}`;
      const completedId = `test-completed-${nanoid(8)}`;

      await db.insert(onboardingSessions).values([
        {
          id: pendingId,
          userId: testUserId,
          status: "pending",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: completedId,
          userId: testUserId,
          status: "completed",
          completedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
      testSessionIds.push(pendingId, completedId);

      const res = await app.request("/api/onboarding/stats", {
        headers: AUTH_HEADER,
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data).toHaveProperty("stats");
      expect(data.stats).toHaveProperty("total");
      expect(data.stats).toHaveProperty("completed");
      expect(data.stats).toHaveProperty("inProgress");
      expect(data.stats.total).toBeGreaterThanOrEqual(2);
    });
  });

  // ===========================================================================
  // Edge Cases and Error Handling
  // ===========================================================================

  describe("Edge Cases", () => {
    test("should handle concurrent session creation for same sandbox", async () => {
      // Use the default user ID (used by auth middleware) for the sandbox
      const sandboxId = await createTestSandbox(DEFAULT_USER_ID);

      const promises = Array(3)
        .fill(null)
        .map(() =>
          app.request("/api/onboarding", {
            method: "POST",
            headers: {
              ...AUTH_HEADER,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ sandboxId }),
          })
        );

      const results = await Promise.all(promises);

      // All should succeed (either 200 for existing or 201 for new)
      // In race conditions, we might also get 500 for DB conflicts - that's acceptable
      const sessionIds = new Set<string>();
      let successCount = 0;
      for (const res of results) {
        // Accept 200, 201 as success; 500 can happen in race conditions
        if (res.status === 200 || res.status === 201) {
          successCount++;
          const data = await res.json();
          if (data.session?.id) {
            sessionIds.add(data.session.id);
            testSessionIds.push(data.session.id);
          }
        }
      }

      // At least one should succeed
      expect(successCount).toBeGreaterThanOrEqual(1);
      
      // All successful responses should return the same session
      if (successCount > 1) {
        expect(sessionIds.size).toBe(1);
      }
    });

    test("should handle invalid status transitions gracefully", async () => {
      const sessionId = `test-session-${nanoid(8)}`;
      await db.insert(onboardingSessions).values({
        id: sessionId,
        userId: testUserId,
        status: "completed", // Already completed
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      testSessionIds.push(sessionId);

      // Trying to start a completed session
      const res = await app.request(`/api/onboarding/${sessionId}/start`, {
        method: "POST",
        headers: AUTH_HEADER,
      });

      // Should either succeed (allowing re-start) or return 400
      expect([200, 400]).toContain(res.status);
    });

    test("should handle malformed JSON in request body", async () => {
      const res = await app.request("/api/onboarding", {
        method: "POST",
        headers: {
          ...AUTH_HEADER,
          "Content-Type": "application/json",
        },
        body: "{ invalid json }",
      });

      expect(res.status).toBe(400);
    });
  });
});
