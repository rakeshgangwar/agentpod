import { describe, expect, test } from "bun:test";
import { 
  createOrchestrator, 
  ALL_AGENTS, 
  ALL_WORKFLOWS,
  AGENTS_BY_NAME,
  AGENTS_BY_SQUAD
} from "../src";

describe("Agent Orchestrator", () => {
  const orchestrator = createOrchestrator();

  describe("initialization", () => {
    test("loads all agents", () => {
      const agents = orchestrator.getAllAgents();
      expect(agents.length).toBe(11);
    });

    test("loads all workflows", () => {
      const workflows = orchestrator.getAllWorkflows();
      expect(workflows.length).toBe(3);
    });

    test("sets Central as the central agent", () => {
      const central = orchestrator.getAgent("Central");
      expect(central).toBeDefined();
      expect(central?.tier).toBe("central");
    });
  });

  describe("agent lookup", () => {
    test("finds agent by name", () => {
      const kai = orchestrator.getAgent("Kai");
      expect(kai).toBeDefined();
      expect(kai?.role).toBe("Lead Code Reviewer");
    });

    test("returns undefined for unknown agent", () => {
      const unknown = orchestrator.getAgent("Unknown");
      expect(unknown).toBeUndefined();
    });

    test("filters agents by squad", () => {
      const devAgents = orchestrator.getAgentsBySquad("development");
      expect(devAgents.length).toBe(4);
      expect(devAgents.map(a => a.name)).toContain("Kai");
      expect(devAgents.map(a => a.name)).toContain("Dana");
      
      const securityAgents = orchestrator.getAgentsBySquad("security");
      expect(securityAgents.length).toBe(1);
      expect(securityAgents[0]?.name).toBe("Sam");
    });
  });

  describe("routing", () => {
    test("routes code review request to Kai", async () => {
      const decision = await orchestrator.route({
        message: "Please do a code review on this PR"
      });
      
      expect(decision.agents.length).toBeGreaterThan(0);
      expect(decision.agents.some(a => a.name === "Kai")).toBe(true);
    });

    test("routes bug investigation to Dana", async () => {
      const decision = await orchestrator.route({
        message: "I have a bug in my application, the error says null pointer"
      });
      
      expect(decision.agents.some(a => a.name === "Dana")).toBe(true);
      expect(decision.intent.keywords).toContain("bug");
    });

    test("routes security concern to Sam", async () => {
      const decision = await orchestrator.route({
        message: "Is this authentication implementation secure?"
      });
      
      expect(decision.agents.some(a => a.name === "Sam")).toBe(true);
    });

    test("routes infrastructure question to Olivia", async () => {
      const decision = await orchestrator.route({
        message: "How should I deploy this to production?"
      });
      
      expect(decision.agents.some(a => a.name === "Olivia")).toBe(true);
    });

    test("falls back to Central for unknown requests", async () => {
      const decision = await orchestrator.route({
        message: "Hello, what can you help me with?"
      });
      
      expect(decision.agents.length).toBeGreaterThan(0);
    });

    test("identifies urgency from message", async () => {
      const decision = await orchestrator.route({
        message: "URGENT: Production is down, we need help immediately!"
      });
      
      expect(decision.intent.urgency).toBe("critical");
    });

    test("triggers workflow for PR review", async () => {
      const decision = await orchestrator.route({
        message: "Please review this pull request"
      });
      
      expect(decision.type).toBe("workflow");
      expect(decision.workflow?.id).toBe("pr-review");
    });
  });
});

describe("Agent Library", () => {
  test("ALL_AGENTS contains 11 agents", () => {
    expect(ALL_AGENTS.length).toBe(11);
  });

  test("ALL_WORKFLOWS contains 3 workflows", () => {
    expect(ALL_WORKFLOWS.length).toBe(3);
  });

  test("AGENTS_BY_NAME provides quick lookup", () => {
    expect(AGENTS_BY_NAME.Kai.role).toBe("Lead Code Reviewer");
    expect(AGENTS_BY_NAME.Dana.role).toBe("Bug Investigator");
    expect(AGENTS_BY_NAME.Central.tier).toBe("central");
  });

  test("AGENTS_BY_SQUAD organizes agents correctly", () => {
    expect(AGENTS_BY_SQUAD.development.length).toBe(5);
    expect(AGENTS_BY_SQUAD.product.length).toBe(3);
    expect(AGENTS_BY_SQUAD.operations.length).toBe(2);
    expect(AGENTS_BY_SQUAD.orchestration.length).toBe(1);
  });

  test("each agent has required fields", () => {
    for (const agent of ALL_AGENTS) {
      expect(agent.name).toBeDefined();
      expect(agent.role).toBeDefined();
      expect(agent.squad).toBeDefined();
      expect(agent.tier).toBeDefined();
      expect(agent.personality).toBeDefined();
      expect(agent.intelligenceLevel).toBeGreaterThanOrEqual(1);
      expect(agent.intelligenceLevel).toBeLessThanOrEqual(5);
      expect(agent.systemPrompt).toBeDefined();
      expect(agent.systemPrompt.length).toBeGreaterThan(100);
    }
  });

  test("each agent has valid personality dimensions", () => {
    const validExpertise = ["specialist", "generalist", "master"];
    const validCommunication = ["formal", "casual", "technical", "encouraging", "analytical"];
    const validInteraction = ["proactive", "reactive", "collaborative", "independent"];
    const validLearning = ["adaptive", "systematic", "innovative", "traditional"];
    const validEnergy = ["high", "moderate", "calm"];

    for (const agent of ALL_AGENTS) {
      expect(validExpertise).toContain(agent.personality.expertise);
      expect(validCommunication).toContain(agent.personality.communication);
      expect(validInteraction).toContain(agent.personality.interaction);
      expect(validLearning).toContain(agent.personality.learning);
      expect(validEnergy).toContain(agent.personality.energy);
    }
  });
});

describe("Workflows", () => {
  test("PR Review workflow has correct participants", () => {
    const workflow = ALL_WORKFLOWS.find(w => w.id === "pr-review");
    expect(workflow).toBeDefined();
    expect(workflow?.participants.map(p => p.agentName)).toContain("Kai");
    expect(workflow?.participants.map(p => p.agentName)).toContain("Sam");
    expect(workflow?.participants.map(p => p.agentName)).toContain("Tess");
  });

  test("Incident Response workflow has correct priority", () => {
    const workflow = ALL_WORKFLOWS.find(w => w.id === "incident-response");
    expect(workflow).toBeDefined();
    expect(workflow?.priority).toBe("critical");
  });

  test("Feature Planning workflow has all phases", () => {
    const workflow = ALL_WORKFLOWS.find(w => w.id === "feature-planning");
    expect(workflow).toBeDefined();
    expect(workflow?.phases.length).toBeGreaterThanOrEqual(5);
  });
});
