import { IPoint, IWFNTrigger, IXpert, locateNodes, TXpertTeamNode, WorkflowNodeTypeEnum } from "@cloud/app/@core";
import { calculateHash } from "@cloud/app/@shared/utils";

export function createXpertNode(xpert: IXpert, position: IPoint) {
    const node = {type: 'xpert'} as TXpertTeamNode & {type: 'xpert'}
    const agentKey = xpert.agent?.key
    let primaryNode = xpert.graph.nodes.find((_) => _.key === agentKey)
    if (xpert.agent.options?.hidden) {
        primaryNode = xpert.graph.nodes.find(
            (_) =>
            _.type === 'workflow' &&
            _.entity.type === WorkflowNodeTypeEnum.TRIGGER &&
            (<IWFNTrigger>_.entity).from === 'chat'
        )
    }
    node.nodes = primaryNode ? [primaryNode] : []
    const { nodes, size } = locateNodes(primaryNode ? [primaryNode] : [], position)
    node.nodes = nodes
    node.size = size
    node.size = {
        width: (primaryNode?.size?.width ?? 240) + 40,
        height: (primaryNode?.size?.height ?? 160) + 50
    }
    node.hash = calculateHash(JSON.stringify(node))
    // if (node.position && primaryNode) {
    //     primaryNode.position = {
    //         x: node.position.x + 20,
    //         y: node.position.y + 40
    //     }

    //     primaryNode.hash = calculateHash(JSON.stringify(primaryNode))
    // }
    return node
}