import type {
  INode,
  IConnections,
  IWorkflowValidationResult,
  IWorkflowValidationError,
  WorkflowNodeType,
} from "@agentpod/types";

const TRIGGER_TYPES: WorkflowNodeType[] = [
  "manual-trigger",
  "webhook-trigger",
  "schedule-trigger",
  "event-trigger",
];

function isTriggerNode(type: WorkflowNodeType): boolean {
  return TRIGGER_TYPES.includes(type);
}

export function validateWorkflow(
  name: string,
  nodes: INode[],
  connections: IConnections
): IWorkflowValidationResult {
  const errors: IWorkflowValidationError[] = [];
  const warnings: IWorkflowValidationError[] = [];

  if (!name || name.trim() === "") {
    errors.push({
      message: "Workflow name is required",
      severity: "error",
    });
  }

  if (nodes.length === 0) {
    errors.push({
      message: "Workflow must have at least one node",
      severity: "error",
    });
  }

  const hasTrigger = nodes.some((node) => isTriggerNode(node.type));
  if (!hasTrigger && nodes.length > 0) {
    errors.push({
      message: "Workflow must have at least one trigger node",
      severity: "error",
    });
  }

  const nodeValidation = validateNodes(nodes);
  errors.push(...nodeValidation.errors);
  warnings.push(...nodeValidation.warnings);

  const connectionValidation = validateConnections(nodes, connections);
  errors.push(...connectionValidation.errors);
  warnings.push(...connectionValidation.warnings);

  const unreachable = findUnreachableNodes(nodes, connections);
  for (const nodeId of unreachable) {
    warnings.push({
      nodeId,
      message: `Node is unreachable from any trigger`,
      severity: "warning",
    });
  }

  const cycles = detectCycles(nodes, connections);
  for (const cycle of cycles) {
    warnings.push({
      message: `Cycle detected: ${cycle.join(" -> ")}`,
      severity: "warning",
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function validateNodes(nodes: INode[]): {
  errors: IWorkflowValidationError[];
  warnings: IWorkflowValidationError[];
} {
  const errors: IWorkflowValidationError[] = [];
  const warnings: IWorkflowValidationError[] = [];
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();

  for (const node of nodes) {
    if (!node.id || node.id.trim() === "") {
      errors.push({
        nodeId: node.id,
        message: "Node ID is required",
        severity: "error",
      });
    } else if (seenIds.has(node.id)) {
      errors.push({
        nodeId: node.id,
        message: `Duplicate node ID: ${node.id}`,
        severity: "error",
      });
    } else {
      seenIds.add(node.id);
    }

    if (!node.name || node.name.trim() === "") {
      errors.push({
        nodeId: node.id,
        message: "Node name is required",
        severity: "error",
      });
    } else if (seenNames.has(node.name)) {
      errors.push({
        nodeId: node.id,
        message: `Duplicate node name: ${node.name}`,
        severity: "error",
      });
    } else {
      seenNames.add(node.name);
    }

    if (node.disabled) {
      warnings.push({
        nodeId: node.id,
        message: `Node "${node.name}" is disabled`,
        severity: "warning",
      });
    }
  }

  return { errors, warnings };
}

export function validateConnections(
  nodes: INode[],
  connections: IConnections
): {
  errors: IWorkflowValidationError[];
  warnings: IWorkflowValidationError[];
} {
  const errors: IWorkflowValidationError[] = [];
  const warnings: IWorkflowValidationError[] = [];
  const nodeNames = new Set(nodes.map((n) => n.name));

  for (const [sourceName, nodeConnections] of Object.entries(connections)) {
    if (!nodeNames.has(sourceName)) {
      errors.push({
        message: `Connection source "${sourceName}" does not exist`,
        severity: "error",
      });
      continue;
    }

    for (const outputConnections of nodeConnections.main) {
      for (const connection of outputConnections) {
        if (!nodeNames.has(connection.node)) {
          errors.push({
            message: `Connection target "${connection.node}" does not exist`,
            severity: "error",
          });
        } else if (connection.node === sourceName) {
          errors.push({
            message: `Node "${sourceName}" has a self-referencing connection`,
            severity: "error",
          });
        }
      }
    }
  }

  return { errors, warnings };
}

export function findUnreachableNodes(
  nodes: INode[],
  connections: IConnections
): string[] {
  if (nodes.length === 0) return [];

  const nodeNameToId = new Map<string, string>();
  for (const node of nodes) {
    nodeNameToId.set(node.name, node.id);
  }

  const triggers = nodes.filter((n) => isTriggerNode(n.type));
  if (triggers.length === 0) {
    return nodes.map((n) => n.id);
  }

  const reachable = new Set<string>();

  for (const trigger of triggers) {
    reachable.add(trigger.id);
    traverseFromNode(trigger.name, connections, nodeNameToId, reachable);
  }

  return nodes.filter((n) => !reachable.has(n.id)).map((n) => n.id);
}

function traverseFromNode(
  nodeName: string,
  connections: IConnections,
  nodeNameToId: Map<string, string>,
  visited: Set<string>
): void {
  const nodeConnections = connections[nodeName];
  if (!nodeConnections) return;

  for (const outputConnections of nodeConnections.main) {
    for (const connection of outputConnections) {
      const targetId = nodeNameToId.get(connection.node);
      if (targetId && !visited.has(targetId)) {
        visited.add(targetId);
        traverseFromNode(connection.node, connections, nodeNameToId, visited);
      }
    }
  }
}

export function detectCycles(
  nodes: INode[],
  connections: IConnections
): string[][] {
  if (nodes.length === 0) return [];

  const cycles: string[][] = [];
  const nodeNameToId = new Map<string, string>();
  for (const node of nodes) {
    nodeNameToId.set(node.name, node.id);
  }

  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const path: string[] = [];

  function dfs(nodeName: string): void {
    visited.add(nodeName);
    recursionStack.add(nodeName);
    path.push(nodeName);

    const nodeConnections = connections[nodeName];
    if (nodeConnections) {
      for (const outputConnections of nodeConnections.main) {
        for (const connection of outputConnections) {
          const targetName = connection.node;

          if (!visited.has(targetName)) {
            dfs(targetName);
          } else if (recursionStack.has(targetName)) {
            const cycleStart = path.indexOf(targetName);
            const cycle = [...path.slice(cycleStart), targetName];
            cycles.push(cycle);
          }
        }
      }
    }

    path.pop();
    recursionStack.delete(nodeName);
  }

  for (const node of nodes) {
    if (!visited.has(node.name)) {
      dfs(node.name);
    }
  }

  return cycles;
}
