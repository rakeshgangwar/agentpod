import { describe, it, expect } from "vitest";
import { interpolateVariables, extractVariables, validateVariables } from "./variable-interpolator";
import type { ExecutionContext } from "./context";

function createMockContext(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
  return {
    trigger: {
      type: "manual",
      data: { userId: "user-123", payload: { name: "test" } },
      timestamp: new Date(),
    },
    steps: {
      "http-1": {
        success: true,
        data: { users: [{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }] },
      },
    },
    env: {} as ExecutionContext["env"],
    ...overrides,
  };
}

describe("interpolateVariables", () => {
  describe("trigger data interpolation", () => {
    it("should interpolate trigger.data fields", () => {
      const context = createMockContext();
      const result = interpolateVariables("User: {{trigger.data.userId}}", context);
      expect(result).toBe("User: user-123");
    });

    it("should interpolate nested trigger data", () => {
      const context = createMockContext();
      const result = interpolateVariables("Name: {{trigger.data.payload.name}}", context);
      expect(result).toBe("Name: test");
    });
  });

  describe("steps data interpolation", () => {
    it("should interpolate step results", () => {
      const context = createMockContext();
      const result = interpolateVariables("{{steps.http-1.data.users}}", context);
      expect(result).toBe(JSON.stringify([{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }]));
    });

    it("should interpolate array access in step data", () => {
      const context = createMockContext();
      const result = interpolateVariables("First user: {{steps.http-1.data.users[0].name}}", context);
      expect(result).toBe("First user: Alice");
    });
  });

  describe("loop variable interpolation", () => {
    it("should interpolate $item when in loop context", () => {
      const context = createMockContext({
        loop: {
          $item: { title: "My Article", id: 42 },
          $index: 0,
          $items: [{ title: "My Article", id: 42 }],
          loopNodeId: "loop-1",
        },
      });
      const result = interpolateVariables("Title: {{$item.title}}", context);
      expect(result).toBe("Title: My Article");
    });

    it("should interpolate $index when in loop context", () => {
      const context = createMockContext({
        loop: {
          $item: { title: "Article" },
          $index: 5,
          $items: [],
          loopNodeId: "loop-1",
        },
      });
      const result = interpolateVariables("Index: {{$index}}", context);
      expect(result).toBe("Index: 5");
    });

    it("should interpolate $items when in loop context", () => {
      const items = [{ id: 1 }, { id: 2 }, { id: 3 }];
      const context = createMockContext({
        loop: {
          $item: items[0],
          $index: 0,
          $items: items,
          loopNodeId: "loop-1",
        },
      });
      const result = interpolateVariables("Items: {{$items}}", context);
      expect(result).toBe(`Items: ${JSON.stringify(items)}`);
    });

    it("should interpolate $item with nested object access", () => {
      const context = createMockContext({
        loop: {
          $item: { user: { name: "Alice", email: "alice@example.com" } },
          $index: 0,
          $items: [],
          loopNodeId: "loop-1",
        },
      });
      const result = interpolateVariables("Email: {{$item.user.email}}", context);
      expect(result).toBe("Email: alice@example.com");
    });

    it("should interpolate $item with array access", () => {
      const context = createMockContext({
        loop: {
          $item: { tags: ["tech", "news", "ai"] },
          $index: 0,
          $items: [],
          loopNodeId: "loop-1",
        },
      });
      const result = interpolateVariables("First tag: {{$item.tags[0]}}", context);
      expect(result).toBe("First tag: tech");
    });

    it("should return original variable when not in loop context", () => {
      const context = createMockContext();
      const result = interpolateVariables("Title: {{$item.title}}", context);
      expect(result).toBe("Title: {{$item.title}}");
    });

    it("should handle multiple loop variables in same string", () => {
      const context = createMockContext({
        loop: {
          $item: { title: "Article", id: 123 },
          $index: 2,
          $items: [],
          loopNodeId: "loop-1",
        },
      });
      const result = interpolateVariables("Item #{{$index}}: {{$item.title}} (ID: {{$item.id}})", context);
      expect(result).toBe("Item #2: Article (ID: 123)");
    });

    it("should handle $item combined with trigger data", () => {
      const context = createMockContext({
        loop: {
          $item: { category: "tech" },
          $index: 0,
          $items: [],
          loopNodeId: "loop-1",
        },
      });
      const result = interpolateVariables(
        "User {{trigger.data.userId}} reading {{$item.category}}",
        context
      );
      expect(result).toBe("User user-123 reading tech");
    });
  });

  describe("object interpolation", () => {
    it("should interpolate loop variables in objects", () => {
      const context = createMockContext({
        loop: {
          $item: { title: "Test", url: "https://example.com" },
          $index: 0,
          $items: [],
          loopNodeId: "loop-1",
        },
      });
      const result = interpolateVariables(
        {
          name: "{{$item.title}}",
          link: "{{$item.url}}",
        },
        context
      );
      expect(result).toEqual({
        name: "Test",
        link: "https://example.com",
      });
    });

    it("should interpolate loop variables in arrays", () => {
      const context = createMockContext({
        loop: {
          $item: { a: "valueA", b: "valueB" },
          $index: 1,
          $items: [],
          loopNodeId: "loop-1",
        },
      });
      const result = interpolateVariables(["{{$item.a}}", "{{$item.b}}", "{{$index}}"], context);
      expect(result).toEqual(["valueA", "valueB", "1"]);
    });
  });
});

describe("extractVariables", () => {
  it("should extract loop variables", () => {
    const result = extractVariables("{{$item.title}} at index {{$index}}");
    expect(result).toContain("$item.title");
    expect(result).toContain("$index");
  });

  it("should extract mixed variables", () => {
    const result = extractVariables("User {{trigger.data.userId}} item {{$item.id}}");
    expect(result).toContain("trigger.data.userId");
    expect(result).toContain("$item.id");
  });
});

describe("validateVariables", () => {
  it("should report missing loop variables when not in loop context", () => {
    const context = createMockContext();
    const missing = validateVariables("{{$item.title}}", context);
    expect(missing).toContain("$item.title");
  });

  it("should not report missing loop variables when in loop context", () => {
    const context = createMockContext({
      loop: {
        $item: { title: "Test" },
        $index: 0,
        $items: [],
        loopNodeId: "loop-1",
      },
    });
    const missing = validateVariables("{{$item.title}}", context);
    expect(missing).toEqual([]);
  });
});
