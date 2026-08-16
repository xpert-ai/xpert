import { HttpParams } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import { DocumentInterface } from '@langchain/core/documents'
import { IKnowledgeDocumentChunk, OrganizationBaseCrudService, Store } from '@cloud/app/@core/state'
import { NGXLogger } from 'ngx-logger'
import { API_KNOWLEDGE_DOCUMENT } from '../constants/app.constants'
import {
  IIntegration,
  IKnowledgeDocument,
  IKnowledgeDocumentPage,
  KnowledgeDocumentProcessingMode,
  KnowledgeDocumentAnalysisPage,
  KnowledgeDocumentAnalysisPreview,
  RequestScopeLevel,
  KnowledgeDocumentReprocessCapabilities,
  TKDocumentWebSchema,
  TRagWebOptions,
  TRagWebResult
} from '../types'

@Injectable({ providedIn: 'root' })
export class KnowledgeDocumentService extends OrganizationBaseCrudService<IKnowledgeDocument> {
  readonly #logger = inject(NGXLogger)
  readonly #store = inject(Store)

  constructor() {
    super(API_KNOWLEDGE_DOCUMENT)
  }

  createBulk(entites: Partial<IKnowledgeDocument>[], process?: boolean) {
    return this.httpClient.post<IKnowledgeDocument[]>(this.apiBaseUrl + '/bulk', entites, {
      params: { process }
    })
  }

  updateBulk(entites: Partial<IKnowledgeDocument>[], process?: boolean) {
    return this.httpClient.put<IKnowledgeDocument[]>(this.apiBaseUrl + '/bulk', entites, {
      params: { process }
    })
  }

  delete(id: string, version?: number) {
    return this.httpClient.delete(`${this.apiBaseUrl}/${id}`, {
      params: version ? { version } : undefined
    })
  }

  deleteBulk(documents: Pick<IKnowledgeDocument, 'id' | 'version'>[]) {
    return this.httpClient.delete(this.apiBaseUrl + '/bulk', {
      body: { documents }
    })
  }

  move(id: string, input: { knowledgebaseId: string; parentId: string | null; version: number }) {
    return this.httpClient.post<{ document: IKnowledgeDocument; affectedDocumentIds: string[] }>(
      this.apiBaseUrl + `/${id}/move`,
      input
    )
  }

  getFolderChildCounts(knowledgebaseId: string, folderIds: string[]) {
    return this.httpClient.post<Array<{ folderId: string; documentCount: number; folderCount: number }>>(
      this.apiBaseUrl + '/folder-child-counts',
      { knowledgebaseId, folderIds }
    )
  }

  startParsing(id: string | string[], mode: KnowledgeDocumentProcessingMode = 'full') {
    return this.httpClient.post<IKnowledgeDocument[]>(this.apiBaseUrl + '/process', {
      ids: Array.isArray(id) ? id : id ? [id] : [],
      mode
    })
  }

  getReprocessCapabilities(id: string) {
    return this.httpClient.get<KnowledgeDocumentReprocessCapabilities>(
      this.apiBaseUrl + `/${id}/reprocess-capabilities`
    )
  }

  stopParsing(id: string) {
    return this.httpClient.delete<IKnowledgeDocument[]>(this.apiBaseUrl + '/' + id + '/job')
  }

  previewFile(id: string) {
    return this.httpClient.get<DocumentInterface[]>(this.apiBaseUrl + `/preview-file/${id}`)
  }

  downloadOriginalFile(id: string) {
    return this.httpClient.get(this.apiBaseUrl + `/${id}/original-file/download`, {
      responseType: 'blob'
    })
  }

  downloadOriginalFiles(ids: string[]) {
    return this.httpClient.post(
      this.apiBaseUrl + '/original-files/download',
      { ids },
      {
        responseType: 'blob'
      }
    )
  }

  getAnalysisPreview(id: string) {
    return this.httpClient.get<KnowledgeDocumentAnalysisPreview>(this.apiBaseUrl + `/${id}/analysis-preview`)
  }

  getAnalysisPreviewPage(id: string, page: number) {
    return this.httpClient.get<KnowledgeDocumentAnalysisPage>(this.apiBaseUrl + `/${id}/analysis-preview/pages/${page}`)
  }

  getAnalysisPreviewRawPage(id: string, page: number) {
    return this.httpClient.get<Array<Record<string, unknown>>>(
      this.apiBaseUrl + `/${id}/analysis-preview/pages/${page}/raw`
    )
  }

  getAnalysisPreviewAsset(id: string, assetId: string) {
    return this.httpClient.get(this.analysisPreviewAssetUrl(id, assetId), { responseType: 'blob' })
  }

  analysisPreviewAssetUrl(id: string, assetId: string) {
    return this.apiBaseUrl + `/${id}/analysis-preview/assets/${encodeURIComponent(assetId)}`
  }

  /** Builds the authenticated PDF.js source; range requests must carry the same tenant/scope headers. */
  originalFilePreviewSource(id: string) {
    const activeScope = this.#store.activeScope
    const tenantId = this.#store.user?.tenantId
    return {
      url: this.apiBaseUrl + `/${id}/original-file/preview`,
      httpHeaders: {
        ...(this.#store.token ? { Authorization: `Bearer ${this.#store.token}` } : {}),
        ...(tenantId ? { 'Tenant-Id': `${tenantId}` } : {}),
        'X-Scope-Level': activeScope.level,
        ...(activeScope.level === RequestScopeLevel.ORGANIZATION
          ? { 'Organization-Id': `${activeScope.organizationId}` }
          : {})
      },
      withCredentials: true
    }
  }

  estimate(doc: Partial<IKnowledgeDocument>) {
    return this.httpClient.post<IKnowledgeDocumentChunk[]>(this.apiBaseUrl + `/estimate`, doc)
  }

  getStatus(ids: string[]) {
    return this.httpClient.get<IKnowledgeDocument[]>(this.apiBaseUrl + `/status`, {
      params: new HttpParams().append(`ids`, ids.join(','))
    })
  }

  getWebOptions(type: string) {
    return this.httpClient.get<TKDocumentWebSchema>(this.apiBaseUrl + `/web/${type}/options`)
  }

  loadRagWebPages(type: string, webOptions: TRagWebOptions, integration: IIntegration) {
    return this.httpClient.post<TRagWebResult>(this.apiBaseUrl + `/web/${type}/load`, { webOptions, integration })
  }

  removePage(kd: IKnowledgeDocument, page: IKnowledgeDocumentPage) {
    return this.httpClient.delete(this.apiBaseUrl + `/${kd.id}/page/${page.id}`)
  }

  getChunks(id: string, params: { take: number; skip: number; search?: string }) {
    return this.httpClient.get<{ items: IKnowledgeDocumentChunk[]; total: number }>(
      this.apiBaseUrl + `/${id}` + '/chunk',
      {
        params: new HttpParams().append('data', JSON.stringify(params))
      }
    )
  }

  deleteChunk(documentId: string, id: string, version?: number) {
    return this.httpClient.delete<void>(this.apiBaseUrl + `/` + documentId + '/chunk/' + id, {
      params: version ? { version } : undefined
    })
  }

  createChunk(documentId: string, chunk: Partial<IKnowledgeDocumentChunk>) {
    return this.httpClient.post<IKnowledgeDocumentChunk>(this.apiBaseUrl + `/` + documentId + '/chunk', chunk)
  }

  updateChunk(documentId: string, id: string, chunk: Partial<IKnowledgeDocumentChunk>) {
    return this.httpClient.put<void>(this.apiBaseUrl + `/` + documentId + '/chunk/' + id, chunk)
  }

  connect(type: string, config: any) {
    return this.httpClient.post<any[]>(this.apiBaseUrl + `/connect`, {
      type,
      config
    })
  }
}
