/**
 * Node Type Registry
 * 
 * Centralized registry of all workflow node types with their metadata,
 * parameter schemas, and frontend component mappings.
 * 
 * @see docs/implementation/workflow-nodes-catalog.md for full documentation
 */

import type { WorkflowNodeType, WorkflowNodeCategory, INodeParameterSchema } from "@agentpod/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyComponent = any;

import PlayIcon from "@lucide/svelte/icons/play";
import WebhookIcon from "@lucide/svelte/icons/webhook";
import CalendarIcon from "@lucide/svelte/icons/calendar";
import RadioIcon from "@lucide/svelte/icons/radio";
import BotIcon from "@lucide/svelte/icons/bot";
import MessageSquareIcon from "@lucide/svelte/icons/message-square";
import BinaryIcon from "@lucide/svelte/icons/binary";
import SearchIcon from "@lucide/svelte/icons/search";
import GlobeIcon from "@lucide/svelte/icons/globe";
import GitBranchIcon from "@lucide/svelte/icons/git-branch";
import RouteIcon from "@lucide/svelte/icons/route";
import RepeatIcon from "@lucide/svelte/icons/repeat";
import GitMergeIcon from "@lucide/svelte/icons/git-merge";
import CodeIcon from "@lucide/svelte/icons/code";
import FileCodeIcon from "@lucide/svelte/icons/file-code";
import MailIcon from "@lucide/svelte/icons/mail";
import BellIcon from "@lucide/svelte/icons/bell";
import UploadIcon from "@lucide/svelte/icons/upload";
import DatabaseIcon from "@lucide/svelte/icons/database";
import UserCheckIcon from "@lucide/svelte/icons/user-check";
import StickyNoteIcon from "@lucide/svelte/icons/sticky-note";
import VariableIcon from "@lucide/svelte/icons/variable";
import FileJson2Icon from "@lucide/svelte/icons/file-json-2";
import CalculatorIcon from "@lucide/svelte/icons/calculator";
import GitForkIcon from "@lucide/svelte/icons/git-fork";
import MessageCircleIcon from "@lucide/svelte/icons/message-circle";
import SendIcon from "@lucide/svelte/icons/send";
import HardDriveIcon from "@lucide/svelte/icons/hard-drive";
import TriggerNode from "./nodes/TriggerNode.svelte";
import ActionNode from "./nodes/ActionNode.svelte";
import AIAgentNode from "./nodes/AIAgentNode.svelte";
import ConditionNode from "./nodes/ConditionNode.svelte";
import SwitchNode from "./nodes/SwitchNode.svelte";
import SplitNode from "./nodes/SplitNode.svelte";

/**
 * Implementation status for each node
 */
export type NodeImplementationStatus = "implemented" | "planned" | "future";

/**
 * Extended node definition with frontend-specific properties
 */
export interface NodeRegistryEntry {
  type: WorkflowNodeType;
  name: string;
  description: string;
  category: WorkflowNodeCategory;
  status: NodeImplementationStatus;
  
  icon: AnyComponent;
  color: string;
  component: AnyComponent;
  
  // Schema
  parameters: INodeParameterSchema;
  
  // Defaults
  defaultData: Record<string, unknown>;
  
  // Behavior
  isTrigger?: boolean;
  hasBranches?: boolean;
  branchCount?: number;
}

/**
 * Category metadata for UI grouping
 */
export interface NodeCategoryInfo {
  id: WorkflowNodeCategory;
  label: string;
  description: string;
  color: string;
}

/**
 * Node category definitions
 */
export const NODE_CATEGORIES: NodeCategoryInfo[] = [
  {
    id: "trigger",
    label: "Triggers",
    description: "Start workflow execution",
    color: "var(--cyber-cyan)",
  },
  {
    id: "ai",
    label: "AI",
    description: "AI and machine learning operations",
    color: "var(--cyber-emerald)",
  },
  {
    id: "logic",
    label: "Logic",
    description: "Flow control and branching",
    color: "var(--cyber-amber)",
  },
  {
    id: "action",
    label: "Actions",
    description: "Perform operations and API calls",
    color: "var(--cyber-magenta)",
  },
  {
    id: "human",
    label: "Human",
    description: "Human-in-the-loop interactions",
    color: "var(--cyber-cyan)",
  },
  {
    id: "code",
    label: "Code",
    description: "Custom code execution",
    color: "var(--cyber-amber)",
  },
];

/**
 * Complete node registry
 */
export const NODE_REGISTRY: Record<WorkflowNodeType, NodeRegistryEntry> = {
  // ============================================
  // TRIGGERS
  // ============================================
  "manual-trigger": {
    type: "manual-trigger",
    name: "Manual Trigger",
    description: "Start workflow manually from the UI",
    category: "trigger",
    status: "implemented",
    icon: PlayIcon,
    color: "var(--cyber-cyan)",
    component: TriggerNode,
    isTrigger: true,
    parameters: {
      type: "object",
      properties: {
        inputData: {
          type: "object",
          title: "Input Data",
          description: "Data to pass to workflow",
        },
      },
    },
    defaultData: {
      label: "Manual Trigger",
      triggerType: "manual",
    },
  },

  "webhook-trigger": {
    type: "webhook-trigger",
    name: "Webhook Trigger",
    description: "Trigger workflow via HTTP webhook",
    category: "trigger",
    status: "implemented",
    icon: WebhookIcon,
    color: "var(--cyber-cyan)",
    component: TriggerNode,
    isTrigger: true,
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          title: "Webhook Path",
          description: "URL path for the webhook",
        },
        method: {
          type: "string",
          title: "HTTP Method",
          enum: ["GET", "POST", "PUT", "DELETE"],
          default: "POST",
        },
        authentication: {
          type: "object",
          title: "Authentication",
          properties: {
            type: {
              type: "string",
              enum: ["none", "header", "basic"],
              default: "none",
            },
          },
        },
      },
    },
    defaultData: {
      label: "Webhook",
      triggerType: "webhook",
      method: "POST",
    },
  },

  "schedule-trigger": {
    type: "schedule-trigger",
    name: "Schedule Trigger",
    description: "Run workflow on a schedule (cron)",
    category: "trigger",
    status: "implemented",
    icon: CalendarIcon,
    color: "var(--cyber-cyan)",
    component: TriggerNode,
    isTrigger: true,
    parameters: {
      type: "object",
      properties: {
        cron: {
          type: "string",
          title: "Cron Expression",
          description: "Cron schedule (e.g., '0 9 * * *' for 9 AM daily)",
          format: "cron",
        },
        timezone: {
          type: "string",
          title: "Timezone",
          description: "IANA timezone",
          default: "UTC",
        },
      },
      required: ["cron"],
    },
    defaultData: {
      label: "Schedule",
      triggerType: "schedule",
      cron: "0 9 * * *",
      timezone: "UTC",
    },
  },

  "event-trigger": {
    type: "event-trigger",
    name: "Event Trigger",
    description: "Listen for custom events",
    category: "trigger",
    status: "planned",
    icon: RadioIcon,
    color: "var(--cyber-cyan)",
    component: TriggerNode,
    isTrigger: true,
    parameters: {
      type: "object",
      properties: {
        eventType: {
          type: "string",
          title: "Event Type",
          description: "Type of event to listen for",
        },
        filter: {
          type: "object",
          title: "Filter",
          description: "Filter conditions",
        },
        timeout: {
          type: "string",
          title: "Timeout",
          default: "24h",
        },
      },
      required: ["eventType"],
    },
    defaultData: {
      label: "Event",
      triggerType: "event",
      timeout: "24h",
    },
  },

  // ============================================
  // AI NODES
  // ============================================
  "ai-chat": {
    type: "ai-chat",
    name: "AI Chat",
    description: "LLM chat with multiple providers (OpenAI, Anthropic, Ollama, Workers AI)",
    category: "ai",
    status: "implemented",
    icon: MessageSquareIcon,
    color: "var(--cyber-emerald)",
    component: AIAgentNode,
    parameters: {
      type: "object",
      properties: {
        provider: {
          type: "string",
          title: "Provider",
          description: "AI provider to use",
          enum: ["openai", "anthropic", "ollama", "workers-ai"],
          default: "openai",
        },
        model: {
          type: "string",
          title: "Model",
          description: "Model ID (e.g., gpt-4o-mini, claude-3-5-sonnet-20241022)",
          default: "gpt-4o-mini",
        },
        systemPrompt: {
          type: "string",
          title: "System Prompt",
          description: "System instruction for the AI",
          format: "textarea",
        },
        prompt: {
          type: "string",
          title: "Prompt",
          description: "User prompt (supports {{$variable}} interpolation)",
          format: "textarea",
        },
        temperature: {
          type: "number",
          title: "Temperature",
          description: "Creativity (0-2, default 0.7)",
          default: 0.7,
        },
        maxTokens: {
          type: "number",
          title: "Max Tokens",
          description: "Maximum response length",
          default: 1024,
        },
        responseFormat: {
          type: "string",
          title: "Response Format",
          enum: ["text", "json"],
          default: "text",
        },
        apiKey: {
          type: "string",
          title: "API Key (optional)",
          description: "Override environment API key",
        },
        baseUrl: {
          type: "string",
          title: "Base URL (optional)",
          description: "Custom endpoint (e.g., for Ollama)",
        },
      },
      required: ["provider", "model", "prompt"],
    },
    defaultData: {
      label: "AI Chat",
      provider: "openai",
      model: "gpt-4o-mini",
      prompt: "",
      temperature: 0.7,
      maxTokens: 1024,
      responseFormat: "text",
    },
  },

  "ai-agent-tools": {
    type: "ai-agent-tools",
    name: "AI Agent",
    description: "AI agent with tool calling (calculator, HTTP, code execution)",
    category: "ai",
    status: "implemented",
    icon: BotIcon,
    color: "var(--cyber-emerald)",
    component: AIAgentNode,
    parameters: {
      type: "object",
      properties: {
        provider: {
          type: "string",
          title: "Provider",
          description: "AI provider (currently only OpenAI supports tool calling)",
          enum: ["openai"],
          default: "openai",
        },
        model: {
          type: "string",
          title: "Model",
          description: "Model ID (e.g., gpt-4o, gpt-4o-mini)",
          default: "gpt-4o-mini",
        },
        systemPrompt: {
          type: "string",
          title: "System Prompt",
          description: "System instruction for the agent",
          format: "textarea",
        },
        prompt: {
          type: "string",
          title: "Prompt",
          description: "Task for the agent to accomplish",
          format: "textarea",
        },
        useBuiltinTools: {
          type: "boolean",
          title: "Use Built-in Tools",
          description: "Enable calculator, HTTP, code execution, time tools",
          default: true,
        },
        maxIterations: {
          type: "number",
          title: "Max Iterations",
          description: "Maximum tool calling rounds (default 10)",
          default: 10,
        },
        temperature: {
          type: "number",
          title: "Temperature",
          description: "Creativity (0-2, default 0.7)",
          default: 0.7,
        },
        apiKey: {
          type: "string",
          title: "API Key (optional)",
          description: "Override environment API key",
        },
      },
      required: ["provider", "model", "prompt"],
    },
    defaultData: {
      label: "AI Agent",
      provider: "openai",
      model: "gpt-4o-mini",
      prompt: "",
      useBuiltinTools: true,
      maxIterations: 10,
      temperature: 0.7,
    },
  },

  "ai-agent": {
    type: "ai-agent",
    name: "AI Agent (Legacy)",
    description: "Execute AI agent in Cloudflare Sandbox (deprecated, use AI Agent)",
    category: "ai",
    status: "planned",
    icon: BotIcon,
    color: "var(--cyber-emerald)",
    component: AIAgentNode,
    parameters: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          title: "Prompt",
          description: "Instructions for the AI agent",
          format: "textarea",
        },
        model: {
          type: "object",
          title: "Model",
          properties: {
            providerId: {
              type: "string",
              enum: ["anthropic", "openai", "google"],
              default: "anthropic",
            },
            modelId: {
              type: "string",
              default: "claude-sonnet-4-20250514",
            },
          },
        },
        sandboxConfig: {
          type: "object",
          title: "Sandbox Configuration",
          properties: {
            gitUrl: {
              type: "string",
              title: "Git Repository URL",
              format: "uri",
            },
            workspaceId: {
              type: "string",
              title: "Existing Workspace ID",
            },
            directory: {
              type: "string",
              title: "Working Directory",
              default: "/home/user/workspace",
            },
          },
        },
        timeout: {
          type: "string",
          title: "Timeout",
          enum: ["1 minute", "5 minutes", "10 minutes", "30 minutes"],
          default: "5 minutes",
        },
      },
      required: ["prompt"],
    },
    defaultData: {
      label: "AI Agent",
      prompt: "",
      model: {
        providerId: "anthropic",
        modelId: "claude-sonnet-4-20250514",
      },
      timeout: "5 minutes",
    },
  },

  "ai-prompt": {
    type: "ai-prompt",
    name: "AI Prompt (Legacy)",
    description: "Direct LLM call (deprecated, use AI Chat)",
    category: "ai",
    status: "planned",
    icon: MessageSquareIcon,
    color: "var(--cyber-emerald)",
    component: AIAgentNode,
    parameters: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          title: "Prompt",
          description: "Prompt text",
          format: "textarea",
        },
        systemPrompt: {
          type: "string",
          title: "System Prompt",
          description: "System instruction",
          format: "textarea",
        },
        model: {
          type: "object",
          title: "Model",
          properties: {
            providerId: {
              type: "string",
              enum: ["anthropic", "openai", "google"],
            },
            modelId: {
              type: "string",
            },
          },
        },
        temperature: {
          type: "number",
          title: "Temperature",
          description: "Creativity (0-1)",
          default: 0.7,
        },
        maxTokens: {
          type: "number",
          title: "Max Tokens",
          default: 1024,
        },
      },
      required: ["prompt"],
    },
    defaultData: {
      label: "AI Prompt",
      prompt: "",
      temperature: 0.7,
      maxTokens: 1024,
    },
  },

  "embeddings": {
    type: "embeddings",
    name: "Generate Embeddings",
    description: "Generate vector embeddings for text",
    category: "ai",
    status: "future",
    icon: BinaryIcon,
    color: "var(--cyber-emerald)",
    component: ActionNode,
    parameters: {
      type: "object",
      properties: {
        input: {
          type: "string",
          title: "Input Text",
          description: "Text to embed",
        },
        model: {
          type: "string",
          title: "Embedding Model",
        },
      },
      required: ["input"],
    },
    defaultData: {
      label: "Embeddings",
    },
  },

  "vector-search": {
    type: "vector-search",
    name: "Vector Search",
    description: "Search Vectorize index",
    category: "ai",
    status: "future",
    icon: SearchIcon,
    color: "var(--cyber-emerald)",
    component: ActionNode,
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          title: "Query",
          description: "Search query",
        },
        index: {
          type: "string",
          title: "Vectorize Index",
        },
        topK: {
          type: "number",
          title: "Results Count",
          default: 10,
        },
        filter: {
          type: "object",
          title: "Metadata Filters",
        },
      },
      required: ["query", "index"],
    },
    defaultData: {
      label: "Vector Search",
      topK: 10,
    },
  },

  // ============================================
  // LOGIC NODES
  // ============================================
  "condition": {
    type: "condition",
    name: "Condition (If/Else)",
    description: "Branch workflow based on conditions",
    category: "logic",
    status: "implemented",
    icon: GitBranchIcon,
    color: "var(--cyber-amber)",
    component: ConditionNode,
    hasBranches: true,
    branchCount: 2,
    parameters: {
      type: "object",
      properties: {
        conditions: {
          type: "array",
          title: "Conditions",
          items: {
            type: "object",
            properties: {
              field: { type: "string" },
              operator: { type: "string", enum: [
                "equals", "notEquals", "contains", "notContains",
                "startsWith", "endsWith", "greaterThan", "lessThan",
                "greaterThanOrEqual", "lessThanOrEqual",
                "isEmpty", "isNotEmpty", "isTrue", "isFalse", "regex"
              ]},
              value: { type: "string" },
              outputBranch: { type: "string" },
            },
          },
        },
        defaultBranch: {
          type: "string",
          title: "Default Branch",
          default: "default",
        },
        mode: {
          type: "string",
          title: "Mode",
          enum: ["first", "all"],
          default: "first",
        },
      },
      required: ["conditions"],
    },
    defaultData: {
      label: "Condition",
      conditions: [],
      defaultBranch: "default",
      mode: "first",
    },
  },

  "switch": {
    type: "switch",
    name: "Switch",
    description: "Multi-way branching based on value",
    category: "logic",
    status: "implemented",
    icon: RouteIcon,
    color: "var(--cyber-amber)",
    component: SwitchNode,
    hasBranches: true,
    parameters: {
      type: "object",
      properties: {
        field: {
          type: "string",
          title: "Field",
          description: "Field to switch on",
        },
        cases: {
          type: "array",
          title: "Cases",
          items: {
            type: "object",
            properties: {
              value: { type: "string" },
              outputBranch: { type: "string" },
            },
          },
        },
        defaultCase: {
          type: "string",
          title: "Default Case",
          default: "default",
        },
      },
      required: ["field", "cases"],
    },
    defaultData: {
      label: "Switch",
      cases: [],
      defaultCase: "default",
    },
  },

  "loop": {
    type: "loop",
    name: "Loop (For Each)",
    description: "Iterate over array items",
    category: "logic",
    status: "implemented",
    icon: RepeatIcon,
    color: "var(--cyber-amber)",
    component: ActionNode,
    parameters: {
      type: "object",
      properties: {
        items: {
          type: "array",
          title: "Items",
          description: "Direct array input",
        },
        itemsPath: {
          type: "string",
          title: "Items Path",
          description: "Path to array in context",
        },
        batchSize: {
          type: "number",
          title: "Batch Size",
          default: 1,
        },
      },
    },
    defaultData: {
      label: "Loop",
      batchSize: 1,
    },
  },

  "merge": {
    type: "merge",
    name: "Merge",
    description: "Join parallel branches",
    category: "logic",
    status: "implemented",
    icon: GitMergeIcon,
    color: "var(--cyber-amber)",
    component: ActionNode,
    parameters: {
      type: "object",
      properties: {
        mode: {
          type: "string",
          title: "Mode",
          enum: ["wait", "first"],
          default: "wait",
        },
        inputCount: {
          type: "number",
          title: "Expected Inputs",
          default: 2,
        },
      },
    },
    defaultData: {
      label: "Merge",
      mode: "wait",
      inputCount: 2,
    },
  },

  "filter": {
    type: "filter",
    name: "Filter",
    description: "Filter array items based on conditions",
    category: "logic",
    status: "implemented",
    icon: GitBranchIcon,
    color: "var(--cyber-amber)",
    component: ActionNode,
    parameters: {
      type: "object",
      properties: {
        items: {
          type: "array",
          title: "Items",
          description: "Direct array input",
        },
        itemsPath: {
          type: "string",
          title: "Items Path",
          description: "Path to array in context (e.g., steps.http-1.data.items)",
        },
        conditions: {
          type: "array",
          title: "Conditions",
          items: {
            type: "object",
            properties: {
              field: { type: "string", title: "Field" },
              operator: {
                type: "string",
                title: "Operator",
                enum: [
                  "equals", "notEquals", "contains", "notContains",
                  "startsWith", "endsWith", "greaterThan", "lessThan",
                  "greaterThanOrEqual", "lessThanOrEqual",
                  "isEmpty", "isNotEmpty", "isTrue", "isFalse", "regex"
                ],
              },
              value: { type: "string", title: "Value" },
            },
          },
        },
        mode: {
          type: "string",
          title: "Match Mode",
          enum: ["all", "any"],
          default: "all",
        },
      },
    },
    defaultData: {
      label: "Filter",
      conditions: [],
      mode: "all",
    },
  },

  "transform": {
    type: "transform",
    name: "Transform Data",
    description: "Transform data structure with mapping, pick, omit, flatten operations",
    category: "logic",
    status: "implemented",
    icon: GitMergeIcon,
    color: "var(--cyber-amber)",
    component: ActionNode,
    parameters: {
      type: "object",
      properties: {
        input: {
          type: "object",
          title: "Input",
          description: "Direct input data",
        },
        inputPath: {
          type: "string",
          title: "Input Path",
          description: "Path to input in context",
        },
        mode: {
          type: "string",
          title: "Mode",
          enum: ["map", "pick", "omit", "rename", "flatten", "unflatten"],
          default: "map",
        },
        mapping: {
          type: "array",
          title: "Field Mapping",
          description: "For map/rename modes",
          items: {
            type: "object",
            properties: {
              from: { type: "string", title: "From" },
              to: { type: "string", title: "To" },
              transform: {
                type: "string",
                title: "Transform",
                enum: ["uppercase", "lowercase", "trim", "number", "string", "boolean", "json"],
              },
            },
          },
        },
        fields: {
          type: "array",
          title: "Fields",
          description: "For pick/omit modes",
          items: { type: "string" },
        },
        separator: {
          type: "string",
          title: "Separator",
          description: "For flatten/unflatten modes",
          default: ".",
        },
      },
      required: ["mode"],
    },
    defaultData: {
      label: "Transform",
      mode: "map",
      mapping: [],
      separator: ".",
    },
  },

  "wait": {
    type: "wait",
    name: "Wait / Delay",
    description: "Pause workflow execution for a duration",
    category: "logic",
    status: "implemented",
    icon: CalendarIcon,
    color: "var(--cyber-amber)",
    component: ActionNode,
    parameters: {
      type: "object",
      properties: {
        duration: {
          type: "string",
          title: "Duration",
          description: "Wait time (e.g., '5 seconds', '1 minute', '500ms')",
          default: "5 seconds",
        },
      },
      required: ["duration"],
    },
    defaultData: {
      label: "Wait",
      duration: "5 seconds",
    },
  },

  "error-handler": {
    type: "error-handler",
    name: "Error Handler",
    description: "Handle errors from previous nodes with retry, fallback, or continue",
    category: "logic",
    status: "implemented",
    icon: GitBranchIcon,
    color: "var(--cyber-amber)",
    component: ActionNode,
    parameters: {
      type: "object",
      properties: {
        onError: {
          type: "string",
          title: "On Error",
          enum: ["continue", "stop", "retry", "fallback"],
          default: "continue",
        },
        maxRetries: {
          type: "number",
          title: "Max Retries",
          description: "For retry mode",
          default: 3,
        },
        retryDelay: {
          type: "string",
          title: "Retry Delay",
          description: "Delay between retries",
          default: "5 seconds",
        },
        fallbackValue: {
          type: "object",
          title: "Fallback Value",
          description: "Value to use for fallback mode",
        },
        errorPath: {
          type: "string",
          title: "Error Path",
          description: "Custom path to check for errors",
        },
      },
    },
    defaultData: {
      label: "Error Handler",
      onError: "continue",
      maxRetries: 3,
      retryDelay: "5 seconds",
    },
  },

  "split": {
    type: "split",
    name: "Split (Fan-out)",
    description: "Split flow into parallel branches for concurrent execution",
    category: "logic",
    status: "implemented",
    icon: GitForkIcon,
    color: "var(--cyber-amber)",
    component: SplitNode,
    hasBranches: true,
    parameters: {
      type: "object",
      properties: {
        branches: {
          type: "number",
          title: "Number of Branches",
          description: "How many parallel branches to create (2-10)",
          default: 2,
        },
      },
    },
    defaultData: {
      label: "Split",
      branches: 2,
    },
  },

  "set-variable": {
    type: "set-variable",
    name: "Set Variable",
    description: "Store or modify workflow variables with type coercion",
    category: "logic",
    status: "implemented",
    icon: VariableIcon,
    color: "var(--cyber-amber)",
    component: ActionNode,
    parameters: {
      type: "object",
      properties: {
        variables: {
          type: "array",
          title: "Variables",
          description: "Variables to set",
          items: {
            type: "object",
            properties: {
              name: { type: "string", title: "Variable Name" },
              value: { type: "string", title: "Value" },
              type: {
                type: "string",
                title: "Type",
                enum: ["auto", "string", "number", "boolean", "object", "array"],
                default: "auto",
              },
            },
          },
        },
      },
      required: ["variables"],
    },
    defaultData: {
      label: "Set Variable",
      variables: [],
    },
  },

  "parse-json": {
    type: "parse-json",
    name: "Parse JSON",
    description: "Parse JSON string to object with error handling options",
    category: "logic",
    status: "implemented",
    icon: FileJson2Icon,
    color: "var(--cyber-amber)",
    component: ActionNode,
    parameters: {
      type: "object",
      properties: {
        input: {
          type: "string",
          title: "JSON Input",
          description: "Direct JSON string to parse",
          format: "textarea",
        },
        inputPath: {
          type: "string",
          title: "Input Path",
          description: "Path to JSON string in context (e.g., steps.http-1.data.body)",
        },
        errorHandling: {
          type: "string",
          title: "Error Handling",
          enum: ["error", "default"],
          default: "error",
        },
        defaultValue: {
          type: "object",
          title: "Default Value",
          description: "Value to use if parsing fails (when error handling is 'default')",
        },
      },
    },
    defaultData: {
      label: "Parse JSON",
      errorHandling: "error",
    },
  },

  "aggregate": {
    type: "aggregate",
    name: "Aggregate",
    description: "Perform aggregations (sum, avg, count, min, max) on arrays",
    category: "logic",
    status: "implemented",
    icon: CalculatorIcon,
    color: "var(--cyber-amber)",
    component: ActionNode,
    parameters: {
      type: "object",
      properties: {
        items: {
          type: "array",
          title: "Items",
          description: "Direct array input",
        },
        itemsPath: {
          type: "string",
          title: "Items Path",
          description: "Path to array in context",
        },
        operations: {
          type: "array",
          title: "Operations",
          description: "Aggregation operations to perform",
          items: {
            type: "object",
            properties: {
              operation: {
                type: "string",
                title: "Operation",
                enum: ["count", "sum", "avg", "min", "max", "first", "last", "concat", "unique"],
              },
              field: { type: "string", title: "Field" },
              outputName: { type: "string", title: "Output Name" },
            },
          },
        },
      },
      required: ["operations"],
    },
    defaultData: {
      label: "Aggregate",
      operations: [],
    },
  },

  // ============================================
  // ACTION NODES
  // ============================================
  "http-request": {
    type: "http-request",
    name: "HTTP Request",
    description: "Make HTTP requests to external APIs",
    category: "action",
    status: "implemented",
    icon: GlobeIcon,
    color: "var(--cyber-magenta)",
    component: ActionNode,
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          title: "URL",
          format: "uri",
        },
        method: {
          type: "string",
          title: "Method",
          enum: ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"],
          default: "GET",
        },
        headers: {
          type: "object",
          title: "Headers",
        },
        body: {
          type: "object",
          title: "Body",
        },
        authentication: {
          type: "object",
          title: "Authentication",
          properties: {
            type: {
              type: "string",
              enum: ["none", "bearer", "basic", "api-key"],
            },
            token: { type: "string" },
            username: { type: "string" },
            password: { type: "string" },
            headerName: { type: "string" },
            headerValue: { type: "string" },
          },
        },
        responseType: {
          type: "string",
          title: "Response Type",
          enum: ["json", "text", "binary"],
          default: "json",
        },
        timeout: {
          type: "number",
          title: "Timeout (ms)",
          default: 30000,
        },
      },
      required: ["url"],
    },
    defaultData: {
      label: "HTTP Request",
      method: "GET",
      responseType: "json",
      timeout: 30000,
      headers: [],
    },
  },

  "email": {
    type: "email",
    name: "Send Email",
    description: "Send email via SMTP or provider",
    category: "action",
    status: "implemented",
    icon: MailIcon,
    color: "var(--cyber-magenta)",
    component: ActionNode,
    parameters: {
      type: "object",
      properties: {
        to: {
          type: "string",
          title: "To",
          format: "email",
        },
        subject: {
          type: "string",
          title: "Subject",
        },
        body: {
          type: "string",
          title: "Body",
          format: "textarea",
        },
        from: {
          type: "string",
          title: "From",
          format: "email",
        },
        provider: {
          type: "string",
          title: "Provider",
          enum: ["smtp", "sendgrid", "resend", "mailgun"],
          default: "smtp",
        },
      },
      required: ["to", "subject", "body"],
    },
    defaultData: {
      label: "Send Email",
      provider: "smtp",
    },
  },

  "notification": {
    type: "notification",
    name: "Slack Message",
    description: "Send message to Slack channel",
    category: "action",
    status: "planned",
    icon: BellIcon,
    color: "var(--cyber-magenta)",
    component: ActionNode,
    parameters: {
      type: "object",
      properties: {
        channel: {
          type: "string",
          title: "Channel",
          description: "Channel ID or name",
        },
        message: {
          type: "string",
          title: "Message",
          format: "textarea",
        },
        blocks: {
          type: "array",
          title: "Block Kit Blocks",
        },
        threadTs: {
          type: "string",
          title: "Thread Timestamp",
          description: "Reply to thread",
        },
      },
      required: ["channel", "message"],
    },
    defaultData: {
      label: "Slack Message",
    },
  },

  "discord": {
    type: "discord",
    name: "Discord Message",
    description: "Send message to Discord via webhook",
    category: "action",
    status: "implemented",
    icon: MessageCircleIcon,
    color: "var(--cyber-magenta)",
    component: ActionNode,
    parameters: {
      type: "object",
      properties: {
        webhookUrl: {
          type: "string",
          title: "Webhook URL",
          description: "Discord webhook URL",
          format: "uri",
        },
        content: {
          type: "string",
          title: "Message Content",
          format: "textarea",
        },
        username: {
          type: "string",
          title: "Username Override",
          description: "Override the webhook's default username",
        },
        avatarUrl: {
          type: "string",
          title: "Avatar URL",
          description: "Override the webhook's default avatar",
          format: "uri",
        },
        embeds: {
          type: "array",
          title: "Embeds",
          description: "Rich embed objects",
        },
      },
      required: ["webhookUrl"],
    },
    defaultData: {
      label: "Discord",
    },
  },

  "telegram": {
    type: "telegram",
    name: "Telegram Message",
    description: "Send message via Telegram bot",
    category: "action",
    status: "implemented",
    icon: SendIcon,
    color: "var(--cyber-cyan)",
    component: ActionNode,
    parameters: {
      type: "object",
      properties: {
        botToken: {
          type: "string",
          title: "Bot Token",
          description: "Telegram bot API token",
        },
        chatId: {
          type: "string",
          title: "Chat ID",
          description: "Target chat/user ID",
        },
        text: {
          type: "string",
          title: "Message Text",
          format: "textarea",
        },
        parseMode: {
          type: "string",
          title: "Parse Mode",
          enum: ["HTML", "Markdown", "MarkdownV2"],
          default: "HTML",
        },
        disableNotification: {
          type: "boolean",
          title: "Silent Message",
          default: false,
        },
      },
      required: ["botToken", "chatId", "text"],
    },
    defaultData: {
      label: "Telegram",
      parseMode: "HTML",
      disableNotification: false,
    },
  },

  "d1-query": {
    type: "d1-query",
    name: "D1 Query",
    description: "Execute SQL query on Cloudflare D1 database",
    category: "action",
    status: "implemented",
    icon: DatabaseIcon,
    color: "var(--cyber-magenta)",
    component: ActionNode,
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          title: "SQL Query",
          description: "SQL query to execute",
          format: "code",
        },
        params: {
          type: "array",
          title: "Query Parameters",
          description: "Bound parameters for prepared statement",
        },
        operation: {
          type: "string",
          title: "Operation Type",
          enum: ["all", "first", "run"],
          default: "all",
        },
        database: {
          type: "string",
          title: "Database Binding",
          description: "D1 database binding name",
        },
      },
      required: ["query"],
    },
    defaultData: {
      label: "D1 Query",
      operation: "all",
    },
  },

  "r2-storage": {
    type: "r2-storage",
    name: "R2 Storage",
    description: "Upload, download, or manage objects in Cloudflare R2",
    category: "action",
    status: "implemented",
    icon: HardDriveIcon,
    color: "var(--cyber-magenta)",
    component: ActionNode,
    parameters: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          title: "Operation",
          enum: ["get", "put", "delete", "list", "head"],
          default: "get",
        },
        key: {
          type: "string",
          title: "Object Key",
          description: "Object key/path in bucket",
        },
        content: {
          type: "string",
          title: "Content",
          description: "Content to upload (for put operation)",
          format: "textarea",
        },
        contentType: {
          type: "string",
          title: "Content Type",
          description: "MIME type for upload",
        },
        prefix: {
          type: "string",
          title: "Prefix",
          description: "Prefix filter for list operation",
        },
        limit: {
          type: "number",
          title: "Limit",
          description: "Max objects to list",
          default: 100,
        },
        bucket: {
          type: "string",
          title: "Bucket Binding",
          description: "R2 bucket binding name",
        },
      },
      required: ["operation"],
    },
    defaultData: {
      label: "R2 Storage",
      operation: "get",
    },
  },

  // ============================================
  // HUMAN NODES
  // ============================================
  "approval": {
    type: "approval",
    name: "Wait for Approval",
    description: "Pause workflow until human approval",
    category: "human",
    status: "planned",
    icon: UserCheckIcon,
    color: "var(--cyber-cyan)",
    component: ActionNode,
    parameters: {
      type: "object",
      properties: {
        message: {
          type: "string",
          title: "Message",
          description: "Approval request message",
          format: "textarea",
        },
        approvers: {
          type: "array",
          title: "Approvers",
          description: "Allowed approver user IDs",
          items: { type: "string" },
        },
        timeout: {
          type: "string",
          title: "Timeout",
          default: "24h",
        },
        notificationChannel: {
          type: "string",
          title: "Notification Channel",
        },
      },
      required: ["message"],
    },
    defaultData: {
      label: "Approval",
      timeout: "24h",
    },
  },

  "form": {
    type: "form",
    name: "Form Input",
    description: "Collect user input via form",
    category: "human",
    status: "future",
    icon: StickyNoteIcon,
    color: "var(--cyber-cyan)",
    component: ActionNode,
    parameters: {
      type: "object",
      properties: {
        fields: {
          type: "array",
          title: "Form Fields",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              label: { type: "string" },
              type: { type: "string", enum: ["text", "number", "email", "textarea", "select"] },
              required: { type: "boolean" },
            },
          },
        },
        timeout: {
          type: "string",
          title: "Timeout",
          default: "24h",
        },
      },
      required: ["fields"],
    },
    defaultData: {
      label: "Form",
      fields: [],
      timeout: "24h",
    },
  },

  // ============================================
  // CODE NODES
  // ============================================
  "javascript": {
    type: "javascript",
    name: "JavaScript Code",
    description: "Execute custom JavaScript code",
    category: "code",
    status: "implemented",
    icon: CodeIcon,
    color: "var(--cyber-amber)",
    component: ActionNode,
    parameters: {
      type: "object",
      properties: {
        code: {
          type: "string",
          title: "Code",
          format: "code",
        },
        inputs: {
          type: "object",
          title: "Input Mappings",
          description: "Map context values to input variables",
        },
      },
      required: ["code"],
    },
    defaultData: {
      label: "JavaScript",
      code: "// Access previous step data\nconst data = steps['http-request-123'].data;\n\n// Return result\nreturn {\n  processed: true,\n  count: data.items?.length || 0\n};",
      inputs: {},
    },
  },

  "python": {
    type: "python",
    name: "Python Code",
    description: "Execute Python code in sandbox",
    category: "code",
    status: "future",
    icon: FileCodeIcon,
    color: "var(--cyber-amber)",
    component: ActionNode,
    parameters: {
      type: "object",
      properties: {
        code: {
          type: "string",
          title: "Code",
          format: "code",
        },
        inputs: {
          type: "object",
          title: "Input Mappings",
        },
        packages: {
          type: "array",
          title: "pip Packages",
          items: { type: "string" },
        },
      },
      required: ["code"],
    },
    defaultData: {
      label: "Python",
      code: "# Access previous step data\ndata = steps['http-request-123']['data']\n\n# Return result\nresult = {\n    'processed': True,\n    'count': len(data.get('items', []))\n}",
      inputs: {},
      packages: [],
    },
  },
};

/**
 * Get node registry entry by type
 */
export function getNodeDefinition(type: WorkflowNodeType): NodeRegistryEntry | undefined {
  return NODE_REGISTRY[type];
}

/**
 * Get all nodes by category
 */
export function getNodesByCategory(category: WorkflowNodeCategory): NodeRegistryEntry[] {
  return Object.values(NODE_REGISTRY).filter(node => node.category === category);
}

/**
 * Get all implemented nodes
 */
export function getImplementedNodes(): NodeRegistryEntry[] {
  return Object.values(NODE_REGISTRY).filter(node => node.status === "implemented");
}

/**
 * Get all trigger nodes
 */
export function getTriggerNodes(): NodeRegistryEntry[] {
  return Object.values(NODE_REGISTRY).filter(node => node.isTrigger);
}

/**
 * Get default data for a node type
 */
export function getDefaultNodeData(type: WorkflowNodeType): Record<string, unknown> {
  const entry = NODE_REGISTRY[type];
  if (!entry) {
    return { label: type };
  }
  return { ...entry.defaultData };
}

/**
 * Get SvelteFlow node type mapping
 */
export function getSvelteFlowNodeType(type: WorkflowNodeType): string {
  const entry = NODE_REGISTRY[type];
  if (!entry) return "default";
  
  if (entry.isTrigger) return "trigger";
  if (type === "switch") return "switch";
  if (entry.hasBranches) return "condition";
  if (entry.category === "ai") return "ai-agent";
  return "action";
}

/**
 * Check if a node type is implemented
 */
export function isNodeImplemented(type: WorkflowNodeType): boolean {
  const entry = NODE_REGISTRY[type];
  return entry?.status === "implemented";
}

/**
 * Get grouped nodes for palette display
 */
export function getGroupedNodesForPalette(): Array<{
  category: NodeCategoryInfo;
  nodes: NodeRegistryEntry[];
}> {
  return NODE_CATEGORIES.map(category => ({
    category,
    nodes: getNodesByCategory(category.id),
  }));
}
