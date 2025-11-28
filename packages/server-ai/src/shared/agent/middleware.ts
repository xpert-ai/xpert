import { IXpertAgent, TXpertGraph, WorkflowNodeTypeEnum } from "@metad/contracts"

const normalizeNodeKey = (key: string) => key?.split('/')?.[0]

export const isSkillsConnectedToAgent = (graph: TXpertGraph, agent: IXpertAgent) => {
    const currentGraph = graph // getCurrentGraph(graph, agent.key)
    const skillsNodes = currentGraph.nodes?.filter(
        (node) => node.type === 'workflow' && node.entity.type === WorkflowNodeTypeEnum.SKILL
    )
    if (!skillsNodes?.length) {
        return false
    }
    const connections = currentGraph.connections?.filter((conn) => conn.type === 'workflow') ?? []
    return skillsNodes.some((node) =>
        connections.some((conn) => {
            const from = normalizeNodeKey(conn.from)
            const to = normalizeNodeKey(conn.to)
            return (
                (from === agent.key && to === node.key) ||
                (to === agent.key && from === node.key)
            )
        })
    )
}