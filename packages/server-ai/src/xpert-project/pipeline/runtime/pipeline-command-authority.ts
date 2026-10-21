import { ForbiddenException } from '@nestjs/common'
import { SecretTokenBindingType, type ProjectPipelineCommandCapability } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'

// Interactive USER_XPERT sessions initiate durable Project work as the signed-in user.
// Entry points and workers retain live Project, Assistant and Connector authorization.
// Resource credentials still require durable audience delegation before they may dispatch work.
// TODO: 之后改造更严格的权限检查。
export function pipelineCommandCapability(
    operation: 'configure' | 'execute' = 'execute'
): ProjectPipelineCommandCapability {
    const principal = RequestContext.currentApiPrincipal()
    if (operation === 'configure' || !principal) return { allowed: true }
    if (
        principal.principalType === 'client_secret' &&
        principal.clientSecretBindingType === SecretTokenBindingType.USER_XPERT &&
        principal.id &&
        principal.tenantId &&
        principal.resourceScope?.kind === 'assistant' &&
        principal.resourceScope.xpertId.trim()
    )
        return { allowed: true }
    return { allowed: false, reason: 'PIPELINE_SCOPED_DELEGATION_UNAVAILABLE' }
}

export function assertPipelineCommandAuthority() {
    const capability = pipelineCommandCapability()
    if (capability.allowed === false)
        throw new ForbiddenException({
            code: capability.reason,
            message: t('server-ai:Error.ProjectPipelineScopedDelegationUnavailable')
        })
}
