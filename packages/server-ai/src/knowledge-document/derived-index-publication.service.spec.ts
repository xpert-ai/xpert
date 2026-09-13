import { KnowledgeQuestionsEnqueueCommand } from './questions/question-generation.command'
import { CommandBus } from '@nestjs/cqrs'
import { KnowledgebaseTypeEnum } from '@xpert-ai/contracts'
import { KnowledgeGraphEnqueueCommand, KnowledgeGraphRetryDocumentCommand } from '../graphrag/commands'
import { KnowledgeWikiEnqueueSourceCommand } from '../knowledgebase/wiki/commands'
import { KnowledgeDerivedIndexPublicationService } from './derived-index-publication.service'

describe('KnowledgeDerivedIndexPublicationService', () => {
    it('dispatches Graph and Wiki only after changed content is published', async () => {
        const commandBus = { execute: jest.fn().mockResolvedValue(undefined) }
        const service = new KnowledgeDerivedIndexPublicationService(commandBus as unknown as CommandBus)

        await service.publish({
            knowledgebase: {
                id: 'kb-1',
                name: 'Knowledgebase',
                type: KnowledgebaseTypeEnum.Standard,
                tenantId: 'tenant-1',
                organizationId: 'org-1'
            },
            documentId: 'document-1',
            userId: 'user-1',
            contentChanged: true
        })

        expect(commandBus.execute).toHaveBeenCalledTimes(3)
        expect(commandBus.execute.mock.calls[0][0]).toBeInstanceOf(KnowledgeQuestionsEnqueueCommand)
        expect(commandBus.execute.mock.calls[1][0]).toBeInstanceOf(KnowledgeGraphEnqueueCommand)
        expect(commandBus.execute.mock.calls[2][0]).toBeInstanceOf(KnowledgeWikiEnqueueSourceCommand)
    })

    it('keeps the source publication successful when one derived index rejects', async () => {
        const commandBus = {
            execute: jest
                .fn()
                .mockRejectedValueOnce(new Error('questions unavailable'))
                .mockResolvedValueOnce(undefined)
        }
        const service = new KnowledgeDerivedIndexPublicationService(commandBus as unknown as CommandBus)

        await expect(
            service.publish({
                knowledgebase: {
                    id: 'kb-1',
                    name: 'Knowledgebase',
                    type: KnowledgebaseTypeEnum.Standard,
                    tenantId: 'tenant-1',
                    organizationId: 'org-1'
                },
                documentId: 'document-1',
                userId: 'user-1',
                contentChanged: true
            })
        ).resolves.toBeUndefined()
        expect(commandBus.execute).toHaveBeenCalledTimes(3)
        expect(commandBus.execute.mock.calls[0][0]).toBeInstanceOf(KnowledgeQuestionsEnqueueCommand)
    })

    it('checks failed Graph recovery without regenerating Wiki when the source hash did not change', async () => {
        const commandBus = { execute: jest.fn().mockResolvedValue(undefined) }
        const service = new KnowledgeDerivedIndexPublicationService(commandBus as unknown as CommandBus)

        await service.publish({
            knowledgebase: {
                id: 'kb-1',
                name: 'Knowledgebase',
                type: KnowledgebaseTypeEnum.Standard,
                tenantId: 'tenant-1',
                organizationId: 'org-1'
            },
            documentId: 'document-1',
            userId: 'user-1',
            contentChanged: false
        })

        expect(commandBus.execute).toHaveBeenCalledTimes(2)
        expect(commandBus.execute.mock.calls[1][0]).toBeInstanceOf(KnowledgeGraphRetryDocumentCommand)
        expect(commandBus.execute.mock.calls[1][0].input).toEqual({
            knowledgebaseId: 'kb-1',
            documentId: 'document-1',
            userId: 'user-1'
        })
    })
})
