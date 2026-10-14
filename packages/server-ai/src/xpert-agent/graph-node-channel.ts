import { Annotation } from '@langchain/langgraph'
import type { TXpertTeamNode } from '@xpert-ai/contracts'
import { createAgentChannel } from '../shared/agent/state'

/** Node type is authoritative: imported agent keys need not start with `agent`. */
export function createGraphNodeChannel(node: TXpertTeamNode | undefined) {
    if (node?.type === 'agent') return createAgentChannel(node.entity)
    return Annotation<Record<string, unknown>>({
        reducer: (previous, next) => (next ? { ...previous, ...next } : previous),
        default: () => ({})
    })
}
