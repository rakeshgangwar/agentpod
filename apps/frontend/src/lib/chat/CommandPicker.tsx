/**
 * CommandPicker Component
 * 
 * Shows a dropdown list of available slash commands when user types "/"
 * at the beginning of the input.
 */

import { type FC, useState, useEffect, useCallback, useRef } from "react";

export interface Command {
  name: string;
  description: string;
  args?: string; // e.g., "[filename]" or "<query>"
}

// Built-in OpenCode commands
const BUILTIN_COMMANDS: Command[] = [
  { name: "file", description: "Browse and select a file to reference" },
  { name: "init", description: "Analyze app and create AGENTS.md" },
  { name: "undo", description: "Undo the last action" },
  { name: "redo", description: "Redo the last undone action" },
  { name: "share", description: "Share this session" },
  { name: "help", description: "Show available commands" },
  { name: "compact", description: "Summarize and compact the conversation" },
  { name: "clear", description: "Clear the conversation" },
];

interface CommandPickerProps {
  /** Current search query (text after "/") */
  query: string;
  /** Position for the dropdown */
  position: { top: number; left: number };
  /** Callback when a command is selected */
  onSelect: (command: Command) => void;
  /** Callback when picker should close */
  onClose: () => void;
  /** Whether the picker is visible */
  visible: boolean;
}

export const CommandPicker: FC<CommandPickerProps> = ({
  query,
  position,
  onSelect,
  onClose,
  visible,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Filter commands based on query
  const filteredCommands = BUILTIN_COMMANDS.filter((cmd) =>
    cmd.name.toLowerCase().startsWith(query.toLowerCase())
  );

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!visible) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev < filteredCommands.length - 1 ? prev + 1 : 0
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev > 0 ? prev - 1 : filteredCommands.length - 1
          );
          break;
        case "Enter":
        case "Tab":
          e.preventDefault();
          if (filteredCommands[selectedIndex]) {
            onSelect(filteredCommands[selectedIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    },
    [visible, filteredCommands, selectedIndex, onSelect, onClose]
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

  if (!visible || filteredCommands.length === 0) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className="absolute z-50 w-64 max-h-64 overflow-y-auto rounded-md border border-border bg-popover shadow-lg"
      style={{
        bottom: position.top,
        left: position.left,
      }}
    >
      <div className="p-1">
        {filteredCommands.map((command, index) => (
          <button
            key={command.name}
            className={`w-full flex items-start gap-2 px-2 py-1.5 text-left text-sm rounded-sm transition-colors ${
              index === selectedIndex
                ? "bg-accent text-accent-foreground"
                : "hover:bg-accent/50"
            }`}
            onClick={() => onSelect(command)}
            onMouseEnter={() => setSelectedIndex(index)}
          >
            <span className="font-mono text-primary">/{command.name}</span>
            <span className="text-muted-foreground text-xs truncate flex-1">
              {command.description}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default CommandPicker;
