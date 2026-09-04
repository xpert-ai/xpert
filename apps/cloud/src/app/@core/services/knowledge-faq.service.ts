import { HttpClient, HttpParams } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import {
  API_PREFIX,
  IKnowledgeFAQEntry,
  KnowledgeFAQExportFormat,
  KnowledgeFAQImportMode,
  KnowledgeFAQImportPreview,
  KnowledgeFAQImportResult,
  KnowledgeFAQListParams,
  KnowledgeFAQUpdateInput,
  KnowledgeFAQWriteInput
} from '@cloud/app/@core/state'

@Injectable({ providedIn: 'root' })
export class KnowledgeFAQService {
  readonly #http = inject(HttpClient)
  readonly #baseUrl = `${API_PREFIX}/knowledgebase`

  findAll(knowledgebaseId: string, options: KnowledgeFAQListParams = {}) {
    let params = new HttpParams()
    if (options.search?.trim()) params = params.set('search', options.search.trim())
    if (options.enabled !== undefined) params = params.set('enabled', String(options.enabled))
    if (options.skip !== undefined) params = params.set('skip', String(options.skip))
    if (options.take !== undefined) params = params.set('take', String(options.take))

    return this.#http.get<{ items: IKnowledgeFAQEntry[]; total: number }>(this.url(knowledgebaseId), { params })
  }

  create(knowledgebaseId: string, input: KnowledgeFAQWriteInput) {
    return this.#http.post<IKnowledgeFAQEntry>(this.url(knowledgebaseId), input)
  }

  findOne(knowledgebaseId: string, faqId: string) {
    return this.#http.get<IKnowledgeFAQEntry>(`${this.url(knowledgebaseId)}/${faqId}`)
  }

  update(knowledgebaseId: string, faqId: string, input: KnowledgeFAQUpdateInput) {
    return this.#http.put<IKnowledgeFAQEntry>(`${this.url(knowledgebaseId)}/${faqId}`, input)
  }

  delete(knowledgebaseId: string, faqId: string, version: number) {
    return this.#http.delete<{ success: true }>(`${this.url(knowledgebaseId)}/${faqId}`, {
      params: { version }
    })
  }

  previewImportFile(knowledgebaseId: string, file: File) {
    const formData = new FormData()
    formData.append('file', file)
    return this.#http.post<KnowledgeFAQImportPreview>(`${this.url(knowledgebaseId)}/import/preview`, formData)
  }

  importFile(knowledgebaseId: string, file: File, mode: KnowledgeFAQImportMode = 'append') {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('mode', mode)
    return this.#http.post<KnowledgeFAQImportResult>(`${this.url(knowledgebaseId)}/import`, formData)
  }

  exportFile(knowledgebaseId: string, format: KnowledgeFAQExportFormat = 'csv', ids?: string[]) {
    let params = new HttpParams().set('format', format)
    if (ids?.length) params = params.set('ids', ids.join(','))
    return this.#http.get(`${this.url(knowledgebaseId)}/export`, {
      params,
      responseType: 'blob'
    })
  }

  downloadImportTemplate(knowledgebaseId: string) {
    return this.#http.get(`${this.url(knowledgebaseId)}/import-template`, { responseType: 'blob' })
  }

  private url(knowledgebaseId: string) {
    return `${this.#baseUrl}/${knowledgebaseId}/faqs`
  }
}
