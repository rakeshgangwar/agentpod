import { computeExecutionOrder } from "./utils/dag-builder";
import { interpolateVariables } from "./utils/variable-interpolator";
import { getExecutor, hasExecutor } from "./nodes";
import type {
  ExecutionContext,
  WorkflowDefinition,
  WorkflowNode,
  WorkflowEnv,
  ExecutionStatusUpdate,
  StepResult,
} from "./utils/context";

export interface ExecuteWorkflowParams {
  executionId: string;
  workflowId: string;
  workflow: WorkflowDefinition;
  triggerType: "manual" | "webhook" | "schedule" | "event";
  triggerData: Record<string, unknown>;
  userId?: string;
  env: WorkflowEnv;
}

export interface ExecutionResult {
  success: boolean;
  executionId: string;
  workflowId: string;
  status: "completed" | "errored";
  trigger: Record<string, unknown>;
  steps: Record<string, StepResult>;
  error?: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
}

async function notifyStatus(
  env: WorkflowEnv,
  update: ExecutionStatusUpdate
): Promise<void> {
  if (!env.AGENTPOD_API_URL || !env.AGENTPOD_API_TOKEN) {
    console.log("[Workflow] API not configured, skipping status update");
    return;
  }

  try {
    await fetch(`${env.AGENTPOD_API_URL}/api/v2/workflow-executions/${update.executionId}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.AGENTPOD_API_TOKEN}`,
      },
      body: JSON.stringify(update),
    });
  } catch (error) {
    console.error("[Workflow] Failed to notify status:", error);
  }
}

export async function executeWorkflow(
  params: ExecuteWorkflowParams
): Promise<ExecutionResult> {
  const startedAt = new Date();
  const { executionId, workflowId, workflow, triggerType, triggerData, userId, env } = params;

  const context: ExecutionContext = {
    trigger: {
      type: triggerType,
      data: triggerData,
      timestamp: startedAt,
      userId,
    },
    steps: {},
    env,
  };

  const completedSteps: string[] = [];
  let currentStep: string | undefined;
  let finalError: string | undefined;

  try {
    await notifyStatus(env, {
      executionId,
      workflowId,
      status: "running",
      completedSteps: [],
    });

    const executionOrder = computeExecutionOrder(workflow.nodes, workflow.connections);
    console.log(`[Workflow ${executionId}] Execution order:`, executionOrder);

    for (const nodeId of executionOrder) {
      const node = workflow.nodes.find(n => n.id === nodeId);
      if (!node) {
        console.warn(`[Workflow ${executionId}] Node ${nodeId} not found, skipping`);
        continue;
      }

      if (node.disabled) {
        console.log(`[Workflow ${executionId}] Node ${nodeId} is disabled, skipping`);
        context.steps[nodeId] = { success: true, data: { skipped: true } };
        completedSteps.push(nodeId);
        continue;
      }

      currentStep = nodeId;
      console.log(`[Workflow ${executionId}] Executing node: ${node.name} (${node.type})`);

      const executor = getExecutor(node.type);
      if (!executor) {
        const error = `Unknown node type: ${node.type}`;
        console.error(`[Workflow ${executionId}] ${error}`);
        context.steps[nodeId] = { success: false, error };
        finalError = error;
        break;
      }

      const interpolatedParams = interpolateVariables(node.parameters, context) as Record<string, unknown>;

      const stepStartTime = Date.now();
      
      try {
        const result = await executeWithRetry(
          executor,
          {
            nodeId: node.id,
            nodeName: node.name,
            nodeType: node.type,
            parameters: interpolatedParams,
            context,
          },
          node
        );

        result.durationMs = Date.now() - stepStartTime;
        context.steps[nodeId] = result;

        if (!result.success) {
          console.error(`[Workflow ${executionId}] Node ${node.name} failed:`, result.error);
          finalError = result.error;
          break;
        }

        console.log(`[Workflow ${executionId}] Node ${node.name} completed in ${result.durationMs}ms`);
        completedSteps.push(nodeId);

        await notifyStatus(env, {
          executionId,
          workflowId,
          status: "running",
          currentStep: nodeId,
          completedSteps,
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Unknown error";
        console.error(`[Workflow ${executionId}] Node ${node.name} threw:`, error);
        context.steps[nodeId] = {
          success: false,
          error: errorMsg,
          durationMs: Date.now() - stepStartTime,
        };
        finalError = errorMsg;
        break;
      }
    }
  } catch (error) {
    finalError = error instanceof Error ? error.message : "Unknown workflow error";
    console.error(`[Workflow ${executionId}] Workflow error:`, error);
  }

  const completedAt = new Date();
  const durationMs = completedAt.getTime() - startedAt.getTime();

  const result: ExecutionResult = {
    success: !finalError,
    executionId,
    workflowId,
    status: finalError ? "errored" : "completed",
    trigger: {
      type: context.trigger.type,
      data: context.trigger.data,
      timestamp: context.trigger.timestamp.toISOString(),
      userId: context.trigger.userId,
    },
    steps: context.steps,
    error: finalError,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs,
  };

  await notifyStatus(env, {
    executionId,
    workflowId,
    status: result.status,
    completedSteps,
    result: finalError ? undefined : context.steps,
    error: finalError,
    durationMs,
  });

  console.log(`[Workflow ${executionId}] ${result.status} in ${durationMs}ms`);
  
  return result;
}

async function executeWithRetry(
  executor: ReturnType<typeof getExecutor>,
  params: Parameters<NonNullable<ReturnType<typeof getExecutor>>["execute"]>[0],
  node: WorkflowNode
): Promise<StepResult> {
  if (!executor) {
    return { success: false, error: "Executor not found" };
  }

  const maxRetries = node.retryOnFail ? (node.maxRetries ?? 3) : 0;
  const retryDelay = node.retryDelayMs ?? 1000;

  let lastError: string | undefined;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      console.log(`[Workflow] Retry ${attempt}/${maxRetries} for node ${node.name}`);
      await sleep(retryDelay * attempt);
    }

    try {
      const result = await executor.execute(params);
      
      if (result.success) {
        result.attempts = attempt + 1;
        return result;
      }

      lastError = result.error;
      
      if (!node.retryOnFail) {
        return result;
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Unknown error";
    }
  }

  return {
    success: false,
    error: lastError || "Max retries exceeded",
    attempts: maxRetries + 1,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
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
