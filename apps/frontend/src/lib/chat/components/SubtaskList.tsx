/**
 * SubtaskList Component
 * 
 * Displays subtasks spawned during a message (from task tool).
 * Shows subtask description, agent, and prompt.
 * 
 * Design:
 * - Compact list of subtasks
 * - Shows agent badge
 * - Expandable to see full prompt
 */

import { useState, type FC } from "react";
import type { InternalSubtask } from "../types/messages";

interface SubtaskListProps {
  subtasks: InternalSubtask[];
  /** Callback when clicking to navigate to subtask session */
  onNavigateToSession?: (subtaskId: string) => void;
  /** Compact mode - just show count */
  compact?: boolean;
}

/**
 * Agent color mapping
 */
function getAgentColor(agent: string): string {
  switch (agent.toLowerCase()) {
    case "code":
    case "coder":
      return "var(--cyber-cyan)";
    case "research":
    case "researcher":
      return "var(--cyber-purple)";
    case "review":
    case "reviewer":
      return "var(--cyber-amber)";
    case "plan":
    case "planner":
      return "var(--cyber-emerald)";
    default:
      return "var(--cyber-cyan)";
  }
}

/**
 * Single subtask item
 */
const SubtaskItem: FC<{ 
  subtask: InternalSubtask; 
  onNavigate?: () => void;
}> = ({ subtask, onNavigate }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const agentColor = getAgentColor(subtask.agent);
  
  return (
    <div className="border-b border-border/10 last:border-0">
      <div className="px-3 py-2 flex items-start gap-2">
        {/* Expand toggle (if has prompt) */}
        {subtask.prompt && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="mt-0.5 text-muted-foreground/60 text-xs hover:text-muted-foreground transition-colors"
          >
            {isExpanded ? "▼" : "▶"}
          </button>
        )}
        
        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Description */}
          <div className="font-mono text-xs text-foreground/90">
            {subtask.description}
          </div>
          
          {/* Agent badge */}
          <div className="mt-1 flex items-center gap-2">
            <span 
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider"
              style={{ 
                color: agentColor,
                backgroundColor: `color-mix(in srgb, ${agentColor} 10%, transparent)`,
                borderColor: `color-mix(in srgb, ${agentColor} 30%, transparent)`,
                borderWidth: "1px",
              }}
            >
              @{subtask.agent}
            </span>
          </div>
        </div>
        
        {/* Navigate button */}
        {onNavigate && (
          <button
            onClick={onNavigate}
            className="flex-shrink-0 font-mono text-[10px] text-[var(--cyber-cyan)] hover:text-[var(--cyber-cyan)]/80 hover:underline transition-colors"
          >
            View →
          </button>
        )}
      </div>
      
      {/* Expanded prompt */}
      {isExpanded && subtask.prompt && (
        <div className="px-3 pb-2 pl-7">
          <div className="p-2 rounded bg-background/50 border border-border/30">
            <div className="font-mono text-[10px] text-muted-foreground/60 uppercase tracking-wider mb-1">
              Prompt
            </div>
            <div className="font-mono text-xs text-muted-foreground whitespace-pre-wrap">
              {subtask.prompt}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * SubtaskList shows spawned subtasks
 */
export const SubtaskList: FC<SubtaskListProps> = ({ 
  subtasks, 
  onNavigateToSession,
  compact = false 
}) => {
  if (!subtasks || subtasks.length === 0) {
    return null;
  }
  
  // Count unique agents
  const agents = [...new Set(subtasks.map(s => s.agent))];
  
  if (compact) {
    // Compact mode - just show count
    return (
      <span className="inline-flex items-center gap-1 font-mono text-[10px] text-[var(--cyber-purple)]">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
          <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
          <path d="M9 14l2 2 4-4" />
        </svg>
        {subtasks.length} {subtasks.length === 1 ? "subtask" : "subtasks"}
      </span>
    );
  }
  
  return (
    <div className="my-2 rounded border border-[var(--cyber-purple)]/20 bg-[var(--cyber-purple)]/5 overflow-hidden">
      {/* Header */}
      <div className="px-3 py-1.5 border-b border-[var(--cyber-purple)]/10 flex items-center gap-2 bg-[var(--cyber-purple)]/10">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--cyber-purple)]">
          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
          <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
          <path d="M9 14l2 2 4-4" />
        </svg>
        <span className="font-mono text-xs uppercase tracking-wider text-[var(--cyber-purple)]">
          Subtasks
        </span>
        <span className="ml-auto font-mono text-[10px] text-muted-foreground/60">
          {subtasks.length} {subtasks.length === 1 ? "task" : "tasks"}
          {agents.length > 1 && ` · ${agents.length} agents`}
        </span>
      </div>
      
      {/* Subtask list */}
      <div>
        {subtasks.map((subtask, index) => (
          <SubtaskItem 
            key={subtask.id || index} 
            subtask={subtask}
            onNavigate={onNavigateToSession ? () => onNavigateToSession(subtask.id) : undefined}
          />
        ))}
      </div>
    </div>
  );
};

export default SubtaskList;
