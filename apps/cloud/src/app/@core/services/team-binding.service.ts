import { HttpClient } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import { IProjectTeamBinding, IPagination } from '@xpert-ai/contracts'
import { API_PREFIX } from '@xpert-ai/cloud/state'

const API_TEAM_BINDING = API_PREFIX + '/team-binding'

@Injectable({ providedIn: 'root' })
export class TeamBindingService {
  readonly #http = inject(HttpClient)

  listByProject(projectId: string) {
    return this.#http.get<IPagination<IProjectTeamBinding>>(`${API_TEAM_BINDING}/project/${projectId}`)
  }

  create(input: Partial<IProjectTeamBinding>) {
    return this.#http.post<IProjectTeamBinding>(API_TEAM_BINDING, input)
  }

  update(id: string, input: Partial<IProjectTeamBinding>) {
    return this.#http.put<IProjectTeamBinding>(`${API_TEAM_BINDING}/${id}`, input)
  }

  delete(id: string) {
    return this.#http.delete(`${API_TEAM_BINDING}/${id}`)
  }
}
