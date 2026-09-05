import { KnowledgebaseTypeEnum } from '@xpert-ai/contracts'
import { instanceToPlain } from 'class-transformer'
import { KnowledgebasePublicDTO } from './knowledgebase-public.dto'

describe('KnowledgebasePublicDTO', () => {
    it('exposes workspace and FAQ identity needed by scoped settings consumers', () => {
        const dto = new KnowledgebasePublicDTO({
            id: 'knowledgebase-1',
            name: 'Knowledgebase',
            type: KnowledgebaseTypeEnum.FAQ,
            faqConfig: {
                indexMode: 'question_only',
                questionIndexMode: 'separate'
            },
            workspaceId: 'workspace-1'
        })

        expect(instanceToPlain(dto)).toMatchObject({
            id: 'knowledgebase-1',
            type: KnowledgebaseTypeEnum.FAQ,
            faqConfig: {
                indexMode: 'question_only',
                questionIndexMode: 'separate'
            },
            workspaceId: 'workspace-1'
        })
    })

    it('exposes legacy knowledgebases without a type as standard document knowledgebases', () => {
        const dto = new KnowledgebasePublicDTO({
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
