/**
 * RetryIndicator Component
 * 
 * Displays retry attempts that occurred during a message.
 * Shows error information and retry count.
 * 
 * Design:
 * - Warning-styled to indicate issues
 * - Shows error details
 * - Collapsible for multiple retries
 */

import { useState, memo, type FC } from "react";
import type { InternalRetry } from "../types/messages";

interface RetryIndicatorProps {
  retries: InternalRetry[];
  /** Compact mode - just show count */
  compact?: boolean;
}

/**
 * Format timestamp to relative time
 */
function formatRelativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

const RetryItem: FC<{ retry: InternalRetry }> = memo(({ retry }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  return (
    <div className="border-b border-[var(--cyber-amber)]/10 last:border-0">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-3 py-2 flex items-center gap-2 hover:bg-[var(--cyber-amber)]/10 transition-colors text-left"
      >
        {/* Expand indicator */}
        <span className="text-[var(--cyber-amber)]/60 text-xs">
          {isExpanded ? "▼" : "▶"}
        </span>
        
        {/* Attempt badge */}
        <span className="flex-shrink-0 px-1.5 py-0.5 rounded bg-[var(--cyber-amber)]/10 border border-[var(--cyber-amber)]/30">
          <span className="font-mono text-[10px] text-[var(--cyber-amber)]">
            Attempt {retry.attempt}
          </span>
        </span>
        
        {/* Error name */}
        <span className="font-mono text-xs text-[var(--cyber-amber)] truncate flex-1">
          {retry.error.name}
        </span>
        
        {/* Timestamp */}
        <span className="font-mono text-[10px] text-muted-foreground/50 flex-shrink-0">
          {formatRelativeTime(retry.createdAt)}
        </span>
      </button>
      
      {/* Expanded error details */}
      {isExpanded && (
        <div className="px-3 pb-2 pl-8 space-y-2">
          {/* Error message */}
          <div className="p-2 rounded bg-[var(--cyber-amber)]/5 border border-[var(--cyber-amber)]/20">
            <div className="font-mono text-xs text-[var(--cyber-amber)]">
              {retry.error.message}
            </div>
          </div>
          
          {/* Additional info */}
          <div className="flex flex-wrap gap-2 font-mono text-[10px]">
            {retry.error.statusCode !== undefined && (
              <span className="px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground">
                Status: {retry.error.statusCode}
              </span>
            )}
            {retry.error.isRetryable !== undefined && (
              <span className={`px-1.5 py-0.5 rounded ${
                retry.error.isRetryable 
                  ? "bg-[var(--cyber-emerald)]/10 text-[var(--cyber-emerald)]" 
                  : "bg-[var(--cyber-red)]/10 text-[var(--cyber-red)]"
              }`}>
                {retry.error.isRetryable ? "Retryable" : "Non-retryable"}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

/**
 * RetryIndicator shows retry attempts
 */
export const RetryIndicator: FC<RetryIndicatorProps> = ({ retries, compact = false }) => {
  if (!retries || retries.length === 0) {
    return null;
  }
  
  // Get max attempt number
  const maxAttempt = Math.max(...retries.map(r => r.attempt));
  
  if (compact) {
    // Compact mode - just show count
    return (
      <span className="inline-flex items-center gap-1 font-mono text-[10px] text-[var(--cyber-amber)]">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
          <path d="M3 3v5h5" />
          <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
          <path d="M16 21h5v-5" />
        </svg>
        {retries.length} {retries.length === 1 ? "retry" : "retries"}
      </span>
    );
  }
  
  return (
    <div className="my-2 rounded border border-[var(--cyber-amber)]/20 bg-[var(--cyber-amber)]/5 overflow-hidden">
      {/* Header */}
      <div className="px-3 py-1.5 border-b border-[var(--cyber-amber)]/10 flex items-center gap-2 bg-[var(--cyber-amber)]/10">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--cyber-amber)]">
          <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
          <path d="M3 3v5h5" />
          <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
          <path d="M16 21h5v-5" />
        </svg>
        <span className="font-mono text-xs uppercase tracking-wider text-[var(--cyber-amber)]">
          Retry Attempts
        </span>
        <span className="ml-auto font-mono text-[10px] text-muted-foreground/60">
          {retries.length} {retries.length === 1 ? "attempt" : "attempts"}
          {maxAttempt > 1 && ` (up to ${maxAttempt})`}
        </span>
      </div>
      
      {/* Retry list */}
      <div>
        {retries.map((retry, index) => (
          <RetryItem key={retry.id || index} retry={retry} />
        ))}
      </div>
    </div>
  );
};

export default RetryIndicator;
