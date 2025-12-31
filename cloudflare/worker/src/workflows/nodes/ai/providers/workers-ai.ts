import type {
  AIProviderInterface,
  ChatRequest,
  ChatResponse,
  ProviderConfig,
} from "../types";
import { AIProviderError, AIErrorCodes } from "../types";

interface WorkersAIBinding {
  run(
    model: string,
    input: {
      messages: Array<{ role: string; content: string }>;
      max_tokens?: number;
      temperature?: number;
      top_p?: number;
      stream?: boolean;
    }
  ): Promise<{
    response: string;
  }>;
}

export const workersAIProvider: AIProviderInterface = {
  name: "workers-ai",

  validateConfig(config: ProviderConfig): string[] {
    const errors: string[] = [];
    if (!config.aiBinding) {
      errors.push("Workers AI binding is required");
    }
    return errors;
  },

  async chat(request: ChatRequest, config: ProviderConfig): Promise<ChatResponse> {
    const errors = this.validateConfig(config);
    if (errors.length > 0) {
      throw new AIProviderError(
        errors.join(", "),
        "workers-ai",
        AIErrorCodes.INVALID_REQUEST,
        400,
        false
      );
    }

    const ai = config.aiBinding as WorkersAIBinding;

    try {
      const response = await ai.run(request.model, {
        messages: request.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        max_tokens: request.maxTokens,
        temperature: request.temperature,
        top_p: request.topP,
        stream: false,
      });

      return {
        response: response.response,
        model: request.model,
        provider: "workers-ai",
        usage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
        },
        finishReason: "stop",
        metadata: {
          note: "Workers AI does not provide token usage",
        },
      };
    } catch (err) {
      if (err instanceof AIProviderError) {
        throw err;
      }

      const message = err instanceof Error ? err.message : "Unknown error";
      
      if (message.includes("model") && message.includes("not found")) {
        throw new AIProviderError(message, "workers-ai", AIErrorCodes.MODEL_NOT_FOUND, 404, false);
      }

      throw new AIProviderError(message, "workers-ai", AIErrorCodes.UNKNOWN, 500, true);
    }
  },
};
