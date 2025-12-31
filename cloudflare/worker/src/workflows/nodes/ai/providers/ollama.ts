import type {
  AIProviderInterface,
  ChatRequest,
  ChatResponse,
  ProviderConfig,
} from "../types";
import { AIProviderError, AIErrorCodes } from "../types";

const DEFAULT_BASE_URL = "http://localhost:11434";
const DEFAULT_TIMEOUT = 120000;

interface OllamaResponse {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
  done_reason?: string;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

export const ollamaProvider: AIProviderInterface = {
  name: "ollama",

  validateConfig(config: ProviderConfig): string[] {
    const errors: string[] = [];
    if (!config.baseUrl) {
      errors.push("Ollama base URL is required (e.g., http://localhost:11434)");
    }
    return errors;
  },

  async chat(request: ChatRequest, config: ProviderConfig): Promise<ChatResponse> {
    const baseUrl = config.baseUrl || DEFAULT_BASE_URL;
    const timeout = config.timeout || DEFAULT_TIMEOUT;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: request.model,
          messages: request.messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          stream: false,
          options: {
            temperature: request.temperature,
            top_p: request.topP,
            num_predict: request.maxTokens,
            stop: request.stop,
          },
          format: request.responseFormat === "json" ? "json" : undefined,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        const errorCode = mapOllamaError(response.status);
        throw new AIProviderError(
          errorText,
          "ollama",
          errorCode,
          response.status,
          isRetryableStatus(response.status)
        );
      }

      const data = (await response.json()) as OllamaResponse;

      return {
        response: data.message.content,
        model: data.model,
        provider: "ollama",
        usage: {
          promptTokens: data.prompt_eval_count || 0,
          completionTokens: data.eval_count || 0,
          totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
        },
        finishReason: data.done_reason || (data.done ? "stop" : "unknown"),
        metadata: {
          createdAt: data.created_at,
          totalDuration: data.total_duration,
          loadDuration: data.load_duration,
        },
      };
    } catch (err) {
      clearTimeout(timeoutId);

      if (err instanceof AIProviderError) {
        throw err;
      }

      if (err instanceof Error && err.name === "AbortError") {
        throw new AIProviderError(
          "Request timed out",
          "ollama",
          AIErrorCodes.TIMEOUT,
          408,
          true
        );
      }

      const message = err instanceof Error ? err.message : "Unknown error";
      throw new AIProviderError(message, "ollama", AIErrorCodes.UNKNOWN, 500, false);
    }
  },
};

function mapOllamaError(status: number): string {
  switch (status) {
    case 404:
      return AIErrorCodes.MODEL_NOT_FOUND;
    case 400:
      return AIErrorCodes.INVALID_REQUEST;
    case 503:
    case 502:
    case 500:
      return AIErrorCodes.SERVICE_UNAVAILABLE;
    default:
      return AIErrorCodes.UNKNOWN;
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 503 || status === 502 || status === 500;
}
