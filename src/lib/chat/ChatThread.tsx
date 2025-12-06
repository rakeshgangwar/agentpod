/**
 * Chat Thread Component
 * 
 * A custom Thread component built using assistant-ui primitives.
 * Styled to match our shadcn-based design system.
 */

import { type FC, type PropsWithChildren, useState, useRef, useCallback, useEffect } from "react";
import {
  ThreadPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  useThread,
  useMessage,
  useComposerRuntime,
  type ToolCallMessagePartProps,
} from "@assistant-ui/react";
import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";
import { CommandPicker, type Command } from "./CommandPicker";
import { FilePicker } from "./FilePicker";

/**
 * TextPart component renders a text part with markdown support.
 * MarkdownTextPrimitive automatically reads text from the message context.
 */
function TextPart() {
  return (
    <MarkdownTextPrimitive 
      className="prose prose-sm dark:prose-invert max-w-none"
    />
  );
}

/**
 * ToolCallPart component renders a tool call with its status
 * Props are passed by assistant-ui via ToolCallMessagePartProps
 */
function ToolCallPart({ toolName, args, result }: ToolCallMessagePartProps) {
  const isComplete = result !== undefined;
  
  // Stringify the result for display
  const resultDisplay = result === undefined 
    ? "(pending...)" 
    : result === "" || result === null
      ? "(success - no output)"
      : typeof result === 'string' 
        ? result 
        : JSON.stringify(result, null, 2);
  
  return (
    <div className="my-2 rounded-lg border border-border bg-muted/50 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-muted border-b border-border">
        <span className={`w-2 h-2 rounded-full ${isComplete ? 'bg-green-500' : 'bg-yellow-500 animate-pulse'}`} />
        <span className="font-mono text-sm font-medium">{toolName}</span>
        <span className="text-xs text-muted-foreground">
          {isComplete ? 'completed' : 'running...'}
        </span>
      </div>
      <details className="group">
        <summary className="px-3 py-2 text-xs text-muted-foreground cursor-pointer hover:bg-muted/50">
          {isComplete ? 'Show details' : 'Show arguments'}
        </summary>
        <div className="px-3 py-2 space-y-2">
          <div>
            <span className="text-xs font-medium text-muted-foreground">Arguments:</span>
            <pre className="mt-1 text-xs bg-background rounded p-2 overflow-auto max-h-32">
              {JSON.stringify(args, null, 2)}
            </pre>
          </div>
          <div>
            <span className="text-xs font-medium text-muted-foreground">Result:</span>
            <pre className="mt-1 text-xs bg-background rounded p-2 overflow-auto max-h-32">
              {resultDisplay}
            </pre>
          </div>
        </div>
      </details>
    </div>
  );
}

/**
 * ToolGroup component groups consecutive tool calls
 */
const ToolGroup: FC<PropsWithChildren<{ startIndex: number; endIndex: number }>> = ({ 
  startIndex, 
  endIndex, 
  children 
}) => {
  const toolCount = endIndex - startIndex + 1;

  return (
    <details className="my-2" open>
      <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
        {toolCount} tool {toolCount === 1 ? "call" : "calls"}
      </summary>
      <div className="mt-1 space-y-1">{children}</div>
    </details>
  );
};

/**
 * UserMessage component renders user messages
 */
function UserMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-end mb-4">
      <div className="max-w-[80%] rounded-lg px-4 py-2 bg-primary text-primary-foreground">
        <MessagePrimitive.Content
          components={{
            Text: TextPart,
          }}
        />
      </div>
    </MessagePrimitive.Root>
  );
}

/**
 * AssistantMessage component renders assistant messages
 * Hides empty messages (e.g., auto-created placeholder when isRunning)
 */
function AssistantMessage() {
  const message = useMessage();
  
  // Don't render if message has no actual content
  // (assistant-ui auto-creates empty assistant message when isRunning)
  const hasContent = message.content.some((part) => {
    if (part.type === "text" && part.text && part.text.length > 0) return true;
    if (part.type === "tool-call") return true;
    return false;
  });
  
  if (!hasContent) return null;
  
  return (
    <MessagePrimitive.Root className="flex justify-start mb-4">
      <div className="max-w-[80%] rounded-lg px-4 py-2 bg-muted">
        <MessagePrimitive.Content
          components={{
            Text: TextPart,
            tools: {
              Fallback: ToolCallPart,
            },
            ToolGroup: ToolGroup,
          }}
        />
      </div>
    </MessagePrimitive.Root>
  );
}

/**
 * Composer component for message input with slash commands and file picker
 */
interface ComposerProps {
  projectId?: string;
  findFiles?: (projectId: string, pattern: string) => Promise<string[]>;
}

function Composer({ projectId, findFiles }: ComposerProps) {
  const composerRuntime = useComposerRuntime();
  const [inputValue, setInputValue] = useState("");
  const [showCommandPicker, setShowCommandPicker] = useState(false);
  const [showFilePicker, setShowFilePicker] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [fileQuery, setFileQuery] = useState("");
  const [pickerPosition, setPickerPosition] = useState({ top: 60, left: 0 });
  const inputRef = useRef<HTMLTextAreaElement>(null);
  
  // Track cursor position for @ detection
  const [cursorPosition, setCursorPosition] = useState(0);
  
  // Handle input changes
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursor = e.target.selectionStart || 0;
    setInputValue(value);
    setCursorPosition(cursor);
    
    // Check for slash command (only at start of input)
    if (value.startsWith("/")) {
      const query = value.slice(1).split(/\s/)[0]; // Get text after "/" until space
      setCommandQuery(query);
      setShowCommandPicker(true);
      setShowFilePicker(false);
    } else {
      setShowCommandPicker(false);
    }
    
    // Check for @ mention
    const textBeforeCursor = value.slice(0, cursor);
    const atMatch = textBeforeCursor.match(/@([^\s@]*)$/);
    if (atMatch) {
      setFileQuery(atMatch[1]);
      setShowFilePicker(true);
      setShowCommandPicker(false);
      
      // Position the picker near the @ symbol
      if (inputRef.current) {
        const rect = inputRef.current.getBoundingClientRect();
        setPickerPosition({ top: 60, left: Math.min(atMatch.index || 0, rect.width - 320) });
      }
    } else if (!value.startsWith("/")) {
      setShowFilePicker(false);
    }
  }, []);
  
  // Handle command selection
  const handleCommandSelect = useCallback((command: Command) => {
    const newValue = `/${command.name} `;
    setInputValue(newValue);
    setShowCommandPicker(false);
    inputRef.current?.focus();
  }, []);
  
  // Handle file selection
  const handleFileSelect = useCallback((filePath: string) => {
    const textBeforeCursor = inputValue.slice(0, cursorPosition);
    const textAfterCursor = inputValue.slice(cursorPosition);
    
    // Replace @query with @filepath
    const atMatch = textBeforeCursor.match(/@([^\s@]*)$/);
    if (atMatch) {
      const beforeAt = textBeforeCursor.slice(0, atMatch.index);
      const newValue = `${beforeAt}@${filePath} ${textAfterCursor}`;
      setInputValue(newValue);
    }
    
    setShowFilePicker(false);
    inputRef.current?.focus();
  }, [inputValue, cursorPosition]);
  
  // Handle form submission
  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    
    // Use the composer runtime to send the message
    composerRuntime.setText(inputValue);
    composerRuntime.send();
    setInputValue("");
  }, [inputValue, composerRuntime]);
  
  // Handle key events for picker navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Let the pickers handle their own navigation
    if (showCommandPicker || showFilePicker) {
      if (["ArrowUp", "ArrowDown", "Escape"].includes(e.key)) {
        return; // Picker will handle these
      }
      if (e.key === "Enter" || e.key === "Tab") {
        return; // Picker will handle these
      }
    }
    
    // Handle Enter to send (when no picker is open)
    if (e.key === "Enter" && !e.shiftKey && !showCommandPicker && !showFilePicker) {
      e.preventDefault();
      handleSubmit(e);
    }
  }, [showCommandPicker, showFilePicker, handleSubmit]);
  
  return (
    <div className="border-t p-4 bg-background relative">
      {/* Command Picker */}
      <CommandPicker
        query={commandQuery}
        position={pickerPosition}
        onSelect={handleCommandSelect}
        onClose={() => setShowCommandPicker(false)}
        visible={showCommandPicker}
      />
      
      {/* File Picker */}
      {projectId && findFiles && (
        <FilePicker
          projectId={projectId}
          query={fileQuery}
          position={pickerPosition}
          onSelect={handleFileSelect}
          onClose={() => setShowFilePicker(false)}
          visible={showFilePicker}
          findFiles={findFiles}
        />
      )}
      
      <form onSubmit={handleSubmit}>
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Type a message... (/ for commands, @ for files)"
            className="flex-1 min-h-[40px] max-h-[200px] px-3 py-2 bg-input border border-border rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            rows={1}
          />
          <button
            type="submit"
            disabled={!inputValue.trim()}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
      </form>
      <p className="text-xs text-muted-foreground mt-2">
        Press Enter to send, Shift+Enter for new line · Type <kbd className="px-1 bg-muted rounded">/</kbd> for commands · Type <kbd className="px-1 bg-muted rounded">@</kbd> for files
      </p>
    </div>
  );
}

/**
 * EmptyState component for when there are no messages
 */
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8">
      <div className="text-muted-foreground">
        <p className="text-lg font-medium">No messages yet</p>
        <p className="text-sm mt-1">
          Send a message to start a conversation with OpenCode.
        </p>
      </div>
    </div>
  );
}

/**
 * Loading indicator shown while waiting for assistant response
 * Shows when thread is running AND the assistant hasn't started producing content yet
 */
function LoadingIndicator() {
  const isRunning = useThread((t) => t.isRunning);
  const messages = useThread((t) => t.messages);
  
  // Only show loading when:
  // 1. Thread is running (assistant is processing)
  // 2. Either:
  //    - No messages yet
  //    - Last message is from user
  //    - Last message is an empty assistant message (auto-created by runtime)
  const lastMessage = messages[messages.length - 1];
  
  let showLoading = false;
  if (isRunning) {
    if (!lastMessage) {
      showLoading = true;
    } else if (lastMessage.role === "user") {
      showLoading = true;
    } else if (lastMessage.role === "assistant") {
      // Check if assistant message has any actual content
      const hasContent = lastMessage.content.some((part) => {
        if (part.type === "text" && part.text && part.text.length > 0) return true;
        if (part.type === "tool-call") return true;
        return false;
      });
      showLoading = !hasContent;
    }
  }
  
  if (!showLoading) return null;
  
  return (
    <div className="flex justify-start mb-4">
      <div className="max-w-[80%] rounded-lg px-4 py-3 bg-muted">
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
          </div>
          <span className="text-sm text-muted-foreground">Thinking...</span>
        </div>
      </div>
    </div>
  );
}

/**
 * ChatThread props
 */
export interface ChatThreadProps {
  /** Project ID for file search */
  projectId?: string;
  /** Function to find files in the project */
  findFiles?: (projectId: string, pattern: string) => Promise<string[]>;
}

/**
 * ChatThread component renders the full chat interface
 */
export function ChatThread({ projectId, findFiles }: ChatThreadProps) {
  return (
    <ThreadPrimitive.Root className="flex flex-col h-full">
      <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto">
        <ThreadPrimitive.Empty>
          <EmptyState />
        </ThreadPrimitive.Empty>
        
        <div className="p-4">
          <ThreadPrimitive.Messages
            components={{
              UserMessage,
              AssistantMessage,
            }}
          />
          
          {/* Show loading indicator when waiting for assistant response */}
          <LoadingIndicator />
        </div>
        
        <ThreadPrimitive.ViewportFooter />
      </ThreadPrimitive.Viewport>
      
      <Composer projectId={projectId} findFiles={findFiles} />
    </ThreadPrimitive.Root>
  );
}

export default ChatThread;
