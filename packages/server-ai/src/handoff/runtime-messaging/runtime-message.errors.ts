import { AgentInvocationAuthorizationError } from '../../agent-invocation/invocation-errors'
import { z } from 'zod/v3'
import { HttpException } from '@nestjs/common'
import { t } from 'i18next'

export type RuntimeMessageErrorCode = 'Invalid' | 'Access' | 'Consumed' | 'Busy' | 'Blocked' | 'Unknown'
export function runtimeMessageError(code: RuntimeMessageErrorCode) {
    return new HttpException(
        t(`server-ai:Error.RuntimeMessage${code}`),
        code === 'Access' ? 403 : code === 'Invalid' ? 400 : 409
    )
}

export function isRuntimeMessageBlocked(error: unknown): boolean {
    return (
        error instanceof AgentInvocationAuthorizationError ||
        error instanceof z.ZodError ||
        (error instanceof HttpException && [400, 403, 404, 409, 422].includes(error.getStatus()))
    )
}
