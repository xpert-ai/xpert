import { HttpClient } from '@angular/common/http'
import { Injectable, inject } from '@angular/core'
import { API_PREFIX } from '@metad/cloud/state'
import { ITenant, ITenantCreateInput, ITenantSetting } from '@metad/contracts'
import { catchError, firstValueFrom, map, of, shareReplay } from 'rxjs'

@Injectable({ providedIn: 'root' })
export class TenantService {
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
}
