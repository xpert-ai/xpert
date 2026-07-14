import { ChatMessageUpsertCommand } from '../upsert.command'
import { ChatMessageUpsertHandler } from './upsert.handler'
import { XpertAgentExecutionStatusEnum, type IChatMessage } from '@xpert-ai/contracts'
import type { TMessageContent } from '@xpert-ai/chatkit-types'

describe('ChatMessageUpsertHandler', () => {
    it('uses save for entities with ids so relation fields like attachments can be persisted', async () => {
        const service = {
            save: jest.fn((entity) => Promise.resolve(entity)),
            create: jest.fn(),
            findOneInOrganizationOrTenant: jest.fn().mockResolvedValue({
                id: 'message-1',
                role: 'human',
                content: 'Hello',
                attachments: [{ id: 'file-1' }]
            })
        }
        const handler = new ChatMessageUpsertHandler(service as never, {} as never)

        await handler.execute(
            new ChatMessageUpsertCommand({
                id: 'message-1',
                role: 'human',
                content: 'Hello',
                attachments: [{ id: 'file-1' }] as any
            })
        )

        expect(service.save).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                id: 'message-1',
                role: 'human',
                content: 'Hello',
                attachments: [{ id: 'file-1' }]
            })
        )
        expect(service.save).toHaveBeenLastCalledWith({
            id: 'message-1',
            taskSummary: expect.objectContaining({ version: 1 })
        })
        expect(service.create).not.toHaveBeenCalled()
    })

    it('keeps the complete ai message after deriving its task summary', async () => {
        const created = {
            id: 'ai-message-1',
            role: 'ai',
            content: '',
            conversationId: 'conversation-1',
            executionId: 'execution-1',
            parentId: 'human-message-1',
            status: 'thinking'
        }
        const service = {
            save: jest.fn((entity) => Promise.resolve(entity)),
            create: jest.fn().mockResolvedValue(created),
            findOneInOrganizationOrTenant: jest.fn().mockResolvedValue({
                id: 'ai-message-1',
                content: '',
                createdAt: new Date('2026-07-13T00:00:00.000Z'),
                updatedAt: new Date('2026-07-13T00:00:00.000Z')
            })
        }
        const handler = new ChatMessageUpsertHandler(service as never, {} as never)

        const result = await handler.execute(
            new ChatMessageUpsertCommand({
                role: 'ai',
                content: '',
                conversationId: 'conversation-1',
                executionId: 'execution-1',
                parentId: 'human-message-1',
                status: 'thinking'
            })
        )

        expect(service.save).toHaveBeenCalledWith({
            id: 'ai-message-1',
            taskSummary: expect.objectContaining({ version: 1 })
        })
        expect(result).toEqual(
            expect.objectContaining({
                role: 'ai',
                conversationId: 'conversation-1',
                executionId: 'execution-1',
                parentId: 'human-message-1',
                status: 'thinking',
                taskSummary: expect.objectContaining({ version: 1 })
            })
        )
    })

    it('does not re-extract the summary for status-only message updates', async () => {
        const service = {
            save: jest.fn((entity) => Promise.resolve(entity)),
            create: jest.fn(),
            findOneInOrganizationOrTenant: jest.fn()
        }
        const handler = new ChatMessageUpsertHandler(service as never, {} as never)

        await handler.execute(
            new ChatMessageUpsertCommand({
                id: 'message-1',
                status: XpertAgentExecutionStatusEnum.SUCCESS
            })
        )

        expect(service.save).toHaveBeenCalledTimes(1)
        expect(service.findOneInOrganizationOrTenant).not.toHaveBeenCalled()
    })

    it('rebuilds derived task summary data across consecutive content updates', async () => {
        let persisted: Partial<IChatMessage> & { id: string; createdAt: Date; updatedAt: Date } = {
            id: 'message-1',
            role: 'ai',
            content: [],
            createdAt: new Date('2026-07-13T00:00:00.000Z'),
            updatedAt: new Date('2026-07-13T01:00:00.000Z')
        }
        const service = {
            save: jest.fn(async (entity: Partial<IChatMessage>) => {
                Object.assign(persisted, entity)
                return { ...persisted }
            }),
            create: jest.fn(),
            findOneInOrganizationOrTenant: jest.fn(async () => ({ ...persisted }))
        }
        const handler = new ChatMessageUpsertHandler(service as never, {} as never)

        await handler.execute(
            new ChatMessageUpsertCommand({
                id: 'message-1',
                content: [
                    {
                        type: 'component',
                        data: {
                            artifact: {
                                artifactId: 'artifact-1',
                                kind: 'markdown',
                                title: 'Report'
                            }
                        }
                    }
                ] satisfies TMessageContent
            })
        )
        expect(persisted.taskSummary?.outputs).toEqual([
            expect.objectContaining({ id: 'artifact:artifact-1', title: 'Report' })
        ])

        await handler.execute(
            new ChatMessageUpsertCommand({
                id: 'message-1',
                content: [{ type: 'text', text: 'The previous output was removed.' }] satisfies TMessageContent
            })
        )

        expect(persisted.taskSummary).toEqual({ version: 1 })
    })
})
