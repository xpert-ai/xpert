import { ForbiddenException } from '@nestjs/common'
import { IWFNMiddleware, IXpertAgent, TXpertGraph, TXpertTeamNode, WorkflowNodeTypeEnum } from '@xpert-ai/contracts'
import { getConnectorMiddlewareScope } from './connector-runtime'
import { getRuntimeEnabledMiddlewareNodes } from './middleware'

function connectorNode(key: string, provider: string, connectorId?: string, required = false): TXpertTeamNode {
    const entity: IWFNMiddleware = {
        id: key,
        key,
        type: WorkflowNodeTypeEnum.MIDDLEWARE,
        provider: 'ConnectorMiddleware',
        options: { provider, ...(connectorId ? { connectorId } : {}) },
        required
    }
    return { key, type: 'workflow', entity, position: { x: 0, y: 0 } }
}

describe('graph Connector runtime scope', () => {
    it('keeps optional Connector activation and middleware ordering unchanged', () => {
        const nodes = [connectorNode('optional', 'lark'), connectorNode('required', 'github', undefined, true)]
        const graph = {
            nodes,
            connections: nodes.map(({ key }) => ({ type: 'workflow', from: 'agent-1', to: key }))
        } as TXpertGraph
        const agent = { key: 'agent-1', options: { middlewares: { order: ['required', 'optional'] } } } as IXpertAgent
        const capabilities = { mode: 'allowlist' as const, skills: { ids: [] }, plugins: { nodeKeys: [] as string[] } }
        const selected = getRuntimeEnabledMiddlewareNodes(graph, agent, { runtimeCapabilities: capabilities })
        expect(selected.map(({ key }) => key)).toEqual(['required'])
        expect(getConnectorMiddlewareScope(selected, []).connectorProviders).toEqual(['github'])
        capabilities.plugins.nodeKeys.push('optional')
        expect(
            getRuntimeEnabledMiddlewareNodes(graph, agent, { runtimeCapabilities: capabilities }).map(({ key }) => key)
        ).toEqual(['required', 'optional'])
        expect(getRuntimeEnabledMiddlewareNodes(graph, agent).map(({ key }) => key)).toEqual(['required', 'optional'])
    })

    it('grants exact graph pins without enabling unrestricted lookup by provider', () => {
        expect(getConnectorMiddlewareScope([connectorNode('lark-node', 'lark', 'lark-1')], [])).toEqual({
            connectorBindingIds: ['lark-1'],
            connectorProviders: [],
            additionalBindings: []
        })
    })

    it('deduplicates a selected binding against its graph node and retains graphless selections', () => {
        const bindings = [
            { bindingId: 'lark-1', provider: 'lark' },
            { bindingId: 'github-1', provider: 'github' }
        ]
        const result = getConnectorMiddlewareScope([connectorNode('lark-node', 'lark', 'lark-1')], bindings)
        expect(result.connectorBindingIds).toEqual(['lark-1', 'github-1'])
        expect(result.additionalBindings).toEqual([bindings[1]])
    })

    it('rejects a manual binding that conflicts with a graph pin', () => {
        expect(() =>
            getConnectorMiddlewareScope(
                [connectorNode('lark-node', 'lark', 'pinned-lark')],
                [{ bindingId: 'other-lark', provider: 'lark' }]
            )
        ).toThrow(ForbiddenException)
    })

    it('rejects two conflicting graph pins instead of silently keeping the first provider', () => {
        expect(() =>
            getConnectorMiddlewareScope(
                [connectorNode('first', 'lark', 'lark-1'), connectorNode('second', 'lark', 'lark-2')],
                []
            )
        ).toThrow(ForbiddenException)
    })
})
