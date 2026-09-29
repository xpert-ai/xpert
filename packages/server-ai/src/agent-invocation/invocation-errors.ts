import { HttpException } from '@nestjs/common'
import { t } from 'i18next'
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
