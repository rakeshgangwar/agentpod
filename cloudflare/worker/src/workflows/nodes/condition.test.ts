import { describe, it, expect } from "vitest";
import { conditionExecutor, switchExecutor } from "./condition";
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
  parameters: Record<string, unknown>,
  context: ExecutionContext
): NodeExecutionParams {
  return {
    nodeId: "test-node",
    nodeName: "Test Node",
    nodeType: "condition",
    parameters,
    context,
  };
}

describe("conditionExecutor", () => {
  it("should have correct type and category", () => {
    expect(conditionExecutor.type).toBe("condition");
    expect(conditionExecutor.category).toBe("logic");
  });

  describe("equals operator", () => {
    it("should match identical strings", async () => {
      const context = createMockContext({
        steps: { "s1": { success: true, data: { value: "hello" } } },
      });
      const params = createMockParams(
        {
          conditions: [
            { field: "steps.s1.data.value", operator: "equals", value: "hello", outputBranch: "match" },
          ],
        },
        context
      );

      const result = await conditionExecutor.execute(params);
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ branch: "match", matched: true });
    });

    it("should match identical numbers", async () => {
      const context = createMockContext({
        steps: { "s1": { success: true, data: { count: 42 } } },
      });
      const params = createMockParams(
        {
          conditions: [
            { field: "steps.s1.data.count", operator: "equals", value: 42, outputBranch: "match" },
          ],
        },
        context
      );

      const result = await conditionExecutor.execute(params);
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ branch: "match", matched: true });
    });

    it("should match string representation of numbers", async () => {
      const context = createMockContext({
        steps: { "s1": { success: true, data: { count: "100" } } },
      });
      const params = createMockParams(
        {
          conditions: [
            { field: "steps.s1.data.count", operator: "equals", value: 100, outputBranch: "match" },
          ],
        },
        context
      );

      const result = await conditionExecutor.execute(params);
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ branch: "match", matched: true });
    });

    it("should not match different values", async () => {
      const context = createMockContext({
        steps: { "s1": { success: true, data: { value: "hello" } } },
      });
      const params = createMockParams(
        {
          conditions: [
            { field: "steps.s1.data.value", operator: "equals", value: "world", outputBranch: "match" },
          ],
          defaultBranch: "noMatch",
        },
        context
      );

      const result = await conditionExecutor.execute(params);
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ branch: "noMatch", matched: false });
    });
  });

  describe("notEquals operator", () => {
    it("should match when values are different", async () => {
      const context = createMockContext({
        steps: { "s1": { success: true, data: { status: 404 } } },
      });
      const params = createMockParams(
        {
          conditions: [
            { field: "steps.s1.data.status", operator: "notEquals", value: 200, outputBranch: "error" },
          ],
        },
        context
      );

      const result = await conditionExecutor.execute(params);
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ branch: "error", matched: true });
    });

    it("should not match when values are equal", async () => {
      const context = createMockContext({
        steps: { "s1": { success: true, data: { status: 200 } } },
      });
      const params = createMockParams(
        {
          conditions: [
            { field: "steps.s1.data.status", operator: "notEquals", value: 200, outputBranch: "error" },
          ],
          defaultBranch: "ok",
        },
        context
      );

      const result = await conditionExecutor.execute(params);
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ branch: "ok", matched: false });
    });
  });

  describe("contains operator", () => {
    it("should find substring in string", async () => {
      const context = createMockContext({
        steps: { "s1": { success: true, data: { text: "Hello World" } } },
      });
      const params = createMockParams(
        {
          conditions: [
            { field: "steps.s1.data.text", operator: "contains", value: "World", outputBranch: "found" },
          ],
        },
        context
      );

      const result = await conditionExecutor.execute(params);
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ branch: "found", matched: true });
    });

    it("should not find missing substring", async () => {
      const context = createMockContext({
        steps: { "s1": { success: true, data: { text: "Hello World" } } },
      });
      const params = createMockParams(
        {
          conditions: [
            { field: "steps.s1.data.text", operator: "contains", value: "Foo", outputBranch: "found" },
          ],
          defaultBranch: "notFound",
        },
        context
      );

      const result = await conditionExecutor.execute(params);
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ branch: "notFound", matched: false });
    });

    it("should find element in array", async () => {
      const context = createMockContext({
        steps: { "s1": { success: true, data: { tags: ["tech", "business", "lifestyle"] } } },
      });
      const params = createMockParams(
        {
          conditions: [
            { field: "steps.s1.data.tags", operator: "contains", value: "tech", outputBranch: "hasTech" },
          ],
        },
        context
      );

      const result = await conditionExecutor.execute(params);
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ branch: "hasTech", matched: true });
    });

    it("should not find missing element in array", async () => {
      const context = createMockContext({
        steps: { "s1": { success: true, data: { tags: ["tech", "business"] } } },
      });
      const params = createMockParams(
        {
          conditions: [
            { field: "steps.s1.data.tags", operator: "contains", value: "sports", outputBranch: "hasSports" },
          ],
          defaultBranch: "noSports",
        },
        context
      );

      const result = await conditionExecutor.execute(params);
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ branch: "noSports", matched: false });
    });
  });

  describe("notContains operator", () => {
    it("should match when substring is absent", async () => {
      const context = createMockContext({
        steps: { "s1": { success: true, data: { text: "Hello World" } } },
      });
      const params = createMockParams(
        {
          conditions: [
            { field: "steps.s1.data.text", operator: "notContains", value: "Foo", outputBranch: "absent" },
          ],
        },
        context
      );

      const result = await conditionExecutor.execute(params);
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ branch: "absent", matched: true });
    });

    it("should not match when substring is present", async () => {
      const context = createMockContext({
        steps: { "s1": { success: true, data: { text: "Hello World" } } },
      });
      const params = createMockParams(
        {
          conditions: [
            { field: "steps.s1.data.text", operator: "notContains", value: "World", outputBranch: "absent" },
          ],
          defaultBranch: "present",
        },
        context
      );

      const result = await conditionExecutor.execute(params);
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ branch: "present", matched: false });
    });
  });

  describe("startsWith operator", () => {
    it("should match string starting with prefix", async () => {
      const context = createMockContext({
        steps: { "s1": { success: true, data: { url: "https://example.com" } } },
      });
      const params = createMockParams(
        {
          conditions: [
            { field: "steps.s1.data.url", operator: "startsWith", value: "https://", outputBranch: "secure" },
          ],
        },
        context
      );

      const result = await conditionExecutor.execute(params);
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ branch: "secure", matched: true });
    });

    it("should not match string not starting with prefix", async () => {
      const context = createMockContext({
        steps: { "s1": { success: true, data: { url: "http://example.com" } } },
      });
      const params = createMockParams(
        {
          conditions: [
            { field: "steps.s1.data.url", operator: "startsWith", value: "https://", outputBranch: "secure" },
          ],
          defaultBranch: "insecure",
        },
        context
      );

      const result = await conditionExecutor.execute(params);
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ branch: "insecure", matched: false });
    });
  });

  describe("endsWith operator", () => {
    it("should match string ending with suffix", async () => {
      const context = createMockContext({
        steps: { "s1": { success: true, data: { file: "document.pdf" } } },
      });
      const params = createMockParams(
        {
          conditions: [
            { field: "steps.s1.data.file", operator: "endsWith", value: ".pdf", outputBranch: "isPdf" },
          ],
        },
        context
      );

      const result = await conditionExecutor.execute(params);
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ branch: "isPdf", matched: true });
    });

    it("should not match string not ending with suffix", async () => {
      const context = createMockContext({
        steps: { "s1": { success: true, data: { file: "document.txt" } } },
      });
      const params = createMockParams(
        {
          conditions: [
            { field: "steps.s1.data.file", operator: "endsWith", value: ".pdf", outputBranch: "isPdf" },
          ],
          defaultBranch: "notPdf",
        },
        context
      );

      const result = await conditionExecutor.execute(params);
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ branch: "notPdf", matched: false });
    });
  });

  describe("greaterThan operator", () => {
    it("should compare numbers correctly", async () => {
      const context = createMockContext({
        steps: { "s1": { success: true, data: { count: 10 } } },
      });
      const params = createMockParams(
        {
          conditions: [
            { field: "steps.s1.data.count", operator: "greaterThan", value: 5, outputBranch: "high" },
          ],
        },
        context
      );

      const result = await conditionExecutor.execute(params);
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ branch: "high", matched: true });
    });

    it("should handle string numbers", async () => {
      const context = createMockContext({
        steps: { "s1": { success: true, data: { count: "100" } } },
      });
      const params = createMockParams(
        {
          conditions: [
            { field: "steps.s1.data.count", operator: "greaterThan", value: "50", outputBranch: "high" },
          ],
        },
        context
      );

      const result = await conditionExecutor.execute(params);
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ branch: "high", matched: true });
    });

    it("should handle literal numeric field values", async () => {
      const context = createMockContext();
      const params = createMockParams(
        {
          conditions: [
            { field: "3", operator: "greaterThan", value: "0", outputBranch: "positive" },
          ],
        },
        context
      );

      const result = await conditionExecutor.execute(params);
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ branch: "positive", matched: true });
    });

    it("should not match when value is less", async () => {
      const context = createMockContext({
        steps: { "s1": { success: true, data: { count: 3 } } },
      });
      const params = createMockParams(
        {
          conditions: [
            { field: "steps.s1.data.count", operator: "greaterThan", value: 5, outputBranch: "high" },
          ],
          defaultBranch: "low",
        },
        context
      );

      const result = await conditionExecutor.execute(params);
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ branch: "low", matched: false });
    });

    it("should not match when values are equal", async () => {
      const context = createMockContext({
        steps: { "s1": { success: true, data: { count: 5 } } },
      });
      const params = createMockParams(
        {
          conditions: [
            { field: "steps.s1.data.count", operator: "greaterThan", value: 5, outputBranch: "high" },
          ],
          defaultBranch: "notHigh",
        },
        context
      );

      const result = await conditionExecutor.execute(params);
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ branch: "notHigh", matched: false });
    });
  });

  describe("lessThan operator", () => {
    it("should compare numbers correctly", async () => {
      const context = createMockContext({
        steps: { "s1": { success: true, data: { count: 3 } } },
      });
      const params = createMockParams(
        {
          conditions: [
            { field: "steps.s1.data.count", operator: "lessThan", value: 5, outputBranch: "low" },
          ],
        },
        context
      );

      const result = await conditionExecutor.execute(params);
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ branch: "low", matched: true });
    });

    it("should not match when value is greater", async () => {
      const context = createMockContext({
        steps: { "s1": { success: true, data: { count: 10 } } },
      });
      const params = createMockParams(
        {
          conditions: [
            { field: "steps.s1.data.count", operator: "lessThan", value: 5, outputBranch: "low" },
          ],
          defaultBranch: "high",
        },
        context
      );

      const result = await conditionExecutor.execute(params);
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ branch: "high", matched: false });
    });
  });

  describe("greaterThanOrEqual operator", () => {
    it("should match when greater", async () => {
      const context = createMockContext({
        steps: { "s1": { success: true, data: { count: 10 } } },
      });
      const params = createMockParams(
        {
          conditions: [
            { field: "steps.s1.data.count", operator: "greaterThanOrEqual", value: 5, outputBranch: "ok" },
          ],
        },
        context
      );

      const result = await conditionExecutor.execute(params);
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ branch: "ok", matched: true });
    });

    it("should match when equal", async () => {
      const context = createMockContext({
        steps: { "s1": { success: true, data: { count: 5 } } },
      });
      const params = createMockParams(
        {
          conditions: [
            { field: "steps.s1.data.count", operator: "greaterThanOrEqual", value: 5, outputBranch: "ok" },
          ],
        },
        context
      );

      const result = await conditionExecutor.execute(params);
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ branch: "ok", matched: true });
    });

    it("should not match when less", async () => {
      const context = createMockContext({
        steps: { "s1": { success: true, data: { count: 3 } } },
      });
      const params = createMockParams(
        {
          conditions: [
            { field: "steps.s1.data.count", operator: "greaterThanOrEqual", value: 5, outputBranch: "ok" },
          ],
          defaultBranch: "fail",
        },
        context
      );

      const result = await conditionExecutor.execute(params);
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ branch: "fail", matched: false });
    });
  });

  describe("lessThanOrEqual operator", () => {
    it("should match when less", async () => {
      const context = createMockContext({
        steps: { "s1": { success: true, data: { count: 3 } } },
      });
      const params = createMockParams(
        {
          conditions: [
            { field: "steps.s1.data.count", operator: "lessThanOrEqual", value: 5, outputBranch: "ok" },
          ],
        },
        context
      );

      const result = await conditionExecutor.execute(params);
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ branch: "ok", matched: true });
    });

    it("should match when equal", async () => {
      const context = createMockContext({
        steps: { "s1": { success: true, data: { count: 5 } } },
      });
      const params = createMockParams(
        {
          conditions: [
            { field: "steps.s1.data.count", operator: "lessThanOrEqual", value: 5, outputBranch: "ok" },
          ],
        },
        context
      );

      const result = await conditionExecutor.execute(params);
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ branch: "ok", matched: true });
    });
  });

  describe("isEmpty operator", () => {
    it("should detect null", async () => {
      const context = createMockContext({
        steps: { "s1": { success: true, data: { value: null } } },
      });
      const params = createMockParams(
        {
          conditions: [
            { field: "steps.s1.data.value", operator: "isEmpty", outputBranch: "empty" },
          ],
        },
        context
      );

      const result = await conditionExecutor.execute(params);
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ branch: "empty", matched: true });
    });

    it("should detect undefined", async () => {
      const context = createMockContext({
        steps: { "s1": { success: true, data: {} } },
      });
      const params = createMockParams(
        {
          conditions: [
            { field: "steps.s1.data.missing", operator: "isEmpty", outputBranch: "empty" },
          ],
        },
        context
      );

      const result = await conditionExecutor.execute(params);
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ branch: "empty", matched: true });
    });

    it("should detect empty string", async () => {
      const context = createMockContext({
        steps: { "s1": { success: true, data: { name: "" } } },
      });
      const params = createMockParams(
        {
          conditions: [
            { field: "steps.s1.data.name", operator: "isEmpty", outputBranch: "empty" },
          ],
        },
        context
      );

      const result = await conditionExecutor.execute(params);
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ branch: "empty", matched: true });
    });

    it("should detect empty array", async () => {
      const context = createMockContext({
        steps: { "s1": { success: true, data: { items: [] } } },
      });
      const params = createMockParams(
        {
          conditions: [
            { field: "steps.s1.data.items", operator: "isEmpty", outputBranch: "empty" },
          ],
        },
        context
      );

      const result = await conditionExecutor.execute(params);
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ branch: "empty", matched: true });
    });

    it("should detect empty object", async () => {
      const context = createMockContext({
        steps: { "s1": { success: true, data: { metadata: {} } } },
      });
      const params = createMockParams(
        {
          conditions: [
            { field: "steps.s1.data.metadata", operator: "isEmpty", outputBranch: "empty" },
          ],
        },
        context
      );

      const result = await conditionExecutor.execute(params);
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ branch: "empty", matched: true });
    });

    it("should not match non-empty string", async () => {
      const context = createMockContext({
        steps: { "s1": { success: true, data: { name: "test" } } },
      });
      const params = createMockParams(
        {
          conditions: [
            { field: "steps.s1.data.name", operator: "isEmpty", outputBranch: "empty" },
          ],
          defaultBranch: "notEmpty",
        },
        context
      );

      const result = await conditionExecutor.execute(params);
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ branch: "notEmpty", matched: false });
    });
  });

  describe("isNotEmpty operator", () => {
    it("should match non-empty string", async () => {
      const context = createMockContext({
        steps: { "s1": { success: true, data: { name: "test" } } },
      });
      const params = createMockParams(
        {
          conditions: [
            { field: "steps.s1.data.name", operator: "isNotEmpty", outputBranch: "hasValue" },
          ],
        },
        context
      );

      const result = await conditionExecutor.execute(params);
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ branch: "hasValue", matched: true });
    });

    it("should match non-empty array", async () => {
      const context = createMockContext({
        steps: { "s1": { success: true, data: { items: [1, 2, 3] } } },
      });
      const params = createMockParams(
        {
          conditions: [
            { field: "steps.s1.data.items", operator: "isNotEmpty", outputBranch: "hasItems" },
          ],
        },
        context
      );

      const result = await conditionExecutor.execute(params);
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ branch: "hasItems", matched: true });
    });

    it("should not match empty value", async () => {
      const context = createMockContext({
        steps: { "s1": { success: true, data: { name: "" } } },
      });
      const params = createMockParams(
        {
          conditions: [
            { field: "steps.s1.data.name", operator: "isNotEmpty", outputBranch: "hasValue" },
          ],
          defaultBranch: "noValue",
        },
        context
      );

      const result = await conditionExecutor.execute(params);
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ branch: "noValue", matched: false });
    });
  });

  describe("isTrue operator", () => {
    it("should match true boolean", async () => {
      const context = createMockContext({
        steps: { "s1": { success: true, data: { active: true } } },
      });
      const params = createMockParams(
        {
          conditions: [
            { field: "steps.s1.data.active", operator: "isTrue", outputBranch: "active" },
          ],
        },
        context
      );

      const result = await conditionExecutor.execute(params);
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ branch: "active", matched: true });
    });

    it("should not match false boolean", async () => {
      const context = createMockContext({
        steps: { "s1": { success: true, data: { active: false } } },
      });
      const params = createMockParams(
        {
          conditions: [
            { field: "steps.s1.data.active", operator: "isTrue", outputBranch: "active" },
          ],
          defaultBranch: "inactive",
        },
        context
      );

      const result = await conditionExecutor.execute(params);
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ branch: "inactive", matched: false });
    });

    it("should not match truthy non-boolean", async () => {
      const context = createMockContext({
        steps: { "s1": { success: true, data: { value: 1 } } },
      });
      const params = createMockParams(
        {
          conditions: [
            { field: "steps.s1.data.value", operator: "isTrue", outputBranch: "true" },
          ],
          defaultBranch: "notTrue",
        },
        context
      );

      const result = await conditionExecutor.execute(params);
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ branch: "notTrue", matched: false });
    });
  });

  describe("isFalse operator", () => {
    it("should match false boolean", async () => {
      const context = createMockContext({
        steps: { "s1": { success: true, data: { disabled: false } } },
      });
      const params = createMockParams(
        {
          conditions: [
            { field: "steps.s1.data.disabled", operator: "isFalse", outputBranch: "enabled" },
          ],
        },
        context
      );

      const result = await conditionExecutor.execute(params);
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ branch: "enabled", matched: true });
    });

    it("should not match true boolean", async () => {
      const context = createMockContext({
        steps: { "s1": { success: true, data: { disabled: true } } },
      });
      const params = createMockParams(
        {
          conditions: [
            { field: "steps.s1.data.disabled", operator: "isFalse", outputBranch: "enabled" },
          ],
          defaultBranch: "disabled",
        },
        context
      );

      const result = await conditionExecutor.execute(params);
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ branch: "disabled", matched: false });
    });
  });

  describe("regex operator", () => {
    it("should match regex pattern", async () => {
      const context = createMockContext({
        steps: { "s1": { success: true, data: { email: "test@example.com" } } },
      });
      const params = createMockParams(
        {
          conditions: [
            { field: "steps.s1.data.email", operator: "regex", value: "^[^@]+@[^@]+\\.[^@]+$", outputBranch: "valid" },
          ],
        },
        context
      );

      const result = await conditionExecutor.execute(params);
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ branch: "valid", matched: true });
    });

    it("should not match invalid pattern", async () => {
      const context = createMockContext({
        steps: { "s1": { success: true, data: { email: "notanemail" } } },
      });
      const params = createMockParams(
        {
          conditions: [
            { field: "steps.s1.data.email", operator: "regex", value: "^[^@]+@[^@]+\\.[^@]+$", outputBranch: "valid" },
          ],
          defaultBranch: "invalid",
        },
        context
      );

      const result = await conditionExecutor.execute(params);
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ branch: "invalid", matched: false });
    });

    it("should handle invalid regex gracefully", async () => {
      const context = createMockContext({
        steps: { "s1": { success: true, data: { text: "test" } } },
      });
      const params = createMockParams(
        {
          conditions: [
            { field: "steps.s1.data.text", operator: "regex", value: "[invalid(regex", outputBranch: "match" },
          ],
          defaultBranch: "noMatch",
        },
        context
      );

      const result = await conditionExecutor.execute(params);
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ branch: "noMatch", matched: false });
    });
  });

  describe("field resolution", () => {
    it("should resolve trigger.data fields", async () => {
      const context = createMockContext({
        trigger: { type: "webhook", data: { action: "create" }, timestamp: new Date() },
      });
      const params = createMockParams(
        {
          conditions: [
            { field: "trigger.data.action", operator: "equals", value: "create", outputBranch: "create" },
          ],
        },
        context
      );

      const result = await conditionExecutor.execute(params);
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ branch: "create", matched: true });
    });

    it("should resolve deeply nested paths", async () => {
      const context = createMockContext({
        steps: { "api": { success: true, data: { response: { user: { profile: { name: "John" } } } } } },
      });
      const params = createMockParams(
        {
          conditions: [
            { field: "steps.api.data.response.user.profile.name", operator: "equals", value: "John", outputBranch: "found" },
          ],
        },
        context
      );

      const result = await conditionExecutor.execute(params);
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ branch: "found", matched: true });
    });

    it("should handle missing paths gracefully", async () => {
      const context = createMockContext();
      const params = createMockParams(
        {
          conditions: [
            { field: "steps.nonexistent.data.value", operator: "equals", value: "test", outputBranch: "found" },
          ],
          defaultBranch: "notFound",
        },
        context
      );

      const result = await conditionExecutor.execute(params);
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ branch: "notFound", matched: false });
    });
  });

  describe("mode: first (default)", () => {
    it("should return first matching condition", async () => {
      const context = createMockContext({
        steps: { "s1": { success: true, data: { value: 10 } } },
      });
      const params = createMockParams(
        {
          conditions: [
            { field: "steps.s1.data.value", operator: "greaterThan", value: 5, outputBranch: "first" },
            { field: "steps.s1.data.value", operator: "greaterThan", value: 3, outputBranch: "second" },
          ],
        },
        context
      );

      const result = await conditionExecutor.execute(params);
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ branch: "first", matched: true });
    });

    it("should skip to second condition if first doesn't match", async () => {
      const context = createMockContext({
        steps: { "s1": { success: true, data: { value: 4 } } },
      });
      const params = createMockParams(
        {
          conditions: [
            { field: "steps.s1.data.value", operator: "greaterThan", value: 5, outputBranch: "first" },
            { field: "steps.s1.data.value", operator: "greaterThan", value: 3, outputBranch: "second" },
          ],
        },
        context
      );

      const result = await conditionExecutor.execute(params);
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ branch: "second", matched: true });
    });
  });

  describe("validation", () => {
    it("should require at least one condition", () => {
      const errors = conditionExecutor.validate!({});
      expect(errors).toContain("At least one condition is required");
    });

    it("should reject empty conditions array", () => {
      const errors = conditionExecutor.validate!({ conditions: [] });
      expect(errors).toContain("At least one condition is required");
    });

    it("should pass with valid conditions", () => {
      const errors = conditionExecutor.validate!({
        conditions: [{ field: "test", operator: "equals", value: "x", outputBranch: "y" }],
      });
      expect(errors).toHaveLength(0);
    });
  });

  describe("error handling", () => {
    it("should return error when no conditions configured", async () => {
      const context = createMockContext();
      const params = createMockParams({ conditions: [] }, context);

      const result = await conditionExecutor.execute(params);
      expect(result.success).toBe(false);
      expect(result.error).toContain("No conditions configured");
    });
  });
});

describe("switchExecutor", () => {
  it("should have correct type and category", () => {
    expect(switchExecutor.type).toBe("switch");
    expect(switchExecutor.category).toBe("logic");
  });

  describe("case matching", () => {
    it("should match exact string case", async () => {
      const context = createMockContext({
        steps: { "ai": { success: true, data: { response: "technology" } } },
      });
      const params = createMockParams(
        {
          field: "steps.ai.data.response",
          cases: [
            { value: "technology", outputBranch: "tech" },
            { value: "business", outputBranch: "biz" },
            { value: "lifestyle", outputBranch: "life" },
          ],
          defaultCase: "other",
        },
        context
      );

      const result = await switchExecutor.execute(params);
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ branch: "tech", matched: true, matchedCase: "technology" });
    });

    it("should match middle case", async () => {
      const context = createMockContext({
        steps: { "ai": { success: true, data: { response: "business" } } },
      });
      const params = createMockParams(
        {
          field: "steps.ai.data.response",
          cases: [
            { value: "technology", outputBranch: "tech" },
            { value: "business", outputBranch: "biz" },
            { value: "lifestyle", outputBranch: "life" },
          ],
          defaultCase: "other",
        },
        context
      );

      const result = await switchExecutor.execute(params);
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ branch: "biz", matched: true, matchedCase: "business" });
    });

    it("should use default case when no match", async () => {
      const context = createMockContext({
        steps: { "ai": { success: true, data: { response: "sports" } } },
      });
      const params = createMockParams(
        {
          field: "steps.ai.data.response",
          cases: [
            { value: "technology", outputBranch: "tech" },
            { value: "business", outputBranch: "biz" },
          ],
          defaultCase: "other",
        },
        context
      );

      const result = await switchExecutor.execute(params);
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ branch: "other", matched: false, value: "sports" });
    });

    it("should use 'default' as default when not specified", async () => {
      const context = createMockContext({
        steps: { "ai": { success: true, data: { response: "unknown" } } },
      });
      const params = createMockParams(
        {
          field: "steps.ai.data.response",
          cases: [{ value: "known", outputBranch: "known" }],
        },
        context
      );

      const result = await switchExecutor.execute(params);
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ branch: "default", matched: false });
    });
  });

  describe("numeric case values", () => {
    it("should match numeric cases", async () => {
      const context = createMockContext({
        steps: { "http": { success: true, data: { statusCode: 404 } } },
      });
      const params = createMockParams(
        {
          field: "steps.http.data.statusCode",
          cases: [
            { value: 200, outputBranch: "success" },
            { value: 404, outputBranch: "notFound" },
            { value: 500, outputBranch: "error" },
          ],
          defaultCase: "unknown",
        },
        context
      );

      const result = await switchExecutor.execute(params);
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ branch: "notFound", matched: true });
    });
  });

  describe("field resolution", () => {
    it("should handle undefined field with default case", async () => {
      const context = createMockContext();
      const params = createMockParams(
        {
          field: "steps.missing.data",
          cases: [{ value: "x", outputBranch: "x" }],
          defaultCase: "fallback",
        },
        context
      );

      const result = await switchExecutor.execute(params);
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ branch: "fallback", matched: false });
    });
  });

  describe("validation", () => {
    it("should require field", () => {
      const errors = switchExecutor.validate!({ cases: [{ value: "x", outputBranch: "y" }] });
      expect(errors).toContain("Field is required for switch node");
    });

    it("should require at least one case", () => {
      const errors = switchExecutor.validate!({ field: "test" });
      expect(errors).toContain("At least one case is required for switch node");
    });

    it("should reject empty cases array", () => {
      const errors = switchExecutor.validate!({ field: "test", cases: [] });
      expect(errors).toContain("At least one case is required for switch node");
    });

    it("should pass with valid config", () => {
      const errors = switchExecutor.validate!({
        field: "test",
        cases: [{ value: "x", outputBranch: "y" }],
      });
      expect(errors).toHaveLength(0);
    });
  });

  describe("error handling", () => {
    it("should return error when field is missing", async () => {
      const context = createMockContext();
      const params = createMockParams(
        {
          cases: [{ value: "x", outputBranch: "y" }],
        },
        context
      );

      const result = await switchExecutor.execute(params);
      expect(result.success).toBe(false);
      expect(result.error).toContain("Field is required");
    });
  });
});
