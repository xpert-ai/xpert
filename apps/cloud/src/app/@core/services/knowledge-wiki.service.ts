import { HttpClient, HttpParams } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import {
  API_PREFIX,
  KnowledgeWikiDocumentStatusResponse,
  KnowledgeWikiPageDetail,
  KnowledgeWikiPageListParams,
  KnowledgeWikiPageListResult,
  KnowledgeWikiStatusResponse
} from '@cloud/app/@core/state'
const API_KNOWLEDGEBASE = API_PREFIX + '/knowledgebase'

@Injectable({ providedIn: 'root' })
export class KnowledgeWikiService {
  readonly #http = inject(HttpClient)

  getStatus(knowledgebaseId: string) {
    return this.#http.get<KnowledgeWikiStatusResponse>(`${API_KNOWLEDGEBASE}/${knowledgebaseId}/wiki/status`)
  }

  getPages(knowledgebaseId: string, query: KnowledgeWikiPageListParams = {}) {
    let params = new HttpParams()
    if (query.search) params = params.set('search', query.search)
    if (query.pageType) params = params.set('pageType', query.pageType)
    if (query.status) params = params.set('status', query.status)
    if (query.skip !== undefined) params = params.set('skip', query.skip)
    if (query.take !== undefined) params = params.set('take', query.take)
    return this.#http.get<KnowledgeWikiPageListResult>(`${API_KNOWLEDGEBASE}/${knowledgebaseId}/wiki/pages`, {
      params
    })
  }

  getDocumentStatus(knowledgebaseId: string, documentIds: string[]) {
    return this.#http.get<KnowledgeWikiDocumentStatusResponse>(
      `${API_KNOWLEDGEBASE}/${knowledgebaseId}/wiki/documents/status`,
      { params: { documentIds: documentIds.join(',') } }
    )
  }

  getPage(knowledgebaseId: string, pageId: string) {
    return this.#http.get<KnowledgeWikiPageDetail>(`${API_KNOWLEDGEBASE}/${knowledgebaseId}/wiki/pages/${pageId}`)
  }

  rebuild(
    knowledgebaseId: string,
    input: { confirmModelCharges: boolean; maxModelInvocations?: number; maxEstimatedTokens?: number }
  ) {
    return this.#http.post(`${API_KNOWLEDGEBASE}/${knowledgebaseId}/wiki/rebuild`, input)
  }

  retryJob(knowledgebaseId: string, jobId: string, confirmAdditionalModelCharge = false) {
    return this.#http.post(`${API_KNOWLEDGEBASE}/${knowledgebaseId}/wiki/jobs/${jobId}/retry`, {
      confirmAdditionalModelCharge
    })
  }
}
