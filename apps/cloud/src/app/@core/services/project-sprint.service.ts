import { Injectable } from '@angular/core'
import { createProjectId, IProjectSprint } from '@xpert-ai/contracts'
import { API_PREFIX, OrganizationBaseCrudService, PaginationParams } from '@xpert-ai/cloud/state'

export const API_PROJECT_SPRINT = API_PREFIX + '/project-sprint'

@Injectable({
  providedIn: 'root'
})
export class ProjectSprintService extends OrganizationBaseCrudService<IProjectSprint> {
  constructor() {
    super(API_PROJECT_SPRINT)
  }

  listByProject(projectId: IProjectSprint['projectId'] | string, options?: PaginationParams<IProjectSprint>) {
    return this.getAll({
      ...options,
      where: {
        ...(options?.where ?? {}),
        projectId: typeof projectId === 'string' ? createProjectId(projectId) : projectId
      }
    })
  }
}
