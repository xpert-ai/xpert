import { ForbiddenException } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { IKnowledgeDocument, KBDocumentStatusEnum } from '@xpert-ai/contracts'
import { UserService } from '@xpert-ai/server-core'
import { Job } from 'bull'
import { KnowledgebaseService } from '../knowledgebase'
import { KnowledgeDocLoadCommand } from './commands'
import { KnowledgeDocumentConsumer } from './document.job'
import { KnowledgeDocumentService } from './document.service'

let mockContextActive = false

jest.mock('@xpert-ai/server-core', () => {
    const actual = jest.requireActual('@xpert-ai/server-core')
    return {
        ...actual,
        runWithRequestContext: (_req: unknown, next: () => unknown) => {
            mockContextActive = true
            try {
                return next()
            } finally {
                mockContextActive = false
            }
        }
    }
})

jest.mock('../knowledgebase', () => ({
    KnowledgebaseService: class KnowledgebaseService {},
    KnowledgeDocumentStore: class KnowledgeDocumentStore {}
}))

jest.mock('./document.service', () => ({
    KnowledgeDocumentService: class KnowledgeDocumentService {}
}))

describe('KnowledgeDocumentConsumer', () => {
    it('loads the knowledgebase inside the queued document request context', async () => {
        const doc = {
            id: 'doc-id',
            tenantId: 'tenant-id',
            organizationId: 'organization-id',
            knowledgebaseId: 'knowledgebase-id',
            status: KBDocumentStatusEnum.RUNNING
        } satisfies Partial<IKnowledgeDocument>

        const knowledgebaseService = {
            findOne: jest.fn(async () => {
                if (!mockContextActive) {
                    throw new ForbiddenException('Tenant context is required.')
                }
                return {
                    id: 'knowledgebase-id',
                    organizationId: 'organization-id'
                }
            })
        }
        const documentService = {
            update: jest.fn()
        }
        const userService = {
            findOne: jest.fn(async () => ({
                id: 'user-id',
                tenantId: 'tenant-id',
                preferredLanguage: 'zh-Hans'
            }))
        }
        const commandBus = {}
        const consumer = new KnowledgeDocumentConsumer(
            null,
            knowledgebaseService as unknown as KnowledgebaseService,
            documentService as unknown as KnowledgeDocumentService,
            userService as unknown as UserService,
            commandBus as unknown as CommandBus
        )
        const processJob = jest.spyOn(consumer, '_processJob').mockResolvedValue({})
        const job = {
            data: {
                userId: 'user-id',
                docs: [doc]
            }
        } as Job<{ userId: string; docs: IKnowledgeDocument[] }>

        await expect(consumer.process(job)).resolves.toEqual({})

        expect(knowledgebaseService.findOne).toHaveBeenCalled()
        expect(processJob).toHaveBeenCalled()
        expect(documentService.update).not.toHaveBeenCalled()
    })

    it('keeps processing remaining queued documents after one document fails', async () => {
        const docs = [
            {
                id: 'doc-1',
                knowledgebaseId: 'knowledgebase-id',
                status: KBDocumentStatusEnum.RUNNING
            },
            {
                id: 'doc-2',
                knowledgebaseId: 'knowledgebase-id',
                status: KBDocumentStatusEnum.RUNNING
            }
        ] satisfies Partial<IKnowledgeDocument>[]
        const knowledgebaseService = {
            getActiveVectorStore: jest.fn(async () => ({}))
        }
        const documentService = {
            findOne: jest.fn(async (id: string) => docs.find((doc) => doc.id === id)),
            update: jest.fn()
        }
        const commandBus = {
            execute: jest.fn(async (command: unknown) => {
                if (command instanceof KnowledgeDocLoadCommand) {
                    if (command.input.doc.id === 'doc-1') {
                        throw new Error('missing source file')
                    }
                    return {}
                }
                return {}
            })
        }
        const consumer = new KnowledgeDocumentConsumer(
            null,
            knowledgebaseService as unknown as KnowledgebaseService,
            documentService as unknown as KnowledgeDocumentService,
            {} as unknown as UserService,
            commandBus as unknown as CommandBus
        )
        const job = {
            id: 'job-1',
            data: {
                userId: 'user-id',
                docs
            }
        } as Job<{ userId: string; docs: IKnowledgeDocument[] }>

        await expect(
            consumer._processJob(
                {
                    id: 'knowledgebase-id',
                    tenantId: 'tenant-id',
                    organizationId: 'organization-id',
                    copilotModel: { copilot: { id: 'copilot-id' } }
                } as any,
                docs as IKnowledgeDocument[],
                job
            )
        ).resolves.toEqual({})

        expect(
            commandBus.execute.mock.calls.filter(([command]) => command instanceof KnowledgeDocLoadCommand)
        ).toHaveLength(2)
        expect(documentService.update).toHaveBeenCalledWith(
            'doc-1',
            expect.objectContaining({
                status: KBDocumentStatusEnum.ERROR,
                processMsg: 'missing source file'
            })
        )
        expect(documentService.update).toHaveBeenCalledWith(
            'doc-2',
            expect.objectContaining({
                status: KBDocumentStatusEnum.FINISH,
                progress: 100
            })
        )
    })
})
