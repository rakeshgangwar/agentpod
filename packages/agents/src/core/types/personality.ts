/**
 * Agent Personality Framework
 * 
 * Based on The Agentic Space personality dimensions and behavioral traits.
 * Defines how agents express their unique characteristics.
 */

/**
 * How deep and broad is the agent's knowledge?
 */
export type ExpertiseLevel = 
  | "specialist"   // Deep expertise in one domain
  | "generalist"   // Broad knowledge across domains
  | "master"       // Expert-level authority in domain

/**
 * How does the agent convey information?
 */
export type CommunicationStyle = 
  | "formal"       // Professional, structured
  | "casual"       // Friendly, approachable
  | "technical"    // Precise, detailed
  | "encouraging"  // Supportive, positive
  | "analytical"   // Data-driven, objective

/**
 * How does the agent engage with work?
 */
export type InteractionPreference = 
  | "proactive"    // Initiates suggestions, anticipates needs
  | "reactive"     // Responds to requests, waits for input
  | "collaborative" // Seeks team input, coordinates others
  | "independent"  // Works solo, delivers complete results

/**
 * How does the agent approach problems?
 */
export type LearningOrientation = 
  | "adaptive"     // Learns from experience, adjusts
  | "systematic"   // Follows proven methods, checklists
  | "innovative"   // Experiments, tries new approaches
  | "traditional"  // Applies established patterns

/**
 * What pace does the agent work at?
 */
export type EnergyLevel = 
  | "high"         // Fast, enthusiastic, action-oriented
  | "moderate"     // Balanced, steady, thorough
  | "calm"         // Thoughtful, deliberate, patient

/**
 * Specific behavioral traits that further define character
 */
export type PersonalityTrait = 
  | "detail-oriented"
  | "big-picture"
  | "risk-averse"
  | "risk-taking"
  | "methodical"
  | "spontaneous"
  | "patient"
  | "urgent"
  | "empathetic"
  | "objective"

/**
 * Intelligence level based on The Agentic Space framework
 */
export type IntelligenceLevel = 1 | 2 | 3 | 4 | 5

/**
 * Intelligence level descriptions
 */
export const INTELLIGENCE_LEVELS = {
  1: {
    name: "Reactive Assistance",
    capability: "Responds to direct requests",
    learning: "Pattern recognition, preference memory",
    autonomy: "Executes defined tasks"
  },
  2: {
    name: "Proactive Support",
    capability: "Anticipates needs, offers suggestions",
    learning: "Behavioral prediction, workflow optimization",
    autonomy: "Initiates helpful actions within boundaries"
  },
  3: {
    name: "Strategic Partnership",
    capability: "Contributes insights and recommendations",
    learning: "Domain expertise, cross-functional knowledge",
    autonomy: "Makes informed decisions within scope"
  },
  4: {
    name: "Innovation Catalyst",
    capability: "Generates creative solutions",
    learning: "Creative synthesis, innovation methodology",
    autonomy: "Proposes new approaches"
  },
  5: {
    name: "Autonomous Expertise",
    capability: "Expert-level decision making",
    learning: "Continuous self-improvement",
    autonomy: "Operates independently while aligned"
  }
} as const

/**
 * Contextual adaptation modes - how agents behave differently based on context
 */
export interface AdaptationModes {
  /** When urgency is critical */
  crisis?: string
  /** When user is learning */
  learning?: string
  /** When exploring new ideas */
  innovation?: string
  /** When deep investigation needed */
  analysis?: string
}

/**
 * Complete personality definition for an agent
 */
export interface AgentPersonality {
  /** How deep and broad is the agent's knowledge? */
  expertise: ExpertiseLevel
  
  /** How does the agent convey information? */
  communication: CommunicationStyle
  
  /** How does the agent engage with work? */
  interaction: InteractionPreference
  
  /** How does the agent approach problems? */
  learning: LearningOrientation
  
  /** What pace does the agent work at? */
  energy: EnergyLevel
  
  /** Specific behavioral traits (3-5 recommended) */
  traits: PersonalityTrait[]
  
  /** Contextual adaptation behaviors */
  adaptationModes?: AdaptationModes
}
