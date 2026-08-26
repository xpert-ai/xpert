import { KnowledgebaseTypeEnum } from '@xpert-ai/contracts'
import { instanceToPlain } from 'class-transformer'
import { KnowledgebasePublicDTO } from './knowledgebase-public.dto'

describe('KnowledgebasePublicDTO', () => {
    it('exposes workspaceId so scoped consumers can retain matching knowledgebases', () => {
        const dto = new KnowledgebasePublicDTO({
            id: 'knowledgebase-1',
            name: 'Knowledgebase',
            type: KnowledgebaseTypeEnum.Standard,
            workspaceId: 'workspace-1'
        })

        expect(instanceToPlain(dto)).toMatchObject({
            id: 'knowledgebase-1',
            workspaceId: 'workspace-1'
        })
    })
})
