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
  ActionBarPrimitive,
  ComposerPrimitive,
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
import { useAttachments, useSessionStatus } from "./RuntimeProvider";
import { VoiceInputButton } from "../voice/VoiceInputButton";
import { VoiceSetupDialog } from "../voice/VoiceSetupDialog";
import { useVoiceInput } from "../voice/useVoiceInput";

// Import new components for OpenCode-specific content
import {
  ReasoningDisplay,
  PatchViewer,
  SubtaskList,
  RetryIndicator,
} from "./components";

// Import metadata extractors from thread-converter
import {
  getMessageCost,
  getMessagePatches,
  getMessageSubtasks,
  isMessageCompacted,
} from "./converters/thread-converter";

// Import types for metadata
import type { InternalReasoning, InternalRetry } from "./types/messages";

/**
 * Icon components for action buttons
 * Simple SVG icons matching the cyber theme
 */
function EditIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`w-4 h-4 text-muted-foreground ${className || ""}`}
    >
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`w-4 h-4 text-muted-foreground ${className || ""}`}
    >
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`w-4 h-4 ${className || ""}`}
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`w-4 h-4 text-muted-foreground ${className || ""}`}
    >
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
      <path d="M16 16h5v5" />
    </svg>
  );
}

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
function ToolCallPart({ toolName, args, result, isError }: ToolCallMessagePartProps) {
  const { onSessionSelect, childSessions } = useContext(SessionNavigationContext);
  
  // Detect completion state
  const isComplete = result !== undefined;
  
  // isError comes from props (set by convertToolCallToPart based on toolCall.status === "error")
  // This is more reliable than trying to detect errors from result content
  
  // Extract error message if present (only when isError is true)
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
 * Includes action bar with Edit and Copy buttons
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
    <MessagePrimitive.Root className="group flex justify-end mb-4 relative">
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
      
      {/* Action bar for user messages - appears on hover */}
      <ActionBarPrimitive.Root
        hideWhenRunning
        autohide="not-last"
        className="absolute right-0 -bottom-8 flex items-center gap-1 px-1 py-0.5 rounded bg-background/90 border border-border/50 opacity-0 group-hover:opacity-100 transition-opacity shadow-md z-10"
      >
        <ActionBarPrimitive.Edit
          className="p-1.5 rounded hover:bg-muted/50 transition-colors"
          title="Edit message"
        >
          <EditIcon />
        </ActionBarPrimitive.Edit>
        <ActionBarPrimitive.Copy
          className="p-1.5 rounded hover:bg-muted/50 transition-colors group/copy"
          title="Copy message"
        >
          <CopyIcon className="group-data-[copied]/copy:hidden" />
          <CheckIcon className="hidden group-data-[copied]/copy:block text-[var(--cyber-emerald)]" />
        </ActionBarPrimitive.Copy>
      </ActionBarPrimitive.Root>
    </MessagePrimitive.Root>
  );
}

/**
 * EditComposer component - shown when editing a user message
 * This replaces the user message content during edit mode
 */
function EditComposer() {
  return (
    <MessagePrimitive.Root className="flex justify-end mb-4">
      <ComposerPrimitive.Root className="w-full max-w-[80%] flex flex-col rounded bg-[var(--cyber-cyan)]/10 border border-[var(--cyber-cyan)] shadow-[0_0_12px_var(--cyber-cyan)/20]">
        <ComposerPrimitive.Input
          className="min-h-[60px] w-full resize-none bg-transparent px-4 py-3 font-mono text-sm text-foreground outline-none placeholder:text-muted-foreground"
          autoFocus
          placeholder="Edit your message..."
        />
        <div className="flex items-center justify-end gap-2 px-3 pb-3">
          <ComposerPrimitive.Cancel asChild>
            <button
              type="button"
              className="px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground rounded border border-border/50 hover:border-border transition-colors"
            >
              Cancel
            </button>
          </ComposerPrimitive.Cancel>
          <ComposerPrimitive.Send asChild>
            <button
              type="submit"
              className="px-3 py-1.5 font-mono text-xs uppercase tracking-wider bg-[var(--cyber-cyan)] text-black rounded hover:bg-[var(--cyber-cyan)]/90 transition-colors shadow-[0_0_8px_var(--cyber-cyan)/30]"
            >
              Update
            </button>
          </ComposerPrimitive.Send>
        </div>
      </ComposerPrimitive.Root>
    </MessagePrimitive.Root>
  );
}

/**
 * Message type from useMessage() - includes content, metadata, etc.
 */
type ThreadMessageState = {
  role: string;
  content: Array<{ type: string; text?: string; [key: string]: unknown }>;
  metadata?: {
    custom?: Record<string, unknown>;
    steps?: Array<{ usage?: { promptTokens: number; completionTokens: number } }>;
  };
};

/**
 * Extract retries from message metadata
 */
function getMessageRetries(message: ThreadMessageState): InternalRetry[] {
  const custom = message.metadata?.custom;
  const retries = custom?.retries;
  if (!Array.isArray(retries)) return [];
  return retries as InternalRetry[];
}

/**
 * Extract reasoning from message content
 */
function getMessageReasoning(message: ThreadMessageState): InternalReasoning[] {
  const reasoning: InternalReasoning[] = [];
  for (const part of message.content) {
    if (part.type === "reasoning" && typeof part.text === "string") {
      reasoning.push({
        id: `reasoning-${reasoning.length}`,
        text: part.text,
      });
    }
  }
  return reasoning;
}

/**
 * MessageMetadataFooter - shows cost and other metadata
 * Token counts removed - will be shown at session level instead
 */
function MessageMetadataFooter({ message }: { message: ThreadMessageState }) {
  // Extract metadata using converters
  const cost = getMessageCost(message as Parameters<typeof getMessageCost>[0]);
  const compacted = isMessageCompacted(message as Parameters<typeof isMessageCompacted>[0]);
  
  // Don't show footer if no metadata to display
  if ((cost === undefined || cost === 0) && !compacted) {
    return null;
  }
  
  return (
    <div className="mt-2 pt-2 border-t border-border/20">
      <div className="flex items-center gap-3 flex-wrap font-mono text-[10px] text-muted-foreground/70">
        {/* Cost */}
        {cost !== undefined && cost > 0 && (
          <span className="text-[var(--cyber-emerald)]">
            ${cost < 0.0001 ? "<0.0001" : cost < 0.01 ? cost.toFixed(4) : cost.toFixed(3)}
          </span>
        )}
        
        {/* Compacted indicator */}
        {compacted && (
          <span className="px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground/50">
            compacted
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * AssistantMessage component renders assistant messages
 * Hides empty messages (e.g., auto-created placeholder when isRunning)
 * 
 * Enhanced to display:
 * - Reasoning/thinking sections (collapsible)
 * - File patches (changed files)
 * - Subtasks spawned
 * - Retry attempts
 * - Cost/token usage footer
 * - Action bar with Reload and Copy buttons
 */
function AssistantMessage() {
  const { onSessionSelect } = useContext(SessionNavigationContext);
  const message = useMessage();
  
  // Cast message to our thread message state type for helper functions
  const messageState = message as unknown as ThreadMessageState;
  
  // Don't render if message has no actual content
  // (assistant-ui auto-creates empty assistant message when isRunning)
  const hasContent = message.content.some((part) => {
    if (part.type === "text" && part.text && part.text.length > 0) return true;
    if (part.type === "tool-call") return true;
    if (part.type === "reasoning") return true;
    return false;
  });
  
  if (!hasContent) return null;
  
  // Extract extended data from metadata (using ThreadMessageLike cast for helper functions)
  const patches = getMessagePatches(message as Parameters<typeof getMessagePatches>[0]);
  const subtasks = getMessageSubtasks(message as Parameters<typeof getMessageSubtasks>[0]);
  const retries = getMessageRetries(messageState);
  const reasoning = getMessageReasoning(messageState);
  
  return (
    <MessagePrimitive.Root className="group flex justify-start mb-4 min-w-0 w-full relative">
      <div className="max-w-[80%] min-w-0 rounded px-4 py-2 bg-muted/50 border border-border/30 overflow-hidden backdrop-blur-sm">
        {/* Retry indicator at top if there were retries */}
        {retries.length > 0 && (
          <RetryIndicator retries={retries} />
        )}
        
        {/* Reasoning section (collapsible) */}
        {reasoning.length > 0 && (
          <ReasoningDisplay reasoning={reasoning} />
        )}
        
        {/* Main content (text + tool calls) */}
        <MessagePrimitive.Content
          components={{
            Text: TextPart,
            // Hide reasoning from default rendering since we render it above
            Reasoning: () => null,
            tools: {
              Fallback: ToolCallPart,
            },
            ToolGroup: ToolGroup,
          }}
        />
        
        {/* Patches (files changed) */}
        {patches.length > 0 && (
          <PatchViewer patches={patches} />
        )}
        
        {/* Subtasks spawned */}
        {subtasks.length > 0 && (
          <SubtaskList 
            subtasks={subtasks}
            onNavigateToSession={onSessionSelect}
          />
        )}
        
        {/* Footer with cost/tokens/steps - consolidated view */}
        <MessageMetadataFooter message={messageState} />
      </div>
      
      {/* Action bar for assistant messages - appears on hover */}
      <ActionBarPrimitive.Root
        hideWhenRunning
        autohide="not-last"
        className="absolute left-0 -bottom-8 flex items-center gap-1 px-1 py-0.5 rounded bg-background/90 border border-border/50 opacity-0 group-hover:opacity-100 transition-opacity shadow-md z-10"
      >
        <ActionBarPrimitive.Reload
          className="p-1.5 rounded hover:bg-muted/50 transition-colors"
          title="Regenerate response"
        >
          <RefreshIcon />
        </ActionBarPrimitive.Reload>
        <ActionBarPrimitive.Copy
          className="p-1.5 rounded hover:bg-muted/50 transition-colors group/copy"
          title="Copy message"
        >
          <CopyIcon className="group-data-[copied]/copy:hidden" />
          <CheckIcon className="hidden group-data-[copied]/copy:block text-[var(--cyber-emerald)]" />
        </ActionBarPrimitive.Copy>
      </ActionBarPrimitive.Root>
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
  /** Callback when voice transcription is ready */
  onVoiceTranscript?: (text: string) => void;
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
  
  // Wake word detection state for visual feedback
  const [wakeWordDetected, setWakeWordDetected] = useState<string | null>(null);
  const wakeWordTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Voice input hook - append transcript to input, with wake word support
  // Auto-load whisper model if previously downloaded (avoids having to manually load each time)
  const [voiceState, voiceActions] = useVoiceInput({
    onTranscript: (result) => {
      // Append transcript to existing input (or set if empty)
      setInputValue(prev => prev ? `${prev} ${result.text}` : result.text);
      inputRef.current?.focus();
    },
    onError: (error) => {
      console.error("[Voice] Error:", error);
    },
    autoLoadModel: true, // Auto-load whisper model if downloaded
    enableWakeWord: true,
    onWakeWordDetected: (detection) => {
      console.log("[Voice] Wake word detected:", detection.name, "score:", detection.score);
      // Show visual feedback
      setWakeWordDetected(detection.name);
      // Clear previous timeout if any
      if (wakeWordTimeoutRef.current) {
        clearTimeout(wakeWordTimeoutRef.current);
      }
      // Auto-hide after 2 seconds
      wakeWordTimeoutRef.current = setTimeout(() => {
        setWakeWordDetected(null);
      }, 2000);
    },
    // Auto-stop recording after 2 seconds of silence
    // Audio level is RMS (not peak) - typical speech RMS: 0.003-0.01, silence: <0.001
    silenceTimeout: 2,
    silenceThreshold: 0.002, // RMS level below which is considered silence
  });
  
  // Cleanup wake word timeout on unmount
  useEffect(() => {
    return () => {
      if (wakeWordTimeoutRef.current) {
        clearTimeout(wakeWordTimeoutRef.current);
      }
    };
  }, []);
  
  // Voice setup dialog state (shown when model not loaded)
  const [showVoiceSetup, setShowVoiceSetup] = useState(false);
  
  // Handle voice button click when no model loaded - show setup dialog
  const handleVoiceButtonClick = useCallback(() => {
    if (!voiceState.isModelLoaded) {
      setShowVoiceSetup(true);
    }
  }, [voiceState.isModelLoaded]);
  
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
  
  // Auto-resize textarea based on content
  // Expands up to ~8 lines (160px), then scrolls
  const adjustTextareaHeight = useCallback(() => {
    const textarea = inputRef.current;
    if (!textarea) return;
    
    // Reset height to auto to get the correct scrollHeight
    textarea.style.height = "auto";
    
    // Calculate the new height (min 40px, max 160px for ~8 lines)
    const minHeight = 40;
    const maxHeight = 160; // ~8 lines at 20px line height
    const newHeight = Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight);
    
    textarea.style.height = `${newHeight}px`;
  }, []);
  
  // Adjust height when input value changes
  useEffect(() => {
    adjustTextareaHeight();
  }, [inputValue, adjustTextareaHeight]);
  
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
  
  // Prevent scroll propagation to parent when interacting with composer
  const composerRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const composer = composerRef.current;
    if (!composer) return;
    
    const handleWheel = (e: WheelEvent) => {
      // Prevent scroll from propagating to parent
      e.preventDefault();
      e.stopPropagation();
    };
    
    // Use passive: false to allow preventDefault
    composer.addEventListener('wheel', handleWheel, { passive: false });
    
    return () => {
      composer.removeEventListener('wheel', handleWheel);
    };
  }, []);

  return (
    <div 
      ref={composerRef}
      className="border-t border-[var(--cyber-cyan)]/20 p-4 bg-background/80 backdrop-blur-sm relative"
    >
      {/* Wake word detection notification */}
      {wakeWordDetected && (
        <div className="absolute -top-10 left-1/2 -translate-x-1/2 px-4 py-2 bg-[var(--cyber-cyan)]/20 border border-[var(--cyber-cyan)]/50 rounded-full backdrop-blur-sm animate-pulse flex items-center gap-2 z-50">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--cyber-cyan)] opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--cyber-cyan)]"></span>
          </span>
          <span className="font-mono text-xs text-[var(--cyber-cyan)]">
            "{wakeWordDetected}" detected - Listening...
          </span>
        </div>
      )}
      
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
          
          {/* Voice input button - only shown if voice feature is available */}
          {voiceState.isAvailable && (
            <>
              {!voiceState.isModelLoaded ? (
                /* When model not loaded, show a button that opens setup dialog */
                <button
                  type="button"
                  onClick={handleVoiceButtonClick}
                  className="relative flex items-center justify-center w-10 h-10 rounded-full bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground transition-all duration-150 flex-shrink-0"
                  title="Click to set up voice input"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-5 h-5"
                  >
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" x2="12" y1="19" y2="22" />
                  </svg>
                  {/* Setup indicator dot */}
                  <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-[var(--cyber-amber)] rounded-full border-2 border-background" />
                </button>
              ) : (
                <VoiceInputButton
                  mode={voiceState.config?.mode || "push-to-talk"}
                  isRecording={voiceState.isRecording}
                  isProcessing={voiceState.isProcessing}
                  audioLevel={voiceState.audioLevel}
                  isModelLoaded={voiceState.isModelLoaded}
                  shortcut={voiceState.config?.pushToTalkKey}
                  onPushToTalkStart={voiceActions.startRecording}
                  onPushToTalkEnd={() => voiceActions.stopRecording()}
                  onToggleClick={() => voiceActions.toggleRecording()}
                  className="flex-shrink-0"
                />
              )}
            </>
          )}
          
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="> Type a message..."
            className="flex-1 min-h-[40px] px-3 py-2 font-mono text-sm bg-background/50 border border-border/50 rounded resize-none focus:outline-none focus:border-[var(--cyber-cyan)] focus:ring-1 focus:ring-[var(--cyber-cyan)] placeholder:text-muted-foreground/50 transition-colors overflow-y-auto"
            rows={1}
            style={{ height: "40px" }}
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
      {/* Hints - simplified, shown only on larger screens */}
      <p className="hidden md:block font-mono text-xs text-muted-foreground/50 mt-1.5">
        <span className="text-muted-foreground/70">/</span> commands · <span className="text-muted-foreground/70">@</span> files
        {voiceState.isAvailable && (
          <span> · <span className="text-muted-foreground/70">{voiceState.config?.pushToTalkKey || "Ctrl+Shift+M"}</span> voice</span>
        )}
      </p>
      
      {/* Voice setup dialog - shown when user clicks voice button without a model loaded */}
      <VoiceSetupDialog
        open={showVoiceSetup}
        onClose={() => setShowVoiceSetup(false)}
        onComplete={() => {
          // Model loaded successfully, user can now use voice
          console.log("[Voice] Model loaded, voice input ready");
        }}
      />
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
  const { status: sessionStatus } = useSessionStatus();
  
  // Use EITHER runtime isRunning OR sessionStatus === "busy"
  // This handles the case where SSE session.status:busy arrives before/after isRunning changes
  const isActive = isRunning || sessionStatus === "busy";
  
  // Only show loading when:
  // 1. Thread is running OR session status is busy
  // 2. Either:
  //    - No messages yet
  //    - Last message is from user
  //    - Last message is an empty assistant message (auto-created by runtime)
  const lastMessage = messages[messages.length - 1];
  
  let showLoading = false;
  if (isActive) {
    if (!lastMessage) {
      showLoading = true;
    } else if (lastMessage.role === "user") {
      showLoading = true;
    } else if (lastMessage.role === "assistant") {
      // Check if assistant message has any actual content
      const hasContent = lastMessage.content.some((part) => {
        if (part.type === "text" && part.text && part.text.length > 0) return true;
        if (part.type === "tool-call") return true;
        if (part.type === "reasoning") return true;
        return false;
      });
      showLoading = !hasContent;
    }
  }
  
  // Debug logging
  if (process.env.NODE_ENV === "development") {
    console.log("[LoadingIndicator] isRunning:", isRunning, "sessionStatus:", sessionStatus, "isActive:", isActive, "lastMessage:", lastMessage?.role, "showLoading:", showLoading);
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
 * SessionStatusIndicator component displays a glowing separator line
 * that indicates the current session status (idle/busy/retry).
 * 
 * - Idle: Static separator line
 * - Busy: Animated cyan glow sweeping left-to-right
 * - Retry: Shows retry countdown with warning style
 */
function SessionStatusIndicator() {
  const { status, retryInfo } = useSessionStatus();
  const [countdown, setCountdown] = useState<number | null>(null);
  
  // Debug logging
  if (process.env.NODE_ENV === "development") {
    console.log("[SessionStatusIndicator] status:", status);
  }
  
  // Update countdown for retry status
  useEffect(() => {
    if (status !== "retry" || !retryInfo) {
      setCountdown(null);
      return;
    }
    
    const updateCountdown = () => {
      const remaining = Math.max(0, Math.ceil((retryInfo.next - Date.now()) / 1000));
      setCountdown(remaining);
    };
    
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    
    return () => clearInterval(interval);
  }, [status, retryInfo]);
  
  // Base classes for the indicator line
  const baseClasses = "h-[2px] w-full transition-all duration-300";
  
  if (status === "busy") {
    return (
      <div className="relative overflow-hidden">
        <div 
          className={`${baseClasses} bg-gradient-to-r from-transparent via-[var(--cyber-cyan)] to-transparent`}
          style={{
            backgroundSize: "200% 100%",
            animation: "glow-sweep 3s ease-in-out infinite",
          }}
        />
        {/* Glow effect */}
        <div 
          className="absolute inset-0 h-[2px] blur-sm bg-gradient-to-r from-transparent via-[var(--cyber-cyan)] to-transparent opacity-50"
          style={{
            backgroundSize: "200% 100%",
            animation: "glow-sweep 3s ease-in-out infinite",
          }}
        />
      </div>
    );
  }
  
  if (status === "retry" && retryInfo) {
    return (
      <div className="flex flex-col">
        <div className="px-4 py-1 flex items-center justify-center gap-2 bg-[var(--cyber-amber)]/10">
          <span className="w-2 h-2 rounded-full bg-[var(--cyber-amber)] animate-pulse shadow-[0_0_6px_var(--cyber-amber)]" />
          <span className="font-mono text-xs text-[var(--cyber-amber)]">
            {retryInfo.message || "Retrying..."} 
            {countdown !== null && countdown > 0 && (
              <span className="ml-1">({countdown}s)</span>
            )}
            <span className="ml-1 text-[var(--cyber-amber)]/60">
              (attempt {retryInfo.attempt})
            </span>
          </span>
        </div>
        <div 
          className={`${baseClasses} bg-[var(--cyber-amber)]/50`}
          style={{
            boxShadow: "0 0 8px var(--cyber-amber)",
          }}
        />
      </div>
    );
  }
  
  // Idle state - subtle separator
  return (
    <div 
      className={`${baseClasses} bg-border/30`}
    />
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
                EditComposer,
                AssistantMessage,
              }}
            />
            
            {/* Show loading indicator when waiting for assistant response */}
            <LoadingIndicator />
          </div>
          
          <ThreadPrimitive.ViewportFooter />
        </ThreadPrimitive.Viewport>
        
        {/* Session status indicator between messages and composer */}
        <SessionStatusIndicator />
        
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
