/**
 * MCP Knowledge Routes
 *
 * Serves as an MCP (Model Context Protocol) server endpoint for the
 * onboarding agent to query the knowledge base.
 *
 * MCP Protocol:
 * - POST /api/mcp/knowledge
 *   - method: "tools/list" - List available tools
 *   - method: "tools/call" - Execute a tool
 */

import { Hono } from "hono";
import { createLogger } from "../utils/logger";
import { knowledgeService } from "../services/knowledge-service";
import { onboardingAgentService } from "../services/onboarding-agent-service";
import { modelSelectionService } from "../services/model-selection-service";
import type {
  McpToolDefinition,
  McpToolCallResponse,
  KnowledgeCategory,
} from "@agentpod/types";

const log = createLogger("mcp-knowledge-routes");

// =============================================================================
// MCP Tool Definitions
// =============================================================================

const MCP_TOOLS: McpToolDefinition[] = [
  {
    name: "search_knowledge",
    description: "Search the knowledge base for documents matching a query. Returns project templates, agent patterns, command templates, best practices, and more.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query to find relevant knowledge documents",
        },
        category: {
          type: "string",
          description: "Optional category to filter results",
          enum: ["project_template", "agent_pattern", "command_template", "best_practice", "workflow_example", "troubleshooting"],
        },
        tags: {
          type: "array",
          description: "Optional tags to filter results",
          items: { type: "string" },
        },
        limit: {
          type: "number",
          description: "Maximum number of results to return (default: 10)",
          default: 10,
        },
        useSemanticSearch: {
          type: "boolean",
          description: "Whether to use semantic search (default: false)",
          default: false,
        },
      },
      required: [],
    },
  },
  {
    name: "get_project_template",
    description: "Get a project template for a specific project type. Returns setup instructions, configuration examples, and best practices for the project type.",
    inputSchema: {
      type: "object",
      properties: {
        project_type: {
          type: "string",
          description: "The project type (e.g., web_app, api_service, cli_tool, library, mobile_app, desktop_app)",
        },
      },
      required: ["project_type"],
    },
  },
  {
    name: "get_agent_pattern",
    description: "Get an agent pattern definition for a specific role. Returns the agent configuration including prompt, tools, and permissions.",
    inputSchema: {
      type: "object",
      properties: {
        role: {
          type: "string",
          description: "The agent role (e.g., reviewer, architect, tester, documenter)",
        },
      },
      required: ["role"],
    },
  },
  {
    name: "get_command_template",
    description: "Get a command template for a specific command name. Returns the command definition including prompt and configuration.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "The command name (e.g., test, build, deploy, review)",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "list_project_types",
    description: "List all available project types with their descriptions. Use this to help users choose the right project type for their workspace.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "get_available_models",
    description: "Get available AI models for the user. Returns model recommendations and available models based on configured providers.",
    inputSchema: {
      type: "object",
      properties: {
        capability: {
          type: "string",
          description: "Filter by capability (e.g., code, chat, vision)",
        },
        tier: {
          type: "string",
          description: "Filter by tier (e.g., free, pro, enterprise)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_provider_setup_guide",
    description: "Get setup instructions for a specific AI provider. Returns step-by-step guide for configuring the provider.",
    inputSchema: {
      type: "object",
      properties: {
        provider: {
          type: "string",
          description: "The provider ID (e.g., anthropic, openai, google, aws)",
        },
      },
      required: ["provider"],
    },
  },
];

// =============================================================================
// Provider Setup Guides
// =============================================================================

const PROVIDER_SETUP_GUIDES: Record<string, {
  provider: string;
  name: string;
  steps: string[];
  links: { title: string; url: string }[];
}> = {
  anthropic: {
    provider: "anthropic",
    name: "Anthropic (Claude)",
    steps: [
      "Go to https://console.anthropic.com",
      "Sign in or create an account",
      "Navigate to 'API Keys' in the dashboard",
      "Click 'Create Key' to generate a new API key",
      "Copy the API key and store it securely",
      "Configure the API key in AgentPod settings",
    ],
    links: [
      { title: "Anthropic Console", url: "https://console.anthropic.com" },
      { title: "API Documentation", url: "https://docs.anthropic.com" },
    ],
  },
  openai: {
    provider: "openai",
    name: "OpenAI (GPT-4)",
    steps: [
      "Go to https://platform.openai.com",
      "Sign in or create an account",
      "Navigate to 'API Keys' in your profile settings",
      "Click 'Create new secret key'",
      "Copy the API key and store it securely",
      "Configure the API key in AgentPod settings",
    ],
    links: [
      { title: "OpenAI Platform", url: "https://platform.openai.com" },
      { title: "API Documentation", url: "https://platform.openai.com/docs" },
    ],
  },
  google: {
    provider: "google",
    name: "Google (Gemini)",
    steps: [
      "Go to https://aistudio.google.com",
      "Sign in with your Google account",
      "Navigate to 'Get API key'",
      "Create a new API key",
      "Copy the API key and store it securely",
      "Configure the API key in AgentPod settings",
    ],
    links: [
      { title: "Google AI Studio", url: "https://aistudio.google.com" },
      { title: "Gemini Documentation", url: "https://ai.google.dev/docs" },
    ],
  },
  aws: {
    provider: "aws",
    name: "AWS Bedrock",
    steps: [
      "Go to AWS Console and navigate to Amazon Bedrock",
      "Request access to the models you want to use",
      "Create IAM credentials with Bedrock permissions",
      "Configure AWS credentials (access key and secret)",
      "Set up the AWS region for Bedrock",
      "Configure the credentials in AgentPod settings",
    ],
    links: [
      { title: "AWS Bedrock", url: "https://aws.amazon.com/bedrock" },
      { title: "Bedrock Documentation", url: "https://docs.aws.amazon.com/bedrock" },
    ],
  },
  groq: {
    provider: "groq",
    name: "Groq",
    steps: [
      "Go to https://console.groq.com",
      "Sign in or create an account",
      "Navigate to 'API Keys'",
      "Create a new API key",
      "Copy the API key and store it securely",
      "Configure the API key in AgentPod settings",
    ],
    links: [
      { title: "Groq Console", url: "https://console.groq.com" },
      { title: "Groq Documentation", url: "https://console.groq.com/docs" },
    ],
  },
};

// =============================================================================
// Tool Handlers
// =============================================================================

async function handleSearchKnowledge(args: Record<string, unknown>): Promise<McpToolCallResponse> {
  const query = args.query as string | undefined;
  const category = args.category as KnowledgeCategory | undefined;
  const tags = args.tags as string[] | undefined;
  const limit = (args.limit as number) || 10;
  const useSemanticSearch = (args.useSemanticSearch as boolean) || false;

  const results = await knowledgeService.search({
    query,
    category,
    tags,
    limit,
    useSemanticSearch,
  });

  return {
    content: [{
      type: "text",
      text: JSON.stringify(results),
    }],
  };
}

async function handleGetProjectTemplate(args: Record<string, unknown>): Promise<McpToolCallResponse> {
  const projectType = args.project_type as string;
  
  if (!projectType) {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: "project_type is required" }) }],
      isError: true,
    };
  }

  const template = await onboardingAgentService.loadProjectTemplate(projectType);

  return {
    content: [{
      type: "text",
      text: JSON.stringify(template),
    }],
  };
}

async function handleGetAgentPattern(args: Record<string, unknown>): Promise<McpToolCallResponse> {
  const role = args.role as string;
  
  if (!role) {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: "role is required" }) }],
      isError: true,
    };
  }

  const pattern = await onboardingAgentService.loadAgentPattern(role);

  return {
    content: [{
      type: "text",
      text: JSON.stringify(pattern),
    }],
  };
}

async function handleGetCommandTemplate(args: Record<string, unknown>): Promise<McpToolCallResponse> {
  const name = args.name as string;
  
  if (!name) {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: "name is required" }) }],
      isError: true,
    };
  }

  const template = await onboardingAgentService.loadCommandTemplate(name);

  return {
    content: [{
      type: "text",
      text: JSON.stringify(template),
    }],
  };
}

async function handleListProjectTypes(): Promise<McpToolCallResponse> {
  const types = await onboardingAgentService.listProjectTypes();

  return {
    content: [{
      type: "text",
      text: JSON.stringify(types),
    }],
  };
}

async function handleGetAvailableModels(args: Record<string, unknown>): Promise<McpToolCallResponse> {
  const capability = args.capability as string | undefined;
  const _tier = args.tier as string | undefined;

  // Get recommendation which includes available models
  const recommendation = await modelSelectionService.getRecommendation({
    projectType: capability === "code" ? "web_app" : undefined,
    preferLowCost: false,
    preferFast: false,
    requireLargeContext: false,
    configuredProvidersOnly: false,
  });

  // Build models list with recommendation
  const result = {
    models: [
      {
        id: recommendation.primaryModelId,
        name: recommendation.primaryModelName,
        provider: recommendation.primaryProvider,
        isRecommended: true,
        capabilities: ["code", "chat"],
      },
      ...(recommendation.smallModelId ? [{
        id: recommendation.smallModelId,
        name: recommendation.smallModelName || recommendation.smallModelId,
        provider: recommendation.smallProvider || recommendation.primaryProvider,
        isRecommended: false,
        isSmall: true,
        capabilities: ["chat"],
      }] : []),
      ...recommendation.alternativeModelIds.map(id => ({
        id,
        name: id,
        provider: id.split("/")[0] || "unknown",
        isRecommended: false,
        capabilities: ["code", "chat"],
      })),
    ],
    recommendation: {
      primary: recommendation.primaryModelId,
      small: recommendation.smallModelId,
      reasoning: recommendation.reasoning,
    },
  };

  return {
    content: [{
      type: "text",
      text: JSON.stringify(result),
    }],
  };
}

async function handleGetProviderSetupGuide(args: Record<string, unknown>): Promise<McpToolCallResponse> {
  const provider = args.provider as string;
  
  if (!provider) {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: "provider is required" }) }],
      isError: true,
    };
  }

  const guide = PROVIDER_SETUP_GUIDES[provider.toLowerCase()];

  if (!guide) {
    // Return a generic guide for unknown providers
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          provider,
          name: provider,
          steps: [
            "Visit the provider's website",
            "Sign in or create an account",
            "Navigate to API settings or developer portal",
            "Generate an API key",
            "Configure the API key in AgentPod settings",
          ],
          links: [],
        }),
      }],
    };
  }

  return {
    content: [{
      type: "text",
      text: JSON.stringify(guide),
    }],
  };
}

// =============================================================================
// Routes
// =============================================================================

export const mcpKnowledgeRoutes = new Hono()
  /**
   * POST /api/mcp/knowledge
   * MCP endpoint for knowledge base tools
   */
  .post("/", async (c) => {
    try {
      const body = await c.req.json();
      const method = body.method as string;

      log.debug("MCP request received", { method });

      // Handle tools/list
      if (method === "tools/list") {
        return c.json({ tools: MCP_TOOLS });
      }

      // Handle tools/call
      if (method === "tools/call") {
        const params = body.params as { name: string; arguments: Record<string, unknown> };
        
        if (!params?.name) {
          return c.json({
            content: [{ type: "text", text: "Tool name is required" }],
            isError: true,
          });
        }

        const toolName = params.name;
        const args = params.arguments || {};

        log.debug("MCP tool call", { tool: toolName, args });

        // Route to appropriate handler
        let response: McpToolCallResponse;

        switch (toolName) {
          case "search_knowledge":
            response = await handleSearchKnowledge(args);
            break;
          case "get_project_template":
            response = await handleGetProjectTemplate(args);
            break;
          case "get_agent_pattern":
            response = await handleGetAgentPattern(args);
            break;
          case "get_command_template":
            response = await handleGetCommandTemplate(args);
            break;
          case "list_project_types":
            response = await handleListProjectTypes();
            break;
          case "get_available_models":
            response = await handleGetAvailableModels(args);
            break;
          case "get_provider_setup_guide":
            response = await handleGetProviderSetupGuide(args);
            break;
          default:
            response = {
              content: [{ type: "text", text: `Unknown tool: ${toolName}` }],
              isError: true,
            };
        }

        return c.json(response);
      }

      // Unknown method
      return c.json({ error: `Unknown method: ${method}` }, 400);
    } catch (error) {
      log.error("MCP request failed", { error });
      return c.json({
        content: [{ type: "text", text: `Internal error: ${error instanceof Error ? error.message : "Unknown error"}` }],
        isError: true,
      }, 500);
    }
  });
