import { HttpClient } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import { ITeamDefinition } from '@xpert-ai/contracts'
import { API_PREFIX } from '@xpert-ai/cloud/state'

const API_TEAM_DEFINITION = API_PREFIX + '/team-definition'

@Injectable({ providedIn: 'root' })
export class TeamDefinitionService {
  readonly #http = inject(HttpClient)

  getAll() {
    return this.#http.get<ITeamDefinition[]>(API_TEAM_DEFINITION)
  }

  get(id: string) {
    return this.#http.get<ITeamDefinition>(`${API_TEAM_DEFINITION}/${id}`)
  }
}
