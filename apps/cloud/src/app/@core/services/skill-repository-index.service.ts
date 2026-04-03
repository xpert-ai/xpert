import { Injectable, inject } from '@angular/core'
import { API_PREFIX, ISkillRepositoryIndex, OrderTypeEnum, OrganizationBaseCrudService, PaginationParams } from '@metad/cloud/state'
import { NGXLogger } from 'ngx-logger'

@Injectable({ providedIn: 'root' })
export class SkillRepositoryIndexService extends OrganizationBaseCrudService<ISkillRepositoryIndex> {
  readonly #logger = inject(NGXLogger)

  constructor() {
    super(`${API_PREFIX}/skill-repository-indexes`)
  }

  getAllByRepository(repositoryId: string, options?: PaginationParams<ISkillRepositoryIndex>) {
    return this.getAllInOrg({
      where: { repositoryId },
      order: { updatedAt: OrderTypeEnum.DESC },
      ...(options ?? {})
    })
  }

  sync(repositoryId: string, mode: 'full' | 'incremental' = 'incremental') {
    return this.httpClient.post<ISkillRepositoryIndex[]>(`${this.apiBaseUrl}/sync/${repositoryId}`, {
      mode
    })
  }
}

export function injectSkillRepositoryIndexService() {
  return inject(SkillRepositoryIndexService)
}
