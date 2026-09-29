import { inject, Injectable } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import { TIntegrationQrResult, TIntegrationQrSession, TWorkflowTriggerConnectionStatus } from '@xpert-ai/contracts'
import { API_PREFIX } from '../../../@core/state'
import { firstValueFrom } from 'rxjs'

@Injectable({ providedIn: 'root' })
export class AssistantTriggerConnectionService {
  private readonly http = inject(HttpClient)

  statuses(xpertId: string) {
    return firstValueFrom(this.http.get<TWorkflowTriggerConnectionStatus[]>(this.path(xpertId)))
  }

  begin(xpertId: string, provider: string) {
    return firstValueFrom(this.http.post<TIntegrationQrSession>(`${this.path(xpertId, provider)}/qr`, {}))
  }

  poll(xpertId: string, provider: string, session: string) {
    return firstValueFrom(
      this.http.get<TIntegrationQrResult>(`${this.path(xpertId, provider)}/qr/${encodeURIComponent(session)}`)
    )
  }

  complete(xpertId: string, provider: string, session: string) {
    return firstValueFrom(
      this.http.post<TWorkflowTriggerConnectionStatus>(
        `${this.path(xpertId, provider)}/qr/${encodeURIComponent(session)}/complete`,
        {}
      )
    )
  }

  cancel(xpertId: string, provider: string, session: string) {
    return firstValueFrom(this.http.delete<void>(`${this.path(xpertId, provider)}/qr/${encodeURIComponent(session)}`))
  }

  disconnect(xpertId: string, provider: string) {
    return firstValueFrom(this.http.delete<TWorkflowTriggerConnectionStatus>(this.path(xpertId, provider)))
  }

  private path(xpertId: string, provider?: string) {
    return `${API_PREFIX}/xpert/${encodeURIComponent(xpertId)}/trigger-connections${provider ? '/' + encodeURIComponent(provider) : ''}`
  }
}
