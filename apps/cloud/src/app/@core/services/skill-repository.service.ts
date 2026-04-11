import { inject, Injectable } from '@angular/core'
import {
  API_PREFIX,
  ISkillRepository,
  OrderTypeEnum,
  OrganizationBaseCrudService,
  PaginationParams,
  TSkillSourceMeta
} from '@xpert-ai/cloud/state'
import { NGXLogger } from 'ngx-logger'
import { shareReplay, switchMap } from 'rxjs'

@Injectable({ providedIn: 'root' })
export class SkillRepositoryService extends OrganizationBaseCrudService<ISkillRepository> {
  readonly #logger = inject(NGXLogger)

  readonly sourceStrategies$ = this.getSourceStrategies().pipe(shareReplay(1))

  constructor() {
    super(`${API_PREFIX}/skill-repository`)
  }

  register(repository: Partial<ISkillRepository>) {
    return this.httpClient.post<ISkillRepository>(this.apiBaseUrl, repository)
  }

  getAllInOrg(options?: PaginationParams<ISkillRepository>) {
    return super.getAllInOrg({
      order: { updatedAt: OrderTypeEnum.DESC },
      ...(options ?? {})
    })
  }

  getAvailables() {
    return this.selectOrganizationId().pipe(
      switchMap(() =>
        this.httpClient.get<{ items: ISkillRepository[]; total: number }>(`${this.apiBaseUrl}/availables`)
      )
    )
  }

  getSourceStrategies() {
    return this.httpClient.get<TSkillSourceMeta[]>(`${this.apiBaseUrl}/source-strategies`)
  }
}

export function injectSkillRepositoryService() {
  return inject(SkillRepositoryService)
}
