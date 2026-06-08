import {
    IChatConversation,
    IChatMessage,
    IChatMessageFeedback,
    TChatConversationOptions,
    TChatConversationStatus,
    TChatFrom,
    TSensitiveOperation
} from '@xpert-ai/contracts'
import { Exclude, Expose } from 'class-transformer'
import {
    normalizeRuntimeCapabilitiesSelection,
    type TRuntimeCapabilitiesSelectionWithRecommended
} from '../../shared/agent/runtime-capabilities'

type ChatMessageThirdPartyMetadata = {
    runtimeCapabilities?: unknown
}

function isObjectValue(value: unknown): value is object {
    return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readRuntimeCapabilitiesMetadata(value: unknown): unknown {
    if (!isObjectValue(value) || !('runtimeCapabilities' in value)) {
        return undefined
    }

    return (value as ChatMessageThirdPartyMetadata).runtimeCapabilities
}

@Exclude()
export class ConversationDTO {
    @Expose()
    id: string

    @Expose()
    threadId: string

    @Expose()
    title?: string

    @Expose()
    status?: TChatConversationStatus

    @Expose()
    from?: TChatFrom

    @Expose()
    fromEndUserId?: string

    @Expose()
    options?: TChatConversationOptions

    @Expose()
    error?: string

    @Expose()
    operation?: TSensitiveOperation

    @Expose()
    xpertId?: string

    @Expose()
    projectId?: string

    @Expose()
    taskId?: string

    @Expose()
    createdAt?: Date

    @Expose()
    updatedAt?: Date

    constructor(partial: Partial<IChatConversation>) {
        Object.assign(this, partial)
    }
}

@Exclude()
export class ChatMessageDTO {
    @Expose()
    id: string

    @Expose()
    conversationId?: string

    @Expose()
    role?: IChatMessage['role']

    @Expose()
    content?: IChatMessage['content']

    @Expose()
    reasoning?: IChatMessage['reasoning']

    @Expose()
    references?: IChatMessage['references']

    /**
     * @deprecated Use `fileAssets` on chat messages for parsed attachments.
     */
    @Expose()
    attachments?: IChatMessage['attachments']

    /**
     * Parsed file-understanding attachments exposed to ChatKit clients.
     */
    @Expose()
    fileAssets?: IChatMessage['fileAssets']

    @Expose()
    status?: IChatMessage['status']

    @Expose()
    error?: string

    @Expose()
    executionId?: string

    @Expose()
    createdAt?: Date

    @Expose()
    updatedAt?: Date

    @Expose()
    runtimeCapabilities?: TRuntimeCapabilitiesSelectionWithRecommended

    constructor(partial: Partial<IChatMessage>) {
        Object.assign(this, partial)
        const runtimeCapabilities = normalizeRuntimeCapabilitiesSelection(
            readRuntimeCapabilitiesMetadata(partial.thirdPartyMessage)
        )
        if (runtimeCapabilities) {
            this.runtimeCapabilities = runtimeCapabilities
        }
    }
}

@Exclude()
export class ChatMessageFeedbackDTO {
    @Expose()
    id: string

    @Expose()
    conversationId?: string

    @Expose()
    messageId?: string

    @Expose()
    rating?: IChatMessageFeedback['rating']

    @Expose()
    content?: string

    @Expose()
    createdAt?: Date

    @Expose()
    updatedAt?: Date

    constructor(partial: Partial<IChatMessageFeedback>) {
        Object.assign(this, partial)
    }
}
