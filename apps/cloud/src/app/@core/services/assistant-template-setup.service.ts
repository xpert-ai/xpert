import { HttpClient } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import type { AssistantTemplateSetup, TemplateSetupUpdate } from '@xpert-ai/contracts'
import { API_XPERT_ROLE } from '../constants/app.constants'

@Injectable({ providedIn: 'root' })
export class AssistantTemplateSetupService {
  private readonly http = inject(HttpClient)
  get(id: string) {
    return this.http.get<AssistantTemplateSetup>(`${API_XPERT_ROLE}/${id}/template-setup`)
  }
  update(id: string, input: TemplateSetupUpdate) {
    return this.http.put<AssistantTemplateSetup>(`${API_XPERT_ROLE}/${id}/template-setup`, input)
  }
  routine(id: string, key: string, input: { enabled: boolean; expression: string; timeZone: string }) {
    return this.http.put(`${API_XPERT_ROLE}/${id}/template-setup/routines/${encodeURIComponent(key)}`, input)
  }
}
