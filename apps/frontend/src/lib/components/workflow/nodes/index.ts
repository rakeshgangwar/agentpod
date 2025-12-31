export { default as TriggerNode } from "./TriggerNode.svelte";
export { default as AIAgentNode } from "./AIAgentNode.svelte";
export { default as ActionNode } from "./ActionNode.svelte";
export { default as ConditionNode } from "./ConditionNode.svelte";
export { default as SwitchNode } from "./SwitchNode.svelte";

export {
  NODE_REGISTRY,
  NODE_CATEGORIES,
  getNodeDefinition,
  getNodesByCategory,
  getImplementedNodes,
  getTriggerNodes,
  getDefaultNodeData,
  getSvelteFlowNodeType,
  isNodeImplemented,
  getGroupedNodesForPalette,
  type NodeRegistryEntry,
  type NodeCategoryInfo,
  type NodeImplementationStatus,
} from "../node-registry";
