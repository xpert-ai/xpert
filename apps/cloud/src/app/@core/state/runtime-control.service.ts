import { HttpClient } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import {
  IRuntimeReadiness,
  IRuntimeRestartCapability,
  IRuntimeRestartRequest,
  IRuntimeRestartResponse
} from '@xpert-ai/contracts'
import { API_PREFIX } from './constants'

@Injectable({ providedIn: 'root' })
export class RuntimeControlAPIService {
  readonly #httpClient = inject(HttpClient)

  restart(input: IRuntimeRestartRequest) {
    return this.#httpClient.post<IRuntimeRestartResponse>(`${API_PREFIX}/system/runtime/restart`, input)
  }

  restartCapability() {
    return this.#httpClient.get<IRuntimeRestartCapability>(`${API_PREFIX}/system/runtime/restart-capability`)
  }

  readiness() {
    return this.#httpClient.get<IRuntimeReadiness>(`${API_PREFIX}/health/ready`)
  }
}

export function injectRuntimeControlAPI() {
  return inject(RuntimeControlAPIService)
}
