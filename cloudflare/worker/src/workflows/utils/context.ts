/**
 * Workflow Execution Context Types
 * 
 * Provides typed context for workflow execution, including trigger data
 * and step results keyed by node ID.
 */

export interface ExecutionContext {
  /** Trigger information */
  trigger: TriggerContext;
  /** Results from executed steps, keyed by node ID */
  steps: Record<string, StepResult>;
  /** Environment bindings */
  env: WorkflowEnv;
}

export interface TriggerContext {
  /** Type of trigger that started the workflow */
  type: "manual" | "webhook" | "schedule" | "event";
  /** Data passed with the trigger */
  data: Record<string, unknown>;
  /** When the workflow was triggered */
  timestamp: Date;
  /** User who triggered (if applicable) */
  userId?: string;
}

export interface StepResult {
  /** Whether the step succeeded */
  success: boolean;
  /** Output data from the step */
  data?: unknown;
  /** Error message if failed */
  error?: string;
  /** Duration in milliseconds */
  durationMs?: number;
  /** Number of retry attempts */
  attempts?: number;
}

export interface WorkflowEnv {
  /** Sandbox durable object namespace */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Sandbox: DurableObjectNamespace<any>;
  /** R2 bucket for workspace storage */
  WORKSPACE_BUCKET: R2Bucket;
  /** AgentPod API URL for callbacks */
  AGENTPOD_API_URL: string;
  /** API token for authentication */
  AGENTPOD_API_TOKEN: string;
  /** D1 database (optional, for workflow definitions) */
  DB?: D1Database;
}

/**
 * Node execution parameters passed to each node executor
 */
export interface NodeExecutionParams {
  /** Unique node ID */
  nodeId: string;
  /** User-friendly node name */
  nodeName: string;
  /** Node type (e.g., "http-request", "ai-agent") */
  nodeType: string;
  /** Interpolated parameters for the node */
  parameters: Record<string, unknown>;
  /** Full execution context */
  context: ExecutionContext;
}

/**
 * Workflow definition loaded for execution
 */
export interface WorkflowDefinition {
  id: string;
  name: string;
  nodes: WorkflowNode[];
  connections: WorkflowConnections;
  settings?: WorkflowSettings;
}

export interface WorkflowNode {
  id: string;
  name: string;
  type: string;
  position: [number, number];
  parameters: Record<string, unknown>;
  disabled?: boolean;
  retryOnFail?: boolean;
  maxRetries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
}

export interface WorkflowConnections {
  [sourceNodeId: string]: {
    main: Array<Array<{
      node: string;
      type: string;
      index: number;
    }>>;
  };
}

export interface WorkflowSettings {
  executionOrder?: "v0" | "v1";
  timezone?: string;
  cloudflare?: {
    retryPolicy?: {
      limit: number;
      delay: string;
      backoff: "constant" | "linear" | "exponential";
    };
    timeout?: string;
    cpuLimitMs?: number;
  };
}

/**
 * Execution status update sent to AgentPod API
 */
export interface ExecutionStatusUpdate {
  executionId: string;
  workflowId: string;
  status: "running" | "waiting" | "completed" | "errored";
  currentStep?: string;
  completedSteps: string[];
  result?: Record<string, unknown>;
  error?: string;
  durationMs?: number;
}
