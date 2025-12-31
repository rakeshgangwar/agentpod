import type { NodeExecutor } from "../base";
import { createStepResult, createErrorResult } from "../base";
import type { NodeExecutionParams, WorkflowEnv } from "../../utils/context";
import type { AIChatParams, AIProvider, ChatMessage, ProviderConfig } from "./types";
import { openaiProvider } from "./providers/openai";
import { anthropicProvider } from "./providers/anthropic";
import { ollamaProvider } from "./providers/ollama";
import { workersAIProvider } from "./providers/workers-ai";

const providers = {
  openai: openaiProvider,
  anthropic: anthropicProvider,
  ollama: ollamaProvider,
  "workers-ai": workersAIProvider,
} as const;

function getProvider(name: AIProvider) {
  if (name === "google") {
    return null;
  }
  return providers[name] || null;
}

export const aiChatExecutor: NodeExecutor = {
  type: "ai-chat",
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
      if (!params.messages || !Array.isArray(params.messages)) {
        errors.push("Prompt or messages is required");
      }
    }

    const validProviders: AIProvider[] = ["openai", "anthropic", "ollama", "workers-ai", "google"];
    if (params.provider && !validProviders.includes(params.provider as AIProvider)) {
      errors.push(`Invalid provider: ${params.provider}. Valid options: ${validProviders.join(", ")}`);
    }

    return errors;
  },

  async execute(params: NodeExecutionParams) {
    const p = params.parameters as unknown as Partial<AIChatParams>;

    if (!p.provider) {
      return createErrorResult("Provider is required");
    }

    if (!p.model) {
      return createErrorResult("Model is required");
    }

    if (!p.prompt && (!p.messages || p.messages.length === 0)) {
      return createErrorResult("Prompt or messages is required");
    }

    const provider = getProvider(p.provider);
    if (!provider) {
      return createErrorResult(`Provider "${p.provider}" is not supported yet`);
    }

    const messages: ChatMessage[] = buildMessages(p);

    const config: ProviderConfig = {
      apiKey: p.apiKey || getEnvApiKey(p.provider, params.context.env),
      baseUrl: p.baseUrl || getEnvBaseUrl(p.provider, params.context.env),
      aiBinding: p.provider === "workers-ai" ? params.context.env.AI : undefined,
    };

    const validationErrors = provider.validateConfig(config);
    if (validationErrors.length > 0) {
      return createErrorResult(validationErrors.join(", "));
    }

    try {
      const response = await provider.chat(
        {
          model: p.model,
          messages,
          temperature: p.temperature,
          maxTokens: p.maxTokens,
          topP: p.topP,
          frequencyPenalty: p.frequencyPenalty,
          presencePenalty: p.presencePenalty,
          stop: p.stop,
          responseFormat: p.responseFormat,
          jsonSchema: p.jsonSchema,
        },
        config
      );

      let parsedResponse: unknown = response.response;
      if (p.responseFormat === "json") {
        try {
          parsedResponse = JSON.parse(response.response);
        } catch {
          parsedResponse = response.response;
        }
      }

      return createStepResult({
        response: parsedResponse,
        rawResponse: response.response,
        model: response.model,
        provider: response.provider,
        usage: response.usage,
        finishReason: response.finishReason,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown AI error";
      return createErrorResult(`AI Chat error: ${message}`);
    }
  },
};

function buildMessages(params: Partial<AIChatParams>): ChatMessage[] {
  if (params.messages && params.messages.length > 0) {
    return params.messages;
  }

  const messages: ChatMessage[] = [];

  if (params.systemPrompt) {
    messages.push({ role: "system", content: params.systemPrompt });
  }

  if (params.prompt) {
    messages.push({ role: "user", content: params.prompt });
  }

  return messages;
}

function getEnvApiKey(provider: AIProvider, env: WorkflowEnv): string | undefined {
  switch (provider) {
    case "openai":
      return env.OPENAI_API_KEY;
    case "anthropic":
      return env.ANTHROPIC_API_KEY;
    case "google":
      return env.GOOGLE_API_KEY;
    default:
      return undefined;
  }
}

function getEnvBaseUrl(provider: AIProvider, env: WorkflowEnv): string | undefined {
  if (provider === "ollama") {
    return env.OLLAMA_BASE_URL || "http://localhost:11434";
  }
  return undefined;
}
