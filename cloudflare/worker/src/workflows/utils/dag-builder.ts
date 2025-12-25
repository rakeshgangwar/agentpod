/**
 * DAG Builder - Computes execution order from workflow connections
 * 
 * Uses Kahn's algorithm for topological sort to determine the order
 * in which nodes should be executed, respecting dependencies.
 */

import type { WorkflowNode, WorkflowConnections } from "./context";

/**
 * Compute execution order using topological sort
 * 
 * @param nodes - Array of workflow nodes
 * @param connections - Connection graph (sourceNodeId -> targets)
 * @returns Array of node IDs in execution order
 * @throws Error if a cycle is detected
 * 
 * @example
 * ```ts
 * const order = computeExecutionOrder(nodes, connections);
 * // Returns: ["trigger-1", "http-2", "ai-agent-3"]
 * ```
 */
export function computeExecutionOrder(
  nodes: WorkflowNode[],
  connections: WorkflowConnections
): string[] {
  // Build adjacency list and in-degree map
  const graph = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  // Initialize all nodes
  for (const node of nodes) {
    if (node.disabled) continue;
    graph.set(node.id, []);
    inDegree.set(node.id, 0);
  }

  // Build edges from connections
  for (const [sourceId, outputs] of Object.entries(connections)) {
    if (!graph.has(sourceId)) continue; // Skip disabled nodes

    for (const connectionList of outputs.main) {
      for (const conn of connectionList) {
        if (!graph.has(conn.node)) continue; // Skip disabled targets

        graph.get(sourceId)?.push(conn.node);
        inDegree.set(conn.node, (inDegree.get(conn.node) || 0) + 1);
      }
    }
  }

  // Kahn's algorithm for topological sort
  const queue: string[] = [];
  
  // Start with nodes that have no incoming edges (triggers, etc.)
  for (const [nodeId, degree] of inDegree) {
    if (degree === 0) {
      queue.push(nodeId);
    }
  }

  const result: string[] = [];
  
  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    result.push(nodeId);

    // Reduce in-degree for all neighbors
    for (const targetId of graph.get(nodeId) || []) {
      const newDegree = (inDegree.get(targetId) || 0) - 1;
      inDegree.set(targetId, newDegree);
      
      if (newDegree === 0) {
        queue.push(targetId);
      }
    }
  }

  // Check for cycles
  if (result.length !== graph.size) {
    const unprocessed = [...graph.keys()].filter(id => !result.includes(id));
    throw new Error(
      `Cycle detected in workflow. Nodes involved: ${unprocessed.join(", ")}`
    );
  }

  return result;
}

/**
 * Find nodes that can be executed in parallel
 * 
 * Nodes can be executed in parallel if they:
 * 1. Have the same set of dependencies (come after the same nodes)
 * 2. Don't depend on each other
 * 
 * @param nodes - Array of workflow nodes
 * @param connections - Connection graph
 * @returns Array of parallel execution groups
 */
export function findParallelGroups(
  nodes: WorkflowNode[],
  connections: WorkflowConnections
): string[][] {
  // Build reverse adjacency list (target -> sources)
  const dependencies = new Map<string, Set<string>>();
  
  for (const node of nodes) {
    if (node.disabled) continue;
    dependencies.set(node.id, new Set());
  }

  for (const [sourceId, outputs] of Object.entries(connections)) {
    for (const connectionList of outputs.main) {
      for (const conn of connectionList) {
        if (dependencies.has(conn.node)) {
          dependencies.get(conn.node)?.add(sourceId);
        }
      }
    }
  }

  // Group nodes by their dependency signature
  const groups = new Map<string, string[]>();
  
  for (const [nodeId, deps] of dependencies) {
    const signature = [...deps].sort().join(",");
    if (!groups.has(signature)) {
      groups.set(signature, []);
    }
    groups.get(signature)?.push(nodeId);
  }

  return [...groups.values()].filter(group => group.length > 0);
}

/**
 * Get immediate predecessors of a node
 * 
 * @param nodeId - Node to find predecessors for
 * @param connections - Connection graph
 * @returns Array of predecessor node IDs
 */
export function getPredecessors(
  nodeId: string,
  connections: WorkflowConnections
): string[] {
  const predecessors: string[] = [];

  for (const [sourceId, outputs] of Object.entries(connections)) {
    for (const connectionList of outputs.main) {
      for (const conn of connectionList) {
        if (conn.node === nodeId) {
          predecessors.push(sourceId);
        }
      }
    }
  }

  return predecessors;
}

/**
 * Get immediate successors of a node
 * 
 * @param nodeId - Node to find successors for
 * @param connections - Connection graph
 * @returns Array of successor node IDs
 */
export function getSuccessors(
  nodeId: string,
  connections: WorkflowConnections
): string[] {
  const outputs = connections[nodeId];
  if (!outputs) return [];

  const successors: string[] = [];
  
  for (const connectionList of outputs.main) {
    for (const conn of connectionList) {
      successors.push(conn.node);
    }
  }

  return successors;
}

/**
 * Check if a node is a trigger (has no predecessors)
 * 
 * @param nodeId - Node to check
 * @param connections - Connection graph
 * @returns True if node is a trigger
 */
export function isTriggerNode(
  nodeId: string,
  connections: WorkflowConnections
): boolean {
  return getPredecessors(nodeId, connections).length === 0;
}

/**
 * Check if a node is a terminal node (has no successors)
 * 
 * @param nodeId - Node to check
 * @param connections - Connection graph
 * @returns True if node is terminal
 */
export function isTerminalNode(
  nodeId: string,
  connections: WorkflowConnections
): boolean {
  return getSuccessors(nodeId, connections).length === 0;
}
