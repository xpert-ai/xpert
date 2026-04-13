import { AIPermissionsEnum, XpertTypeEnum, XpertViewSlot } from '@xpert-ai/contracts'
import { RequestContext, ViewHostDefinition, XpertViewHostDefinition } from '@xpert-ai/server-core'
import { Injectable } from '@nestjs/common'
import { XpertService } from '../../xpert/xpert.service'

@Injectable()
@ViewHostDefinition('agent')
export class AgentViewHostDefinition implements XpertViewHostDefinition {
  readonly hostType = 'agent'
  readonly slots: XpertViewSlot[] = [{ key: 'detail.sidebar', mode: 'sidebar', order: 0 }]

  constructor(private readonly xpertService: XpertService) {}

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

  canRead() {
    return RequestContext.hasPermission(AIPermissionsEnum.XPERT_EDIT, false)
  }
}
