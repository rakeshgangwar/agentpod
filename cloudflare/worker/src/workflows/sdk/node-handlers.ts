import type { WorkflowNode, StepResult, NodeExecutionParams, ExecutionContext } from "../utils/context";
import type { WorkflowContext, WorkflowEnv } from "./types";
import { getExecutor } from "../nodes";

function adaptContext(context: WorkflowContext, env: WorkflowEnv): ExecutionContext {
  return {
    trigger: context.trigger,
    steps: context.steps,
    env: env as unknown as import("../utils/context").WorkflowEnv,
    loop: context.loop,
  };
}

function buildExecutionParams(
  node: WorkflowNode,
  context: WorkflowContext,
  env: WorkflowEnv
): NodeExecutionParams {
  return {
    nodeId: node.id,
    nodeName: node.name,
    nodeType: node.type,
    parameters: node.parameters,
    context: adaptContext(context, env),
  };
}

export async function executeNodeHandler(
  node: WorkflowNode,
  context: WorkflowContext,
  env: WorkflowEnv
): Promise<StepResult> {
  const executor = getExecutor(node.type);

  if (!executor) {
    return {
      success: false,
      error: `Unknown node type: ${node.type}`,
      durationMs: 0,
    };
  }

  const startTime = Date.now();

  try {
    const params = buildExecutionParams(node, context, env);
    const result = await executor.execute(params);
    return {
      ...result,
      durationMs: result.durationMs ?? Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startTime,
    };
  }
}
