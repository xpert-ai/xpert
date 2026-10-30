import { AIMessage, HumanMessage } from '@langchain/core/messages'
import { END, MessagesAnnotation, START, StateGraph } from '@langchain/langgraph'
import { emptyCheckpoint } from '@langchain/langgraph-checkpoint'
import { QueryBus } from '@nestjs/cqrs'
import { ConflictException } from '@nestjs/common'
import { DataSource, EntityManager, Repository } from 'typeorm'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ChatMessage } from '../chat-message/chat-message.entity'
import { branchMessageHash, branchMessagePathHash } from '../chat-message/message-branching'
import { CopilotCheckpointSaver } from '../copilot-checkpoint/checkpoint-saver'
import { CopilotCheckpoint } from '../copilot-checkpoint/copilot-checkpoint.entity'
import { CopilotCheckpointWrites } from '../copilot-checkpoint/writes/writes.entity'
import { ChatConversation } from './conversation.entity'
import { ChatConversationThread } from './conversation-thread.entity'
import { ContextEvidence } from './context-evidence/context-evidence.entity'
import { SideChatForkService } from './side-chat-fork.service'
import { threadGraphRevision } from './thread-run-control.service'
import type { TXpertGraph } from '@xpert-ai/contracts'

function fixture() {
    const graphDefinition = { nodes: [], connections: [] } as TXpertGraph
    const revision = threadGraphRevision(graphDefinition)
    const conversation = Object.assign(new ChatConversation(), {
        id: 'conversation',
        threadId: 'source',
        xpertId: 'assistant'
    })
    const source = Object.assign(new ChatConversationThread(), {
        id: 'source-row',
        threadId: 'source',
        conversationId: conversation.id,
        conversation,
        status: 'busy',
        headMessageId: 'a2',
        tenantId: 'tenant',
        organizationId: 'org',
        createdById: 'user',
        runControl: { executionId: 'run-2', state: 'running' },
        metadata: {}
    })
    const threads: ChatConversationThread[] = [source]
    const messages: ChatMessage[] = []
    const rows: CopilotCheckpoint[] = []
    const writes: CopilotCheckpointWrites[] = []
    const checkpointRepository = {
        find: async ({ where, order, take }: { where: Partial<CopilotCheckpoint>; order?: object; take?: number }) => {
            const found = rows.filter((row) =>
                Object.entries(where).every(([key, value]) => Reflect.get(row, key) === value)
            )
            if (order) found.sort((a, b) => b.checkpoint_id.localeCompare(a.checkpoint_id))
            return take ? found.slice(0, take) : found
        },
        findOne: async ({ where }: { where: Partial<CopilotCheckpoint> }) =>
            rows.find((row) => Object.entries(where).every(([key, value]) => Reflect.get(row, key) === value)),
        create: (input: CopilotCheckpoint) => input,
        save: async (input: CopilotCheckpoint) => {
            rows.push(input)
            return input
        },
        upsert: async (input: CopilotCheckpoint) => {
            const old = rows.find(
                (row) =>
                    row.thread_id === input.thread_id &&
                    row.checkpoint_ns === input.checkpoint_ns &&
                    row.checkpoint_id === input.checkpoint_id
            )
            if (old) Object.assign(old, input)
            else rows.push(input)
        }
    }
    const writeRepository = {
        find: async ({ where }: { where: Partial<CopilotCheckpointWrites> }) =>
            writes.filter((row) => Object.entries(where).every(([key, value]) => Reflect.get(row, key) === value)),
        manager: {
            transaction: async (
                work: (manager: {
                    upsert: (entity: object, input: CopilotCheckpointWrites) => Promise<void>
                }) => Promise<void>
            ) =>
                work({
                    upsert: async (_entity, input) => {
                        writes.push(input)
                    }
                })
        }
    }
    const saver = new CopilotCheckpointSaver(
        checkpointRepository as unknown as Repository<CopilotCheckpoint>,
        writeRepository as unknown as Repository<CopilotCheckpointWrites>
    )
    const threadRepository = {
        createQueryBuilder: () => {
            let requestId: string
            const query = {
                where: () => query,
                andWhere: (_sql: string, params: { requestId?: string }) => {
                    if (params.requestId) requestId = params.requestId
                    return query
                },
                getOne: async () =>
                    threads.find(
                        (thread) =>
                            thread.parentThreadId === source.threadId && thread.metadata.forkRequestId === requestId
                    )
            }
            return query
        },
        findOne: jest.fn(async () => source),
        find: async () => threads,
        create: (input: ChatConversationThread) => input,
        save: jest.fn(async (input: ChatConversationThread) => {
            threads.push(input)
            return input
        })
    }
    const messageRepository = {
        findOne: async ({ where }: { where: { id: string } }) => messages.find((message) => message.id === where.id)
    }
    const manager = {
        getRepository: (entity: object) => {
            if (entity === ChatConversationThread) return threadRepository
            if (entity === ChatMessage) return messageRepository
            if (entity === CopilotCheckpoint) return checkpointRepository
            // These fixtures have no archive references. Resolving the adapter is allowed;
            // an actual archive query would fail against this empty repository double.
            if (entity === ContextEvidence) return {}
            throw new Error('A sealed fork must not read live Goals, writes or run state')
        },
        getTreeRepository: () => ({ findAncestors: async () => messages })
    } as unknown as EntityManager
    let tail = Promise.resolve()
    const dataSource = {
        manager,
        transaction: async (work: (transaction: EntityManager) => Promise<unknown>) => {
            const previous = tail
            let release: () => void
            tail = new Promise<void>((resolve) => {
                release = resolve
            })
            await previous
            const oldRows = rows.slice()
            const oldThreads = threads.slice()
            try {
                return await work(manager)
            } catch (error) {
                rows.splice(0, rows.length, ...oldRows)
                threads.splice(0, threads.length, ...oldThreads)
                throw error
            } finally {
                release!()
            }
        }
    } as unknown as DataSource
    const query = jest.fn(async () => ({ graph: graphDefinition }))
    const service = new SideChatForkService(dataSource, saver, { execute: query } as unknown as QueryBus)
    const sourceConfig = {
        configurable: { thread_id: 'source', tenantId: 'tenant', organizationId: 'org', userId: 'user' }
    }
    async function seal(id: string, parentId: string | null, text: string) {
        const tuple = await saver.getTuple(sourceConfig)
        const ref = { threadId: 'source', checkpointNs: '', checkpointId: tuple!.checkpoint.id }
        const message = Object.assign(new ChatMessage(), {
            id,
            parentId,
            role: 'ai',
            status: 'success',
            content: text,
            conversationId: conversation.id,
            outputCheckpoint: { version: 1, checkpoint: ref, checkpoints: [ref], graphRevision: revision }
        })
        messages.push(message)
        message.outputCheckpoint.messageHash = branchMessageHash(message)
        message.outputCheckpoint.messagePathHash = branchMessagePathHash(messages)
        return message
    }
    return {
        service,
        source,
        threads,
        messages,
        rows,
        writes,
        saver,
        seal,
        sourceConfig,
        query,
        threadRepository,
        revision
    }
}

describe('sealed side-chat forks', () => {
    beforeEach(() => jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user'))
    afterEach(() => jest.restoreAllMocks())
    const request = { mode: 'latest-sealed-reply' as const, requestId: 'request-1' }

    it('forks while the source graph is still running and continues both threads independently', async () => {
        const f = fixture()
        let started: () => void
        let finish: () => void
        const running = new Promise<void>((resolve) => {
            started = resolve
        })
        const gate = new Promise<void>((resolve) => {
            finish = resolve
        })
        let calls = 0
        const graph = new StateGraph(MessagesAnnotation)
            .addNode('answer', async (state) => {
                const input = state.messages.at(-1)!.content
                calls++
                if (input === 'H2') {
                    started!()
                    await gate
                }
                return { messages: [new AIMessage(`answer-${input}`)] }
            })
            .addEdge(START, 'answer')
            .addEdge('answer', END)
            .compile({ checkpointer: f.saver })
        await graph.invoke({ messages: [new HumanMessage('H1')] }, f.sourceConfig)
        f.messages.push(Object.assign(new ChatMessage(), { id: 'h1', parentId: null, role: 'human', content: 'H1' }))
        const first = await f.seal('a1', 'h1', 'answer-H1')
        f.messages.push(
            Object.assign(new ChatMessage(), { id: 'h2', parentId: 'a1', role: 'human', content: 'H2' }),
            Object.assign(new ChatMessage(), {
                id: 'a2',
                parentId: 'h2',
                role: 'ai',
                status: 'running',
                content: 'partial'
            })
        )
        const sourceRun = graph.invoke({ messages: [new HumanMessage('H2')] }, f.sourceConfig)
        await running
        const before = JSON.stringify(f.source)
        let child: ChatConversationThread
        try {
            child = await f.service.copy(f.source, request)
            expect(child).toMatchObject({
                conversationId: 'conversation',
                parentThreadId: 'source',
                headMessageId: first.id,
                forkedFromMessageId: first.id,
                status: 'idle',
                metadata: { forkMode: request.mode, forkRequestId: request.requestId, forkGraphRevision: f.revision }
            })
            expect(JSON.stringify(f.source)).toBe(before)
            expect(child.runControl).toBeUndefined()
            expect(f.writes.filter((write) => write.thread_id === child.threadId)).toEqual([])
            const childConfig = { configurable: { ...f.sourceConfig.configurable, thread_id: child.threadId } }
            const state = await graph.getState(childConfig)
            expect(state.next).toEqual([])
            expect(state.values.messages.map((message: HumanMessage) => message.content)).toEqual(['H1', 'answer-H1'])
            await graph.invoke({ messages: [new HumanMessage('side question')] }, childConfig)
            expect(calls).toBe(3) // H1, the still-running H2, and one new side question; no replay.
            expect(f.source.status).toBe('busy')
        } finally {
            finish!()
            await sourceRun
        }
        expect(
            (await graph.getState(f.sourceConfig)).values.messages.map((message: HumanMessage) => message.content)
        ).toEqual(['H1', 'answer-H1', 'H2', 'answer-H2'])
        expect(f.threads).toHaveLength(2)
    })

    async function completedFixture() {
        const f = fixture()
        const graph = new StateGraph(MessagesAnnotation)
            .addNode('answer', () => ({ messages: [new AIMessage('A1')] }))
            .addEdge(START, 'answer')
            .addEdge('answer', END)
            .compile({ checkpointer: f.saver })
        await graph.invoke({ messages: [new HumanMessage('H1')] }, f.sourceConfig)
        f.messages.push(Object.assign(new ChatMessage(), { id: 'h1', parentId: null, role: 'human', content: 'H1' }))
        const a1 = await f.seal('a1', 'h1', 'A1')
        f.source.headMessageId = a1.id
        return { ...f, a1, graph }
    }

    it('serializes concurrent duplicate requests and retries after the source checkpoint disappears', async () => {
        const f = await completedFixture()
        const [one, two] = await Promise.all([f.service.copy(f.source, request), f.service.copy(f.source, request)])
        expect(one.threadId).toBe(two.threadId)
        expect(f.threadRepository.save).toHaveBeenCalledTimes(1)
        f.rows.splice(0)
        f.messages.splice(0)
        f.source.headMessageId = null
        f.query.mockRejectedValue(new Error('Workflow no longer available'))
        expect((await f.service.copy(f.source, request)).threadId).toBe(one.threadId)
    })

    it('selects the newest sealed ancestor and excludes provisional and sibling replies', async () => {
        const f = await completedFixture()
        await f.graph.invoke({ messages: [new HumanMessage('H2')] }, f.sourceConfig)
        f.messages.push(Object.assign(new ChatMessage(), { id: 'h2', parentId: 'a1', role: 'human', content: 'H2' }))
        const a2 = await f.seal('a2', 'h2', 'A2')
        f.messages.push(
            Object.assign(new ChatMessage(), {
                id: 'provisional',
                parentId: 'a2',
                role: 'ai',
                status: 'success',
                outputCheckpoint: { checkpoint: a2.outputCheckpoint.checkpoint }
            }),
            Object.assign(new ChatMessage(), { ...a2, id: 'sibling', parentId: 'a1' })
        )
        f.source.headMessageId = 'provisional'
        expect((await f.service.copy(f.source, request)).headMessageId).toBe('a2')
    })

    it('copies pinned child namespaces rather than their live latest checkpoint', async () => {
        const f = await completedFixture()
        const config = { configurable: { ...f.sourceConfig.configurable, checkpoint_ns: 'agent:child' } }
        const pinned = { ...emptyCheckpoint(), channel_values: { result: 'sealed result' } }
        const metadata = { source: 'loop' as const, step: 1, parents: {} }
        await f.saver.put(config, pinned, metadata)
        f.a1.outputCheckpoint.checkpoints.push({
            threadId: 'source',
            checkpointNs: 'agent:child',
            checkpointId: pinned.id
        })
        await f.saver.put(config, { ...emptyCheckpoint(), channel_values: { result: 'live result' } }, metadata)
        const child = await f.service.copy(f.source, request)
        const copied = await f.saver.getTuple({
            configurable: { ...config.configurable, thread_id: child.threadId }
        })
        expect(copied?.checkpoint.channel_values).toMatchObject({ result: 'sealed result' })
        expect((await f.saver.getTuple(config))?.checkpoint.channel_values).toMatchObject({ result: 'live result' })
    })

    it('revalidates the sealed prefix while permitting later source messages during preflight', async () => {
        const f = await completedFixture()
        f.query.mockImplementationOnce(async () => {
            f.messages.push(
                Object.assign(new ChatMessage(), { id: 'later', parentId: 'a1', role: 'human', content: 'H2' })
            )
            f.source.headMessageId = 'later'
            return { graph: { nodes: [], connections: [] } as TXpertGraph }
        })
        expect((await f.service.copy(f.source, request)).headMessageId).toBe('a1')
        expect(f.source.headMessageId).toBe('later')
        const invalid = await completedFixture()
        invalid.query.mockImplementationOnce(async () => {
            invalid.a1.outputCheckpoint.options = { sandboxEnvironmentId: 'changed' }
            return { graph: { nodes: [], connections: [] } as TXpertGraph }
        })
        await expect(invalid.service.copy(invalid.source, request)).rejects.toBeInstanceOf(ConflictException)
        expect(invalid.threads).toHaveLength(1)
    })

    it.each(['busy', 'idle', 'pausing', 'paused', 'interrupted', 'error'] as const)(
        'uses the sealed boundary without changing a %s source',
        async (status) => {
            const f = await completedFixture()
            f.source.status = status
            await f.service.copy(f.source, request)
            expect(f.source.status).toBe(status)
            expect(f.source.conversation.threadId).toBe('source')
        }
    )

    it('reports the missing sealed boundary without creating an empty branch', async () => {
        const f = fixture()
        await expect(f.service.copy(f.source, request)).rejects.toMatchObject({
            response: { code: 'side_chat_checkpoint_unavailable' }
        })
        expect(f.threadRepository.save).not.toHaveBeenCalled()
    })

    it.each(['path', 'checkpoint', 'foreign-checkpoint', 'graph'] as const)(
        'rejects an invalid %s and leaves no partial fork',
        async (kind) => {
            const f = await completedFixture()
            if (kind === 'path') f.messages[0].content = 'changed'
            if (kind === 'checkpoint') f.rows.splice(0)
            if (kind === 'foreign-checkpoint') f.a1.outputCheckpoint.checkpoint.threadId = 'foreign'
            if (kind === 'graph') f.a1.outputCheckpoint.graphRevision = 'old'
            const rowCount = f.rows.length
            await expect(f.service.copy(f.source, request)).rejects.toBeInstanceOf(ConflictException)
            expect(f.threads).toHaveLength(1)
            expect(f.rows).toHaveLength(rowCount)
        }
    )

    it('rejects reuse of an edit or legacy copy request key', async () => {
        const f = await completedFixture()
        f.threads.push(
            Object.assign(new ChatConversationThread(), {
                parentThreadId: 'source',
                metadata: { purpose: 'message-edit', forkRequestId: request.requestId }
            })
        )
        await expect(f.service.copy(f.source, request)).rejects.toMatchObject({
            response: { code: 'request_conflict' }
        })
    })
})
