import { TXpertGraph, TXpertTeamNode } from '@xpert-ai/contracts'
import { getIteratorSubgraphAgentMetadata } from './strategy'

describe('getIteratorSubgraphAgentMetadata', () => {
    it('uses the single start agent node title for iterator subgraph metadata', () => {
        const agentNode: TXpertTeamNode<'agent'> = {
            type: 'agent',
            key: 'Agent_worker',
            position: { x: 0, y: 0 },
            entity: {
                key: 'Agent_worker',
                title: '单文件处理智能体'
            }
        }
        const graph: TXpertGraph = {
            nodes: [agentNode],
            connections: []
        }

        expect(getIteratorSubgraphAgentMetadata(graph, ['Agent_worker'])).toEqual({
            agentKey: 'Agent_worker',
            xpertName: '单文件处理智能体'
        })
    })

    it('does not guess an agent when the iterator subgraph has multiple start nodes', () => {
        const graph: TXpertGraph = {
            nodes: [
                {
                    type: 'agent',
                    key: 'Agent_a',
                    position: { x: 0, y: 0 },
                    entity: {
                        key: 'Agent_a',
                        title: 'Agent A'
                    }
                },
                {
                    type: 'agent',
                    key: 'Agent_b',
                    position: { x: 0, y: 0 },
                    entity: {
                        key: 'Agent_b',
                        title: 'Agent B'
                    }
                }
            ],
            connections: []
        }

        expect(getIteratorSubgraphAgentMetadata(graph, ['Agent_a', 'Agent_b'])).toEqual({})
    })
})
