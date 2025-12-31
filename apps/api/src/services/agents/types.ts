import type { AgentConfig, RoutingDecision } from "@agentpod/agents"

export interface AgentSession {
  id: string
  userId: string
  sandboxId: string
  agentName: string
  startedAt: Date
  endedAt?: Date
  messageCount: number
  status: "active" | "completed" | "abandoned"
}

export interface AgentMessage {
  id: string
  sessionId: string
  role: "user" | "agent" | "system"
  agentName?: string
  content: string
  metadata?: Record<string, unknown>
  createdAt: Date
}

export interface AgentMetrics {
  agentName: string
  totalSessions: number
  avgSessionDuration: number
  avgMessagesPerSession: number
  satisfactionScore?: number
  lastActive: Date
}

export interface AgentRoutingRequest {
  userId: string
  sandboxId: string
  message: string
  context?: {
    currentFile?: string
    selectedCode?: string
    recentErrors?: string[]
    sessionHistory?: string[]
  }
}

export interface AgentRoutingResponse {
  decision: RoutingDecision
  selectedAgent: AgentConfig
  reasoning: string
  suggestedFollowUp?: string[]
}

export interface AgentListItem {
  name: string
  role: string
  emoji?: string
  squad: string
  tier: string
  description: string
  triggers: string[]
}
