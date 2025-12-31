import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent, WorkflowStepConfig } from "cloudflare:workers";
import { computeExecutionLevels, getSuccessors } from "../utils/dag-builder";
import { interpolateVariables } from "../utils/variable-interpolator";
import { executeNodeHandler } from "./node-handlers";
import { notifyAgentPodAPI } from "./notify";
import type { WorkflowParams, WorkflowContext, WorkflowEnv } from "./types";
import type { WorkflowNode, WorkflowDefinition, StepResult } from "../utils/context";

function asStepResult(result: unknown): StepResult {
  if (!result || typeof result !== "object") {
    return { success: false, error: "Step returned no result" };
  }
  const r = result as { success?: boolean; data?: unknown; error?: string; durationMs?: number; attempts?: number };
  return {
    success: r.success ?? false,
    data: r.data,
    error: r.error,
    durationMs: r.durationMs,
    attempts: r.attempts,
  };
}

const CONDITIONAL_NODE_TYPES = ["condition", "switch"];

type WorkflowSleepDuration = 
  | `${number} second`
  | `${number} seconds`
  | `${number} minute`
  | `${number} minutes`
  | `${number} hour`
  | `${number} hours`
  | `${number} day`
  | `${number} days`;

function msToSleepDuration(ms: number): WorkflowSleepDuration {
  if (ms < 1000) return "1 second";
  const seconds = Math.floor(ms / 1000);
  if (seconds === 1) return "1 second";
  if (seconds < 60) return `${seconds} seconds` as WorkflowSleepDuration;
  const minutes = Math.floor(seconds / 60);
  if (minutes === 1) return "1 minute";
  if (minutes < 60) return `${minutes} minutes` as WorkflowSleepDuration;
  const hours = Math.floor(minutes / 60);
  if (hours === 1) return "1 hour";
  if (hours < 24) return `${hours} hours` as WorkflowSleepDuration;
  const days = Math.floor(hours / 24);
  if (days === 1) return "1 day";
  return `${days} days` as WorkflowSleepDuration;
}

function parseStringDuration(duration: string): WorkflowSleepDuration {
  const match = duration.match(/^(\d+)\s*(second|seconds|minute|minutes|hour|hours|day|days|ms|s|m|h|d)$/i);
  if (!match) return "5 seconds";
  
  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  
  switch (unit) {
    case "ms":
      return msToSleepDuration(value);
    case "s":
    case "second":
    case "seconds":
      return value === 1 ? "1 second" : `${value} seconds` as WorkflowSleepDuration;
    case "m":
    case "minute":
    case "minutes":
      return value === 1 ? "1 minute" : `${value} minutes` as WorkflowSleepDuration;
    case "h":
    case "hour":
    case "hours":
      return value === 1 ? "1 hour" : `${value} hours` as WorkflowSleepDuration;
    case "d":
    case "day":
    case "days":
      return value === 1 ? "1 day" : `${value} days` as WorkflowSleepDuration;
    default:
      return "5 seconds";
  }
}

export class AgentPodWorkflow extends WorkflowEntrypoint<WorkflowEnv, WorkflowParams> {
  async run(event: WorkflowEvent<WorkflowParams>, step: WorkflowStep): Promise<Record<string, unknown>> {
    const { executionId, workflowId, definition, triggerType, triggerData, userId } = event.payload;

    let context: WorkflowContext = {
      trigger: {
        type: triggerType,
        data: triggerData,
        timestamp: new Date(),
        userId,
      },
      steps: {},
    };

    const completedSteps: string[] = [];
    const skippedNodes = new Set<string>();
    const loopExecutedNodes = new Set<string>();

    await step.do("notify-start", async () => {
      await notifyAgentPodAPI(this.env, executionId, workflowId, "running", [], null);
    });

    try {
      const executionLevels = computeExecutionLevels(definition.nodes, definition.connections);

      for (const level of executionLevels) {
        const nodesToExecute = level.filter((nodeId) => {
          if (loopExecutedNodes.has(nodeId)) return false;
          
          const node = definition.nodes.find((n) => n.id === nodeId);
          if (!node || node.disabled) {
            skippedNodes.add(nodeId);
            return false;
          }

          const skipCheck = this.shouldSkipNode(nodeId, definition, context);
          if (skipCheck.skip) {
            skippedNodes.add(nodeId);
            return false;
          }

          return true;
        });

        if (nodesToExecute.length === 0) continue;

        const levelResults = await Promise.all(
          nodesToExecute.map(async (nodeId) => {
            const node = definition.nodes.find((n) => n.id === nodeId)!;
            const stepConfig = this.buildStepConfig(node, definition);

            const executeNodeStep = async (): Promise<StepResult> => {
              const interpolatedParams = interpolateVariables(node.parameters, {
                trigger: context.trigger,
                steps: context.steps,
                env: this.env as unknown as import("../utils/context").WorkflowEnv,
                loop: context.loop,
              });

              const nodeWithInterpolatedParams: WorkflowNode = {
                ...node,
                parameters: interpolatedParams as Record<string, unknown>,
              };

              return await executeNodeHandler(nodeWithInterpolatedParams, context, this.env);
            };

            const serializedResult = await step.do(
              `execute-${nodeId}`,
              stepConfig,
              executeNodeStep as unknown as () => Promise<{ success: boolean }>
            );

            return { nodeId, node, result: asStepResult(serializedResult) };
          })
        );

        for (const { nodeId, result } of levelResults) {
          context = {
            ...context,
            steps: {
              ...context.steps,
              [nodeId]: result,
            },
          };
          completedSteps.push(nodeId);
        }

        await step.do(`notify-level-${completedSteps.length}`, async () => {
          await notifyAgentPodAPI(this.env, executionId, workflowId, "running", completedSteps, null);
        });

        for (const { nodeId, node, result } of levelResults) {
          if (node.type === "loop" && result.success) {
            const loopResult = await this.executeLoop(
              node,
              result,
              context,
              definition,
              step,
              completedSteps,
              executionId,
              workflowId
            );
            context = loopResult.context;
            loopResult.executedNodes.forEach((id) => loopExecutedNodes.add(id));
          }

          if (node.type === "wait" && result.success) {
            const duration = node.parameters.duration as string;
            if (duration) {
              await step.sleep(`wait-${nodeId}`, parseStringDuration(duration));
            }
          }
        }
      }

      // Add skipped nodes to context.steps so frontend can display them correctly
      for (const nodeId of skippedNodes) {
        if (!(nodeId in context.steps)) {
          context.steps[nodeId] = {
            success: true,
            data: { skipped: true },
          };
        }
      }

      await step.do("notify-complete", async () => {
        await notifyAgentPodAPI(
          this.env,
          executionId,
          workflowId,
          "completed",
          completedSteps,
          null,
          context.steps
        );
      });

      return { success: true, steps: context.steps };
    } catch (error) {
      await step.do("notify-error", async () => {
        await notifyAgentPodAPI(
          this.env,
          executionId,
          workflowId,
          "errored",
          completedSteps,
          null,
          undefined,
          error instanceof Error ? error.message : String(error)
        );
      });

      throw error;
    }
  }

  private shouldSkipNode(
    nodeId: string,
    definition: WorkflowDefinition,
    context: WorkflowContext
  ): { skip: boolean; reason?: string } {
    const conditionalSources = new Map<
      string,
      { hasMatch: boolean; takenBranch: string; checkedBranches: string[] }
    >();

    for (const [sourceId, outputs] of Object.entries(definition.connections)) {
      for (const connectionGroup of outputs.main) {
        for (const conn of connectionGroup) {
          if (conn.node !== nodeId) continue;

          const sourceNode = definition.nodes.find((n) => n.id === sourceId);
          if (!sourceNode) continue;

          if (!CONDITIONAL_NODE_TYPES.includes(sourceNode.type)) continue;

          const sourceResult = context.steps[sourceId];
          if (!sourceResult?.success || !sourceResult.data) continue;

          const resultData = sourceResult.data as { branch?: string };
          const takenBranch = resultData.branch;

          if (!takenBranch) continue;

          if (!conditionalSources.has(sourceId)) {
            conditionalSources.set(sourceId, {
              hasMatch: false,
              takenBranch,
              checkedBranches: [],
            });
          }

          const sourceInfo = conditionalSources.get(sourceId)!;
          const edgeBranch = conn.type || "default";
          sourceInfo.checkedBranches.push(edgeBranch);

          if (edgeBranch === takenBranch) {
            sourceInfo.hasMatch = true;
          }
        }
      }
    }

    for (const [sourceId, info] of conditionalSources) {
      if (!info.hasMatch) {
        return {
          skip: true,
          reason: `Conditional node ${sourceId} took branch '${info.takenBranch}', not ${info.checkedBranches.join(" or ")}`,
        };
      }
    }

    return { skip: false };
  }

  private buildStepConfig(node: WorkflowNode, definition: WorkflowDefinition): WorkflowStepConfig {
    const defaultRetry = definition.settings?.cloudflare?.retryPolicy;

    return {
      retries: {
        limit: node.maxRetries ?? defaultRetry?.limit ?? 3,
        delay: msToSleepDuration(node.retryDelayMs ?? 1000),
        backoff: defaultRetry?.backoff ?? "exponential",
      },
      timeout: msToSleepDuration(node.timeoutMs ?? 300000),
    };
  }

  private async executeLoop(
    loopNode: WorkflowNode,
    loopResult: StepResult,
    context: WorkflowContext,
    definition: WorkflowDefinition,
    step: WorkflowStep,
    completedSteps: string[],
    executionId: string,
    workflowId: string
  ): Promise<{ context: WorkflowContext; executedNodes: Set<string> }> {
    const items = (loopResult.data as { items?: unknown[] })?.items ?? [];
    const childNodeIds = getSuccessors(loopNode.id, definition.connections);
    const executedNodes = new Set<string>();

    const loopResults: Array<{ index: number; item: unknown; results: Record<string, StepResult> }> = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      const loopContext: WorkflowContext = {
        ...context,
        loop: {
          $item: item,
          $index: i,
          $items: items,
          loopNodeId: loopNode.id,
        },
      };

      const iterationResults: Record<string, StepResult> = {};

      for (const childId of childNodeIds) {
        const childNode = definition.nodes.find((n) => n.id === childId);
        if (!childNode) continue;

        executedNodes.add(childId);

        const executeLoopNodeStep = async (): Promise<StepResult> => {
          const interpolatedParams = interpolateVariables(childNode.parameters, {
            trigger: loopContext.trigger,
            steps: loopContext.steps,
            env: this.env as unknown as import("../utils/context").WorkflowEnv,
            loop: loopContext.loop,
          });

          const nodeWithInterpolatedParams: WorkflowNode = {
            ...childNode,
            parameters: interpolatedParams as Record<string, unknown>,
          };

          return await executeNodeHandler(nodeWithInterpolatedParams, loopContext, this.env);
        };

        const serializedLoopResult = await step.do(
          `loop-${loopNode.id}-${i}-${childId}`,
          { retries: { limit: 3, delay: "1 second", backoff: "exponential" } },
          executeLoopNodeStep as unknown as () => Promise<{ success: boolean }>
        );

        const result = asStepResult(serializedLoopResult);
        iterationResults[childId] = result;
        loopContext.steps[childId] = result;
      }

      loopResults.push({ index: i, item, results: iterationResults });

      await step.do(`notify-loop-${loopNode.id}-${i}`, async () => {
        await notifyAgentPodAPI(this.env, executionId, workflowId, "running", completedSteps, loopNode.id);
      });
    }

    const updatedContext: WorkflowContext = {
      ...context,
      steps: {
        ...context.steps,
        [loopNode.id]: {
          ...loopResult,
          data: { ...(loopResult.data as object), loopResults },
        },
      },
    };

    return { context: updatedContext, executedNodes };
  }
}
