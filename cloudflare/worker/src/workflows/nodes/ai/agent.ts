import OpenAI from "openai";
import type { NodeExecutor } from "../base";
import { createStepResult, createErrorResult } from "../base";
import type { NodeExecutionParams, WorkflowEnv } from "../../utils/context";
import type { AIProvider, ChatMessage } from "./types";
import { AIProviderError, AIErrorCodes } from "./types";
import type { ToolDefinition, ToolCallResult } from "./tools";
import { toOpenAITools, getBuiltinTool, getAllBuiltinTools } from "./tools";

const DEFAULT_MAX_ITERATIONS = 10;
const DEFAULT_TIMEOUT = 120000;

export interface AIAgentParams {
  provider: AIProvider;
  model: string;
  systemPrompt?: string;
  prompt: string;
  tools?: AgentToolConfig[];
  useBuiltinTools?: boolean;
  maxIterations?: number;
  temperature?: number;
  maxTokens?: number;
  apiKey?: string;
  baseUrl?: string;
}

export interface AgentToolConfig {
  type: "builtin" | "custom";
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
  config?: Record<string, unknown>;
}

interface AgentState {
  messages: ChatMessage[];
  toolCalls: ToolCallResult[];
  iterations: number;
  finished: boolean;
  finalResponse: string;
}

export const aiAgentExecutor: NodeExecutor = {
  type: "ai-agent-tools",
  category: "ai",

  validate(params: Record<string, unknown>) {
    const errors: string[] = [];

    if (!params.provider || typeof params.provider !== "string") {
      errors.push("Provider is required");
    }

    if (!params.model || typeof params.model !== "string") {
      errors.push("Model is required");
    }

    if (!params.prompt || typeof params.prompt !== "string") {
      errors.push("Prompt is required");
    }

    const provider = params.provider as string;
    if (provider && provider !== "openai") {
      errors.push("Tool calling currently only supports OpenAI provider");
    }

    return errors;
  },

  async execute(params: NodeExecutionParams) {
    const p = params.parameters as unknown as Partial<AIAgentParams>;

    if (!p.provider) {
      return createErrorResult("Provider is required");
    }

    if (!p.model) {
      return createErrorResult("Model is required");
    }

    if (!p.prompt) {
      return createErrorResult("Prompt is required");
    }

    if (p.provider !== "openai") {
      return createErrorResult("Tool calling currently only supports OpenAI provider");
    }

    const apiKey = p.apiKey || getEnvApiKey(params.context.env);
    if (!apiKey) {
      return createErrorResult("OpenAI API key is required for agent");
    }

    const tools = resolveTools(p.tools, p.useBuiltinTools ?? true);
    if (tools.length === 0) {
      return createErrorResult("At least one tool is required for agent");
    }

    const maxIterations = p.maxIterations || DEFAULT_MAX_ITERATIONS;

    try {
      const result = await runAgentLoop({
        apiKey,
        baseUrl: p.baseUrl,
        model: p.model,
        systemPrompt: p.systemPrompt,
        prompt: p.prompt,
        tools,
        maxIterations,
        temperature: p.temperature,
        maxTokens: p.maxTokens,
      });

      return createStepResult({
        response: result.finalResponse,
        iterations: result.iterations,
        toolCalls: result.toolCalls,
        messages: result.messages,
      });
    } catch (err) {
      if (err instanceof AIProviderError) {
        return createErrorResult(`Agent error: ${err.message}`);
      }
      const message = err instanceof Error ? err.message : "Unknown agent error";
      return createErrorResult(`Agent error: ${message}`);
    }
  },
};

function resolveTools(
  toolConfigs: AgentToolConfig[] | undefined,
  useBuiltinTools: boolean
): ToolDefinition[] {
  const tools: ToolDefinition[] = [];

  if (useBuiltinTools) {
    tools.push(...getAllBuiltinTools());
  }

  if (toolConfigs) {
    for (const config of toolConfigs) {
      if (config.type === "builtin") {
        const tool = getBuiltinTool(config.name);
        if (tool && !tools.find((t) => t.name === config.name)) {
          tools.push(tool);
        }
      }
    }
  }

  return tools;
}

interface AgentLoopParams {
  apiKey: string;
  baseUrl?: string;
  model: string;
  systemPrompt?: string;
  prompt: string;
  tools: ToolDefinition[];
  maxIterations: number;
  temperature?: number;
  maxTokens?: number;
}

async function runAgentLoop(params: AgentLoopParams): Promise<AgentState> {
  const client = new OpenAI({
    apiKey: params.apiKey,
    baseURL: params.baseUrl,
    timeout: DEFAULT_TIMEOUT,
  });

  const state: AgentState = {
    messages: [],
    toolCalls: [],
    iterations: 0,
    finished: false,
    finalResponse: "",
  };

  if (params.systemPrompt) {
    state.messages.push({ role: "system", content: params.systemPrompt });
  }
  state.messages.push({ role: "user", content: params.prompt });

  const openaiTools = toOpenAITools(params.tools);
  const toolMap = new Map(params.tools.map((t) => [t.name, t]));

  while (!state.finished && state.iterations < params.maxIterations) {
    state.iterations++;

    const response = await client.chat.completions.create({
      model: params.model,
      messages: state.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })) as OpenAI.ChatCompletionMessageParam[],
      tools: openaiTools,
      tool_choice: "auto",
      temperature: params.temperature,
      max_tokens: params.maxTokens,
    });

    const choice = response.choices[0];
    if (!choice) {
      throw new AIProviderError("No response from OpenAI", "openai", AIErrorCodes.UNKNOWN, 500, true);
    }

    const message = choice.message;

    if (message.tool_calls && message.tool_calls.length > 0) {
      state.messages.push({
        role: "assistant",
        content: message.content || "",
      });

      const toolResults = await executeToolCalls(message.tool_calls, toolMap);
      state.toolCalls.push(...toolResults);

      for (const result of toolResults) {
        state.messages.push({
          role: "user",
          content: `Tool "${result.name}" result: ${JSON.stringify(result.result)}`,
        });
      }
    } else {
      state.finished = true;
      state.finalResponse = message.content || "";
      state.messages.push({
        role: "assistant",
        content: state.finalResponse,
      });
    }

    if (choice.finish_reason === "stop" && !message.tool_calls) {
      state.finished = true;
    }
  }

  if (!state.finished) {
    state.finalResponse = `Agent reached maximum iterations (${params.maxIterations}). Last response: ${state.messages[state.messages.length - 1]?.content || "none"}`;
  }

  return state;
}

async function executeToolCalls(
  toolCalls: OpenAI.ChatCompletionMessageToolCall[],
  toolMap: Map<string, ToolDefinition>
): Promise<ToolCallResult[]> {
  const results: ToolCallResult[] = [];

  for (const call of toolCalls) {
    const tool = toolMap.get(call.function.name);
    if (!tool) {
      results.push({
        toolCallId: call.id,
        name: call.function.name,
        result: { success: false, error: `Unknown tool: ${call.function.name}` },
      });
      continue;
    }

    let args: Record<string, unknown>;
    try {
      args = JSON.parse(call.function.arguments);
    } catch {
      args = {};
    }

    const result = await tool.execute(args);
    results.push({
      toolCallId: call.id,
      name: call.function.name,
      result,
    });
  }

  return results;
}

function getEnvApiKey(env: WorkflowEnv): string | undefined {
  return env.OPENAI_API_KEY;
}
