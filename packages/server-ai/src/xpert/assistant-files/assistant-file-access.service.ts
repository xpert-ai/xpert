// Invariants: Assistant files belong to a data volume, not an XpertWorkspace entity.
// Runtime access checks the exact published Assistant and current user grant;
// authoring access is explicit and never a fallback after runtime denial.
import { ForbiddenException, Inject } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { resolveXpertDataVolumeScope } from '../../shared/volume'
import { PublishedXpertAccessService } from '../published-xpert-access.service'
import { XpertService } from '../xpert.service'
import { AssistantFileAccess, ResolveAssistantFileAccessCommand } from './resolve-assistant-file-access.command'

@CommandHandler(ResolveAssistantFileAccessCommand)
export class AssistantFileAccessService implements ICommandHandler<ResolveAssistantFileAccessCommand> {
    constructor(
        @Inject(PublishedXpertAccessService)
        private readonly published: Pick<PublishedXpertAccessService, 'getAccessiblePublishedXpertForCurrentUser'>,
        @Inject(XpertService)
        private readonly xperts: Pick<XpertService, 'assertCanAuthorById' | 'findOneByIdWithinTenant'>
    ) {}

    async execute(command: ResolveAssistantFileAccessCommand): Promise<AssistantFileAccess> {
        const tenantId = RequestContext.currentTenantId()
        const userId = RequestContext.currentUserId()
        if (!tenantId || !userId) throw this.denied()

        let xpert
        if (command.entry === 'authoring') {
            // Delegated credentials cannot select the Studio authority, including internal callers.
            if (RequestContext.currentApiPrincipal()) throw this.denied()
            await this.xperts.assertCanAuthorById(command.assistantId)
            xpert = await this.xperts.findOneByIdWithinTenant(command.assistantId)
        } else {
            xpert = await this.published.getAccessiblePublishedXpertForCurrentUser(command.assistantId)
        }
        if (xpert.tenantId !== tenantId) throw this.denied()

        const scope = resolveXpertDataVolumeScope({
            tenantId,
            userId,
            xpertId: xpert.id,
            workspaceDataScope: xpert.workspaceDataScope
        })
        // Explicit file policy: authorized users collaborate with full CRUD in shared volumes;
        // user-isolated volumes grant the same operations only within the current user's root.
        return { scope, capabilities: { canList: true, canRead: true, canWrite: true, canDelete: true } }
    }

    private denied() {
        return new ForbiddenException(
            t('server-ai:Error.WorkspaceFileAccessDenied', { defaultValue: 'Workspace file access was denied.' })
        )
    }
}
