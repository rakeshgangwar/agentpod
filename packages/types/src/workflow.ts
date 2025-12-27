/**
 * Workflow Builder Types - Cloudflare Workflows-native schema
 * 
 * Key difference from n8n: Connections use node IDs (not names).
 * This enables unique identification and direct code generation for Cloudflare Workflows.
 * 
 * @see https://developers.cloudflare.com/workflows/
 */

export interface IWorkflowBase {
  id: string;
  name: string;
  description?: string;
  active: boolean;
  nodes: INode[];
  connections: IConnections;
  settings?: IWorkflowSettings;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export interface INode {
  id: string;
  name: string;
  type: WorkflowNodeType;
  position: [number, number];
  parameters: Record<string, unknown>;
  disabled?: boolean;
  retryOnFail?: boolean;
  maxRetries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
  notes?: string;
}

export interface IConnections {
  [sourceNodeId: string]: INodeConnections;
}

export interface INodeConnections {
  main: IConnection[][];
}

export interface IConnection {
  node: string;
  type: string;
  index: number;
  label?: string;
}

export interface IWorkflowSettings {
  executionOrder?: "v0" | "v1";
  timezone?: string;
  saveExecutionProgress?: boolean;
  saveManualExecutions?: boolean;
  cloudflare?: ICloudflareWorkflowSettings;
}

export interface ICloudflareWorkflowSettings {
  retryPolicy?: {
    limit: number;
    delay: string;
    backoff: "constant" | "linear" | "exponential";
  };
  timeout?: string;
  cpuLimitMs?: number;
}

export type WorkflowNodeType =
  | "manual-trigger"
  | "webhook-trigger"
  | "schedule-trigger"
  | "event-trigger"
  | "ai-chat"
  | "ai-agent-tools"
  | "ai-agent"
  | "ai-prompt"
  | "embeddings"
  | "vector-search"
  | "condition"
  | "switch"
  | "loop"
  | "merge"
  | "filter"
  | "transform"
  | "split"
  | "set-variable"
  | "parse-json"
  | "aggregate"
  | "wait"
  | "error-handler"
  | "http-request"
  | "email"
  | "discord"
  | "telegram"
  | "d1-query"
  | "r2-storage"
  | "approval"
  | "form"
  | "notification"
  | "javascript"
  | "python";

export type WorkflowNodeCategory =
  | "trigger"
  | "ai"
  | "logic"
  | "action"
  | "human"
  | "code"
  | "integration";

export interface INodeTypeDefinition {
  id: WorkflowNodeType;
  name: string;
  description: string;
  icon: string;
  category: WorkflowNodeCategory;
  parameters: INodeParameterSchema;
  inputs: INodeHandle[];
  outputs: INodeHandle[];
  defaults: Record<string, unknown>;
}

export interface INodeParameterSchema {
  type: "object";
  properties: Record<string, INodeParameterProperty>;
  required?: string[];
}

export interface INodeParameterProperty {
  type: "string" | "number" | "boolean" | "array" | "object";
  title?: string;
  description?: string;
  default?: unknown;
  enum?: string[];
  format?: "textarea" | "code" | "uri" | "email" | "cron";
  items?: INodeParameterProperty;
  properties?: Record<string, INodeParameterProperty>;
}

export interface INodeHandle {
  id: string;
  type: "any" | "string" | "number" | "boolean" | "array" | "object";
  label: string;
  required?: boolean;
}

export interface IAgentPodWorkflow extends IWorkflowBase {
  userId: string;
  organizationId?: string;
  isPublic: boolean;
  isTemplate: boolean;
  tags: string[];
  category?: string;
  executionCount: number;
  lastExecutedAt?: Date;
  forkCount?: number;
  forkedFromId?: string;
}

export type WorkflowExecutionStatus =
  | "queued"
  | "running"
  | "waiting"
  | "completed"
  | "errored"
  | "cancelled";

export interface IWorkflowExecution {
  id: string;
  workflowId: string;
  userId: string;
  instanceId: string;
  status: WorkflowExecutionStatus;
  triggerType: "manual" | "webhook" | "schedule" | "event";
  triggerData?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
  currentStep?: string;
  completedSteps: string[];
  startedAt: Date;
  completedAt?: Date;
  durationMs?: number;
}

export type WorkflowStepStatus =
  | "pending"
  | "running"
  | "success"
  | "error"
  | "retrying"
  | "skipped"
  | "waiting";

export interface IWorkflowStepLog {
  id: string;
  executionId: string;
  nodeId: string;
  stepName: string;
  status: WorkflowStepStatus;
  attemptNumber: number;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  startedAt: Date;
  completedAt?: Date;
  durationMs?: number;
}

export interface ISvelteFlowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
  selected?: boolean;
  dragging?: boolean;
}

export interface ISvelteFlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  type?: string;
  animated?: boolean;
  label?: string;
  data?: Record<string, unknown>;
}

export interface ICreateWorkflowRequest {
  name: string;
  description?: string;
  nodes: INode[];
  connections: IConnections;
  settings?: IWorkflowSettings;
  isPublic?: boolean;
  tags?: string[];
}

export interface IUpdateWorkflowRequest {
  name?: string;
  description?: string;
  nodes?: INode[];
  connections?: IConnections;
  settings?: IWorkflowSettings;
  active?: boolean;
  isPublic?: boolean;
  tags?: string[];
}

export interface IExecuteWorkflowRequest {
  triggerData?: Record<string, unknown>;
}

export interface IWorkflowListResponse {
  workflows: IAgentPodWorkflow[];
  total: number;
  page: number;
  limit: number;
}

export interface IExecutionListResponse {
  executions: IWorkflowExecution[];
  total: number;
}

export interface IWorkflowEvent {
  type: string;
  payload: Record<string, unknown>;
}

export interface IWorkflowWebhook {
  id: string;
  workflowId: string;
  path: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  authentication?: "none" | "header" | "basic";
  authConfig?: Record<string, unknown>;
  lastTriggeredAt?: Date;
  triggerCount: number;
  createdAt: Date;
}

export interface IWorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  thumbnail?: string;
  workflow: IWorkflowBase;
  author: {
    id: string;
    name: string;
  };
  forkCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IWorkflowValidationError {
  nodeId?: string;
  field?: string;
  message: string;
  severity: "error" | "warning";
}

export interface IWorkflowValidationResult {
  valid: boolean;
  errors: IWorkflowValidationError[];
  warnings: IWorkflowValidationError[];
}
