import { TXpertGraph, XpertAgentExecutionStatusEnum } from '@xpert-ai/contracts'
import { randomUUID } from 'node:crypto'
import { DataSource, EntitySchema } from 'typeorm'
import { Annotation, END, START, StateGraph } from '@langchain/langgraph'
import { emptyCheckpoint } from '@langchain/langgraph-checkpoint'
import { CopilotCheckpoint } from './copilot-checkpoint.entity'
import { CopilotCheckpointWrites } from './writes/writes.entity'
import { CopilotCheckpointSaver } from './checkpoint-saver'
import { ChatConversation } from '../chat-conversation/conversation.entity'
import { ChatConversationThread } from '../chat-conversation/conversation-thread.entity'
import { XpertAgentExecution } from '../xpert-agent-execution/agent-execution.entity'
import { ThreadRunControlService } from '../chat-conversation/thread-run-control.service'
import { legacyThreadGraphRevision, threadGraphRevision } from '../chat-conversation/thread-graph-revision'

const url = process.env.XPERT_RECOVERY_TEST_DATABASE_URL
const integration = url ? describe : describe.skip
const text = { type: 'varchar' as const }
const nullable = { ...text, nullable: true }
const json = { type: 'jsonb' as const, nullable: true }
const scope = { tenantId: randomUUID(), organizationId: randomUUID() }
const base = {
    id: { type: 'uuid' as const, primary: true, generated: 'uuid' as const },
    tenantId: text,
    organizationId: text
}
const checkpointColumns = {
    ...base,
    createdById: nullable,
    thread_id: text,
    checkpoint_ns: text,
    checkpoint_id: text,
    type: nullable
}

integration('issue 1217 recovery boundaries / PostgreSQL and real LangGraph', () => {
    const schema = `recovery_${randomUUID().replace(/-/g, '')}`
    let database: DataSource
    let saver: CopilotCheckpointSaver
    let conversationId: string
    let parentThreadId: string
    beforeAll(async () => {
        if (!new URL(url!).pathname.endsWith('_test')) throw new Error('Use a disposable _test database')
        database = new DataSource({
            type: 'postgres',
            uuidExtension: 'pgcrypto',
            url,
            schema,
            extra: { options: `-c search_path=${schema}` },
            entities: [
                new EntitySchema<ChatConversation>({
                    name: 'ChatConversation',
                    target: ChatConversation,
                    tableName: 'chat_conversation',
                    columns: {
                        ...base,
                        threadId: text,
                        workingThreadRevision: { type: 'int', default: 0 },
                        status: text,
                        error: nullable,
                        operation: json,
                        projectId: text,
                        xpertId: text,
                        options: json
                    }
                }),
                new EntitySchema<ChatConversationThread>({
                    name: 'ChatConversationThread',
                    target: ChatConversationThread,
                    tableName: 'chat_conversation_thread',
                    columns: {
                        ...base,
                        threadId: text,
                        conversationId: text,
                        parentThreadId: nullable,
                        status: text,
                        error: nullable,
                        metadata: json,
                        runControl: json
                    }
                }),
                new EntitySchema<XpertAgentExecution>({
                    name: 'XpertAgentExecution',
                    target: XpertAgentExecution,
                    tableName: 'xpert_agent_execution',
                    columns: {
                        ...base,
                        threadId: text,
                        status: text,
                        error: nullable,
                        checkpointId: nullable,
                        checkpointNs: nullable,
                        metadata: json
                    }
                }),
                new EntitySchema<CopilotCheckpoint>({
                    name: 'CopilotCheckpoint',
                    target: CopilotCheckpoint,
                    tableName: 'copilot_checkpoint',
                    columns: {
                        ...checkpointColumns,
                        parent_id: nullable,
                        checkpoint: { type: 'bytea' },
                        metadata: { type: 'bytea' }
                    },
                    uniques: [{ columns: ['organizationId', 'thread_id', 'checkpoint_ns', 'checkpoint_id'] }]
                }),
                new EntitySchema<CopilotCheckpointWrites>({
                    name: 'CopilotCheckpointWrites',
                    target: CopilotCheckpointWrites,
                    tableName: 'copilot_checkpoint_writes',
                    columns: {
                        ...checkpointColumns,
                        task_id: text,
                        idx: { type: 'int' },
                        channel: text,
                        value: { type: 'bytea' }
                    },
                    uniques: [
                        { columns: ['organizationId', 'thread_id', 'checkpoint_ns', 'checkpoint_id', 'task_id', 'idx'] }
                    ]
                })
            ]
        })
        await database.initialize()
        await database.query(`CREATE SCHEMA "${schema}"`)
        await database.synchronize()
        saver = new CopilotCheckpointSaver(
            database.getRepository(CopilotCheckpoint),
            database.getRepository(CopilotCheckpointWrites)
        )
    })
    afterAll(async () => {
        if (database?.isInitialized) {
            await database.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
            await database.destroy()
        }
    })
    beforeEach(async () => {
        conversationId = randomUUID()
        parentThreadId = randomUUID()
        await database.getRepository(ChatConversation).save({
            ...scope,
            id: conversationId,
            threadId: parentThreadId,
            status: 'idle',
            projectId: 'unchanged-project',
            xpertId: 'unchanged-assistant',
            options: { parameters: { input: 'history' } }
        })
    })
    async function candidate(graphRevision = 'graph') {
        const threadId = randomUUID(),
            executionId = randomUUID()
        await database.getRepository(ChatConversationThread).save({
            ...scope,
            threadId,
            conversationId,
            parentThreadId,
            status: 'busy',
            runControl: { state: 'running', executionId, graphRevision },
            metadata: {
                purpose: 'message-edit',
                forkGraphRevision: 'graph',
                editAdmission: {
                    version: 1,
                    state: 'pending',
                    workingThreadId: parentThreadId,
                    workingThreadRevision: 0
                }
            }
        })
        await database
            .getRepository(XpertAgentExecution)
            .save({ ...scope, id: executionId, threadId, status: XpertAgentExecutionStatusEnum.RUNNING })
        return {
            configurable: {
                ...scope,
                userId: randomUUID(),
                thread_id: threadId,
                checkpoint_ns: '',
                executionId,
                rootExecutionId: executionId,
                xpertGraphRevision: graphRevision
            }
        }
    }
    const input = () => ({ ...emptyCheckpoint(), id: randomUUID() })
    const metadata = { source: 'input' as const, step: -1, parents: {} }

    it.each([false, true])(
        'keeps graph admission and checkpoint recovery writes on the same revision (legacy=%s)',
        async (legacy) => {
            const graph: TXpertGraph = {
                nodes: [
                    {
                        key: 'agent',
                        type: 'agent',
                        position: { x: 0, y: 0 },
                        entity: { key: 'agent', prompt: 'same task' }
                    }
                ],
                connections: []
            }
            const stored = legacy ? legacyThreadGraphRevision(graph) : threadGraphRevision(graph)
            const config = await candidate(stored)
            const repository = database.getRepository(ChatConversationThread)
            const row = await repository.findOneByOrFail({ threadId: config.configurable.thread_id })
            await repository.update(row.id, { metadata: { ...row.metadata, forkGraphRevision: stored } })
            const checkpoint = input()
            await saver.put(config, checkpoint, metadata)
            if (!legacy) graph.nodes[0].position.x = 500
            const control = new ThreadRunControlService(repository, database)
            const selected = await control.recordGraph(
                config.configurable.thread_id,
                config.configurable.executionId,
                threadGraphRevision(graph),
                legacyThreadGraphRevision(graph)
            )
            expect(selected).toBe(stored)
            const next = input()
            await saver.put(
                {
                    configurable: { ...config.configurable, xpertGraphRevision: selected, checkpoint_id: checkpoint.id }
                },
                next,
                { source: 'loop', step: 0, parents: {} }
            )
            const execution = await database
                .getRepository(XpertAgentExecution)
                .findOneByOrFail({ id: config.configurable.executionId })
            expect(execution.metadata.recovery).toMatchObject({
                graphRevision: stored,
                input: { checkpointId: checkpoint.id },
                latest: { checkpointId: next.id }
            })
        }
    )

    it('commits checkpoint, execution recovery and branch selection together, without changing workspace identity', async () => {
        const config = await candidate(),
            checkpoint = input()
        await saver.put(config, checkpoint, metadata)
        // Re-read persisted rows; no execution finalizer has run.
        const execution = await database
            .getRepository(XpertAgentExecution)
            .findOneByOrFail({ id: config.configurable.executionId })
        expect(execution.checkpointId).toBe(checkpoint.id)
        expect(execution.metadata.recovery.input.checkpointId).toBe(checkpoint.id)
        expect(await database.getRepository(ChatConversation).findOneByOrFail({ id: conversationId })).toMatchObject({
            threadId: config.configurable.thread_id,
            workingThreadRevision: 1,
            projectId: 'unchanged-project',
            xpertId: 'unchanged-assistant',
            options: { parameters: { input: 'history' } }
        })
    })

    it('admits only one of two competing edits and rolls the losing checkpoint and execution update back', async () => {
        const configs = await Promise.all([candidate(), candidate()])
        const results = await Promise.allSettled(configs.map((config) => saver.put(config, input(), metadata)))
        expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
        const loser = configs[results.findIndex((result) => result.status === 'rejected')]
        expect(
            await database.getRepository(CopilotCheckpoint).countBy({ thread_id: loser.configurable.thread_id })
        ).toBe(0)
        expect(
            (await database.getRepository(XpertAgentExecution).findOneByOrFail({ id: loser.configurable.executionId }))
                .checkpointId
        ).toBeNull()
    })

    it('rejects a workflow changed after copy without selecting the branch or saving a false recovery point', async () => {
        const config = await candidate('changed')
        await expect(saver.put(config, input(), metadata)).rejects.toMatchObject({
            response: { code: 'conversation_graph_changed' }
        })
        expect((await database.getRepository(ChatConversation).findOneByOrFail({ id: conversationId })).threadId).toBe(
            parentThreadId
        )
        expect(
            await database.getRepository(CopilotCheckpoint).countBy({ thread_id: config.configurable.thread_id })
        ).toBe(0)
    })

    it('prepares real graph input before tools and continues it exactly once after admission', async () => {
        const config = await candidate()
        const tool = jest.fn(() => ({ result: 'done' }))
        const graph = new StateGraph(Annotation.Root({ input: Annotation<string>(), result: Annotation<string>() }))
            .addNode('businessTool', tool)
            .addEdge(START, 'businessTool')
            .addEdge('businessTool', END)
            .compile({ checkpointer: saver })
        await graph.invoke({ input: 'approved input' }, { ...config, interruptBefore: '*', durability: 'sync' })
        expect(tool).not.toHaveBeenCalled()
        const execution = await database
            .getRepository(XpertAgentExecution)
            .findOneByOrFail({ id: config.configurable.executionId })
        expect(execution.metadata.recovery.input.checkpointId).toBeTruthy()
        expect((await database.getRepository(ChatConversation).findOneByOrFail({ id: conversationId })).threadId).toBe(
            config.configurable.thread_id
        )
        const result = await graph.invoke(null, config)
        expect(result).toMatchObject({ input: 'approved input', result: 'done' })
        expect(tool).toHaveBeenCalledTimes(1)
    })

    it('never calls business tools if branch admission loses a race', async () => {
        const config = await candidate()
        await database.getRepository(ChatConversation).update(conversationId, { workingThreadRevision: 1 })
        const tool = jest.fn(() => ({}))
        const graph = new StateGraph(Annotation.Root({ input: Annotation<string>() }))
            .addNode('businessTool', tool)
            .addEdge(START, 'businessTool')
            .addEdge('businessTool', END)
            .compile({ checkpointer: saver })
        await expect(
            graph.invoke({ input: 'should not execute' }, { ...config, interruptBefore: '*', durability: 'sync' })
        ).rejects.toMatchObject({ response: { code: 'conversation_branch_selection_changed' } })
        expect(tool).not.toHaveBeenCalled()
        expect((await database.getRepository(ChatConversation).findOneByOrFail({ id: conversationId })).threadId).toBe(
            parentThreadId
        )
    })
})
