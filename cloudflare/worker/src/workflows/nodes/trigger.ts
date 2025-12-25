import type { NodeExecutor } from "./base";
import { createStepResult } from "./base";
import type { NodeExecutionParams } from "../utils/context";

export const manualTriggerExecutor: NodeExecutor = {
  type: "manual-trigger",
  category: "trigger",
  
  async execute(params: NodeExecutionParams) {
    return createStepResult({
      triggered: true,
      triggerType: "manual",
      timestamp: new Date().toISOString(),
      data: params.context.trigger.data,
    });
  },
};

export const webhookTriggerExecutor: NodeExecutor = {
  type: "webhook-trigger",
  category: "trigger",
  
  async execute(params: NodeExecutionParams) {
    const { method, headers, body, query } = params.context.trigger.data as {
      method?: string;
      headers?: Record<string, string>;
      body?: unknown;
      query?: Record<string, string>;
    };
    
    return createStepResult({
      triggered: true,
      triggerType: "webhook",
      timestamp: new Date().toISOString(),
      method: method || "POST",
      headers: headers || {},
      body: body || null,
      query: query || {},
    });
  },
};

export const scheduleTriggerExecutor: NodeExecutor = {
  type: "schedule-trigger",
  category: "trigger",
  
  async execute(params: NodeExecutionParams) {
    const { cron, scheduledTime } = params.parameters as {
      cron?: string;
      scheduledTime?: string;
    };
    
    return createStepResult({
      triggered: true,
      triggerType: "schedule",
      timestamp: new Date().toISOString(),
      cron: cron || "",
      scheduledTime: scheduledTime || new Date().toISOString(),
    });
  },
};
