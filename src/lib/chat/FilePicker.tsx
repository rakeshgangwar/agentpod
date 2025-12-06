/**
 * FilePicker Component
 * 
 * Shows a dropdown list of files when user types "@" in the chat input.
 * Files are fetched from the OpenCode container using the find.files API.
 */

import { type FC, useState, useEffect, useCallback, useRef } from "react";

// Type for the file finder function (passed as prop to avoid import issues)
type FindFilesFunction = (projectId: string, pattern: string) => Promise<string[]>;

interface FilePickerProps {
  /** Project ID to search files in */
  projectId: string;
  /** Current search query (text after "@") */
  query: string;
  /** Position for the dropdown */
  position: { top: number; left: number };
  /** Callback when a file is selected */
  onSelect: (filePath: string) => void;
  /** Callback when picker should close */
  onClose: () => void;
  /** Whether the picker is visible */
  visible: boolean;
  /** Function to find files (injected from parent) */
  findFiles: FindFilesFunction;
}

export const FilePicker: FC<FilePickerProps> = ({
  projectId,
  query,
  position,
  onSelect,
  onClose,
  visible,
  findFiles,
}) => {
  const [files, setFiles] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch files when query changes
  useEffect(() => {
    if (!visible || !projectId) return;

    const fetchFiles = async () => {
      setIsLoading(true);
      try {
        // OpenCode find API takes a plain search string (not glob patterns)
        // If query is empty, use a broad search term to show some files
        const searchQuery = query || ".";
        const results = await findFiles(projectId, searchQuery);
        // Limit results to prevent overwhelming the UI
        setFiles(results.slice(0, 20));
      } catch (error) {
        console.error("Failed to fetch files:", error);
        setFiles([]);
      } finally {
        setIsLoading(false);
      }
    };

    // Debounce the search
    const timeoutId = setTimeout(fetchFiles, 150);
    return () => clearTimeout(timeoutId);
  }, [projectId, query, visible]);

  // Reset selection when files change
  useEffect(() => {
    setSelectedIndex(0);
  }, [files]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!visible) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev < files.length - 1 ? prev + 1 : 0
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev > 0 ? prev - 1 : files.length - 1
          );
          break;
        case "Enter":
        case "Tab":
          e.preventDefault();
          if (files[selectedIndex]) {
            onSelect(files[selectedIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    },
    [visible, files, selectedIndex, onSelect, onClose]
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

  return (
    <div
      ref={containerRef}
      className="absolute z-50 w-80 max-h-64 overflow-y-auto rounded-md border border-border bg-popover shadow-lg"
      style={{
        bottom: position.top,
        left: position.left,
      }}
    >
      <div className="p-1">
        {isLoading ? (
          <div className="px-2 py-4 text-center text-sm text-muted-foreground">
            <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full mx-auto mb-2" />
            Searching files...
          </div>
        ) : files.length === 0 ? (
          <div className="px-2 py-4 text-center text-sm text-muted-foreground">
            {query ? `No files matching "${query}"` : "No files found"}
          </div>
        ) : (
          files.map((file, index) => (
            <button
              key={file}
              className={`w-full flex items-center gap-2 px-2 py-1.5 text-left text-sm rounded-sm transition-colors ${
                index === selectedIndex
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-accent/50"
              }`}
              onClick={() => onSelect(file)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <FileIcon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
              <span className="font-mono text-xs truncate">{file}</span>
            </button>
          ))
        )}
      </div>
      <div className="border-t border-border px-2 py-1.5 text-xs text-muted-foreground">
        <kbd className="px-1 bg-muted rounded">↑↓</kbd> navigate
        <span className="mx-2">·</span>
        <kbd className="px-1 bg-muted rounded">Enter</kbd> select
        <span className="mx-2">·</span>
        <kbd className="px-1 bg-muted rounded">Esc</kbd> close
      </div>
    </div>
  );
};

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

export default FilePicker;
