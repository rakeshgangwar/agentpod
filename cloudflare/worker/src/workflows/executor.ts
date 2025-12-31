import { computeExecutionOrder } from "./utils/dag-builder";
import { hasExecutor } from "./nodes";
import type {
  ExecutionContext,
  WorkflowDefinition,
  WorkflowNode,
  WorkflowConnections,
} from "./utils/context";

const NODE_TYPES_WITH_CONDITIONAL_OUTPUTS = ["condition", "switch"];

export function shouldSkipNode(
  nodeId: string,
  nodes: WorkflowNode[],
  connections: WorkflowConnections,
  context: ExecutionContext
): { skip: boolean; reason?: string } {
  const conditionalSources: Map<string, { hasMatch: boolean; takenBranch: string; checkedBranches: string[] }> = new Map();

  for (const [sourceId, outputs] of Object.entries(connections)) {
    for (const connectionGroup of outputs.main) {
      for (const conn of connectionGroup) {
        if (conn.node !== nodeId) continue;

        const sourceNode = nodes.find(n => n.id === sourceId);
        if (!sourceNode) continue;

        if (!NODE_TYPES_WITH_CONDITIONAL_OUTPUTS.includes(sourceNode.type)) continue;

        const sourceResult = context.steps[sourceId];
        if (!sourceResult?.success || !sourceResult.data) continue;

        const resultData = sourceResult.data as { branch?: string };
        const takenBranch = resultData.branch;

        if (!takenBranch) continue;

        if (!conditionalSources.has(sourceId)) {
          conditionalSources.set(sourceId, { hasMatch: false, takenBranch, checkedBranches: [] });
        }

        const sourceInfo = conditionalSources.get(sourceId)!;
        sourceInfo.checkedBranches.push(conn.type);

        if (conn.type === takenBranch) {
          sourceInfo.hasMatch = true;
        }
      }
    }
  }

  for (const [sourceId, info] of conditionalSources) {
    if (!info.hasMatch) {
      return {
        skip: true,
        reason: `No connection matches branch '${info.takenBranch}' from ${sourceId} (checked: ${info.checkedBranches.join(", ")})`,
      };
    }
  }

  return { skip: false };
}

export function validateWorkflowForExecution(workflow: WorkflowDefinition): string[] {
  const errors: string[] = [];

  if (!workflow.nodes || workflow.nodes.length === 0) {
    errors.push("Workflow has no nodes");
    return errors;
  }

  for (const node of workflow.nodes) {
    if (!hasExecutor(node.type)) {
      errors.push(`Unknown node type: ${node.type} (node: ${node.name})`);
    }
  }

  try {
    computeExecutionOrder(workflow.nodes, workflow.connections);
  } catch (error) {
    if (error instanceof Error) {
      errors.push(error.message);
    }
  }

  return errors;
}
