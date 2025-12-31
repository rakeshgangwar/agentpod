/**
 * MentionPicker Component
 * 
 * Shows a unified dropdown for @ mentions supporting both agents and files.
 * Agents are shown when query doesn't look like a file path.
 * Files are shown when query contains "/" or "." (path indicators).
 */

import { type FC, useState, useEffect, useCallback, useRef, useMemo } from "react";

/** Agent info (matches OpenCodeAgent from tauri.ts) */
export interface MentionAgent {
  name: string;
  description?: string;
  mode: "primary" | "subagent" | "all";
  builtIn?: boolean;
  color?: string;
  hidden?: boolean;
  default?: boolean;
}

// Type for the file finder function (passed as prop to avoid import issues)
type FindFilesFunction = (projectId: string, pattern: string) => Promise<string[]>;

export interface MentionPickerProps {
  /** Project ID to search files in */
  projectId: string;
  /** Current search query (text after "@") */
  query: string;
  /** Position for the dropdown */
  position: { top: number; left: number };
  /** Callback when a file is selected */
  onSelectFile: (filePath: string) => void;
  /** Callback when an agent is selected */
  onSelectAgent: (agentName: string) => void;
  /** Callback when picker should close */
  onClose: () => void;
  /** Whether the picker is visible */
  visible: boolean;
  /** Function to find files (injected from parent) */
  findFiles: FindFilesFunction;
  /** Available agents for @ mention */
  agents: MentionAgent[];
}

interface MentionItem {
  type: "agent" | "file";
  value: string;
  agent?: MentionAgent;
}

export const MentionPicker: FC<MentionPickerProps> = ({
  projectId,
  query,
  position,
  onSelectFile,
  onSelectAgent,
  onClose,
  visible,
  findFiles,
  agents,
}) => {
  const [files, setFiles] = useState<string[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Determine if query looks like a file path (contains / or .)
  const looksLikeFilePath = query.includes("/") || query.includes(".");

  // Filter agents based on query (case-insensitive)
  const filteredAgents = useMemo(() => {
    if (!agents || agents.length === 0) return [];
    
    // Hide hidden agents and filter by query
    const lowerQuery = query.toLowerCase();
    return agents
      .filter(agent => !agent.hidden)
      .filter(agent => {
        if (!query) return true;
        return agent.name.toLowerCase().includes(lowerQuery) ||
               (agent.description?.toLowerCase().includes(lowerQuery));
      })
      .slice(0, 10); // Limit to 10 agents
  }, [agents, query]);

  // Build unified items list for keyboard navigation
  const items = useMemo((): MentionItem[] => {
    const result: MentionItem[] = [];
    
    // Only show agents if query doesn't look like a file path
    if (!looksLikeFilePath) {
      filteredAgents.forEach(agent => {
        result.push({ type: "agent", value: agent.name, agent });
      });
    }
    
    // Add files
    files.forEach(file => {
      result.push({ type: "file", value: file });
    });
    
    return result;
  }, [filteredAgents, files, looksLikeFilePath]);

  // Fetch files when query changes (only if visible and query looks like file or is longer)
  useEffect(() => {
    if (!visible || !projectId) return;

    // Only search files if query looks like a path OR is at least 2 chars
    // This prevents unnecessary file searches when user is typing agent names
    const shouldSearchFiles = looksLikeFilePath || query.length >= 2 || query === "";

    if (!shouldSearchFiles) {
      setFiles([]);
      return;
    }

    const fetchFiles = async () => {
      setIsLoadingFiles(true);
      try {
        // OpenCode find API takes a plain search string
        const searchQuery = query || ".";
        const results = await findFiles(projectId, searchQuery);
        // Limit results
        setFiles(results.slice(0, 15));
      } catch (error) {
        console.error("Failed to fetch files:", error);
        setFiles([]);
      } finally {
        setIsLoadingFiles(false);
      }
    };

    // Debounce the search
    const timeoutId = setTimeout(fetchFiles, 150);
    return () => clearTimeout(timeoutId);
  }, [projectId, query, visible, looksLikeFilePath, findFiles]);

  // Reset selection when items change
  useEffect(() => {
    setSelectedIndex(0);
  }, [items.length]);

  // Handle item selection
  const handleSelect = useCallback((item: MentionItem) => {
    if (item.type === "agent") {
      onSelectAgent(item.value);
    } else {
      onSelectFile(item.value);
    }
  }, [onSelectAgent, onSelectFile]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!visible || items.length === 0) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev < items.length - 1 ? prev + 1 : 0
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev > 0 ? prev - 1 : items.length - 1
          );
          break;
        case "Enter":
        case "Tab":
          e.preventDefault();
          if (items[selectedIndex]) {
            handleSelect(items[selectedIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    },
    [visible, items, selectedIndex, handleSelect, onClose]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };

    if (visible) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [visible, onClose]);

  if (!visible) {
    return null;
  }

  const showAgentsSection = !looksLikeFilePath && filteredAgents.length > 0;
  const showFilesSection = files.length > 0 || isLoadingFiles;
  const showEmpty = !showAgentsSection && !showFilesSection && !isLoadingFiles;

  // Calculate the index offset for files section
  const agentCount = showAgentsSection ? filteredAgents.length : 0;

  return (
    <div
      ref={containerRef}
      className="absolute z-50 w-80 max-h-80 overflow-y-auto rounded border border-[var(--cyber-cyan)]/30 bg-popover/95 backdrop-blur-sm shadow-[0_4px_20px_rgba(0,0,0,0.3),0_0_30px_var(--cyber-cyan)/10]"
      style={{
        bottom: position.top,
        left: position.left,
      }}
    >
      <div className="p-1">
        {/* Agents Section */}
        {showAgentsSection && (
          <>
            <div className="px-2 py-1 font-mono text-xs text-muted-foreground/70 uppercase tracking-wider flex items-center gap-1.5">
              <BotIcon className="h-3 w-3" />
              Agents
            </div>
            {filteredAgents.map((agent, index) => (
              <button
                key={`agent-${agent.name}`}
                className={`w-full flex items-center gap-2 px-2 py-1.5 text-left rounded transition-colors ${
                  index === selectedIndex
                    ? "bg-[var(--cyber-cyan)]/10 text-[var(--cyber-cyan)] border-l-2 border-[var(--cyber-cyan)]"
                    : "hover:bg-[var(--cyber-cyan)]/5 border-l-2 border-transparent"
                }`}
                onClick={() => onSelectAgent(agent.name)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                {/* Agent color indicator */}
                <span 
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ 
                    backgroundColor: agent.color || "var(--cyber-cyan)",
                    boxShadow: `0 0 6px ${agent.color || "var(--cyber-cyan)"}40`
                  }}
                />
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="font-mono text-xs truncate">
                    @{agent.name}
                  </span>
                  {agent.description && (
                    <span className="font-mono text-[10px] text-muted-foreground/60 truncate">
                      {agent.description}
                    </span>
                  )}
                </div>
                {/* Mode badge */}
                <span className={`font-mono text-[9px] uppercase px-1 py-0.5 rounded ${
                  agent.mode === "primary" 
                    ? "bg-[var(--cyber-cyan)]/20 text-[var(--cyber-cyan)]" 
                    : "bg-muted/50 text-muted-foreground/60"
                }`}>
                  {agent.mode === "primary" ? "primary" : "sub"}
                </span>
              </button>
            ))}
          </>
        )}

        {/* Divider between sections */}
        {showAgentsSection && showFilesSection && (
          <div className="my-1 border-t border-border/30" />
        )}

        {/* Files Section */}
        {showFilesSection && (
          <>
            <div className="px-2 py-1 font-mono text-xs text-muted-foreground/70 uppercase tracking-wider flex items-center gap-1.5">
              <FileIcon className="h-3 w-3" />
              Files
            </div>
            {isLoadingFiles ? (
              <div className="px-2 py-3 text-center font-mono text-xs text-muted-foreground">
                <div className="animate-spin h-4 w-4 border-2 border-[var(--cyber-cyan)] border-t-transparent rounded-full mx-auto mb-2" />
                <span className="uppercase tracking-wider text-[var(--cyber-cyan)]">Searching...</span>
              </div>
            ) : (
              files.map((file, index) => {
                const actualIndex = agentCount + index;
                return (
                  <button
                    key={`file-${file}`}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 text-left rounded transition-colors ${
                      actualIndex === selectedIndex
                        ? "bg-[var(--cyber-cyan)]/10 text-[var(--cyber-cyan)] border-l-2 border-[var(--cyber-cyan)]"
                        : "hover:bg-[var(--cyber-cyan)]/5 border-l-2 border-transparent"
                    }`}
                    onClick={() => onSelectFile(file)}
                    onMouseEnter={() => setSelectedIndex(actualIndex)}
                  >
                    <FileIcon className="h-4 w-4 flex-shrink-0 text-[var(--cyber-cyan)]/60" />
                    <span className="font-mono text-xs truncate">{file}</span>
                  </button>
                );
              })
            )}
          </>
        )}

        {/* Empty state */}
        {showEmpty && (
          <div className="px-2 py-4 text-center font-mono text-xs text-muted-foreground">
            {query ? (
              <span>No matches for "<span className="text-[var(--cyber-cyan)]">{query}</span>"</span>
            ) : (
              "Type to search agents or files"
            )}
          </div>
        )}
      </div>
      
      {/* Footer with hints */}
      <div className="border-t border-border/30 px-2 py-1.5 font-mono text-xs text-muted-foreground">
        <kbd className="px-1 bg-muted/50 rounded border border-border/30">↑↓</kbd> navigate
        <span className="mx-2 text-[var(--cyber-cyan)]/30">·</span>
        <kbd className="px-1 bg-muted/50 rounded border border-border/30">Enter</kbd> select
        <span className="mx-2 text-[var(--cyber-cyan)]/30">·</span>
        <kbd className="px-1 bg-muted/50 rounded border border-border/30">Esc</kbd> close
      </div>
    </div>
  );
};

// Simple bot icon component
const BotIcon: FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 8V4H8" />
    <rect width="16" height="12" x="4" y="8" rx="2" />
    <path d="M2 14h2" />
    <path d="M20 14h2" />
    <path d="M15 13v2" />
    <path d="M9 13v2" />
  </svg>
);

// Simple file icon component
const FileIcon: FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
);

export default MentionPicker;
