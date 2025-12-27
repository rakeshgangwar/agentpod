import type { WorkflowStepConfig } from "cloudflare:workers";
import type { WorkflowDefinition, StepResult, LoopContext } from "../utils/context";

export type { WorkflowStepConfig };

export interface WorkflowParams {
  executionId: string;
  workflowId: string;
  definition: WorkflowDefinition;
  triggerType: "manual" | "webhook" | "schedule" | "event";
  triggerData: Record<string, unknown>;
  userId?: string;
}

export interface WorkflowContext {
  trigger: {
    type: "manual" | "webhook" | "schedule" | "event";
    data: Record<string, unknown>;
    timestamp: Date;
    userId?: string;
  };
  steps: Record<string, StepResult>;
  loop?: LoopContext;
}

export interface WorkflowEnv {
  Sandbox: DurableObjectNamespace;
  WORKFLOW: Workflow;
  WORKSPACE_BUCKET: R2Bucket;
  AGENTPOD_API_URL: string;
  AGENTPOD_API_TOKEN: string;
  DB?: D1Database;
  AI?: Ai;
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  GOOGLE_API_KEY?: string;
  OLLAMA_BASE_URL?: string;
}

export interface NodeHandler {
  (
    node: import("../utils/context").WorkflowNode,
    context: WorkflowContext,
    env: WorkflowEnv
  ): Promise<StepResult>;
}



export type WorkflowStatus = 
  | "queued"
  | "running"
  | "paused"
  | "errored"
  | "terminated"
  | "complete"
  | "waiting"
  | "waitingForPause"
  | "unknown";

export interface WorkflowInstanceStatus {
  status: WorkflowStatus;
  error?: string;
  output?: Record<string, unknown>;
}

export interface ExecuteResponse {
  executionId: string;
  instanceId: string;
  status: WorkflowStatus;
}

export interface StatusResponse {
  executionId: string;
  status: WorkflowStatus;
  output?: Record<string, unknown>;
  error?: string;
}
