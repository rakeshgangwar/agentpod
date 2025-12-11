/**
 * LLM Provider types for model configuration.
 */

/** Authentication type for providers */
export type AuthType = "api_key" | "oauth" | "device_flow";

/** Capabilities of a model */
export interface ModelCapabilities {
  image_input: boolean;
  video_input: boolean;
  tool_use: boolean;
  streaming: boolean;
}

/** Pricing information for a model */
export interface ModelPricing {
  input_per_million: number;
  output_per_million: number;
  currency: string;
}

/** Information about a specific model */
export interface ModelInfo {
  id: string;
  name: string;
  description?: string;
  context_window: number;
  max_output_tokens?: number;
  capabilities: ModelCapabilities;
  pricing?: ModelPricing;
}

/** Provider information */
export interface Provider {
  id: string;
  name: string;
  description?: string;
  auth_type: AuthType;
  is_configured: boolean;
  is_available: boolean;
}

/** Provider with available models */
export interface ProviderWithModels {
  provider: Provider;
  models: ModelInfo[];
}

/** OAuth device flow initialization */
export interface OAuthFlowInit {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in: number;
  interval: number;
}

/** OAuth flow status types */
export type OAuthFlowStatusType =
  | "pending"
  | "authorized"
  | "expired"
  | "error";

/** OAuth flow status */
export interface OAuthFlowStatus {
  status: OAuthFlowStatusType;
  message?: string;
  provider_id?: string;
}
