import { describe, it, expect } from "vitest";
import { aiAgentExecutor } from "./agent";
import type { NodeExecutionParams, WorkflowEnv, ExecutionContext } from "../../utils/context";

function createMockEnv(overrides: Partial<WorkflowEnv> = {}): WorkflowEnv {
  return {
    Sandbox: {} as WorkflowEnv["Sandbox"],
    WORKSPACE_BUCKET: {} as R2Bucket,
    AGENTPOD_API_URL: "http://localhost:3001",
    AGENTPOD_API_TOKEN: "test-token",
    ...overrides,
  };
}

function createMockContext(envOverrides: Partial<WorkflowEnv> = {}): ExecutionContext {
  return {
    trigger: {
      type: "manual",
      data: {},
      timestamp: new Date(),
    },
    steps: {},
    env: createMockEnv(envOverrides),
  };
}

function createParams(
  parameters: Record<string, unknown>,
  envOverrides: Partial<WorkflowEnv> = {}
): NodeExecutionParams {
  return {
    nodeId: "test-agent-1",
    nodeName: "Test AI Agent",
    nodeType: "ai-agent-tools",
    parameters,
    context: createMockContext(envOverrides),
  };
}

describe("AI Agent Executor", () => {
  describe("validation", () => {
    it("should require provider", () => {
      const errors = aiAgentExecutor.validate!({
        model: "gpt-4o-mini",
        prompt: "Hello",
      });
      expect(errors).toContain("Provider is required");
    });

    it("should require model", () => {
      const errors = aiAgentExecutor.validate!({
        provider: "openai",
        prompt: "Hello",
      });
      expect(errors).toContain("Model is required");
    });

    it("should require prompt", () => {
      const errors = aiAgentExecutor.validate!({
        provider: "openai",
        model: "gpt-4o-mini",
      });
      expect(errors).toContain("Prompt is required");
    });

    it("should only accept openai provider", () => {
      const errors = aiAgentExecutor.validate!({
        provider: "anthropic",
        model: "claude-3-5-sonnet-20241022",
        prompt: "Hello",
      });
      expect(errors.some((e) => e.includes("only supports OpenAI"))).toBe(true);
    });

    it("should pass validation with valid params", () => {
      const errors = aiAgentExecutor.validate!({
        provider: "openai",
        model: "gpt-4o-mini",
        prompt: "Calculate 2+2",
      });
      expect(errors).toHaveLength(0);
    });
  });

  describe("execution", () => {
    it("should return error if provider is missing", async () => {
      const params = createParams({
        model: "gpt-4o-mini",
        prompt: "Hello",
      });

      const result = await aiAgentExecutor.execute(params);
      expect(result.success).toBe(false);
      expect(result.error).toContain("Provider is required");
    });

    it("should return error if model is missing", async () => {
      const params = createParams({
        provider: "openai",
        prompt: "Hello",
      });

      const result = await aiAgentExecutor.execute(params);
      expect(result.success).toBe(false);
      expect(result.error).toContain("Model is required");
    });

    it("should return error if prompt is missing", async () => {
      const params = createParams({
        provider: "openai",
        model: "gpt-4o-mini",
      });

      const result = await aiAgentExecutor.execute(params);
      expect(result.success).toBe(false);
      expect(result.error).toContain("Prompt is required");
    });

    it("should return error for non-openai provider", async () => {
      const params = createParams({
        provider: "anthropic",
        model: "claude-3-5-sonnet-20241022",
        prompt: "Hello",
      });

      const result = await aiAgentExecutor.execute(params);
      expect(result.success).toBe(false);
      expect(result.error).toContain("only supports OpenAI");
    });

    it("should return error if API key is missing", async () => {
      const params = createParams({
        provider: "openai",
        model: "gpt-4o-mini",
        prompt: "Calculate 2+2",
      });

      const result = await aiAgentExecutor.execute(params);
      expect(result.success).toBe(false);
      expect(result.error).toContain("API key is required");
    });

    it("should return error if no tools are available", async () => {
      const params = createParams(
        {
          provider: "openai",
          model: "gpt-4o-mini",
          prompt: "Calculate 2+2",
          useBuiltinTools: false,
          tools: [],
        },
        { OPENAI_API_KEY: "test-key" }
      );

      const result = await aiAgentExecutor.execute(params);
      expect(result.success).toBe(false);
      expect(result.error).toContain("At least one tool is required");
    });
  });

  describe("metadata", () => {
    it("should have correct type", () => {
      expect(aiAgentExecutor.type).toBe("ai-agent-tools");
    });

    it("should have correct category", () => {
      expect(aiAgentExecutor.category).toBe("ai");
    });
  });
});
