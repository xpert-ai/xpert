import { AIPermissionsEnum, XpertViewSlot } from '@metad/contracts'
import { RequestContext, ViewHostDefinition, XpertViewHostDefinition } from '@metad/server-core'
import { Injectable } from '@nestjs/common'
import { XpertProjectService } from '../../xpert-project/project.service'

@Injectable()
@ViewHostDefinition('project')
export class ProjectViewHostDefinition implements XpertViewHostDefinition {
  readonly hostType = 'project'
  readonly slots: XpertViewSlot[] = [{ key: 'detail.sections', mode: 'sections', order: 0 }]

  constructor(private readonly projectService: XpertProjectService) {}

  async resolve(hostId: string) {
    const project = await this.projectService.findOne(hostId)

    return {
      workspaceId: project.workspaceId ?? null,
      hostSnapshot: {
        id: project.id,
        name: project.name,
        status: project.status ?? null,
        ownerId: project.ownerId ?? null,
        workspaceId: project.workspaceId ?? null
      }
    }
  }

  canRead() {
    return (
      RequestContext.hasPermission(AIPermissionsEnum.CHAT_VIEW, false) ||
      RequestContext.hasPermission(AIPermissionsEnum.XPERT_EDIT, false)
    )
  }
}
