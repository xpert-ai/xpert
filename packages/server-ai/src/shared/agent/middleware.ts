import { getAgentMiddlewareNodes, IWFNMiddleware, IXpertAgent, TXpertGraph, TXpertTeamNode, WorkflowNodeTypeEnum } from "@metad/contracts"
import { AgentMiddleware, AgentMiddlewareRegistry, IAgentMiddlewareStrategy } from "@xpert-ai/plugin-sdk"
import { orderNodesByKeyOrder } from "./workflow"

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

export function getAgentMiddlewares(graph: TXpertGraph, agent: IXpertAgent, agentMiddlewareRegistry: AgentMiddlewareRegistry): AgentMiddleware[] {
    const middlewares = orderNodesByKeyOrder(
        getAgentMiddlewareNodes(graph, agent.key),
        agent.options?.middlewares?.order || []
    )

    return middlewares.map(middlewareNode => {
        const entity = middlewareNode?.entity as unknown as IWFNMiddleware
        const provider = entity?.provider

        let strategy: IAgentMiddlewareStrategy
        try {
            strategy = agentMiddlewareRegistry.get(provider)
        } catch (error) {
            console.warn(`Middleware provider not found: ${provider}`)
            return null
        }
        return strategy.createMiddleware(entity.options)
    }).filter(middleware => !!middleware) as AgentMiddleware[]
}
