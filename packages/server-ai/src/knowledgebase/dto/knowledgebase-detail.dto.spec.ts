import { KnowledgebaseTypeEnum } from '@xpert-ai/contracts'
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
            type: KnowledgebaseTypeEnum.Standard
        })
    })
})
