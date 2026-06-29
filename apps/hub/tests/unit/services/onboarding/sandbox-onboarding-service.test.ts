/**
 * Sandbox Onboarding Service Tests
 * 
 * TDD tests for integrating the onboarding agent with sandbox management.
 * This service applies generated configurations to sandboxes.
 */

import { describe, it, expect, beforeEach, mock } from "bun:test";
import type { 
  OnboardingSession, 
  ConfigGenerationInput,
  OnboardingInjectedFiles,
  OnboardingRequirements,
  OnboardingModelRecommendation,
  UpdateOnboardingSession,
} from "@agentpod/types";

// =============================================================================
// Mock Types for Testing
// =============================================================================

interface MockSandbox {
  id: string;
  userId: string;
  name: string;
  status: string;
  repoName: string;
  containerId?: string;
}

interface MockExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

// =============================================================================
// Mock Setup
// =============================================================================

// Mock sandbox manager
const mockExec = mock<(sandboxId: string, command: string[], options?: unknown) => Promise<MockExecResult>>();
const mockGetSandbox = mock<(sandboxId: string) => Promise<MockSandbox | null>>();
const mockStartSandbox = mock<(sandboxId: string) => Promise<void>>();
const mockRestartSandbox = mock<(sandboxId: string) => Promise<void>>();

const mockSandboxManager = {
  exec: mockExec,
  getSandbox: mockGetSandbox,
  startSandbox: mockStartSandbox,
  restartSandbox: mockRestartSandbox,
};

// Mock onboarding agent service
const mockGenerateInjectedFiles = mock<(input: ConfigGenerationInput) => Promise<OnboardingInjectedFiles>>();
const mockGenerateConfig = mock<(input: ConfigGenerationInput) => Promise<unknown>>();

const mockOnboardingAgentService = {
  generateInjectedFiles: mockGenerateInjectedFiles,
  generateConfig: mockGenerateConfig,
};

// Mock onboarding service
const mockGetSession = mock<(id: string) => Promise<OnboardingSession | null>>();
const mockUpdateSession = mock<(id: string, updates: UpdateOnboardingSession) => Promise<OnboardingSession | null>>();

const mockOnboardingService = {
  getById: mockGetSession,
  update: mockUpdateSession,
};

// =============================================================================
// Test Data
// =============================================================================

const TEST_USER_ID = "test-user-123";
const TEST_SANDBOX_ID = "sandbox-abc123";
const TEST_SESSION_ID = "session-xyz789";

const createTestSandbox = (overrides: Partial<MockSandbox> = {}): MockSandbox => ({
  id: TEST_SANDBOX_ID,
  userId: TEST_USER_ID,
  name: "Test Sandbox",
  status: "running",
  repoName: "test-repo",
  containerId: "container-123",
  ...overrides,
});

const createTestRequirements = (): OnboardingRequirements => ({
  projectType: "web_app",
  projectName: "Test Project",
  projectDescription: "A test project",
  primaryLanguage: "typescript",
  frameworks: ["react", "node"],
  buildTools: ["vite"],
  testingFramework: "vitest",
});

const createTestRecommendation = (): OnboardingModelRecommendation => ({
  primaryModelId: "anthropic/claude-sonnet-4-20250514",
  primaryModelName: "Claude Sonnet 4",
  primaryProvider: "anthropic",
  reasoning: "Best for code generation",
  alternativeModelIds: ["openai/gpt-4o"],
});

const createTestSession = (overrides: Partial<OnboardingSession> = {}): OnboardingSession => ({
  id: TEST_SESSION_ID,
  userId: TEST_USER_ID,
  sandboxId: TEST_SANDBOX_ID,
  status: "generating",
  projectType: "web_app",
  projectName: "Test Project",
  projectDescription: "A test project",
  gatheredRequirements: createTestRequirements(),
  generatedConfig: null,
  selectedModel: "anthropic/claude-sonnet-4-20250514",
  selectedSmallModel: null,
  errorMessage: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  completedAt: null,
  ...overrides,
});

const createTestInput = (overrides: Partial<ConfigGenerationInput> = {}): ConfigGenerationInput => ({
  requirements: createTestRequirements(),
  recommendation: createTestRecommendation(),
  userId: TEST_USER_ID,
  sandboxId: TEST_SANDBOX_ID,
  ...overrides,
});

const createTestInjectedFiles = (): OnboardingInjectedFiles => ({
  opencodeJson: JSON.stringify({
    model: {
      default: "anthropic/claude-sonnet-4-20250514",
    },
  }),
  agentsMd: "# AGENTS.md\n\nTest agent instructions",
  agents: [
    {
      path: ".opencode/agent/onboarding.md",
      content: "---\ndescription: Onboarding agent\n---\nContent here",
    },
    {
      path: ".opencode/agent/workspace.md",
      content: "---\ndescription: Workspace agent\n---\nWorkspace content",
    },
  ],
});

// =============================================================================
// Tests
// =============================================================================

describe("SandboxOnboardingService", () => {
  beforeEach(() => {
    // Reset all mocks before each test
    mockExec.mockReset();
    mockGetSandbox.mockReset();
    mockStartSandbox.mockReset();
    mockRestartSandbox.mockReset();
    mockGenerateInjectedFiles.mockReset();
    mockGenerateConfig.mockReset();
    mockGetSession.mockReset();
    mockUpdateSession.mockReset();
  });

  // ===========================================================================
  // applyConfigToSandbox Tests
  // ===========================================================================

  describe("applyConfigToSandbox", () => {
    it("should apply generated config files to a running sandbox", async () => {
      // Setup
      const sandbox = createTestSandbox({ status: "running" });
      const input = createTestInput();
      const injectedFiles = createTestInjectedFiles();

      mockGetSandbox.mockResolvedValue(sandbox);
      mockGenerateInjectedFiles.mockResolvedValue(injectedFiles);
      mockExec.mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });

      // Import the service (will be created)
      const { SandboxOnboardingService } = await import("../../../../src/services/sandbox-onboarding-service.ts");
      const service = new SandboxOnboardingService(
        mockSandboxManager as unknown as Parameters<typeof SandboxOnboardingService>[0],
        mockOnboardingAgentService as unknown as Parameters<typeof SandboxOnboardingService>[1],
        mockOnboardingService as unknown as Parameters<typeof SandboxOnboardingService>[2],
      );

      // Execute
      const result = await service.applyConfigToSandbox(TEST_SANDBOX_ID, input);

      // Verify
      expect(result.success).toBe(true);
      expect(mockGetSandbox).toHaveBeenCalledWith(TEST_SANDBOX_ID);
      expect(mockGenerateInjectedFiles).toHaveBeenCalledWith(input);
      
      // Should have created directory
      expect(mockExec).toHaveBeenCalledWith(
        TEST_SANDBOX_ID,
        ["mkdir", "-p", "/workspace/.opencode/agent"],
        expect.any(Object)
      );
    });

    it("should write opencode.json to workspace root", async () => {
      const sandbox = createTestSandbox({ status: "running" });
      const input = createTestInput();
      const injectedFiles = createTestInjectedFiles();

      mockGetSandbox.mockResolvedValue(sandbox);
      mockGenerateInjectedFiles.mockResolvedValue(injectedFiles);
      mockExec.mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });

      const { SandboxOnboardingService } = await import("../../../../src/services/sandbox-onboarding-service.ts");
      const service = new SandboxOnboardingService(
        mockSandboxManager as unknown as Parameters<typeof SandboxOnboardingService>[0],
        mockOnboardingAgentService as unknown as Parameters<typeof SandboxOnboardingService>[1],
        mockOnboardingService as unknown as Parameters<typeof SandboxOnboardingService>[2],
      );

      await service.applyConfigToSandbox(TEST_SANDBOX_ID, input);

      // Should write opencode.json
      const execCalls = mockExec.mock.calls;
      const opencodeJsonCall = execCalls.find(
        (call) => call[1][0] === "sh" && call[1][2]?.includes("opencode.json")
      );
      expect(opencodeJsonCall).toBeDefined();
    });

    it("should write AGENTS.md to workspace root", async () => {
      const sandbox = createTestSandbox({ status: "running" });
      const input = createTestInput();
      const injectedFiles = createTestInjectedFiles();

      mockGetSandbox.mockResolvedValue(sandbox);
      mockGenerateInjectedFiles.mockResolvedValue(injectedFiles);
      mockExec.mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });

      const { SandboxOnboardingService } = await import("../../../../src/services/sandbox-onboarding-service.ts");
      const service = new SandboxOnboardingService(
        mockSandboxManager as unknown as Parameters<typeof SandboxOnboardingService>[0],
        mockOnboardingAgentService as unknown as Parameters<typeof SandboxOnboardingService>[1],
        mockOnboardingService as unknown as Parameters<typeof SandboxOnboardingService>[2],
      );

      await service.applyConfigToSandbox(TEST_SANDBOX_ID, input);

      // Should write AGENTS.md
      const execCalls = mockExec.mock.calls;
      const agentsMdCall = execCalls.find(
        (call) => call[1][0] === "sh" && call[1][2]?.includes("AGENTS.md")
      );
      expect(agentsMdCall).toBeDefined();
    });

    it("should write all agent files to .opencode/agent directory", async () => {
      const sandbox = createTestSandbox({ status: "running" });
      const input = createTestInput();
      const injectedFiles = createTestInjectedFiles();

      mockGetSandbox.mockResolvedValue(sandbox);
      mockGenerateInjectedFiles.mockResolvedValue(injectedFiles);
      mockExec.mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });

      const { SandboxOnboardingService } = await import("../../../../src/services/sandbox-onboarding-service.ts");
      const service = new SandboxOnboardingService(
        mockSandboxManager as unknown as Parameters<typeof SandboxOnboardingService>[0],
        mockOnboardingAgentService as unknown as Parameters<typeof SandboxOnboardingService>[1],
        mockOnboardingService as unknown as Parameters<typeof SandboxOnboardingService>[2],
      );

      await service.applyConfigToSandbox(TEST_SANDBOX_ID, input);

      // Should write each agent file
      const execCalls = mockExec.mock.calls;
      
      for (const agent of injectedFiles.agents) {
        const agentCall = execCalls.find(
          (call) => call[1][0] === "sh" && call[1][2]?.includes(agent.path)
        );
        expect(agentCall).toBeDefined();
      }
    });

    it("should throw error when sandbox is not found", async () => {
      mockGetSandbox.mockResolvedValue(null);
      const input = createTestInput();

      const { SandboxOnboardingService } = await import("../../../../src/services/sandbox-onboarding-service.ts");
      const service = new SandboxOnboardingService(
        mockSandboxManager as unknown as Parameters<typeof SandboxOnboardingService>[0],
        mockOnboardingAgentService as unknown as Parameters<typeof SandboxOnboardingService>[1],
        mockOnboardingService as unknown as Parameters<typeof SandboxOnboardingService>[2],
      );

      await expect(service.applyConfigToSandbox(TEST_SANDBOX_ID, input))
        .rejects.toThrow("Sandbox not found");
    });

    it("should throw error when sandbox is not running", async () => {
      const sandbox = createTestSandbox({ status: "stopped" });
      mockGetSandbox.mockResolvedValue(sandbox);
      const input = createTestInput();

      const { SandboxOnboardingService } = await import("../../../../src/services/sandbox-onboarding-service.ts");
      const service = new SandboxOnboardingService(
        mockSandboxManager as unknown as Parameters<typeof SandboxOnboardingService>[0],
        mockOnboardingAgentService as unknown as Parameters<typeof SandboxOnboardingService>[1],
        mockOnboardingService as unknown as Parameters<typeof SandboxOnboardingService>[2],
      );

      await expect(service.applyConfigToSandbox(TEST_SANDBOX_ID, input))
        .rejects.toThrow("Sandbox is not running");
    });

    it("should return files written on success", async () => {
      const sandbox = createTestSandbox({ status: "running" });
      const input = createTestInput();
      const injectedFiles = createTestInjectedFiles();

      mockGetSandbox.mockResolvedValue(sandbox);
      mockGenerateInjectedFiles.mockResolvedValue(injectedFiles);
      mockExec.mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });

      const { SandboxOnboardingService } = await import("../../../../src/services/sandbox-onboarding-service.ts");
      const service = new SandboxOnboardingService(
        mockSandboxManager as unknown as Parameters<typeof SandboxOnboardingService>[0],
        mockOnboardingAgentService as unknown as Parameters<typeof SandboxOnboardingService>[1],
        mockOnboardingService as unknown as Parameters<typeof SandboxOnboardingService>[2],
      );

      const result = await service.applyConfigToSandbox(TEST_SANDBOX_ID, input);

      expect(result.success).toBe(true);
      expect(result.filesWritten).toContain("/workspace/opencode.json");
      expect(result.filesWritten).toContain("/workspace/AGENTS.md");
      expect(result.filesWritten).toContain("/workspace/.opencode/agent/onboarding.md");
      expect(result.filesWritten).toContain("/workspace/.opencode/agent/workspace.md");
    });

    it("should handle exec failures gracefully", async () => {
      const sandbox = createTestSandbox({ status: "running" });
      const input = createTestInput();
      const injectedFiles = createTestInjectedFiles();

      mockGetSandbox.mockResolvedValue(sandbox);
      mockGenerateInjectedFiles.mockResolvedValue(injectedFiles);
      mockExec.mockResolvedValue({ exitCode: 1, stdout: "", stderr: "Permission denied" });

      const { SandboxOnboardingService } = await import("../../../../src/services/sandbox-onboarding-service.ts");
      const service = new SandboxOnboardingService(
        mockSandboxManager as unknown as Parameters<typeof SandboxOnboardingService>[0],
        mockOnboardingAgentService as unknown as Parameters<typeof SandboxOnboardingService>[1],
        mockOnboardingService as unknown as Parameters<typeof SandboxOnboardingService>[2],
      );

      const result = await service.applyConfigToSandbox(TEST_SANDBOX_ID, input);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  // ===========================================================================
  // applyOnboardingSession Tests
  // ===========================================================================

  describe("applyOnboardingSession", () => {
    it("should apply config from an onboarding session", async () => {
      const sandbox = createTestSandbox({ status: "running" });
      const session = createTestSession({
        status: "generating",
        gatheredRequirements: {
          projectType: "web_app",
          projectName: "My App",
          projectDescription: "A test app",
          primaryLanguage: "typescript",
        },
        selectedModel: "anthropic/claude-sonnet-4-20250514",
      });
      const injectedFiles = createTestInjectedFiles();

      mockGetSandbox.mockResolvedValue(sandbox);
      mockGetSession.mockResolvedValue(session);
      mockGenerateInjectedFiles.mockResolvedValue(injectedFiles);
      mockExec.mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });
      mockUpdateSession.mockResolvedValue({ ...session, status: "applying" });

      const { SandboxOnboardingService } = await import("../../../../src/services/sandbox-onboarding-service.ts");
      const service = new SandboxOnboardingService(
        mockSandboxManager as unknown as Parameters<typeof SandboxOnboardingService>[0],
        mockOnboardingAgentService as unknown as Parameters<typeof SandboxOnboardingService>[1],
        mockOnboardingService as unknown as Parameters<typeof SandboxOnboardingService>[2],
      );

      const result = await service.applyOnboardingSession(TEST_SESSION_ID);

      expect(result.success).toBe(true);
      expect(mockGetSession).toHaveBeenCalledWith(TEST_SESSION_ID);
    });

    it("should update session status to applying", async () => {
      const sandbox = createTestSandbox({ status: "running" });
      const session = createTestSession();
      const injectedFiles = createTestInjectedFiles();

      mockGetSandbox.mockResolvedValue(sandbox);
      mockGetSession.mockResolvedValue(session);
      mockGenerateInjectedFiles.mockResolvedValue(injectedFiles);
      mockExec.mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });
      mockUpdateSession.mockResolvedValue({ ...session, status: "applying" });

      const { SandboxOnboardingService } = await import("../../../../src/services/sandbox-onboarding-service.ts");
      const service = new SandboxOnboardingService(
        mockSandboxManager as unknown as Parameters<typeof SandboxOnboardingService>[0],
        mockOnboardingAgentService as unknown as Parameters<typeof SandboxOnboardingService>[1],
        mockOnboardingService as unknown as Parameters<typeof SandboxOnboardingService>[2],
      );

      await service.applyOnboardingSession(TEST_SESSION_ID);

      expect(mockUpdateSession).toHaveBeenCalledWith(
        TEST_SESSION_ID,
        expect.objectContaining({ status: "applying" })
      );
    });

    it("should throw error when session is not found", async () => {
      mockGetSession.mockResolvedValue(null);

      const { SandboxOnboardingService } = await import("../../../../src/services/sandbox-onboarding-service.ts");
      const service = new SandboxOnboardingService(
        mockSandboxManager as unknown as Parameters<typeof SandboxOnboardingService>[0],
        mockOnboardingAgentService as unknown as Parameters<typeof SandboxOnboardingService>[1],
        mockOnboardingService as unknown as Parameters<typeof SandboxOnboardingService>[2],
      );

      await expect(service.applyOnboardingSession(TEST_SESSION_ID))
        .rejects.toThrow("Onboarding session not found");
    });

    it("should throw error when session has no sandbox", async () => {
      const session = createTestSession({ sandboxId: undefined });
      mockGetSession.mockResolvedValue(session);

      const { SandboxOnboardingService } = await import("../../../../src/services/sandbox-onboarding-service.ts");
      const service = new SandboxOnboardingService(
        mockSandboxManager as unknown as Parameters<typeof SandboxOnboardingService>[0],
        mockOnboardingAgentService as unknown as Parameters<typeof SandboxOnboardingService>[1],
        mockOnboardingService as unknown as Parameters<typeof SandboxOnboardingService>[2],
      );

      await expect(service.applyOnboardingSession(TEST_SESSION_ID))
        .rejects.toThrow("Session has no associated sandbox");
    });

    it("should update session status to completed on success", async () => {
      const sandbox = createTestSandbox({ status: "running" });
      const session = createTestSession();
      const injectedFiles = createTestInjectedFiles();

      mockGetSandbox.mockResolvedValue(sandbox);
      mockGetSession.mockResolvedValue(session);
      mockGenerateInjectedFiles.mockResolvedValue(injectedFiles);
      mockExec.mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });
      mockUpdateSession.mockImplementation(async (id, updates) => ({ 
        ...session, 
        ...updates,
      }));

      const { SandboxOnboardingService } = await import("../../../../src/services/sandbox-onboarding-service.ts");
      const service = new SandboxOnboardingService(
        mockSandboxManager as unknown as Parameters<typeof SandboxOnboardingService>[0],
        mockOnboardingAgentService as unknown as Parameters<typeof SandboxOnboardingService>[1],
        mockOnboardingService as unknown as Parameters<typeof SandboxOnboardingService>[2],
      );

      await service.applyOnboardingSession(TEST_SESSION_ID);

      // Should be called twice: once for "applying", once for "completed"
      const updateCalls = mockUpdateSession.mock.calls;
      const completedCall = updateCalls.find(
        (call) => call[1].status === "completed"
      );
      expect(completedCall).toBeDefined();
    });

    it("should update session status to failed on error", async () => {
      const sandbox = createTestSandbox({ status: "running" });
      const session = createTestSession();

      mockGetSandbox.mockResolvedValue(sandbox);
      mockGetSession.mockResolvedValue(session);
      mockGenerateInjectedFiles.mockRejectedValue(new Error("Generation failed"));
      mockUpdateSession.mockImplementation(async (id, updates) => ({ 
        ...session, 
        ...updates,
      }));

      const { SandboxOnboardingService } = await import("../../../../src/services/sandbox-onboarding-service.ts");
      const service = new SandboxOnboardingService(
        mockSandboxManager as unknown as Parameters<typeof SandboxOnboardingService>[0],
        mockOnboardingAgentService as unknown as Parameters<typeof SandboxOnboardingService>[1],
        mockOnboardingService as unknown as Parameters<typeof SandboxOnboardingService>[2],
      );

      const result = await service.applyOnboardingSession(TEST_SESSION_ID);

      expect(result.success).toBe(false);
      const updateCalls = mockUpdateSession.mock.calls;
      const failedCall = updateCalls.find(
        (call) => call[1].status === "failed"
      );
      expect(failedCall).toBeDefined();
    });
  });

  // ===========================================================================
  // signalOpenCodeReload Tests
  // ===========================================================================

  describe("signalOpenCodeReload", () => {
    it("should send SIGHUP to OpenCode process", async () => {
      const sandbox = createTestSandbox({ status: "running" });
      mockGetSandbox.mockResolvedValue(sandbox);
      mockExec.mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });

      const { SandboxOnboardingService } = await import("../../../../src/services/sandbox-onboarding-service.ts");
      const service = new SandboxOnboardingService(
        mockSandboxManager as unknown as Parameters<typeof SandboxOnboardingService>[0],
        mockOnboardingAgentService as unknown as Parameters<typeof SandboxOnboardingService>[1],
        mockOnboardingService as unknown as Parameters<typeof SandboxOnboardingService>[2],
      );

      await service.signalOpenCodeReload(TEST_SANDBOX_ID);

      expect(mockExec).toHaveBeenCalledWith(
        TEST_SANDBOX_ID,
        ["pkill", "-HUP", "opencode"],
        expect.any(Object)
      );
    });

    it("should not throw on signal failure (process might not be running)", async () => {
      const sandbox = createTestSandbox({ status: "running" });
      mockGetSandbox.mockResolvedValue(sandbox);
      mockExec.mockResolvedValue({ exitCode: 1, stdout: "", stderr: "no process found" });

      const { SandboxOnboardingService } = await import("../../../../src/services/sandbox-onboarding-service.ts");
      const service = new SandboxOnboardingService(
        mockSandboxManager as unknown as Parameters<typeof SandboxOnboardingService>[0],
        mockOnboardingAgentService as unknown as Parameters<typeof SandboxOnboardingService>[1],
        mockOnboardingService as unknown as Parameters<typeof SandboxOnboardingService>[2],
      );

      // Should not throw
      await expect(service.signalOpenCodeReload(TEST_SANDBOX_ID)).resolves.toBeUndefined();
    });
  });

  // ===========================================================================
  // getAppliedConfig Tests
  // ===========================================================================

  describe("getAppliedConfig", () => {
    it("should read opencode.json from sandbox", async () => {
      const sandbox = createTestSandbox({ status: "running" });
      const configContent = JSON.stringify({ model: { default: "test/model" } });
      
      mockGetSandbox.mockResolvedValue(sandbox);
      mockExec.mockResolvedValue({ exitCode: 0, stdout: configContent, stderr: "" });

      const { SandboxOnboardingService } = await import("../../../../src/services/sandbox-onboarding-service.ts");
      const service = new SandboxOnboardingService(
        mockSandboxManager as unknown as Parameters<typeof SandboxOnboardingService>[0],
        mockOnboardingAgentService as unknown as Parameters<typeof SandboxOnboardingService>[1],
        mockOnboardingService as unknown as Parameters<typeof SandboxOnboardingService>[2],
      );

      const result = await service.getAppliedConfig(TEST_SANDBOX_ID);

      expect(result).toBeDefined();
      expect(result?.opencodeJson).toBeDefined();
      expect(mockExec).toHaveBeenCalledWith(
        TEST_SANDBOX_ID,
        ["cat", "/workspace/opencode.json"],
        expect.any(Object)
      );
    });

    it("should read AGENTS.md from sandbox", async () => {
      const sandbox = createTestSandbox({ status: "running" });
      const agentsContent = "# AGENTS.md\n\nContent here";
      
      mockGetSandbox.mockResolvedValue(sandbox);
      mockExec.mockImplementation(async (id, cmd) => {
        if (cmd.includes("/workspace/AGENTS.md")) {
          return { exitCode: 0, stdout: agentsContent, stderr: "" };
        }
        return { exitCode: 0, stdout: "{}", stderr: "" };
      });

      const { SandboxOnboardingService } = await import("../../../../src/services/sandbox-onboarding-service.ts");
      const service = new SandboxOnboardingService(
        mockSandboxManager as unknown as Parameters<typeof SandboxOnboardingService>[0],
        mockOnboardingAgentService as unknown as Parameters<typeof SandboxOnboardingService>[1],
        mockOnboardingService as unknown as Parameters<typeof SandboxOnboardingService>[2],
      );

      const result = await service.getAppliedConfig(TEST_SANDBOX_ID);

      expect(result?.agentsMd).toBe(agentsContent);
    });

    it("should return null when sandbox is not found", async () => {
      mockGetSandbox.mockResolvedValue(null);

      const { SandboxOnboardingService } = await import("../../../../src/services/sandbox-onboarding-service.ts");
      const service = new SandboxOnboardingService(
        mockSandboxManager as unknown as Parameters<typeof SandboxOnboardingService>[0],
        mockOnboardingAgentService as unknown as Parameters<typeof SandboxOnboardingService>[1],
        mockOnboardingService as unknown as Parameters<typeof SandboxOnboardingService>[2],
      );

      const result = await service.getAppliedConfig(TEST_SANDBOX_ID);

      expect(result).toBeNull();
    });

    it("should return null when files don't exist", async () => {
      const sandbox = createTestSandbox({ status: "running" });
      
      mockGetSandbox.mockResolvedValue(sandbox);
      mockExec.mockResolvedValue({ exitCode: 1, stdout: "", stderr: "cat: file not found" });

      const { SandboxOnboardingService } = await import("../../../../src/services/sandbox-onboarding-service.ts");
      const service = new SandboxOnboardingService(
        mockSandboxManager as unknown as Parameters<typeof SandboxOnboardingService>[0],
        mockOnboardingAgentService as unknown as Parameters<typeof SandboxOnboardingService>[1],
        mockOnboardingService as unknown as Parameters<typeof SandboxOnboardingService>[2],
      );

      const result = await service.getAppliedConfig(TEST_SANDBOX_ID);

      expect(result).toBeNull();
    });
  });

  // ===========================================================================
  // validateSandboxForOnboarding Tests
  // ===========================================================================

  describe("validateSandboxForOnboarding", () => {
    it("should return valid for running sandbox with container", async () => {
      const sandbox = createTestSandbox({ 
        status: "running",
        containerId: "container-123",
      });
      mockGetSandbox.mockResolvedValue(sandbox);

      const { SandboxOnboardingService } = await import("../../../../src/services/sandbox-onboarding-service.ts");
      const service = new SandboxOnboardingService(
        mockSandboxManager as unknown as Parameters<typeof SandboxOnboardingService>[0],
        mockOnboardingAgentService as unknown as Parameters<typeof SandboxOnboardingService>[1],
        mockOnboardingService as unknown as Parameters<typeof SandboxOnboardingService>[2],
      );

      const result = await service.validateSandboxForOnboarding(TEST_SANDBOX_ID);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should return invalid for non-existent sandbox", async () => {
      mockGetSandbox.mockResolvedValue(null);

      const { SandboxOnboardingService } = await import("../../../../src/services/sandbox-onboarding-service.ts");
      const service = new SandboxOnboardingService(
        mockSandboxManager as unknown as Parameters<typeof SandboxOnboardingService>[0],
        mockOnboardingAgentService as unknown as Parameters<typeof SandboxOnboardingService>[1],
        mockOnboardingService as unknown as Parameters<typeof SandboxOnboardingService>[2],
      );

      const result = await service.validateSandboxForOnboarding(TEST_SANDBOX_ID);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Sandbox not found");
    });

    it("should return invalid for stopped sandbox", async () => {
      const sandbox = createTestSandbox({ status: "stopped" });
      mockGetSandbox.mockResolvedValue(sandbox);

      const { SandboxOnboardingService } = await import("../../../../src/services/sandbox-onboarding-service.ts");
      const service = new SandboxOnboardingService(
        mockSandboxManager as unknown as Parameters<typeof SandboxOnboardingService>[0],
        mockOnboardingAgentService as unknown as Parameters<typeof SandboxOnboardingService>[1],
        mockOnboardingService as unknown as Parameters<typeof SandboxOnboardingService>[2],
      );

      const result = await service.validateSandboxForOnboarding(TEST_SANDBOX_ID);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Sandbox is not running");
    });

    it("should return invalid for sandbox without container", async () => {
      const sandbox = createTestSandbox({ 
        status: "running",
        containerId: undefined,
      });
      mockGetSandbox.mockResolvedValue(sandbox);

      const { SandboxOnboardingService } = await import("../../../../src/services/sandbox-onboarding-service.ts");
      const service = new SandboxOnboardingService(
        mockSandboxManager as unknown as Parameters<typeof SandboxOnboardingService>[0],
        mockOnboardingAgentService as unknown as Parameters<typeof SandboxOnboardingService>[1],
        mockOnboardingService as unknown as Parameters<typeof SandboxOnboardingService>[2],
      );

      const result = await service.validateSandboxForOnboarding(TEST_SANDBOX_ID);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Sandbox has no container");
    });
  });

  // ===========================================================================
  // linkSessionToSandbox Tests
  // ===========================================================================

  describe("linkSessionToSandbox", () => {
    it("should link an onboarding session to a sandbox", async () => {
      const sandbox = createTestSandbox();
      const session = createTestSession({ sandboxId: undefined });

      mockGetSandbox.mockResolvedValue(sandbox);
      mockGetSession.mockResolvedValue(session);
      mockUpdateSession.mockResolvedValue({ ...session, sandboxId: TEST_SANDBOX_ID });

      const { SandboxOnboardingService } = await import("../../../../src/services/sandbox-onboarding-service.ts");
      const service = new SandboxOnboardingService(
        mockSandboxManager as unknown as Parameters<typeof SandboxOnboardingService>[0],
        mockOnboardingAgentService as unknown as Parameters<typeof SandboxOnboardingService>[1],
        mockOnboardingService as unknown as Parameters<typeof SandboxOnboardingService>[2],
      );

      await service.linkSessionToSandbox(TEST_SESSION_ID, TEST_SANDBOX_ID);

      expect(mockUpdateSession).toHaveBeenCalledWith(
        TEST_SESSION_ID,
        expect.objectContaining({ sandboxId: TEST_SANDBOX_ID })
      );
    });

    it("should throw error when sandbox doesn't exist", async () => {
      const session = createTestSession();
      mockGetSandbox.mockResolvedValue(null);
      mockGetSession.mockResolvedValue(session);

      const { SandboxOnboardingService } = await import("../../../../src/services/sandbox-onboarding-service.ts");
      const service = new SandboxOnboardingService(
        mockSandboxManager as unknown as Parameters<typeof SandboxOnboardingService>[0],
        mockOnboardingAgentService as unknown as Parameters<typeof SandboxOnboardingService>[1],
        mockOnboardingService as unknown as Parameters<typeof SandboxOnboardingService>[2],
      );

      await expect(service.linkSessionToSandbox(TEST_SESSION_ID, TEST_SANDBOX_ID))
        .rejects.toThrow("Sandbox not found");
    });

    it("should throw error when session doesn't exist", async () => {
      const sandbox = createTestSandbox();
      mockGetSandbox.mockResolvedValue(sandbox);
      mockGetSession.mockResolvedValue(null);

      const { SandboxOnboardingService } = await import("../../../../src/services/sandbox-onboarding-service.ts");
      const service = new SandboxOnboardingService(
        mockSandboxManager as unknown as Parameters<typeof SandboxOnboardingService>[0],
        mockOnboardingAgentService as unknown as Parameters<typeof SandboxOnboardingService>[1],
        mockOnboardingService as unknown as Parameters<typeof SandboxOnboardingService>[2],
      );

      await expect(service.linkSessionToSandbox(TEST_SESSION_ID, TEST_SANDBOX_ID))
        .rejects.toThrow("Onboarding session not found");
    });

    it("should throw error when user IDs don't match", async () => {
      const sandbox = createTestSandbox({ userId: "different-user" });
      const session = createTestSession({ userId: TEST_USER_ID });

      mockGetSandbox.mockResolvedValue(sandbox);
      mockGetSession.mockResolvedValue(session);

      const { SandboxOnboardingService } = await import("../../../../src/services/sandbox-onboarding-service.ts");
      const service = new SandboxOnboardingService(
        mockSandboxManager as unknown as Parameters<typeof SandboxOnboardingService>[0],
        mockOnboardingAgentService as unknown as Parameters<typeof SandboxOnboardingService>[1],
        mockOnboardingService as unknown as Parameters<typeof SandboxOnboardingService>[2],
      );

      await expect(service.linkSessionToSandbox(TEST_SESSION_ID, TEST_SANDBOX_ID))
        .rejects.toThrow("Sandbox does not belong to session user");
    });
  });
});
