import { HttpClient } from '@angular/common/http'
import { Injectable } from '@angular/core'
import { API_PREFIX } from '@metad/cloud/state'
import {
  IFeature,
  IFeatureOrganization,
  IFeatureOrganizationFindInput,
  IFeatureOrganizationUpdateInput,
  IPagination
} from '@metad/contracts'
import { toParams } from '@metad/core'
import { Observable } from 'rxjs'

@Injectable()
export class FeatureService {
  API_URL = `${API_PREFIX}/feature/toggle`
  API_FEATURE = `${API_PREFIX}/feature`

  constructor(private http: HttpClient) {}

  getFeatureToggleDefinition() {
    return this.http.get<IFeature[]>(`${this.API_URL}/definition`)
  }

  getParentFeatures(relations?: string[]): Observable<{ items: IFeature[]; total: number }> {
    const data = { relations }
    return this.http.get<{ items: IFeature[]; total: number }>(`${this.API_URL}/parent`, {
      params: toParams({ data })
    })
  }

  getAllFeatures(): Observable<{ items: IFeature[]; total: number }> {
    return this.http.get<{ items: IFeature[]; total: number }>(`${this.API_URL}`)
  }

  getFeatureOrganizations(
    findInput?: IFeatureOrganizationFindInput,
    relations?: string[]
  ): Observable<IPagination<IFeatureOrganization>> {
    const data = { relations, findInput }
    return this.http.get<IPagination<IFeatureOrganization>>(`${this.API_URL}/organizations`, {
      params: toParams({ data })
    })
  }

  featureToggle(payload: IFeatureOrganizationUpdateInput) {
    return this.http.post(`${this.API_URL}`, payload)
  }

  upgrade() {
	  return this.http.post(`${this.API_FEATURE}/upgrade`, {})
  }
}
