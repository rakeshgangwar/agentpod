import { describe, it, expect } from "vitest";
import { filterExecutor } from "./filter";
import type { NodeExecutionParams } from "../utils/context";

function createParams(parameters: Record<string, unknown>, context?: Partial<NodeExecutionParams["context"]>): NodeExecutionParams {
  return {
    nodeId: "filter-1",
    nodeName: "Filter",
    nodeType: "filter",
    parameters,
    context: {
      trigger: context?.trigger ?? { type: "manual", data: {}, timestamp: new Date() },
      steps: context?.steps ?? {},
      env: {} as NodeExecutionParams["context"]["env"],
      ...context,
    },
  };
}

describe("filterExecutor", () => {
  describe("validation", () => {
    it("requires items or itemsPath", () => {
      const errors = filterExecutor.validate!({ conditions: [] });
      expect(errors).toContain("Either items or itemsPath is required");
    });

    it("requires conditions to be an array", () => {
      const errors = filterExecutor.validate!({ items: [], conditions: "invalid" });
      expect(errors).toContain("Conditions must be an array");
    });

    it("passes validation with valid params", () => {
      const errors = filterExecutor.validate!({ items: [], conditions: [] });
      expect(errors).toHaveLength(0);
    });
  });

  describe("execution with direct items", () => {
    it("returns all items when no conditions", async () => {
      const items = [{ name: "a" }, { name: "b" }, { name: "c" }];
      const result = await filterExecutor.execute(createParams({
        items,
        conditions: [],
      }));

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        items,
        originalCount: 3,
        filteredCount: 3,
        rejectedCount: 0,
      });
    });

    it("filters items with equals condition", async () => {
      const items = [{ status: "active" }, { status: "inactive" }, { status: "active" }];
      const result = await filterExecutor.execute(createParams({
        items,
        conditions: [{ field: "status", operator: "equals", value: "active" }],
      }));

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        items: [{ status: "active" }, { status: "active" }],
        filteredCount: 2,
        rejectedCount: 1,
      });
    });

    it("filters items with notEquals condition", async () => {
      const items = [{ type: "A" }, { type: "B" }, { type: "A" }];
      const result = await filterExecutor.execute(createParams({
        items,
        conditions: [{ field: "type", operator: "notEquals", value: "A" }],
      }));

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        items: [{ type: "B" }],
        filteredCount: 1,
      });
    });

    it("filters items with contains condition", async () => {
      const items = [{ name: "hello world" }, { name: "goodbye" }, { name: "hello there" }];
      const result = await filterExecutor.execute(createParams({
        items,
        conditions: [{ field: "name", operator: "contains", value: "hello" }],
      }));

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        filteredCount: 2,
      });
    });

    it("filters items with greaterThan condition", async () => {
      const items = [{ age: 25 }, { age: 30 }, { age: 20 }];
      const result = await filterExecutor.execute(createParams({
        items,
        conditions: [{ field: "age", operator: "greaterThan", value: 24 }],
      }));

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        items: [{ age: 25 }, { age: 30 }],
        filteredCount: 2,
      });
    });

    it("filters items with lessThanOrEqual condition", async () => {
      const items = [{ score: 100 }, { score: 50 }, { score: 75 }];
      const result = await filterExecutor.execute(createParams({
        items,
        conditions: [{ field: "score", operator: "lessThanOrEqual", value: 75 }],
      }));

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        filteredCount: 2,
      });
    });

    it("filters items with isEmpty condition", async () => {
      const items = [{ tags: [] }, { tags: ["a"] }, { tags: null }];
      const result = await filterExecutor.execute(createParams({
        items,
        conditions: [{ field: "tags", operator: "isEmpty" }],
      }));

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        filteredCount: 2,
      });
    });

    it("filters items with isTrue condition", async () => {
      const items = [{ active: true }, { active: false }, { active: true }];
      const result = await filterExecutor.execute(createParams({
        items,
        conditions: [{ field: "active", operator: "isTrue" }],
      }));

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        filteredCount: 2,
      });
    });

    it("filters items with regex condition", async () => {
      const items = [{ email: "test@example.com" }, { email: "invalid" }, { email: "user@domain.org" }];
      const result = await filterExecutor.execute(createParams({
        items,
        conditions: [{ field: "email", operator: "regex", value: "^[^@]+@[^@]+\\.[^@]+$" }],
      }));

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        filteredCount: 2,
      });
    });

    it("filters items with startsWith condition", async () => {
      const items = [{ code: "US-123" }, { code: "UK-456" }, { code: "US-789" }];
      const result = await filterExecutor.execute(createParams({
        items,
        conditions: [{ field: "code", operator: "startsWith", value: "US" }],
      }));

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        filteredCount: 2,
      });
    });
  });

  describe("multiple conditions", () => {
    it("filters with mode=all (AND logic)", async () => {
      const items = [
        { age: 30, status: "active" },
        { age: 25, status: "active" },
        { age: 30, status: "inactive" },
      ];
      const result = await filterExecutor.execute(createParams({
        items,
        conditions: [
          { field: "age", operator: "greaterThanOrEqual", value: 30 },
          { field: "status", operator: "equals", value: "active" },
        ],
        mode: "all",
      }));

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        filteredCount: 1,
      });
    });

    it("filters with mode=any (OR logic)", async () => {
      const items = [
        { type: "A", priority: 1 },
        { type: "B", priority: 2 },
        { type: "C", priority: 3 },
      ];
      const result = await filterExecutor.execute(createParams({
        items,
        conditions: [
          { field: "type", operator: "equals", value: "A" },
          { field: "priority", operator: "greaterThan", value: 2 },
        ],
        mode: "any",
      }));

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        filteredCount: 2,
      });
    });
  });

  describe("execution with itemsPath", () => {
    it("resolves items from trigger.data", async () => {
      const result = await filterExecutor.execute(createParams(
        {
          itemsPath: "trigger.data.users",
          conditions: [{ field: "active", operator: "isTrue" }],
        },
        {
          trigger: { type: "manual", timestamp: new Date(), data: { users: [{ active: true }, { active: false }] } },
        }
      ));

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        filteredCount: 1,
      });
    });

    it("resolves items from steps", async () => {
      const result = await filterExecutor.execute(createParams(
        {
          itemsPath: "steps.http-1.data.items",
          conditions: [{ field: "status", operator: "equals", value: "ok" }],
        },
        {
          steps: {
            "http-1": {
              success: true,
              data: { items: [{ status: "ok" }, { status: "error" }, { status: "ok" }] },
            },
          },
        }
      ));

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        filteredCount: 2,
      });
    });

    it("returns error when itemsPath resolves to non-array", async () => {
      const result = await filterExecutor.execute(createParams(
        {
          itemsPath: "trigger.data.notAnArray",
          conditions: [],
        },
        {
          trigger: { type: "manual", timestamp: new Date(), data: { notAnArray: "string" } },
        }
      ));

      expect(result.success).toBe(false);
      expect(result.error).toContain("Could not resolve items array");
    });
  });

  describe("nested field access", () => {
    it("filters using nested field paths", async () => {
      const items = [
        { user: { profile: { verified: true } } },
        { user: { profile: { verified: false } } },
      ];
      const result = await filterExecutor.execute(createParams({
        items,
        conditions: [{ field: "user.profile.verified", operator: "isTrue" }],
      }));

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        filteredCount: 1,
      });
    });

    it("handles missing nested fields gracefully", async () => {
      const items = [
        { user: { name: "Alice" } },
        { user: null },
        { other: "data" },
      ];
      const result = await filterExecutor.execute(createParams({
        items,
        conditions: [{ field: "user.name", operator: "isNotEmpty" }],
      }));

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        filteredCount: 1,
      });
    });
  });

  describe("rejected items", () => {
    it("returns rejected items separately", async () => {
      const items = [{ keep: true }, { keep: false }, { keep: true }];
      const result = await filterExecutor.execute(createParams({
        items,
        conditions: [{ field: "keep", operator: "isTrue" }],
      }));

      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).rejected).toEqual([{ keep: false }]);
    });
  });
});
