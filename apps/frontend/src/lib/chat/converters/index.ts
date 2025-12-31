/**
 * Converters Index
 * 
 * Re-exports all converter functions and types for message transformation
 * between OpenCode format and assistant-ui format.
 */

// =============================================================================
// Message Converter (OpenCode API -> InternalMessage)
// =============================================================================

export {
  convertOpenCodeMessage,
  applyPartToMessage,
  applySSEPartToMessage,
  calculateTotalTokens,
  calculateTotalCost,
  hasActiveToolCalls,
  getCompletedToolCallCount,
  getErroredToolCallCount,
  type OpenCodeMessage,
  type RawSSEPart,
} from "./message-converter";

// =============================================================================
// Part Converters (Individual part type converters)
// =============================================================================

export {
  convertTextPart,
  convertReasoningPart,
  convertFilePart,
  convertToolPart,
  convertToolInvocationPart,
  convertToolResultPart,
  convertStepStartPart,
  convertStepFinishPart,
  convertPatchPart,
  convertSubtaskPart,
  convertAgentPart,
  convertRetryPart,
  convertCompactionPart,
  convertPart,
  type PartConversionResult,
} from "./part-converters";

// =============================================================================
// Thread Converter (InternalMessage -> ThreadMessageLike)
// =============================================================================

export {
  convertMessage,
  convertMessagesGrouped,
  // Metadata extractors for UI components
  getMessageCost,
  getMessageTokens,
  getMessageAgent,
  getMessagePatches,
  getMessageSubtasks,
  getMessageSteps,
  isMessageCompacted,
  // Type guards for DataMessageParts
  isPatchesDataPart,
  isSubtasksDataPart,
} from "./thread-converter";
