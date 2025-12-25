import type {
  INode,
  IConnections,
  INodeConnections,
  IWorkflowBase,
  ISvelteFlowNode,
  ISvelteFlowEdge,
  WorkflowNodeType,
} from "@agentpod/types";

export function svelteFlowToWorkflow(
  svelteNodes: ISvelteFlowNode[],
  svelteEdges: ISvelteFlowEdge[]
): { nodes: INode[]; connections: IConnections } {
  const nodes: INode[] = svelteNodes.map((node) => {
    const { label, ...parameters } = node.data;
    return {
      id: node.id,
      name: (label as string) || node.id,
      type: node.type as WorkflowNodeType,
      position: [node.position.x, node.position.y] as [number, number],
      parameters: { label, ...parameters },
    };
  });

  const nodeIdToName = new Map<string, string>();
  for (const node of nodes) {
    nodeIdToName.set(node.id, node.name);
  }

  const connections: IConnections = {};

  for (const edge of svelteEdges) {
    const sourceName = nodeIdToName.get(edge.source);
    const targetName = nodeIdToName.get(edge.target);

    if (!sourceName || !targetName) continue;

    let sourceConn = connections[sourceName];
    if (!sourceConn) {
      sourceConn = { main: [[]] };
      connections[sourceName] = sourceConn;
    }

    if (!sourceConn.main[0]) {
      sourceConn.main[0] = [];
    }

    sourceConn.main[0].push({
      node: targetName,
      type: edge.type || "main",
      index: 0,
    });
  }

  return { nodes, connections };
}

export function workflowToSvelteFlow(workflow: IWorkflowBase): {
  nodes: ISvelteFlowNode[];
  edges: ISvelteFlowEdge[];
} {
  const nodes: ISvelteFlowNode[] = workflow.nodes.map((node) => ({
    id: node.id,
    type: node.type,
    position: { x: node.position[0], y: node.position[1] },
    data: {
      ...node.parameters,
      label: node.name,
    },
  }));

  const nameToId = buildNodeNameMap(workflow.nodes);
  const edges: ISvelteFlowEdge[] = [];
  let edgeIndex = 0;

  for (const [sourceName, nodeConnections] of Object.entries(
    workflow.connections
  )) {
    const sourceId = nameToId.get(sourceName);
    if (!sourceId) continue;

    for (const outputConnections of nodeConnections.main) {
      for (const connection of outputConnections) {
        const targetId = nameToId.get(connection.node);
        if (!targetId) continue;

        edges.push({
          id: `e-${sourceId}-${targetId}-${edgeIndex++}`,
          source: sourceId,
          target: targetId,
          type: connection.type || undefined,
        });
      }
    }
  }

  return { nodes, edges };
}

export function buildNodeNameMap(nodes: INode[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const node of nodes) {
    map.set(node.name, node.id);
  }
  return map;
}
