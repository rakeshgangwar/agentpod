/**
 * PatchViewer Component
 * 
 * Displays file patches/changes made during a message.
 * Shows which files were modified with expandable details.
 * 
 * Design:
 * - Compact list of modified files by default
 * - Shows file count and hash
 * - Could be extended to show actual diffs in future
 */

import { useState, memo, type FC } from "react";
import type { InternalPatch } from "../types/messages";

interface PatchViewerProps {
  patches: InternalPatch[];
  /** Compact mode - just show count */
  compact?: boolean;
}

/**
 * Get file extension icon
 */
function getFileIcon(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  
  switch (ext) {
    case "ts":
    case "tsx":
      return "📘"; // TypeScript
    case "js":
    case "jsx":
      return "📙"; // JavaScript
    case "py":
      return "🐍"; // Python
    case "rs":
      return "🦀"; // Rust
    case "go":
      return "🐹"; // Go
    case "md":
      return "📝"; // Markdown
    case "json":
      return "📋"; // JSON
    case "css":
    case "scss":
      return "🎨"; // Styles
    case "html":
      return "🌐"; // HTML
    default:
      return "📄"; // Generic file
  }
}

const PatchItem: FC<{ patch: InternalPatch }> = memo(({ patch }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Safely get files array
  const files = patch.files ?? [];
  const fileCount = files.length;
  const hash = patch.hash ?? "";
  
  return (
    <div className="border-b border-border/10 last:border-0">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-3 py-2 flex items-center gap-2 hover:bg-muted/30 transition-colors text-left"
      >
        {/* Expand indicator */}
        <span className="text-muted-foreground/60 text-xs">
          {isExpanded ? "▼" : "▶"}
        </span>
        
        {/* File count badge */}
        <span className="flex-shrink-0 px-1.5 py-0.5 rounded bg-[var(--cyber-emerald)]/10 border border-[var(--cyber-emerald)]/30">
          <span className="font-mono text-[10px] text-[var(--cyber-emerald)]">
            {fileCount} {fileCount === 1 ? "file" : "files"}
          </span>
        </span>
        
        {/* Hash (truncated) */}
        {hash && (
          <span className="font-mono text-[10px] text-muted-foreground/50 ml-auto">
            #{hash.slice(0, 8)}
          </span>
        )}
      </button>
      
      {/* Expanded file list */}
      {isExpanded && files.length > 0 && (
        <div className="px-3 pb-2 pl-8 space-y-1">
          {files.map((file, index) => (
            <div 
              key={index}
              className="flex items-center gap-2 font-mono text-xs"
            >
              <span>{getFileIcon(file)}</span>
              <span className="text-[var(--cyber-cyan)] truncate">{file}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

/**
 * PatchViewer shows file changes
 */
export const PatchViewer: FC<PatchViewerProps> = ({ patches, compact = false }) => {
  if (!patches || patches.length === 0) {
    return null;
  }
  
  // Filter out patches with no files array
  const validPatches = patches.filter(p => p.files && Array.isArray(p.files));
  
  if (validPatches.length === 0) {
    return null;
  }
  
  // Calculate totals
  const totalFiles = validPatches.reduce((acc, p) => acc + p.files.length, 0);
  const uniqueFiles = new Set(validPatches.flatMap(p => p.files)).size;
  
  if (compact) {
    // Compact mode - just show count
    return (
      <span className="inline-flex items-center gap-1 font-mono text-[10px] text-[var(--cyber-emerald)]">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
          <polyline points="14 2 14 8 20 8" />
          <path d="M12 18v-6" />
          <path d="M9 15l3 3 3-3" />
        </svg>
        {uniqueFiles} {uniqueFiles === 1 ? "file" : "files"} changed
      </span>
    );
  }
  
  return (
    <div className="my-2 rounded border border-[var(--cyber-emerald)]/20 bg-[var(--cyber-emerald)]/5 overflow-hidden">
      {/* Header */}
      <div className="px-3 py-1.5 border-b border-[var(--cyber-emerald)]/10 flex items-center gap-2 bg-[var(--cyber-emerald)]/10">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--cyber-emerald)]">
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
          <polyline points="14 2 14 8 20 8" />
          <path d="M12 18v-6" />
          <path d="M9 15l3 3 3-3" />
        </svg>
        <span className="font-mono text-xs uppercase tracking-wider text-[var(--cyber-emerald)]">
          Files Changed
        </span>
        <span className="ml-auto font-mono text-[10px] text-muted-foreground/60">
          {uniqueFiles} {uniqueFiles === 1 ? "file" : "files"} in {patches.length} {patches.length === 1 ? "patch" : "patches"}
        </span>
      </div>
      
      {/* Patch list */}
      <div>
        {validPatches.map((patch, index) => (
          <PatchItem key={patch.id || index} patch={patch} />
        ))}
      </div>
    </div>
  );
};

export default PatchViewer;
