import type { Workflow } from "../core/types"

export const prReviewWorkflow: Workflow = {
  id: "pr-review",
  name: "Pull Request Review",
  description: "Comprehensive code review workflow for pull requests",
  
  trigger: {
    type: "keyword",
    keywords: ["PR", "pull request", "review code", "code review", "merge request"]
  },
  
  participants: [
    {
      agentName: "Kai",
      role: "primary",
      responsibilities: [
        "Review code quality and best practices",
        "Check for maintainability issues",
        "Suggest improvements"
      ]
    },
    {
      agentName: "Sam",
      role: "reviewer",
      responsibilities: [
        "Review for security vulnerabilities",
        "Check authentication and authorization",
        "Verify data handling practices"
      ]
    },
    {
      agentName: "Tess",
      role: "reviewer",
      responsibilities: [
        "Assess test coverage",
        "Identify missing test cases",
        "Review test quality"
      ]
    }
  ],
  
  phases: [
    {
      name: "Initial Review",
      agents: ["Kai"],
      description: "Code quality and structure review",
      outputs: ["Code review summary", "Improvement suggestions"]
    },
    {
      name: "Security Review",
      agents: ["Sam"],
      description: "Security vulnerability assessment",
      outputs: ["Security findings", "Risk assessment"]
    },
    {
      name: "Test Review",
      agents: ["Tess"],
      description: "Test coverage and quality review",
      outputs: ["Coverage report", "Test recommendations"]
    },
    {
      name: "Synthesis",
      agents: ["Kai"],
      description: "Combine all reviews into final recommendation",
      outputs: ["Final review", "Approval decision"]
    }
  ],
  
  expectedDuration: "15-30 minutes",
  priority: "high"
}
