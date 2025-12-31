import { describe, it, expect } from "vitest";
import {
  computeExecutionOrder,
  computeExecutionLevels,
  findParallelGroups,
  getPredecessors,
  getSuccessors,
  isTriggerNode,
  isTerminalNode,
} from "./dag-builder";
import type { WorkflowNode, WorkflowConnections } from "./context";

function createNode(id: string, type: string = "javascript"): WorkflowNode {
  return { id, name: id, type, position: [0, 0], parameters: {} };
}

describe("computeExecutionOrder", () => {
  it("should return single node for trivial workflow", () => {
    const nodes = [createNode("trigger-1", "trigger")];
    const connections: WorkflowConnections = {};

    const order = computeExecutionOrder(nodes, connections);

    expect(order).toEqual(["trigger-1"]);
  });

  it("should return nodes in topological order", () => {
    const nodes = [
      createNode("trigger-1", "trigger"),
      createNode("http-1", "http"),
      createNode("js-1", "javascript"),
    ];
    const connections: WorkflowConnections = {
      "trigger-1": { main: [[{ node: "http-1", type: "main", index: 0 }]] },
      "http-1": { main: [[{ node: "js-1", type: "main", index: 0 }]] },
    };

    const order = computeExecutionOrder(nodes, connections);

    expect(order).toEqual(["trigger-1", "http-1", "js-1"]);
  });

  it("should handle branching workflows", () => {
    const nodes = [
      createNode("trigger-1", "trigger"),
      createNode("condition-1", "condition"),
      createNode("js-true", "javascript"),
      createNode("js-false", "javascript"),
    ];
    const connections: WorkflowConnections = {
      "trigger-1": { main: [[{ node: "condition-1", type: "main", index: 0 }]] },
      "condition-1": {
        main: [
          [{ node: "js-true", type: "true", index: 0 }],
          [{ node: "js-false", type: "false", index: 0 }],
        ],
      },
    };

    const order = computeExecutionOrder(nodes, connections);

    expect(order[0]).toBe("trigger-1");
    expect(order[1]).toBe("condition-1");
    expect(order).toContain("js-true");
    expect(order).toContain("js-false");
  });

  it("should skip disabled nodes", () => {
    const nodes = [
      createNode("trigger-1", "trigger"),
      { ...createNode("http-1", "http"), disabled: true },
      createNode("js-1", "javascript"),
    ];
    const connections: WorkflowConnections = {
      "trigger-1": { main: [[{ node: "http-1", type: "main", index: 0 }]] },
      "http-1": { main: [[{ node: "js-1", type: "main", index: 0 }]] },
    };

    const order = computeExecutionOrder(nodes, connections);

    expect(order).not.toContain("http-1");
  });

  it("should throw on cycle detection", () => {
    const nodes = [
      createNode("node-a"),
      createNode("node-b"),
      createNode("node-c"),
    ];
    const connections: WorkflowConnections = {
      "node-a": { main: [[{ node: "node-b", type: "main", index: 0 }]] },
      "node-b": { main: [[{ node: "node-c", type: "main", index: 0 }]] },
      "node-c": { main: [[{ node: "node-a", type: "main", index: 0 }]] },
    };

    expect(() => computeExecutionOrder(nodes, connections)).toThrow(/Cycle detected/);
  });
});

describe("computeExecutionLevels", () => {
  it("should return single level for standalone node", () => {
    const nodes = [createNode("trigger-1", "trigger")];
    const connections: WorkflowConnections = {};

    const levels = computeExecutionLevels(nodes, connections);

    expect(levels).toEqual([["trigger-1"]]);
  });

  it("should return sequential levels for linear workflow", () => {
    const nodes = [
      createNode("trigger-1", "trigger"),
      createNode("http-1", "http"),
      createNode("js-1", "javascript"),
    ];
    const connections: WorkflowConnections = {
      "trigger-1": { main: [[{ node: "http-1", type: "main", index: 0 }]] },
      "http-1": { main: [[{ node: "js-1", type: "main", index: 0 }]] },
    };

    const levels = computeExecutionLevels(nodes, connections);

    expect(levels).toEqual([["trigger-1"], ["http-1"], ["js-1"]]);
  });

  it("should group parallel nodes in same level", () => {
    const nodes = [
      createNode("trigger-1", "trigger"),
      createNode("http-1", "http"),
      createNode("http-2", "http"),
      createNode("merge-1", "merge"),
    ];
    const connections: WorkflowConnections = {
      "trigger-1": {
        main: [
          [{ node: "http-1", type: "main", index: 0 }],
          [{ node: "http-2", type: "main", index: 0 }],
        ],
      },
      "http-1": { main: [[{ node: "merge-1", type: "main", index: 0 }]] },
      "http-2": { main: [[{ node: "merge-1", type: "main", index: 0 }]] },
    };

    const levels = computeExecutionLevels(nodes, connections);

    expect(levels.length).toBe(3);
    expect(levels[0]).toEqual(["trigger-1"]);
    expect(levels[1].sort()).toEqual(["http-1", "http-2"]);
    expect(levels[2]).toEqual(["merge-1"]);
  });

  it("should handle complex DAG with multiple parallel groups", () => {
    const nodes = [
      createNode("trigger-1", "trigger"),
      createNode("a", "http"),
      createNode("b", "http"),
      createNode("c", "http"),
      createNode("d", "http"),
      createNode("e", "merge"),
    ];
    const connections: WorkflowConnections = {
      "trigger-1": {
        main: [
          [{ node: "a", type: "main", index: 0 }],
          [{ node: "b", type: "main", index: 0 }],
        ],
      },
      "a": { main: [[{ node: "c", type: "main", index: 0 }]] },
      "b": { main: [[{ node: "d", type: "main", index: 0 }]] },
      "c": { main: [[{ node: "e", type: "main", index: 0 }]] },
      "d": { main: [[{ node: "e", type: "main", index: 0 }]] },
    };

    const levels = computeExecutionLevels(nodes, connections);

    expect(levels.length).toBe(4);
    expect(levels[0]).toEqual(["trigger-1"]);
    expect(levels[1].sort()).toEqual(["a", "b"]);
    expect(levels[2].sort()).toEqual(["c", "d"]);
    expect(levels[3]).toEqual(["e"]);
  });

  it("should skip disabled nodes", () => {
    const nodes = [
      createNode("trigger-1", "trigger"),
      { ...createNode("a", "http"), disabled: true },
      createNode("b", "http"),
    ];
    const connections: WorkflowConnections = {
      "trigger-1": {
        main: [
          [{ node: "a", type: "main", index: 0 }],
          [{ node: "b", type: "main", index: 0 }],
        ],
      },
    };

    const levels = computeExecutionLevels(nodes, connections);

    expect(levels.flat()).not.toContain("a");
    expect(levels.flat()).toContain("b");
  });
});

describe("findParallelGroups", () => {
  it("should group nodes with same dependencies", () => {
    const nodes = [
      createNode("trigger-1", "trigger"),
      createNode("a", "http"),
      createNode("b", "http"),
    ];
    const connections: WorkflowConnections = {
      "trigger-1": {
        main: [
          [{ node: "a", type: "main", index: 0 }],
          [{ node: "b", type: "main", index: 0 }],
        ],
      },
    };

    const groups = findParallelGroups(nodes, connections);

    const triggerGroup = groups.find((g) => g.includes("trigger-1"));
    const parallelGroup = groups.find((g) => g.includes("a") && g.includes("b"));

    expect(triggerGroup).toBeDefined();
    expect(parallelGroup).toBeDefined();
  });
});

describe("getPredecessors", () => {
  it("should return empty for trigger nodes", () => {
    const connections: WorkflowConnections = {
      "trigger-1": { main: [[{ node: "http-1", type: "main", index: 0 }]] },
    };

    expect(getPredecessors("trigger-1", connections)).toEqual([]);
  });

  it("should return all predecessors", () => {
    const connections: WorkflowConnections = {
      "a": { main: [[{ node: "c", type: "main", index: 0 }]] },
      "b": { main: [[{ node: "c", type: "main", index: 0 }]] },
    };

    const predecessors = getPredecessors("c", connections);

    expect(predecessors.sort()).toEqual(["a", "b"]);
  });
});

describe("getSuccessors", () => {
  it("should return empty for terminal nodes", () => {
    const connections: WorkflowConnections = {
      "trigger-1": { main: [[{ node: "http-1", type: "main", index: 0 }]] },
    };

    expect(getSuccessors("http-1", connections)).toEqual([]);
  });

  it("should return all successors", () => {
    const connections: WorkflowConnections = {
      "trigger-1": {
        main: [
          [{ node: "a", type: "main", index: 0 }],
          [{ node: "b", type: "main", index: 0 }],
        ],
      },
    };

    const successors = getSuccessors("trigger-1", connections);

    expect(successors.sort()).toEqual(["a", "b"]);
  });
});

describe("isTriggerNode", () => {
  it("should return true for nodes with no predecessors", () => {
    const connections: WorkflowConnections = {
      "trigger-1": { main: [[{ node: "http-1", type: "main", index: 0 }]] },
    };

    expect(isTriggerNode("trigger-1", connections)).toBe(true);
  });

  it("should return false for nodes with predecessors", () => {
    const connections: WorkflowConnections = {
      "trigger-1": { main: [[{ node: "http-1", type: "main", index: 0 }]] },
    };

    expect(isTriggerNode("http-1", connections)).toBe(false);
  });
});

describe("isTerminalNode", () => {
  it("should return true for nodes with no successors", () => {
    const connections: WorkflowConnections = {
      "trigger-1": { main: [[{ node: "http-1", type: "main", index: 0 }]] },
    };

    expect(isTerminalNode("http-1", connections)).toBe(true);
  });

  it("should return false for nodes with successors", () => {
    const connections: WorkflowConnections = {
      "trigger-1": { main: [[{ node: "http-1", type: "main", index: 0 }]] },
    };

    expect(isTerminalNode("trigger-1", connections)).toBe(false);
  });
});
