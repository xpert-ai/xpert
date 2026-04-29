import { HttpClient } from '@angular/common/http'
import { Injectable, inject } from '@angular/core'
import { API_PREFIX } from '@xpert-ai/cloud/state'
import { toParams } from '@xpert-ai/core'
import {
  IFeature,
  IFeatureOrganization,
  IFeatureOrganizationFindInput,
  IFeatureOrganizationUpdateInput,
  IPagination
} from '../../types'
import { map, Observable, Subject } from 'rxjs'

@Injectable()
export class FeatureService {
  API_URL = `${API_PREFIX}/feature/toggle`
  API_FEATURE = `${API_PREFIX}/feature`
  private readonly featureDefinitionsRefreshed = new Subject<void>()
  readonly featureDefinitionsRefreshed$ = this.featureDefinitionsRefreshed.asObservable()
  private readonly http = inject(HttpClient)

  getFeatureToggleDefinition() {
    return this.http.get<IFeature[]>(`${this.API_URL}/definition`)
  }

  getParentFeatures(relations?: string[]): Observable<{ items: IFeature[]; total: number }> {
    return this.http.get<{ items: IFeature[]; total: number }>(`${this.API_URL}/parent`, {
      params: toParams({ relations })
    })
  }

  getAllFeatures(): Observable<{ items: IFeature[]; total: number }> {
    return this.http.get<{ items: IFeature[]; total: number }>(`${this.API_URL}`)
  }

  getFeatureOrganizations(
		where?: IFeatureOrganizationFindInput,
		relations?: string[]
	): Observable<IPagination<IFeatureOrganization>> {
		return this.http.get<IPagination<IFeatureOrganization>>(`${this.API_URL}/organizations`, {
			params: toParams({ relations, ...where })
		});
	}

  featureToggle(payload: IFeatureOrganizationUpdateInput) {
    return this.http.post<boolean[]>(`${this.API_URL}`, [payload]).pipe(map((res: boolean[]) => res[0]))
  }

  featuresToggle(payload: IFeatureOrganizationUpdateInput[]) {
    return this.http.post<boolean[]>(`${this.API_URL}`, payload)
  }

  upgrade() {
	  return this.http.post(`${this.API_FEATURE}/upgrade`, {})
  }

  notifyFeatureDefinitionsRefreshed() {
    this.featureDefinitionsRefreshed.next()
  }
}
