import { z } from 'zod/v3'
import { Brackets, type Repository, type SelectQueryBuilder } from 'typeorm'
import {
    executionObservationStatusSchema,
    type ExecutionObservationQuery,
    type ExecutionObservationRecord
} from '@xpert-ai/contracts'
import { XpertAgentExecution } from '../agent-execution.entity'
import { ChatConversationThread } from '../../chat-conversation/conversation-thread.entity'
import { ChatConversation } from '../../chat-conversation/conversation.entity'
import { Xpert } from '../../xpert/xpert.entity'
import { XpertWorkspace } from '../../xpert-workspace/workspace.entity'

export type ObservationScope = Readonly<{
    tenantId: string
    organizationId: string
    userId: string
    restricted: boolean
    xpertId?: string
    sessionId?: string
}>
const iso = z.coerce.date().transform((value) => value.toISOString())
export const ASSISTANT_DISPLAY_NAME = "COALESCE(NULLIF(assistant.title, ''), assistant.name)"
export const observationRowSchema = z.object({
    id: z.string(),
    assistantId: z.string().nullable(),
    assistantName: z.string().nullable(),
    workspaceId: z.string().nullable(),
    workspaceName: z.string().nullable(),
    conversationId: z.string().nullable(),
    threadId: z.string().nullable(),
    parentId: z.string().nullable(),
    parentThreadId: z.string().nullable(),
    forkedFromMessageId: z.string().nullable(),
    title: z.string().nullable(),
    source: z.string().nullable(),
    recordedById: z.string().nullable(),
    status: z
        .string()
        .nullable()
        .transform((value) =>
            executionObservationStatusSchema.safeParse(value).success
                ? executionObservationStatusSchema.parse(value)
                : ('unknown' as const)
        ),
    createdAt: iso,
    completedAt: iso.nullable(),
    elapsedTimeMs: z.coerce.number().nullable(),
    invocationKind: z
        .string()
        .nullable()
        .transform((value) => (value === 'external_assistant' || value === 'sub_agent' ? value : null)),
    hasError: z.boolean()
})

export function observationBase(repository: Repository<XpertAgentExecution>, scope: ObservationScope) {
    return repository
        .createQueryBuilder('e')
        .leftJoin(
            Xpert,
            'assistant',
            'assistant.id = e.xpertId AND assistant.tenantId = e.tenantId AND assistant.organizationId = e.organizationId'
        )
        .leftJoin(
            XpertWorkspace,
            'workspace',
            'workspace.id = assistant.workspaceId AND workspace.tenantId = e.tenantId AND workspace.organizationId = e.organizationId'
        )
        .leftJoin(
            ChatConversationThread,
            'thread',
            'thread.threadId = e.threadId AND thread.tenantId = e.tenantId AND thread.organizationId = e.organizationId'
        )
        .leftJoin(
            ChatConversation,
            'conversation',
            'conversation.id = thread.conversationId AND conversation.tenantId = e.tenantId AND conversation.organizationId = e.organizationId'
        )
        .where('e.tenantId = :tenantId AND e.organizationId = :organizationId', scope)
}

export function filterObservations(
    qb: SelectQueryBuilder<XpertAgentExecution>,
    input: ExecutionObservationQuery,
    asOf: Date
) {
    qb.andWhere(
        new Brackets((where) => {
            where.where('e.parentId IS NULL')
            if (input.countingUnit === 'assistant_invocation')
                where.orWhere(`e.metadata->>'invocationKind' IN ('external_assistant', 'sub_agent')`)
        })
    )
    qb.andWhere('e.createdAt < :to AND e.createdAt <= :asOf', { to: input.to, asOf }).andWhere(
        new Brackets((where) =>
            where
                .where('e.completedAt > :from', { from: input.from })
                .orWhere('e.completedAt = e.createdAt AND e.createdAt >= :from')
                .orWhere("e.completedAt IS NULL AND e.status = 'running'")
                .orWhere('e.completedAt IS NULL AND e.createdAt >= :from')
        )
    )
    if (input.assistantId) qb.andWhere('e.xpertId = :assistantId', { assistantId: input.assistantId })
    if (input.conversationId) qb.andWhere('conversation.id = :conversationId', { conversationId: input.conversationId })
    if (input.threadId) qb.andWhere('e.threadId = :threadId', { threadId: input.threadId })
    if (input.unknownAssistantOnly) qb.andWhere('e.xpertId IS NULL')
    if (input.workspaceId) qb.andWhere('assistant.workspaceId = :workspaceId', { workspaceId: input.workspaceId })
    if (input.recordedById) qb.andWhere('e.createdById = :recordedById', { recordedById: input.recordedById })
    if (input.source)
        qb.andWhere(`COALESCE(e.metadata->>'triggerSource', conversation."from") = :source`, { source: input.source })
    if (input.statuses?.length)
        qb.andWhere(
            `CASE WHEN e.status IN ('running','success','error','pending','timeout','interrupted') THEN e.status ELSE 'unknown' END IN (:...statuses)`,
            { statuses: input.statuses }
        )
    if (input.search)
        qb.andWhere(`(e.title ILIKE :search OR ${ASSISTANT_DISPLAY_NAME} ILIKE :search)`, {
            search: `%${input.search.replace(/[\\%_]/g, '\\$&')}%`
        })
    return qb
}

export function selectObservations(qb: SelectQueryBuilder<XpertAgentExecution>) {
    return qb
        .select('e.id', 'id')
        .addSelect('e.xpertId', 'assistantId')
        .addSelect(ASSISTANT_DISPLAY_NAME, 'assistantName')
        .addSelect('assistant.workspaceId', 'workspaceId')
        .addSelect('workspace.name', 'workspaceName')
        .addSelect('conversation.id', 'conversationId')
        .addSelect('e.threadId', 'threadId')
        .addSelect('e.parentId', 'parentId')
        .addSelect('thread.parentThreadId', 'parentThreadId')
        .addSelect('thread.forkedFromMessageId', 'forkedFromMessageId')
        .addSelect('e.title', 'title')
        .addSelect(`COALESCE(e.metadata->>'triggerSource', conversation."from")`, 'source')
        .addSelect('e.createdById', 'recordedById')
        .addSelect('e.status', 'status')
        .addSelect('e.createdAt', 'createdAt')
        .addSelect('e.completedAt', 'completedAt')
        .addSelect('e.elapsedTime', 'elapsedTimeMs')
        .addSelect(`e.metadata->>'invocationKind'`, 'invocationKind')
        .addSelect("e.error IS NOT NULL AND e.error <> ''", 'hasError')
}

export function toObservationRow(row: object): ExecutionObservationRecord {
    const item = observationRowSchema.parse(row)
    return { ...item, endKnown: item.completedAt !== null, timingBasis: 'record_lifecycle', phasesAvailable: false }
}
