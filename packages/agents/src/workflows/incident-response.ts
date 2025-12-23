import type { Workflow } from "../core/types"

export const incidentResponseWorkflow: Workflow = {
  id: "incident-response",
  name: "Incident Response",
  description: "Coordinated response to production incidents",
  
  trigger: {
    type: "keyword",
    keywords: ["incident", "outage", "down", "production issue", "emergency", "P1", "critical"]
  },
  
  participants: [
    {
      agentName: "Operations-Olivia",
      role: "coordinator",
      responsibilities: [
        "Lead incident response",
        "Coordinate team efforts",
        "Make deployment decisions"
      ]
    },
    {
      agentName: "Debugger-Dana",
      role: "primary",
      responsibilities: [
        "Investigate root cause",
        "Analyze logs and metrics",
        "Identify the bug"
      ]
    },
    {
      agentName: "Security-Sam",
      role: "reviewer",
      responsibilities: [
        "Assess security implications",
        "Check for data exposure",
        "Verify no ongoing attack"
      ]
    },
    {
      agentName: "Notifier-Nora",
      role: "support",
      responsibilities: [
        "Communicate status updates",
        "Notify stakeholders",
        "Draft incident reports"
      ]
    }
  ],
  
  phases: [
    {
      name: "Detection & Triage",
      agents: ["Operations-Olivia"],
      description: "Assess severity and impact, assemble team",
      outputs: ["Severity assessment", "Impact scope", "Team assignment"]
    },
    {
      name: "Investigation",
      agents: ["Debugger-Dana", "Operations-Olivia"],
      description: "Find root cause through logs, metrics, and code analysis",
      outputs: ["Root cause hypothesis", "Evidence"]
    },
    {
      name: "Security Check",
      agents: ["Security-Sam"],
      description: "Verify no security breach or ongoing attack",
      outputs: ["Security assessment", "Data exposure check"]
    },
    {
      name: "Resolution",
      agents: ["Operations-Olivia", "Debugger-Dana"],
      description: "Fix or rollback to resolve the incident",
      outputs: ["Fix deployed", "Verification"]
    },
    {
      name: "Communication",
      agents: ["Notifier-Nora"],
      description: "Update stakeholders and users",
      outputs: ["Status updates", "Incident report"]
    },
    {
      name: "Post-mortem",
      agents: ["Operations-Olivia", "Debugger-Dana"],
      description: "Document learnings and prevention measures",
      outputs: ["Post-mortem document", "Action items"]
    }
  ],
  
  expectedDuration: "30 minutes - 4 hours",
  priority: "critical"
}
