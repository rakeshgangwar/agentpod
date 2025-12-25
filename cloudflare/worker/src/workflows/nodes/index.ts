import type { NodeExecutor } from "./base";
import { manualTriggerExecutor, webhookTriggerExecutor, scheduleTriggerExecutor } from "./trigger";
import { httpRequestExecutor } from "./http";
import { conditionExecutor, switchExecutor } from "./condition";
import { javascriptExecutor, mergeExecutor, loopExecutor } from "./code";
import { aiAgentExecutor, aiPromptExecutor } from "./ai-agent";

export type { NodeExecutor } from "./base";
export { createStepResult, createErrorResult } from "./base";

const executorRegistry = new Map<string, NodeExecutor>();

function registerExecutor(executor: NodeExecutor) {
  executorRegistry.set(executor.type, executor);
}

registerExecutor(manualTriggerExecutor);
registerExecutor(webhookTriggerExecutor);
registerExecutor(scheduleTriggerExecutor);
registerExecutor(httpRequestExecutor);
registerExecutor(conditionExecutor);
registerExecutor(switchExecutor);
registerExecutor(javascriptExecutor);
registerExecutor(mergeExecutor);
registerExecutor(loopExecutor);
registerExecutor(aiAgentExecutor);
registerExecutor(aiPromptExecutor);

export function getExecutor(nodeType: string): NodeExecutor | undefined {
  return executorRegistry.get(nodeType);
}

export function hasExecutor(nodeType: string): boolean {
  return executorRegistry.has(nodeType);
}

export function getAllExecutorTypes(): string[] {
  return Array.from(executorRegistry.keys());
}

export function validateNodeParams(
  nodeType: string,
  params: Record<string, unknown>
): string[] {
  const executor = executorRegistry.get(nodeType);
  if (!executor) {
    return [`Unknown node type: ${nodeType}`];
  }
  if (executor.validate) {
    return executor.validate(params);
  }
  return [];
}
