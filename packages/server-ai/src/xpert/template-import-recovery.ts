import { BadRequestException } from '@nestjs/common'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import type { TXpertTemplateSource } from '@xpert-ai/contracts'
import { t } from 'i18next'
import { XpertService } from './xpert.service'
import { resolveXpertTemplateSource } from './template-source'

/** Only the installation operation can supply this reserved ID. Missing rows are new imports. */
export async function loadReservedTemplateAssistant(
    service: XpertService,
    id: string,
    workspaceId: string,
    source: TXpertTemplateSource
) {
    const current = await service.repository.findOne({ where: { id }, relations: ['agent', 'agent.copilotModel'] })
    if (!current) return null
    if (
        current.tenantId !== RequestContext.currentTenantId() ||
        current.organizationId !== RequestContext.getOrganizationId() ||
        current.createdById !== RequestContext.currentUserId() ||
        current.workspaceId !== workspaceId ||
        !source?.templateId ||
        resolveXpertTemplateSource(current)?.templateId !== source.templateId ||
        current.publishAt ||
        !current.agent
    )
        throw new BadRequestException(t('server-ai:Error.TemplateInstallResumeMismatch'))
    return current
}
