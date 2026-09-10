import type {
  KnowledgeWikiTaxonomy,
  KnowledgeWikiTaxonomyQuery,
  KnowledgeWikiFolderInput,
  KnowledgeWikiFolder,
  KnowledgeWikiPlacement,
  KnowledgeWikiGraphParams,
  KnowledgeWikiGraph,
  KnowledgeWikiClassificationStatus,
  KnowledgeWikiClassificationItem
} from '@xpert-ai/contracts'
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

  getTaxonomy(id: string, query: KnowledgeWikiTaxonomyQuery = {}) {
    let params = new HttpParams()
    if (query.search?.trim()) params = params.set('search', query.search.trim())
    if (query.pageGroup) params = params.set('pageGroup', query.pageGroup)
    if (query.pageType) params = params.set('pageType', query.pageType)
    return this.#http.get<KnowledgeWikiTaxonomy>(`${API_KNOWLEDGEBASE}/${id}/wiki/folders`, { params })
  }
  configureTaxonomy(id: string, enabled: boolean, revision: number) {
    return this.#http.patch(`${API_KNOWLEDGEBASE}/${id}/wiki/taxonomy`, { enabled, revision })
  }
  saveFolder(id: string, input: KnowledgeWikiFolderInput, folder?: KnowledgeWikiFolder) {
    const url = `${API_KNOWLEDGEBASE}/${id}/wiki/folders`
    return folder
      ? this.#http.patch(`${url}/${folder.id}`, { ...input, version: folder.version })
      : this.#http.post(url, input)
  }
  deleteFolder(id: string, folder: KnowledgeWikiFolder) {
    return this.#http.delete(`${API_KNOWLEDGEBASE}/${id}/wiki/folders/${folder.id}`, {
      params: { version: folder.version }
    })
  }
  movePage(id: string, pageId: string, folderId: string | null, version: number) {
    return this.#http.patch<KnowledgeWikiPlacement>(`${API_KNOWLEDGEBASE}/${id}/wiki/pages/${pageId}/placement`, {
      folderId,
      version
    })
  }
  getGraph(id: string, query: KnowledgeWikiGraphParams) {
    let params = new HttpParams()
    if (query.focusPageId) params = params.set('focusPageId', query.focusPageId)
    if (query.depth) params = params.set('depth', query.depth)
    if (query.take) params = params.set('take', query.take)
    if (query.pageType) params = params.set('pageType', query.pageType)
    if (query.includeIndex !== undefined) params = params.set('includeIndex', query.includeIndex)
    return this.#http.get<KnowledgeWikiGraph>(`${API_KNOWLEDGEBASE}/${id}/wiki/graph`, { params })
  }
  classify(id: string, unclassifiedOnly = true) {
    return this.#http.post<{ runId: string; count: number; truncated: boolean }>(
      `${API_KNOWLEDGEBASE}/${id}/wiki/classification-runs`,
      { unclassifiedOnly }
    )
  }
  getClassificationStatus(id: string) {
    return this.#http.get<KnowledgeWikiClassificationStatus>(
      `${API_KNOWLEDGEBASE}/${id}/wiki/classification-runs/status`
    )
  }
  getClassifications(id: string, runId?: string) {
    return this.#http.get<KnowledgeWikiClassificationItem[]>(`${API_KNOWLEDGEBASE}/${id}/wiki/classification-runs`, {
      params: runId ? { runId } : {}
    })
  }
  applyClassifications(id: string, jobIds: string[]) {
    return this.#http.post(`${API_KNOWLEDGEBASE}/${id}/wiki/classification-runs/apply`, { jobIds })
  }

  getStatus(knowledgebaseId: string) {
    return this.#http.get<KnowledgeWikiStatusResponse>(`${API_KNOWLEDGEBASE}/${knowledgebaseId}/wiki/status`)
  }

  getPages(knowledgebaseId: string, query: KnowledgeWikiPageListParams = {}) {
    let params = new HttpParams()
    if (query.folderId) params = params.set('folderId', query.folderId)
    if (query.unclassified) params = params.set('unclassified', 'true')
    if (query.search) params = params.set('search', query.search)
    if (query.pageGroup) params = params.set('pageGroup', query.pageGroup)
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
