import { describe, it, expect } from "vitest";
import { aiChatExecutor } from "./chat";
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
    nodeId: "test-node-1",
    nodeName: "Test AI Chat",
    nodeType: "ai-chat",
    parameters,
    context: createMockContext(envOverrides),
  };
}

describe("AI Chat Executor", () => {
  describe("validation", () => {
    it("should require provider", () => {
      const errors = aiChatExecutor.validate!({
        model: "gpt-4o-mini",
        prompt: "Hello",
      });
      expect(errors).toContain("Provider is required");
    });

    it("should require model", () => {
      const errors = aiChatExecutor.validate!({
        provider: "openai",
        prompt: "Hello",
      });
      expect(errors).toContain("Model is required");
    });

    it("should require prompt or messages", () => {
      const errors = aiChatExecutor.validate!({
        provider: "openai",
        model: "gpt-4o-mini",
      });
      expect(errors).toContain("Prompt or messages is required");
    });

    it("should validate provider name", () => {
      const errors = aiChatExecutor.validate!({
        provider: "invalid-provider",
        model: "gpt-4o-mini",
        prompt: "Hello",
      });
      expect(errors.some((e) => e.includes("Invalid provider"))).toBe(true);
    });

    it("should pass validation with valid params", () => {
      const errors = aiChatExecutor.validate!({
        provider: "openai",
        model: "gpt-4o-mini",
        prompt: "Hello",
      });
      expect(errors).toHaveLength(0);
    });

    it("should accept messages instead of prompt", () => {
      const errors = aiChatExecutor.validate!({
        provider: "openai",
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "Hello" }],
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

      const result = await aiChatExecutor.execute(params);
      expect(result.success).toBe(false);
      expect(result.error).toContain("Provider is required");
    });

    it("should return error if model is missing", async () => {
      const params = createParams({
        provider: "openai",
        prompt: "Hello",
      });

      const result = await aiChatExecutor.execute(params);
      expect(result.success).toBe(false);
      expect(result.error).toContain("Model is required");
    });

    it("should return error if prompt and messages are missing", async () => {
      const params = createParams({
        provider: "openai",
        model: "gpt-4o-mini",
      });

      const result = await aiChatExecutor.execute(params);
      expect(result.success).toBe(false);
      expect(result.error).toContain("Prompt or messages is required");
    });

    it("should return error for unsupported provider", async () => {
      const params = createParams({
        provider: "google",
        model: "gemini-pro",
        prompt: "Hello",
      });

      const result = await aiChatExecutor.execute(params);
      expect(result.success).toBe(false);
      expect(result.error).toContain("not supported yet");
    });

    it("should return error if API key is missing for OpenAI", async () => {
      const params = createParams({
        provider: "openai",
        model: "gpt-4o-mini",
        prompt: "Hello",
      });

      const result = await aiChatExecutor.execute(params);
      expect(result.success).toBe(false);
      expect(result.error).toContain("API key");
    });

    it("should return error if API key is missing for Anthropic", async () => {
      const params = createParams({
        provider: "anthropic",
        model: "claude-3-5-sonnet-20241022",
        prompt: "Hello",
      });

      const result = await aiChatExecutor.execute(params);
      expect(result.success).toBe(false);
      expect(result.error).toContain("API key");
    });

    it("should use API key from environment", async () => {
      const params = createParams(
        {
          provider: "openai",
          model: "gpt-4o-mini",
          prompt: "Hello",
        },
        { OPENAI_API_KEY: "test-key" }
      );

      const result = await aiChatExecutor.execute(params);
      expect(result.success).toBe(false);
      expect(result.error).not.toContain("API key is required");
    });

    it("should return error if Workers AI binding is missing", async () => {
      const params = createParams({
        provider: "workers-ai",
        model: "@cf/meta/llama-3.1-8b-instruct",
        prompt: "Hello",
      });

      const result = await aiChatExecutor.execute(params);
      expect(result.success).toBe(false);
      expect(result.error).toContain("Workers AI binding");
    });
  });

  describe("metadata", () => {
    it("should have correct type", () => {
      expect(aiChatExecutor.type).toBe("ai-chat");
    });

    it("should have correct category", () => {
      expect(aiChatExecutor.category).toBe("ai");
    });
  });
});
