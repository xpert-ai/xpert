import { HttpException } from '@nestjs/common'
import { t } from 'i18next'
import { z } from 'zod/v3'
/** Only host preflight may assert this: no executor has received task input or a launch receipt. */
export class AgentInvocationNotStartedError extends Error {}
/** Authorization failures must stop the run, not become an ordinary retryable tool result. */
export class AgentInvocationAuthorizationError extends Error {
    constructor(readonly cause: unknown) {
        super(
            cause instanceof Error
                ? cause.message
                : t('server-ai:Error.AgentInvocationInvalidScope', {
                      defaultValue: 'Agent invocation authorization failed'
                  })
        )
        this.name = 'AgentInvocationAuthorizationError'
    }
}

export async function authorizeAgentInvocation(check: () => Promise<void>) {
    try {
        await check()
    } catch (error) {
        throw new AgentInvocationAuthorizationError(error)
    }
}

export type AgentInvocationErrorCode =
    | 'ModelSourceRequired'
    | 'InvalidScope'
    | 'InvalidRequest'
    | 'CallConflict'
    | 'ProviderUnavailable'
    | 'ProviderChanged'
    | 'DispatchUnknown'
    | 'NotFound'
    | 'Unsupported'
    | 'InteractionConflict'
    | 'MissingResult'
    | 'ConcurrentUpdate'
const status: Record<AgentInvocationErrorCode, number> = {
    ModelSourceRequired: 400,
    InvalidScope: 403,
    InvalidRequest: 400,
    CallConflict: 409,
    ProviderUnavailable: 503,
    ProviderChanged: 409,
    DispatchUnknown: 409,
    NotFound: 404,
    Unsupported: 422,
    InteractionConflict: 409,
    MissingResult: 502,
    ConcurrentUpdate: 409
}
export class AgentInvocationError extends HttpException {
    constructor(readonly code: AgentInvocationErrorCode) {
        super(t(`server-ai:Error.AgentInvocation${code}`, { defaultValue: `Agent invocation: ${code}` }), status[code])
    }
}

/** Persist only host-defined codes/statuses; exception messages and response bodies may contain secrets. */
export function invocationFailureReason(error: unknown): string | null {
    if (error instanceof AgentInvocationAuthorizationError) {
        return `authorization_failed:${invocationFailureCause(error.cause) ?? 'unavailable'}`
    }
    return invocationFailureCause(error)
}

function invocationFailureCause(error: unknown): string | null {
    if (error instanceof AgentInvocationError) return `invocation_${error.code}`
    if (error instanceof HttpException) return `http_${error.getStatus()}`
    if (error instanceof z.ZodError) return 'invalid_payload'
    return null
}
