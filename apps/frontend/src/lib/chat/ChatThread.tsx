/**
 * Chat Thread Component
 * 
 * A custom Thread component built using assistant-ui primitives.
 * Styled to match our shadcn-based design system.
 */

import { type FC, type PropsWithChildren, useState, useRef, useCallback, useEffect, useMemo, createContext, useContext } from "react";
import {
  ThreadPrimitive,
  MessagePrimitive,
  useThread,
  useMessage,
  useComposerRuntime,
  type ToolCallMessagePartProps,
} from "@assistant-ui/react";
import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";
import remarkGfm from "remark-gfm";
import { CommandPicker, type Command } from "./CommandPicker";
import { FilePicker } from "./FilePicker";
import { FileAttachmentButton, FileAttachmentPreview, type AttachedFile } from "./FileAttachment";
import { useAttachments } from "./RuntimeProvider";

/**
 * Child session info for matching task tools to their spawned sessions
 */
export interface ChildSessionInfo {
  id: string;
  title?: string;
  createdAt?: number;
}

/**
 * Context for session navigation from tool calls (e.g., navigating to child sessions from task tools)
 */
interface SessionNavigationContextValue {
  onSessionSelect?: (sessionId: string) => void;
  /** Child sessions of the current session, used to match task tool calls to their spawned sessions */
  childSessions?: ChildSessionInfo[];
}

const SessionNavigationContext = createContext<SessionNavigationContextValue>({});

/**
 * Markdown component overrides with assistant-ui classes for proper styling
 */
const markdownComponents = {
  h1: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h1 className="aui-md-h1" {...props}>{children}</h1>
  ),
  h2: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h2 className="aui-md-h2" {...props}>{children}</h2>
  ),
  h3: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h3 className="aui-md-h3" {...props}>{children}</h3>
  ),
  h4: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h4 className="aui-md-h4" {...props}>{children}</h4>
  ),
  h5: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h5 className="aui-md-h5" {...props}>{children}</h5>
  ),
  h6: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h6 className="aui-md-h6" {...props}>{children}</h6>
  ),
  p: ({ children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p className="aui-md-p" {...props}>{children}</p>
  ),
  a: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a className="aui-md-a" {...props}>{children}</a>
  ),
  blockquote: ({ children, ...props }: React.BlockquoteHTMLAttributes<HTMLQuoteElement>) => (
    <blockquote className="aui-md-blockquote" {...props}>{children}</blockquote>
  ),
  ul: ({ children, ...props }: React.HTMLAttributes<HTMLUListElement>) => (
    <ul className="aui-md-ul" {...props}>{children}</ul>
  ),
  ol: ({ children, ...props }: React.OlHTMLAttributes<HTMLOListElement>) => (
    <ol className="aui-md-ol" {...props}>{children}</ol>
  ),
  li: ({ children, ...props }: React.LiHTMLAttributes<HTMLLIElement>) => (
    <li className="aui-md-li" {...props}>{children}</li>
  ),
  hr: (props: React.HTMLAttributes<HTMLHRElement>) => (
    <hr className="aui-md-hr" {...props} />
  ),
  table: ({ children, ...props }: React.TableHTMLAttributes<HTMLTableElement>) => (
    <table className="aui-md-table" {...props}>{children}</table>
  ),
  thead: ({ children, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) => (
    <thead className="aui-md-thead" {...props}>{children}</thead>
  ),
  tbody: ({ children, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) => (
    <tbody className="aui-md-tbody" {...props}>{children}</tbody>
  ),
  tr: ({ children, ...props }: React.HTMLAttributes<HTMLTableRowElement>) => (
    <tr className="aui-md-tr" {...props}>{children}</tr>
  ),
  th: ({ children, ...props }: React.ThHTMLAttributes<HTMLTableHeaderCellElement>) => (
    <th className="aui-md-th" {...props}>{children}</th>
  ),
  td: ({ children, ...props }: React.TdHTMLAttributes<HTMLTableDataCellElement>) => (
    <td className="aui-md-td" {...props}>{children}</td>
  ),
  // Checkbox input for task lists (GFM)
  input: ({ type, checked, disabled, ...props }: React.InputHTMLAttributes<HTMLInputElement>) => {
    if (type === "checkbox") {
      return (
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          readOnly
          className="aui-md-checkbox mr-2 h-4 w-4 rounded border-border"
          {...props}
        />
      );
    }
    return <input type={type} {...props} />;
  },
};

/**
 * TextPart component renders a text part with markdown support.
 * MarkdownTextPrimitive automatically reads text from the message context.
 * Uses assistant-ui markdown classes (.aui-md-*) for styling.
 * remarkGfm enables GitHub Flavored Markdown (tables, task lists, strikethrough, etc.)
 */
function TextPart() {
  return (
    <MarkdownTextPrimitive 
      remarkPlugins={[remarkGfm]}
      className="aui-md max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
      components={markdownComponents}
    />
  );
}

/**
 * ImagePart component renders an image attachment
 */
interface ImagePartProps {
  image: string;
}

function ImagePart({ image }: ImagePartProps) {
  return (
    <div className="my-2">
      <img 
        src={image} 
        alt="Attached image"
        className="max-w-full max-h-64 rounded border border-[var(--cyber-cyan)]/20 object-contain"
      />
    </div>
  );
}

/**
 * FilePart component renders a non-image file attachment
 */
interface FilePartProps {
  file: {
    url: string;
    filename?: string;
    mime?: string;
  };
}

function FilePart({ file }: FilePartProps) {
  // Get file icon based on MIME type
  const getFileIcon = (mime?: string): string => {
    if (!mime) return "document";
    if (mime === "application/pdf") return "pdf";
    if (mime.startsWith("text/")) return "text";
    if (mime.startsWith("audio/")) return "audio";
    if (mime.startsWith("video/")) return "video";
    return "document";
  };
  
  const iconType = getFileIcon(file.mime);
  
  return (
    <div className="my-2 inline-flex items-center gap-2 px-3 py-2 bg-background/30 rounded border border-[var(--cyber-cyan)]/20 font-mono text-sm">
      <span className="text-lg">
        {iconType === "pdf" && "📄"}
        {iconType === "text" && "📝"}
        {iconType === "audio" && "🎵"}
        {iconType === "video" && "🎬"}
        {iconType === "document" && "📎"}
      </span>
      <span className="truncate max-w-[200px] text-[var(--cyber-cyan)]">
        {file.filename || "Attached file"}
      </span>
    </div>
  );
}

/**
 * UserTextPart - text rendering for user messages with markdown support
 */
function UserTextPart() {
  return (
    <MarkdownTextPrimitive 
      remarkPlugins={[remarkGfm]}
      className="aui-root max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
    />
  );
}

/**
 * ToolCallPart component renders a tool call with its status
 * Props are passed by assistant-ui via ToolCallMessagePartProps
 * 
 * Special handling for "task" tool: Shows a navigation link to view the child session
 * Since task tool results don't contain the session ID, we match by description to child sessions
 * 
 * Error handling: Detects error status from result.error or result object structure
 */
function ToolCallPart({ toolName, args, result }: ToolCallMessagePartProps) {
  const { onSessionSelect, childSessions } = useContext(SessionNavigationContext);
  
  // Detect completion and error states
  const isComplete = result !== undefined;
  
  // Check for error state - result can be { error: "message" } or just the error string
  const isError = isComplete && (
    (typeof result === "object" && result !== null && "error" in result) ||
    (typeof result === "string" && result.toLowerCase().includes("error"))
  );
  
  // Extract error message if present
  const errorMessage = isError 
    ? (typeof result === "object" && result !== null && "error" in result
        ? (result as { error: string }).error
        : typeof result === "string" ? result : "Tool execution failed")
    : undefined;
  
  // Check if this is a task tool that spawned a child session
  const isTaskTool = toolName === "task";
  let childSessionId: string | undefined;
  
  if (isTaskTool) {
    // First try to get session ID from result (in case OpenCode returns it)
    if (result && typeof result === "object") {
      const resultObj = result as Record<string, unknown>;
      childSessionId = (
        resultObj.sessionId as string | undefined ||
        resultObj.session_id as string | undefined ||
        resultObj.sessionID as string | undefined ||
        (resultObj.session as { id?: string } | undefined)?.id
      );
    }
    
    // If not in result, try to match by description to child sessions
    // Child session titles typically contain the task description
    if (!childSessionId && childSessions && childSessions.length > 0 && args) {
      const taskArgs = args as { description?: string; subagent_type?: string };
      const description = taskArgs.description;
      const subagentType = taskArgs.subagent_type;
      
      if (description || subagentType) {
        // Find child session whose title contains the description or subagent type
        const matchedSession = childSessions.find(session => {
          if (!session.title) return false;
          const titleLower = session.title.toLowerCase();
          
          // Match by description in title
          if (description && titleLower.includes(description.toLowerCase())) {
            return true;
          }
          
          // Match by subagent type (e.g., "@onboarding subagent" in title)
          if (subagentType && titleLower.includes(`@${subagentType}`)) {
            return true;
          }
          
          return false;
        });
        
        if (matchedSession) {
          childSessionId = matchedSession.id;
        }
      }
    }
  }
  
  const handleNavigateToSession = useCallback(() => {
    if (childSessionId && onSessionSelect) {
      onSessionSelect(childSessionId);
    }
  }, [childSessionId, onSessionSelect]);
  
  // Stringify the result for display
  const resultDisplay = result === undefined 
    ? "(pending...)" 
    : result === "" || result === null
      ? "(success - no output)"
      : typeof result === 'string' 
        ? result 
        : JSON.stringify(result, null, 2);
  
  // Determine status indicator styling - using cyber colors
  const statusIndicatorClass = isError 
    ? 'bg-[var(--cyber-red)] shadow-[0_0_8px_var(--cyber-red)]' 
    : isComplete 
      ? 'bg-[var(--cyber-emerald)] shadow-[0_0_8px_var(--cyber-emerald)]' 
      : 'bg-[var(--cyber-amber)] shadow-[0_0_8px_var(--cyber-amber)] animate-pulse';
  
  const statusText = isError 
    ? 'failed' 
    : isComplete 
      ? 'completed' 
      : 'running...';
  
  return (
    <div className={`my-2 rounded border overflow-hidden w-full min-w-0 ${isError ? 'border-[var(--cyber-red)]/50 bg-[var(--cyber-red)]/5' : 'border-border/50 bg-muted/30'}`}>
      <div className={`flex items-center gap-2 px-3 py-2 border-b ${isError ? 'bg-[var(--cyber-red)]/10 border-[var(--cyber-red)]/30' : 'bg-muted/50 border-border/30'}`}>
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusIndicatorClass}`} />
        <span className="font-mono text-xs font-medium truncate text-[var(--cyber-cyan)]">{toolName}</span>
        <span className={`font-mono text-xs flex-shrink-0 uppercase tracking-wider ${isError ? 'text-[var(--cyber-red)]' : 'text-muted-foreground'}`}>
          {statusText}
        </span>
        {/* Show navigation link for task tool with child session */}
        {isTaskTool && childSessionId && onSessionSelect && (
          <button
            onClick={handleNavigateToSession}
            className="ml-auto font-mono text-xs text-[var(--cyber-cyan)] hover:text-[var(--cyber-cyan)]/80 hover:underline flex items-center gap-1 flex-shrink-0 transition-colors"
          >
            View Session
            <span>→</span>
          </button>
        )}
      </div>
      {/* Show error message prominently if there's an error */}
      {isError && errorMessage && (
        <div className="px-3 py-2 font-mono text-xs text-[var(--cyber-red)] bg-[var(--cyber-red)]/5 border-b border-[var(--cyber-red)]/20">
          <span className="font-medium uppercase tracking-wider">Error:</span> {errorMessage}
        </div>
      )}
      <details className="group">
        <summary className="px-3 py-2 font-mono text-xs text-muted-foreground cursor-pointer hover:bg-muted/30 transition-colors">
          {isComplete ? '> Show details' : '> Show arguments'}
        </summary>
        <div className="px-3 py-2 space-y-2 min-w-0">
          <div className="min-w-0">
            <span className="font-mono text-xs font-medium text-[var(--cyber-cyan)] uppercase tracking-wider">Arguments:</span>
            <pre className="mt-1 font-mono text-xs bg-background/50 rounded p-2 overflow-x-auto max-h-32 whitespace-pre-wrap break-all border border-border/30">
              {JSON.stringify(args, null, 2)}
            </pre>
          </div>
          <div className="min-w-0">
            <span className="font-mono text-xs font-medium text-[var(--cyber-cyan)] uppercase tracking-wider">Result:</span>
            <pre className={`mt-1 font-mono text-xs rounded p-2 overflow-x-auto max-h-32 whitespace-pre-wrap break-all border ${isError ? 'bg-[var(--cyber-red)]/5 text-[var(--cyber-red)] border-[var(--cyber-red)]/30' : 'bg-background/50 border-border/30'}`}>
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
      <summary className="cursor-pointer font-mono text-xs uppercase tracking-wider text-[var(--cyber-cyan)] hover:text-[var(--cyber-cyan)]/80 transition-colors">
        [{toolCount}] tool {toolCount === 1 ? "call" : "calls"}
      </summary>
      <div className="mt-1 space-y-1">{children}</div>
    </details>
  );
};

/**
 * UserMessage component renders user messages with text and file attachments
 */
function UserMessage() {
  const message = useMessage();
  
  // Extract custom file attachments from message content (we add these via ThreadMessageLike)
  // Cast to unknown first to bypass strict typing since we're adding custom content types
  const content = message.content as unknown[];
  
  const imageAttachments: { type: "image"; image: string }[] = [];
  const fileAttachments: { type: "file"; file: { url: string; filename?: string; mime?: string } }[] = [];
  
  for (const part of content) {
    const p = part as { type: string; image?: string; file?: { url: string; filename?: string; mime?: string } };
    if (p.type === "image" && p.image) {
      imageAttachments.push({ type: "image", image: p.image });
    } else if (p.type === "file" && p.file) {
      fileAttachments.push({ type: "file", file: p.file });
    }
  }
  
  // Check if there's any text content
  const hasText = content.some((p) => {
    const part = p as { type: string; text?: string };
    return part.type === "text" && part.text && part.text.trim().length > 0;
  });

  return (
    <MessagePrimitive.Root className="flex justify-end mb-4">
      <div className="max-w-[80%] rounded px-4 py-2 bg-[var(--cyber-cyan)] text-black font-mono text-sm border border-[var(--cyber-cyan)] shadow-[0_0_12px_var(--cyber-cyan)/20]">
        {/* Render images */}
        {imageAttachments.map((img, index) => (
          <ImagePart key={`img-${index}`} image={img.image} />
        ))}
        
        {/* Render other file attachments */}
        {fileAttachments.map((file, index) => (
          <FilePart key={`file-${index}`} file={file.file} />
        ))}
        
        {/* Render text content - suppress default Image rendering by providing empty component */}
        {hasText && (
          <MessagePrimitive.Content
            components={{
              Text: UserTextPart,
              Image: () => null, // Suppress default image rendering (we render them above)
            }}
          />
        )}
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
    <MessagePrimitive.Root className="flex justify-start mb-4 min-w-0 w-full">
      <div className="max-w-[80%] min-w-0 rounded px-4 py-2 bg-muted/50 border border-border/30 overflow-hidden backdrop-blur-sm">
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
 * Composer component for message input with slash commands, file picker, and file attachments
 */
interface ComposerProps {
  projectId?: string;
  findFiles?: (projectId: string, pattern: string) => Promise<string[]>;
  onFilePickerRequest?: () => void;
  pendingFilePath?: string | null;
  onPendingFilePathClear?: () => void;
}

function Composer({ projectId, findFiles, onFilePickerRequest, pendingFilePath, onPendingFilePathClear }: ComposerProps) {
  // Get the sendWithAttachments handler from context
  const { sendWithAttachments } = useAttachments();
  const composerRuntime = useComposerRuntime();
  const [inputValue, setInputValue] = useState("");
  const [showCommandPicker, setShowCommandPicker] = useState(false);
  const [showFilePicker, setShowFilePicker] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [fileQuery, setFileQuery] = useState("");
  const [pickerPosition, setPickerPosition] = useState({ top: 60, left: 0 });
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // File attachments state
  const [attachments, setAttachments] = useState<AttachedFile[]>([]);
  
  // Track cursor position for @ detection
  const [cursorPosition, setCursorPosition] = useState(0);
  
  // Handle pending file path from external file picker modal
  useEffect(() => {
    if (pendingFilePath && onPendingFilePathClear) {
      // Insert the file path at the current position or append
      const newValue = inputValue ? `${inputValue} @${pendingFilePath}` : `@${pendingFilePath} `;
      setInputValue(newValue);
      onPendingFilePathClear();
      inputRef.current?.focus();
    }
  }, [pendingFilePath, onPendingFilePathClear]);
  
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
    // Special handling for /file command - open file picker modal
    if (command.name === "file" && onFilePickerRequest) {
      setInputValue("");
      setShowCommandPicker(false);
      onFilePickerRequest();
      return;
    }
    
    const newValue = `/${command.name} `;
    setInputValue(newValue);
    setShowCommandPicker(false);
    inputRef.current?.focus();
  }, [onFilePickerRequest]);
  
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
  
  // Handle file attachment from file input
  const handleAttachmentSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    
    const maxSizeMB = 10;
    const acceptedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf", "text/plain"];
    
    for (const file of files) {
      if (!acceptedTypes.includes(file.type)) {
        console.warn(`File type ${file.type} not supported`);
        continue;
      }
      if (file.size > maxSizeMB * 1024 * 1024) {
        console.warn(`File ${file.name} exceeds ${maxSizeMB}MB limit`);
        continue;
      }
      
      try {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error("Failed to read file"));
          reader.readAsDataURL(file);
        });
        
        setAttachments(prev => [...prev, {
          id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          name: file.name,
          mime: file.type,
          size: file.size,
          url: dataUrl,
        }]);
      } catch (err) {
        console.error("Failed to read file:", file.name, err);
      }
    }
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);
  
  const handleRemoveAttachment = useCallback((id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  }, []);

  // Handle form submission
  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() && attachments.length === 0) return;
    
    // If we have attachments, use the attachment handler from context
    if (attachments.length > 0) {
      sendWithAttachments(inputValue, attachments);
      setInputValue("");
      setAttachments([]);
      return;
    }
    
    // Otherwise use the composer runtime for text-only messages
    composerRuntime.setText(inputValue);
    composerRuntime.send();
    setInputValue("");
    setAttachments([]);
  }, [inputValue, attachments, composerRuntime, sendWithAttachments]);
  
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
    <div className="border-t border-[var(--cyber-cyan)]/20 p-4 bg-background/80 backdrop-blur-sm relative">
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
        {/* File attachment preview */}
        <FileAttachmentPreview 
          attachments={attachments} 
          onRemove={handleRemoveAttachment} 
        />
        
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/gif,image/webp,application/pdf,text/plain"
          onChange={handleAttachmentSelect}
          className="hidden"
        />
        
        <div className="flex gap-2 items-end">
          {/* Attachment button */}
          <FileAttachmentButton
            onClick={() => fileInputRef.current?.click()}
            disabled={attachments.length >= 5}
            hasAttachments={attachments.length > 0}
          />
          
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="> Type a message... (/ for commands, @ for files)"
            className="flex-1 min-h-[40px] max-h-[200px] px-3 py-2 font-mono text-sm bg-background/50 border border-border/50 rounded resize-none focus:outline-none focus:border-[var(--cyber-cyan)] focus:ring-1 focus:ring-[var(--cyber-cyan)] placeholder:text-muted-foreground/50 transition-colors"
            rows={1}
          />
          <button
            type="submit"
            disabled={!inputValue.trim() && attachments.length === 0}
            className="px-4 py-2 font-mono text-xs uppercase tracking-wider bg-[var(--cyber-cyan)] text-black rounded hover:bg-[var(--cyber-cyan)]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-[0_0_12px_var(--cyber-cyan)/20]"
          >
            Send
          </button>
        </div>
      </form>
      <p className="font-mono text-xs text-muted-foreground/70 mt-2">
        <kbd className="px-1 bg-muted/50 rounded border border-border/30">Enter</kbd> send · 
        <kbd className="px-1 bg-muted/50 rounded border border-border/30 mx-1">Shift+Enter</kbd> newline · 
        <kbd className="px-1 bg-muted/50 rounded border border-border/30">📎</kbd> attach · 
        <kbd className="px-1 bg-muted/50 rounded border border-border/30 mx-1">/</kbd> commands · 
        <kbd className="px-1 bg-muted/50 rounded border border-border/30">@</kbd> files · 
        <kbd className="px-1 bg-muted/50 rounded border border-border/30 mx-1">⌘,/.</kbd> agents · 
        <kbd className="px-1 bg-muted/50 rounded border border-border/30">⌥,/.</kbd> models
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
        <p className="font-mono text-sm uppercase tracking-wider text-[var(--cyber-cyan)]">[no_messages]</p>
        <p className="font-mono text-xs mt-2 text-muted-foreground">
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
      <div className="max-w-[80%] rounded px-4 py-3 bg-muted/50 border border-[var(--cyber-cyan)]/20 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            <span className="w-2 h-2 bg-[var(--cyber-cyan)] rounded-full animate-bounce shadow-[0_0_6px_var(--cyber-cyan)]" style={{ animationDelay: "0ms" }} />
            <span className="w-2 h-2 bg-[var(--cyber-cyan)] rounded-full animate-bounce shadow-[0_0_6px_var(--cyber-cyan)]" style={{ animationDelay: "150ms" }} />
            <span className="w-2 h-2 bg-[var(--cyber-cyan)] rounded-full animate-bounce shadow-[0_0_6px_var(--cyber-cyan)]" style={{ animationDelay: "300ms" }} />
          </div>
          <span className="font-mono text-xs uppercase tracking-wider text-[var(--cyber-cyan)]">Processing...</span>
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
  /** Callback when /file command is selected to open file picker modal */
  onFilePickerRequest?: () => void;
  /** File path selected from external file picker modal */
  pendingFilePath?: string | null;
  /** Callback to clear pending file path after it's been processed */
  onPendingFilePathClear?: () => void;
  /** Callback when user clicks to navigate to a child session (from task tool call) */
  onSessionSelect?: (sessionId: string) => void;
  /** Child sessions of the current session, used to match task tool calls to their spawned sessions */
  childSessions?: ChildSessionInfo[];
}

/**
 * ChatThread component renders the full chat interface
 * Note: File attachment sending is handled via useAttachments context from RuntimeProvider
 */
export function ChatThread({ 
  projectId, 
  findFiles, 
  onFilePickerRequest, 
  pendingFilePath, 
  onPendingFilePathClear,
  onSessionSelect,
  childSessions,
}: ChatThreadProps) {
  // Memoize the context value to prevent unnecessary re-renders
  const sessionNavigationValue = useMemo(() => ({ onSessionSelect, childSessions }), [onSessionSelect, childSessions]);
  
  return (
    <SessionNavigationContext.Provider value={sessionNavigationValue}>
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
        
        <Composer 
          projectId={projectId} 
          findFiles={findFiles} 
          onFilePickerRequest={onFilePickerRequest}
          pendingFilePath={pendingFilePath}
          onPendingFilePathClear={onPendingFilePathClear}
        />
      </ThreadPrimitive.Root>
    </SessionNavigationContext.Provider>
  );
}

export default ChatThread;
