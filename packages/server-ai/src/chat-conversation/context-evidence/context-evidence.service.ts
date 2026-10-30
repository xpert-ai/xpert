// Invariants: IDs locate immutable content; they never grant access.
// Reauthorize every operation and verify durable read-back before returning an archive reference.
import { BaseMessage, isAIMessage, isHumanMessage, isSystemMessage, isToolMessage } from '@langchain/core/messages'
import {
    BadRequestException,
    ForbiddenException,
    Inject,
    Injectable,
    ServiceUnavailableException
} from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { assertPublicXpertSessionConversationAccess } from '../../ai/public-xpert-principal'
import { ChatConversationService } from '../conversation.service'
import { ChatConversationThreadService } from '../conversation-thread.service'
import {
    ContextEvidenceAccess,
    ContextEvidenceScope,
    ContextEvidenceStorage,
    EvidenceMessage,
    evidenceMessageSchema,
    evidenceArchiveSchema,
    evidenceScopeSchema,
    ReadContextEvidenceInput
} from './context-evidence.schema'
import {
    encodeEvidenceRecord,
    findEvidenceArchive,
    loadEvidenceRecord,
    persistEvidenceRecords
} from './context-evidence.archive'

export function evidenceMessage(message: BaseMessage): EvidenceMessage {
    const calls = isAIMessage(message)
        ? (message.tool_calls ?? []).map((call) => ({
              id: call.id,
              name: call.name,
              arguments: JSON.stringify(call.args)
          }))
        : []
    const tool = isToolMessage(message) ? message : undefined
    const role = isHumanMessage(message)
        ? 'human'
        : isAIMessage(message)
          ? 'ai'
          : isToolMessage(message)
            ? 'tool'
            : isSystemMessage(message)
              ? 'system'
              : 'other'
    return evidenceMessageSchema.parse({
        role,
        messageId: message.id,
        name: message.name,
        callId: tool?.tool_call_id,
        status: tool?.status,
        content: typeof message.content === 'string' ? message.content : JSON.stringify(message.content),
        format: typeof message.content === 'string' ? 'text' : 'json',
        calls,
        archives:
            message.additional_kwargs.contextEvidenceArchives === undefined
                ? undefined
                : evidenceArchiveSchema.array().parse(message.additional_kwargs.contextEvidenceArchives),
        partial:
            message.additional_kwargs.pruned === true ||
            message.additional_kwargs.truncated === true ||
            message.additional_kwargs.compressed === true
    })
}

@Injectable()
export class ContextEvidenceService {
    constructor(
        private readonly storage: ContextEvidenceStorage,
        @Inject(ChatConversationService) private readonly conversations: Pick<ChatConversationService, 'assertAccess'>,
        @Inject(ChatConversationThreadService)
        private readonly threads: Pick<ChatConversationThreadService, 'findByThreadId'>,
        @Inject(QueryBus) private readonly queryBus: Pick<QueryBus, 'execute'>
    ) {}

    bind(scope: {
        tenantId: string
        organizationId?: string | null
        userId: string
        conversationId?: string
        threadId?: string
        agentKey?: string
        xpertId?: string
        conversationXpertId?: string
    }): ContextEvidenceAccess {
        const captured = { ...scope, organizationId: scope.organizationId ?? null, agentKey: scope.agentKey ?? '' }
        const authorizedScope = async () => {
            const parsed = evidenceScopeSchema.safeParse(captured)
            if (!parsed.success) throw this.denied()
            await this.authorize(parsed.data)
            return parsed.data
        }
        return {
            archive: async (messages) => {
                const authorized = await authorizedScope()
                try {
                    return await this.archive(authorized, messages)
                } catch {
                    throw this.unavailable()
                }
            },
            read: async (input) => {
                const authorized = await authorizedScope()
                try {
                    return await this.read(authorized, input)
                } catch (error) {
                    if (error instanceof BadRequestException) throw error
                    throw this.unavailable()
                }
            }
        }
    }

    private async authorize(scope: ContextEvidenceScope) {
        if (RequestContext.currentUserId() !== scope.userId) throw this.denied()
        const conversation = await this.conversations.assertAccess(scope.conversationId)
        const ownerXpertId = scope.conversationXpertId ?? scope.xpertId
        if (
            conversation.tenantId !== scope.tenantId ||
            (conversation.organizationId ?? null) !== scope.organizationId ||
            (ownerXpertId && conversation.xpertId !== ownerXpertId)
        )
            throw this.denied()
        await assertPublicXpertSessionConversationAccess(conversation, this.queryBus)
        const thread = await this.threads.findByThreadId(scope.threadId)
        if (!thread || thread.conversationId !== scope.conversationId) throw this.denied()
    }

    private async archive(scope: ContextEvidenceScope, messages: BaseMessage[]) {
        if (!messages.length || messages.length > 10000) throw this.unavailable()
        const entries = messages.map(evidenceMessage)
        const records = entries.map((message) => encodeEvidenceRecord(scope, { version: 1, kind: 'message', message }))
        await persistEvidenceRecords(this.storage, scope, records)
        const manifest = encodeEvidenceRecord(scope, {
            version: 1,
            kind: 'manifest',
            entries: records.map((record, i) => ({
                recordId: record.evidenceId,
                role: entries[i].role,
                name: entries[i].name ?? entries[i].calls[0]?.name,
                preview: (entries[i].content || entries[i].calls[0]?.arguments || '').slice(0, 240),
                status: entries[i].status,
                callIds: entries[i].calls.flatMap((call) => (call.id ? [call.id] : [])),
                partial: entries[i].partial
            }))
        })
        // Publish the index only after every referenced record is durable and verified.
        await this.storage.put(scope, [manifest])
        await loadEvidenceRecord(this.storage, scope, manifest.evidenceId)
        return {
            archiveId: manifest.evidenceId,
            records: records.length,
            partial: entries.some((entry) => entry.partial),
            agentKey: scope.agentKey
        }
    }

    private async read(scope: ContextEvidenceScope, input: ReadContextEvidenceInput) {
        const { source, manifest } = await findEvidenceArchive(this.storage, scope, input.archiveId, (id) =>
            this.threads.findByThreadId(id)
        )
        if (input.part === 'index') {
            const entries = manifest.entries.slice(input.offset, input.offset + 8).map((entry, i) => ({
                record: input.offset + i,
                role: entry.role,
                name: entry.name?.slice(0, 128),
                preview: entry.preview,
                status: entry.status,
                callCount: entry.callIds.length,
                partialSource: entry.partial
            }))
            const next = input.offset + entries.length
            return {
                archiveId: input.archiveId,
                sourceThreadId: source.threadId,
                totalRecords: manifest.entries.length,
                entries,
                nextOffset: next < manifest.entries.length ? next : null
            }
        }
        const entry = input.record === undefined ? undefined : manifest.entries[input.record]
        if (!entry) throw this.invalid()
        const record = await loadEvidenceRecord(this.storage, source, entry.recordId)
        if (record.kind !== 'message') throw this.invalid()
        const message = record.message
        const text = input.part === 'arguments' ? message.calls[input.call]?.arguments : message.content
        if (text === undefined || input.offset > text.length) throw this.invalid()
        const end = Math.min(text.length, input.offset + input.limit)
        return {
            archiveId: input.archiveId,
            sourceThreadId: source.threadId,
            record: input.record,
            part: input.part,
            call: input.call,
            role: message.role,
            status: message.status,
            partialSource: message.partial,
            format: input.part === 'arguments' ? 'json' : message.format,
            totalChars: text.length,
            offset: input.offset,
            text: text.slice(input.offset, end),
            nextOffset: end < text.length ? end : null
        }
    }

    private denied() {
        return new ForbiddenException(t('server-ai:Error.ContextEvidenceDenied'))
    }
    private unavailable() {
        return new ServiceUnavailableException(t('server-ai:Error.ContextEvidenceUnavailable'))
    }
    private invalid() {
        return new BadRequestException(t('server-ai:Error.ContextEvidenceInvalid'))
    }
}
