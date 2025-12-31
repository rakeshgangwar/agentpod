import OpenAI from "openai";
import type {
  AIProviderInterface,
  ChatRequest,
  ChatResponse,
  ProviderConfig,
} from "../types";
import { AIProviderError, AIErrorCodes } from "../types";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_TIMEOUT = 60000;

export const openaiProvider: AIProviderInterface = {
  name: "openai",

  validateConfig(config: ProviderConfig): string[] {
    const errors: string[] = [];
    if (!config.apiKey) {
      errors.push("OpenAI API key is required");
    }
    return errors;
  },

  async chat(request: ChatRequest, config: ProviderConfig): Promise<ChatResponse> {
    const errors = this.validateConfig(config);
    if (errors.length > 0) {
      throw new AIProviderError(
        errors.join(", "),
        "openai",
        AIErrorCodes.INVALID_API_KEY,
        401,
        false
      );
    }

    const client = new OpenAI({
      apiKey: config.apiKey!,
      baseURL: config.baseUrl || DEFAULT_BASE_URL,
      timeout: config.timeout || DEFAULT_TIMEOUT,
    });

    try {
      const completionParams: OpenAI.ChatCompletionCreateParams = {
        model: request.model,
        messages: request.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        temperature: request.temperature,
        max_tokens: request.maxTokens,
        top_p: request.topP,
        frequency_penalty: request.frequencyPenalty,
        presence_penalty: request.presencePenalty,
        stop: request.stop,
      };

      if (request.responseFormat === "json") {
        if (request.jsonSchema) {
          completionParams.response_format = {
            type: "json_schema",
            json_schema: {
              name: "response",
              schema: request.jsonSchema as Record<string, unknown>,
              strict: true,
            },
          };
        } else {
          completionParams.response_format = { type: "json_object" };
        }
      }

      const response = await client.chat.completions.create(completionParams);

      const choice = response.choices[0];
      if (!choice) {
        throw new AIProviderError(
          "No response from OpenAI",
          "openai",
          AIErrorCodes.UNKNOWN,
          500,
          true
        );
      }

      return {
        response: choice.message.content || "",
        model: response.model,
        provider: "openai",
        usage: {
          promptTokens: response.usage?.prompt_tokens || 0,
          completionTokens: response.usage?.completion_tokens || 0,
          totalTokens: response.usage?.total_tokens || 0,
        },
        finishReason: choice.finish_reason || "unknown",
        metadata: {
          id: response.id,
          created: response.created,
          systemFingerprint: response.system_fingerprint,
        },
      };
    } catch (err) {
      if (err instanceof AIProviderError) {
        throw err;
      }

      if (err instanceof OpenAI.APIError) {
        const errorCode = mapOpenAIError(err.status);
        throw new AIProviderError(
          err.message,
          "openai",
          errorCode,
          err.status,
          isRetryableStatus(err.status)
        );
      }

      const message = err instanceof Error ? err.message : "Unknown error";
      throw new AIProviderError(message, "openai", AIErrorCodes.UNKNOWN, 500, false);
    }
  },
};

function mapOpenAIError(status: number | undefined): string {
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
    case 502:
    case 500:
      return AIErrorCodes.SERVICE_UNAVAILABLE;
    default:
      return AIErrorCodes.UNKNOWN;
  }
}

function isRetryableStatus(status: number | undefined): boolean {
  return status === 429 || status === 503 || status === 502 || status === 500;
}
