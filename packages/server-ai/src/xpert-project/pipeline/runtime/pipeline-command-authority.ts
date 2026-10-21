import { ForbiddenException } from '@nestjs/common'
import type { ProjectPipelineCommandCapability } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'

// The pipeline SQL outbox restores a business actor, not the original credential audience.
// Configuration saves do not dispatch work; execution still requires a durable credential audience.
export function pipelineCommandCapability(
    operation: 'configure' | 'execute' = 'execute'
): ProjectPipelineCommandCapability {
    return operation === 'execute' && RequestContext.currentApiPrincipal()
        ? { allowed: false, reason: 'PIPELINE_SCOPED_DELEGATION_UNAVAILABLE' }
        : { allowed: true }
}

export function assertPipelineCommandAuthority() {
    const capability = pipelineCommandCapability()
    if (capability.allowed === false)
        throw new ForbiddenException({
            code: capability.reason,
            message: t('server-ai:Error.ProjectPipelineScopedDelegationUnavailable')
        })
}
