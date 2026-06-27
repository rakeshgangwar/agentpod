import { 
  createOrchestrator, 
  AgentOrchestrator,
  AGENTS_BY_NAME,
  AGENTS_BY_SQUAD,
  type AgentConfig,
  type Workflow,
  type UserRequest,
  type RoutingDecision
} from "@agentpod/agents"

import type { 
  AgentRoutingRequest, 
  AgentRoutingResponse, 
  AgentListItem 
} from "./types"

class AgentOrchestratorService {
  private orchestrator: AgentOrchestrator

  constructor() {
    this.orchestrator = createOrchestrator()
  }

  async routeRequest(request: AgentRoutingRequest): Promise<AgentRoutingResponse> {
    const userRequest: UserRequest = {
      message: request.message,
      sandboxId: request.sandboxId,
      context: request.context
    }

    const decision = await this.orchestrator.route(userRequest)
    const selectedAgent = decision.agents[0]

    if (!selectedAgent) {
      throw new Error("No agent matched for this request")
    }

    return {
      decision,
      selectedAgent,
      reasoning: this.explainRouting(decision),
      suggestedFollowUp: this.getSuggestedFollowUps(decision)
    }
  }

  private explainRouting(decision: RoutingDecision): string {
    const { type, agents, intent, workflow } = decision

    if (type === "workflow" && workflow) {
      return `Routing to ${workflow.name} workflow with ${agents.length} participants. ` +
             `Triggered by: ${intent.keywords.join(", ")}.`
    }

    if (type === "team") {
      const names = agents.map(a => a.name).join(", ")
      return `Assembling team: ${names}. ` +
             `Complexity: ${intent.complexity}, Urgency: ${intent.urgency}.`
    }

    const agent = agents[0]
    if (!agent) {
      return "No matching agent found for this request."
    }
    return `Routing to ${agent.name} (${agent.role}). ` +
           `Matched triggers: ${intent.keywords.join(", ") || "general request"}.`
  }

  private getSuggestedFollowUps(decision: RoutingDecision): string[] {
    const agent = decision.agents[0]
    const suggestions: string[] = []

    if (agent?.relatedAgents && agent.relatedAgents.length > 0) {
      const related = agent.relatedAgents.slice(0, 2)
      suggestions.push(`You might also want to consult ${related.join(" or ")}`)
    }

    if (decision.type === "single" && decision.intent.complexity === "complex") {
      suggestions.push("This seems complex. Consider involving additional specialists.")
    }

    return suggestions
  }

  getAgent(name: string): AgentConfig | undefined {
    return this.orchestrator.getAgent(name)
  }

  getAgentByName(name: keyof typeof AGENTS_BY_NAME): AgentConfig {
    return AGENTS_BY_NAME[name]
  }

  getAllAgents(): AgentConfig[] {
    return this.orchestrator.getAllAgents()
  }

  getAgentsList(): AgentListItem[] {
    return this.orchestrator.getAllAgents().map(agent => ({
      name: agent.name,
      role: agent.role,
      emoji: agent.emoji,
      squad: agent.squad,
      tier: agent.tier,
      description: this.extractDescription(agent.systemPrompt),
      triggers: agent.delegationTriggers || []
    }))
  }

  private extractDescription(systemPrompt: string): string {
    const lines = systemPrompt.split("\n")
    const identityIdx = lines.findIndex(l => l.includes("## Your Identity"))
    if (identityIdx === -1) return ""
    
    const nextSection = lines.slice(identityIdx + 1).findIndex(l => l.startsWith("## "))
    const endIdx = nextSection === -1 ? lines.length : identityIdx + 1 + nextSection
    
    return lines.slice(identityIdx + 2, endIdx)
      .filter(l => l.trim() && !l.startsWith("#"))
      .join(" ")
      .trim()
      .slice(0, 200)
  }

  getAgentsBySquad(squad: string): AgentConfig[] {
    return this.orchestrator.getAgentsBySquad(squad)
  }

  getSquads(): string[] {
    return Object.keys(AGENTS_BY_SQUAD)
  }

  getWorkflow(id: string): Workflow | undefined {
    return this.orchestrator.getWorkflow(id)
  }

  getAllWorkflows(): Workflow[] {
    return this.orchestrator.getAllWorkflows()
  }

  getWorkflowsList(): Array<{
    id: string
    name: string
    description: string
    participants: string[]
    trigger: string
    priority: string
  }> {
    return this.orchestrator.getAllWorkflows().map(workflow => ({
      id: workflow.id,
      name: workflow.name,
      description: workflow.description,
      participants: workflow.participants.map(p => p.agentName),
      trigger: workflow.trigger.keywords?.join(", ") || workflow.trigger.type,
      priority: workflow.priority
    }))
  }
}

export const agentOrchestratorService = new AgentOrchestratorService()
