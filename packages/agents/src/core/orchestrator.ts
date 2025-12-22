import type { 
  AgentConfig, 
  UserRequest, 
  Intent, 
  RoutingDecision,
  Workflow 
} from "./types"

export class AgentOrchestrator {
  private agents: Map<string, AgentConfig> = new Map()
  private workflows: Map<string, Workflow> = new Map()
  private central: AgentConfig | null = null
  private triggerIndex: Map<string, string[]> = new Map()

  constructor(agentConfigs: AgentConfig[], workflowConfigs: Workflow[] = []) {
    for (const config of agentConfigs) {
      this.agents.set(config.name, config)
      if (config.tier === "central") {
        this.central = config
      }
      this.indexTriggers(config)
    }

    for (const workflow of workflowConfigs) {
      this.workflows.set(workflow.id, workflow)
    }
  }

  private indexTriggers(agent: AgentConfig): void {
    if (!agent.delegationTriggers) return
    
    for (const trigger of agent.delegationTriggers) {
      const normalized = trigger.toLowerCase()
      const existing = this.triggerIndex.get(normalized) || []
      existing.push(agent.name)
      this.triggerIndex.set(normalized, existing)
    }
  }

  async route(request: UserRequest): Promise<RoutingDecision> {
    const intent = this.analyzeIntent(request)
    const workflowMatch = this.matchWorkflow(intent)
    
    if (workflowMatch) {
      const participants = workflowMatch.participants
        .map(p => this.agents.get(p.agentName))
        .filter((a): a is AgentConfig => a !== undefined)
      
      return {
        type: "workflow",
        agents: participants,
        coordinator: this.central || undefined,
        workflow: workflowMatch,
        intent
      }
    }

    const matchedAgents = this.matchAgents(intent)
    
    if (matchedAgents.length === 0 && this.central) {
      return {
        type: "single",
        agents: [this.central],
        intent
      }
    }

    if (matchedAgents.length === 1) {
      return {
        type: "single",
        agents: matchedAgents,
        intent
      }
    }

    return {
      type: "team",
      agents: matchedAgents,
      coordinator: this.central || undefined,
      intent
    }
  }

  private analyzeIntent(request: UserRequest): Intent {
    const message = request.message.toLowerCase()
    
    const matchedDomains: Set<string> = new Set()
    const matchedKeywords: string[] = []

    for (const [trigger, agentNames] of this.triggerIndex) {
      if (message.includes(trigger)) {
        matchedKeywords.push(trigger)
        for (const agentName of agentNames) {
          const agent = this.agents.get(agentName)
          if (agent) {
            matchedDomains.add(agent.squad)
          }
        }
      }
    }

    const complexity = this.assessComplexity(message, matchedDomains.size)
    const urgency = this.assessUrgency(message)

    return {
      complexity,
      urgency,
      domains: Array.from(matchedDomains),
      keywords: matchedKeywords
    }
  }

  private assessComplexity(
    message: string, 
    domainCount: number
  ): Intent["complexity"] {
    if (domainCount > 2 || message.length > 500) return "complex"
    if (domainCount > 1 || message.length > 200) return "moderate"
    return "simple"
  }

  private assessUrgency(message: string): Intent["urgency"] {
    const urgentTerms = ["urgent", "asap", "critical", "emergency", "down", "broken", "crash"]
    const highTerms = ["important", "priority", "soon", "quickly"]
    
    const lower = message.toLowerCase()
    
    if (urgentTerms.some(term => lower.includes(term))) return "critical"
    if (highTerms.some(term => lower.includes(term))) return "high"
    return "normal"
  }

  private matchWorkflow(intent: Intent): Workflow | null {
    for (const workflow of this.workflows.values()) {
      if (workflow.trigger.type === "keyword" && workflow.trigger.keywords) {
        const hasMatch = workflow.trigger.keywords.some(kw =>
          intent.keywords.includes(kw.toLowerCase())
        )
        if (hasMatch) return workflow
      }
    }
    return null
  }

  private matchAgents(intent: Intent): AgentConfig[] {
    const matched: AgentConfig[] = []
    const seenNames = new Set<string>()

    for (const keyword of intent.keywords) {
      const agentNames = this.triggerIndex.get(keyword) || []
      for (const name of agentNames) {
        if (seenNames.has(name)) continue
        seenNames.add(name)
        
        const agent = this.agents.get(name)
        if (agent && agent.tier !== "central") {
          matched.push(agent)
        }
      }
    }

    return matched
  }

  getAgent(name: string): AgentConfig | undefined {
    return this.agents.get(name)
  }

  getAllAgents(): AgentConfig[] {
    return Array.from(this.agents.values())
  }

  getAgentsBySquad(squad: string): AgentConfig[] {
    return Array.from(this.agents.values()).filter(a => a.squad === squad)
  }

  getWorkflow(id: string): Workflow | undefined {
    return this.workflows.get(id)
  }

  getAllWorkflows(): Workflow[] {
    return Array.from(this.workflows.values())
  }
}
