import { Send } from '@langchain/langgraph'
import { collectStartDrivenAgentEntrySources, rerouteAgentEntryTarget } from './subgraph-entry-routing'

describe('collectStartDrivenAgentEntrySources', () => {
    it('collects only the last pre-agent workflow hop reachable from start nodes', () => {
        expect(
            Array.from(
                collectStartDrivenAgentEntrySources({
                    startNodes: ['Start_Workflow'],
                    nodes: {
                        Start_Workflow: {},
                        Preprocess_1: {},
                        Preprocess_2: {},
                        Agent_Target: {}
                    },
                    edges: {
                        Start_Workflow: 'Preprocess_1',
                        Preprocess_1: 'Preprocess_2',
                        Preprocess_2: 'Agent_Target',
                        Agent_Target: 'Postprocess_1',
                        Postprocess_1: 'Agent_Target'
                    },
                    conditionalEdges: {},
                    agentKey: 'Agent_Target'
                })
            )
        ).toEqual(['Preprocess_2'])
    })

    it('resolves start nodes from runtime node names', () => {
        expect(
            Array.from(
                collectStartDrivenAgentEntrySources({
                    startNodes: ['Start_Workflow'],
                    nodes: {
                        Start_Workflow: { name: 'Start_Runtime' }
                    },
                    edges: {
                        Start_Runtime: 'Preprocess_1',
                        Preprocess_1: 'Agent_Target'
                    },
                    conditionalEdges: {},
                    agentKey: 'Agent_Target'
                })
            )
        ).toEqual(['Preprocess_1'])
    })

    it('includes conditional handoffs into the agent', () => {
        expect(
            Array.from(
                collectStartDrivenAgentEntrySources({
                    startNodes: ['Start_Workflow'],
                    nodes: {
                        Start_Workflow: {}
                    },
                    edges: {
                        Start_Workflow: 'Branch_Node'
                    },
                    conditionalEdges: {
                        Branch_Node: [() => 'Agent_Target', ['Agent_Target', 'Else_Node']]
                    },
                    agentKey: 'Agent_Target'
                })
            )
        ).toEqual(['Branch_Node'])
    })
})

describe('rerouteAgentEntryTarget', () => {
    it('reroutes strings and Send targets that enter the agent start chain', () => {
        expect(rerouteAgentEntryTarget('Agent_Target', 'Agent_Target', 'Agent_Start')).toBe('Agent_Start')

        const send = new Send('Agent_Target', { value: 1 })
        const rerouted = rerouteAgentEntryTarget(send, 'Agent_Target', 'Agent_Start')
        expect(rerouted).toBeInstanceOf(Send)
        expect((rerouted as Send).node).toBe('Agent_Start')
        expect((rerouted as Send).args).toEqual({ value: 1 })
    })
})
