import type { IChatMessage, TChatMessageBranching } from '@xpert-ai/contracts'
import { createHash } from 'node:crypto'

/** Exclude row identities and timestamps so a copied reply can retain its content integrity check. */
export function branchMessageHash(message: Partial<IChatMessage>): string {
    return createHash('sha256')
        .update(
            JSON.stringify({
                content: message.content ?? null,
                references: message.references ?? null,
                reasoning: message.reasoning ?? null
            })
        )
        .digest('hex')
}

/** The caller supplies root-to-reply order; roles and content bind the whole selected conversation prefix. */
export function branchMessagePathHash(messages: Partial<IChatMessage>[]): string {
    return createHash('sha256')
        .update(JSON.stringify(messages.map((message) => [message.role, branchMessageHash(message)])))
        .digest('hex')
}

/** Only a sealed successful message can advertise a graph boundary. Never infer it from a run id. */
export function messageBranching(message: Partial<IChatMessage>): TChatMessageBranching | undefined {
    if (message.role !== 'ai') return undefined
    if (message.status !== 'success') return { available: false, reason: 'message_not_complete' }
    const anchor = message.outputCheckpoint
    if (anchor && anchor.version !== 1) return { available: false, reason: 'state_not_supported' }
    if (
        !anchor?.checkpoint ||
        !anchor.graphRevision ||
        !anchor.checkpoints?.length ||
        !anchor.messagePathHash ||
        anchor.messageHash !== branchMessageHash(message)
    )
        return { available: false, reason: 'checkpoint_unavailable' }
    return { available: true }
}

/** Strip internal checkpoints on raw SSE paths as well as on DTO-based history reads. */
export function publicChatMessage<T extends Partial<IChatMessage>>(message: T) {
    const { outputCheckpoint: _checkpoint, historicalAgentRuns, ...visible } = message
    const agentRuns = historicalAgentRuns ?? _checkpoint?.agentRuns
    return {
        ...visible,
        branching: messageBranching(message),
        ...(agentRuns ? { agentRuns } : {}),
        ...(historicalAgentRuns ? { historical: true } : {})
    }
}
