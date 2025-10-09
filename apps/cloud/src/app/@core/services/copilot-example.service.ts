import { HttpClient } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import { DocumentInterface } from '@langchain/core/documents'
import { MaxMarginalRelevanceSearchOptions, VectorStoreInterface } from '@langchain/core/vectorstores'
import { NGXLogger } from 'ngx-logger'
import { map, tap } from 'rxjs'
import { API_COPILOT_KNOWLEDGE } from '../constants/app.constants'
import { ICopilotKnowledge } from '../types'
import { XpertAPIService } from './xpert.service'

/**
 * @deprecated use Agent instead
 */
@Injectable({ providedIn: 'root' })
export class CopilotExampleService {
  readonly #logger = inject(NGXLogger)
  readonly httpClient = inject(HttpClient)
  readonly xpertService = inject(XpertAPIService)

  similaritySearch(
    query: string,
    options: { k?: number; filter?: VectorStoreInterface['FilterType']; command: string | string[]; role: string; score: number }
  ) {
    return this.httpClient.post<DocumentInterface[]>(`${API_COPILOT_KNOWLEDGE}/similarity-search`, { query, options })
  }

  maxMarginalRelevanceSearch(
    query: string,
    options: MaxMarginalRelevanceSearchOptions<VectorStoreInterface['FilterType']> & {
      command: string | string[]
      role: string
    }
  ) {
    return this.httpClient.post<DocumentInterface[]>(`${API_COPILOT_KNOWLEDGE}/mmr-search`, { query, options })
  }

  getAll(options?: { relations: string[]; filter?: Record<string, any> }) {
    const { relations, filter } = options || {}
    return this.httpClient
      .get<{ items: ICopilotKnowledge[] }>(`${API_COPILOT_KNOWLEDGE}`, {
        params: {
          $filter: JSON.stringify(filter),
          $relations: JSON.stringify(relations)
        }
      })
      .pipe(map(({ items }) => items))
  }

  getById(id: string) {
    return this.httpClient.get<ICopilotKnowledge>(`${API_COPILOT_KNOWLEDGE}/${id}`)
  }

  create(entity: Partial<ICopilotKnowledge>) {
    return this.httpClient.post<ICopilotKnowledge>(`${API_COPILOT_KNOWLEDGE}`, entity)
  }

  update(id: string, entity: Partial<ICopilotKnowledge>) {
    return this.httpClient.put<ICopilotKnowledge>(`${API_COPILOT_KNOWLEDGE}/${id}`, entity)
  }

  delete(id: string) {
    return this.httpClient.delete(`${API_COPILOT_KNOWLEDGE}/${id}`)
  }

  getCommands(filter: { role: string }) {
    return this.httpClient
      .get<ICopilotKnowledge[]>(`${API_COPILOT_KNOWLEDGE}/commands`, {
        params: {
          $filter: JSON.stringify(filter)
        }
      })
      .pipe(map((items) => items.map(({ command }) => command)))
  }

  createBulk(entities: ICopilotKnowledge[], options: { clearRole: boolean }) {
    return this.httpClient
      .post<ICopilotKnowledge[]>(`${API_COPILOT_KNOWLEDGE}/bulk`, {
        examples: entities,
        options
      })
      .pipe(tap(() => this.xpertService.refresh()))
  }
}
