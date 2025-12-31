import Anthropic from "@anthropic-ai/sdk";
import type {
  AIProviderInterface,
  ChatRequest,
  ChatResponse,
  ChatMessage,
  ProviderConfig,
} from "../types";
import { AIProviderError, AIErrorCodes } from "../types";

const DEFAULT_TIMEOUT = 60000;
const DEFAULT_MAX_TOKENS = 4096;

export const anthropicProvider: AIProviderInterface = {
  name: "anthropic",

  validateConfig(config: ProviderConfig): string[] {
    const errors: string[] = [];
    if (!config.apiKey) {
      errors.push("Anthropic API key is required");
    }
    return errors;
  },

  async chat(request: ChatRequest, config: ProviderConfig): Promise<ChatResponse> {
    const errors = this.validateConfig(config);
    if (errors.length > 0) {
      throw new AIProviderError(
        errors.join(", "),
        "anthropic",
        AIErrorCodes.INVALID_API_KEY,
        401,
        false
      );
    }

    const client = new Anthropic({
      apiKey: config.apiKey!,
      baseURL: config.baseUrl,
      timeout: config.timeout || DEFAULT_TIMEOUT,
    });

    const { systemPrompt, messages } = extractSystemPrompt(request.messages);

    try {
      const response = await client.messages.create({
        model: request.model,
        max_tokens: request.maxTokens || DEFAULT_MAX_TOKENS,
        system: systemPrompt,
        messages: messages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
        temperature: request.temperature,
        top_p: request.topP,
        stop_sequences: request.stop,
      });

      const textContent = response.content.find((c) => c.type === "text");
      const responseText = textContent?.type === "text" ? textContent.text : "";

      return {
        response: responseText,
        model: response.model,
        provider: "anthropic",
        usage: {
          promptTokens: response.usage.input_tokens,
          completionTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + response.usage.output_tokens,
        },
        finishReason: mapStopReason(response.stop_reason),
        metadata: {
          id: response.id,
          type: response.type,
        },
      };
    } catch (err) {
      if (err instanceof AIProviderError) {
        throw err;
      }

      if (err instanceof Anthropic.APIError) {
        const errorCode = mapAnthropicError(err.status);
        throw new AIProviderError(
          err.message,
          "anthropic",
          errorCode,
          err.status,
          isRetryableStatus(err.status)
        );
      }

      const message = err instanceof Error ? err.message : "Unknown error";
      throw new AIProviderError(message, "anthropic", AIErrorCodes.UNKNOWN, 500, false);
    }
  },
};

function extractSystemPrompt(messages: ChatMessage[]): {
  systemPrompt: string | undefined;
  messages: ChatMessage[];
} {
  const systemMessages = messages.filter((m) => m.role === "system");
  const otherMessages = messages.filter((m) => m.role !== "system");
  
  const systemPrompt = systemMessages.length > 0
    ? systemMessages.map((m) => m.content).join("\n\n")
    : undefined;

  return { systemPrompt, messages: otherMessages };
}

function mapStopReason(reason: string | null): string {
  switch (reason) {
    case "end_turn":
      return "stop";
    case "max_tokens":
      return "length";
    case "stop_sequence":
      return "stop";
    default:
      return reason || "unknown";
  }
}

function mapAnthropicError(status: number | undefined): string {
  switch (status) {
    case 401:
      return AIErrorCodes.INVALID_API_KEY;
    case 429:
      return AIErrorCodes.RATE_LIMITED;
    case 404:
      return AIErrorCodes.MODEL_NOT_FOUND;
    case 400:
      return AIErrorCodes.INVALID_REQUEST;
    case 503:
    case 529:
    case 500:
      return AIErrorCodes.SERVICE_UNAVAILABLE;
    default:
      return AIErrorCodes.UNKNOWN;
  }
}

function isRetryableStatus(status: number | undefined): boolean {
  return status === 429 || status === 503 || status === 529 || status === 500;
}
