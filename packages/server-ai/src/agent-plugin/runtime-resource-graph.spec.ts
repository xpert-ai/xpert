import { IXpertAgent, TXpertGraph, WorkflowNodeTypeEnum, IWFNMiddleware } from '@xpert-ai/contracts'
import { applyRuntimeResourceGraph } from './runtime-resource-graph'
import type { ResolvedRuntimeResources } from './runtime-resource.service'
import { SKILLS_MIDDLEWARE_NAME } from '../skill-package/types'

const agent = { key: 'main' } as IXpertAgent
const resources = (): ResolvedRuntimeResources => ({
    selection: { revision: 1, resources: [] },
    skillIds: ['skill-1'],
    toolsetIds: [],
    middlewares: [],
    experts: []
})
const graph = (): TXpertGraph => ({ nodes: [], connections: [] })

describe('conversation-only resource graph', () => {
    it('provides a required Skills loader without changing the published graph', () => {
        const original = graph()
        const overlay = applyRuntimeResourceGraph(original, agent, resources())
        expect(original).toEqual(graph())
        expect(overlay.nodes[0].entity).toMatchObject({
            provider: SKILLS_MIDDLEWARE_NAME,
            required: true,
            options: { resourceOnly: true }
        })
        expect(overlay.connections[0]).toMatchObject({ from: 'main', to: overlay.nodes[0].key })
    })
    it('does not replace mandatory configured middleware', () => {
        const original = graph()
        const entity: IWFNMiddleware = {
            id: 'audit',
            key: 'audit',
            type: WorkflowNodeTypeEnum.MIDDLEWARE,
            provider: 'audit',
            required: true,
            options: { mode: 'strict' }
        }
        original.nodes.push({ key: 'audit', type: 'workflow', position: { x: 0, y: 0 }, entity })
        original.connections.push({ key: 'edge', type: 'workflow', from: 'main', to: 'audit' })
        const selected = resources()
        selected.middlewares.push({ key: 'dynamic', entity: { ...entity, options: { mode: 'loose' } } })
        const overlay = applyRuntimeResourceGraph(original, agent, selected)
        expect(overlay.nodes[0].entity).toMatchObject({ options: { mode: 'strict' }, required: true })
        expect(original.nodes[0].entity).toEqual(entity)
    })
    it('does not add duplicate middleware when configuration agrees', () => {
        const original = graph()
        const selected = resources()
        selected.skillIds = []
        const entity: IWFNMiddleware = {
            id: 'audit',
            key: 'audit',
            type: WorkflowNodeTypeEnum.MIDDLEWARE,
            provider: 'audit',
            options: {}
        }
        original.nodes.push({ key: 'audit', type: 'workflow', position: { x: 0, y: 0 }, entity })
        original.connections.push({ key: 'edge', type: 'workflow', from: 'main', to: 'audit' })
        selected.middlewares.push({ key: 'dynamic', entity })
        const overlay = applyRuntimeResourceGraph(original, agent, selected)
        expect(overlay.nodes).toHaveLength(1)
        expect(overlay.nodes[0].entity).toMatchObject({ required: true })
        expect(original.nodes[0].entity).not.toHaveProperty('required')
    })
    it('merges duplicate plugin providers after resolving aliases and defaults', () => {
        const selected = resources()
        selected.skillIds = []
        selected.middlewares = ['SandboxCompressionMiddleware', 'ContextCompressionMiddleware'].map(
            (provider, index) => ({
                key: `resource_${index}`,
                entity: {
                    id: `resource_${index}`,
                    key: `resource_${index}`,
                    type: WorkflowNodeTypeEnum.MIDDLEWARE,
                    provider,
                    options: index ? { limit: 100 } : {}
                }
            })
        )
        const overlay = applyRuntimeResourceGraph(graph(), agent, selected, (provider) => ({
            name: provider,
            label: { en_US: provider },
            configSchema: { type: 'object', properties: { limit: { type: 'number', default: 100 } } }
        }))
        expect(overlay.nodes).toHaveLength(1)
        expect(overlay.connections).toHaveLength(1)
        expect(overlay.nodes[0].entity).toMatchObject({
            provider: 'ContextCompressionMiddleware',
            options: { limit: 100 },
            required: true
        })
        expect(selected.middlewares[0].entity.options).toEqual({})
    })
})
