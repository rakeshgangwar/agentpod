/**
 * ReasoningDisplay Component
 * 
 * Displays AI reasoning/thinking content in an expandable section.
 * This shows the model's chain-of-thought process.
 * 
 * Design:
 * - Collapsible by default (users can expand if curious)
 * - Subtle styling to differentiate from main content
 * - Shows timing if available
 */

import { useState, memo, type FC } from "react";
import type { InternalReasoning } from "../types/messages";

interface ReasoningDisplayProps {
  reasoning: InternalReasoning[];
  /** Whether to show expanded by default */
  defaultExpanded?: boolean;
}

/**
 * Format milliseconds duration to human readable
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

const ReasoningBlock: FC<{ item: InternalReasoning; index: number }> = memo(({ item }) => {
  const duration = item.startTime && item.endTime 
    ? item.endTime - item.startTime 
    : null;

  return (
    <div className="relative pl-4 border-l-2 border-[var(--cyber-purple)]/30">
      {/* Timestamp/duration indicator */}
      {duration !== null && (
        <span className="absolute -left-[3px] top-0 w-1.5 h-1.5 rounded-full bg-[var(--cyber-purple)]" />
      )}
      
      <div className="font-mono text-xs text-muted-foreground/80 whitespace-pre-wrap">
        {item.text}
      </div>
      
      {duration !== null && (
        <div className="mt-1 font-mono text-[10px] text-[var(--cyber-purple)]/60">
          {formatDuration(duration)}
        </div>
      )}
    </div>
  );
});

/**
 * ReasoningDisplay shows AI reasoning/thinking in a collapsible section
 */
export const ReasoningDisplay: FC<ReasoningDisplayProps> = ({ 
  reasoning, 
  defaultExpanded = false 
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  
  if (!reasoning || reasoning.length === 0) {
    return null;
  }
  
  // Calculate total thinking time
  const totalTime = reasoning.reduce((acc, item) => {
    if (item.startTime && item.endTime) {
      return acc + (item.endTime - item.startTime);
    }
    return acc;
  }, 0);
  
  // Combine all reasoning text for preview
  const totalLength = reasoning.reduce((acc, item) => acc + item.text.length, 0);
  const preview = reasoning[0]?.text.slice(0, 100) || "";
  
  return (
    <div className="my-2 rounded border border-[var(--cyber-purple)]/20 bg-[var(--cyber-purple)]/5 overflow-hidden">
      {/* Header - always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-3 py-2 flex items-center gap-2 hover:bg-[var(--cyber-purple)]/10 transition-colors text-left"
      >
        {/* Expand/collapse indicator */}
        <span className="text-[var(--cyber-purple)] text-xs font-mono">
          {isExpanded ? "▼" : "▶"}
        </span>
        
        {/* Icon */}
        <span className="text-[var(--cyber-purple)]">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
          </svg>
        </span>
        
        {/* Label */}
        <span className="font-mono text-xs uppercase tracking-wider text-[var(--cyber-purple)]">
          Thinking
        </span>
        
        {/* Stats */}
        <span className="ml-auto font-mono text-[10px] text-muted-foreground/60">
          {reasoning.length} {reasoning.length === 1 ? "block" : "blocks"}
          {totalTime > 0 && ` · ${formatDuration(totalTime)}`}
          {!isExpanded && totalLength > 100 && ` · ${totalLength} chars`}
        </span>
      </button>
      
      {/* Preview when collapsed */}
      {!isExpanded && preview && (
        <div className="px-3 pb-2 font-mono text-xs text-muted-foreground/60 truncate">
          {preview}...
        </div>
      )}
      
      {/* Content when expanded */}
      {isExpanded && (
        <div className="px-3 pb-3 space-y-3">
          {reasoning.map((item, index) => (
            <ReasoningBlock key={item.id || index} item={item} index={index} />
          ))}
        </div>
      )}
    </div>
  );
};

export default ReasoningDisplay;
