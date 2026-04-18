import { Injectable } from '@angular/core'
import { IProjectCore } from '@xpert-ai/contracts'
import { API_PREFIX, OrganizationBaseCrudService, PaginationParams } from '@xpert-ai/cloud/state'

export const API_PROJECT_CORE = API_PREFIX + '/project-core'

@Injectable({
  providedIn: 'root'
})
export class ProjectCoreService extends OrganizationBaseCrudService<IProjectCore> {
  constructor() {
    super(API_PROJECT_CORE)
  }

  list(options?: PaginationParams<IProjectCore>) {
    return this.getAll(options)
  }
}
