export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export type AIProvider = "openai" | "anthropic" | "ollama" | "workers-ai" | "google";

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stop?: string[];
  responseFormat?: "text" | "json";
  jsonSchema?: object;
}

export interface ChatResponse {
  response: string;
  model: string;
  provider: AIProvider;
  usage: TokenUsage;
  finishReason: string;
  metadata?: Record<string, unknown>;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  timeout?: number;
  aiBinding?: unknown;
}

export interface AIProviderInterface {
  readonly name: AIProvider;
  chat(request: ChatRequest, config: ProviderConfig): Promise<ChatResponse>;
  chatStream?(request: ChatRequest, config: ProviderConfig): AsyncGenerator<string, void, unknown>;
  validateConfig(config: ProviderConfig): string[];
}

export interface AIChatParams {
  provider: AIProvider;
  model: string;
  systemPrompt?: string;
  prompt: string;
  messages?: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stop?: string[];
  responseFormat?: "text" | "json";
  jsonSchema?: object;
  apiKey?: string;
  baseUrl?: string;
}

export interface AIEmbeddingsParams {
  provider: "openai" | "ollama" | "workers-ai";
  model: string;
  input: string | string[];
  dimensions?: number;
}

export interface EmbeddingsResponse {
  embeddings: number[][];
  model: string;
  provider: string;
  usage: {
    totalTokens: number;
  };
}

export class AIProviderError extends Error {
  constructor(
    message: string,
    public provider: AIProvider,
    public code: string,
    public statusCode?: number,
    public retryable: boolean = false
  ) {
    super(message);
    this.name = "AIProviderError";
  }
}

export const AIErrorCodes = {
  INVALID_API_KEY: "INVALID_API_KEY",
  RATE_LIMITED: "RATE_LIMITED",
  MODEL_NOT_FOUND: "MODEL_NOT_FOUND",
  CONTEXT_LENGTH_EXCEEDED: "CONTEXT_LENGTH_EXCEEDED",
  TIMEOUT: "TIMEOUT",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  INVALID_REQUEST: "INVALID_REQUEST",
  UNKNOWN: "UNKNOWN",
} as const;

export type AIErrorCode = typeof AIErrorCodes[keyof typeof AIErrorCodes];

const RETRYABLE_ERRORS: AIErrorCode[] = [
  AIErrorCodes.RATE_LIMITED,
  AIErrorCodes.TIMEOUT,
  AIErrorCodes.SERVICE_UNAVAILABLE,
];

export function isRetryableError(code: AIErrorCode): boolean {
  return RETRYABLE_ERRORS.includes(code);
}

export interface ModelInfo {
  id: string;
  name: string;
  contextWindow: number;
  maxOutput?: number;
  supportsJson?: boolean;
  supportsStreaming?: boolean;
}

export const KNOWN_MODELS: Record<AIProvider, ModelInfo[]> = {
  openai: [
    { id: "gpt-4o", name: "GPT-4o", contextWindow: 128000, supportsJson: true, supportsStreaming: true },
    { id: "gpt-4o-mini", name: "GPT-4o Mini", contextWindow: 128000, supportsJson: true, supportsStreaming: true },
    { id: "gpt-4-turbo", name: "GPT-4 Turbo", contextWindow: 128000, supportsJson: true, supportsStreaming: true },
    { id: "gpt-4", name: "GPT-4", contextWindow: 8192, supportsJson: true, supportsStreaming: true },
    { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo", contextWindow: 16385, supportsJson: true, supportsStreaming: true },
  ],
  anthropic: [
    { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet", contextWindow: 200000, supportsJson: true, supportsStreaming: true },
    { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku", contextWindow: 200000, supportsJson: true, supportsStreaming: true },
    { id: "claude-3-opus-20240229", name: "Claude 3 Opus", contextWindow: 200000, supportsJson: true, supportsStreaming: true },
    { id: "claude-3-sonnet-20240229", name: "Claude 3 Sonnet", contextWindow: 200000, supportsJson: true, supportsStreaming: true },
    { id: "claude-3-haiku-20240307", name: "Claude 3 Haiku", contextWindow: 200000, supportsJson: true, supportsStreaming: true },
  ],
  ollama: [
    { id: "llama3.2", name: "Llama 3.2", contextWindow: 128000, supportsStreaming: true },
    { id: "llama3.1", name: "Llama 3.1", contextWindow: 128000, supportsStreaming: true },
    { id: "mistral", name: "Mistral", contextWindow: 32000, supportsStreaming: true },
    { id: "codellama", name: "Code Llama", contextWindow: 16000, supportsStreaming: true },
    { id: "phi3", name: "Phi-3", contextWindow: 4096, supportsStreaming: true },
  ],
  "workers-ai": [
    { id: "@cf/meta/llama-3.1-8b-instruct", name: "Llama 3.1 8B", contextWindow: 8192 },
    { id: "@cf/meta/llama-3.1-70b-instruct", name: "Llama 3.1 70B", contextWindow: 8192 },
    { id: "@cf/mistral/mistral-7b-instruct-v0.1", name: "Mistral 7B", contextWindow: 8192 },
    { id: "@cf/qwen/qwen1.5-14b-chat-awq", name: "Qwen 1.5 14B", contextWindow: 8192 },
    { id: "@hf/thebloke/deepseek-coder-6.7b-instruct-awq", name: "DeepSeek Coder 6.7B", contextWindow: 4096 },
  ],
  google: [
    { id: "gemini-2.0-flash-exp", name: "Gemini 2.0 Flash", contextWindow: 1000000, supportsJson: true, supportsStreaming: true },
    { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro", contextWindow: 2000000, supportsJson: true, supportsStreaming: true },
    { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash", contextWindow: 1000000, supportsJson: true, supportsStreaming: true },
  ],
};
