import type { AgentConfig } from "./config"
import type { Workflow } from "./workflow"

export type RequestComplexity = "simple" | "moderate" | "complex"
export type RequestUrgency = "low" | "normal" | "high" | "critical"

export interface UserRequest {
  message: string
  context?: Record<string, unknown>
  sandboxId?: string
}

export interface Intent {
  complexity: RequestComplexity
  urgency: RequestUrgency
  domains: string[]
  keywords: string[]
}

export type RoutingType = "single" | "team" | "workflow"

export interface RoutingDecision {
  type: RoutingType
  agents: AgentConfig[]
  coordinator?: AgentConfig
  workflow?: Workflow
  intent: Intent
}

export interface ExecutionResult {
  content: string
  executionTime: number
  tokensUsed: number
  agentName?: string
}

export interface AgentResponse {
  sessionId: string
  agents: Array<{
    name: string
    role: string
    emoji?: string
  }>
  response: string
  metadata: {
    routingType: RoutingType
    executionTime: number
    tokensUsed: number
  }
}
