// Provider cancellation is a request until the pinned adapter proves the original operation drained.
// Legacy cancelled snapshots remain inspectable and cannot admit a replacement business attempt.
import {
    executionControlEvidenceSchema,
    unknownExecutionControl,
    type ExecutionControlEvidence
} from '@xpert-ai/contracts'
import {
    AgentInvocation,
    AgentRuntimeObservation,
    IAgentRuntimeStrategy,
    isAgentInvocationTerminal
} from '@xpert-ai/plugin-sdk'
import { AgentInvocationError } from './invocation-errors'

export function invocationCanRelease(
    invocation: AgentInvocation
): invocation is AgentInvocation & { status: 'succeeded' | 'failed' | 'cancelled' } {
    if (!isAgentInvocationTerminal(invocation.status)) return false
    if (
        !invocation.control &&
        invocation.status !== 'cancelled' &&
        invocation.controlAdapter !== 'native-assistant-task'
    )
        return true
    const parsed = executionControlEvidenceSchema.safeParse(invocation.controlEvidence)
    return parsed.success && matchesCompletion(invocation, parsed.data)
}

function matchesCompletion(invocation: AgentInvocation, evidence: ExecutionControlEvidence): boolean {
    if (evidence.state !== 'settled') return false
    if (evidence.source === 'platform')
        return (
            invocation.controlAdapter === 'native-assistant-task' &&
            evidence.subject.kind === 'execution' &&
            evidence.subject.id === invocation.handle?.runId
        )
    if (
        evidence.subject.kind !== 'invocation' ||
        evidence.subject.id !== invocation.id ||
        evidence.outcome !== invocation.status
    )
        return false
    return (
        evidence.source === 'host_admission' ||
        (evidence.source === 'provider' &&
            evidence.sessionId === invocation.handle?.sessionId &&
            evidence.runId === invocation.handle?.runId)
    )
}

/** Parse strategy/checkpoint input once; host-only sources cannot be asserted by a plugin. */
export function checkedControlObservation(
    invocation: AgentInvocation,
    observation: AgentRuntimeObservation,
    strategy: IAgentRuntimeStrategy,
    builtin: boolean
): AgentRuntimeObservation {
    if (
        invocation.handle &&
        observation.handle &&
        !invocation.startPendingUntil &&
        (invocation.handle.sessionId !== observation.handle.sessionId ||
            invocation.handle.runId !== observation.handle.runId)
    )
        throw new AgentInvocationError('InvalidRequest')
    let evidence: ExecutionControlEvidence | undefined
    if (observation.controlEvidence !== undefined) {
        const parsed = executionControlEvidenceSchema.safeParse(observation.controlEvidence)
        if (!parsed.success) throw new AgentInvocationError('InvalidRequest')
        evidence = parsed.data
        const handle = observation.handle ?? invocation.handle
        if (evidence.source === 'provider') {
            if (
                strategy.capabilities.completionEvidence !== 1 ||
                evidence.subject.id !== invocation.id ||
                evidence.sessionId !== handle?.sessionId ||
                evidence.runId !== handle?.runId ||
                (invocation.handle &&
                    (handle.sessionId !== invocation.handle.sessionId || handle.runId !== invocation.handle.runId)) ||
                evidence.outcome !== observation.status
            )
                throw new AgentInvocationError('InvalidRequest')
        } else if (evidence.source === 'platform') {
            if (
                !builtin ||
                invocation.controlAdapter !== 'native-assistant-task' ||
                evidence.subject.kind !== 'execution' ||
                evidence.subject.id !== (invocation.handle ?? handle)?.runId
            )
                throw new AgentInvocationError('InvalidRequest')
        } else if (evidence.source !== 'unavailable') throw new AgentInvocationError('InvalidRequest')
    }
    const next = { ...observation, ...(evidence ? { controlEvidence: evidence } : {}) }
    if (
        (invocation.control ||
            observation.status === 'cancelled' ||
            invocation.controlAdapter === 'native-assistant-task') &&
        isAgentInvocationTerminal(observation.status)
    ) {
        if (!invocationCanRelease({ ...invocation, ...next, controlEvidence: evidence }))
            return {
                ...next,
                status:
                    invocation.control || observation.status === 'cancelled'
                        ? 'cancelling'
                        : evidence?.state === 'paused'
                          ? 'waiting'
                          : 'unknown',
                controlEvidence:
                    evidence ??
                    unknownExecutionControl(
                        { kind: 'invocation', id: invocation.id },
                        strategy.capabilities.completionEvidence === 1 ? 'unconfirmed' : 'unsupported'
                    )
            }
    }
    return next
}

export function notStartedEvidence(id: string, outcome: 'failed' | 'cancelled'): ExecutionControlEvidence {
    return {
        version: 1,
        source: 'host_admission',
        subject: { kind: 'invocation', id },
        scope: 'operation',
        state: 'settled',
        outcome,
        reason: 'not_started',
        observedAt: new Date().toISOString()
    }
}
