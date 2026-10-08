import { EntitySchema } from 'typeorm'
import { ChatConversation } from '../../../chat-conversation/conversation.entity'
import { ChatConversationThread } from '../../../chat-conversation/conversation-thread.entity'
import { XpertAgentExecution } from '../../../xpert-agent-execution/agent-execution.entity'
import { AgentRuntimeDelivery, AgentRuntimeInbox } from '../runtime-message.entity'
const text = { type: 'varchar' as const }
const uuid = { type: 'uuid' as const }
const nullableText = { ...text, nullable: true }
const json = { type: 'jsonb' as const, nullable: true }
const time = { type: 'timestamptz' as const, nullable: true }
const base = {
    id: { ...uuid, primary: true, generated: 'uuid' as const },
    tenantId: uuid,
    organizationId: uuid,
    createdById: { ...uuid, nullable: true },
    updatedById: { ...uuid, nullable: true },
    createdAt: { ...time, createDate: true },
    updatedAt: { ...time, updateDate: true }
}
const common = {
    ...base,
    invocationId: uuid,
    ownerId: text,
    messageId: text,
    event: json,
    state: { ...text, default: 'pending' },
    nextAttemptAt: { ...time, default: () => 'now()' },
    leaseToken: { ...uuid, nullable: true },
    leaseUntil: time,
    lastError: nullableText,
    attempts: { type: 'int' as const, default: 0 }
}
export const runtimeMessageTestSchemas = [
    new EntitySchema<AgentRuntimeDelivery>({
        name: 'AgentRuntimeDelivery',
        target: AgentRuntimeDelivery,
        tableName: 'agent_runtime_delivery',
        columns: common
    }),
    new EntitySchema<AgentRuntimeInbox>({
        name: 'AgentRuntimeInbox',
        target: AgentRuntimeInbox,
        tableName: 'agent_runtime_inbox',
        columns: {
            ...common,
            consumptionKey: text,
            claim: json,
            phase: nullableText
        }
    }),
    new EntitySchema<ChatConversation>({
        name: 'ChatConversation',
        target: ChatConversation,
        tableName: 'chat_conversation',
        columns: {
            ...base,
            threadId: text,
            projectId: { ...uuid, nullable: true },
            status: text,
            operation: json
        }
    }),
    new EntitySchema<ChatConversationThread>({
        name: 'ChatConversationThread',
        target: ChatConversationThread,
        tableName: 'chat_conversation_thread',
        columns: {
            ...base,
            conversationId: uuid,
            threadId: { ...text, unique: true },
            status: text,
            runControl: json,
            runtimeContinuationBlockedAt: time,
            error: nullableText,
            operation: json,
            metadata: { ...json, default: {} },
            encryptedRunContext: nullableText
        }
    }),
    new EntitySchema<XpertAgentExecution>({
        name: 'XpertAgentExecution',
        target: XpertAgentExecution,
        tableName: 'xpert_agent_execution',
        columns: {
            ...base,
            threadId: text,
            agentKey: nullableText,
            xpertId: { ...uuid, nullable: true },
            type: nullableText,
            status: nullableText,
            error: nullableText
        }
    })
]
