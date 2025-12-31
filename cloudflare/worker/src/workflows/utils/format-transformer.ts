/**
 * Transforms frontend SvelteFlow workflow format to executor format.
 * Frontend: node.type="action", node.data.nodeType="http-request", edges[]
 * Executor: node.type="http-request", node.parameters={}, connections{}
 */

import type { WorkflowNode, WorkflowConnections, WorkflowDefinition } from "./context";

export interface FrontendNode {
  id: string;
  type: "trigger" | "action" | "condition";
  position: { x: number; y: number };
  data: {
    nodeType: string;
    label: string;
    [key: string]: unknown;
  };
}

export interface FrontendEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  animated?: boolean;
}

export interface FrontendWorkflow {
  name: string;
  description?: string;
  nodes: FrontendNode[];
  edges: FrontendEdge[];
}

export function isFrontendFormat(workflow: unknown): workflow is FrontendWorkflow {
  if (!workflow || typeof workflow !== "object") return false;
  const w = workflow as Record<string, unknown>;
  return Array.isArray(w.edges) && Array.isArray(w.nodes);
}

function transformNode(frontendNode: FrontendNode): WorkflowNode {
  const { id, position, data } = frontendNode;
  const { nodeType, label, ...parameters } = data;

  return {
    id,
    name: label || nodeType,
    type: nodeType,
    position: [position.x, position.y],
    parameters,
  };
}

function transformEdges(edges: FrontendEdge[]): WorkflowConnections {
  const connections: WorkflowConnections = {};

  const edgesBySource = new Map<string, FrontendEdge[]>();
  for (const edge of edges) {
    const existing = edgesBySource.get(edge.source) || [];
    existing.push(edge);
    edgesBySource.set(edge.source, existing);
  }

  for (const [sourceId, sourceEdges] of edgesBySource) {
    const handleGroups = new Map<string, FrontendEdge[]>();
    for (const edge of sourceEdges) {
      const handle = edge.sourceHandle || "main";
      const existing = handleGroups.get(handle) || [];
      existing.push(edge);
      handleGroups.set(handle, existing);
    }

    const main: Array<Array<{ node: string; type: string; index: number }>> = [];
    
    const sortedHandles = [...handleGroups.keys()].sort((a, b) => {
      if (a === "main") return -1;
      if (b === "main") return 1;
      return a.localeCompare(b);
    });

    for (const handle of sortedHandles) {
      const handleEdges = handleGroups.get(handle) || [];
      const connectionGroup = handleEdges.map((edge, index) => ({
        node: edge.target,
        type: handle,
        index,
      }));
      main.push(connectionGroup);
    }

    connections[sourceId] = { main };
  }

  return connections;
}

export function transformFrontendWorkflow(frontend: FrontendWorkflow): WorkflowDefinition {
  return {
    id: "",
    name: frontend.name,
    nodes: frontend.nodes.map(transformNode),
    connections: transformEdges(frontend.edges),
  };
}

export function normalizeWorkflow(
  workflow: FrontendWorkflow | WorkflowDefinition,
  workflowId: string
): WorkflowDefinition {
  if (isFrontendFormat(workflow)) {
    const transformed = transformFrontendWorkflow(workflow);
    transformed.id = workflowId;
    return transformed;
  }

  return {
    ...workflow,
    id: workflowId,
  };
}
