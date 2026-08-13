import { HttpClient } from '@angular/common/http'
import { Injectable, inject } from '@angular/core'
import { API_AGENT_EVOLUTION } from '@cloud/app/@core/constants/app.constants'
import type { EvolutionTargetDescriptor } from '@xpert-ai/contracts'
import type { AgentEvolutionDashboard, EvolutionSimulationResult } from './agent-evolution.types'

@Injectable({ providedIn: 'root' })
export class AgentEvolutionApiService {
  readonly #http = inject(HttpClient)

  getDashboard() {
    return this.#http.get<AgentEvolutionDashboard>(`${API_AGENT_EVOLUTION}/dashboard`)
  }

  synchronizeTargets() {
    return this.#http.post<EvolutionTargetDescriptor[]>(`${API_AGENT_EVOLUTION}/targets/synchronize`, {})
  }

  simulateConformance() {
    return this.#http.post<EvolutionSimulationResult>(
      `${API_AGENT_EVOLUTION}/examples/conformance-field-mapping/run`,
      {}
    )
  }
}
