// Real PostgreSQL and closure-table ancestry, with the production deletion foreign-key semantics.
import { randomUUID } from 'node:crypto'
import { EntitySchema, Repository } from 'typeorm'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ChatMessage } from '../../chat-message/chat-message.entity'
import { XpertAgentExecution } from '../../xpert-agent-execution/agent-execution.entity'
import { CopilotCheckpoint } from '../../copilot-checkpoint/copilot-checkpoint.entity'
import { CopilotCheckpointWrites } from '../../copilot-checkpoint/writes/writes.entity'
import { McpAppHistory } from '../../mcp-app-runtime/mcp-app-history.entity'
import { mcpTestDatabase } from '../../mcp-publication/testing/database'
import { publication, principal } from '../../mcp-publication/testing/fixtures'
import { ChatConversation } from '../conversation.entity'
import { ChatConversationThread } from '../conversation-thread.entity'
import { ChatConversationThreadService } from '../conversation-thread.service'
import { ChatConversationService } from '../conversation.service'
import { ChatConversationReadState } from '../conversation-read-state.entity'
import { ChatMessageService } from '../../chat-message/chat-message.service'
import { SideChatForkService } from '../side-chat-fork.service'
import { XpertProjectAccessService } from '../../xpert-project/services/project-access.service'
import type { VolumeClient } from '../../shared/volume'
import { Xpert } from '../../xpert/xpert.entity'

const uuid = { type: 'uuid' as const }
const text = { type: 'varchar' as const }
const nullableText = { ...text, nullable: true }
const nullableUuid = { ...uuid, nullable: true }
const base = {
    id: { ...uuid, primary: true, generated: 'uuid' as const },
    tenantId: uuid,
    organizationId: nullableUuid,
    createdById: nullableUuid,
    createdAt: { type: 'timestamptz' as const, createDate: true },
    updatedAt: { type: 'timestamptz' as const, updateDate: true }
}
const conversationRelation = {
    target: 'ChatConversation',
    type: 'many-to-one' as const,
    joinColumn: { name: 'conversationId' },
    onDelete: 'CASCADE' as const
}
const executionRelation = {
    target: 'XpertAgentExecution',
    type: 'many-to-one' as const,
    joinColumn: { name: 'executionId' },
    onDelete: 'CASCADE' as const
}

export async function deletionFixture(url: string, queryBus: QueryBus, commandBus: CommandBus) {
    const database = await mcpTestDatabase(url, [
        new EntitySchema<Xpert>({ name: 'Xpert', target: Xpert, columns: { ...base, userId: nullableUuid } }),
        new EntitySchema<ChatConversation>({
            name: 'ChatConversation',
            target: ChatConversation,
            tableName: 'chat_conversation',
            columns: {
                ...base,
                threadId: text,
                projectId: nullableUuid,
                xpertId: nullableUuid,
                title: nullableText,
                purpose: { ...text, default: 'private' },
                status: { ...text, default: 'idle' }
            },
            relations: { xpert: { target: 'Xpert', type: 'many-to-one', joinColumn: { name: 'xpertId' } } }
        }),
        new EntitySchema<ChatConversationThread>({
            name: 'ChatConversationThread',
            target: ChatConversationThread,
            tableName: 'chat_conversation_thread',
            columns: {
                ...base,
                threadId: { ...text, unique: true },
                conversationId: uuid,
                parentThreadId: nullableText,
                headMessageId: nullableUuid,
                forkedFromMessageId: nullableUuid,
                status: { ...text, default: 'idle' }
            },
            relations: {
                conversation: conversationRelation,
                headMessage: {
                    target: 'ChatMessage',
                    type: 'many-to-one',
                    joinColumn: { name: 'headMessageId' },
                    onDelete: 'SET NULL'
                }
            }
        }),
        new EntitySchema<XpertAgentExecution>({
            name: 'XpertAgentExecution',
            target: XpertAgentExecution,
            tableName: 'xpert_agent_execution',
            columns: { ...base, threadId: text }
        }),
        new EntitySchema<ChatMessage>({
            name: 'ChatMessage',
            target: ChatMessage,
            tableName: 'chat_message',
            trees: [{ type: 'closure-table' }],
            columns: {
                ...base,
                conversationId: uuid,
                parentId: nullableUuid,
                executionId: nullableUuid,
                createdInThreadId: nullableText,
                role: text,
                content: { type: 'jsonb', nullable: true },
                events: { type: 'jsonb', nullable: true },
                deletedAt: { type: 'timestamptz', deleteDate: true, nullable: true }
            },
            relations: {
                conversation: conversationRelation,
                execution: executionRelation,
                parent: {
                    target: 'ChatMessage',
                    type: 'many-to-one',
                    treeParent: true,
                    joinColumn: { name: 'parentId' }
                },
                children: { target: 'ChatMessage', type: 'one-to-many', treeChildren: true, inverseSide: 'parent' }
            }
        }),
        new EntitySchema<McpAppHistory>({
            name: 'McpAppHistory',
            target: McpAppHistory,
            tableName: 'mcp_app_history',
            columns: { ...base, conversationId: uuid, executionId: uuid },
            relations: { conversation: conversationRelation, execution: executionRelation }
        }),
        CopilotCheckpoint,
        CopilotCheckpointWrites
    ])
    const { db } = database
    const scope = { tenantId: publication().tenantId, organizationId: publication().organizationId }
    const actorId = principal().subjectId
    const threads = new ChatConversationThreadService(
        db.getRepository(ChatConversationThread),
        db.getRepository(ChatMessage),
        db.getRepository(ChatConversation),
        db,
        {} as SideChatForkService,
        queryBus
    )
    const projectAccess = {
        assertCanRead: jest.fn(async () => ({ role: 'owner' })),
        assertCanUse: jest.fn(async () => ({ role: 'owner' }))
    }
    const conversations = new ChatConversationService(
        db.getRepository(ChatConversation),
        {} as Repository<ChatConversationReadState>,
        {} as ChatMessageService,
        commandBus,
        queryBus,
        {} as VolumeClient,
        projectAccess as unknown as XpertProjectAccessService,
        threads
    )

    async function runtime(threadId: string) {
        const execution = await db.manager.save(XpertAgentExecution, { ...scope, threadId })
        const checkpointId = randomUUID()
        await db.manager.save(CopilotCheckpoint, {
            ...scope,
            thread_id: threadId,
            checkpoint_id: checkpointId,
            checkpoint_ns: '',
            checkpoint: Buffer.from('{}'),
            metadata: Buffer.from('{}')
        })
        await db.manager.save(CopilotCheckpointWrites, {
            ...scope,
            thread_id: threadId,
            checkpoint_id: checkpointId,
            checkpoint_ns: '',
            task_id: randomUUID(),
            idx: 0,
            value: Buffer.from('{}')
        })
        return execution
    }
    async function seed(project = false, legacy = false) {
        const conversation = await db.manager.save(ChatConversation, {
            ...scope,
            threadId: randomUUID(),
            projectId: project ? randomUUID() : null,
            createdById: actorId,
            title: 'issue-1434'
        })
        async function branch(parentThreadId: string | null) {
            return db.manager.save(ChatConversationThread, {
                ...scope,
                conversationId: conversation.id,
                threadId: parentThreadId ? randomUUID() : conversation.threadId,
                parentThreadId
            })
        }
        const main = await branch(null),
            leaf = await branch(main.threadId),
            sibling = await branch(main.threadId)
        const mainExecution = await runtime(main.threadId),
            leafExecution = await runtime(leaf.threadId),
            siblingExecution = await runtime(sibling.threadId)
        async function message(
            thread: ChatConversationThread,
            role: ChatMessage['role'],
            parent?: ChatMessage,
            executionId?: string
        ) {
            return db.manager.save(
                ChatMessage,
                db.manager.create(ChatMessage, {
                    ...scope,
                    conversationId: conversation.id,
                    createdInThreadId: legacy && thread === main ? null : thread.threadId,
                    role,
                    parent,
                    executionId,
                    content: `${role} message`
                })
            )
        }
        const first = await message(main, 'human')
        const reply = await message(main, 'ai', first, mainExecution.id)
        const followUp = await message(main, 'human', reply)
        const last = await message(main, 'ai', followUp, mainExecution.id)
        const leafInput = await message(leaf, 'human', reply),
            leafReply = await message(leaf, 'ai', leafInput, leafExecution.id)
        const leafFollowUp = await message(leaf, 'human', leafReply),
            leafLast = await message(leaf, 'ai', leafFollowUp, leafExecution.id)
        const siblingInput = await message(sibling, 'human', reply),
            siblingReply = await message(sibling, 'ai', siblingInput, siblingExecution.id)
        for (const [thread, head] of [
            [main, last],
            [leaf, leafLast],
            [sibling, siblingReply]
        ] as const)
            await db.manager.update(ChatConversationThread, thread.id, { headMessageId: head.id })
        const mainApp = await db.manager.save(McpAppHistory, {
            ...scope,
            conversationId: conversation.id,
            executionId: mainExecution.id
        })
        // A branch-only App component can reference provenance from a shared execution.
        const leafApp = await db.manager.save(McpAppHistory, {
            ...scope,
            conversationId: conversation.id,
            executionId: mainExecution.id
        })
        await db.manager.save(ChatMessage, {
            id: leafReply.id,
            events: [{ data: { type: 'McpApp', appInstanceId: leafApp.id } }]
        })
        return {
            conversation,
            main,
            leaf,
            sibling,
            mainExecution,
            leafExecution,
            siblingExecution,
            mainApp,
            leafApp,
            mainMessages: [first, reply, followUp, last],
            leafMessages: [leafInput, leafReply, leafFollowUp, leafLast],
            siblingMessages: [first, reply, siblingInput, siblingReply]
        }
    }
    return { ...database, scope, actorId, threads, conversations, projectAccess, seed }
}
