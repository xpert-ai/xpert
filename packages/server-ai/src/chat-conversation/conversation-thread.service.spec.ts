import { ConflictException } from '@nestjs/common'
import { DataSource, Repository } from 'typeorm'
import { ChatMessage } from '../chat-message/chat-message.entity'
import { CopilotCheckpoint } from '../copilot-checkpoint/copilot-checkpoint.entity'
import { CopilotCheckpointWrites } from '../copilot-checkpoint/writes/writes.entity'
import { ChatConversation } from './conversation.entity'
import { ChatConversationGoal } from './goal/conversation-goal.entity'
import { ChatConversationThread } from './conversation-thread.entity'
import { ChatConversationThreadService } from './conversation-thread.service'

describe('ChatConversationThreadService', () => {
    function createService({
        threadRepository = {},
        messageRepository = {},
        conversationRepository = {},
        dataSource = {}
    }: {
        threadRepository?: Partial<Repository<ChatConversationThread>>
        messageRepository?: Partial<Repository<ChatMessage>>
        conversationRepository?: Partial<Repository<ChatConversation>>
        dataSource?: Partial<DataSource>
    } = {}) {
        return new ChatConversationThreadService(
            threadRepository as Repository<ChatConversationThread>,
            messageRepository as Repository<ChatMessage>,
            conversationRepository as Repository<ChatConversation>,
            dataSource as DataSource
        )
    }

    it('creates a primary thread at the latest legacy message and attaches its conversation', async () => {
        const conversation = {
            id: 'conversation-1',
            threadId: 'root-thread',
            status: 'idle'
        } as ChatConversation
        const service = createService({
            messageRepository: {
                findOne: jest.fn().mockResolvedValue({ id: 'message-2' })
            }
        })
        jest.spyOn(service, 'findByThreadId').mockResolvedValue(null)
        jest.spyOn(service, 'create').mockResolvedValue({
            id: 'thread-row-1',
            threadId: 'root-thread'
        } as ChatConversationThread)

        const thread = await service.ensurePrimary(conversation)

        expect(service.create).toHaveBeenCalledWith(
            expect.objectContaining({
                conversationId: 'conversation-1',
                threadId: 'root-thread',
                headMessageId: 'message-2',
                metadata: { primary: true }
            })
        )
        expect(thread.conversation).toBe(conversation)
    })

    it('loads only the root-to-head ancestor path for a derived thread', async () => {
        const findAndCount = jest.fn().mockResolvedValue([[{ id: 'message-1' }, { id: 'message-3' }], 2])
        const getTreeRepository = jest.fn().mockReturnValue({
            findAncestors: jest.fn().mockResolvedValue([{ id: 'message-1' }, { id: 'message-3' }])
        })
        const service = createService({
            messageRepository: {
                findOne: jest.fn().mockResolvedValue({ id: 'message-3' }),
                findAndCount,
                manager: { getTreeRepository } as unknown as Repository<ChatMessage>['manager']
            } as Partial<Repository<ChatMessage>>
        })
        jest.spyOn(service, 'requireByThreadId').mockResolvedValue({
            threadId: 'side-thread',
            conversationId: 'conversation-1',
            headMessageId: 'message-3'
        } as ChatConversationThread)

        const page = await service.findVisibleMessages('side-thread')

        expect(page.total).toBe(2)
        expect(findAndCount).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    conversationId: 'conversation-1'
                })
            })
        )
        const where = findAndCount.mock.calls[0][0].where
        expect(where.id).toEqual(expect.objectContaining({ _value: ['message-1', 'message-3'] }))
    })

    it('rejects a fork while the source thread is busy under the transaction lock', async () => {
        const source = {
            id: 'source-row',
            threadId: 'root-thread',
            conversation: { id: 'conversation-1' }
        } as ChatConversationThread
        const threadRepository = {
            findOne: jest.fn().mockResolvedValue({ ...source, status: 'busy' })
        }
        const manager = {
            getRepository: jest.fn().mockReturnValue(threadRepository)
        }
        const dataSource = {
            transaction: jest.fn(async (work: (transactionManager: typeof manager) => Promise<unknown>) =>
                work(manager)
            )
        } as unknown as Partial<DataSource>
        const service = createService({ dataSource })
        jest.spyOn(service, 'requireByThreadId').mockResolvedValue(source)

        await expect(service.copyThread('root-thread')).rejects.toBeInstanceOf(ConflictException)
        expect(threadRepository.findOne).toHaveBeenCalledWith(
            expect.objectContaining({ lock: { mode: 'pessimistic_write' } })
        )
    })

    it('forks at the source head and copies checkpoint, writes, and goal state', async () => {
        const source = {
            id: 'source-row',
            threadId: 'root-thread',
            conversationId: 'conversation-1',
            headMessageId: 'message-8',
            status: 'idle',
            tenantId: 'tenant-1',
            organizationId: 'organization-1',
            conversation: { id: 'conversation-1', threadId: 'root-thread' }
        } as ChatConversationThread
        const createdSnapshots: unknown[] = []
        const threadRepository = {
            findOne: jest.fn().mockResolvedValue(source),
            create: jest.fn((value) => value)
        }
        const checkpointRepository = {
            find: jest.fn().mockResolvedValue([{ checkpoint_id: 'checkpoint-1', checkpoint_ns: '' }]),
            create: jest.fn((value) => {
                createdSnapshots.push(value)
                return value
            })
        }
        const writesRepository = {
            find: jest.fn().mockResolvedValue([{ checkpoint_id: 'checkpoint-1', task_id: 'task-1', idx: 0 }]),
            create: jest.fn((value) => {
                createdSnapshots.push(value)
                return value
            })
        }
        const goalRepository = {
            findOne: jest.fn().mockResolvedValue({
                conversationId: 'conversation-1',
                threadId: 'root-thread',
                objective: 'Investigate the quote',
                status: 'active'
            }),
            create: jest.fn((value) => {
                createdSnapshots.push(value)
                return value
            })
        }
        const manager = {
            getRepository: jest.fn((entity: unknown) => {
                if (entity === ChatConversationThread) return threadRepository
                if (entity === CopilotCheckpoint) return checkpointRepository
                if (entity === CopilotCheckpointWrites) return writesRepository
                if (entity === ChatConversationGoal) return goalRepository
                throw new Error('Unexpected repository')
            }),
            save: jest.fn(async (...args: unknown[]) => {
                const value = args.length === 2 ? args[1] : args[0]
                return Array.isArray(value) ? value : { id: 'saved-row', ...(value as object) }
            })
        }
        const service = createService({
            dataSource: {
                transaction: jest.fn(async (work: (transactionManager: typeof manager) => Promise<unknown>) =>
                    work(manager)
                )
            } as unknown as Partial<DataSource>
        })
        jest.spyOn(service, 'requireByThreadId').mockResolvedValue(source)

        const child = await service.copyThread('root-thread')

        expect(child).toMatchObject({
            parentThreadId: 'root-thread',
            headMessageId: 'message-8',
            forkedFromMessageId: 'message-8',
            status: 'idle',
            metadata: { purpose: 'side-chat', primary: false }
        })
        expect(child.threadId).not.toBe('root-thread')
        expect(createdSnapshots).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ thread_id: child.threadId, checkpoint_id: 'checkpoint-1' }),
                expect.objectContaining({ thread_id: child.threadId, task_id: 'task-1' }),
                expect.objectContaining({
                    conversationId: 'conversation-1',
                    threadId: child.threadId,
                    objective: 'Investigate the quote'
                })
            ])
        )
    })
})
