import { ChatKitReference, stringifyMessageContent, TChatRequestHuman } from '@xpert-ai/contracts'

type TFollowUpMessageLike = {
    id?: string | null
    role?: string | null
    content?: unknown
    references?: unknown
    attachments?: unknown
    fileAssets?: unknown
    followUpStatus?: 'pending' | 'consumed' | 'canceled' | null
    targetExecutionId?: string | null
    thirdPartyMessage?: unknown
}

export type TCollectedPendingFollowUps<T extends TFollowUpMessageLike> = {
    matched: T
    items: T[]
    mergedHumanInput: TChatRequestHuman
    targetExecutionId: string | null
    messageIds: string[]
    clientMessageIds: string[]
}

function normalizeString(value: unknown): string | null {
    if (typeof value !== 'string') {
        return null
    }

    const normalized = value.trim()
    return normalized || null
}

function isPendingFollowUpMessage<T extends TFollowUpMessageLike>(message: T | null | undefined): message is T {
    return message?.role === 'human' && message.followUpStatus === 'pending'
}

function mergeInputText(previousInput: unknown, nextInput: unknown): string | undefined {
    const segments = [previousInput, nextInput].filter(
        (value): value is string => typeof value === 'string' && value.trim().length > 0
    )

    return segments.length ? segments.join('\n\n') : undefined
}

function mergeArrayValues<T>(previousValue: unknown, nextValue: unknown): T[] | undefined {
    const merged = [
        ...(Array.isArray(previousValue) ? (previousValue as T[]) : []),
        ...(Array.isArray(nextValue) ? (nextValue as T[]) : [])
    ]

    return merged.length ? merged : undefined
}

export function readFollowUpClientMessageId(message: Pick<TFollowUpMessageLike, 'thirdPartyMessage'>): string | null {
    const raw = message.thirdPartyMessage as { followUpClientMessageId?: unknown } | null | undefined
    return normalizeString(raw?.followUpClientMessageId)
}

export function readPersistedFollowUpInput(message: TFollowUpMessageLike): TChatRequestHuman {
    const raw =
        message.thirdPartyMessage &&
        typeof message.thirdPartyMessage === 'object' &&
        'followUpInput' in message.thirdPartyMessage
            ? ((message.thirdPartyMessage as { followUpInput?: TChatRequestHuman }).followUpInput ?? {})
            : {}

    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        const inputText =
            typeof raw.input === 'string' && raw.input.trim() ? raw.input : stringifyMessageContent(message.content)
        /**
         * @deprecated Legacy follow-ups may only have StorageFile attachments;
         * replay them only when FileAsset handles are absent.
         */
        const legacyAttachmentFiles =
            Array.isArray(message.attachments) && message.attachments.length
                ? (message.attachments as TChatRequestHuman['files'])
                : undefined
        const files =
            Array.isArray(raw.files) && raw.files.length
                ? raw.files
                : Array.isArray(message.fileAssets) && message.fileAssets.length
                  ? (message.fileAssets as TChatRequestHuman['files'])
                  : legacyAttachmentFiles
        const references =
            Array.isArray(raw.references) && raw.references.length
                ? raw.references
                : Array.isArray(message.references) && message.references.length
                  ? (message.references as TChatRequestHuman['references'])
                  : undefined

        return {
            ...raw,
            ...(inputText ? { input: inputText } : {}),
            ...(files?.length ? { files } : {}),
            ...(Array.isArray(references) && references.length ? { references } : {})
        }
    }

    const content = stringifyMessageContent(message.content)
    return {
        ...(content ? { input: content } : {}),
        ...(Array.isArray(message.fileAssets) && message.fileAssets.length
            ? {
                  files: message.fileAssets as TChatRequestHuman['files']
              }
            : Array.isArray(message.attachments) && message.attachments.length
              ? {
                    // Legacy StorageFile attachments are replayed only when
                    // FileAsset handles are absent.
                    files: message.attachments as TChatRequestHuman['files']
                }
              : {}),
        ...(Array.isArray(message.references) && message.references.length
            ? {
                  references: message.references as TChatRequestHuman['references']
              }
            : {})
    }
}

export function mergeFollowUpHumanInputs(inputs: Array<TChatRequestHuman | null | undefined>): TChatRequestHuman {
    return inputs.reduce<TChatRequestHuman>((acc, item) => {
        const nextInput = item ?? {}
        const { input, files, references, ...rest } = nextInput
        const next: TChatRequestHuman = {
            ...acc,
            ...rest
        }
        const mergedInput = mergeInputText(acc.input, input)
        const mergedFiles = mergeArrayValues(acc.files, files)
        const mergedReferences = mergeArrayValues<ChatKitReference>(acc.references, references)

        if (mergedInput) {
            next.input = mergedInput
        } else {
            delete next.input
        }

        if (mergedFiles?.length) {
            next.files = mergedFiles
        } else {
            delete next.files
        }

        if (mergedReferences?.length) {
            next.references = mergedReferences
        } else {
            delete next.references
        }

        return next
    }, {})
}

export function findPendingFollowUpByClientMessageId<T extends TFollowUpMessageLike>(
    messages: T[] | null | undefined,
    clientMessageId: string | null | undefined
): T | null {
    const normalizedClientMessageId = normalizeString(clientMessageId)
    if (!normalizedClientMessageId) {
        return null
    }

    return (
        [...(messages ?? [])]
            .reverse()
            .find(
                (message) =>
                    isPendingFollowUpMessage(message) &&
                    readFollowUpClientMessageId(message) === normalizedClientMessageId
            ) ?? null
    )
}

export function collectPendingFollowUpsByClientMessageId<T extends TFollowUpMessageLike>(
    messages: T[] | null | undefined,
    clientMessageId: string | null | undefined
): TCollectedPendingFollowUps<T> | null {
    const matched = findPendingFollowUpByClientMessageId(messages, clientMessageId)
    if (!matched) {
        return null
    }

    const items = [matched]

    return {
        matched,
        items,
        mergedHumanInput: mergeFollowUpHumanInputs(items.map(readPersistedFollowUpInput)),
        targetExecutionId: normalizeString(matched.targetExecutionId),
        messageIds: items
            .map((message) => normalizeString(message.id))
            .filter((messageId): messageId is string => Boolean(messageId)),
        clientMessageIds: items
            .map((message) => readFollowUpClientMessageId(message) ?? normalizeString(message.id))
            .filter((messageId): messageId is string => Boolean(messageId))
    }
}
