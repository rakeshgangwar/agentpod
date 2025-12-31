import { describe, it, expect } from "vitest";
import { manualTriggerExecutor, webhookTriggerExecutor, scheduleTriggerExecutor } from "./trigger";
import type { NodeExecutionParams, ExecutionContext } from "../utils/context";

function createMockContext(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
  return {
    trigger: {
      type: "manual",
      data: {},
      timestamp: new Date(),
    },
    steps: {},
    env: {} as ExecutionContext["env"],
    ...overrides,
  };
}

function createMockParams(
  nodeType: string,
  parameters: Record<string, unknown>,
  context: ExecutionContext
): NodeExecutionParams {
  return {
    nodeId: "test-node",
    nodeName: "Test Node",
    nodeType,
    parameters,
    context,
  };
}

describe("manualTriggerExecutor", () => {
  it("should have correct type and category", () => {
    expect(manualTriggerExecutor.type).toBe("manual-trigger");
    expect(manualTriggerExecutor.category).toBe("trigger");
  });

  it("should return triggered status with trigger data", async () => {
    const context = createMockContext({
      trigger: { type: "manual", data: { userId: "123", action: "test" }, timestamp: new Date() },
    });
    const params = createMockParams("manual-trigger", {}, context);

    const result = await manualTriggerExecutor.execute(params);

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      triggered: true,
      triggerType: "manual",
      data: { userId: "123", action: "test" },
    });
    expect(result.data).toHaveProperty("timestamp");
  });

  it("should handle empty trigger data", async () => {
    const context = createMockContext();
    const params = createMockParams("manual-trigger", {}, context);

    const result = await manualTriggerExecutor.execute(params);

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      triggered: true,
      triggerType: "manual",
      data: {},
    });
  });
});

describe("webhookTriggerExecutor", () => {
  it("should have correct type and category", () => {
    expect(webhookTriggerExecutor.type).toBe("webhook-trigger");
    expect(webhookTriggerExecutor.category).toBe("trigger");
  });

  it("should extract webhook data from trigger", async () => {
    const context = createMockContext({
      trigger: {
        type: "webhook",
        data: {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: { event: "user.created" },
          query: { source: "api" },
        },
        timestamp: new Date(),
      },
    });
    const params = createMockParams("webhook-trigger", {}, context);

    const result = await webhookTriggerExecutor.execute(params);

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      triggered: true,
      triggerType: "webhook",
      method: "POST",
      headers: { "content-type": "application/json" },
      body: { event: "user.created" },
      query: { source: "api" },
    });
  });

  it("should provide defaults for missing webhook data", async () => {
    const context = createMockContext({
      trigger: { type: "webhook", data: {}, timestamp: new Date() },
    });
    const params = createMockParams("webhook-trigger", {}, context);

    const result = await webhookTriggerExecutor.execute(params);

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      triggered: true,
      triggerType: "webhook",
      method: "POST",
      headers: {},
      body: null,
      query: {},
    });
  });

  it("should handle GET method", async () => {
    const context = createMockContext({
      trigger: {
        type: "webhook",
        data: { method: "GET", query: { page: "1" } },
        timestamp: new Date(),
      },
    });
    const params = createMockParams("webhook-trigger", {}, context);

    const result = await webhookTriggerExecutor.execute(params);

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      method: "GET",
      query: { page: "1" },
    });
  });
});

describe("scheduleTriggerExecutor", () => {
  it("should have correct type and category", () => {
    expect(scheduleTriggerExecutor.type).toBe("schedule-trigger");
    expect(scheduleTriggerExecutor.category).toBe("trigger");
  });

  it("should return cron expression from parameters", async () => {
    const context = createMockContext();
    const params = createMockParams(
      "schedule-trigger",
      { cron: "0 0 * * *", scheduledTime: "2025-01-01T00:00:00Z" },
      context
    );

    const result = await scheduleTriggerExecutor.execute(params);

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      triggered: true,
      triggerType: "schedule",
      cron: "0 0 * * *",
      scheduledTime: "2025-01-01T00:00:00Z",
    });
  });

  it("should provide defaults when parameters are missing", async () => {
    const context = createMockContext();
    const params = createMockParams("schedule-trigger", {}, context);

    const result = await scheduleTriggerExecutor.execute(params);

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      triggered: true,
      triggerType: "schedule",
      cron: "",
    });
    expect(result.data).toHaveProperty("scheduledTime");
  });
});
