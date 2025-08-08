import ELK, { ElkNode, ElkExtendedEdge } from 'elkjs';
import { TCubeConnection, TCubeNode } from './types';

const elk = new ELK();

export async function layoutCubeGraph(
  nodes: TCubeNode[],
  connections: TCubeConnection[]
): Promise<TCubeNode[]> {
  // Convert to ELK format nodes
  const elkNodes: ElkNode[] = nodes.map((node) => ({
    id: node.key,
    width: node.size?.width ?? 100,
    height: node.size?.height ?? 150,
  }));

  // Convert to ELK format edges
  const elkEdges: ElkExtendedEdge[] = connections.map((conn) => ({
    id: conn.key,
    sources: [conn.source.split('/')[0]],
    targets: [conn.target],
  }));

  // Create ELK graph input
  const elkGraph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.layered.spacing.nodeNodeBetweenLayers': '100',
      'elk.spacing.nodeNode': '30',
    },
    children: elkNodes,
    edges: elkEdges,
  };

  // Execute layout
  const layouted = await elk.layout(elkGraph);

  // Extract positions and merge back to original nodes
  const nodeMap = new Map(layouted.children?.map((n) => [n.id, n]) ?? []);
  const updatedNodes: TCubeNode[] = nodes.map((node) => {
    const elkNode = nodeMap.get(node.key);
    return {
      ...node,
      position: {
        x: elkNode?.x ?? 0,
        y: elkNode?.y ?? 0,
      },
    };
  });

  return updatedNodes;
}
