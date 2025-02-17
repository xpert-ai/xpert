import { HttpClient, HttpParams } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import { OrganizationBaseCrudService, PaginationParams, toHttpParams } from '@metad/cloud/state'
import { IDocumentChunk, IIntegration, IKnowledgebase, IKnowledgeDocument, IKnowledgeDocumentPage, TKDocumentWebSchema, TRagWebOptions, TRagWebResult } from '../types'
import { NGXLogger } from 'ngx-logger'
import { Document } from 'langchain/document'
import { API_KNOWLEDGE_DOCUMENT } from '../constants/app.constants'

@Injectable({ providedIn: 'root' })
export class KnowledgeDocumentService extends OrganizationBaseCrudService<IKnowledgeDocument> {
  readonly #logger = inject(NGXLogger)

  constructor() {
    super(API_KNOWLEDGE_DOCUMENT)
  }

  createBulk(entites: Partial<IKnowledgeDocument>[]) {
    return this.httpClient.post<IKnowledgeDocument[]>(this.apiBaseUrl + '/bulk', entites)
  }

  startParsing(id: string | string[]) {
    return this.httpClient.post<IKnowledgeDocument[]>(this.apiBaseUrl + '/process', {
      ids: Array.isArray(id) ? id : id ? [id] : []
    })
  }

  stopParsing(id: string) {
    return this.httpClient.delete<IKnowledgeDocument[]>(this.apiBaseUrl + '/' + id + '/job')
  }

  estimate(doc: Partial<IKnowledgeDocument>) {
    return this.httpClient.post<Document[]>(this.apiBaseUrl + `/estimate`, doc)
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
    return this.httpClient.post<TRagWebResult>(this.apiBaseUrl + `/web/${type}/load`, {webOptions, integration})
  }

  removePage(kd: IKnowledgeDocument, page: IKnowledgeDocumentPage) {
    return this.httpClient.delete(this.apiBaseUrl + `/${kd.id}/page/${page.id}`)
  }

  getChunks(id: string, params: {take: number; skip: number; search?: string}) {
    return this.httpClient.get<{items: IDocumentChunk[]; total: number;}>(this.apiBaseUrl + `/${id}` + '/chunk', {
      params: new HttpParams().append('data', JSON.stringify(params))
    })
  }

  deleteChunk(documentId: string, id: string) {
    return this.httpClient.delete<void>(this.apiBaseUrl + `/` + documentId + '/chunk/' + id)
  }

  createChunk(documentId: string, chunk: Partial<IDocumentChunk>) {
    return this.httpClient.post<IDocumentChunk>(this.apiBaseUrl + `/` + documentId + '/chunk', chunk)
  }

  updateChunk(documentId: string, id: string, chunk: Partial<IDocumentChunk>) {
    return this.httpClient.put<void>(this.apiBaseUrl + `/` + documentId + '/chunk/' + id, chunk)
  }
}
