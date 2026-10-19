import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { IXpert, resolveRuntimeXpert, SecretTokenBindingType } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { PublishedXpertAccessService } from '../../published-xpert-access.service'
import { XpertService } from '../../xpert.service'
import { ResolveSpeechAssistantQuery } from '../resolve-speech-assistant.query'

@QueryHandler(ResolveSpeechAssistantQuery)
export class ResolveSpeechAssistantHandler implements IQueryHandler<ResolveSpeechAssistantQuery> {
    constructor(
        private readonly published: PublishedXpertAccessService,
        private readonly xperts: XpertService
    ) {}

    async execute({ xpertId, options }: ResolveSpeechAssistantQuery) {
        xpertId = xpertId?.trim()
        if (!xpertId) throw new BadRequestException('speech_to_text_xpert_id_required')
        const actor = RequestContext.currentUser()
        const tenantId = RequestContext.currentTenantId()
        const organizationId = RequestContext.getOrganizationId()
        if (!actor?.id) throw new BadRequestException('speech_to_text_actor_required')
        if (!tenantId || actor.tenantId !== tenantId || (options.tenantId && options.tenantId !== tenantId))
            throw new ForbiddenException('speech_to_text_actor_tenant_mismatch')
        if (options.organizationId && options.organizationId !== organizationId)
            throw new ForbiddenException('speech_to_text_actor_organization_mismatch')

        const principal = RequestContext.currentApiPrincipal()
        const scope = principal?.resourceScope
        if (scope?.kind === 'assistant' && scope.xpertId !== xpertId)
            throw new ForbiddenException('speech_to_text_xpert_delegation_mismatch')

        let xpert: IXpert
        if (options.isDraft) {
            if (principal) throw new ForbiddenException(t('server-ai:Error.AssistantAccessForbidden'))
            await this.xperts.assertCanAuthorById(xpertId)
            xpert = resolveRuntimeXpert(await this.xperts.findOneByIdWithinTenant(xpertId), true)
        } else {
            // A service delegation grants only its exact published audience. Human recipients
            // retain their own sharing grants; neither path needs authoring workspace membership.
            const isPublicSession =
                principal?.principalType === 'client_secret' &&
                principal.clientSecretBindingType === SecretTokenBindingType.PUBLIC_XPERT
            xpert =
                scope?.kind === 'assistant' && !principal.requestedUserId && !isPublicSession
                    ? await this.published.getPublishedXpertInTenant(xpertId)
                    : await this.published.getAccessiblePublishedXpert(xpertId)
        }
        if (xpert.tenantId !== tenantId) throw new ForbiddenException('speech_to_text_actor_tenant_mismatch')
        if (xpert.organizationId && xpert.organizationId !== organizationId)
            throw new ForbiddenException('speech_to_text_xpert_organization_mismatch')
        return xpert
    }
}
