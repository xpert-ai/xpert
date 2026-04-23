import { HttpClient } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import {
  createProjectId,
  createSprintId,
  IProjectTask,
  IProjectTaskMoveInput,
  IProjectTaskReorderInput
} from '@xpert-ai/contracts'
import { API_PREFIX, OrganizationBaseCrudService, PaginationParams } from '@xpert-ai/cloud/state'

export const API_PROJECT_TASK = API_PREFIX + '/project-task'

@Injectable({
  providedIn: 'root'
})
export class ProjectTaskService extends OrganizationBaseCrudService<IProjectTask> {
  readonly #http = inject(HttpClient)

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

  moveTasks(input: IProjectTaskMoveInput) {
    return this.#http.post<IProjectTask[]>(`${API_PROJECT_TASK}/move`, input)
  }

  reorderInLane(swimlaneId: string, input: IProjectTaskReorderInput) {
    return this.#http.post<IProjectTask[]>(`${API_PROJECT_TASK}/swimlane/${swimlaneId}/reorder`, input)
  }
}
