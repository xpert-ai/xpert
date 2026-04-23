import { Injectable } from '@angular/core'
import { createProjectId, createSprintId, IProjectSwimlane } from '@xpert-ai/contracts'
import { API_PREFIX, OrganizationBaseCrudService, PaginationParams } from '@xpert-ai/cloud/state'

export const API_PROJECT_SWIMLANE = API_PREFIX + '/project-swimlane'

@Injectable({
  providedIn: 'root'
})
export class ProjectSwimlaneService extends OrganizationBaseCrudService<IProjectSwimlane> {
  constructor() {
    super(API_PROJECT_SWIMLANE)
  }

  listBySprint(
    projectId: IProjectSwimlane['projectId'] | string,
    sprintId: IProjectSwimlane['sprintId'] | string,
    options?: PaginationParams<IProjectSwimlane>
  ) {
    return this.getAll({
      ...options,
      where: {
        ...(options?.where ?? {}),
        projectId: typeof projectId === 'string' ? createProjectId(projectId) : projectId,
        sprintId: typeof sprintId === 'string' ? createSprintId(sprintId) : sprintId
      }
    })
  }
}
