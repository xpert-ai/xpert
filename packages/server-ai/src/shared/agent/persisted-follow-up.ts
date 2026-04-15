type TFollowUpMessageLike = {
    role?: string | null
    followUpStatus?: 'pending' | 'consumed' | 'canceled' | null
    thirdPartyMessage?: unknown
}

export function readFollowUpClientMessageId(message: Pick<TFollowUpMessageLike, 'thirdPartyMessage'>): string | null {
    const raw = message.thirdPartyMessage as { followUpClientMessageId?: unknown } | null | undefined
    return typeof raw?.followUpClientMessageId === 'string' && raw.followUpClientMessageId.trim()
        ? raw.followUpClientMessageId.trim()
        : null
}

export function findPendingFollowUpByClientMessageId<T extends TFollowUpMessageLike>(
    messages: T[] | null | undefined,
    clientMessageId: string | null | undefined
): T | null {
    if (!clientMessageId?.trim()) {
        return null
    }

    const normalizedClientMessageId = clientMessageId.trim()

    return (
        [...(messages ?? [])]
            .reverse()
            .find(
                (message) =>
                    message?.role === 'human' &&
                    message.followUpStatus === 'pending' &&
                    readFollowUpClientMessageId(message) === normalizedClientMessageId
            ) ?? null
    )
}
