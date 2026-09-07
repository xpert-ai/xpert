import { AiModelTypeEnum, DEFAULT_KNOWLEDGEBASE_WIKI_CONFIG, KnowledgebaseTypeEnum } from '@xpert-ai/contracts'
import { instanceToPlain } from 'class-transformer'
import { KnowledgebaseDetailDTO } from './knowledgebase-detail.dto'

describe('KnowledgebaseDetailDTO', () => {
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

    it('exposes server-computed Wiki management capability', () => {
        const dto = new KnowledgebaseDetailDTO({
            id: 'knowledgebase-1',
            name: 'Knowledgebase',
            type: KnowledgebaseTypeEnum.Standard,
            canManageWiki: true
        })

        expect(instanceToPlain(dto)).toMatchObject({
            canManageWiki: true
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
