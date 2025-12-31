import { describe, it, expect } from "vitest";
import { transformExecutor } from "./transform";
import type { NodeExecutionParams } from "../utils/context";

function createParams(parameters: Record<string, unknown>, context?: Partial<NodeExecutionParams["context"]>): NodeExecutionParams {
  return {
    nodeId: "transform-1",
    nodeName: "Transform",
    nodeType: "transform",
    parameters,
    context: {
      trigger: context?.trigger ?? { type: "manual", data: {}, timestamp: new Date() },
      steps: context?.steps ?? {},
      env: {} as NodeExecutionParams["context"]["env"],
      ...context,
    },
  };
}

describe("transformExecutor", () => {
  describe("validation", () => {
    it("requires input or inputPath", () => {
      const errors = transformExecutor.validate!({ mode: "map" });
      expect(errors).toContain("Either input or inputPath is required");
    });

    it("requires mode", () => {
      const errors = transformExecutor.validate!({ input: {} });
      expect(errors).toContain("Mode is required");
    });

    it("requires mapping for map mode", () => {
      const errors = transformExecutor.validate!({ input: {}, mode: "map" });
      expect(errors).toContain("Mapping is required for map/rename modes");
    });

    it("requires fields for pick mode", () => {
      const errors = transformExecutor.validate!({ input: {}, mode: "pick" });
      expect(errors).toContain("Fields is required for pick/omit modes");
    });

    it("passes validation with valid map params", () => {
      const errors = transformExecutor.validate!({ input: {}, mode: "map", mapping: [] });
      expect(errors).toHaveLength(0);
    });
  });

  describe("map mode", () => {
    it("transforms fields with mapping", async () => {
      const result = await transformExecutor.execute(createParams({
        input: { firstName: "John", lastName: "Doe", age: 30 },
        mode: "map",
        mapping: [
          { from: "firstName", to: "name.first" },
          { from: "lastName", to: "name.last" },
          { from: "age", to: "info.age" },
        ],
      }));

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        data: {
          name: { first: "John", last: "Doe" },
          info: { age: 30 },
        },
        mode: "map",
        fieldsTransformed: 3,
      });
    });

    it("applies transform functions", async () => {
      const result = await transformExecutor.execute(createParams({
        input: { name: "  John Doe  ", count: "42" },
        mode: "map",
        mapping: [
          { from: "name", to: "trimmedName", transform: "trim" },
          { from: "name", to: "upperName", transform: "uppercase" },
          { from: "count", to: "numericCount", transform: "number" },
        ],
      }));

      expect(result.success).toBe(true);
      const data = (result.data as Record<string, unknown>).data as Record<string, unknown>;
      expect(data.trimmedName).toBe("John Doe");
      expect(data.upperName).toBe("  JOHN DOE  ");
      expect(data.numericCount).toBe(42);
    });

    it("handles json transform", async () => {
      const result = await transformExecutor.execute(createParams({
        input: { jsonString: '{"key": "value"}' },
        mode: "map",
        mapping: [{ from: "jsonString", to: "parsed", transform: "json" }],
      }));

      expect(result.success).toBe(true);
      const data = (result.data as Record<string, unknown>).data as Record<string, unknown>;
      expect(data.parsed).toEqual({ key: "value" });
    });
  });

  describe("pick mode", () => {
    it("picks specified fields", async () => {
      const result = await transformExecutor.execute(createParams({
        input: { a: 1, b: 2, c: 3, d: 4 },
        mode: "pick",
        fields: ["a", "c"],
      }));

      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).data).toEqual({ a: 1, c: 3 });
    });

    it("picks nested fields", async () => {
      const result = await transformExecutor.execute(createParams({
        input: { user: { name: "John", email: "john@example.com", password: "secret" } },
        mode: "pick",
        fields: ["user.name", "user.email"],
      }));

      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).data).toEqual({
        user: { name: "John", email: "john@example.com" },
      });
    });
  });

  describe("omit mode", () => {
    it("omits specified fields", async () => {
      const result = await transformExecutor.execute(createParams({
        input: { a: 1, b: 2, c: 3, d: 4 },
        mode: "omit",
        fields: ["b", "d"],
      }));

      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).data).toEqual({ a: 1, c: 3 });
    });

    it("omits nested fields", async () => {
      const result = await transformExecutor.execute(createParams({
        input: { user: { name: "John", password: "secret" }, meta: { id: 1 } },
        mode: "omit",
        fields: ["user.password"],
      }));

      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).data).toEqual({
        user: { name: "John" },
        meta: { id: 1 },
      });
    });
  });

  describe("rename mode", () => {
    it("renames fields with mapping", async () => {
      const result = await transformExecutor.execute(createParams({
        input: { old_name: "value", keep: "this" },
        mode: "rename",
        mapping: [{ from: "old_name", to: "newName" }],
      }));

      expect(result.success).toBe(true);
      const data = (result.data as Record<string, unknown>).data as Record<string, unknown>;
      expect(data.newName).toBe("value");
      expect(data.keep).toBe("this");
    });

    it("applies transform during rename", async () => {
      const result = await transformExecutor.execute(createParams({
        input: { name: "john" },
        mode: "rename",
        mapping: [{ from: "name", to: "NAME", transform: "uppercase" }],
      }));

      expect(result.success).toBe(true);
      const data = (result.data as Record<string, unknown>).data as Record<string, unknown>;
      expect(data.NAME).toBe("JOHN");
    });
  });

  describe("flatten mode", () => {
    it("flattens nested object", async () => {
      const result = await transformExecutor.execute(createParams({
        input: { user: { name: "John", address: { city: "NYC" } } },
        mode: "flatten",
      }));

      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).data).toEqual({
        "user.name": "John",
        "user.address.city": "NYC",
      });
    });

    it("uses custom separator", async () => {
      const result = await transformExecutor.execute(createParams({
        input: { a: { b: 1 } },
        mode: "flatten",
        separator: "_",
      }));

      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).data).toEqual({
        "a_b": 1,
      });
    });
  });

  describe("unflatten mode", () => {
    it("unflattens flat object", async () => {
      const result = await transformExecutor.execute(createParams({
        input: { "user.name": "John", "user.address.city": "NYC" },
        mode: "unflatten",
      }));

      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).data).toEqual({
        user: { name: "John", address: { city: "NYC" } },
      });
    });

    it("uses custom separator", async () => {
      const result = await transformExecutor.execute(createParams({
        input: { "a_b": 1 },
        mode: "unflatten",
        separator: "_",
      }));

      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).data).toEqual({
        a: { b: 1 },
      });
    });

    it("returns error for non-object input", async () => {
      const result = await transformExecutor.execute(createParams({
        input: [1, 2, 3],
        mode: "unflatten",
      }));

      expect(result.success).toBe(false);
      expect(result.error).toContain("Input must be a flat object");
    });
  });

  describe("inputPath resolution", () => {
    it("resolves from trigger.data", async () => {
      const result = await transformExecutor.execute(createParams(
        {
          inputPath: "trigger.data.payload",
          mode: "pick",
          fields: ["name"],
        },
        {
          trigger: { type: "manual", timestamp: new Date(), data: { payload: { name: "John", secret: "xxx" } } },
        }
      ));

      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).data).toEqual({ name: "John" });
    });

    it("resolves from steps", async () => {
      const result = await transformExecutor.execute(createParams(
        {
          inputPath: "steps.http-1.data.response",
          mode: "map",
          mapping: [{ from: "id", to: "userId" }],
        },
        {
          steps: {
            "http-1": { success: true, data: { response: { id: 123, other: "data" } } },
          },
        }
      ));

      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).data).toEqual({ userId: 123 });
    });

    it("returns error when inputPath cannot be resolved", async () => {
      const result = await transformExecutor.execute(createParams({
        inputPath: "nonexistent.path",
        mode: "map",
        mapping: [],
      }));

      expect(result.success).toBe(false);
      expect(result.error).toContain("Could not resolve input");
    });
  });
});
