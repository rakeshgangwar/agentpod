/**
 * Onboarding Service Tests
 *
 * Tests for the onboarding session service including:
 * - Session management (CRUD)
 * - Status transitions
 * - Requirements and config persistence
 * - Re-onboarding support
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { nanoid } from "nanoid";
import type {
  CreateOnboardingSession,
  OnboardingRequirements,
  GeneratedConfig,
} from "@agentpod/types";

// =============================================================================
// Test Setup - Must be before importing the service
// =============================================================================

process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://agentpod:agentpod-dev-password@localhost:5432/agentpod";

import { OnboardingService } from "../../../../src/services/onboarding-service";
import { db } from "../../../../src/db/drizzle";
import { onboardingSessions } from "../../../../src/db/schema/onboarding";
import { user } from "../../../../src/db/schema/auth";
import { sandboxes } from "../../../../src/db/schema/sandboxes";
import { eq } from "drizzle-orm";

// =============================================================================
// Test Fixtures
// =============================================================================

// Shared test user and sandbox for all tests
let testUserId: string;
let testUserId2: string;
let testSandboxId: string;
let testSandboxId2: string;
let testSandboxId3: string; // For getBySandboxId test

function createTestRequirements(overrides: Partial<OnboardingRequirements> = {}): OnboardingRequirements {
  return {
    projectType: "web_app",
    projectName: "Test Project",
    projectDescription: "A test project for unit tests",
    primaryLanguage: "typescript",
    frameworks: ["react", "nextjs"],
    testingFramework: "vitest",
    ...overrides,
  };
}

function createTestConfig(overrides: Partial<GeneratedConfig> = {}): GeneratedConfig {
  return {
    settings: {
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      smallModel: "claude-3-5-haiku-20241022",
    },
    agentsMd: "# Test Project\n\nGenerated AGENTS.md content",
    agents: [
      { name: "reviewer", description: "Code reviewer", content: "You are a code reviewer..." },
    ],
    commands: [
      { name: "test", description: "Run tests", content: "Run the test suite..." },
    ],
    ...overrides,
  };
}

// =============================================================================
// Test Suite
// =============================================================================

describe("OnboardingService", () => {
  let service: OnboardingService;
  let createdSessionIds: string[] = [];

  // Create shared test users and sandboxes before all tests
  beforeAll(async () => {
    const now = new Date();
    
    testUserId = `test-user-onboard-${nanoid(8)}`;
    testUserId2 = `test-user-onboard2-${nanoid(8)}`;
    testSandboxId = `test-sandbox-${nanoid(8)}`;
    testSandboxId2 = `test-sandbox2-${nanoid(8)}`;
    testSandboxId3 = `test-sandbox3-${nanoid(8)}`;
    
    // Create test users
    await db.insert(user).values([
      {
        id: testUserId,
        email: `${testUserId}@test.com`,
        name: "Test User 1",
        emailVerified: false,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: testUserId2,
        email: `${testUserId2}@test.com`,
        name: "Test User 2",
        emailVerified: false,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    // Create test sandboxes (required for FK constraint on sandbox_id)
    await db.insert(sandboxes).values([
      {
        id: testSandboxId,
        userId: testUserId,
        name: "Test Sandbox 1",
        slug: `test-sandbox-${nanoid(8)}`,
        repoName: "test-repo-1",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: testSandboxId2,
        userId: testUserId2,
        name: "Test Sandbox 2",
        slug: `test-sandbox2-${nanoid(8)}`,
        repoName: "test-repo-2",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: testSandboxId3,
        userId: testUserId,
        name: "Test Sandbox 3",
        slug: `test-sandbox3-${nanoid(8)}`,
        repoName: "test-repo-3",
        createdAt: now,
        updatedAt: now,
      },
    ]);
  });

  // Clean up test users and sandboxes after all tests
  afterAll(async () => {
    // Delete sessions first (FK constraint)
    await db.delete(onboardingSessions).where(eq(onboardingSessions.userId, testUserId));
    await db.delete(onboardingSessions).where(eq(onboardingSessions.userId, testUserId2));
    // Then delete sandboxes (FK constraint)
    await db.delete(sandboxes).where(eq(sandboxes.id, testSandboxId));
    await db.delete(sandboxes).where(eq(sandboxes.id, testSandboxId2));
    await db.delete(sandboxes).where(eq(sandboxes.id, testSandboxId3));
    // Finally delete users
    await db.delete(user).where(eq(user.id, testUserId));
    await db.delete(user).where(eq(user.id, testUserId2));
  });

  beforeEach(() => {
    service = new OnboardingService();
    createdSessionIds = [];
  });

  afterEach(async () => {
    // Clean up sessions created during tests
    for (const id of createdSessionIds) {
      try {
        await db.delete(onboardingSessions).where(eq(onboardingSessions.id, id));
      } catch {
        // Ignore errors during cleanup
      }
    }
  });

  // ===========================================================================
  // Session Management
  // ===========================================================================

  describe("create", () => {
    it("should create a new onboarding session", async () => {
      const input: CreateOnboardingSession = {
        userId: testUserId,
        sandboxId: testSandboxId, // Use pre-created sandbox
      };

      const result = await service.create(input);
      createdSessionIds.push(result.id);

      expect(result.id).toBeDefined();
      expect(result.userId).toBe(testUserId);
      expect(result.sandboxId).toBe(testSandboxId);
      expect(result.status).toBe("pending");
      expect(result.createdAt).toBeDefined();
    });

    it("should create session without sandboxId", async () => {
      const input: CreateOnboardingSession = {
        userId: testUserId,
      };

      const result = await service.create(input);
      createdSessionIds.push(result.id);

      expect(result.id).toBeDefined();
      expect(result.sandboxId).toBeNull();
    });

    it("should return existing session if sandbox already has one", async () => {
      // Use testSandboxId2 which is a real sandbox in the DB
      const session1 = await service.create({ userId: testUserId2, sandboxId: testSandboxId2 });
      createdSessionIds.push(session1.id);

      // Try to create another session for the same sandbox
      const session2 = await service.create({ userId: testUserId2, sandboxId: testSandboxId2 });
      // session2 should be the same as session1

      expect(session2.id).toBe(session1.id);
    });
  });

  describe("getById", () => {
    it("should return session when it exists", async () => {
      const session = await service.create({ userId: testUserId });
      createdSessionIds.push(session.id);

      const result = await service.getById(session.id);

      expect(result).not.toBeNull();
      expect(result?.id).toBe(session.id);
    });

    it("should return null when session does not exist", async () => {
      const result = await service.getById("non-existent-id");

      expect(result).toBeNull();
    });
  });

  describe("getBySandboxId", () => {
    it("should return session for sandbox", async () => {
      // Use testSandboxId3 which is a real sandbox in the DB
      const session = await service.create({ userId: testUserId, sandboxId: testSandboxId3 });
      createdSessionIds.push(session.id);

      const result = await service.getBySandboxId(testSandboxId3);

      expect(result).not.toBeNull();
      expect(result?.id).toBe(session.id);
      expect(result?.sandboxId).toBe(testSandboxId3);
    });

    it("should return null when sandbox has no session", async () => {
      const result = await service.getBySandboxId("non-existent-sandbox");

      expect(result).toBeNull();
    });
  });

  describe("getByUserId", () => {
    it("should return all sessions for user", async () => {
      const session1 = await service.create({ userId: testUserId });
      const session2 = await service.create({ userId: testUserId });
      createdSessionIds.push(session1.id, session2.id);

      const results = await service.getByUserId(testUserId);

      expect(results.length).toBeGreaterThanOrEqual(2);
      expect(results.map(r => r.id)).toContain(session1.id);
      expect(results.map(r => r.id)).toContain(session2.id);
    });

    it("should return empty array when user has no sessions", async () => {
      const results = await service.getByUserId("non-existent-user");

      expect(results).toEqual([]);
    });
  });

  describe("update", () => {
    it("should update session fields", async () => {
      const session = await service.create({ userId: testUserId });
      createdSessionIds.push(session.id);

      const updated = await service.update(session.id, {
        projectType: "api_service",
        projectName: "My API",
      });

      expect(updated).not.toBeNull();
      expect(updated?.projectType).toBe("api_service");
      expect(updated?.projectName).toBe("My API");
    });

    it("should set completedAt when status becomes completed", async () => {
      const session = await service.create({ userId: testUserId });
      createdSessionIds.push(session.id);

      const updated = await service.update(session.id, { status: "completed" });

      expect(updated?.status).toBe("completed");
      expect(updated?.completedAt).not.toBeNull();
    });

    it("should return null when session does not exist", async () => {
      const result = await service.update("non-existent-id", { status: "started" });

      expect(result).toBeNull();
    });
  });

  describe("delete", () => {
    it("should delete existing session and return true", async () => {
      const session = await service.create({ userId: testUserId });
      // Don't add to createdSessionIds since we're deleting it

      const deleted = await service.delete(session.id);
      const fetched = await service.getById(session.id);

      expect(deleted).toBe(true);
      expect(fetched).toBeNull();
    });

    it("should return false when session does not exist", async () => {
      const result = await service.delete("non-existent-id");

      expect(result).toBe(false);
    });
  });

  // ===========================================================================
  // Status Transitions
  // ===========================================================================

  describe("status transitions", () => {
    it("should transition through all statuses correctly", async () => {
      const session = await service.create({ userId: testUserId });
      createdSessionIds.push(session.id);

      // pending -> started
      let result = await service.start(session.id);
      expect(result?.status).toBe("started");

      // started -> gathering
      result = await service.markGathering(session.id);
      expect(result?.status).toBe("gathering");

      // gathering -> generating
      result = await service.markGenerating(session.id);
      expect(result?.status).toBe("generating");

      // generating -> applying
      result = await service.markApplying(session.id);
      expect(result?.status).toBe("applying");

      // applying -> completed
      result = await service.complete(session.id, createTestConfig());
      expect(result?.status).toBe("completed");
      expect(result?.completedAt).not.toBeNull();
    });

    it("should handle skip transition", async () => {
      const session = await service.create({ userId: testUserId });
      createdSessionIds.push(session.id);

      await service.start(session.id);
      const result = await service.skip(session.id);

      expect(result?.status).toBe("skipped");
    });

    it("should handle fail transition with error message", async () => {
      const session = await service.create({ userId: testUserId });
      createdSessionIds.push(session.id);

      await service.start(session.id);
      const result = await service.fail(session.id, "Something went wrong");

      expect(result?.status).toBe("failed");
      expect(result?.errorMessage).toBe("Something went wrong");
    });
  });

  // ===========================================================================
  // Requirements & Config
  // ===========================================================================

  describe("saveRequirements", () => {
    it("should save requirements and update project info", async () => {
      const session = await service.create({ userId: testUserId });
      createdSessionIds.push(session.id);

      const requirements = createTestRequirements();
      const result = await service.saveRequirements(session.id, requirements);

      expect(result?.gatheredRequirements).toEqual(requirements);
      expect(result?.projectType).toBe(requirements.projectType);
      expect(result?.projectName).toBe(requirements.projectName);
      expect(result?.projectDescription).toBe(requirements.projectDescription);
    });
  });

  describe("saveConfig", () => {
    it("should save generated config", async () => {
      const session = await service.create({ userId: testUserId });
      createdSessionIds.push(session.id);

      const config = createTestConfig();
      const result = await service.saveConfig(session.id, config);

      expect(result?.generatedConfig).toEqual(config);
    });
  });

  describe("saveModels", () => {
    it("should save selected models", async () => {
      const session = await service.create({ userId: testUserId });
      createdSessionIds.push(session.id);

      const result = await service.saveModels(
        session.id,
        "anthropic/claude-sonnet-4-20250514",
        "anthropic/claude-3-5-haiku-20241022"
      );

      expect(result?.selectedModel).toBe("anthropic/claude-sonnet-4-20250514");
      expect(result?.selectedSmallModel).toBe("anthropic/claude-3-5-haiku-20241022");
    });

    it("should save only primary model when small model is not provided", async () => {
      const session = await service.create({ userId: testUserId });
      createdSessionIds.push(session.id);

      const result = await service.saveModels(session.id, "openai/gpt-4o");

      expect(result?.selectedModel).toBe("openai/gpt-4o");
      expect(result?.selectedSmallModel).toBeNull();
    });
  });

  // ===========================================================================
  // Re-onboarding
  // ===========================================================================

  describe("reset", () => {
    it("should reset session to pending state", async () => {
      const session = await service.create({ userId: testUserId });
      createdSessionIds.push(session.id);

      // Set up a completed session
      await service.start(session.id);
      await service.saveRequirements(session.id, createTestRequirements());
      await service.saveModels(session.id, "anthropic/claude-sonnet-4-20250514");
      await service.complete(session.id, createTestConfig());

      // Reset
      const result = await service.reset(session.id);

      expect(result?.status).toBe("pending");
      expect(result?.projectType).toBeNull();
      expect(result?.projectName).toBeNull();
      expect(result?.gatheredRequirements).toBeNull();
      expect(result?.generatedConfig).toBeNull();
      expect(result?.selectedModel).toBeNull();
    });

    it("should preserve models when preserveModels option is true", async () => {
      const session = await service.create({ userId: testUserId });
      createdSessionIds.push(session.id);

      // Set up a session with models
      await service.saveModels(session.id, "anthropic/claude-sonnet-4-20250514", "anthropic/claude-3-5-haiku-20241022");
      await service.start(session.id);
      await service.saveRequirements(session.id, createTestRequirements());

      // Reset with preserveModels
      const result = await service.reset(session.id, { preserveModels: true });

      expect(result?.status).toBe("pending");
      expect(result?.selectedModel).toBe("anthropic/claude-sonnet-4-20250514");
      expect(result?.selectedSmallModel).toBe("anthropic/claude-3-5-haiku-20241022");
    });

    it("should return null when session does not exist", async () => {
      const result = await service.reset("non-existent-id");

      expect(result).toBeNull();
    });
  });

  // ===========================================================================
  // Statistics
  // ===========================================================================

  describe("getUserStats", () => {
    it("should return correct statistics for user", async () => {
      // Create sessions with different statuses
      const pending = await service.create({ userId: testUserId });
      const completed = await service.create({ userId: testUserId });
      const skipped = await service.create({ userId: testUserId });
      const failed = await service.create({ userId: testUserId });
      const inProgress = await service.create({ userId: testUserId });

      createdSessionIds.push(pending.id, completed.id, skipped.id, failed.id, inProgress.id);

      // Update statuses
      await service.complete(completed.id, createTestConfig());
      await service.skip(skipped.id);
      await service.fail(failed.id, "Test error");
      await service.start(inProgress.id);

      const stats = await service.getUserStats(testUserId);

      expect(stats.total).toBeGreaterThanOrEqual(5);
      expect(stats.completed).toBeGreaterThanOrEqual(1);
      expect(stats.skipped).toBeGreaterThanOrEqual(1);
      expect(stats.failed).toBeGreaterThanOrEqual(1);
      expect(stats.inProgress).toBeGreaterThanOrEqual(2); // pending + started
    });

    it("should return zeros when user has no sessions", async () => {
      const stats = await service.getUserStats("non-existent-user");

      expect(stats.total).toBe(0);
      expect(stats.completed).toBe(0);
      expect(stats.skipped).toBe(0);
      expect(stats.failed).toBe(0);
      expect(stats.inProgress).toBe(0);
    });
  });

  // ===========================================================================
  // Active Sessions
  // ===========================================================================

  describe("getActiveByUserId", () => {
    it("should return only active (started) sessions", async () => {
      const pending = await service.create({ userId: testUserId });
      const started = await service.create({ userId: testUserId });
      const completed = await service.create({ userId: testUserId });

      createdSessionIds.push(pending.id, started.id, completed.id);

      await service.start(started.id);
      await service.start(completed.id);
      await service.complete(completed.id, createTestConfig());

      const active = await service.getActiveByUserId(testUserId);

      // started session should be returned (not pending, not completed)
      expect(active.some(s => s.id === started.id)).toBe(true);
      expect(active.some(s => s.id === completed.id)).toBe(false);
    });
  });
});
