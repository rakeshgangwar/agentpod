import { computeExecutionOrder, getSuccessors } from "./utils/dag-builder";
import { interpolateVariables } from "./utils/variable-interpolator";
import { getExecutor, hasExecutor } from "./nodes";
import type {
  ExecutionContext,
  WorkflowDefinition,
  WorkflowNode,
  WorkflowConnections,
  WorkflowEnv,
  ExecutionStatusUpdate,
  StepResult,
  LoopContext,
} from "./utils/context";

const NODE_TYPES_WITH_CONDITIONAL_OUTPUTS = ["condition", "switch"];

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

  const url = `${env.AGENTPOD_API_URL}/api/v2/workflow-executions/${update.executionId}/status`;
  
  try {
    console.log(`[Workflow] Sending status update: ${update.status}, step: ${update.currentStep}, completed: ${update.completedSteps?.length || 0}`);
    
    const response = await fetch(url, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.AGENTPOD_API_TOKEN}`,
      },
      body: JSON.stringify(update),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Workflow] Status update failed: ${response.status} ${response.statusText} - ${errorText}`);
    } else {
      console.log(`[Workflow] Status update sent successfully`);
    }
  } catch (error) {
    console.error("[Workflow] Failed to notify status:", error);
  }
}

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

interface LoopExecutionResult {
  success: boolean;
  iterations: Array<{
    index: number;
    item: unknown;
    results: Record<string, StepResult>;
  }>;
  error?: string;
}

async function executeLoopChildNodes(
  loopNodeId: string,
  items: unknown[],
  childNodeIds: string[],
  workflow: WorkflowDefinition,
  context: ExecutionContext,
  executionId: string,
  executeNodeFn: (node: WorkflowNode, ctx: ExecutionContext) => Promise<StepResult>
): Promise<LoopExecutionResult> {
  const iterations: LoopExecutionResult["iterations"] = [];
  
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    
    const loopContext: LoopContext = {
      $item: item,
      $index: index,
      $items: items,
      loopNodeId,
    };
    
    const iterationContext: ExecutionContext = {
      ...context,
      loop: loopContext,
      steps: { ...context.steps },
    };
    
    const iterationResults: Record<string, StepResult> = {};
    
    console.log(`[Workflow ${executionId}] Loop iteration ${index + 1}/${items.length} for ${loopNodeId}`);
    
    for (const childNodeId of childNodeIds) {
      const childNode = workflow.nodes.find(n => n.id === childNodeId);
      if (!childNode || childNode.disabled) continue;
      
      try {
        const result = await executeNodeFn(childNode, iterationContext);
        iterationResults[childNodeId] = result;
        iterationContext.steps[childNodeId] = result;
        
        if (!result.success) {
          return {
            success: false,
            iterations,
            error: `Loop iteration ${index} failed at node ${childNode.name}: ${result.error}`,
          };
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Unknown error";
        return {
          success: false,
          iterations,
          error: `Loop iteration ${index} threw at node ${childNode.name}: ${errorMsg}`,
        };
      }
    }
    
    iterations.push({ index, item, results: iterationResults });
  }
  
  return { success: true, iterations };
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

    const loopExecutedNodes = new Set<string>();

    const executeNode = async (node: WorkflowNode, ctx: ExecutionContext): Promise<StepResult> => {
      const executor = getExecutor(node.type);
      if (!executor) {
        return { success: false, error: `Unknown node type: ${node.type}` };
      }
      const interpolatedParams = interpolateVariables(node.parameters, ctx) as Record<string, unknown>;
      return executeWithRetry(
        executor,
        {
          nodeId: node.id,
          nodeName: node.name,
          nodeType: node.type,
          parameters: interpolatedParams,
          context: ctx,
        },
        node
      );
    };

    for (const nodeId of executionOrder) {
      if (loopExecutedNodes.has(nodeId)) {
        console.log(`[Workflow ${executionId}] Node ${nodeId} already executed in loop, skipping`);
        continue;
      }

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

      const branchCheck = shouldSkipNode(nodeId, workflow.nodes, workflow.connections, context);
      if (branchCheck.skip) {
        console.log(`[Workflow ${executionId}] Node ${nodeId} skipped: ${branchCheck.reason}`);
        context.steps[nodeId] = { success: true, data: { skipped: true, reason: branchCheck.reason } };
        completedSteps.push(nodeId);
        continue;
      }

      currentStep = nodeId;
      console.log(`[Workflow ${executionId}] Executing node: ${node.name} (${node.type})`);

      const stepStartTime = Date.now();
      
      try {
        const result = await executeNode(node, context);

        result.durationMs = Date.now() - stepStartTime;
        context.steps[nodeId] = result;

        if (!result.success) {
          console.error(`[Workflow ${executionId}] Node ${node.name} failed:`, result.error);
          finalError = result.error;
          break;
        }

        console.log(`[Workflow ${executionId}] Node ${node.name} completed in ${result.durationMs}ms`);
        completedSteps.push(nodeId);

        if (node.type === "loop" && result.data) {
          const loopData = result.data as { items?: unknown[] };
          const items = loopData.items || [];
          
          if (items.length > 0) {
            const childNodeIds = getSuccessors(nodeId, workflow.connections);
            
            if (childNodeIds.length > 0) {
              console.log(`[Workflow ${executionId}] Executing ${childNodeIds.length} child nodes for ${items.length} items`);
              
              childNodeIds.forEach(id => loopExecutedNodes.add(id));
              
              const loopResult = await executeLoopChildNodes(
                nodeId,
                items,
                childNodeIds,
                workflow,
                context,
                executionId,
                executeNode
              );
              
              if (!loopResult.success) {
                finalError = loopResult.error;
                break;
              }
              
              context.steps[nodeId] = {
                ...result,
                data: {
                  ...loopData,
                  loopResults: loopResult.iterations,
                },
              };
              
              for (const childId of childNodeIds) {
                if (!completedSteps.includes(childId)) {
                  completedSteps.push(childId);
                }
                const lastIteration = loopResult.iterations[loopResult.iterations.length - 1];
                if (lastIteration?.results[childId]) {
                  context.steps[childId] = lastIteration.results[childId];
                }
              }
            }
          }
        }

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
