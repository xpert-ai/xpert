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
        const find = jest.fn().mockResolvedValue([{ id: 'message-3', parentId: 'message-1' }, { id: 'message-1' }])
        const getTreeRepository = jest.fn().mockReturnValue({
            findAncestors: jest
                .fn()
                .mockResolvedValue([{ id: 'message-1' }, { id: 'message-3', parentId: 'message-1' }])
        })
        const service = createService({
            messageRepository: {
                findOne: jest.fn().mockResolvedValue({ id: 'message-3' }),
                find,
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
        expect(page.items.map((message) => message.id)).toEqual(['message-1', 'message-3'])
        expect(find).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    conversationId: 'conversation-1'
                })
            })
        )
        const where = find.mock.calls[0][0].where
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
    it.each([true, false])(
        'edits the selected historical input while its source is running (checkpoint: %s)',
        async (hasCheckpoint) => {
            const source = {
                id: 'row',
                threadId: 'source',
                conversationId: 'conversation',
                status: 'busy',
                headMessageId: 'latest-ai',
                conversation: { id: 'conversation' },
                tenantId: 'tenant',
                organizationId: 'org'
            } as ChatConversationThread
            const messages = [
                { id: 'first-input', role: 'human', parentId: null },
                {
                    id: 'edited-input',
                    role: 'human',
                    parentId: hasCheckpoint ? 'previous-ai' : null,
                    inputCheckpoint: {
                        version: 1,
                        graphRevision: 'revision',
                        checkpoint: hasCheckpoint
                            ? {
                                  threadId: 'ancestor',
                                  checkpointNs: '',
                                  checkpointId: 'before-edit'
                              }
                            : null
                    }
                }
            ] as ChatMessage[]
            let savedBranch: ChatConversationThread
            const forkLookup = {
                where: jest.fn(() => forkLookup),
                andWhere: jest.fn(() => forkLookup),
                getOne: jest.fn(async () => savedBranch ?? null)
            }
            const threads = {
                findOne: jest.fn(async () => source),
                createQueryBuilder: jest.fn(() => forkLookup),
                create: jest.fn((value) => value)
            }
            const checkpoints = {
                findOne: jest.fn(async () => ({
                    checkpoint_id: 'before-edit',
                    checkpoint_ns: '',
                    parent_id: 'older',
                    checkpoint: { value: 'before' }
                })),
                create: jest.fn((value) => value)
            }
            const conversation = { id: 'conversation', threadId: 'source' }
            const conversations = {
                findOne: jest.fn(async () => conversation),
                save: jest.fn(async (value: typeof conversation) => {
                    Object.assign(conversation, value)
                    return conversation
                })
            }
            const manager = {
                getRepository: jest.fn((entity) => {
                    if (entity === ChatConversationThread) return threads
                    if (entity === CopilotCheckpoint) return checkpoints
                    if (entity === ChatConversation) return conversations
                    throw new Error('Editing must not copy writes, goals, or the latest snapshot')
                }),
                save: jest.fn(async (...args) => {
                    if (args.length === 1) savedBranch = args[0]
                    return args[args.length - 1]
                })
            }
            const service = createService({
                dataSource: { transaction: async (work) => work(manager) } as unknown as DataSource
            })
            jest.spyOn(service, 'requireByThreadId').mockResolvedValue(source)
            jest.spyOn(service, 'findVisibleMessages').mockResolvedValue({ items: messages, total: 2 })
            const branch = await service.copyThread('source', { beforeMessageId: 'edited-input', requestId: 'request' })
            expect(branch).toMatchObject({
                parentThreadId: 'source',
                headMessageId: hasCheckpoint ? 'previous-ai' : null,
                forkedFromMessageId: 'edited-input',
                status: 'idle',
                metadata: { purpose: 'message-edit', forkGraphRevision: 'revision' }
            })
            expect(source.status).toBe('busy')
            expect(source.headMessageId).toBe('latest-ai')
            expect(conversations.save).toHaveBeenCalledWith(
                expect.objectContaining({ id: 'conversation', threadId: branch.threadId })
            )
            expect(branch.conversation).toMatchObject({ id: 'conversation', threadId: branch.threadId })
            if (hasCheckpoint) {
                expect(checkpoints.findOne).toHaveBeenCalledWith({
                    where: {
                        thread_id: 'ancestor',
                        checkpoint_ns: '',
                        checkpoint_id: 'before-edit',
                        tenantId: 'tenant',
                        organizationId: 'org'
                    }
                })
                expect(checkpoints.create).toHaveBeenCalledWith(
                    expect.objectContaining({ thread_id: branch.threadId, parent_id: null })
                )
            } else expect(checkpoints.findOne).not.toHaveBeenCalled()
            const saves = manager.save.mock.calls.length
            expect(await service.copyThread('source', { beforeMessageId: 'edited-input', requestId: 'request' })).toBe(
                branch
            )
            expect(manager.save).toHaveBeenCalledTimes(saves)
            expect(forkLookup.andWhere).toHaveBeenCalledWith(`thread.metadata ->> 'forkRequestId' = :requestId`, {
                requestId: 'request'
            })
            await expect(service.copyThread('source', { beforeMessageId: 'invisible-input' })).rejects.toBeInstanceOf(
                ConflictException
            )
            await expect(service.copyThread('source', { beforeMessageId: 'first-input' })).rejects.toBeInstanceOf(
                ConflictException
            )
        }
    )
})
