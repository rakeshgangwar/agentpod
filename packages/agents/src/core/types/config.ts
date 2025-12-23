import type { AgentPersonality, IntelligenceLevel } from "./personality"

export type Squad = 
  | "development"
  | "product"
  | "operations"
  | "security"
  | "data"
  | "orchestration"

export type AgentTier = 
  | "central"
  | "foundation"
  | "specialized"
  | "leadership"

export interface ToolRestrictions {
  write?: boolean
  edit?: boolean
  delete?: boolean
  execute?: boolean
  network?: boolean
}

export interface AgentConfig {
  name: string
  role: string
  emoji?: string
  avatar?: string
  
  squad: Squad
  tier: AgentTier
  
  personality: AgentPersonality
  intelligenceLevel: IntelligenceLevel
  
  model: string
  temperature: number
  maxTokens?: number
  tools?: ToolRestrictions
  
  systemPrompt: string
  
  relatedAgents?: string[]
  workflows?: string[]
  
  delegationTriggers?: string[]
  mandatoryFor?: string[]
  
  isDefault?: boolean
}

export interface AgentMetadata {
  name: string
  role: string
  emoji?: string
  squad: Squad
  tier: AgentTier
}
