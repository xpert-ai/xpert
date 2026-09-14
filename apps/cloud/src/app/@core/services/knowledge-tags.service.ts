import { API_PREFIX } from '../state'
import { HttpClient } from '@angular/common/http'
import { Injectable, inject } from '@angular/core'
import { IKnowledgeDocumentTag, KnowledgeTagCatalog } from '@xpert-ai/contracts'

@Injectable({ providedIn: 'root' })
export class KnowledgeTagsService {
  private readonly http = inject(HttpClient)
  private url(knowledgebaseId: string) {
    return `${API_PREFIX}/knowledgebase/${knowledgebaseId}`
  }

  list(knowledgebaseId: string) {
    return this.http.get<KnowledgeTagCatalog>(`${this.url(knowledgebaseId)}/tags`)
  }
  select(knowledgebaseId: string, tagId: string) {
    return this.http.put(`${this.url(knowledgebaseId)}/tags/${tagId}`, {})
  }
  remove(knowledgebaseId: string, tagId: string) {
    return this.http.delete(`${this.url(knowledgebaseId)}/tags/${tagId}`)
  }
  documentTags(knowledgebaseId: string, documentId: string) {
    return this.http.get<IKnowledgeDocumentTag[]>(`${this.url(knowledgebaseId)}/documents/${documentId}/tags`)
  }
  addManual(knowledgebaseId: string, documentId: string, tagId: string) {
    return this.http.put<IKnowledgeDocumentTag[]>(
      `${this.url(knowledgebaseId)}/documents/${documentId}/tags/${tagId}`,
      {}
    )
  }
  removeManual(knowledgebaseId: string, documentId: string, tagId: string) {
    return this.http.delete<IKnowledgeDocumentTag[]>(
      `${this.url(knowledgebaseId)}/documents/${documentId}/tags/${tagId}`
    )
  }
}
