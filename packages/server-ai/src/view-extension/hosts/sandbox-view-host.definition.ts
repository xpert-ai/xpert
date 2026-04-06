import { AIPermissionsEnum, XpertViewSlot } from '@metad/contracts'
import { RequestContext, ViewHostDefinition, XpertViewHostDefinition } from '@metad/server-core'
import { Injectable } from '@nestjs/common'
import { EnvironmentService } from '../../environment/environment.service'

@Injectable()
@ViewHostDefinition('sandbox')
export class SandboxViewHostDefinition implements XpertViewHostDefinition {
  readonly hostType = 'sandbox'
  readonly slots: XpertViewSlot[] = [{ key: 'detail.sections', mode: 'sections', order: 0 }]

  constructor(private readonly environmentService: EnvironmentService) {}

  async resolve(hostId: string) {
    const environment = await this.environmentService.findOne(hostId)

    return {
      workspaceId: environment.workspaceId ?? null,
      hostSnapshot: {
        id: environment.id,
        name: environment.name,
        isDefault: environment.isDefault ?? false,
        isArchived: environment.isArchived ?? false,
        workspaceId: environment.workspaceId ?? null
      }
    }
  }

  canRead() {
    return RequestContext.hasPermission(AIPermissionsEnum.XPERT_EDIT, false)
  }
}
