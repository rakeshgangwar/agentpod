import type { NodeExecutor } from "./base";
import { manualTriggerExecutor, webhookTriggerExecutor, scheduleTriggerExecutor, eventTriggerExecutor } from "./trigger";
import { httpRequestExecutor } from "./http";
import { conditionExecutor, switchExecutor } from "./condition";
import { javascriptExecutor, mergeExecutor, loopExecutor } from "./code";
import { aiChatExecutor, aiAgentExecutor } from "./ai";
import { filterExecutor } from "./filter";
import { transformExecutor } from "./transform";
import { waitExecutor, errorHandlerExecutor } from "./utility";
import { setVariableExecutor, parseJsonExecutor, aggregateExecutor } from "./data";
import { splitExecutor } from "./split";
import { emailExecutor, discordExecutor, telegramExecutor } from "./notification";
import { d1QueryExecutor, r2StorageExecutor } from "./cloudflare";
import { approvalExecutor } from "./human";

export type { NodeExecutor } from "./base";
export { createStepResult, createErrorResult } from "./base";

const executorRegistry = new Map<string, NodeExecutor>();

function registerExecutor(executor: NodeExecutor) {
  executorRegistry.set(executor.type, executor);
}

registerExecutor(manualTriggerExecutor);
registerExecutor(webhookTriggerExecutor);
registerExecutor(scheduleTriggerExecutor);
registerExecutor(eventTriggerExecutor);
registerExecutor(httpRequestExecutor);
registerExecutor(conditionExecutor);
registerExecutor(switchExecutor);
registerExecutor(javascriptExecutor);
registerExecutor(mergeExecutor);
registerExecutor(loopExecutor);
registerExecutor(aiChatExecutor);
registerExecutor(aiAgentExecutor);
registerExecutor(filterExecutor);
registerExecutor(transformExecutor);
registerExecutor(waitExecutor);
registerExecutor(errorHandlerExecutor);
registerExecutor(setVariableExecutor);
registerExecutor(parseJsonExecutor);
registerExecutor(aggregateExecutor);
registerExecutor(splitExecutor);
registerExecutor(emailExecutor);
registerExecutor(discordExecutor);
registerExecutor(telegramExecutor);
registerExecutor(d1QueryExecutor);
registerExecutor(r2StorageExecutor);
registerExecutor(approvalExecutor);

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
