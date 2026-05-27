import { AIPermissionsEnum, XpertTypeEnum, XpertViewSlot } from '@xpert-ai/contracts'
import { RequestContext, ViewHostDefinition, XpertViewHostDefinition } from '@xpert-ai/server-core'
import { Injectable } from '@nestjs/common'
import { XpertService } from '../../xpert/xpert.service'
import { PublishedXpertAccessService } from '../../xpert/published-xpert-access.service'

@Injectable()
@ViewHostDefinition('agent')
export class AgentViewHostDefinition implements XpertViewHostDefinition {
    readonly hostType = 'agent'
    readonly slots: XpertViewSlot[] = [
        { key: 'detail.sidebar', mode: 'sidebar', order: 0 },
        { key: 'agent.workbench.main', mode: 'sections', order: 10 }
    ]

    constructor(
        private readonly xpertService: XpertService,
        private readonly publishedXpertAccessService: PublishedXpertAccessService
    ) {}

    async resolve(hostId: string) {
        const xpert = await this.xpertService.findOneByIdWithinTenant(hostId)
        if (xpert.type !== XpertTypeEnum.Agent) {
            return null
        }

        return {
            workspaceId: xpert.workspaceId ?? null,
            hostSnapshot: {
                id: xpert.id,
                name: xpert.name,
                title: xpert.title ?? null,
                type: xpert.type,
                active: xpert.active ?? true,
                environmentId: xpert.environmentId ?? null,
                workspaceId: xpert.workspaceId ?? null
            }
        }
    }

    async canRead(context: Parameters<XpertViewHostDefinition['canRead']>[0]) {
        if (RequestContext.hasPermission(AIPermissionsEnum.XPERT_EDIT, false)) {
            return true
        }

        try {
            await this.publishedXpertAccessService.getAccessiblePublishedXpert(context.hostId)
            return true
        } catch {
            return false
        }
    }
}
