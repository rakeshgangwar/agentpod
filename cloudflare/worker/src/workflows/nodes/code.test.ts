import { describe, it, expect } from "vitest";
import { mergeExecutor, loopExecutor } from "./code";
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

describe("mergeExecutor", () => {
  it("should have correct type and category", () => {
    expect(mergeExecutor.type).toBe("merge");
    expect(mergeExecutor.category).toBe("logic");
  });

  describe("wait mode (default)", () => {
    it("should merge all successful steps", async () => {
      const context = createMockContext({
        steps: {
          "http-1": { success: true, data: { status: 200 } },
          "http-2": { success: true, data: { status: 201 } },
        },
      });
      const params = createMockParams("merge", { inputCount: 2 }, context);

      const result = await mergeExecutor.execute(params);

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        merged: true,
        inputCount: 2,
        data: {
          "http-1": { status: 200 },
          "http-2": { status: 201 },
        },
      });
    });

    it("should wait when not enough inputs", async () => {
      const context = createMockContext({
        steps: {
          "http-1": { success: true, data: { status: 200 } },
        },
      });
      const params = createMockParams("merge", { inputCount: 3 }, context);

      const result = await mergeExecutor.execute(params);

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        waiting: true,
        received: 1,
        expected: 3,
      });
    });

    it("should only include successful steps", async () => {
      const context = createMockContext({
        steps: {
          "http-1": { success: true, data: { status: 200 } },
          "http-2": { success: false, error: "Failed" },
          "http-3": { success: true, data: { status: 201 } },
        },
      });
      const params = createMockParams("merge", { inputCount: 2 }, context);

      const result = await mergeExecutor.execute(params);

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        merged: true,
        inputCount: 2,
      });
      const data = result.data as { data: Record<string, unknown> };
      expect(data.data).not.toHaveProperty("http-2");
    });
  });

  describe("first mode", () => {
    it("should merge with any number of inputs", async () => {
      const context = createMockContext({
        steps: {
          "http-1": { success: true, data: { status: 200 } },
        },
      });
      const params = createMockParams("merge", { mode: "first", inputCount: 5 }, context);

      const result = await mergeExecutor.execute(params);

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        merged: true,
        inputCount: 1,
      });
    });
  });

  describe("edge cases", () => {
    it("should handle no successful steps", async () => {
      const context = createMockContext({
        steps: {
          "http-1": { success: false, error: "Failed" },
        },
      });
      const params = createMockParams("merge", { inputCount: 1 }, context);

      const result = await mergeExecutor.execute(params);

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        waiting: true,
        received: 0,
        expected: 1,
      });
    });

    it("should use default inputCount of 2", async () => {
      const context = createMockContext({
        steps: {
          "s1": { success: true, data: { a: 1 } },
        },
      });
      const params = createMockParams("merge", {}, context);

      const result = await mergeExecutor.execute(params);

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        waiting: true,
        received: 1,
        expected: 2,
      });
    });
  });
});

describe("loopExecutor", () => {
  it("should have correct type and category", () => {
    expect(loopExecutor.type).toBe("loop");
    expect(loopExecutor.category).toBe("logic");
  });

  describe("direct items", () => {
    it("should process array of items", async () => {
      const context = createMockContext();
      const params = createMockParams(
        "loop",
        { items: [1, 2, 3, 4, 5] },
        context
      );

      const result = await loopExecutor.execute(params);

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        totalItems: 5,
        batchCount: 5,
        batchSize: 1,
        items: [1, 2, 3, 4, 5],
      });
    });

    it("should process objects in array", async () => {
      const context = createMockContext();
      const items = [
        { id: 1, name: "A" },
        { id: 2, name: "B" },
      ];
      const params = createMockParams("loop", { items }, context);

      const result = await loopExecutor.execute(params);

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        totalItems: 2,
        items,
      });
    });
  });

  describe("itemsPath resolution", () => {
    it("should resolve simple dot notation path", async () => {
      const context = createMockContext({
        steps: {
          "http-1": { success: true, data: { items: ["a", "b", "c"] } },
        },
      });
      const params = createMockParams(
        "loop",
        { itemsPath: "steps.http-1.data.items" },
        context
      );

      const result = await loopExecutor.execute(params);

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        totalItems: 3,
        items: ["a", "b", "c"],
      });
    });

    it("should resolve bracket notation path with single quotes", async () => {
      const context = createMockContext({
        steps: {
          "js-1": { success: true, data: { output: { items: [1, 2, 3] } } },
        },
      });
      const params = createMockParams(
        "loop",
        { itemsPath: "steps['js-1'].data.output.items" },
        context
      );

      const result = await loopExecutor.execute(params);

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        totalItems: 3,
        items: [1, 2, 3],
      });
    });

    it("should resolve bracket notation path with double quotes", async () => {
      const context = createMockContext({
        steps: {
          "my-node": { success: true, data: { list: ["x", "y"] } },
        },
      });
      const params = createMockParams(
        "loop",
        { itemsPath: 'steps["my-node"].data.list' },
        context
      );

      const result = await loopExecutor.execute(params);

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        totalItems: 2,
        items: ["x", "y"],
      });
    });

    it("should handle mixed notation", async () => {
      const context = createMockContext({
        steps: {
          "api-call": { success: true, data: { response: { data: { users: [{ id: 1 }, { id: 2 }] } } } },
        },
      });
      const params = createMockParams(
        "loop",
        { itemsPath: "steps['api-call'].data.response.data.users" },
        context
      );

      const result = await loopExecutor.execute(params);

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        totalItems: 2,
        items: [{ id: 1 }, { id: 2 }],
      });
    });
  });

  describe("batch processing", () => {
    it("should create batches of specified size", async () => {
      const context = createMockContext();
      const params = createMockParams(
        "loop",
        { items: [1, 2, 3, 4, 5], batchSize: 2 },
        context
      );

      const result = await loopExecutor.execute(params);

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        totalItems: 5,
        batchCount: 3,
        batchSize: 2,
        batches: [[1, 2], [3, 4], [5]],
      });
    });

    it("should handle batch size larger than items", async () => {
      const context = createMockContext();
      const params = createMockParams(
        "loop",
        { items: [1, 2], batchSize: 10 },
        context
      );

      const result = await loopExecutor.execute(params);

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        totalItems: 2,
        batchCount: 1,
        batchSize: 10,
        batches: [[1, 2]],
      });
    });

    it("should default to batch size of 1", async () => {
      const context = createMockContext();
      const params = createMockParams("loop", { items: [1, 2, 3] }, context);

      const result = await loopExecutor.execute(params);

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        batchSize: 1,
        batches: [[1], [2], [3]],
      });
    });
  });

  describe("error handling", () => {
    it("should return error when items is not an array", async () => {
      const context = createMockContext();
      const params = createMockParams("loop", { items: "not an array" }, context);

      const result = await loopExecutor.execute(params);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Items must be an array");
    });

    it("should return error when itemsPath resolves to non-array", async () => {
      const context = createMockContext({
        steps: { "s1": { success: true, data: { value: "string" } } },
      });
      const params = createMockParams(
        "loop",
        { itemsPath: "steps.s1.data.value" },
        context
      );

      const result = await loopExecutor.execute(params);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Items must be an array");
    });

    it("should return error when itemsPath doesn't resolve", async () => {
      const context = createMockContext();
      const params = createMockParams(
        "loop",
        { itemsPath: "steps.missing.data" },
        context
      );

      const result = await loopExecutor.execute(params);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Items must be an array");
    });
  });

  describe("edge cases", () => {
    it("should handle empty array", async () => {
      const context = createMockContext();
      const params = createMockParams("loop", { items: [] }, context);

      const result = await loopExecutor.execute(params);

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        totalItems: 0,
        batchCount: 0,
        batches: [],
      });
    });

    it("should prefer items over itemsPath when both provided", async () => {
      const context = createMockContext({
        steps: { "s1": { success: true, data: { items: [4, 5, 6] } } },
      });
      const params = createMockParams(
        "loop",
        { items: [1, 2, 3], itemsPath: "steps.s1.data.items" },
        context
      );

      const result = await loopExecutor.execute(params);

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        items: [1, 2, 3],
      });
    });
  });
});
