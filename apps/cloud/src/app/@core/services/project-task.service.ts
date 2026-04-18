import { Injectable } from '@angular/core'
import { IProjectTask } from '@xpert-ai/contracts'
import { API_PREFIX, OrganizationBaseCrudService, PaginationParams } from '@xpert-ai/cloud/state'

export const API_PROJECT_TASK = API_PREFIX + '/project-task'

@Injectable({
  providedIn: 'root'
})
export class ProjectTaskService extends OrganizationBaseCrudService<IProjectTask> {
  constructor() {
    super(API_PROJECT_TASK)
  }

  listBySprint(projectId: string, sprintId: string, options?: PaginationParams<IProjectTask>) {
    return this.getAll({
      ...options,
      where: {
        ...(options?.where ?? {}),
        projectId,
        sprintId
      }
    })
  }
}
