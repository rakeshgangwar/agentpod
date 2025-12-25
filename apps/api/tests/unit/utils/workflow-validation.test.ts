import { describe, test, expect } from "bun:test";
import {
  validateWorkflow,
  validateNodes,
  validateConnections,
  findUnreachableNodes,
  detectCycles,
} from "../../../src/utils/workflow-validation";
import type { INode, IConnections } from "@agentpod/types";

const createNode = (
  overrides: Partial<INode> & { id: string; type: INode["type"] }
): INode => ({
  name: overrides.name || overrides.id,
  position: [0, 0],
  parameters: {},
  ...overrides,
});

describe("Workflow Validation Utilities", () => {
  describe("validateWorkflow", () => {
    test("should pass for valid workflow with trigger", () => {
      const nodes: INode[] = [
        createNode({ id: "1", type: "manual-trigger", name: "Start" }),
        createNode({ id: "2", type: "http-request", name: "API Call" }),
      ];
      const connections: IConnections = {
        Start: { main: [[{ node: "API Call", type: "main", index: 0 }]] },
      };

      const result = validateWorkflow("Test Workflow", nodes, connections);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test("should fail if workflow name is empty", () => {
      const nodes: INode[] = [
        createNode({ id: "1", type: "manual-trigger" }),
      ];

      const result = validateWorkflow("", nodes, {});

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.message.includes("name"))).toBe(true);
    });

    test("should fail if no trigger node exists", () => {
      const nodes: INode[] = [
        createNode({ id: "1", type: "http-request" }),
        createNode({ id: "2", type: "ai-agent" }),
      ];

      const result = validateWorkflow("No Trigger", nodes, {});

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.message.includes("trigger"))).toBe(true);
    });

    test("should pass with webhook trigger", () => {
      const nodes: INode[] = [
        createNode({ id: "1", type: "webhook-trigger" }),
      ];

      const result = validateWorkflow("Webhook Workflow", nodes, {});

      expect(result.valid).toBe(true);
    });

    test("should pass with schedule trigger", () => {
      const nodes: INode[] = [
        createNode({ id: "1", type: "schedule-trigger" }),
      ];

      const result = validateWorkflow("Scheduled Workflow", nodes, {});

      expect(result.valid).toBe(true);
    });

    test("should pass with event trigger", () => {
      const nodes: INode[] = [
        createNode({ id: "1", type: "event-trigger" }),
      ];

      const result = validateWorkflow("Event Workflow", nodes, {});

      expect(result.valid).toBe(true);
    });

    test("should fail with empty nodes array", () => {
      const result = validateWorkflow("Empty", [], {});

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.message.includes("node"))).toBe(true);
    });

    test("should aggregate errors from node and connection validation", () => {
      const nodes: INode[] = [
        createNode({ id: "1", type: "manual-trigger", name: "Trigger" }),
        createNode({ id: "1", type: "http-request", name: "Duplicate ID" }),
      ];
      const connections: IConnections = {
        Trigger: { main: [[{ node: "NonExistent", type: "main", index: 0 }]] },
      };

      const result = validateWorkflow("Aggregated Errors", nodes, connections);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });
  });

  describe("validateNodes", () => {
    test("should pass for valid nodes", () => {
      const nodes: INode[] = [
        createNode({ id: "1", type: "manual-trigger", name: "Trigger" }),
        createNode({ id: "2", type: "http-request", name: "Request" }),
      ];

      const result = validateNodes(nodes);

      expect(result.errors).toHaveLength(0);
    });

    test("should fail for duplicate node IDs", () => {
      const nodes: INode[] = [
        createNode({ id: "same-id", type: "manual-trigger", name: "First" }),
        createNode({ id: "same-id", type: "http-request", name: "Second" }),
      ];

      const result = validateNodes(nodes);

      expect(result.errors.some((e) => e.message.includes("Duplicate"))).toBe(true);
      expect(result.errors.some((e) => e.nodeId === "same-id")).toBe(true);
    });

    test("should fail for duplicate node names", () => {
      const nodes: INode[] = [
        createNode({ id: "1", type: "manual-trigger", name: "Same Name" }),
        createNode({ id: "2", type: "http-request", name: "Same Name" }),
      ];

      const result = validateNodes(nodes);

      expect(result.errors.some((e) => e.message.includes("name"))).toBe(true);
    });

    test("should fail for empty node name", () => {
      const nodes: INode[] = [
        createNode({ id: "1", type: "manual-trigger", name: "" }),
      ];

      const result = validateNodes(nodes);

      expect(result.errors.some((e) => e.message.includes("name"))).toBe(true);
    });

    test("should fail for empty node ID", () => {
      const nodes: INode[] = [
        createNode({ id: "", type: "manual-trigger", name: "Trigger" }),
      ];

      const result = validateNodes(nodes);

      expect(result.errors.some((e) => e.message.includes("ID"))).toBe(true);
    });

    test("should warn for disabled nodes", () => {
      const nodes: INode[] = [
        createNode({ id: "1", type: "manual-trigger", disabled: true }),
      ];

      const result = validateNodes(nodes);

      expect(result.warnings.some((w) => w.message.includes("disabled"))).toBe(true);
    });
  });

  describe("validateConnections", () => {
    test("should pass for valid connections", () => {
      const nodes: INode[] = [
        createNode({ id: "1", type: "manual-trigger", name: "Trigger" }),
        createNode({ id: "2", type: "http-request", name: "Request" }),
      ];
      const connections: IConnections = {
        Trigger: { main: [[{ node: "Request", type: "main", index: 0 }]] },
      };

      const result = validateConnections(nodes, connections);

      expect(result.errors).toHaveLength(0);
    });

    test("should fail for connection from non-existent source", () => {
      const nodes: INode[] = [
        createNode({ id: "1", type: "http-request", name: "Request" }),
      ];
      const connections: IConnections = {
        NonExistent: { main: [[{ node: "Request", type: "main", index: 0 }]] },
      };

      const result = validateConnections(nodes, connections);

      expect(result.errors.some((e) => e.message.includes("NonExistent"))).toBe(true);
    });

    test("should fail for connection to non-existent target", () => {
      const nodes: INode[] = [
        createNode({ id: "1", type: "manual-trigger", name: "Trigger" }),
      ];
      const connections: IConnections = {
        Trigger: { main: [[{ node: "NonExistent", type: "main", index: 0 }]] },
      };

      const result = validateConnections(nodes, connections);

      expect(result.errors.some((e) => e.message.includes("NonExistent"))).toBe(true);
    });

    test("should fail for self-referencing connection", () => {
      const nodes: INode[] = [
        createNode({ id: "1", type: "loop", name: "Loop" }),
      ];
      const connections: IConnections = {
        Loop: { main: [[{ node: "Loop", type: "main", index: 0 }]] },
      };

      const result = validateConnections(nodes, connections);

      expect(result.errors.some((e) => e.message.includes("self"))).toBe(true);
    });

    test("should pass for empty connections", () => {
      const nodes: INode[] = [
        createNode({ id: "1", type: "manual-trigger", name: "Trigger" }),
      ];

      const result = validateConnections(nodes, {});

      expect(result.errors).toHaveLength(0);
    });
  });

  describe("findUnreachableNodes", () => {
    test("should return empty for fully connected workflow", () => {
      const nodes: INode[] = [
        createNode({ id: "1", type: "manual-trigger", name: "Trigger" }),
        createNode({ id: "2", type: "http-request", name: "Request" }),
        createNode({ id: "3", type: "notification", name: "Notify" }),
      ];
      const connections: IConnections = {
        Trigger: { main: [[{ node: "Request", type: "main", index: 0 }]] },
        Request: { main: [[{ node: "Notify", type: "main", index: 0 }]] },
      };

      const unreachable = findUnreachableNodes(nodes, connections);

      expect(unreachable).toHaveLength(0);
    });

    test("should find orphan nodes not connected to trigger", () => {
      const nodes: INode[] = [
        createNode({ id: "1", type: "manual-trigger", name: "Trigger" }),
        createNode({ id: "2", type: "http-request", name: "Connected" }),
        createNode({ id: "3", type: "notification", name: "Orphan" }),
      ];
      const connections: IConnections = {
        Trigger: { main: [[{ node: "Connected", type: "main", index: 0 }]] },
      };

      const unreachable = findUnreachableNodes(nodes, connections);

      expect(unreachable).toContain("3");
      expect(unreachable).not.toContain("1");
      expect(unreachable).not.toContain("2");
    });

    test("should not flag trigger nodes as unreachable", () => {
      const nodes: INode[] = [
        createNode({ id: "1", type: "manual-trigger", name: "Trigger" }),
      ];

      const unreachable = findUnreachableNodes(nodes, {});

      expect(unreachable).toHaveLength(0);
    });

    test("should handle multiple triggers", () => {
      const nodes: INode[] = [
        createNode({ id: "1", type: "manual-trigger", name: "Manual" }),
        createNode({ id: "2", type: "webhook-trigger", name: "Webhook" }),
        createNode({ id: "3", type: "http-request", name: "Request" }),
      ];
      const connections: IConnections = {
        Manual: { main: [[{ node: "Request", type: "main", index: 0 }]] },
        Webhook: { main: [[{ node: "Request", type: "main", index: 0 }]] },
      };

      const unreachable = findUnreachableNodes(nodes, connections);

      expect(unreachable).toHaveLength(0);
    });

    test("should find disconnected subgraph", () => {
      const nodes: INode[] = [
        createNode({ id: "1", type: "manual-trigger", name: "Trigger" }),
        createNode({ id: "2", type: "http-request", name: "A" }),
        createNode({ id: "3", type: "http-request", name: "B" }),
        createNode({ id: "4", type: "http-request", name: "C" }),
      ];
      const connections: IConnections = {
        Trigger: { main: [[{ node: "A", type: "main", index: 0 }]] },
        B: { main: [[{ node: "C", type: "main", index: 0 }]] },
      };

      const unreachable = findUnreachableNodes(nodes, connections);

      expect(unreachable).toContain("3");
      expect(unreachable).toContain("4");
    });
  });

  describe("detectCycles", () => {
    test("should return empty for acyclic workflow", () => {
      const nodes: INode[] = [
        createNode({ id: "1", type: "manual-trigger", name: "Trigger" }),
        createNode({ id: "2", type: "http-request", name: "A" }),
        createNode({ id: "3", type: "http-request", name: "B" }),
      ];
      const connections: IConnections = {
        Trigger: { main: [[{ node: "A", type: "main", index: 0 }]] },
        A: { main: [[{ node: "B", type: "main", index: 0 }]] },
      };

      const cycles = detectCycles(nodes, connections);

      expect(cycles).toHaveLength(0);
    });

    test("should detect simple cycle", () => {
      const nodes: INode[] = [
        createNode({ id: "1", type: "manual-trigger", name: "Trigger" }),
        createNode({ id: "2", type: "http-request", name: "A" }),
        createNode({ id: "3", type: "http-request", name: "B" }),
      ];
      const connections: IConnections = {
        Trigger: { main: [[{ node: "A", type: "main", index: 0 }]] },
        A: { main: [[{ node: "B", type: "main", index: 0 }]] },
        B: { main: [[{ node: "A", type: "main", index: 0 }]] },
      };

      const cycles = detectCycles(nodes, connections);

      expect(cycles.length).toBeGreaterThan(0);
    });

    test("should detect cycle involving trigger", () => {
      const nodes: INode[] = [
        createNode({ id: "1", type: "manual-trigger", name: "Trigger" }),
        createNode({ id: "2", type: "http-request", name: "A" }),
      ];
      const connections: IConnections = {
        Trigger: { main: [[{ node: "A", type: "main", index: 0 }]] },
        A: { main: [[{ node: "Trigger", type: "main", index: 0 }]] },
      };

      const cycles = detectCycles(nodes, connections);

      expect(cycles.length).toBeGreaterThan(0);
    });

    test("should return empty for empty workflow", () => {
      const cycles = detectCycles([], {});

      expect(cycles).toHaveLength(0);
    });

    test("should handle branching without cycles", () => {
      const nodes: INode[] = [
        createNode({ id: "1", type: "manual-trigger", name: "Trigger" }),
        createNode({ id: "2", type: "condition", name: "Condition" }),
        createNode({ id: "3", type: "http-request", name: "A" }),
        createNode({ id: "4", type: "http-request", name: "B" }),
        createNode({ id: "5", type: "merge", name: "Merge" }),
      ];
      const connections: IConnections = {
        Trigger: { main: [[{ node: "Condition", type: "main", index: 0 }]] },
        Condition: {
          main: [
            [
              { node: "A", type: "main", index: 0 },
              { node: "B", type: "main", index: 0 },
            ],
          ],
        },
        A: { main: [[{ node: "Merge", type: "main", index: 0 }]] },
        B: { main: [[{ node: "Merge", type: "main", index: 0 }]] },
      };

      const cycles = detectCycles(nodes, connections);

      expect(cycles).toHaveLength(0);
    });
  });
});
