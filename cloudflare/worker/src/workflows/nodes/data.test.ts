import { describe, it, expect } from "vitest";
import { setVariableExecutor, parseJsonExecutor, aggregateExecutor } from "./data";
import type { NodeExecutionParams } from "../utils/context";

function createParams(parameters: Record<string, unknown>, context?: Partial<NodeExecutionParams["context"]>): NodeExecutionParams {
  return {
    nodeId: "data-1",
    nodeName: "Data",
    nodeType: "data",
    parameters,
    context: {
      trigger: context?.trigger ?? { type: "manual", data: {}, timestamp: new Date() },
      steps: context?.steps ?? {},
      env: {} as NodeExecutionParams["context"]["env"],
      ...context,
    },
  };
}

describe("setVariableExecutor", () => {
  describe("validation", () => {
    it("requires variables array", () => {
      const errors = setVariableExecutor.validate!({});
      expect(errors).toContain("Variables must be an array");
    });

    it("requires name for each variable", () => {
      const errors = setVariableExecutor.validate!({ variables: [{ value: "test" }] });
      expect(errors).toContain("Each variable must have a name");
    });

    it("passes with valid variables", () => {
      const errors = setVariableExecutor.validate!({ variables: [{ name: "foo", value: "bar" }] });
      expect(errors).toHaveLength(0);
    });
  });

  describe("execution", () => {
    it("sets simple variables", async () => {
      const result = await setVariableExecutor.execute(createParams({
        variables: [
          { name: "greeting", value: "hello" },
          { name: "count", value: 42 },
        ],
      }));

      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).variables).toEqual({
        greeting: "hello",
        count: 42,
      });
    });

    it("resolves variables from context", async () => {
      const result = await setVariableExecutor.execute(createParams(
        {
          variables: [{ name: "userName", value: "{{trigger.data.name}}" }],
        },
        {
          trigger: { type: "manual", timestamp: new Date(), data: { name: "Alice" } },
        }
      ));

      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).variables).toEqual({
        userName: "Alice",
      });
    });

    it("coerces types", async () => {
      const result = await setVariableExecutor.execute(createParams({
        variables: [
          { name: "num", value: "42", type: "number" },
          { name: "bool", value: "true", type: "boolean" },
          { name: "str", value: 123, type: "string" },
        ],
      }));

      expect(result.success).toBe(true);
      const vars = (result.data as Record<string, unknown>).variables as Record<string, unknown>;
      expect(vars.num).toBe(42);
      expect(vars.bool).toBe(true);
      expect(vars.str).toBe("123");
    });

    it("handles empty variables array", async () => {
      const result = await setVariableExecutor.execute(createParams({ variables: [] }));
      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).count).toBe(0);
    });
  });
});

describe("parseJsonExecutor", () => {
  describe("validation", () => {
    it("requires input or inputPath", () => {
      const errors = parseJsonExecutor.validate!({});
      expect(errors).toContain("Either input or inputPath is required");
    });

    it("passes with input", () => {
      const errors = parseJsonExecutor.validate!({ input: "{}" });
      expect(errors).toHaveLength(0);
    });
  });

  describe("execution", () => {
    it("parses valid JSON string", async () => {
      const result = await parseJsonExecutor.execute(createParams({
        input: '{"name": "John", "age": 30}',
      }));

      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).data).toEqual({ name: "John", age: 30 });
      expect((result.data as Record<string, unknown>).parsed).toBe(true);
    });

    it("parses JSON array", async () => {
      const result = await parseJsonExecutor.execute(createParams({
        input: '[1, 2, 3]',
      }));

      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).data).toEqual([1, 2, 3]);
    });

    it("returns error for invalid JSON", async () => {
      const result = await parseJsonExecutor.execute(createParams({
        input: "not valid json",
      }));

      expect(result.success).toBe(false);
      expect(result.error).toContain("Failed to parse JSON");
    });

    it("returns default value for invalid JSON when errorHandling is default", async () => {
      const result = await parseJsonExecutor.execute(createParams({
        input: "invalid",
        errorHandling: "default",
        defaultValue: { fallback: true },
      }));

      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).data).toEqual({ fallback: true });
      expect((result.data as Record<string, unknown>).parsed).toBe(false);
    });

    it("resolves input from path", async () => {
      const result = await parseJsonExecutor.execute(createParams(
        {
          inputPath: "steps.http-1.data.body",
        },
        {
          steps: {
            "http-1": { success: true, data: { body: '{"key": "value"}' } },
          },
        }
      ));

      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).data).toEqual({ key: "value" });
    });

    it("returns object as-is if already parsed", async () => {
      const result = await parseJsonExecutor.execute(createParams({
        input: { already: "parsed" },
      }));

      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).data).toEqual({ already: "parsed" });
      expect((result.data as Record<string, unknown>).reason).toBe("already_object");
    });
  });
});

describe("aggregateExecutor", () => {
  describe("validation", () => {
    it("requires items or itemsPath", () => {
      const errors = aggregateExecutor.validate!({ operations: [] });
      expect(errors).toContain("Either items or itemsPath is required");
    });

    it("requires at least one operation", () => {
      const errors = aggregateExecutor.validate!({ items: [] });
      expect(errors).toContain("At least one operation is required");
    });

    it("passes with valid params", () => {
      const errors = aggregateExecutor.validate!({
        items: [],
        operations: [{ operation: "count", outputName: "total" }],
      });
      expect(errors).toHaveLength(0);
    });
  });

  describe("execution", () => {
    const items = [
      { name: "A", value: 10, category: "x" },
      { name: "B", value: 20, category: "y" },
      { name: "C", value: 30, category: "x" },
      { name: "D", value: 40, category: "y" },
    ];

    it("counts items", async () => {
      const result = await aggregateExecutor.execute(createParams({
        items,
        operations: [{ operation: "count", outputName: "total" }],
      }));

      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).results).toEqual({ total: 4 });
    });

    it("sums values", async () => {
      const result = await aggregateExecutor.execute(createParams({
        items,
        operations: [{ operation: "sum", field: "value", outputName: "totalValue" }],
      }));

      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).results).toEqual({ totalValue: 100 });
    });

    it("calculates average", async () => {
      const result = await aggregateExecutor.execute(createParams({
        items,
        operations: [{ operation: "avg", field: "value", outputName: "avgValue" }],
      }));

      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).results).toEqual({ avgValue: 25 });
    });

    it("finds min and max", async () => {
      const result = await aggregateExecutor.execute(createParams({
        items,
        operations: [
          { operation: "min", field: "value", outputName: "minValue" },
          { operation: "max", field: "value", outputName: "maxValue" },
        ],
      }));

      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).results).toEqual({
        minValue: 10,
        maxValue: 40,
      });
    });

    it("gets first and last", async () => {
      const result = await aggregateExecutor.execute(createParams({
        items,
        operations: [
          { operation: "first", field: "name", outputName: "firstName" },
          { operation: "last", field: "name", outputName: "lastName" },
        ],
      }));

      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).results).toEqual({
        firstName: "A",
        lastName: "D",
      });
    });

    it("finds unique values", async () => {
      const result = await aggregateExecutor.execute(createParams({
        items,
        operations: [{ operation: "unique", field: "category", outputName: "categories" }],
      }));

      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).results).toEqual({
        categories: ["x", "y"],
      });
    });

    it("resolves items from path", async () => {
      const result = await aggregateExecutor.execute(createParams(
        {
          itemsPath: "steps.api.data.items",
          operations: [{ operation: "count", outputName: "total" }],
        },
        {
          steps: {
            api: { success: true, data: { items: [1, 2, 3] } },
          },
        }
      ));

      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).results).toEqual({ total: 3 });
    });
  });
});
