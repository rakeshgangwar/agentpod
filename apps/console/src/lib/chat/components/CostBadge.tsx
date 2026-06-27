/**
 * CostBadge Component
 * 
 * Displays cost and token usage for a message.
 * Shows total cost with expandable token breakdown.
 * 
 * Design:
 * - Compact by default (just shows cost)
 * - Hover/click to see token breakdown
 * - Color-coded based on cost tier
 * - Uses portal to render dropdown outside overflow boundaries
 */

import { useState, useRef, useEffect, type FC } from "react";
import { createPortal } from "react-dom";
import type { AccumulatedTokens } from "../types/messages";

interface CostBadgeProps {
  /** Total cost in dollars */
  cost?: number;
  /** Token usage breakdown */
  tokens?: AccumulatedTokens;
  /** Compact mode - smaller size */
  compact?: boolean;
}

/**
 * Format cost to appropriate precision
 */
function formatCost(cost: number): string {
  if (cost === 0) return "$0";
  if (cost < 0.0001) return "<$0.0001";
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}

/**
 * Format token count with K/M suffix
 */
function formatTokens(count: number): string {
  if (count < 1000) return count.toString();
  if (count < 1000000) return `${(count / 1000).toFixed(1)}K`;
  return `${(count / 1000000).toFixed(2)}M`;
}

/**
 * Get color class based on cost tier
 */
function getCostColor(cost: number): string {
  if (cost < 0.001) return "text-[var(--cyber-emerald)]";
  if (cost < 0.01) return "text-[var(--cyber-cyan)]";
  if (cost < 0.1) return "text-[var(--cyber-amber)]";
  return "text-[var(--cyber-red)]";
}

/**
 * Token breakdown dropdown content
 */
const TokenDropdown: FC<{
  tokens: AccumulatedTokens;
  position: { top: number; left: number };
  onClose: () => void;
}> = ({ tokens, position, onClose }) => {
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const totalTokens = tokens.input + tokens.output + tokens.reasoning + (tokens.cached || 0);
  
  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    
    // Use setTimeout to avoid immediate close on the same click
    const timeoutId = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 0);
    
    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose]);
  
  // Close on escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);
  
  return createPortal(
    <div
      ref={dropdownRef}
      className="fixed p-2 rounded border border-border/50 bg-background/95 backdrop-blur-sm shadow-lg z-50 min-w-[140px]"
      style={{
        top: position.top,
        left: position.left,
      }}
    >
      <div className="space-y-1 font-mono text-[10px]">
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Input:</span>
          <span className="text-[var(--cyber-cyan)]">{formatTokens(tokens.input)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Output:</span>
          <span className="text-[var(--cyber-emerald)]">{formatTokens(tokens.output)}</span>
        </div>
        {tokens.reasoning > 0 && (
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Reasoning:</span>
            <span className="text-[var(--cyber-purple)]">{formatTokens(tokens.reasoning)}</span>
          </div>
        )}
        {tokens.cached && tokens.cached > 0 && (
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Cached:</span>
            <span className="text-muted-foreground/60">{formatTokens(tokens.cached)}</span>
          </div>
        )}
        <div className="border-t border-border/30 pt-1 mt-1 flex justify-between gap-4">
          <span className="text-muted-foreground font-medium">Total:</span>
          <span className="font-medium">{formatTokens(totalTokens)}</span>
        </div>
      </div>
    </div>,
    document.body
  );
};

/**
 * CostBadge displays cost and token usage
 */
export const CostBadge: FC<CostBadgeProps> = ({ cost, tokens, compact = false }) => {
  const [showDetails, setShowDetails] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  
  // Don't render if no data
  if (cost === undefined && !tokens) {
    return null;
  }
  
  const totalTokens = tokens 
    ? tokens.input + tokens.output + tokens.reasoning + (tokens.cached || 0)
    : 0;
  
  const costColor = cost !== undefined ? getCostColor(cost) : "text-muted-foreground";
  
  // Handle click to show dropdown
  const handleClick = () => {
    if (!tokens) return;
    
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      // Position below the button, with some padding
      setDropdownPosition({
        top: rect.bottom + 4,
        left: rect.left,
      });
    }
    setShowDetails(!showDetails);
  };
  
  if (compact) {
    // Compact mode - just show cost with tooltip
    return (
      <span 
        className={`font-mono text-[10px] ${costColor} cursor-help`}
        title={tokens ? `${formatTokens(totalTokens)} tokens` : undefined}
      >
        {cost !== undefined ? formatCost(cost) : `${formatTokens(totalTokens)} tok`}
      </span>
    );
  }
  
  return (
    <>
      {/* Main badge */}
      <button
        ref={buttonRef}
        onClick={handleClick}
        className={`
          inline-flex items-center gap-1 px-1.5 py-0.5 rounded 
          border border-current/20 bg-current/5
          font-mono text-[10px] ${costColor}
          hover:bg-current/10 transition-colors cursor-pointer
        `}
      >
        {/* Cost */}
        {cost !== undefined && (
          <span>{formatCost(cost)}</span>
        )}
        
        {/* Separator */}
        {cost !== undefined && tokens && (
          <span className="text-muted-foreground/40">·</span>
        )}
        
        {/* Token count */}
        {tokens && (
          <span className="text-muted-foreground">
            {formatTokens(totalTokens)} tok
          </span>
        )}
        
        {/* Expand indicator */}
        {tokens && (
          <span className="text-muted-foreground/60">
            {showDetails ? "▲" : "▼"}
          </span>
        )}
      </button>
      
      {/* Token breakdown dropdown - rendered via portal */}
      {showDetails && tokens && (
        <TokenDropdown
          tokens={tokens}
          position={dropdownPosition}
          onClose={() => setShowDetails(false)}
        />
      )}
    </>
  );
};

export default CostBadge;
