# Chat UI Ordering & Duplication Fix Plan

## Executive Summary

The chat UI has several issues with message ordering and content duplication:
1. **Content ordering within messages ignores temporal sequence** - reasoning/text/tools always in fixed order
2. **Tool calls not sorted by start time** - Map iteration order may not match execution order
3. **Race conditions** - Parts arriving before message structure is established
4. **Session message leakage** - Subagent messages appearing in parent session
5. **Content duplication** - Same content appearing multiple times after merging
6. **Visual redundancy** - Task tools and subtask list both showing child session navigation

---

## Phase 1: Content Part Ordering (Priority: HIGH)

### Problem

In `thread-converter.ts`, `mergeAssistantMessages()` adds content in a fixed order per message:

```typescript
// Current: Fixed order per message
for (const msg of sortedMessages) {
  // 1. ALL reasoning first
  for (const reasoning of msg.reasoning) { ... }
  // 2. ALL text second  
  if (msg.text) { ... }
  // 3. ALL tool calls third
  for (const [, toolCall] of msg.toolCalls) { ... }
}
```

**Result**: If AI says "Let me check...", calls tool, then says "Based on results...", the UI shows:
- "Let me check... Based on results..." (text concatenated)
- [tool call]

Instead of the natural flow:
- "Let me check..."
- [tool call]
- "Based on results..."

### Solution

Introduce a **timeline-based ordering system** that tracks when each content part was added.

#### Step 1.1: Add `ContentPart` unified type with ordering info

**File**: `apps/frontend/src/lib/chat/types/messages.ts`

```typescript
/**
 * Unified content part with ordering information.
 * All parts have an `order` field to enable temporal sequencing.
 */
export type ContentPartType = 
  | "text" 
  | "reasoning" 
  | "tool-call" 
  | "file" 
  | "patch" 
  | "subtask";

export interface OrderedContentPart {
  type: ContentPartType;
  order: number;  // Timestamp or sequence number for ordering
  id: string;     // Unique identifier for deduplication
}

export interface OrderedTextPart extends OrderedContentPart {
  type: "text";
  text: string;
}

export interface OrderedReasoningPart extends OrderedContentPart {
  type: "reasoning";
  text: string;
  startTime?: number;
  endTime?: number;
}

export interface OrderedToolCallPart extends OrderedContentPart {
  type: "tool-call";
  toolCall: InternalToolCall;
}

export interface OrderedFilePart extends OrderedContentPart {
  type: "file";
  file: InternalFilePart;
}

// Union type
export type OrderedPart = 
  | OrderedTextPart 
  | OrderedReasoningPart 
  | OrderedToolCallPart 
  | OrderedFilePart;
```

#### Step 1.2: Track part order in `InternalMessage`

**File**: `apps/frontend/src/lib/chat/types/messages.ts`

Add to `InternalMessage`:

```typescript
export interface InternalMessage {
  // ... existing fields ...
  
  /**
   * Ordered content parts for proper temporal sequencing.
   * Parts are added with order = timestamp, then sorted for display.
   */
  contentParts: OrderedPart[];
  
  /**
   * Monotonic counter for ordering parts within the same millisecond.
   * Incremented each time a part is added.
   */
  partOrderCounter: number;
}
```

Update `createEmptyInternalMessage`:

```typescript
export function createEmptyInternalMessage(
  id: string,
  role: "user" | "assistant"
): InternalMessage {
  return {
    // ... existing ...
    contentParts: [],
    partOrderCounter: 0,
  };
}
```

#### Step 1.3: Update SSE part handler to track order

**File**: `apps/frontend/src/lib/chat/converters/message-converter.ts`

Modify `applySSEPartToMessage()` to record ordering:

```typescript
export function applySSEPartToMessage(
  message: InternalMessage,
  part: RawSSEPart,
  delta?: string
): void {
  // Get next order value (timestamp + counter for sub-millisecond ordering)
  const getNextOrder = (): number => {
    message.partOrderCounter++;
    return Date.now() * 1000 + message.partOrderCounter;
  };

  switch (part.type) {
    case "text":
      if (delta) {
        // Streaming: append to existing text part or create new one
        const lastTextPart = message.contentParts
          .filter((p): p is OrderedTextPart => p.type === "text")
          .pop();
        
        if (lastTextPart) {
          lastTextPart.text += delta;
        } else {
          message.contentParts.push({
            type: "text",
            id: `text-${part.id || message.partOrderCounter}`,
            order: getNextOrder(),
            text: delta,
          });
        }
        message.text += delta;
      } else if (typeof part.text === "string") {
        // Full text replacement
        message.contentParts.push({
          type: "text",
          id: `text-${part.id || message.partOrderCounter}`,
          order: getNextOrder(),
          text: part.text,
        });
        message.text = part.text;
      }
      break;
      
    case "reasoning":
      if (part.id && part.text !== undefined) {
        const reasoning: InternalReasoning = {
          id: part.id,
          text: part.text,
          startTime: part.time?.start,
          endTime: part.time?.end,
        };
        
        // Check for existing reasoning with same ID
        const existingIdx = message.contentParts.findIndex(
          p => p.type === "reasoning" && p.id === part.id
        );
        
        if (existingIdx >= 0) {
          // Update existing
          (message.contentParts[existingIdx] as OrderedReasoningPart).text = part.text;
        } else {
          // Add new
          message.contentParts.push({
            type: "reasoning",
            id: part.id,
            order: part.time?.start || getNextOrder(),
            text: part.text,
            startTime: part.time?.start,
            endTime: part.time?.end,
          });
        }
        
        // Also update legacy reasoning array
        const existingReasoningIdx = message.reasoning.findIndex(r => r.id === part.id);
        if (existingReasoningIdx >= 0) {
          message.reasoning[existingReasoningIdx] = reasoning;
        } else {
          message.reasoning.push(reasoning);
        }
      }
      break;
      
    case "tool":
      if (part.callID && part.state) {
        const toolCall = convertSSEToolPart(part);
        message.toolCalls.set(part.callID, toolCall);
        
        // Add/update in contentParts
        const existingToolIdx = message.contentParts.findIndex(
          p => p.type === "tool-call" && p.id === part.callID
        );
        
        const toolOrder = toolCall.startTime || getNextOrder();
        
        if (existingToolIdx >= 0) {
          // Update existing tool call
          (message.contentParts[existingToolIdx] as OrderedToolCallPart).toolCall = toolCall;
        } else {
          // Add new tool call
          message.contentParts.push({
            type: "tool-call",
            id: part.callID,
            order: toolOrder,
            toolCall,
          });
        }
      }
      break;
      
    // ... similar for other part types ...
  }
}
```

#### Step 1.4: Update thread converter to use ordered parts

**File**: `apps/frontend/src/lib/chat/converters/thread-converter.ts`

Replace the fixed-order loop in `mergeAssistantMessages()`:

```typescript
function mergeAssistantMessages(messages: InternalMessage[]): ThreadMessageLike {
  // ... existing setup code ...
  
  // Collect all ordered parts from all messages
  const allParts: OrderedPart[] = [];
  
  for (const msg of sortedMessages) {
    // If message has contentParts, use them
    if (msg.contentParts && msg.contentParts.length > 0) {
      allParts.push(...msg.contentParts);
    } else {
      // Fallback: build parts from legacy fields with estimated ordering
      let order = msg.createdAt?.getTime() || 0;
      
      // Reasoning first (typically comes first)
      for (const reasoning of msg.reasoning) {
        allParts.push({
          type: "reasoning",
          id: reasoning.id,
          order: reasoning.startTime || order++,
          text: reasoning.text,
          startTime: reasoning.startTime,
          endTime: reasoning.endTime,
        });
      }
      
      // Text
      if (msg.text && msg.text.trim()) {
        allParts.push({
          type: "text",
          id: `text-${msg.id}`,
          order: order++,
          text: msg.text,
        });
      }
      
      // Tool calls
      for (const [id, toolCall] of msg.toolCalls) {
        allParts.push({
          type: "tool-call",
          id,
          order: toolCall.startTime || order++,
          toolCall,
        });
      }
      
      // Files
      for (const file of msg.files) {
        allParts.push({
          type: "file",
          id: file.id,
          order: order++,
          file,
        });
      }
    }
    
    // Accumulate metadata (unchanged)
    // ...
  }
  
  // Sort all parts by order
  allParts.sort((a, b) => a.order - b.order);
  
  // Deduplicate by ID (keep first occurrence)
  const seenIds = new Set<string>();
  const uniqueParts = allParts.filter(part => {
    if (seenIds.has(part.id)) return false;
    seenIds.add(part.id);
    return true;
  });
  
  // Convert to ThreadAssistantMessagePart[]
  const content: ThreadAssistantMessagePart[] = [];
  
  for (const part of uniqueParts) {
    switch (part.type) {
      case "reasoning":
        content.push({
          type: "reasoning",
          text: part.text,
        });
        break;
        
      case "text":
        content.push({
          type: "text",
          text: part.text,
        });
        break;
        
      case "tool-call":
        content.push(convertToolCallToPart(part.toolCall));
        break;
        
      case "file":
        content.push(convertFileToAssistantPart(part.file));
        break;
    }
  }
  
  // Add data parts at the end (patches, subtasks)
  // ... existing code for patches/subtasks ...
  
  // ... rest of function unchanged ...
}
```

---

## Phase 2: Tool Call Ordering (Priority: HIGH)

### Problem

Tool calls are stored in a `Map<string, InternalToolCall>`. JavaScript Maps preserve insertion order, but SSE events can arrive out of order. The current code doesn't sort tool calls by execution time.

### Solution

Sort tool calls by `startTime` before converting to content parts.

**Already addressed in Phase 1** via `OrderedToolCallPart` with `order = toolCall.startTime`.

#### Additional Fix: Sort in `convertAssistantMessage()` for single-message case

**File**: `apps/frontend/src/lib/chat/converters/thread-converter.ts`

```typescript
function convertAssistantMessage(message: InternalMessage): ThreadMessageLike {
  const content: ThreadAssistantMessagePart[] = [];
  
  // If we have ordered contentParts, use them
  if (message.contentParts && message.contentParts.length > 0) {
    // Sort and convert
    const sortedParts = [...message.contentParts].sort((a, b) => a.order - b.order);
    
    for (const part of sortedParts) {
      switch (part.type) {
        case "reasoning":
          content.push({ type: "reasoning", text: part.text });
          break;
        case "text":
          content.push({ type: "text", text: part.text });
          break;
        case "tool-call":
          content.push(convertToolCallToPart(part.toolCall));
          break;
        case "file":
          content.push(convertFileToAssistantPart(part.file));
          break;
      }
    }
  } else {
    // Fallback: use legacy fields (existing code)
    // 1. Reasoning
    for (const reasoning of message.reasoning) { ... }
    
    // 2. Text
    if (message.text) { ... }
    
    // 3. Tool calls - NOW SORTED BY START TIME
    const sortedToolCalls = [...message.toolCalls.values()]
      .sort((a, b) => (a.startTime || 0) - (b.startTime || 0));
    
    for (const toolCall of sortedToolCalls) {
      content.push(convertToolCallToPart(toolCall));
    }
    
    // 4. Files
    for (const file of message.files) { ... }
  }
  
  // ... rest unchanged ...
}
```

---

## Phase 3: Race Condition Fixes (Priority: HIGH)

### Problem

In `message-events.ts`, when `message.part.updated` arrives before `message.updated`, we create a message without proper context (no `parentID`, no `createdAt`).

### Solution 3.1: Inherit context from session when creating message from part

**File**: `apps/frontend/src/lib/chat/handlers/message-events.ts`

```typescript
export function handleMessagePartUpdated(
  properties: MessagePartUpdatedProperties,
  context: HandlerContext
): HandlerResult {
  // ... existing validation ...
  
  if (!messageExists) {
    // Race condition: part.updated arrived before message.updated
    const newMessage = createEmptyInternalMessage(messageId, "assistant");
    
    // IMPORTANT: Set sessionID from part or context to enable filtering
    // This prevents orphan messages from being created without session scope
    const partSessionId = part.sessionID;
    if (partSessionId && partSessionId !== context.sessionId) {
      // Part belongs to different session - don't create message here
      console.log("[MessageEvents] Ignoring part for different session:", partSessionId);
      return notHandled();
    }
    
    // Inherit createdAt from part time if available
    if (part.time?.start) {
      newMessage.createdAt = new Date(part.time.start);
    }
    
    // Apply the part update to the new message
    applySSEPartToMessage(newMessage, part, delta);
    
    return handled(addMessage(newMessage));
  }
  
  // ... rest unchanged ...
}
```

### Solution 3.2: Add session ID to InternalMessage for filtering

**File**: `apps/frontend/src/lib/chat/types/messages.ts`

```typescript
export interface InternalMessage {
  // ... existing fields ...
  
  /**
   * Session ID this message belongs to.
   * Used to filter out messages from other sessions (e.g., subagent sessions).
   */
  sessionId?: string;
}
```

Update message creation in `handleMessageUpdated`:

```typescript
export function handleMessageUpdated(
  properties: MessageUpdatedProperties,
  context: HandlerContext
): HandlerResult {
  // ... existing code ...
  
  // Create new message
  const newMessage = createEmptyInternalMessage(messageId, role);
  
  // Set session ID for filtering
  newMessage.sessionId = messageSessionId || context.sessionId || undefined;
  
  // ... rest unchanged ...
}
```

---

## Phase 4: Session Message Leakage Prevention (Priority: HIGH)

### Problem

Messages from child sessions (subagents) can leak into parent session display if:
1. `sessionID` is undefined on the message/part
2. Context `sessionId` changes during processing

### Solution 4.1: Stricter session validation

**File**: `apps/frontend/src/lib/chat/handlers/message-events.ts`

```typescript
export function handleMessageUpdated(
  properties: MessageUpdatedProperties,
  context: HandlerContext
): HandlerResult {
  // ... get info ...
  
  // STRICTER VALIDATION: Require explicit session match
  const messageSessionId = info.sessionID;
  
  // If message has no sessionID, we cannot reliably determine ownership
  // Log warning and skip (previously we would accept it)
  if (!messageSessionId) {
    console.warn("[MessageEvents] message.updated has no sessionID, skipping:", messageId);
    return notHandled();
  }
  
  // Must match current session
  if (messageSessionId !== context.sessionId) {
    // This is expected for child session messages - just skip silently
    return notHandled();
  }
  
  // ... rest unchanged ...
}
```

### Solution 4.2: Filter messages by session in RuntimeProvider

**File**: `apps/frontend/src/lib/chat/RuntimeProvider.tsx`

Add session filtering in the conversion step:

```typescript
// Convert internal messages to ThreadMessageLike for the runtime
// FILTER: Only include messages belonging to current session
const filteredMessages = internalMessages.filter(msg => {
  // If message has no sessionId, assume it belongs to current session (legacy)
  if (!msg.sessionId) return true;
  // Otherwise, must match current session
  return msg.sessionId === sessionId;
});

const threadMessages = convertMessagesGrouped(filteredMessages);
```

---

## Phase 5: Content Deduplication (Priority: MEDIUM)

### Problem

When merging messages in `RuntimeProvider.tsx`, content from the same source can appear multiple times if:
1. Same message ID arrives via multiple paths
2. Parts are duplicated in SSE stream

### Solution 5.1: Deduplicate by part ID in merge

Already addressed in Phase 1 via:
```typescript
const seenIds = new Set<string>();
const uniqueParts = allParts.filter(part => {
  if (seenIds.has(part.id)) return false;
  seenIds.add(part.id);
  return true;
});
```

### Solution 5.2: Stricter dedup in `applyHandlerActions`

**File**: `apps/frontend/src/lib/chat/RuntimeProvider.tsx`

Improve the merge logic for `add_message`:

```typescript
case "add_message":
  appliers.setInternalMessages(prev => {
    const existingIdx = prev.findIndex(m => m.id === action.message.id);
    if (existingIdx !== -1) {
      const existing = prev[existingIdx];
      const incoming = action.message;
      
      // Merge with deduplication by ID
      const merged: InternalMessage = {
        ...existing,
        // Prefer newer text if longer (streaming accumulation)
        text: incoming.text.length > existing.text.length ? incoming.text : existing.text,
        
        // Dedup arrays by ID
        reasoning: deduplicateById([...existing.reasoning, ...incoming.reasoning]),
        files: deduplicateById([...existing.files, ...incoming.files]),
        steps: deduplicateById([...existing.steps, ...incoming.steps]),
        patches: deduplicateById([...existing.patches, ...incoming.patches]),
        subtasks: deduplicateById([...existing.subtasks, ...incoming.subtasks]),
        retries: deduplicateById([...existing.retries, ...incoming.retries]),
        
        // Merge Maps (later entries override)
        toolCalls: new Map([...existing.toolCalls, ...incoming.toolCalls]),
        
        // Merge contentParts with deduplication
        contentParts: deduplicateById([
          ...(existing.contentParts || []),
          ...(incoming.contentParts || []),
        ]),
        
        // Take max of counters
        partOrderCounter: Math.max(
          existing.partOrderCounter || 0,
          incoming.partOrderCounter || 0
        ),
      };
      
      const updated = [...prev];
      updated[existingIdx] = merged;
      return updated;
    }
    return [...prev, action.message];
  });
  break;

// Helper function
function deduplicateById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter(item => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}
```

---

## Phase 6: Visual Redundancy Fix (Priority: LOW)

### Problem

Both `ToolCallPart` (for task tools) and `SubtaskList` can show navigation to child sessions, creating visual duplication.

### Options

1. **Option A**: Hide subtask list when task tool calls are present (task tool is more detailed)
2. **Option B**: Hide task tool child session link, let subtask list handle navigation
3. **Option C**: Consolidate - only show one UI element for child session navigation

### Recommended: Option A

**File**: `apps/frontend/src/lib/chat/ChatThread.tsx`

In `AssistantMessage`:

```typescript
function AssistantMessage() {
  // ... existing code ...
  
  const patches = getMessagePatches(message as ...);
  const subtasks = getMessageSubtasks(message as ...);
  const retries = getMessageRetries(messageState);
  const reasoning = getMessageReasoning(messageState);
  
  // Check if any task tool calls exist (they already show child session links)
  const hasTaskToolCalls = message.content.some(part => {
    if (part.type !== "tool-call") return false;
    const toolPart = part as { toolName?: string };
    return toolPart.toolName === "task";
  });
  
  return (
    <MessagePrimitive.Root ...>
      <div ...>
        {/* ... existing content ... */}
        
        {/* Subtasks spawned - HIDE if task tool calls are present (they already show links) */}
        {subtasks.length > 0 && !hasTaskToolCalls && (
          <SubtaskList 
            subtasks={subtasks}
            onNavigateToSession={onSessionSelect}
          />
        )}
        
        {/* ... rest unchanged ... */}
      </div>
    </MessagePrimitive.Root>
  );
}
```

---

## Implementation Order

| Phase | Priority | Effort | Files Changed |
|-------|----------|--------|---------------|
| Phase 1 | HIGH | Large | `types/messages.ts`, `message-converter.ts`, `thread-converter.ts` |
| Phase 2 | HIGH | Small | `thread-converter.ts` (mostly covered by Phase 1) |
| Phase 3 | HIGH | Medium | `message-events.ts`, `types/messages.ts` |
| Phase 4 | HIGH | Medium | `message-events.ts`, `RuntimeProvider.tsx` |
| Phase 5 | MEDIUM | Small | `RuntimeProvider.tsx` |
| Phase 6 | LOW | Small | `ChatThread.tsx` |

### Recommended Implementation Sequence

1. **Phase 1 + 2** together (content ordering) - 2-3 hours
2. **Phase 3 + 4** together (race conditions + session leakage) - 1-2 hours
3. **Phase 5** (deduplication refinement) - 30 min
4. **Phase 6** (visual cleanup) - 15 min

### Testing Strategy

1. **Unit tests** for `mergeAssistantMessages()` with various part orderings
2. **Integration test**: Send message → tool call → another message, verify order
3. **Subagent test**: Run task tool, verify child session messages don't leak to parent
4. **Race condition test**: Manually inject part.updated before message.updated, verify handling

---

## Success Criteria

- [ ] Reasoning, text, and tool calls appear in chronological order
- [ ] Tool calls sorted by start time, not insertion order
- [ ] No duplicate content in merged messages
- [ ] Subagent messages never appear in parent session
- [ ] No visual duplication of child session navigation
- [ ] All existing tests pass
- [ ] No TypeScript errors

---

## Rollback Plan

If issues arise:
1. Revert `contentParts` changes - fall back to legacy fixed-order rendering
2. Feature flag for new ordering: `const USE_ORDERED_PARTS = false`
3. Keep legacy fields (`text`, `reasoning`, `toolCalls`) as source of truth
