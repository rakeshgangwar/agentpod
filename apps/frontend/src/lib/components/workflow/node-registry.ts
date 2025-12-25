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
import TriggerNode from "./nodes/TriggerNode.svelte";
import ActionNode from "./nodes/ActionNode.svelte";
import AIAgentNode from "./nodes/AIAgentNode.svelte";
import ConditionNode from "./nodes/ConditionNode.svelte";

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
  "ai-agent": {
    type: "ai-agent",
    name: "AI Agent",
    description: "Execute AI agent in Cloudflare Sandbox",
    category: "ai",
    status: "implemented",
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
    name: "AI Prompt",
    description: "Direct LLM call without sandbox",
    category: "ai",
    status: "implemented",
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
    component: ConditionNode,
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
    status: "planned",
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

  "database": {
    type: "database",
    name: "D1 Query",
    description: "Execute SQL query on Cloudflare D1",
    category: "action",
    status: "planned",
    icon: DatabaseIcon,
    color: "var(--cyber-magenta)",
    component: ActionNode,
    parameters: {
      type: "object",
      properties: {
        database: {
          type: "string",
          title: "Database",
          description: "D1 database binding",
        },
        query: {
          type: "string",
          title: "SQL Query",
          format: "code",
        },
        params: {
          type: "array",
          title: "Parameters",
        },
      },
      required: ["database", "query"],
    },
    defaultData: {
      label: "D1 Query",
    },
  },

  "storage": {
    type: "storage",
    name: "R2 Storage",
    description: "Upload/download from Cloudflare R2",
    category: "action",
    status: "planned",
    icon: UploadIcon,
    color: "var(--cyber-magenta)",
    component: ActionNode,
    parameters: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          title: "Operation",
          enum: ["upload", "download", "delete", "list"],
        },
        bucket: {
          type: "string",
          title: "Bucket",
        },
        key: {
          type: "string",
          title: "Key/Path",
        },
        content: {
          type: "string",
          title: "Content",
        },
        contentType: {
          type: "string",
          title: "Content Type",
        },
      },
      required: ["operation", "bucket"],
    },
    defaultData: {
      label: "R2 Storage",
      operation: "upload",
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
  
  // Map to SvelteFlow node types based on category
  if (entry.isTrigger) return "trigger";
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
