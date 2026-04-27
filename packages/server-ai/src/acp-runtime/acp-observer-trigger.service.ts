import { stringifyMessageContent, TAcpObservationPacket, TChatRequest } from '@xpert-ai/contracts'
import { Injectable, Logger } from '@nestjs/common'
import {
  AGENT_CHAT_DISPATCH_MESSAGE_TYPE,
  HandoffMessage,
} from '@xpert-ai/plugin-sdk'
import { HandoffQueueService } from '../handoff/message-queue.service'
import { AGENT_CHAT_CALLBACK_NOOP_MESSAGE_TYPE } from '../handoff/plugins/agent-chat/agent-chat-callback-noop.processor'
import { ChatConversationService } from '../chat-conversation'
import { AcpSession } from './acp-session.entity'
import { AcpSessionService } from './acp-session.service'

@Injectable()
export class AcpObserverTriggerService {
  readonly #logger = new Logger(AcpObserverTriggerService.name)

  constructor(
    private readonly handoffQueue: HandoffQueueService,
    private readonly conversationService: ChatConversationService,
    private readonly sessionService: AcpSessionService
  ) {}

  async publishObservation(
    session: Pick<
      AcpSession,
      'id' | 'conversationId' | 'executionId' | 'metadata' | 'tenantId' | 'organizationId' | 'xpertId'
    >,
    packet: TAcpObservationPacket,
    observationSequence: number
  ): Promise<void> {
    if (!session.conversationId || !session.xpertId) {
      return
    }

    const lastConsumedSequence =
      typeof session.metadata?.lastConsumedObservationSequence === 'number'
        ? session.metadata.lastConsumedObservationSequence
        : null

    if (lastConsumedSequence && observationSequence <= lastConsumedSequence) {
      return
    }

    try {
      const conversation = await this.conversationService.findOne(session.conversationId, { relations: ['messages'] })
      const visibleMessages = (conversation?.messages ?? []).filter(isVisibleMessage)
      const substantiveMessages = visibleMessages.filter((message) => !isAcpSystemMessage(message))
      const lastVisibleMessage = substantiveMessages[substantiveMessages.length - 1] ?? null
      const lastVisibleAiMessage =
        [...substantiveMessages].reverse().find((message) => message.role === 'ai' && hasVisibleContent(message)) ?? null
      const effectiveUserId =
        readString(session.metadata?.effectiveUserId) ??
        readString(session.metadata?.ownerUserId) ??
        readString(session.metadata?.userId)

      const request: TChatRequest = {
        action: 'send',
        conversationId: session.conversationId,
        message: {
          clientMessageId: `acp-observer:${session.id}:${observationSequence}`,
          input: {
            input: buildObservationUserMessage({
              acpSessionId: session.id,
              observationSequence,
              packet,
              phase: typeof session.metadata?.phase === 'string' ? session.metadata.phase : packet.phase,
              lastHeadline: typeof session.metadata?.lastHeadline === 'string' ? session.metadata.lastHeadline : packet.headline,
              lastUpstreamHandoff: readString(session.metadata?.lastUpstreamHandoff),
              lastReportedProgress: lastVisibleAiMessage ? stringifyMessageContent(lastVisibleAiMessage.content) : null,
              userAwaiting: lastVisibleMessage?.role === 'human'
            })
          },
          thirdPartyMessage: buildObservationThirdPartyMessage({
            acpSessionId: session.id,
            observationSequence,
            packet
          })
        }
      }

      const message: HandoffMessage<{ request: TChatRequest; options: Record<string, unknown>; callback: Record<string, unknown> }> = {
        id: `acp-observer:${session.id}:${observationSequence}`,
        type: AGENT_CHAT_DISPATCH_MESSAGE_TYPE,
        version: 1,
        tenantId: session.tenantId,
        sessionKey: session.conversationId,
        businessKey: `${session.id}:observer`,
        attempt: 1,
        maxAttempts: 1,
        enqueuedAt: Date.now(),
        traceId: packet.executionId ?? session.executionId ?? `acp-observer:${session.id}`,
        payload: {
          request,
          options: {
            xpertId: session.xpertId,
            from: 'job'
          },
          callback: {
            messageType: AGENT_CHAT_CALLBACK_NOOP_MESSAGE_TYPE
          }
        },
        headers: {
          ...(session.organizationId ? { organizationId: session.organizationId } : {}),
          ...(effectiveUserId ? { userId: effectiveUserId } : {}),
          source: 'xpert'
        }
      }

      await this.handoffQueue.enqueue(message)

      const current = await this.sessionService.findOne(session.id)
      await this.sessionService.update(session.id, {
        metadata: {
          ...(current?.metadata ?? {}),
          lastConsumedObservationSequence: observationSequence
        }
      })
    } catch (error) {
      this.#logger.warn(
        {
          err: error,
          sessionId: session.id,
          conversationId: session.conversationId,
          xpertId: session.xpertId ?? null,
          observationSequence
        },
        'Failed to publish ACP observation back into Claw conversation'
      )
    }
  }
}

function buildObservationUserMessage(input: {
  acpSessionId: string
  observationSequence: number
  packet: TAcpObservationPacket
  phase?: string | null
  lastHeadline?: string | null
  lastUpstreamHandoff?: string | null
  lastReportedProgress?: string | null
  userAwaiting?: boolean
}) {
  return [
    'Codexpert 系统通知：这是当前编码任务的一条运行中回流，不是用户的新提问。',
    '如果这条通知没有带来新的用户可感知进展，请只回复 NO_REPLY。',
    '如果它代表新的关键进展，请用简短中文向用户汇报。',
    '如果它需要用户决策，请直接提出一个具体问题。',
    '不要重新委派编码任务，不要重复排队，不要假装知道通知之外的信息。',
    '',
    'Codexpert event (system metadata):',
    '```json',
    JSON.stringify(
      {
        acpSessionId: input.acpSessionId,
        observationSequence: input.observationSequence,
        phase: input.phase ?? input.packet.phase ?? null,
        headline: input.packet.headline,
        lastHeadline: input.lastHeadline ?? null,
        lastUpstreamHandoff: input.lastUpstreamHandoff ?? null,
        lastReportedProgress: input.lastReportedProgress ?? null,
        userAwaiting: input.userAwaiting ?? false,
        packet: input.packet
      },
      null,
      2
    ),
    '```',
    '',
    '通知正文：',
    readString(input.packet.finalSummary) ??
      readString(input.packet.error) ??
      readString(input.packet.headline) ??
      'Codexpert 有新的运行更新'
  ].join('\n')
}

function buildObservationThirdPartyMessage(input: {
  acpSessionId: string
  observationSequence: number
  packet: TAcpObservationPacket
}) {
  return {
    type: 'acp_external_event',
    source: 'codexpert',
    origin: 'system',
    acpSessionId: input.acpSessionId,
    observationSequence: input.observationSequence,
    phase: input.packet.phase,
    headline: input.packet.headline,
    requiresAttention: input.packet.requiresAttention ?? false,
    finalSummary: input.packet.finalSummary ?? null,
    error: input.packet.error ?? null
  }
}

function isVisibleMessage(message: { deletedAt?: unknown; visibleAt?: unknown }) {
  if (message.deletedAt) {
    return false
  }

  return message.visibleAt !== null
}

function isAcpSystemMessage(message: { thirdPartyMessage?: unknown } | null | undefined) {
  const type = readThirdPartyMessageType(message?.thirdPartyMessage)
  return type === 'acp_progress' || type === 'acp_live_text' || type === 'acp_system_event' || type === 'acp_external_event'
}

function hasVisibleContent(message: { content?: unknown } | null | undefined) {
  return stringifyMessageContent(message?.content).trim().length > 0
}

function readThirdPartyMessageType(value: unknown): string | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const type = Reflect.get(value, 'type')
  return typeof type === 'string' ? type : null
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}
