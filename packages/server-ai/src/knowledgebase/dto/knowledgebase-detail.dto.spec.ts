import {
    AiModelTypeEnum,
    DEFAULT_KNOWLEDGEBASE_WIKI_CONFIG,
    IWFNSource,
    KnowledgebaseTypeEnum,
    TXpertGraph,
    WorkflowNodeTypeEnum,
    XpertParameterTypeEnum,
    XpertTypeEnum
} from '@xpert-ai/contracts'
import { instanceToPlain } from 'class-transformer'
import { KnowledgebaseDetailDTO } from './knowledgebase-detail.dto'

describe('KnowledgebaseDetailDTO', () => {
    it('preserves published source nodes for document import without exposing draft or linked expert graphs', () => {
        const source: IWFNSource<{ fileExtensions: string[] }> = {
            id: 'source-1',
            key: 'source-1',
            type: WorkflowNodeTypeEnum.SOURCE,
            provider: 'local-file',
            config: { fileExtensions: ['pdf'] },
            integrationId: 'integration-1',
            parameters: [{ name: 'folder', type: XpertParameterTypeEnum.STRING }]
        }
        const graph: TXpertGraph = {
            nodes: [{ key: source.key, type: 'workflow', position: { x: 0, y: 0 }, entity: source }],
            connections: []
        }
        const dto = new KnowledgebaseDetailDTO({
            id: 'kb-1',
            pipeline: {
                id: 'pipeline-1',
                slug: 'knowledge-pipeline',
                name: 'Knowledge pipeline',
                type: XpertTypeEnum.Knowledge,
                publishAt: new Date('2026-07-08T08:00:00.000Z'),
                version: '1.0.0',
                graph,
                draft: { nodes: [], connections: [], team: {} }
            },
            xperts: [{ id: 'xpert-1', slug: 'linked-expert', name: 'Linked expert', type: XpertTypeEnum.Agent, graph }]
        })

        const payload = instanceToPlain(dto)

        expect(payload.pipeline.graph).toEqual(graph)
        expect(payload.pipeline).not.toHaveProperty('draft')
        expect(payload.xperts[0]).not.toHaveProperty('graph')
    })

    it.each([undefined, null])('keeps absent pipelines empty (%s)', (pipeline) => {
        const payload = instanceToPlain(new KnowledgebaseDetailDTO({ id: 'kb-1', pipeline }))

        expect(payload.pipeline).toBeNull()
    })

    it('exposes legacy knowledgebases without a type as standard document knowledgebases', () => {
        const dto = new KnowledgebaseDetailDTO({
            id: 'legacy-knowledgebase',
            name: 'Legacy knowledgebase',
            type: null
        })

        expect(instanceToPlain(dto)).toMatchObject({
            id: 'legacy-knowledgebase',
            type: KnowledgebaseTypeEnum.Standard,
            wikiConfig: DEFAULT_KNOWLEDGEBASE_WIKI_CONFIG,
            wikiStatus: 'disabled',
            wikiAvailability: 'unavailable'
        })
    })

    it('exposes server-computed Wiki and deletion management capabilities', () => {
        const dto = new KnowledgebaseDetailDTO({
            id: 'knowledgebase-1',
            name: 'Knowledgebase',
            type: KnowledgebaseTypeEnum.Standard,
            canManageWiki: true,
            canManageDocumentDeletions: true
        })

        expect(instanceToPlain(dto)).toMatchObject({
            canManageWiki: true,
            canManageDocumentDeletions: true
        })
    })

    it('exposes the optional dedicated Wiki model', () => {
        const dto = new KnowledgebaseDetailDTO({
            id: 'knowledgebase-1',
            name: 'Knowledgebase',
            type: KnowledgebaseTypeEnum.Standard,
            wikiModelId: 'wiki-model-1',
            wikiModel: {
                id: 'wiki-model-1',
                modelType: AiModelTypeEnum.LLM,
                model: 'wiki-model'
            }
        })

        expect(instanceToPlain(dto)).toMatchObject({
            wikiModelId: 'wiki-model-1',
            wikiModel: { id: 'wiki-model-1', modelType: AiModelTypeEnum.LLM, model: 'wiki-model' }
        })
    })
})
