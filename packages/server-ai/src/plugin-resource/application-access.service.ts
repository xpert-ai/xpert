import { IUser, RolesEnum, PluginTemplateApplicationSummary } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ResolveUserOrganizationAccessCommand } from '@xpert-ai/server-core'
import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { t } from 'i18next'
import { applicationInitializationAccess } from './application-scope'

@Injectable()
export class ApplicationAccessService {
    constructor(private readonly commands: CommandBus) {}

    /** Read requests may discover metadata before choosing an organization. */
    async assertMembership() {
        if (RequestContext.currentApiPrincipal())
            throw new ForbiddenException(t('server-ai:Error.ApplicationUserRequired'))
        const tenantId = RequestContext.currentTenantId(),
            organizationId = RequestContext.getOrganizationId()
        const userId = RequestContext.currentUserId()
        if (!organizationId) return null
        if (!tenantId || !userId) throw new ForbiddenException(t('server-ai:Error.ApplicationUserRequired'))
        const user = await this.commands.execute<ResolveUserOrganizationAccessCommand, IUser | null>(
            new ResolveUserOrganizationAccessCommand({ tenantId, organizationId, userId })
        )
        if (!user) throw new ForbiddenException(t('server-ai:Error.ApplicationOrganizationAccessDenied'))
        return user
    }

    async assertCanInitialize(application: PluginTemplateApplicationSummary) {
        const user = await this.assertMembership()
        const access = applicationInitializationAccess(application)
        if (access === 'unsupported') throw new BadRequestException('scope_not_supported')
        if (access === 'organization_required') throw new BadRequestException('organization_scope_required')
        if (
            access === 'role_required' ||
            (application.scope === 'organization' &&
                ![RolesEnum.SUPER_ADMIN, RolesEnum.ADMIN, RolesEnum.TRIAL].some((role) => role === user?.role?.name))
        )
            throw new ForbiddenException('role_required')
    }
}
