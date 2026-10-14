import { HttpClient } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import { API_PREFIX } from '../state'
import type { TemplateInstallation, TemplateInstallationInput } from '@xpert-ai/contracts'
import type { InstallationTransport } from '@xpert-ai/template-installation-client'
import { firstValueFrom } from 'rxjs'

@Injectable({ providedIn: 'root' })
export class TemplateInstallationService implements InstallationTransport {
  private readonly http = inject(HttpClient)
  private readonly url = API_PREFIX + '/xpert-template-installations'
  create(input: TemplateInstallationInput) {
    return firstValueFrom(this.http.post<TemplateInstallation>(this.url, input))
  }
  get(id: string) {
    return firstValueFrom(this.http.get<TemplateInstallation>(`${this.url}/${encodeURIComponent(id)}`))
  }
  retry(id: string) {
    return firstValueFrom(this.http.post<TemplateInstallation>(`${this.url}/${encodeURIComponent(id)}/retry`, {}))
  }
  list(workspaceId: string, skip = 0) {
    return firstValueFrom(
      this.http.get<{ items: TemplateInstallation[]; total: number }>(this.url, {
        params: { workspaceId, skip, take: 20 }
      })
    )
  }
}
