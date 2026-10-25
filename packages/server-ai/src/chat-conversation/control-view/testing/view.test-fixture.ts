import { randomUUID } from 'node:crypto'
import { EntitySchema } from 'typeorm'
import { QueryBus } from '@nestjs/cqrs'
import { ForbiddenException } from '@nestjs/common'
import { TaskControlStore } from '@xpert-ai/server-core'
import { TXpertGraph, XpertAgentExecutionStatusEnum } from '@xpert-ai/contracts'
import { mcpTestDatabase } from '../../../mcp-publication/testing/database'
import { publication } from '../../../mcp-publication/testing/fixtures'
import { ChatConversation } from '../../conversation.entity'
import { ChatConversationThread } from '../../conversation-thread.entity'
import { ChatConversationThreadService } from '../../conversation-thread.service'
import { XpertAgentExecution } from '../../../xpert-agent-execution/agent-execution.entity'
import { CopilotCheckpoint } from '../../../copilot-checkpoint/copilot-checkpoint.entity'
import { ExecutionControl } from '../../../execution-control/execution-control.entity'
import { ExecutionControlStore } from '../../../execution-control/execution-control.store'
import { ExecutionControlEvidenceService } from '../../../execution-control/execution-control-evidence.service'
import { ThreadRunControlService } from '../../thread-run-control.service'
import { threadGraphRevision } from '../../thread-graph-revision'
import { ThreadRecoveryService } from '../../recovery/thread-recovery.service'
import { AssertChatConversationAccessQuery } from '../../queries/conversation-assert-access.query'
import { GetXpertWorkflowQuery } from '../../../xpert/queries/get-xpert-workflow.query'
import { ThreadControlProjection } from '../thread-control-projection.entity'
import { ThreadControlViewService } from '../thread-control-view.service'

const uuid = { type: 'uuid' as const }
const text = { type: 'varchar' as const }
const nullable = { ...text, nullable: true }
const scope = { id: { ...uuid, primary: true }, tenantId: uuid, organizationId: uuid }
export async function viewFixture(url: string) {
    const database = await mcpTestDatabase(url, [
        ThreadControlProjection,
        ExecutionControl,
        new EntitySchema<ChatConversationThread>({
            name: 'ChatConversationThread',
            target: ChatConversationThread,
            tableName: 'chat_conversation_thread',
            columns: {
                ...scope,
                threadId: text,
                conversationId: uuid,
                status: text,
                error: nullable,
                metadata: { type: 'jsonb', nullable: true },
                runControl: { type: 'jsonb', nullable: true },
                operation: { type: 'jsonb', nullable: true },
                encryptedRunContext: { ...nullable, select: false },
                runtimeContinuationBlockedAt: { type: 'timestamptz', nullable: true }
            }
        }),
        new EntitySchema<ChatConversation>({
            name: 'ChatConversation',
            target: ChatConversation,
            tableName: 'chat_conversation',
            columns: {
                ...scope,
                threadId: text,
                xpertId: uuid,
                status: text,
                error: nullable,
                operation: { type: 'jsonb', nullable: true }
            }
        }),
        new EntitySchema<XpertAgentExecution>({
            name: 'XpertAgentExecution',
            target: XpertAgentExecution,
            tableName: 'xpert_agent_execution',
            columns: {
                ...scope,
                threadId: text,
                parentId: { ...uuid, nullable: true },
                status: text,
                createdAt: { type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' },
                metadata: { type: 'jsonb', nullable: true },
                checkpointId: nullable,
                checkpointNs: nullable,
                error: nullable
            }
        }),
        new EntitySchema<CopilotCheckpoint>({
            name: 'CopilotCheckpoint',
            target: CopilotCheckpoint,
            tableName: 'copilot_checkpoint',
            columns: {
                ...scope,
                thread_id: text,
                checkpoint_ns: text,
                checkpoint_id: text
            }
        })
    ])
    const db = database.db
    const tenant = { tenantId: publication().tenantId, organizationId: publication().organizationId }
    const threadId = randomUUID(),
        executionId = randomUUID(),
        conversationId = randomUUID()
    const conversation = db.manager.create(ChatConversation, {
        ...tenant,
        id: conversationId,
        xpertId: randomUUID(),
        threadId,
        status: 'idle'
    })
    await db.manager.save(conversation)
    await db.manager.insert(ChatConversationThread, {
        ...tenant,
        id: randomUUID(),
        threadId,
        conversationId,
        status: 'idle',
        metadata: {}
    })
    await db.manager.insert(XpertAgentExecution, {
        ...tenant,
        id: executionId,
        threadId,
        status: XpertAgentExecutionStatusEnum.RUNNING
    })
    const tasks = new TaskControlStore(db)
    const execution = new ExecutionControlStore(db, tasks)
    const control = new ThreadRunControlService(db.getRepository(ChatConversationThread), db, execution)
    const graph: TXpertGraph = { nodes: [], connections: [] }
    await control.start(threadId, executionId)
    await control.recordGraph(threadId, executionId, threadGraphRevision(graph))
    const permissions = { read: true, contribute: true }
    const bus = Object.create(QueryBus.prototype) as QueryBus
    bus.execute = jest.fn(async (query: object) => {
        if (query instanceof AssertChatConversationAccessQuery) {
            if (!permissions.read || (query.operation === 'contribute' && !permissions.contribute))
                throw new ForbiddenException()
            if (query.where.id !== conversationId && query.where.threadId !== threadId) throw new ForbiddenException()
            return conversation
        }
        if (query instanceof GetXpertWorkflowQuery) return { graph }
        throw new Error('Unexpected fixture query')
    })
    const threads = Object.create(ChatConversationThreadService.prototype) as ChatConversationThreadService
    threads.requireByThreadId = jest.fn(async (id: string) => {
        const thread = await db.manager.findOneByOrFail(ChatConversationThread, { threadId: id })
        thread.conversation = conversation
        return thread
    })
    const recovery = Object.create(ThreadRecoveryService.prototype) as ThreadRecoveryService
    recovery.describe = jest.fn(async () => ({ threadId, executionId, canRetry: true }))
    const makeView = (database = db) => {
        const viewTasks = database === db ? tasks : new TaskControlStore(database)
        return new ThreadControlViewService(
            database,
            threads,
            bus,
            viewTasks,
            new ExecutionControlEvidenceService(database, viewTasks),
            recovery
        )
    }
    const views = makeView()
    const pause = async () => {
        const result = await control.requestPause(threadId, executionId)
        const checkpoint = { threadId, checkpointNs: '', checkpointId: randomUUID() }
        await db.manager.insert(CopilotCheckpoint, {
            ...tenant,
            id: randomUUID(),
            thread_id: threadId,
            checkpoint_ns: '',
            checkpoint_id: checkpoint.checkpointId
        })
        await control.stageCheckpoint(threadId, executionId, checkpoint)
        await control.finish(threadId, executionId, 'interrupted')
        return { result, checkpoint }
    }
    return {
        ...database,
        bus,
        threads,
        recovery,
        tenant,
        threadId,
        executionId,
        conversation,
        tasks,
        execution,
        control,
        views,
        makeView,
        permissions,
        graph,
        pause,
        close: async () => {
            control.onModuleDestroy()
            await database.close()
        }
    }
}
