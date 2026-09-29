import { createHash, randomUUID } from 'crypto'
import { Injectable, Logger } from '@nestjs/common'
import { ModuleRef } from '@nestjs/core'
import { CommandBus } from '@nestjs/cqrs'
import { t } from 'i18next'
import {
    ChatMessageEventTypeEnum,
    ChatMessageTypeEnum,
    XpertAgentExecutionStatusEnum,
    type EvolutionChange,
    type EvolutionExecutionContext,
    type EvolutionExecutionConversation,
    type IChatMessage,
    type IXpertAgentExecution
} from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/server-core'
import { ChatConversation } from '../../chat-conversation/conversation.entity'
import { ChatConversationUpsertCommand } from '../../chat-conversation/commands/upsert.command'
import { ChatConversationThreadService } from '../../chat-conversation/conversation-thread.service'
import { ChatMessageUpsertCommand } from '../../chat-message/commands/upsert.command'
import { publicChatMessage } from '../../chat-message/message-branching'
import { XpertAgentExecutionUpsertCommand } from '../../xpert-agent-execution/commands/upsert.command'
import { PublishedXpertAccessService } from '../../xpert/published-xpert-access.service'
import { XpertProjectAccessService } from '../../xpert-project/services/project-access.service'
import { RedisSseStreamService } from '../../shared/stream/redis-sse.service'

export interface EvolutionConversationSession {
    reference: EvolutionExecutionConversation
    context: EvolutionExecutionContext
    changeId: string
    phase: 'candidate' | 'evaluation'
    message: IChatMessage
}

/** A real, persisted ChatKit transcript of provider execution. No extra agent or model invocation. */
@Injectable()
export class EvolutionExecutionConversationService {
    private readonly logger = new Logger(EvolutionExecutionConversationService.name)
    constructor(
        private readonly commands: CommandBus,
        private readonly modules: ModuleRef
    ) {}

    async validate(context: EvolutionExecutionContext) {
        await this.modules
            .get(PublishedXpertAccessService, { strict: false })
            .getAccessiblePublishedXpert(context.xpertId)
        if (context.projectId)
            await this.modules
                .get(XpertProjectAccessService, { strict: false })
                .assertCanUseXpert(context.projectId, context.xpertId)
    }

    async start(change: EvolutionChange): Promise<EvolutionConversationSession | undefined> {
        const context = change.executionContext
        if (!context) return undefined
        await this.validate(context)
        // One conversation per change. Queue retries are separate runs so a previous SSE
        // completion marker cannot terminate the new run, and previous messages remain intact.
        const reference = {
            conversationId:
                change.executionConversation?.conversationId ?? executionId(change.changeId, 'conversation'),
            threadId: change.executionConversation?.threadId ?? executionId(change.changeId, 'thread'),
            executionId: randomUUID()
        }
        const conversation = await this.commands.execute<ChatConversationUpsertCommand, ChatConversation>(
            new ChatConversationUpsertCommand({
                id: reference.conversationId,
                threadId: reference.threadId,
                xpertId: context.xpertId,
                projectId: context.projectId,
                title: context.title,
                from: 'job',
                status: 'busy',
                createdById: RequestContext.currentUserId(),
                error: null
            })
        )
        const threads = this.modules.get(ChatConversationThreadService, { strict: false })
        const thread = await threads.ensurePrimary(conversation)
        await threads.updateRuntimeState(reference.threadId, 'busy')
        await this.commands.execute(
            new XpertAgentExecutionUpsertCommand({
                id: reference.executionId,
                threadId: reference.threadId,
                xpertId: context.xpertId,
                status: XpertAgentExecutionStatusEnum.RUNNING,
                metadata: { from: 'job', evolutionChangeId: change.changeId }
            })
        )
        const human = await this.commands.execute<ChatMessageUpsertCommand, IChatMessage>(
            new ChatMessageUpsertCommand({
                id: executionId(reference.executionId, 'input'),
                parentId: thread.headMessageId,
                parent: thread.headMessageId ? { id: thread.headMessageId } : null,
                conversationId: reference.conversationId,
                createdInThreadId: reference.threadId,
                role: 'human',
                content: context.input
            })
        )
        const session: EvolutionConversationSession = {
            reference,
            context,
            changeId: change.changeId,
            phase: 'candidate',
            message: human
        }
        await this.event(session, ChatMessageEventTypeEnum.ON_CONVERSATION_START, {
            id: conversation.id,
            title: conversation.title,
            status: 'busy',
            createdAt: conversation.createdAt,
            updatedAt: conversation.updatedAt
        })
        await this.beginPhase(session, 'candidate', human.id)
        if (change.candidate) await this.drafted(session, change)
        return session
    }

    async drafted(session: EvolutionConversationSession, change: EvolutionChange) {
        const candidate = change.candidate
        if (!candidate || session.phase !== 'candidate') return
        const details = candidate.changes
            .map((delta) => `- ${delta.summary} (${delta.path})\n\n\`\`\`json\n${delta.after}\n\`\`\``)
            .join('\n\n')
        await this.endPhase(session, `${this.label(session, 'Drafted')}\n\n${candidate.summary}\n\n${details}`)
        await this.beginPhase(
            session,
            'evaluation',
            session.message.id,
            change.strategy.definition.evaluations.length ? 'Checking' : 'PreparingReview'
        )
    }

    async finish(session: EvolutionConversationSession, change: EvolutionChange, error?: string) {
        const failed = error !== undefined || change.status === 'failed'
        const reasons = error ? [error] : (change.failureReasons ?? [])
        const evaluation = change.evaluation
        const result = failed
            ? `${this.label(session, 'Failed')}\n\n${reasons.join('\n')}`
            : evaluation?.assessment === 'not_applicable'
              ? `${this.label(session, 'ChecksNotApplicable')}\n\n${this.label(session, 'AwaitingReview')}`
              : evaluation
                ? `${this.label(session, evaluation.passed ? 'ChecksPassed' : 'ChecksFailed')}\n\n` +
                  evaluation.checks
                      .map(
                          (check) =>
                              `- ${this.label(session, check.passed ? 'Passed' : 'NotPassed')}: ${check.title}\n  ${check.details}`
                      )
                      .join('\n\n') +
                  `\n\n${this.label(session, evaluation.passed ? 'AwaitingReview' : 'ReviewFailures')}`
                : this.label(session, 'AwaitingChecks')
        await this.endPhase(session, result, failed)
        const status = failed ? XpertAgentExecutionStatusEnum.ERROR : XpertAgentExecutionStatusEnum.SUCCESS
        const execution = await this.commands.execute<XpertAgentExecutionUpsertCommand, IXpertAgentExecution>(
            new XpertAgentExecutionUpsertCommand({
                id: session.reference.executionId,
                status,
                error: failed ? reasons.join('\n') : null
            })
        )
        const conversationStatus = failed ? 'error' : 'idle'
        await this.commands.execute(
            new ChatConversationUpsertCommand({
                id: session.reference.conversationId,
                status: conversationStatus,
                error: failed ? reasons.join('\n') : null
            })
        )
        await this.modules
            .get(ChatConversationThreadService, { strict: false })
            .updateRuntimeState(session.reference.threadId, conversationStatus, failed ? reasons.join('\n') : null)
        await this.event(session, ChatMessageEventTypeEnum.ON_AGENT_END, execution)
        await this.event(session, ChatMessageEventTypeEnum.ON_CONVERSATION_END, {
            id: session.reference.conversationId,
            status: conversationStatus,
            error: failed ? reasons.join('\n') : null
        })
        await this.publish(() =>
            this.streams().appendCompleteEvent(session.reference.threadId, session.reference.executionId)
        )
    }

    private async beginPhase(
        session: EvolutionConversationSession,
        phase: EvolutionConversationSession['phase'],
        parentId: string,
        label?: string
    ) {
        session.phase = phase
        session.message = await this.commands.execute<ChatMessageUpsertCommand, IChatMessage>(
            new ChatMessageUpsertCommand({
                id: executionId(session.reference.executionId, phase),
                parentId,
                role: 'ai',
                // TypeORM maintains ChatKit's history closure table through the tree relation.
                parent: { id: parentId },
                conversationId: session.reference.conversationId,
                createdInThreadId: session.reference.threadId,
                executionId: session.reference.executionId,
                status: 'thinking',
                content: this.label(session, label ?? (phase === 'candidate' ? 'Generating' : 'Checking')),
                error: null
            })
        )
        await this.modules
            .get(ChatConversationThreadService, { strict: false })
            .advanceHead(session.reference.threadId, session.message.id)
        await this.event(session, ChatMessageEventTypeEnum.ON_MESSAGE_START, publicChatMessage(session.message))
    }

    private async endPhase(session: EvolutionConversationSession, content: string, failed = false) {
        const addition = `\n\n${content}`
        const saved = await this.commands.execute<ChatMessageUpsertCommand, IChatMessage>(
            new ChatMessageUpsertCommand({
                id: session.message.id,
                content: `${session.message.content}${addition}`,
                status: failed ? XpertAgentExecutionStatusEnum.ERROR : XpertAgentExecutionStatusEnum.SUCCESS,
                error: failed ? content : null
            })
        )
        session.message = { ...session.message, ...saved }
        await this.publish(() =>
            this.streams().appendEvent(session.reference.threadId, session.reference.executionId, {
                type: ChatMessageTypeEnum.MESSAGE,
                data: addition
            })
        )
        await this.event(session, ChatMessageEventTypeEnum.ON_MESSAGE_END, publicChatMessage(session.message))
    }

    private label(session: EvolutionConversationSession, key: string) {
        return t(`server-ai:EvolutionExecution.${key}`, { lng: session.context.language ?? 'en' })
    }
    private streams() {
        return this.modules.get(RedisSseStreamService, { strict: false })
    }
    private event(session: EvolutionConversationSession, event: ChatMessageEventTypeEnum, data: unknown) {
        return this.publish(() =>
            this.streams().appendEvent(session.reference.threadId, session.reference.executionId, {
                type: ChatMessageTypeEnum.EVENT,
                event,
                data
            })
        )
    }

    /** Persisted messages and runtime state remain authoritative when live delivery fails. */
    private async publish(write: () => Promise<unknown>): Promise<void> {
        try {
            await write()
        } catch (error) {
            this.logger.warn(`Evolution execution event could not be published: ${error}`)
        }
    }
}

function executionId(changeId: string, part: string) {
    const hash = createHash('sha256').update(`evolution-chat:${changeId}:${part}`).digest('hex')
    return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`
}
