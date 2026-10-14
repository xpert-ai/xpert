import { inject, Injectable } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import type {
  TemplatePublicationPreview,
  TemplatePublicationInput,
  TemplateUpgradePreview,
  TemplateUpgradeInput,
  TemplateUpgradeOperation
} from '@xpert-ai/contracts'
import { API_XPERT_ROLE } from '../constants/app.constants'

@Injectable({ providedIn: 'root' })
export class TemplateLifecycleService {
  private readonly http = inject(HttpClient)
  private url(id: string) {
    return `${API_XPERT_ROLE}/${encodeURIComponent(id)}/template-lifecycle`
  }
  publication(id: string) {
    return this.http.get<TemplatePublicationPreview>(`${this.url(id)}/publication`)
  }
  publish(id: string, input: TemplatePublicationInput) {
    return this.http.post(`${this.url(id)}/publication`, input)
  }
  revoke(id: string) {
    return this.http.delete(`${this.url(id)}/publication`)
  }
  sources(id: string) {
    return this.http.get<import('@xpert-ai/contracts').TemplateUpgradeSource[]>(`${this.url(id)}/upgrade/sources`)
  }
  upgrade(id: string, targetTemplateId?: string) {
    return this.http.get<TemplateUpgradePreview>(`${this.url(id)}/upgrade`, {
      params: targetTemplateId ? { targetTemplateId } : {}
    })
  }
  apply(id: string, input: TemplateUpgradeInput) {
    return this.http.post<TemplateUpgradeOperation>(`${this.url(id)}/upgrade`, input)
  }
  action(id: string, action: 'resume' | 'rollback', operationId: string) {
    return this.http.post<TemplateUpgradeOperation>(`${this.url(id)}/upgrade/${action}`, { operationId })
  }
}
