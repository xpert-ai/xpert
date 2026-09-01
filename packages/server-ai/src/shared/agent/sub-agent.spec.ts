import type { RuntimeCapabilitiesSelection } from '@xpert-ai/chatkit-types'
import type { TXpertGraph } from '@xpert-ai/contracts'
import {
    getRuntimeEnabledSubAgentConnections,
    getSubAgentConnectionTargetKey,
    isRequiredSubAgentConnection
} from './sub-agent'

describe('sub-agent runtime selection', () => {
    it('treats only explicit truthy required as required', () => {
        expect(isRequiredSubAgentConnection({})).toBe(false)
        expect(isRequiredSubAgentConnection({ required: true })).toBe(true)
        expect(isRequiredSubAgentConnection({ required: false })).toBe(false)
    })

    it('keeps all sub-agent connections when no runtime allow-list is provided', () => {
        const graph = {
            nodes: [],
            connections: [
                { key: 'agent-1/required-agent', type: 'agent', from: 'agent-1', to: 'required-agent', required: true },
                {
                    key: 'agent-1/optional-agent',
                    type: 'agent',
                    from: 'agent-1',
                    to: 'optional-agent',
                    required: false
                },
                { key: 'agent-1/optional-xpert', type: 'xpert', from: 'agent-1', to: 'optional-xpert', required: false }
            ]
        } as any

        expect(
            getRuntimeEnabledSubAgentConnections(graph, { key: 'agent-1' }).map(getSubAgentConnectionTargetKey)
        ).toEqual(['required-agent', 'optional-agent', 'optional-xpert'])
    })

    it('keeps all sub-agents for an independent Connector-only selection', () => {
        const graph: TXpertGraph = {
            nodes: [],
            connections: [
                { key: 'agent-1/optional-agent', type: 'agent', from: 'agent-1', to: 'optional-agent' },
                { key: 'agent-1/optional-xpert', type: 'xpert', from: 'agent-1', to: 'optional-xpert' }
            ]
        }
        const runtimeCapabilities: RuntimeCapabilitiesSelection & { inheritUnselected: true } = {
            mode: 'allowlist',
            inheritUnselected: true,
            skills: { ids: [] },
            plugins: { nodeKeys: [] },
            subAgents: { nodeKeys: [] }
        }

        expect(
            getRuntimeEnabledSubAgentConnections(graph, { key: 'agent-1' }, { runtimeCapabilities }).map(
                getSubAgentConnectionTargetKey
            )
        ).toEqual(['optional-agent', 'optional-xpert'])
    })

    it('keeps required and selected optional sub-agent connections for runtime allow-lists', () => {
        const graph = {
            nodes: [],
            connections: [
                { key: 'agent-1/required-agent', type: 'agent', from: 'agent-1', to: 'required-agent', required: true },
                {
                    key: 'agent-1/optional-agent',
                    type: 'agent',
                    from: 'agent-1',
                    to: 'optional-agent',
                    required: false
                },
                { key: 'agent-1/optional-xpert', type: 'xpert', from: 'agent-1', to: 'optional-xpert', required: false }
            ]
        } as any

        expect(
            getRuntimeEnabledSubAgentConnections(
                graph,
                { key: 'agent-1' },
                {
                    runtimeCapabilities: {
                        mode: 'allowlist',
                        skills: { ids: [] },
                        plugins: { nodeKeys: [] },
                        subAgents: { nodeKeys: ['optional-xpert'] }
                    }
                }
            ).map(getSubAgentConnectionTargetKey)
        ).toEqual(['required-agent', 'optional-xpert'])
    })

    it('ignores connection keys in runtime allow-lists', () => {
        const graph = {
            nodes: [],
            connections: [
                { key: 'agent-1/required-agent', type: 'agent', from: 'agent-1', to: 'required-agent', required: true },
                {
                    key: 'agent-1/optional-agent',
                    type: 'agent',
                    from: 'agent-1',
                    to: 'optional-agent',
                    required: false
                },
                { key: 'agent-1/optional-xpert', type: 'xpert', from: 'agent-1', to: 'optional-xpert', required: false }
            ]
        } as any

        expect(
            getRuntimeEnabledSubAgentConnections(
                graph,
                { key: 'agent-1' },
                {
                    runtimeCapabilities: {
                        mode: 'allowlist',
                        skills: { ids: [] },
                        plugins: { nodeKeys: [] },
                        subAgents: { nodeKeys: ['agent-1/optional-agent'] }
                    }
                }
            ).map(getSubAgentConnectionTargetKey)
        ).toEqual(['required-agent'])
    })
})
