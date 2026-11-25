// Navigation resolves current runtime access and enabled Views. It never activates a feature,
// changes Project membership, or treats a notification payload as an authorization grant.
import { NotFoundException } from '@nestjs/common'
import { IQueryHandler, Query, QueryHandler } from '@nestjs/cqrs'
import { AGENT_WORKBENCH_SLOT, type AssistantWorkbenchViewInput, type WorkbenchEntry } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ViewExtensionService } from '@xpert-ai/server-core'
import { t } from 'i18next'
import { PublishedXpertAccessService } from '../../published-xpert-access.service'
import { XpertProjectAccessService } from '../../../xpert-project/services/project-access.service'
import { XpertProjectXpertBindingService } from '../../../xpert-project/services/project-xpert-binding.service'

/** Resolve a published Assistant's enabled Workbench destination under current runtime access. */
export class AssistantWorkbenchEntryQuery extends Query<WorkbenchEntry> {
    constructor(
        readonly assistantId: string,
        readonly location: AssistantWorkbenchViewInput
    ) {
        super()
    }
}

@QueryHandler(AssistantWorkbenchEntryQuery)
export class AssistantWorkbenchEntryHandler implements IQueryHandler<AssistantWorkbenchEntryQuery> {
    constructor(
        private readonly published: PublishedXpertAccessService,
        private readonly projects: XpertProjectAccessService,
        private readonly bindings: XpertProjectXpertBindingService,
        private readonly views: ViewExtensionService
    ) {}

    async execute({ assistantId, location }: AssistantWorkbenchEntryQuery): Promise<WorkbenchEntry> {
        const { projectId, ...view } = location
        const organizationId = RequestContext.getOrganizationId() ?? null
        const unavailable = () => new NotFoundException(t('server-ai:Error.WorkbenchEntryUnavailable'))
        // Project access may authorize an Assistant absent from the ordinary published catalog.
        if (projectId) await this.projects.assertCanUseXpert(projectId, assistantId)
        const assistant = projectId
            ? await this.bindings.resolveCurrentById(assistantId, {
                  tenantId: RequestContext.currentTenantId(),
                  organizationId
              })
            : await this.published.getAccessiblePublishedXpert(assistantId)
        if (!assistant) throw unavailable()
        if (projectId && assistant.id !== assistantId) await this.projects.assertCanUseXpert(projectId, assistant.id)
        const available = await this.views.listSlotViews('agent', assistant.id, AGENT_WORKBENCH_SLOT, {
            runtimeScope: { projectId }
        })
        if (!available.some((manifest) => manifest.key === view.viewKey && manifest.visible !== false))
            throw unavailable()
        return {
            projectId,
            organizationId,
            assistant: { id: assistant.id, name: assistant.title || assistant.name },
            view
        }
    }
}
