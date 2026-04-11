import { Injectable, inject } from '@angular/core'
import {
  API_PREFIX,
  ISkillRepositoryIndex,
  OrderTypeEnum,
  OrganizationBaseCrudService,
  PaginationParams,
  toHttpParams
} from '@xpert-ai/cloud/state'
import { NGXLogger } from 'ngx-logger'
import { switchMap } from 'rxjs'

@Injectable({ providedIn: 'root' })
export class SkillRepositoryIndexService extends OrganizationBaseCrudService<ISkillRepositoryIndex> {
  readonly #logger = inject(NGXLogger)

  constructor() {
    super(`${API_PREFIX}/skill-repository-indexes`)
  }

  getMarketplace(options?: PaginationParams<ISkillRepositoryIndex>, search?: string) {
    return this.selectOrganizationId().pipe(
      switchMap(() => {
        let params = toHttpParams({
          order: { updatedAt: OrderTypeEnum.DESC },
          ...(options ?? {})
        })

        if (search?.trim()) {
          params = params.append('search', search.trim())
        }

        return this.httpClient.get<{ items: ISkillRepositoryIndex[]; total: number }>(this.apiBaseUrl, { params })
      })
    )
  }

  getAllByRepository(repositoryId: string, options?: PaginationParams<ISkillRepositoryIndex>, search?: string) {
    return this.getMarketplace({
      where: { repositoryId },
      ...(options ?? {})
    }, search)
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
