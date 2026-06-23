import {
    TAgentExecutionMetadata,
    TChatConversationSourceAudit,
    TChatOptions,
    TChatSourceAuditOptions
} from '@xpert-ai/contracts'
import { uniq } from 'lodash'

export type ChatSourceAuditOptions = TChatOptions &
    TChatSourceAuditOptions & {
        fromEndUserId?: string
        execution?: {
            metadata?: TAgentExecutionMetadata | null
        }
    }

export type NormalizeChatSourceAuditOptionsInput<TOptions extends TChatOptions & TChatSourceAuditOptions> = {
    options: TOptions
    headers?: Record<string, unknown> | null
    callbackContext?: Record<string, unknown> | null
    messageId?: string | null
    traceId?: string | null
    parentMessageId?: string | null
}

export function normalizeChatSourceAuditOptions<TOptions extends TChatOptions & TChatSourceAuditOptions>(
    input: NormalizeChatSourceAuditOptionsInput<TOptions>
): TOptions {
    const { options, headers, callbackContext, messageId, traceId, parentMessageId } = input
    const runtimePrincipal = options.runtimePrincipal
    const sourceIntegrationId =
        readNonEmptyString(runtimePrincipal?.sourceIntegrationId) ??
        readNonEmptyString(options.sourceIntegrationId) ??
        readNonEmptyString(options.integrationId) ??
        readStringProperty(headers, 'integrationId') ??
        readStringProperty(callbackContext, 'integrationId')
    const sourceMessageLogIds = uniq([
        ...readStringList(options.sourceMessageLogIds),
        ...readStringList(options.currentInboundLogIds),
        ...readStringListProperty(callbackContext, 'sourceMessageLogIds'),
        ...readStringListProperty(callbackContext, 'currentInboundLogIds')
    ])

    return {
        ...options,
        ...(sourceIntegrationId
            ? {
                  sourceIntegrationId,
                  integrationId: options.integrationId ?? sourceIntegrationId
              }
            : {}),
        ...(sourceMessageLogIds.length ? { sourceMessageLogIds } : {}),
        handoffMessageId: options.handoffMessageId ?? messageId ?? undefined,
        handoffTraceId: options.handoffTraceId ?? traceId ?? undefined,
        ...(parentMessageId && !options.handoffParentMessageId ? { handoffParentMessageId: parentMessageId } : {})
    } as TOptions
}

export function buildChatSourceExecutionMetadata(
    options: ChatSourceAuditOptions | null | undefined
): TAgentExecutionMetadata | undefined {
    const sourceAudit = collectChatConversationSourceAudit(options)
    const runtimePrincipal = readObjectProperty(options, 'runtimePrincipal')
    const existingMetadata = readObjectProperty(options?.execution, 'metadata')
    const baseMetadata =
        existingMetadata && typeof existingMetadata === 'object' && !Array.isArray(existingMetadata)
            ? (existingMetadata as Record<string, unknown>)
            : {}
    const sourceIntegrationId =
        sourceAudit?.sourceIntegrationId ??
        readStringProperty(runtimePrincipal, 'sourceIntegrationId') ??
        readStringProperty(options, 'sourceIntegrationId') ??
        readStringProperty(options, 'integrationId')
    const integrationId = readStringProperty(options, 'integrationId') ?? sourceIntegrationId
    const channelSource = readStringProperty(options, 'channelSource') ?? readStringProperty(options, 'channel_source')
    const contactId = readStringProperty(options, 'contactId') ?? readStringProperty(options, 'contact_id')
    const chatId = readStringProperty(options, 'chatId') ?? readStringProperty(options, 'chat_id')
    const chatType = readStringProperty(options, 'chatType') ?? readStringProperty(options, 'chat_type')
    const senderId = readStringProperty(options, 'senderId') ?? readStringProperty(options, 'sender_id')
    const sourceMessageLogIds = sourceAudit?.sourceMessageLogIds ?? []
    const triggerSource = integrationId
        ? 'integration'
        : (readStringProperty(options, 'from') ?? readStringProperty(options, 'channelType'))

    return compactExecutionMetadata({
        ...baseMetadata,
        triggerSource,
        sourceIntegrationId,
        integrationId,
        channelType: sourceAudit?.channelType ?? readStringProperty(options, 'channelType'),
        channelSource,
        from: readStringProperty(options, 'from'),
        fromEndUserId: readStringProperty(options, 'fromEndUserId'),
        channelUserId: readStringProperty(options, 'channelUserId'),
        uuid: readStringProperty(options, 'uuid'),
        ownerWxid: readStringProperty(options, 'ownerWxid'),
        contactId,
        chatId,
        chatType,
        senderId,
        sourceMessageLogIds,
        handoffMessageId: readStringProperty(options, 'handoffMessageId'),
        handoffTraceId: readStringProperty(options, 'handoffTraceId'),
        handoffParentMessageId: readStringProperty(options, 'handoffParentMessageId'),
        runtimePrincipalType: readStringProperty(runtimePrincipal, 'type'),
        runtimePrincipalXpertId: readStringProperty(runtimePrincipal, 'xpertId')
    })
}

export function buildChatConversationSourceAudit(
    options: ChatSourceAuditOptions | null | undefined,
    existingSourceAudit?: TChatConversationSourceAudit | null
): TChatConversationSourceAudit | undefined {
    const sourceAudit = collectChatConversationSourceAudit(options)

    if (!sourceAudit) {
        return existingSourceAudit ?? undefined
    }

    return mergeChatConversationSourceAudit(existingSourceAudit, sourceAudit)
}

export function mergeChatConversationSourceAudit(
    existingSourceAudit: TChatConversationSourceAudit | null | undefined,
    sourceAudit: TChatConversationSourceAudit
): TChatConversationSourceAudit {
    const sourceMessageLogIds = uniq([
        ...(existingSourceAudit?.sourceMessageLogIds ?? []),
        ...(sourceAudit.sourceMessageLogIds ?? [])
    ])

    return {
        ...(existingSourceAudit ?? {}),
        ...(sourceAudit.sourceIntegrationId ? { sourceIntegrationId: sourceAudit.sourceIntegrationId } : {}),
        ...(sourceAudit.channelType ? { channelType: sourceAudit.channelType } : {}),
        ...(sourceMessageLogIds.length ? { sourceMessageLogIds } : {})
    }
}

function collectChatConversationSourceAudit(
    options: ChatSourceAuditOptions | null | undefined
): TChatConversationSourceAudit | undefined {
    const runtimePrincipal = readObjectProperty(options, 'runtimePrincipal')
    const sourceIntegrationId =
        readStringProperty(runtimePrincipal, 'sourceIntegrationId') ??
        readStringProperty(options, 'sourceIntegrationId') ??
        readStringProperty(options, 'integrationId')
    const channelType = normalizeAuditChannelType(readStringProperty(options, 'channelType'))
    const sourceMessageLogIds = uniq([
        ...readStringListProperty(options, 'sourceMessageLogIds'),
        ...readStringListProperty(options, 'currentInboundLogIds')
    ])

    if (!sourceIntegrationId && !channelType && sourceMessageLogIds.length === 0) {
        return undefined
    }

    return {
        ...(sourceIntegrationId ? { sourceIntegrationId } : {}),
        ...(channelType ? { channelType } : {}),
        ...(sourceMessageLogIds.length ? { sourceMessageLogIds } : {})
    }
}

function normalizeAuditChannelType(channelType: string | undefined): string | undefined {
    if (channelType === 'wechat_personal' || channelType === 'wecom') {
        return 'wechat'
    }

    return channelType
}

function readNonEmptyString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined
}

function readObjectProperty(container: unknown, property: string): unknown {
    if (!container || typeof container !== 'object' || Array.isArray(container)) {
        return null
    }
    return Reflect.get(container, property)
}

function readStringProperty(container: unknown, property: string): string | undefined {
    return readNonEmptyString(readObjectProperty(container, property))
}

function readStringList(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return []
    }
    return value.filter((item): item is string => typeof item === 'string' && item.length > 0)
}

function readStringListProperty(container: unknown, property: string): string[] {
    return readStringList(readObjectProperty(container, property))
}

function compactExecutionMetadata(input: Record<string, unknown>): TAgentExecutionMetadata | undefined {
    const metadata = Object.entries(input).reduce<Record<string, unknown>>((acc, [key, value]) => {
        if (value === undefined || value === null) {
            return acc
        }
        if (Array.isArray(value) && value.length === 0) {
            return acc
        }
        acc[key] = value
        return acc
    }, {})
    return Object.keys(metadata).length ? (metadata as TAgentExecutionMetadata) : undefined
}
