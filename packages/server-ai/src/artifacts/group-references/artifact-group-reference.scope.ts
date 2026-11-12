import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { RequestContext, type ContentActor } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'

/** Adapters read the authenticated caller; no identity or Project override is accepted from clients. */
export function artifactReferenceActor(): ContentActor {
    const tenantId = RequestContext.currentTenantId(),
        organizationId = RequestContext.getOrganizationId(),
        userId = RequestContext.currentUserId()
    if (!tenantId || !organizationId || !userId || RequestContext.currentApiKey())
        throw new ForbiddenException(t('server-ai:Error.ArtifactUseGrantDenied'))
    return { tenantId, organizationId, userId }
}
export function artifactReferenceInvalid() {
    return new BadRequestException(t('server-ai:Error.ArtifactGroupReferenceInvalid'))
}
