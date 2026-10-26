import { ThreadControlProjection } from '../../chat-conversation/control-view/thread-control-projection.entity'
import { randomUUID } from 'node:crypto'
import { EntitySchema } from 'typeorm'
import { Annotation, Command, END, MemorySaver, START, StateGraph, interrupt } from '@langchain/langgraph'
import { DynamicTool } from '@langchain/core/tools'
import { withTaskControl } from '@xpert-ai/server-core'
import { mcpTestDatabase } from '../../mcp-publication/testing/database'
import { publication } from '../../mcp-publication/testing/fixtures'
import { until } from '../../mcp-publication/testing/harness'
import { ThreadRunControlService } from '../../chat-conversation/thread-run-control.service'
import { ChatConversationThread } from '../../chat-conversation/conversation-thread.entity'
import { ChatConversation } from '../../chat-conversation/conversation.entity'
import { ExecutionControlStore } from '../../execution-control/execution-control.store'
import { ExecutionControl } from '../../execution-control/execution-control.entity'
import { executionToolReceipts } from '../../execution-control/adapters/execution-tool-receipts'
import { installThreadPauseGuards } from '../../shared/agent/thread-pause'
import { McpRemoteOperation } from './mcp-operation.entity'
import { ExecuteMcpOperationCommand } from './mcp-operation.command'
import { httpPair } from './testing/http-pair'

const url = process.env.XPERT_PAUSE_TEST_DATABASE_URL
const integration = url ? describe : describe.skip
const scopeColumns = {
    id: { type: 'uuid' as const, primary: true },
    tenantId: { type: 'uuid' as const },
    organizationId: { type: 'uuid' as const }
}
integration('MCP actual graph input continuation and conversation settlement', () => {
    let database: Awaited<ReturnType<typeof mcpTestDatabase>>,
        pair: Awaited<ReturnType<typeof httpPair>>,
        control: ThreadRunControlService,
        executionControls: ExecutionControlStore
    let threadId: string, executionId: string
    beforeAll(async () => {
        database = await mcpTestDatabase(url, [
            ThreadControlProjection,
            McpRemoteOperation,
            ExecutionControl,
            new EntitySchema<ChatConversationThread>({
                name: 'ChatConversationThread',
                target: ChatConversationThread,
                tableName: 'chat_conversation_thread',
                columns: {
                    ...scopeColumns,
                    threadId: { type: 'varchar' },
                    conversationId: { type: 'uuid' },
                    status: { type: 'varchar' },
                    error: { type: 'varchar', nullable: true },
                    metadata: { type: 'jsonb', nullable: true },
                    runtimeContinuationBlockedAt: { type: 'timestamptz', nullable: true },
                    runControl: { type: 'jsonb', nullable: true },
                    encryptedRunContext: { type: 'varchar', nullable: true, select: false },
                    operation: { type: 'jsonb', nullable: true }
                }
            }),
            new EntitySchema<ChatConversation>({
                name: 'ChatConversation',
                target: ChatConversation,
                tableName: 'chat_conversation',
                columns: {
                    ...scopeColumns,
                    threadId: { type: 'varchar' },
                    status: { type: 'varchar' },
                    error: { type: 'varchar', nullable: true },
                    operation: { type: 'jsonb', nullable: true }
                }
            })
        ])
    })
    beforeEach(async () => {
        await database.db.query(
            'TRUNCATE mcp_task,mcp_remote_operation,execution_control,execution_task_control,execution_task_publication,chat_conversation_thread,chat_conversation'
        )
        pair = await httpPair(database.db)
        executionControls = new ExecutionControlStore(database.db, pair.publisher.controls)
        control = new ThreadRunControlService(
            database.db.getRepository(ChatConversationThread),
            database.db,
            executionControls
        )
        threadId = randomUUID()
        executionId = randomUUID()
        const conversationId = randomUUID(),
            scope = { tenantId: publication().tenantId, organizationId: publication().organizationId }
        await database.db
            .getRepository(ChatConversation)
            .save({ ...scope, id: conversationId, threadId, status: 'busy' })
        await database.db
            .getRepository(ChatConversationThread)
            .save({ ...scope, id: randomUUID(), conversationId, threadId, status: 'busy' })
        await control.start(threadId, executionId)
    })
    afterEach(async () => {
        control.onModuleDestroy()
        await pair.close()
    })
    afterAll(async () => database.close())

    it.each(['running', 'pause-before', 'pause-after', 'terminate'])(
        'preserves MCP input ownership through an actual graph interrupt (%s)',
        async (mode) => {
            const paused = mode.startsWith('pause-')
            let writes = 0,
                nextNodes = 0
            pair.publisher.runtime.executeTool.mockImplementation(async (request) => {
                writes++
                await request.host.input.request({
                    type: 'form',
                    title: 'Approve',
                    schema: { type: 'object', properties: { approved: { type: 'boolean' } }, required: ['approved'] }
                })
                return { content: [{ type: 'text', text: 'done' }] }
            })
            const target = await pair.publisher.controls.execution(executionId)
            const tool = new DynamicTool({
                name: 'remote',
                description: 'MCP approval fixture',
                func: async () => {
                    await pair.operations.execute(
                        new ExecuteMcpOperationCommand({
                            ...pair.input,
                            input: async () => ({ action: 'accept', content: interrupt({ approved: false }) })
                        })
                    )
                    return 'done'
                }
            })
            const state = Annotation.Root({ done: Annotation<boolean> })
            const builder = new StateGraph(state)
                .addNode('approval', async () => {
                    await tool.invoke('')
                    return { done: true }
                })
                .addNode('next', async () => {
                    nextNodes++
                    return { done: true }
                })
                .addEdge(START, 'approval')
                .addEdge('approval', 'next')
                .addEdge('next', END)
            installThreadPauseGuards(builder.nodes, (node) => control.shouldPause(threadId, executionId, node))
            const graph = builder.compile({ checkpointer: new MemorySaver() })
            const config = {
                configurable: { thread_id: threadId },
                callbacks: [executionToolReceipts(executionControls, executionId)],
                metadata: { executionId }
            }
            const invoke = (input: Parameters<typeof graph.invoke>[0]) =>
                withTaskControl({ version: 2, targetId: target.id }, () => graph.invoke(input, config))
            const first = invoke({ done: false })
            await until(() => pair.publisher.queue.enqueue.mock.calls.length === 1)
            const worker = pair.publisher.service.process(pair.publisher.queue.enqueue.mock.calls[0][0].payload)
            await first
            await control.stageInput(threadId, executionId, ['approval'])
            if (mode === 'pause-before') await control.requestPause(threadId, executionId)
            expect(await control.finish(threadId, executionId, 'interrupted', null, { tasks: [] })).toBe('interrupted')
            expect((await control.get(threadId)).state).toBe('input_wait')
            // Repeated wrapper finalizers cannot clear this owner or its remote task.
            await control.finish(threadId, executionId, 'interrupted')
            await expect(control.start(threadId, randomUUID())).rejects.toThrow()
            if (mode === 'terminate') {
                await control.cancel(threadId, [executionId])
                await until(async () => {
                    await pair.operations.reconcile()
                    return (await database.db.getRepository(McpRemoteOperation).find())[0].record.phase === 'settled'
                })
                await worker
                expect(await control.finish(threadId, executionId, 'interrupted')).toBe('interrupted')
                await expect(control.start(threadId, executionId)).rejects.toThrow()
                expect(writes).toBe(1)
                expect(nextNodes).toBe(0)
                expect(pair.requests.filter((x) => x === 'tools/call')).toHaveLength(1)
                return
            }
            if (mode === 'pause-after') await control.requestPause(threadId, executionId)
            await control.start(threadId, executionId)
            await invoke(new Command({ resume: { approved: true } }))
            await worker
            if (paused) {
                expect(nextNodes).toBe(0)
                await control.stageCheckpoint(threadId, executionId, {
                    threadId,
                    checkpointNs: '',
                    checkpointId: 'input-finished'
                })
                await until(async () => (await control.finish(threadId, executionId, 'interrupted')) === 'paused')
            } else {
                await until(async () => (await control.finish(threadId, executionId, 'idle')) === 'idle')
                expect(nextNodes).toBe(1)
            }
            expect(writes).toBe(1)
            expect(pair.requests.filter((x) => x === 'tools/call')).toHaveLength(1)
            expect((await pair.publisher.controls.execution(executionId)).id).toBe(target.id)
            console.log(
                'AFTER_GRAPH_INPUT',
                JSON.stringify({ paused, writes, toolsCall: 1, nextNodes, ownerPreserved: true })
            )
        },
        20000
    )

    it('keeps a normal graph outcome pending until its attached remote work actually settles', async () => {
        const target = await pair.publisher.controls.execution(executionId)
        const child = await pair.publisher.controls.register({
            tenantId: publication().tenantId,
            organizationId: publication().organizationId,
            kind: 'mcp-operation',
            resourceId: randomUUID(),
            parent: { version: 2, targetId: target.id },
            drainOnPause: true
        })
        const claim = await pair.publisher.controls.claim(child.id)
        expect(await control.finish(threadId, executionId, 'idle')).toBe('busy')
        expect((await control.get(threadId)).state).toBe('settling')
        await expect(control.start(threadId, randomUUID())).rejects.toThrow()
        await pair.publisher.controls.receipt(child.id, 'completed', claim)
        expect(await control.finish(threadId, executionId, 'interrupted')).toBe('idle')
        expect(await control.get(threadId)).toBeNull()
    })
})
