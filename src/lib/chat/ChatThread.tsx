/**
 * Chat Thread Component
 * 
 * A custom Thread component built using assistant-ui primitives.
 * Styled to match our shadcn-based design system.
 */

import React from "react";
import {
  ThreadPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
} from "@assistant-ui/react";
import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";

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
 */
function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-start mb-4">
      <div className="max-w-[80%] rounded-lg px-4 py-2 bg-muted">
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
 * Composer component for message input
 */
function Composer() {
  return (
    <ComposerPrimitive.Root className="border-t p-4 bg-background">
      <div className="flex gap-2">
        <ComposerPrimitive.Input
          placeholder="Type a message..."
          className="flex-1 min-h-[40px] px-3 py-2 bg-input border border-border rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <ComposerPrimitive.Send className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed">
          Send
        </ComposerPrimitive.Send>
      </div>
      <p className="text-xs text-muted-foreground mt-2">
        Press Enter to send, Shift+Enter for new line
      </p>
    </ComposerPrimitive.Root>
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
 * ChatThread component renders the full chat interface
 */
export function ChatThread() {
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
        </div>
        
        <ThreadPrimitive.ViewportFooter />
      </ThreadPrimitive.Viewport>
      
      <Composer />
    </ThreadPrimitive.Root>
  );
}

export default ChatThread;
