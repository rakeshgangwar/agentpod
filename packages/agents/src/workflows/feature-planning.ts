import type { Workflow } from "../core/types"

export const featurePlanningWorkflow: Workflow = {
  id: "feature-planning",
  name: "Feature Planning",
  description: "End-to-end feature planning from idea to implementation-ready specs",
  
  trigger: {
    type: "keyword",
    keywords: ["new feature", "feature request", "plan feature", "build feature", "implement"]
  },
  
  participants: [
    {
      agentName: "Pete",
      role: "coordinator",
      responsibilities: [
        "Define feature scope and value",
        "Make prioritization decisions",
        "Approve final specifications"
      ]
    },
    {
      agentName: "Spencer",
      role: "primary",
      responsibilities: [
        "Write detailed requirements",
        "Define acceptance criteria",
        "Document edge cases"
      ]
    },
    {
      agentName: "Alex",
      role: "reviewer",
      responsibilities: [
        "Assess technical feasibility",
        "Design system architecture",
        "Identify technical risks"
      ]
    },
    {
      agentName: "River",
      role: "support",
      responsibilities: [
        "Estimate timeline",
        "Identify dependencies",
        "Plan implementation phases"
      ]
    },
    {
      agentName: "Tess",
      role: "reviewer",
      responsibilities: [
        "Review testability",
        "Plan test strategy",
        "Define quality criteria"
      ]
    }
  ],
  
  phases: [
    {
      name: "Problem Definition",
      agents: ["Pete"],
      description: "Define the problem and value proposition",
      outputs: ["Problem statement", "Success metrics", "Priority assessment"]
    },
    {
      name: "Requirements Gathering",
      agents: ["Spencer", "Pete"],
      description: "Document detailed requirements and acceptance criteria",
      outputs: ["User stories", "Acceptance criteria", "Edge cases"]
    },
    {
      name: "Technical Design",
      agents: ["Alex"],
      description: "Design the technical solution",
      outputs: ["Architecture decision", "Component design", "Technical risks"]
    },
    {
      name: "Test Planning",
      agents: ["Tess"],
      description: "Plan testing strategy",
      outputs: ["Test strategy", "Coverage plan", "Quality gates"]
    },
    {
      name: "Timeline & Dependencies",
      agents: ["River"],
      description: "Estimate effort and identify dependencies",
      outputs: ["Timeline estimate", "Dependency map", "Milestones"]
    },
    {
      name: "Final Review",
      agents: ["Pete"],
      description: "Approve feature for implementation",
      outputs: ["Go/No-go decision", "Implementation tickets"]
    }
  ],
  
  expectedDuration: "1-3 days",
  priority: "medium"
}
