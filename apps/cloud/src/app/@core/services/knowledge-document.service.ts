import { HttpClient } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import { OrganizationBaseCrudService, PaginationParams, toHttpParams } from '@metad/cloud/state'
import { IDocumentChunk, IKnowledgeDocument } from '@metad/contracts'
import { NGXLogger } from 'ngx-logger'
import { API_KNOWLEDGE_DOCUMENT } from '../constants/app.constants'

@Injectable({ providedIn: 'root' })
export class KnowledgeDocumentService extends OrganizationBaseCrudService<IKnowledgeDocument> {
  readonly #logger = inject(NGXLogger)
  readonly httpClient = inject(HttpClient)

  constructor() {
    super(API_KNOWLEDGE_DOCUMENT)
  }

  createBulk(entites: Partial<IKnowledgeDocument>[]) {
    return this.httpClient.post<IKnowledgeDocument[]>(this.apiBaseUrl + '/bulk', entites)
  }

  startParsing(id: string) {
    return this.httpClient.post<IKnowledgeDocument[]>(this.apiBaseUrl + '/process', {
      ids: [id]
    })
  }

  stopParsing(id: string) {
    return this.httpClient.delete<IKnowledgeDocument[]>(this.apiBaseUrl + '/' + id + '/job')
  }

  getChunks(id: string, params: PaginationParams<any>) {
    return this.httpClient.get<{items: IDocumentChunk[]; total: number;}>(this.apiBaseUrl + `/${id}` + '/chunk', {
      params: toHttpParams(params)
    })
  }

  deleteChunk(documentId: string, id: string) {
    return this.httpClient.delete<void>(this.apiBaseUrl + `/` + documentId + '/chunk/' + id)
  }
}
