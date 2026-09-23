import { MemorySaver } from '@langchain/langgraph-checkpoint'
import { RequestContext } from '@xpert-ai/server-core'
import { DataSource, EntityManager, EntitySchema } from 'typeorm'
import { QueryBus } from '@nestjs/cqrs'
import { randomUUID } from 'node:crypto'
import { init } from 'i18next'
import en from '../i18n/en.json'
import { ChatConversation } from './conversation.entity'
import { ChatConversationThread } from './conversation-thread.entity'
import { ChatMessage } from '../chat-message/chat-message.entity'
import { ConversationBranchService } from './conversation-branch.service'
import { ChatConversationService } from './conversation.service'
import { ChatConversationThreadService } from './conversation-thread.service'
import { ChatMessageService } from '../chat-message/chat-message.service'
import { PublishedXpertAccessService } from '../xpert/published-xpert-access.service'
import { XpertProjectService } from '../xpert-project/project.service'
import { FileAssetAccessService } from '../file-understanding/file-asset-access.service'
import { ConversationFileLink } from '../file-understanding/entities/conversation-file-link.entity'
import { CopilotCheckpointSaver } from '../copilot-checkpoint/checkpoint-saver'
import { branchMessageHash, branchMessagePathHash } from '../chat-message/message-branching'
import { threadGraphRevision } from './thread-run-control.service'
import { copyBranchCheckpoints } from './branch-checkpoints'

jest.mock('../ai/public-xpert-principal', () => ({
    assertPublicXpertSessionConversationAccess: jest.fn().mockResolvedValue(undefined)
}))
jest.mock('./branch-checkpoints', () => ({
    ...jest.requireActual('./branch-checkpoints'),
    copyBranchCheckpoints: jest.fn().mockResolvedValue(2)
}))

type FixtureOptions = {
    read?: () => Promise<void>
    query?: (sql: string, parameters: unknown[]) => Promise<unknown>
    transaction?: (run: () => Promise<ChatConversation>) => Promise<ChatConversation>
    saveMessage?: (message: ChatMessage) => Promise<void>
    beforeTransaction?: () => void
}

function fixture(options: FixtureOptions = {}) {
    let inTransaction = false
    const serviceRead = async () => {
        if (options.read) return options.read()
        if (inTransaction) throw new Error('Service read requested another connection during the transaction')
    }
    const source = Object.assign(new ChatConversation(), {
        id: randomUUID(),
        threadId: 'source',
        xpertId: 'assistant',
        projectId: 'project',
        tenantId: 'tenant',
        organizationId: 'org',
        createdById: 'user',
        title: 'Original'
    })
    const graph = { nodes: [], connections: [] }
    const reference = { threadId: 'source', checkpointNs: '', checkpointId: 'checkpoint-a1' }
    const h1 = Object.assign(new ChatMessage(), {
        id: randomUUID(),
        conversationId: source.id,
        parentId: null,
        role: 'human',
        content: 'H1',
        createdAt: new Date('2026-09-20T10:00:00.000Z'),
        updatedAt: new Date('2026-09-20T10:00:01.000Z')
    })
    const a1 = Object.assign(new ChatMessage(), {
        id: randomUUID(),
        conversationId: source.id,
        parentId: h1.id,
        role: 'ai',
        status: 'success',
        content: 'A1',
        createdAt: new Date('2026-09-20T10:00:02.000Z'),
        updatedAt: new Date('2026-09-20T10:00:12.000Z')
    })
    a1.outputCheckpoint = {
        version: 1,
        checkpoint: reference,
        checkpoints: [reference],
        graphRevision: threadGraphRevision(graph),
        messageHash: branchMessageHash(a1),
        messagePathHash: branchMessagePathHash([h1, a1]),
        options: { knowledgebases: ['kb'] },
        agentRuns: [{ id: 'old-execution', status: 'success' }]
    }
    const h2 = Object.assign(new ChatMessage(), {
        id: randomUUID(),
        conversationId: source.id,
        parentId: a1.id,
        role: 'human',
        content: 'H2'
    })
    const a2 = Object.assign(new ChatMessage(), {
        id: randomUUID(),
        conversationId: source.id,
        parentId: h2.id,
        role: 'ai',
        content: 'A2'
    })
    const sourceThread = Object.assign(new ChatConversationThread(), {
        id: 'source-row',
        threadId: source.threadId,
        conversationId: source.id,
        headMessageId: a2.id,
        status: 'busy'
    })
    const savedConversations: ChatConversation[] = []
    const savedMessages: ChatMessage[] = []
    const savedThreads: ChatConversationThread[] = []
    const savedLinks: ConversationFileLink[] = []
    const linkRepository = {
        findOne: jest.fn(async () => ({ storageFileId: 'storage-file' })),
        create: (input: Partial<ConversationFileLink>) => Object.assign(new ConversationFileLink(), input),
        save: jest.fn(async (input: ConversationFileLink) => {
            savedLinks.push(input)
            return input
        })
    }
    const lookup = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn(async () => savedConversations),
        getOne: jest.fn(async () => savedConversations[0] ?? null)
    }
    const conversationRepository = {
        createQueryBuilder: () => lookup,
        create: (value: Partial<ChatConversation>) => Object.assign(new ChatConversation(), value),
        save: jest.fn(async (value: ChatConversation) => {
            savedConversations.push(value)
            return value
        })
    }
    const messageRepository = {
        findOne: jest.fn(
            async ({ where }: { where: { id: string } }) =>
                [h1, a1, h2, a2].find((message) => message.id === where.id) ?? null
        ),
        find: jest.fn(async () => [a1, h1]),
        create: (value: Partial<ChatMessage>) => Object.assign(new ChatMessage(), value),
        save: jest.fn(async (value: ChatMessage) => {
            await options.saveMessage?.(value)
            savedMessages.push(value)
            return value
        })
    }
    const threadRepository = {
        findOne: jest.fn(async () => sourceThread),
        find: jest.fn(async () => [sourceThread]),
        create: (value: Partial<ChatConversationThread>) => Object.assign(new ChatConversationThread(), value),
        save: jest.fn(async (value: ChatConversationThread) => {
            savedThreads.push(value)
            return value
        })
    }
    const manager = {
        query: jest.fn(async (sql: string, parameters: unknown[]) => options.query?.(sql, parameters)),
        getRepository: (entity: unknown) =>
            entity === ConversationFileLink
                ? linkRepository
                : entity === ChatConversation
                  ? conversationRepository
                  : entity === ChatMessage
                    ? messageRepository
                    : threadRepository,
        getTreeRepository: () => ({ findAncestors: async () => [a2, h1, h2, a1] })
    } as unknown as EntityManager
    const transaction = jest.fn(async (run: (manager: EntityManager) => Promise<ChatConversation>) => {
        options.beforeTransaction?.()
        inTransaction = true
        try {
            return options.transaction ? await options.transaction(() => run(manager)) : await run(manager)
        } catch (error) {
            savedConversations.length = savedMessages.length = savedThreads.length = savedLinks.length = 0
            throw error
        } finally {
            inTransaction = false
        }
    })
    const assertAccess = jest.fn(async () => source)
    const assertProject = jest.fn().mockResolvedValue(undefined)
    const assertAssistant = jest.fn().mockResolvedValue({})
    const authorizeFiles = jest.fn(async (message: ChatMessage) => {
        await serviceRead()
        return message
    })
    const resolveFile = jest.fn(async () => {
        await serviceRead()
        return {}
    })
    const assertFileLink = jest.fn(serviceRead)
    const workflow = jest.fn(async () => {
        await serviceRead()
        return { graph }
    })
    const service = new ConversationBranchService(
        { transaction, manager } as unknown as DataSource,
        { assertAccess } as unknown as ChatConversationService,
        { requireByThreadId: async () => sourceThread } as unknown as ChatConversationThreadService,
        { filterAuthorizedFileRelations: authorizeFiles } as unknown as ChatMessageService,
        { getAccessiblePublishedXpert: assertAssistant } as unknown as PublishedXpertAccessService,
        { assertRuntimeAccess: assertProject } as unknown as XpertProjectService,
        {
            resolve: resolveFile,
            assertCanLinkToConversation: assertFileLink
        } as unknown as FileAssetAccessService,
        { serde: new MemorySaver().serde } as CopilotCheckpointSaver,
        { execute: workflow } as unknown as QueryBus
    )
    return {
        savedLinks,
        resolveFile,
        assertFileLink,
        workflow,
        messageRepository,
        threadRepository,
        linkRepository,
        service,
        source,
        sourceThread,
        h1,
        a1,
        a2,
        transaction,
        assertAccess,
        assertProject,
        assertAssistant,
        authorizeFiles,
        savedConversations,
        savedMessages,
        savedThreads,
        lookup,
        manager,
        input: { sourceThreadId: source.threadId, afterMessageId: a1.id, requestId: randomUUID() }
    }
}

beforeAll(async () => {
    await init({ lng: 'en', resources: { en: { 'server-ai': en } } })
})

describe('ConversationBranchService', () => {
    it('rejects a transcript whose earlier human message was edited after the sealed checkpoint', async () => {
        const test = fixture()
        test.h1.content = 'Changed after the run'
        await expect(test.service.branch(test.source.id, test.input)).rejects.toThrow()
        expect(copyBranchCheckpoints).not.toHaveBeenCalled()
    })
    it('rebuilds sealed file grants for the new conversation and rejects inaccessible files', async () => {
        const test = fixture()
        test.a1.outputCheckpoint.fileAssetIds = ['asset-at-completion']
        const target = await test.service.branch(test.source.id, test.input)
        expect(test.savedLinks).toEqual([
            expect.objectContaining({
                conversationId: target.id,
                threadId: target.threadId,
                fileAssetId: 'asset-at-completion',
                storageFileId: 'storage-file'
            })
        ])
        expect(test.resolveFile).toHaveBeenCalledWith({
            locator: { fileAssetId: 'asset-at-completion' },
            authority: { kind: 'conversation', conversationId: test.source.id },
            operation: 'read'
        })
        const denied = fixture()
        denied.a1.outputCheckpoint.fileAssetIds = ['revoked']
        denied.resolveFile.mockRejectedValue(new Error('Forbidden'))
        await expect(denied.service.branch(denied.source.id, denied.input)).rejects.toThrow('Forbidden')
        expect(denied.savedConversations).toHaveLength(0)
        expect(denied.savedMessages).toHaveLength(0)
    })

    beforeEach(() => {
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user')
        jest.mocked(copyBranchCheckpoints).mockReset().mockResolvedValue(2)
    })
    afterEach(() => jest.restoreAllMocks())

    it('preserves both human and assistant history timestamps', async () => {
        const test = fixture()
        await test.service.branch(test.source.id, test.input)
        expect(test.savedMessages.map(({ createdAt, updatedAt }) => ({ createdAt, updatedAt }))).toEqual(
            [test.h1, test.a1].map(({ createdAt, updatedAt }) => ({ createdAt, updatedAt }))
        )
    })

    it('completes workflow and file authorization without borrowing a connection inside the transaction', async () => {
        const test = fixture()
        test.a1.outputCheckpoint.fileAssetIds = ['sealed-file']
        await test.service.branch(test.source.id, test.input)
        for (const read of [test.workflow, test.authorizeFiles, test.resolveFile, test.assertFileLink]) {
            expect(read).toHaveBeenCalled()
            expect(Math.max(...read.mock.invocationCallOrder)).toBeLessThan(
                test.transaction.mock.invocationCallOrder[0]
            )
        }
        expect(test.savedLinks).toHaveLength(1)
    })

    it.each(['text', 'checkpoint', 'attachments'] as const)(
        'rejects %s changes between preflight and the locked snapshot',
        async (change) => {
            const test = fixture({
                beforeTransaction: () => {
                    if (change === 'text') test.h1.content = 'Edited concurrently'
                    if (change === 'checkpoint') test.a1.outputCheckpoint.fileAssetIds = ['new-unverified-file']
                    if (change === 'attachments') test.h1.attachments = [{ id: 'new-attachment', file: 'new.txt' }]
                }
            })
            await expect(test.service.branch(test.source.id, test.input)).rejects.toThrow()
            expect(copyBranchCheckpoints).not.toHaveBeenCalled()
            expect(test.savedConversations).toHaveLength(0)
        }
    )

    it('rolls back if a file link disappears after authorization', async () => {
        const test = fixture()
        test.a1.outputCheckpoint.fileAssetIds = ['sealed-file']
        test.linkRepository.findOne.mockResolvedValue(null)
        await expect(test.service.branch(test.source.id, test.input)).rejects.toThrow()
        expect(test.savedConversations).toHaveLength(0)
        expect(test.savedMessages).toHaveLength(0)
        expect(test.savedLinks).toHaveLength(0)
    })

    it('allows the source to append messages after the selected boundary during preflight', async () => {
        const test = fixture({
            beforeTransaction: () => {
                test.sourceThread.headMessageId = test.a2.id
            }
        })
        test.sourceThread.headMessageId = test.a1.id
        await test.service.branch(test.source.id, test.input)
        expect(test.savedMessages.map((message) => message.content)).toEqual(['H1', 'A1'])
    })

    it('ignores differences in attachment hydration order when checking the locked snapshot', async () => {
        const test = fixture({
            beforeTransaction: () => {
                test.h1.attachments.reverse()
            }
        })
        test.h1.attachments = [
            { id: 'first', file: 'first.txt' },
            { id: 'second', file: 'second.txt' }
        ]
        await test.service.branch(test.source.id, test.input)
        expect(test.savedMessages[0].attachments).toHaveLength(2)
    })

    it('checks for a concurrent successful request again under the thread lock', async () => {
        const test = fixture()
        const concurrent = Object.assign(new ChatConversation(), {
            id: randomUUID(),
            organizationId: test.source.organizationId,
            branchSource: {
                conversationId: test.source.id,
                threadId: test.input.sourceThreadId,
                messageId: test.input.afterMessageId,
                requestId: test.input.requestId
            }
        })
        test.lookup.getOne.mockResolvedValueOnce(null).mockResolvedValueOnce(concurrent)
        expect(await test.service.branch(test.source.id, test.input)).toBe(concurrent)
        expect(test.transaction).toHaveBeenCalledTimes(1)
        expect(test.savedConversations).toHaveLength(0)
        expect(copyBranchCheckpoints).not.toHaveBeenCalled()
    })

    it('returns an existing branch without rerunning obsolete snapshot and file checks', async () => {
        const test = fixture()
        const target = await test.service.branch(test.source.id, test.input)
        test.a1.outputCheckpoint = null
        test.workflow.mockRejectedValue(new Error('Workflow changed'))
        test.authorizeFiles.mockRejectedValue(new Error('File removed'))
        expect(await test.service.branch(test.source.id, test.input)).toBe(target)
        expect(test.transaction).toHaveBeenCalledTimes(1)
    })

    it('creates an independent prefix and thread while the source continues running', async () => {
        const test = fixture()
        test.a1.taskSummary = { version: 1, plan: { title: 'Plan', excerpt: 'Saved plan', messageId: test.a1.id } }
        const target = await test.service.branch(test.source.id, test.input)
        expect(target.id).not.toBe(test.source.id)
        expect(target.threadId).not.toBe('source')
        expect(target).toMatchObject({
            title: 'Original (2)',
            status: 'idle',
            xpertId: 'assistant',
            projectId: 'project',
            options: { knowledgebases: ['kb'] },
            branchSource: { messageId: test.a1.id }
        })
        expect(test.savedMessages.map((message) => message.content)).toEqual(['H1', 'A1'])
        expect(test.savedMessages[1].parent?.id).toBe(test.savedMessages[0].id)
        expect(test.savedMessages[1].taskSummary.plan.messageId).toBe(test.savedMessages[1].id)
        expect(
            test.savedMessages.every(
                (message) =>
                    message.conversationId === target.id &&
                    message.createdInThreadId === target.threadId &&
                    !message.executionId
            )
        ).toBe(true)
        expect(test.savedMessages[1].outputCheckpoint?.checkpoint.threadId).toBe(target.threadId)
        expect(test.savedMessages[1].historicalAgentRuns).toEqual([{ id: 'old-execution', status: 'success' }])
        expect(test.savedThreads[0]).toMatchObject({
            headMessageId: test.savedMessages[1].id,
            metadata: { primary: true }
        })
        expect(test.savedThreads[0].parentThreadId).toBeUndefined()
        expect(test.sourceThread.status).toBe('busy')
        expect(test.source.threadId).toBe('source')
        expect(test.assertAccess).toHaveBeenCalledWith(test.source.id, 'contribute')
        expect(test.assertProject).toHaveBeenCalledWith('project', 'assistant')
    })

    it('returns the same target on retry and rejects reusing the identity for another message', async () => {
        const test = fixture()
        const target = await test.service.branch(test.source.id, test.input)
        expect(await test.service.branch(test.source.id, test.input)).toBe(target)
        expect(test.savedConversations).toHaveLength(1)
        expect(target.branchSource.naming.number).toBe(2)
        expect(test.manager.query).toHaveBeenCalledTimes(1)
        expect(copyBranchCheckpoints).toHaveBeenCalledTimes(1)
        await expect(
            test.service.branch(test.source.id, { ...test.input, afterMessageId: test.h1.id })
        ).rejects.toThrow()
    })

    it('rejects a thread from another conversation before opening a write transaction', async () => {
        const test = fixture()
        test.sourceThread.conversationId = randomUUID()
        await expect(test.service.branch(test.source.id, test.input)).rejects.toThrow()
        expect(test.transaction).not.toHaveBeenCalled()
    })

    it('rejects changed workflows and messages without a sealed boundary', async () => {
        const test = fixture()
        test.a1.outputCheckpoint!.graphRevision = 'old-workflow'
        await expect(test.service.branch(test.source.id, test.input)).rejects.toThrow()
        test.a1.outputCheckpoint = null
        await expect(test.service.branch(test.source.id, test.input)).rejects.toThrow()
        expect(copyBranchCheckpoints).not.toHaveBeenCalled()
        expect(test.savedConversations).toHaveLength(0)
    })

    it('does not leave a partial conversation when checkpoint copying fails', async () => {
        const test = fixture()
        jest.mocked(copyBranchCheckpoints).mockRejectedValue(new Error('Missing checkpoint'))
        await expect(test.service.branch(test.source.id, test.input)).rejects.toThrow('Missing checkpoint')
        expect(test.savedConversations).toHaveLength(0)
        expect(test.savedMessages).toHaveLength(0)
        expect(test.savedThreads).toHaveLength(0)
    })

    it('propagates source authorization failures and validates request ids', async () => {
        const test = fixture()
        test.assertAccess.mockRejectedValue(new Error('Forbidden'))
        await expect(test.service.branch(test.source.id, test.input)).rejects.toThrow('Forbidden')
        await expect(test.service.branch(test.source.id, { ...test.input, requestId: '' })).rejects.toThrow()
        expect(test.transaction).not.toHaveBeenCalled()
    })
})

// Opt-in and isolated from the platform database, including the single-connection pool.
const connectionString = process.env.CHATKIT_BRANCH_TEST_DATABASE_URL
const postgres = connectionString ? describe : describe.skip
postgres('conversation branching with one PostgreSQL connection', () => {
    const schema = `branch_pool_${randomUUID().replace(/-/g, '')}`
    const timestamps = new EntitySchema<Pick<ChatMessage, 'id' | 'createdAt' | 'updatedAt'>>({
        name: 'BranchMessageTimestamps',
        columns: {
            id: { type: 'uuid', primary: true },
            createdAt: { type: 'timestamptz', createDate: true },
            updatedAt: { type: 'timestamptz', updateDate: true }
        }
    })
    const database = new DataSource({
        type: 'postgres',
        url: connectionString,
        schema,
        entities: [timestamps],
        extra: { max: 1, connectionTimeoutMillis: 750 }
    })
    beforeAll(async () => {
        await database.initialize()
        await database.query(`CREATE SCHEMA "${schema}"`)
        await database.synchronize()
    })
    afterAll(async () => {
        if (database.isInitialized) {
            try {
                await database.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
            } finally {
                await database.destroy()
            }
        }
    })
    afterEach(() => jest.restoreAllMocks())

    it('finishes concurrent retries with authorized files and persists the original timestamps', async () => {
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user')
        jest.mocked(copyBranchCheckpoints).mockReset().mockResolvedValue(2)
        let transactionManager: EntityManager | undefined
        const test = fixture({
            read: async () => {
                await database.query('SELECT 1')
            },
            query: (sql, parameters) => transactionManager!.query(sql, parameters),
            transaction: (run) =>
                database.transaction(async (manager) => {
                    transactionManager = manager
                    try {
                        return await run()
                    } finally {
                        transactionManager = undefined
                    }
                }),
            saveMessage: async (message) => {
                await transactionManager!.getRepository(timestamps).save({
                    id: message.id,
                    createdAt: message.createdAt,
                    updatedAt: message.updatedAt
                })
            }
        })
        test.a1.outputCheckpoint.fileAssetIds = ['sealed-file']
        const targets = await Promise.all([
            test.service.branch(test.source.id, test.input),
            test.service.branch(test.source.id, test.input)
        ])
        expect(targets[0].id).toBe(targets[1].id)
        expect(test.savedConversations).toHaveLength(1)
        expect(test.savedLinks).toHaveLength(1)
        expect(test.resolveFile).toHaveBeenCalled()
        expect(test.assertFileLink).toHaveBeenCalled()
        const restored = await database.getRepository(timestamps).find({ order: { createdAt: 'ASC' } })
        expect(restored.map(({ createdAt, updatedAt }) => ({ createdAt, updatedAt }))).toEqual(
            [test.h1, test.a1].map(({ createdAt, updatedAt }) => ({ createdAt, updatedAt }))
        )
    })
})
