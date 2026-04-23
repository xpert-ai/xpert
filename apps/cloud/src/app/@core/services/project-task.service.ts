import { Injectable } from '@angular/core'
import { createProjectId, createSprintId, IProjectTask } from '@xpert-ai/contracts'
import { API_PREFIX, OrganizationBaseCrudService, PaginationParams } from '@xpert-ai/cloud/state'

export const API_PROJECT_TASK = API_PREFIX + '/project-task'

@Injectable({
  providedIn: 'root'
})
export class ProjectTaskService extends OrganizationBaseCrudService<IProjectTask> {
  constructor() {
    super(API_PROJECT_TASK)
  }

  listBySprint(
    projectId: IProjectTask['projectId'] | string,
    sprintId: IProjectTask['sprintId'] | string,
    options?: PaginationParams<IProjectTask>
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
