import { describe, it, expect } from "vitest";
import { shouldSkipNode } from "./executor";
import type { ExecutionContext, WorkflowNode, WorkflowConnections } from "./utils/context";

function createMockContext(steps: Record<string, { success: boolean; data?: unknown }>): ExecutionContext {
  return {
    trigger: {
      type: "manual",
      data: {},
      timestamp: new Date(),
    },
    steps,
    env: {} as ExecutionContext["env"],
  };
}

describe("shouldSkipNode", () => {
  describe("non-conditional predecessors", () => {
    it("should not skip when predecessor is not a condition/switch", () => {
      const nodes: WorkflowNode[] = [
        { id: "http-1", name: "HTTP", type: "http-request", position: [0, 0], parameters: {} },
        { id: "js-1", name: "JS", type: "javascript", position: [0, 0], parameters: {} },
      ];
      const connections: WorkflowConnections = {
        "http-1": { main: [[{ node: "js-1", type: "main", index: 0 }]] },
      };
      const context = createMockContext({
        "http-1": { success: true, data: { status: 200 } },
      });

      const result = shouldSkipNode("js-1", nodes, connections, context);

      expect(result.skip).toBe(false);
    });
  });

  describe("condition node with single connection", () => {
    it("should not skip when connection matches taken branch", () => {
      const nodes: WorkflowNode[] = [
        { id: "condition-1", name: "Condition", type: "condition", position: [0, 0], parameters: {} },
        { id: "js-1", name: "JS True", type: "javascript", position: [0, 0], parameters: {} },
      ];
      const connections: WorkflowConnections = {
        "condition-1": { main: [[{ node: "js-1", type: "true", index: 0 }]] },
      };
      const context = createMockContext({
        "condition-1": { success: true, data: { branch: "true" } },
      });

      const result = shouldSkipNode("js-1", nodes, connections, context);

      expect(result.skip).toBe(false);
    });

    it("should skip when connection does not match taken branch", () => {
      const nodes: WorkflowNode[] = [
        { id: "condition-1", name: "Condition", type: "condition", position: [0, 0], parameters: {} },
        { id: "js-1", name: "JS True", type: "javascript", position: [0, 0], parameters: {} },
      ];
      const connections: WorkflowConnections = {
        "condition-1": { main: [[{ node: "js-1", type: "true", index: 0 }]] },
      };
      const context = createMockContext({
        "condition-1": { success: true, data: { branch: "false" } },
      });

      const result = shouldSkipNode("js-1", nodes, connections, context);

      expect(result.skip).toBe(true);
      expect(result.reason).toContain("No connection matches branch 'false'");
      expect(result.reason).toContain("checked: true");
    });
  });

  describe("condition node with true/false branches", () => {
    it("should skip false branch when true is taken", () => {
      const nodes: WorkflowNode[] = [
        { id: "condition-1", name: "Condition", type: "condition", position: [0, 0], parameters: {} },
        { id: "js-true", name: "JS True", type: "javascript", position: [0, 0], parameters: {} },
        { id: "js-false", name: "JS False", type: "javascript", position: [0, 0], parameters: {} },
      ];
      const connections: WorkflowConnections = {
        "condition-1": {
          main: [
            [{ node: "js-true", type: "true", index: 0 }],
            [{ node: "js-false", type: "false", index: 0 }],
          ],
        },
      };
      const context = createMockContext({
        "condition-1": { success: true, data: { branch: "true" } },
      });

      const trueResult = shouldSkipNode("js-true", nodes, connections, context);
      const falseResult = shouldSkipNode("js-false", nodes, connections, context);

      expect(trueResult.skip).toBe(false);
      expect(falseResult.skip).toBe(true);
    });

    it("should skip true branch when false is taken", () => {
      const nodes: WorkflowNode[] = [
        { id: "condition-1", name: "Condition", type: "condition", position: [0, 0], parameters: {} },
        { id: "js-true", name: "JS True", type: "javascript", position: [0, 0], parameters: {} },
        { id: "js-false", name: "JS False", type: "javascript", position: [0, 0], parameters: {} },
      ];
      const connections: WorkflowConnections = {
        "condition-1": {
          main: [
            [{ node: "js-true", type: "true", index: 0 }],
            [{ node: "js-false", type: "false", index: 0 }],
          ],
        },
      };
      const context = createMockContext({
        "condition-1": { success: true, data: { branch: "false" } },
      });

      const trueResult = shouldSkipNode("js-true", nodes, connections, context);
      const falseResult = shouldSkipNode("js-false", nodes, connections, context);

      expect(trueResult.skip).toBe(true);
      expect(falseResult.skip).toBe(false);
    });
  });

  describe("switch node with multiple branches", () => {
    it("should only execute matching branch", () => {
      const nodes: WorkflowNode[] = [
        { id: "switch-1", name: "Switch", type: "switch", position: [0, 0], parameters: {} },
        { id: "js-tech", name: "Tech", type: "javascript", position: [0, 0], parameters: {} },
        { id: "js-business", name: "Business", type: "javascript", position: [0, 0], parameters: {} },
        { id: "js-other", name: "Other", type: "javascript", position: [0, 0], parameters: {} },
      ];
      const connections: WorkflowConnections = {
        "switch-1": {
          main: [
            [{ node: "js-tech", type: "tech", index: 0 }],
            [{ node: "js-business", type: "business", index: 0 }],
            [{ node: "js-other", type: "other", index: 0 }],
          ],
        },
      };
      const context = createMockContext({
        "switch-1": { success: true, data: { branch: "business" } },
      });

      const techResult = shouldSkipNode("js-tech", nodes, connections, context);
      const businessResult = shouldSkipNode("js-business", nodes, connections, context);
      const otherResult = shouldSkipNode("js-other", nodes, connections, context);

      expect(techResult.skip).toBe(true);
      expect(businessResult.skip).toBe(false);
      expect(otherResult.skip).toBe(true);
    });

    it("should execute default branch when no case matches", () => {
      const nodes: WorkflowNode[] = [
        { id: "switch-1", name: "Switch", type: "switch", position: [0, 0], parameters: {} },
        { id: "js-tech", name: "Tech", type: "javascript", position: [0, 0], parameters: {} },
        { id: "js-other", name: "Other", type: "javascript", position: [0, 0], parameters: {} },
      ];
      const connections: WorkflowConnections = {
        "switch-1": {
          main: [
            [{ node: "js-tech", type: "tech", index: 0 }],
            [{ node: "js-other", type: "other", index: 0 }],
          ],
        },
      };
      const context = createMockContext({
        "switch-1": { success: true, data: { branch: "other" } },
      });

      const techResult = shouldSkipNode("js-tech", nodes, connections, context);
      const otherResult = shouldSkipNode("js-other", nodes, connections, context);

      expect(techResult.skip).toBe(true);
      expect(otherResult.skip).toBe(false);
    });
  });

  describe("multi-connection from same source (bug fix test)", () => {
    it("should NOT skip when node has multiple connections and ONE matches", () => {
      const nodes: WorkflowNode[] = [
        { id: "switch-1", name: "Switch", type: "switch", position: [0, 0], parameters: {} },
        { id: "js-handler", name: "Handler", type: "javascript", position: [0, 0], parameters: {} },
      ];
      const connections: WorkflowConnections = {
        "switch-1": {
          main: [
            [{ node: "js-handler", type: "lifestyle", index: 0 }],
            [{ node: "js-handler", type: "other", index: 0 }],
          ],
        },
      };
      const context = createMockContext({
        "switch-1": { success: true, data: { branch: "other" } },
      });

      const result = shouldSkipNode("js-handler", nodes, connections, context);

      expect(result.skip).toBe(false);
    });

    it("should NOT skip when first connection doesn't match but second does", () => {
      const nodes: WorkflowNode[] = [
        { id: "switch-1", name: "Switch", type: "switch", position: [0, 0], parameters: {} },
        { id: "js-handler", name: "Handler", type: "javascript", position: [0, 0], parameters: {} },
      ];
      const connections: WorkflowConnections = {
        "switch-1": {
          main: [
            [{ node: "js-handler", type: "tech", index: 0 }],
            [{ node: "js-handler", type: "business", index: 0 }],
            [{ node: "js-handler", type: "lifestyle", index: 0 }],
          ],
        },
      };
      const context = createMockContext({
        "switch-1": { success: true, data: { branch: "lifestyle" } },
      });

      const result = shouldSkipNode("js-handler", nodes, connections, context);

      expect(result.skip).toBe(false);
    });

    it("should skip when node has multiple connections but NONE match", () => {
      const nodes: WorkflowNode[] = [
        { id: "switch-1", name: "Switch", type: "switch", position: [0, 0], parameters: {} },
        { id: "js-handler", name: "Handler", type: "javascript", position: [0, 0], parameters: {} },
      ];
      const connections: WorkflowConnections = {
        "switch-1": {
          main: [
            [{ node: "js-handler", type: "tech", index: 0 }],
            [{ node: "js-handler", type: "business", index: 0 }],
          ],
        },
      };
      const context = createMockContext({
        "switch-1": { success: true, data: { branch: "other" } },
      });

      const result = shouldSkipNode("js-handler", nodes, connections, context);

      expect(result.skip).toBe(true);
      expect(result.reason).toContain("No connection matches branch 'other'");
      expect(result.reason).toContain("tech");
      expect(result.reason).toContain("business");
    });
  });

  describe("multiple conditional sources", () => {
    it("should require all conditional sources to have a matching connection", () => {
      const nodes: WorkflowNode[] = [
        { id: "condition-1", name: "Condition 1", type: "condition", position: [0, 0], parameters: {} },
        { id: "condition-2", name: "Condition 2", type: "condition", position: [0, 0], parameters: {} },
        { id: "merge", name: "Merge", type: "merge", position: [0, 0], parameters: {} },
      ];
      const connections: WorkflowConnections = {
        "condition-1": { main: [[{ node: "merge", type: "true", index: 0 }]] },
        "condition-2": { main: [[{ node: "merge", type: "true", index: 0 }]] },
      };
      const context = createMockContext({
        "condition-1": { success: true, data: { branch: "true" } },
        "condition-2": { success: true, data: { branch: "true" } },
      });

      const result = shouldSkipNode("merge", nodes, connections, context);

      expect(result.skip).toBe(false);
    });

    it("should skip if any conditional source has no matching connection", () => {
      const nodes: WorkflowNode[] = [
        { id: "condition-1", name: "Condition 1", type: "condition", position: [0, 0], parameters: {} },
        { id: "condition-2", name: "Condition 2", type: "condition", position: [0, 0], parameters: {} },
        { id: "merge", name: "Merge", type: "merge", position: [0, 0], parameters: {} },
      ];
      const connections: WorkflowConnections = {
        "condition-1": { main: [[{ node: "merge", type: "true", index: 0 }]] },
        "condition-2": { main: [[{ node: "merge", type: "true", index: 0 }]] },
      };
      const context = createMockContext({
        "condition-1": { success: true, data: { branch: "true" } },
        "condition-2": { success: true, data: { branch: "false" } },
      });

      const result = shouldSkipNode("merge", nodes, connections, context);

      expect(result.skip).toBe(true);
      expect(result.reason).toContain("condition-2");
    });
  });

  describe("edge cases", () => {
    it("should not skip when source node not found", () => {
      const nodes: WorkflowNode[] = [
        { id: "js-1", name: "JS", type: "javascript", position: [0, 0], parameters: {} },
      ];
      const connections: WorkflowConnections = {
        "missing-node": { main: [[{ node: "js-1", type: "main", index: 0 }]] },
      };
      const context = createMockContext({});

      const result = shouldSkipNode("js-1", nodes, connections, context);

      expect(result.skip).toBe(false);
    });

    it("should not skip when source result is not successful", () => {
      const nodes: WorkflowNode[] = [
        { id: "condition-1", name: "Condition", type: "condition", position: [0, 0], parameters: {} },
        { id: "js-1", name: "JS", type: "javascript", position: [0, 0], parameters: {} },
      ];
      const connections: WorkflowConnections = {
        "condition-1": { main: [[{ node: "js-1", type: "true", index: 0 }]] },
      };
      const context = createMockContext({
        "condition-1": { success: false },
      });

      const result = shouldSkipNode("js-1", nodes, connections, context);

      expect(result.skip).toBe(false);
    });

    it("should not skip when source result has no branch", () => {
      const nodes: WorkflowNode[] = [
        { id: "condition-1", name: "Condition", type: "condition", position: [0, 0], parameters: {} },
        { id: "js-1", name: "JS", type: "javascript", position: [0, 0], parameters: {} },
      ];
      const connections: WorkflowConnections = {
        "condition-1": { main: [[{ node: "js-1", type: "true", index: 0 }]] },
      };
      const context = createMockContext({
        "condition-1": { success: true, data: {} },
      });

      const result = shouldSkipNode("js-1", nodes, connections, context);

      expect(result.skip).toBe(false);
    });

    it("should handle empty connections", () => {
      const nodes: WorkflowNode[] = [
        { id: "js-1", name: "JS", type: "javascript", position: [0, 0], parameters: {} },
      ];
      const connections: WorkflowConnections = {};
      const context = createMockContext({});

      const result = shouldSkipNode("js-1", nodes, connections, context);

      expect(result.skip).toBe(false);
    });
  });
});
