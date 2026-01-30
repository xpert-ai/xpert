import { HttpClient } from '@angular/common/http'
import { Injectable, inject } from '@angular/core'
import { API_PREFIX } from '@metad/cloud/state'
import { catchError, firstValueFrom, map, of, shareReplay } from 'rxjs'
import { ITenant, ITenantCreateInput, ITenantSetting } from '../types'

@Injectable({ providedIn: 'root' })
export class TenantService {
  private readonly key = 'tenant'
  private readonly http = inject(HttpClient)

  API_URL = `${API_PREFIX}/tenant`

  readonly #isOnboarded = this.http.get(`${this.API_URL}/onboard`).pipe(
    map((result) => ({tenant: result})),
    catchError((err) => of({error: err})),
    shareReplay<{tenant?: ITenant; error?: Error}>(1)
  )

  create(createInput: ITenantCreateInput): Promise<ITenant> {
    return firstValueFrom(this.http.post<ITenant>(`${this.API_URL}`, createInput))
  }
  getOnboard() {
    return this.#isOnboarded
  }
  onboard(createInput: ITenantCreateInput): Promise<ITenant> {
    return firstValueFrom(this.http.post<ITenant>(`${this.API_URL}/onboard`, createInput))
  }

  async getSettings() {
    return firstValueFrom(this.http.get<ITenantSetting>(`${API_PREFIX}/tenant-setting`))
  }

  async saveSettings(request: ITenantSetting) {
    return firstValueFrom(this.http.post<ITenantSetting>(`${API_PREFIX}/tenant-setting`, request))
  }

  generateDemo(id: string) {
    return this.http.post<ITenant>(`${this.API_URL}/${id}/demo`, {})
  }

  /**
   * Get current tenant from query param, subdomain or localStorage
   * @returns tenant id
   */
  getTenant(): string {
    // 1) query param
    const url = new URL(window.location.href)
    const qp = url.searchParams.get('tenant')
    if (qp) {
      this.setTenant(qp)
      return qp
    }

    // 2) subdomain: <tenant>.app.xpertai.cn
    const host = window.location.hostname
    const parts = host.split('.')
    // e.g. foo.app.xpertai.cn => ['foo','app','xpertai','cn']
    if (parts.length >= 4) {
      const sub = parts[0]
      if (sub && sub !== 'app') {
        this.setTenant(sub)
        return sub
      }
    }

    // 3) localStorage fallback
    return localStorage.getItem(this.key) || 'default'
  }

  /**
   * Set tenant to localStorage
   */
  setTenant(tenant: string) {
    localStorage.setItem(this.key, tenant)
  }
}
