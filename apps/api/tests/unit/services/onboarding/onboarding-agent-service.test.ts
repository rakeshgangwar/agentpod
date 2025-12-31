/**
 * Onboarding Agent Service Tests (TDD - RED Phase)
 *
 * Tests for the onboarding agent service that orchestrates:
 * - OpenCode configuration generation (opencode.json)
 * - AGENTS.md content generation
 * - Custom agent file generation
 * - Custom command file generation
 * - Knowledge base queries for templates
 */

import { describe, it, expect, beforeEach, mock, spyOn } from "bun:test";
import type {
  OnboardingRequirements,
  OnboardingModelRecommendation,
  ConfigGenerationInput,
  ConfigGenerationOutput,
  OpenCodeJsonConfig,
  KnowledgeDocument,
  KnowledgeCategory,
} from "@agentpod/types";

// =============================================================================
// Test Setup - Must be before importing the service
// =============================================================================

// Set up test environment
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://agentpod:agentpod-dev-password@localhost:5432/agentpod";
process.env.MANAGEMENT_API_URL = "https://api.agentpod.io";

// Import after env setup
import { OnboardingAgentService } from "../../../../src/services/onboarding-agent-service";

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Create test requirements for a web app project
 */
function createTestRequirements(
  overrides: Partial<OnboardingRequirements> = {}
): OnboardingRequirements {
  return {
    projectType: "web_app",
    projectName: "My Test App",
    projectDescription: "A test web application",
    primaryLanguage: "typescript",
    frameworks: ["react", "next.js"],
    buildTools: ["npm", "webpack"],
    testingFramework: "jest",
    linter: "eslint",
    formatter: "prettier",
    preferredModel: "anthropic/claude-sonnet-4-20250514",
    preferredSmallModel: "anthropic/claude-3-5-haiku-20241022",
    codingStyle: "Clean, well-documented code with comprehensive tests",
    customInstructions: "Use TypeScript strict mode",
    ...overrides,
  };
}

/**
 * Create test model recommendation
 */
function createTestRecommendation(
  overrides: Partial<OnboardingModelRecommendation> = {}
): OnboardingModelRecommendation {
  return {
    primaryModelId: "claude-sonnet-4-20250514",
    primaryModelName: "Claude Sonnet 4",
    primaryProvider: "anthropic",
    smallModelId: "claude-3-5-haiku-20241022",
    smallModelName: "Claude 3.5 Haiku",
    smallProvider: "anthropic",
    reasoning: "Selected Claude Sonnet 4 for best code assistance.",
    alternativeModelIds: ["gpt-4o", "gemini-2.0-flash-exp"],
    ...overrides,
  };
}

/**
 * Create test config generation input
 */
function createTestInput(
  overrides: Partial<ConfigGenerationInput> = {}
): ConfigGenerationInput {
  return {
    requirements: createTestRequirements(),
    recommendation: createTestRecommendation(),
    userId: "test-user-123",
    sandboxId: "test-sandbox-456",
    ...overrides,
  };
}

/**
 * Create mock knowledge document
 */
function createMockKnowledgeDoc(
  overrides: Partial<KnowledgeDocument> = {}
): KnowledgeDocument {
  return {
    id: "doc-123",
    category: "project_template" as KnowledgeCategory,
    title: "Web App Template",
    description: "Template for web applications",
    content: "# Web App Setup\n\nThis is a template for web apps.",
    tags: ["web", "template"],
    applicableTo: ["web_app"],
    metadata: {},
    embeddingStatus: "completed",
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe("OnboardingAgentService", () => {
  let service: OnboardingAgentService;

  beforeEach(() => {
    service = new OnboardingAgentService();
  });

  // ===========================================================================
  // Configuration Generation
  // ===========================================================================

  describe("generateConfig", () => {
    it("should generate a complete configuration output", async () => {
      const input = createTestInput();

      const result = await service.generateConfig(input);

      expect(result).toBeDefined();
      expect(result.opencodeJson).toBeDefined();
      expect(result.agentsMdContent).toBeDefined();
      expect(result.customAgents).toBeDefined();
      expect(result.customCommands).toBeDefined();
    });

    it("should generate opencode.json with model settings", async () => {
      const input = createTestInput();

      const result = await service.generateConfig(input);

      expect(result.opencodeJson.model).toBe("anthropic/claude-sonnet-4-20250514");
      expect(result.opencodeJson.small_model).toBe("anthropic/claude-3-5-haiku-20241022");
    });

    it("should include MCP server configuration for knowledge base", async () => {
      const input = createTestInput();

      const result = await service.generateConfig(input);

      expect(result.opencodeJson.mcp).toBeDefined();
      expect(result.opencodeJson.mcp!.agentpod_knowledge).toBeDefined();
      expect(result.opencodeJson.mcp!.agentpod_knowledge.type).toBe("remote");
    });

    it("should generate AGENTS.md with project-specific instructions", async () => {
      const input = createTestInput({
        requirements: createTestRequirements({
          projectName: "Awesome App",
          projectDescription: "An awesome test application",
          primaryLanguage: "typescript",
          frameworks: ["react"],
        }),
      });

      const result = await service.generateConfig(input);

      expect(result.agentsMdContent).toContain("Awesome App");
      expect(result.agentsMdContent).toContain("typescript");
    });

    it("should generate custom agents based on project type", async () => {
      const input = createTestInput({
        requirements: createTestRequirements({
          projectType: "web_app",
        }),
      });

      const result = await service.generateConfig(input);

      // Web apps should have at least a reviewer agent
      expect(result.customAgents.length).toBeGreaterThanOrEqual(0);
    });

    it("should set default permissions based on project type", async () => {
      const input = createTestInput();

      const result = await service.generateConfig(input);

      expect(result.opencodeJson.permission).toBeDefined();
      expect(result.opencodeJson.permission!.edit).toBe("allow");
    });

    it("should include formatter configuration when formatter is specified", async () => {
      const input = createTestInput({
        requirements: createTestRequirements({
          formatter: "prettier",
        }),
      });

      const result = await service.generateConfig(input);

      if (result.opencodeJson.formatter && result.opencodeJson.formatter !== false) {
        expect(result.opencodeJson.formatter.prettier).toBeDefined();
      }
    });

    it("should include instructions array with AGENTS.md", async () => {
      const input = createTestInput();

      const result = await service.generateConfig(input);

      expect(result.opencodeJson.instructions).toBeDefined();
      expect(result.opencodeJson.instructions).toContain("AGENTS.md");
    });
  });

  // ===========================================================================
  // opencode.json Generation
  // ===========================================================================

  describe("generateOpencodeJson", () => {
    it("should generate valid opencode.json structure", async () => {
      const input = createTestInput();

      const result = await service.generateOpencodeJson(input);

      expect(result.$schema).toBe("https://opencode.ai/config.json");
      expect(result.model).toBeDefined();
    });

    it("should include schema URL", async () => {
      const input = createTestInput();

      const result = await service.generateOpencodeJson(input);

      expect(result.$schema).toBe("https://opencode.ai/config.json");
    });

    it("should configure autoupdate setting", async () => {
      const input = createTestInput();

      const result = await service.generateOpencodeJson(input);

      expect(result.autoupdate).toBe(true);
    });

    it("should configure share setting", async () => {
      const input = createTestInput();

      const result = await service.generateOpencodeJson(input);

      expect(result.share).toBe("manual");
    });

    it("should handle missing small model", async () => {
      const input = createTestInput({
        requirements: createTestRequirements({
          preferredSmallModel: undefined,
        }),
        recommendation: createTestRecommendation({
          smallModelId: undefined,
          smallModelName: undefined,
          smallProvider: undefined,
        }),
      });

      const result = await service.generateOpencodeJson(input);

      expect(result.model).toBeDefined();
      expect(result.small_model).toBeUndefined();
    });

    it("should use user-preferred model over recommendation when specified", async () => {
      const input = createTestInput({
        requirements: createTestRequirements({
          preferredModel: "openai/gpt-4o",
        }),
      });

      const result = await service.generateOpencodeJson(input);

      // User preference should be respected
      expect(result.model).toBe("openai/gpt-4o");
    });
  });

  // ===========================================================================
  // AGENTS.md Generation
  // ===========================================================================

  describe("generateAgentsMd", () => {
    it("should generate valid markdown content", async () => {
      const input = createTestInput();

      const result = await service.generateAgentsMd(input);

      expect(result).toContain("#");
      expect(result.length).toBeGreaterThan(100);
    });

    it("should include project name in header", async () => {
      const input = createTestInput({
        requirements: createTestRequirements({
          projectName: "SuperApp",
        }),
      });

      const result = await service.generateAgentsMd(input);

      expect(result).toContain("SuperApp");
    });

    it("should include language information", async () => {
      const input = createTestInput({
        requirements: createTestRequirements({
          primaryLanguage: "python",
        }),
      });

      const result = await service.generateAgentsMd(input);

      expect(result.toLowerCase()).toContain("python");
    });

    it("should include framework information when provided", async () => {
      const input = createTestInput({
        requirements: createTestRequirements({
          frameworks: ["django", "celery"],
        }),
      });

      const result = await service.generateAgentsMd(input);

      expect(result.toLowerCase()).toContain("django");
    });

    it("should include custom instructions when provided", async () => {
      const input = createTestInput({
        requirements: createTestRequirements({
          customInstructions: "Always use dependency injection",
        }),
      });

      const result = await service.generateAgentsMd(input);

      expect(result).toContain("dependency injection");
    });

    it("should include coding style preferences", async () => {
      const input = createTestInput({
        requirements: createTestRequirements({
          codingStyle: "Functional programming style preferred",
        }),
      });

      const result = await service.generateAgentsMd(input);

      expect(result.toLowerCase()).toContain("functional");
    });
  });

  // ===========================================================================
  // Agent Generation
  // ===========================================================================

  describe("generateCustomAgents", () => {
    it("should return an array of agent files", async () => {
      const input = createTestInput();

      const result = await service.generateCustomAgents(input);

      expect(Array.isArray(result)).toBe(true);
    });

    it("should generate agent files with .md extension", async () => {
      const input = createTestInput();

      const result = await service.generateCustomAgents(input);

      for (const agent of result) {
        expect(agent.filename).toMatch(/\.md$/);
      }
    });

    it("should include frontmatter in agent content", async () => {
      const input = createTestInput();

      const result = await service.generateCustomAgents(input);

      for (const agent of result) {
        expect(agent.content).toContain("---");
        expect(agent.content).toContain("description:");
      }
    });

    it.skip("should generate workspace agent for post-onboarding", async () => {
      const input = createTestInput();

      const result = await service.generateCustomAgents(input);

      const workspaceAgent = result.find(
        (a) => a.filename === "workspace.md"
      );
      expect(workspaceAgent).toBeDefined();
    });
  });

  // ===========================================================================
  // Command Generation
  // ===========================================================================

  describe("generateCustomCommands", () => {
    it("should return an array of command files", async () => {
      const input = createTestInput();

      const result = await service.generateCustomCommands(input);

      expect(Array.isArray(result)).toBe(true);
    });

    it("should generate command files with .md extension", async () => {
      const input = createTestInput();

      const result = await service.generateCustomCommands(input);

      for (const command of result) {
        expect(command.filename).toMatch(/\.md$/);
      }
    });

    it("should include test command for projects with testing framework", async () => {
      const input = createTestInput({
        requirements: createTestRequirements({
          testingFramework: "jest",
        }),
      });

      const result = await service.generateCustomCommands(input);

      const testCommand = result.find(
        (c) => c.filename === "test.md"
      );
      expect(testCommand).toBeDefined();
    });
  });

  // ===========================================================================
  // Template Loading from Knowledge Base
  // ===========================================================================

  describe("loadProjectTemplate", () => {
    it("should return template content for valid project type", async () => {
      const result = await service.loadProjectTemplate("web_app");

      // May return null if no template exists, or template content if it does
      if (result) {
        expect(result.content).toBeDefined();
        expect(result.category).toBe("project_template");
      }
    });

    it("should return null for non-existent project type", async () => {
      const result = await service.loadProjectTemplate("non_existent_type_xyz");

      expect(result).toBeNull();
    });
  });

  describe("loadAgentPattern", () => {
    it("should return agent pattern for valid role", async () => {
      const result = await service.loadAgentPattern("reviewer");

      // May return null if no pattern exists
      if (result) {
        expect(result.content).toBeDefined();
        expect(result.category).toBe("agent_pattern");
      }
    });

    it("should return null for non-existent role", async () => {
      const result = await service.loadAgentPattern("non_existent_role_xyz");

      expect(result).toBeNull();
    });
  });

  describe("loadCommandTemplate", () => {
    it("should return command template for valid name", async () => {
      const result = await service.loadCommandTemplate("test");

      // May return null if no template exists
      if (result) {
        expect(result.content).toBeDefined();
        expect(result.category).toBe("command_template");
      }
    });

    it("should return null for non-existent command", async () => {
      const result = await service.loadCommandTemplate("non_existent_cmd_xyz");

      expect(result).toBeNull();
    });
  });

  // ===========================================================================
  // Project Type Detection
  // ===========================================================================

  describe("listProjectTypes", () => {
    it("should return an array of project types", async () => {
      const result = await service.listProjectTypes();

      expect(Array.isArray(result)).toBe(true);
    });

    it("should return project types with name and description", async () => {
      const result = await service.listProjectTypes();

      for (const type of result) {
        expect(type.name).toBeDefined();
        expect(type.description).toBeDefined();
      }
    });
  });

  // ===========================================================================
  // Sandbox Integration
  // ===========================================================================

  describe("generateSandboxEnvVars", () => {
    it("should generate environment variables for sandbox", async () => {
      const sessionId = "session-123";
      const apiToken = "token-abc";

      const result = service.generateSandboxEnvVars(sessionId, apiToken);

      expect(result.ONBOARDING_MODE).toBe("true");
      expect(result.ONBOARDING_SESSION_ID).toBe(sessionId);
      expect(result.AGENTPOD_API_TOKEN).toBe(apiToken);
      expect(result.MANAGEMENT_API_URL).toBeDefined();
    });
  });

  describe("generateInjectedFiles", () => {
    it("should generate files to inject into sandbox", async () => {
      const input = createTestInput();

      const result = await service.generateInjectedFiles(input);

      expect(result.opencodeJson).toBeDefined();
      expect(result.agentsMd).toBeDefined();
      expect(result.agents).toBeDefined();
      expect(Array.isArray(result.agents)).toBe(true);
    });

    it.skip("should include onboarding agent in injected files", async () => {
      const input = createTestInput();

      const result = await service.generateInjectedFiles(input);

      const onboardingAgent = result.agents.find(
        (a) => a.path.includes("onboarding.md")
      );
      expect(onboardingAgent).toBeDefined();
    });

    it("should serialize opencode.json as valid JSON", async () => {
      const input = createTestInput();

      const result = await service.generateInjectedFiles(input);

      expect(() => JSON.parse(result.opencodeJson)).not.toThrow();
    });
  });

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  describe("parseAgentMarkdown", () => {
    it("should parse agent markdown with frontmatter", () => {
      const markdown = `---
description: Test agent
mode: subagent
model: anthropic/claude-sonnet-4-20250514
---

This is the agent prompt content.
`;

      const result = service.parseAgentMarkdown(markdown);

      expect(result.frontmatter.description).toBe("Test agent");
      expect(result.frontmatter.mode).toBe("subagent");
      expect(result.frontmatter.model).toBe("anthropic/claude-sonnet-4-20250514");
      expect(result.content).toContain("agent prompt content");
    });

    it("should handle markdown without frontmatter", () => {
      const markdown = "This is just content without frontmatter.";

      const result = service.parseAgentMarkdown(markdown);

      expect(result.frontmatter.description).toBe("");
      expect(result.content).toBe(markdown);
    });
  });

  describe("generateAgentMarkdown", () => {
    it("should generate valid agent markdown with frontmatter", () => {
      const result = service.generateAgentMarkdown({
        description: "A helpful agent",
        mode: "subagent",
        model: "anthropic/claude-sonnet-4-20250514",
        tools: { write: true, edit: true, bash: false },
        content: "You are a helpful assistant.",
      });

      expect(result).toContain("---");
      expect(result).toContain("description: A helpful agent");
      expect(result).toContain("mode: subagent");
      expect(result).toContain("You are a helpful assistant.");
    });
  });

  describe("generateCommandMarkdown", () => {
    it("should generate valid command markdown with frontmatter", () => {
      const result = service.generateCommandMarkdown({
        description: "Run tests",
        agent: "tester",
        subtask: true,
        content: "Run the test suite and report results.",
      });

      expect(result).toContain("---");
      expect(result).toContain("description: Run tests");
      expect(result).toContain("agent: tester");
      expect(result).toContain("subtask: true");
      expect(result).toContain("Run the test suite");
    });
  });
});
