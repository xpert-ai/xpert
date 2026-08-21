import { HttpClient } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import {
  IPluginRuntimeConvergenceStatus,
  IRuntimeReadiness,
  IRuntimeRestartCapability,
  IRuntimeRestartRequest,
  IRuntimeRestartResponse,
  IRuntimeRestartStatus
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

  restartStatus(restartId: string) {
    return this.#httpClient.get<IRuntimeRestartStatus>(`${API_PREFIX}/system/runtime/restart/${restartId}`)
  }

  pluginConvergenceStatus(generation: number) {
    return this.#httpClient.get<IPluginRuntimeConvergenceStatus>(
      `${API_PREFIX}/system/runtime/plugin-convergence/${generation}`
    )
  }

  readiness() {
    return this.#httpClient.get<IRuntimeReadiness>(`${API_PREFIX}/health/ready`)
  }
}

export function injectRuntimeControlAPI() {
  return inject(RuntimeControlAPIService)
}
