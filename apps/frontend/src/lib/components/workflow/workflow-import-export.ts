import type { ISvelteFlowNode, ISvelteFlowEdge, WorkflowNodeType } from "@agentpod/types";
import { getSvelteFlowNodeType } from "./node-registry";

export interface ImportedWorkflow {
  name: string;
  description?: string;
  nodes: ImportedNode[];
  edges: ImportedEdge[];
}

export interface ImportedNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: {
    nodeType?: WorkflowNodeType;
    label?: string;
    [key: string]: unknown;
  };
}

export interface ImportedEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  animated?: boolean;
  label?: string;
}

export interface ImportValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  workflow?: ImportedWorkflow;
}

const VALID_NODE_TYPES: WorkflowNodeType[] = [
  "manual-trigger",
  "webhook-trigger",
  "schedule-trigger",
  "event-trigger",
  "ai-chat",
  "ai-agent-tools",
  "embeddings",
  "vector-search",
  "condition",
  "switch",
  "loop",
  "merge",
  "filter",
  "transform",
  "wait",
  "error-handler",
  "split",
  "set-variable",
  "parse-json",
  "aggregate",
  "http-request",
  "email",
  "notification",
  "discord",
  "telegram",
  "d1-query",
  "r2-storage",
  "approval",
  "form",
  "javascript",
  "python",
];

const SVELTEFLOW_TYPES = ["trigger", "action", "ai-agent", "condition", "switch"];

export function validateImportedWorkflow(json: unknown): ImportValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!json || typeof json !== "object") {
    return { valid: false, errors: ["Invalid JSON: expected an object"], warnings };
  }

  const workflow = json as Record<string, unknown>;

  if (!workflow.name || typeof workflow.name !== "string") {
    errors.push("Missing or invalid 'name' field (required string)");
  }

  if (!Array.isArray(workflow.nodes)) {
    errors.push("Missing or invalid 'nodes' field (required array)");
  }

  if (!Array.isArray(workflow.edges)) {
    errors.push("Missing or invalid 'edges' field (required array)");
  }

  if (errors.length > 0) {
    return { valid: false, errors, warnings };
  }

  const nodes = workflow.nodes as ImportedNode[];
  const edges = workflow.edges as ImportedEdge[];
  const nodeIds = new Set<string>();

  nodes.forEach((node, index) => {
    if (!node.id || typeof node.id !== "string") {
      errors.push(`Node ${index}: missing or invalid 'id' field`);
      return;
    }

    if (nodeIds.has(node.id)) {
      errors.push(`Node ${index}: duplicate node ID '${node.id}'`);
    }
    nodeIds.add(node.id);

    if (!node.type || typeof node.type !== "string") {
      errors.push(`Node '${node.id}': missing or invalid 'type' field`);
    }

    if (!node.position || typeof node.position.x !== "number" || typeof node.position.y !== "number") {
      errors.push(`Node '${node.id}': missing or invalid 'position' field (requires x, y numbers)`);
    }

    if (!node.data || typeof node.data !== "object") {
      errors.push(`Node '${node.id}': missing or invalid 'data' field`);
    } else {
      const nodeType = node.data.nodeType as string;
      if (nodeType && !VALID_NODE_TYPES.includes(nodeType as WorkflowNodeType)) {
        warnings.push(`Node '${node.id}': unknown nodeType '${nodeType}', may not execute correctly`);
      }
    }
  });

  edges.forEach((edge, index) => {
    if (!edge.id || typeof edge.id !== "string") {
      errors.push(`Edge ${index}: missing or invalid 'id' field`);
      return;
    }

    if (!edge.source || typeof edge.source !== "string") {
      errors.push(`Edge '${edge.id}': missing or invalid 'source' field`);
    } else if (!nodeIds.has(edge.source)) {
      errors.push(`Edge '${edge.id}': source node '${edge.source}' does not exist`);
    }

    if (!edge.target || typeof edge.target !== "string") {
      errors.push(`Edge '${edge.id}': missing or invalid 'target' field`);
    } else if (!nodeIds.has(edge.target)) {
      errors.push(`Edge '${edge.id}': target node '${edge.target}' does not exist`);
    }
  });

  const hasTrigger = nodes.some(
    (n) => n.type === "trigger" || n.data?.nodeType?.includes("trigger")
  );
  if (!hasTrigger) {
    warnings.push("Workflow has no trigger node - it cannot be executed automatically");
  }

  if (errors.length > 0) {
    return { valid: false, errors, warnings };
  }

  return {
    valid: true,
    errors: [],
    warnings,
    workflow: {
      name: workflow.name as string,
      description: (workflow.description as string) || "",
      nodes,
      edges,
    },
  };
}

export function convertToSvelteFlowFormat(workflow: ImportedWorkflow): {
  nodes: ISvelteFlowNode[];
  edges: ISvelteFlowEdge[];
} {
  const nodes: ISvelteFlowNode[] = workflow.nodes.map((node) => {
    let svelteFlowType = node.type;
    const nodeType = (node.data.nodeType as WorkflowNodeType) || inferNodeType(node.type, node.data);

    if (!SVELTEFLOW_TYPES.includes(svelteFlowType)) {
      svelteFlowType = getSvelteFlowNodeType(nodeType);
    }

    return {
      id: node.id,
      type: svelteFlowType,
      position: node.position,
      data: {
        ...node.data,
        nodeType,
        label: node.data.label || nodeType,
      },
    } as ISvelteFlowNode;
  });

  const edges: ISvelteFlowEdge[] = workflow.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle,
    animated: edge.animated ?? true,
    label: edge.label,
  }));

  return { nodes, edges };
}

function inferNodeType(type: string, data: Record<string, unknown>): WorkflowNodeType {
  if (VALID_NODE_TYPES.includes(type as WorkflowNodeType)) {
    return type as WorkflowNodeType;
  }

  if (data.triggerType === "manual" || type === "trigger") return "manual-trigger";
  if (data.triggerType === "webhook") return "webhook-trigger";
  if (data.triggerType === "schedule") return "schedule-trigger";
  if (data.url && data.method) return "http-request";
  if (data.conditions) return "condition";
  if (data.cases) return "switch";
  if (data.code) return "javascript";
  if (data.provider && data.prompt) return "ai-chat";
  if (data.prompt && (data.model || data.sandboxConfig)) return "ai-agent-tools";
  if (data.prompt) return "ai-chat";
  if (data.itemsPath || data.items) return "loop";
  if (data.mode === "wait" || data.inputCount) return "merge";

  switch (type) {
    case "trigger": return "manual-trigger";
    case "ai-agent": return "ai-agent-tools";
    case "condition": return "condition";
    default: return "http-request";
  }
}

export function convertToExportFormat(
  name: string,
  description: string,
  nodes: ISvelteFlowNode[],
  edges: ISvelteFlowEdge[]
): ImportedWorkflow {
  return {
    name,
    description,
    nodes: nodes.map((node) => ({
      id: node.id,
      type: node.type || "action",
      position: node.position,
      data: { ...node.data },
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      animated: edge.animated ?? true,
      label: edge.label as string | undefined,
    })),
  };
}

export function downloadWorkflowJson(workflow: ImportedWorkflow): void {
  const json = JSON.stringify(workflow, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement("a");
  a.href = url;
  a.download = `${workflow.name.toLowerCase().replace(/\s+/g, "-")}.workflow.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function parseWorkflowJson(jsonString: string): { success: boolean; data?: unknown; error?: string } {
  try {
    const data = JSON.parse(jsonString);
    return { success: true, data };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Invalid JSON" };
  }
}
