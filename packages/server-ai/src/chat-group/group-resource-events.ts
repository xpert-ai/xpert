import type { ChatGroupMessage, ChatGroupResourceOpenRequest } from '@xpert-ai/contracts'

/** A persisted clickable entry is inert. Only fresh, addressed requests become live UI events. */
export function groupResourceEvents(viewerParticipantId: string, connectedAt: number) {
    const emitted = new Set<string>()
    return (messages: ChatGroupMessage[]): ChatGroupResourceOpenRequest[] =>
        messages.flatMap((message) => {
            const { resourceLinks, resourceNavigation: request } = message.communication
            if (
                !request ||
                request.participantId !== viewerParticipantId ||
                request.issuedAt < connectedAt ||
                request.issuedAt > Date.now() + 5000 ||
                resourceLinks?.length !== 1 ||
                emitted.has(request.requestId)
            )
                return []
            emitted.add(request.requestId)
            return [{ ...resourceLinks[0], requestId: request.requestId, clientMessageId: request.clientMessageId }]
        })
}
