import { IUser, XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import { RuntimeIdentityScope } from '@xpert-ai/plugin-sdk'
import { ResolveUserOrganizationAccessCommand } from '@xpert-ai/server-core'
import { ForbiddenException, Injectable } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { t } from 'i18next'
import { Xpert } from '../xpert/xpert.entity'
import { XpertWorkspace } from '../xpert-workspace/workspace.entity'
import { PluginApplicationInstallation } from './plugin-application-installation.entity'

@Injectable()
export class ApplicationRuntimeService {
    constructor(
        @InjectRepository(PluginApplicationInstallation)
        private readonly installations: Repository<PluginApplicationInstallation>,
        @InjectRepository(Xpert) private readonly assistants: Repository<Xpert>,
        @InjectRepository(XpertWorkspace) private readonly workspaces: Repository<XpertWorkspace>,
        private readonly commands: CommandBus
    ) {}

    /** Resolve installation metadata from trusted host scope; resource access is authorized separately. */
    async resolveInstallation(
        scope: RuntimeIdentityScope
    ): Promise<NonNullable<XpertResolvedViewHostContext['application']> | null> {
        const { tenantId, organizationId, userId, workspaceId, xpertId } = scope
        if (!tenantId || !organizationId || !workspaceId || !xpertId) return null
        const installation = await this.installations.findOneBy({ tenantId, organizationId, workspaceId })
        if (!installation) return null
        // Existing organization runtime credentials retain their existing authorization path.
        // Personal App identity additionally requires a currently active human member.
        const personal = installation.declaredScope === 'personal'
        const member =
            !personal ||
            (userId &&
                (await this.commands.execute<ResolveUserOrganizationAccessCommand, IUser | null>(
                    new ResolveUserOrganizationAccessCommand({ tenantId, organizationId, userId })
                )))
        const assistant = await this.assistants.existsBy({ id: xpertId, tenantId, organizationId, workspaceId })
        const workspace = await this.workspaces.findOneBy({ id: workspaceId, tenantId, organizationId })
        if (
            !member ||
            !assistant ||
            !workspace ||
            workspace.status === 'archived' ||
            (installation.declaredScope === 'personal' &&
                (!installation.ownerUserId || workspace.ownerId !== installation.ownerUserId))
        )
            throw new ForbiddenException(t('server-ai:Error.ApplicationOrganizationAccessDenied'))
        return {
            installationId: installation.id,
            pluginName: installation.pluginName,
            appName: installation.appName,
            scope: installation.declaredScope,
            ownerUserId: installation.ownerUserId ?? null
        }
    }
}
