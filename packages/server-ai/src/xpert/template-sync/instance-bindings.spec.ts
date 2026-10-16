import {
    AiModelTypeEnum,
    IWFNMiddleware,
    KnowledgebaseTypeEnum,
    XpertTypeEnum,
    IXpert,
    IXpertToolset,
    TXpertTeamDraft,
    WorkflowNodeTypeEnum,
    XpertToolsetCategoryEnum
} from '@xpert-ai/contracts'
import { preserveTemplateInstanceBindings } from './instance-bindings'

function fixture() {
    const selected = {
        id: 'model-binding',
        copilotId: 'provider',
        model: 'custom',
        modelType: AiModelTypeEnum.LLM,
        options: { temperature: 0.37 }
    }
    const tool: IXpertToolset = {
        id: 'installed-tool',
        name: 'Renamed image tool',
        category: XpertToolsetCategoryEnum.BUILTIN,
        type: 'image-provider',
        credentials: { token: 'private' }
    }
    const graph: TXpertTeamDraft = {
        team: { copilotModel: selected, agent: { key: 'Agent_Main' }, options: {} },
        nodes: [
            {
                key: 'Agent_Main',
                type: 'agent',
                position: { x: 0, y: 0 },
                entity: { key: 'Agent_Main', copilotModel: null }
            },
            { key: 'installed-tool', type: 'toolset', position: { x: 0, y: 0 }, entity: tool },
            {
                key: 'compression',
                type: 'workflow',
                position: { x: 0, y: 0 },
                entity: {
                    id: 'compression',
                    key: 'compression',
                    type: WorkflowNodeTypeEnum.MIDDLEWARE,
                    provider: 'Compression',
                    options: { llm: selected, threshold: 0.5 }
                } as IWFNMiddleware
            }
        ],
        connections: [{ key: 'old-edge', type: 'toolset', from: 'Agent_Main', to: 'installed-tool' }]
    }
    const installed: IXpert = {
        id: 'assistant',
        environmentId: 'environment',
        ...graph.team,
        slug: 'assistant',
        name: 'assistant',
        type: XpertTypeEnum.Agent,
        graph
    }
    const incoming = structuredClone(graph)
    incoming.team.copilotModel = { copilotId: 'template-provider', model: 'template-default' }
    incoming.nodes[0].entity = { key: 'Agent_Main', prompt: 'Updated prompt', copilotModel: selected }
    incoming.nodes[1] = {
        ...incoming.nodes[1],
        key: 'template-placeholder',
        entity: { ...tool, id: 'template-placeholder', name: 'Original tool name' }
    } as (typeof incoming.nodes)[1]
    incoming.connections[0].to = 'template-placeholder'
    const middleware = incoming.nodes[2]
    if (middleware.type === 'workflow' && middleware.entity.type === WorkflowNodeTypeEnum.MIDDLEWARE) {
        ;(middleware.entity as IWFNMiddleware).options = { llm: { model: 'template-default' }, threshold: 0.85 }
    }
    return { installed, incoming, selected, graph }
}

describe('template instance bindings', () => {
    it('rewrites tool nodes, edges, Agent arrays and team arrays to the installed ID, preserving model inheritance and middleware selections', () => {
        const { installed, incoming, selected } = fixture()
        preserveTemplateInstanceBindings(incoming, installed, { Compression: [{ path: 'llm' }] })
        expect(incoming.nodes[1]).toMatchObject({
            key: 'installed-tool',
            entity: { id: 'installed-tool', name: 'Renamed image tool' }
        })
        expect(incoming.connections[0].to).toBe('installed-tool')
        expect(incoming.nodes[0].entity).toMatchObject({
            prompt: 'Updated prompt',
            copilotModel: null,
            toolsetIds: ['installed-tool']
        })
        expect(incoming.team.toolsets?.map((tool) => tool.id)).toEqual(['installed-tool'])
        expect(incoming.team.copilotModel).toEqual(selected)
        expect(incoming.team.environmentId).toBe('environment')
        expect(incoming.nodes[2].entity).toMatchObject({ options: { llm: selected, threshold: 0.85 } })
    })

    it('uses a current draft model selection, including an explicit null, instead of the published model', () => {
        const { installed, incoming, graph } = fixture()
        installed.draft = structuredClone(graph)
        installed.draft.team.copilotModel = null
        preserveTemplateInstanceBindings(incoming, installed, {})
        expect(incoming.team.copilotModel).toBeNull()
    })

    it('rejects ambiguous provider matches and does not match unrelated tools by display name', () => {
        const { installed, incoming, graph } = fixture()
        graph.nodes.push({
            key: 'another-tool',
            type: 'toolset',
            position: { x: 0, y: 0 },
            entity: {
                id: 'another-tool',
                name: 'another',
                category: XpertToolsetCategoryEnum.BUILTIN,
                type: 'image-provider'
            }
        })
        expect(() => preserveTemplateInstanceBindings(incoming, installed, {})).toThrow()
        graph.nodes = graph.nodes.filter((node) => node.type !== 'toolset')
        graph.nodes.push({
            key: 'wrong-tool',
            type: 'toolset',
            position: { x: 0, y: 0 },
            entity: {
                id: 'wrong-tool',
                name: 'Original tool name',
                category: XpertToolsetCategoryEnum.BUILTIN,
                type: 'different-provider'
            }
        })
        expect(() => preserveTemplateInstanceBindings(incoming, installed, {})).toThrow()
    })

    it('retains local knowledge/tool edges only for Agents that still exist', () => {
        const { installed, incoming, graph } = fixture()
        graph.nodes.push({
            key: 'knowledge',
            type: 'knowledge',
            position: { x: 0, y: 0 },
            entity: { id: 'knowledge', name: 'Local knowledge', type: KnowledgebaseTypeEnum.Standard }
        })
        graph.connections.push({ key: 'knowledge-edge', type: 'knowledge', from: 'Agent_Main', to: 'knowledge' })
        graph.connections.push({ key: 'removed-edge', type: 'knowledge', from: 'Removed_Agent', to: 'knowledge' })
        preserveTemplateInstanceBindings(incoming, installed, {})
        expect(incoming.nodes[0].entity).toMatchObject({ knowledgebaseIds: ['knowledge'] })
        expect(incoming.connections.some((edge) => edge.from === 'Removed_Agent')).toBe(false)
    })
})
