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
import { CopilotCheckpointWrites } from '../../../copilot-checkpoint/writes/writes.entity'
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
import { ChatMessage } from '../../../chat-message/chat-message.entity'
import { AgentInvocationWaitEntity } from '../../../agent-invocation/invocation.entity'
import { AppPlatformDelivery } from '../../../plugin-resource/app-platform/app-platform-delivery.entity'

const uuid = { type: 'uuid' as const }
const text = { type: 'varchar' as const }
const nullable = { ...text, nullable: true }
const scope = {
    id: { ...uuid, primary: true, generated: 'uuid' as const },
    tenantId: uuid,
    organizationId: { ...uuid, nullable: true }
}
export async function viewFixture(url: string) {
    const database = await mcpTestDatabase(url, [
        new EntitySchema<AppPlatformDelivery>({
            name: 'AppPlatformDelivery',
            target: AppPlatformDelivery,
            columns: { ...scope, userId: uuid, configuration: { type: 'jsonb' } }
        }),
        ThreadControlProjection,
        ExecutionControl,
        new EntitySchema<ChatConversationThread>({
            name: 'ChatConversationThread',
            target: ChatConversationThread,
            tableName: 'chat_conversation_thread',
            columns: {
                ...scope,
                threadId: { ...text, unique: true },
                conversationId: uuid,
                createdById: { ...uuid, nullable: true },
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
                createdById: { ...uuid, nullable: true },
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
                createdById: { ...uuid, nullable: true },
                xpertId: { ...uuid, nullable: true },
                agentKey: nullable,
                type: nullable,
                status: text,
                completedAt: { type: 'timestamptz', nullable: true },
                createdAt: { type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' },
                metadata: { type: 'jsonb', nullable: true },
                checkpointId: nullable,
                checkpointNs: nullable,
                error: nullable
            }
        }),
        new EntitySchema<ChatMessage>({
            name: 'ChatMessage',
            target: ChatMessage,
            tableName: 'chat_message',
            columns: {
                ...scope,
                executionId: uuid,
                status: text,
                error: nullable,
                content: { type: 'jsonb', nullable: true }
            }
        }),
        new EntitySchema<AgentInvocationWaitEntity>({
            name: 'AgentInvocationWaitEntity',
            target: AgentInvocationWaitEntity,
            tableName: 'agent_invocation_wait',
            columns: {
                ...scope,
                threadId: text,
                state: text,
                leaseToken: { ...uuid, nullable: true },
                leaseUntil: { type: 'timestamptz', nullable: true },
                lastError: nullable
            }
        }),
        CopilotCheckpoint,
        CopilotCheckpointWrites
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
            checkpoint_id: checkpoint.checkpointId,
            checkpoint: Buffer.from('{}'),
            metadata: Buffer.from('{}')
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
