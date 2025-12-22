export type WorkflowTriggerType = "manual" | "scheduled" | "event" | "keyword"

export interface WorkflowTrigger {
  type: WorkflowTriggerType
  condition?: string
  keywords?: string[]
  event?: string
  schedule?: string
}

export type ParticipantRole = "coordinator" | "primary" | "reviewer" | "support"

export interface WorkflowParticipant {
  agentName: string
  role: ParticipantRole
  required?: boolean
  responsibilities?: string[]
}

export interface WorkflowPhase {
  name: string
  agents: string[]
  description: string
  outputs: string[]
  parallel?: boolean
}

export interface Workflow {
  id: string
  name: string
  description: string
  trigger: WorkflowTrigger
  participants: WorkflowParticipant[]
  phases: WorkflowPhase[]
  expectedDuration: string
  priority: "low" | "medium" | "high" | "critical"
}
