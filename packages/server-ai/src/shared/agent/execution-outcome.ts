import { isToolMessage, type BaseMessage } from '@langchain/core/messages'
import type { TAgentExecutionOutcome } from '@xpert-ai/contracts'

/** Protocol projection only: never infer acceptance from prose or mutate domain tasks. */
export function executionOutcome(messages: BaseMessage[], executionId: string): TAgentExecutionOutcome | undefined {
    for (let i = messages.length - 1; i >= 0; i--) {
        const message = messages[i]
        if (!isToolMessage(message)) continue
        const artifact: unknown = message.artifact
        if (
            !artifact ||
            typeof artifact !== 'object' ||
            !('type' in artifact) ||
            artifact.type !== 'agent_execution_outcome' ||
            !('executionId' in artifact) ||
            artifact.executionId !== executionId ||
            !('outcome' in artifact)
        )
            continue
        const outcome = parseExecutionOutcome(artifact.outcome)
        if (outcome) return outcome
    }
}

export function parseExecutionOutcome(value: unknown): TAgentExecutionOutcome | undefined {
    if (
        !value ||
        typeof value !== 'object' ||
        !('status' in value) ||
        !('subjectId' in value) ||
        typeof value.subjectId !== 'string' ||
        !value.subjectId ||
        !('accepted' in value) ||
        typeof value.accepted !== 'boolean'
    )
        return
    const status = value.status
    if (
        status !== 'accepted' &&
        status !== 'already_completed' &&
        status !== 'not_claimed' &&
        status !== 'blocked' &&
        status !== 'failed' &&
        status !== 'incomplete'
    )
        return
    if (value.accepted !== (status === 'accepted' || status === 'already_completed')) return
    return {
        status,
        subjectId: value.subjectId,
        accepted: value.accepted,
        ...('message' in value && typeof value.message === 'string' ? { message: value.message.slice(0, 1500) } : {}),
        ...('versionId' in value && typeof value.versionId === 'string' ? { versionId: value.versionId } : {})
    }
}
