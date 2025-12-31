/**
 * StepIndicator Component
 * 
 * Displays processing step information (step-start/step-finish events).
 * Shows step boundaries with token usage and timing.
 * 
 * Design:
 * - Collapsed by default (shows summary only)
 * - Expandable to see individual step details
 * - Shows step number, reason, and metrics when expanded
 */

import { useState, type FC } from "react";
import type { InternalStep } from "../types/messages";

interface StepIndicatorProps {
  steps: InternalStep[];
  /** Show in compact inline mode (no expand capability) */
  compact?: boolean;
  /** Start expanded (default: false) */
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

/**
 * Format token count with K suffix
 */
function formatTokens(count: number): string {
  if (count < 1000) return count.toString();
  return `${(count / 1000).toFixed(1)}K`;
}

/**
 * Single step display
 */
const StepItem: FC<{ step: InternalStep; index: number }> = ({ step, index }) => {
  const duration = step.startTime && step.endTime 
    ? step.endTime - step.startTime 
    : null;
  
  const totalTokens = step.tokens 
    ? step.tokens.input + step.tokens.output + step.tokens.reasoning 
    : null;

  return (
    <div className="flex items-center gap-2 py-1">
      {/* Step number badge */}
      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[var(--cyber-cyan)]/10 border border-[var(--cyber-cyan)]/30 flex items-center justify-center">
        <span className="font-mono text-[10px] text-[var(--cyber-cyan)]">
          {index + 1}
        </span>
      </span>
      
      {/* Step info */}
      <div className="flex-1 min-w-0">
        {step.reason && (
          <span className="font-mono text-xs text-muted-foreground truncate block">
            {step.reason}
          </span>
        )}
      </div>
      
      {/* Metrics */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {totalTokens !== null && totalTokens > 0 && (
          <span className="font-mono text-[10px] text-muted-foreground/60">
            {formatTokens(totalTokens)} tok
          </span>
        )}
        
        {duration !== null && (
          <span className="font-mono text-[10px] text-muted-foreground/60">
            {formatDuration(duration)}
          </span>
        )}
        
        {step.cost !== undefined && step.cost > 0 && (
          <span className="font-mono text-[10px] text-[var(--cyber-emerald)]">
            ${step.cost.toFixed(4)}
          </span>
        )}
      </div>
    </div>
  );
};

/**
 * StepIndicator shows processing step information
 */
export const StepIndicator: FC<StepIndicatorProps> = ({ steps, compact = false, defaultExpanded = false }) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  
  if (!steps || steps.length === 0) {
    return null;
  }
  
  // Filter to only show finished steps (have end time or are finish phase)
  const finishedSteps = steps.filter(s => s.phase === "finish" || s.endTime);
  
  if (finishedSteps.length === 0) {
    return null;
  }
  
  // Calculate totals
  const totalDuration = finishedSteps.reduce((acc, s) => {
    if (s.startTime && s.endTime) {
      return acc + (s.endTime - s.startTime);
    }
    return acc;
  }, 0);
  
  const totalTokens = finishedSteps.reduce((acc, s) => {
    if (s.tokens) {
      return acc + s.tokens.input + s.tokens.output + s.tokens.reasoning;
    }
    return acc;
  }, 0);
  
  const totalCost = finishedSteps.reduce((acc, s) => acc + (s.cost || 0), 0);
  
  if (compact) {
    // Compact mode - just show summary (no expand capability)
    return (
      <div className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground/60">
        <span>{finishedSteps.length} {finishedSteps.length === 1 ? "step" : "steps"}</span>
        {totalTokens > 0 && (
          <>
            <span>·</span>
            <span>{formatTokens(totalTokens)} tok</span>
          </>
        )}
        {totalDuration > 0 && (
          <>
            <span>·</span>
            <span>{formatDuration(totalDuration)}</span>
          </>
        )}
        {totalCost > 0 && (
          <>
            <span>·</span>
            <span className="text-[var(--cyber-emerald)]">${totalCost.toFixed(4)}</span>
          </>
        )}
      </div>
    );
  }
  
  return (
    <div className="my-2 rounded border border-border/30 bg-muted/20 overflow-hidden">
      {/* Header - clickable to expand/collapse */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-3 py-1.5 border-b border-border/20 flex items-center justify-between bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground/60 text-xs">
            {isExpanded ? "▼" : "▶"}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Processing Steps ({finishedSteps.length})
          </span>
        </div>
        <div className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground/60">
          {totalTokens > 0 && <span>{formatTokens(totalTokens)} tok</span>}
          {totalDuration > 0 && <span>{formatDuration(totalDuration)}</span>}
          {totalCost > 0 && (
            <span className="text-[var(--cyber-emerald)]">${totalCost.toFixed(4)}</span>
          )}
        </div>
      </button>
      
      {/* Steps - only shown when expanded */}
      {isExpanded && (
        <div className="px-3 py-1 divide-y divide-border/10">
          {finishedSteps.map((step, index) => (
            <StepItem key={step.id || index} step={step} index={index} />
          ))}
        </div>
      )}
    </div>
  );
};

export default StepIndicator;
